import { cookies } from 'next/headers';
import { randomBytes, createHmac, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

interface UserRecord extends PublicUser {
  passwordHash: string;
  salt: string;
  provider?: 'credentials' | 'google';
  providerId?: string;
  image?: string;
  emailVerified?: boolean;
}

interface SessionPayload {
  userId: string;
  email: string;
  exp: number;
}

const SESSION_COOKIE = 'cpo_session';
const SESSION_DAYS = 7;
const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

function sessionSecret() {
  return process.env.AUTH_SECRET || 'dev-only-change-this-secret-before-production';
}

async function ensureUserStore() {
  await mkdir(path.dirname(USERS_FILE), { recursive: true });
  try {
    await readFile(USERS_FILE, 'utf8');
  } catch {
    await writeFile(USERS_FILE, '[]', 'utf8');
  }
}

export async function readUsers(): Promise<UserRecord[]> {
  await ensureUserStore();
  const raw = await readFile(USERS_FILE, 'utf8');
  try {
    return JSON.parse(raw) as UserRecord[];
  } catch {
    return [];
  }
}

async function writeUsers(users: UserRecord[]) {
  await ensureUserStore();
  await writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePassword(password: string) {
  return password.length >= 8;
}

function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const passwordHash = pbkdf2Sync(password, salt, 120_000, 32, 'sha256').toString('hex');
  return { salt, passwordHash };
}

function verifyPassword(password: string, user: UserRecord) {
  const { passwordHash } = hashPassword(password, user.salt);
  const expected = Buffer.from(user.passwordHash, 'hex');
  const actual = Buffer.from(passwordHash, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function base64Url(input: string) {
  return Buffer.from(input).toString('base64url');
}

function sign(value: string) {
  return createHmac('sha256', sessionSecret()).update(value).digest('base64url');
}

function createSessionToken(payload: SessionPayload) {
  const encodedPayload = base64Url(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function parseSessionToken(token?: string): SessionPayload | null {
  if (!token) return null;
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;
  const expectedSignature = sign(encodedPayload);
  const expected = Buffer.from(expectedSignature);
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createUser({ name, email, password }: { name: string; email: string; password: string }) {
  const cleanEmail = normalizeEmail(email);
  const cleanName = name.trim();

  if (cleanName.length < 2) throw new Error('Name must be at least 2 characters.');
  if (!validateEmail(cleanEmail)) throw new Error('Enter a valid email address.');
  if (!validatePassword(password)) throw new Error('Password must be at least 8 characters.');

  const users = await readUsers();
  if (users.some((user) => user.email === cleanEmail)) {
    throw new Error('An account with this email already exists.');
  }

  const { salt, passwordHash } = hashPassword(password);
  const user: UserRecord = {
    id: randomBytes(16).toString('hex'),
    name: cleanName,
    email: cleanEmail,
    passwordHash,
    salt,
    provider: 'credentials',
    emailVerified: false,
    createdAt: new Date().toISOString()
  };

  users.push(user);
  await writeUsers(users);
  return toPublicUser(user);
}

export async function createOrGetOAuthUser({
  provider,
  providerId,
  email,
  name,
  image,
  emailVerified
}: {
  provider: 'google';
  providerId: string;
  email: string;
  name: string;
  image?: string;
  emailVerified?: boolean;
}) {
  const cleanEmail = normalizeEmail(email);
  const users = await readUsers();
  const existing = users.find((user) => user.email === cleanEmail || (user.provider === provider && user.providerId === providerId));

  if (existing) {
    existing.name = existing.name || name.trim();
    existing.provider = existing.provider ?? provider;
    existing.providerId = existing.providerId ?? providerId;
    existing.image = image ?? existing.image;
    existing.emailVerified = emailVerified ?? existing.emailVerified;
    await writeUsers(users);
    return toPublicUser(existing);
  }

  const unusablePassword = randomBytes(32).toString('hex');
  const { salt, passwordHash } = hashPassword(unusablePassword);
  const user: UserRecord = {
    id: randomBytes(16).toString('hex'),
    name: name.trim() || cleanEmail.split('@')[0],
    email: cleanEmail,
    passwordHash,
    salt,
    provider,
    providerId,
    image,
    emailVerified,
    createdAt: new Date().toISOString()
  };

  users.push(user);
  await writeUsers(users);
  return toPublicUser(user);
}

export async function authenticateUser(email: string, password: string) {
  const cleanEmail = normalizeEmail(email);
  const users = await readUsers();
  const user = users.find((record) => record.email === cleanEmail);
  if (!user || !verifyPassword(password, user)) {
    throw new Error('Invalid email or password.');
  }
  return toPublicUser(user);
}

export async function setSession(user: PublicUser) {
  const cookieStore = await cookies();
  const token = createSessionToken({
    userId: user.id,
    email: user.email,
    exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  });

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<PublicUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const payload = parseSessionToken(token);
  if (!payload) return null;

  const users = await readUsers();
  const user = users.find((record) => record.id === payload.userId && record.email === payload.email);
  return user ? toPublicUser(user) : null;
}
