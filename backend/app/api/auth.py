import os,time,json,hmac,hashlib,secrets,base64
from urllib.parse import urlencode
import httpx
from fastapi import APIRouter,Request,Response,HTTPException
from fastapi.responses import RedirectResponse
from ..schemas.auth import Signup,Login
from ..services.storage import read,write
router=APIRouter(); COOKIE='cpo_session'; DAYS=7
def _secret():return os.getenv('AUTH_SECRET','dev-only-change-this-secret-before-production').encode()
def _token(user):
    # Keep the existing Next.js cookie payload/signature format so active sessions
    # remain readable across the backend migration.
    payload=base64.urlsafe_b64encode(json.dumps({'userId':user['id'],'email':user['email'],'exp':int((time.time()+DAYS*86400)*1000)}).encode()).decode().rstrip('='); sig=base64.urlsafe_b64encode(hmac.new(_secret(),payload.encode(),hashlib.sha256).digest()).decode().rstrip('=');return payload+'.'+sig
def _public(u):return {k:u[k] for k in ('id','name','email','createdAt')}
async def _user(request):
    token=request.cookies.get(COOKIE,'').split('.')
    if len(token)!=2:return None
    expected=base64.urlsafe_b64encode(hmac.new(_secret(),token[0].encode(),hashlib.sha256).digest()).decode().rstrip('=')
    if not hmac.compare_digest(expected,token[1]):return None
    try:p=json.loads(base64.urlsafe_b64decode(token[0]+'==='))
    except Exception:return None
    if p.get('exp',0)<time.time()*1000:return None
    return next((u for u in await read('users.json',[]) if u.get('id')==p.get('userId') and u.get('email')==p.get('email')),None)
def _set(response,user):response.set_cookie(COOKIE,_token(user),httponly=True,samesite='lax',secure=os.getenv('COOKIE_SECURE','').lower()=='true',max_age=DAYS*86400,path='/')
@router.post('/api/auth/signup')
async def signup(body:Signup,response:Response):
    name=body.name.strip();email=body.email.strip().lower()
    if len(name)<2:raise HTTPException(400,'Name must be at least 2 characters.')
    if not __import__('re').fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email):raise HTTPException(400,'Enter a valid email address.')
    if len(body.password)<8:raise HTTPException(400,'Password must be at least 8 characters.')
    users=await read('users.json',[])
    if any(u.get('email')==email for u in users):raise HTTPException(400,'An account with this email already exists.')
    salt=secrets.token_hex(16); digest=hashlib.pbkdf2_hmac('sha256',body.password.encode(),salt.encode(),120000,dklen=32).hex()
    user={'id':secrets.token_hex(16),'name':name,'email':email,'createdAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'salt':salt,'passwordHash':digest,'provider':'credentials','emailVerified':False}
    users.append(user);await write('users.json',users);_set(response,user);return {'user':_public(user)}
@router.post('/api/auth/login')
async def login(body:Login,response:Response):
    email=body.email.strip().lower();users=await read('users.json',[]);u=next((x for x in users if x.get('email')==email),None)
    if not u or not u.get('salt') or not hmac.compare_digest(hashlib.pbkdf2_hmac('sha256',body.password.encode(),u['salt'].encode(),120000,dklen=32).hex(),u.get('passwordHash','')):raise HTTPException(401,'Invalid email or password.')
    _set(response,u);return {'user':_public(u)}
@router.post('/api/auth/logout')
async def logout(response:Response):response.delete_cookie(COOKIE,path='/');return {'ok':True}
@router.get('/api/auth/me')
async def me(request:Request):
    u=await _user(request);return {'user':_public(u) if u else None}
async def oauth_create(profile):
    users=await read('users.json',[]);email=profile['email'].strip().lower();u=next((x for x in users if x.get('email')==email or (x.get('provider')=='google' and x.get('providerId')==profile['sub'])),None)
    if not u:
        salt=secrets.token_hex(16);pw=secrets.token_hex(32);u={'id':secrets.token_hex(16),'name':profile.get('name') or email.split('@')[0],'email':email,'createdAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'salt':salt,'passwordHash':hashlib.pbkdf2_hmac('sha256',pw.encode(),salt.encode(),120000,dklen=32).hex(),'provider':'google','providerId':profile['sub'],'image':profile.get('picture'),'emailVerified':bool(profile.get('email_verified'))};users.append(u)
    else:u.update(provider='google',providerId=profile['sub'],image=profile.get('picture'),emailVerified=bool(profile.get('email_verified')))
    await write('users.json',users);return u
@router.get('/api/auth/google')
async def google(request:Request,response:Response):
    front=os.getenv('FRONTEND_URL','http://localhost:3000');cid=os.getenv('GOOGLE_CLIENT_ID');secret=secrets.token_urlsafe(24)
    if not cid:return RedirectResponse(front+'/?authError=Google%20Login%20is%20not%20configured.')
    redirect=os.getenv('GOOGLE_REDIRECT_URI','http://localhost:8000/api/auth/google/callback');url='https://accounts.google.com/o/oauth2/v2/auth?'+urlencode({'client_id':cid,'redirect_uri':redirect,'response_type':'code','scope':'openid email profile','prompt':'select_account','state':secret})
    r=RedirectResponse(url);r.set_cookie('google_oauth_state',secret,httponly=True,samesite='lax',max_age=600);return r
@router.get('/api/auth/google/callback')
async def google_callback(request:Request,code:str='',state:str=''):
    front=os.getenv('FRONTEND_URL','http://localhost:3000');err=lambda msg:RedirectResponse(front+'/?authError='+__import__('urllib.parse').parse.quote(msg))
    if not secrets.compare_digest(state,request.cookies.get('google_oauth_state','')):return err('Invalid Google OAuth state.')
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            token=await client.post('https://oauth2.googleapis.com/token',data={'code':code,'client_id':os.getenv('GOOGLE_CLIENT_ID'),'client_secret':os.getenv('GOOGLE_CLIENT_SECRET'),'redirect_uri':os.getenv('GOOGLE_REDIRECT_URI','http://localhost:8000/api/auth/google/callback'),'grant_type':'authorization_code'});token.raise_for_status();info=await client.get('https://openidconnect.googleapis.com/v1/userinfo',headers={'Authorization':'Bearer '+token.json()['access_token']});info.raise_for_status();profile=info.json()
        if not profile.get('email'):return err('Google account did not provide an email address.')
        u=await oauth_create(profile);r=RedirectResponse(front+'/?auth=google_success');_set(r,u);r.delete_cookie('google_oauth_state');return r
    except Exception:return err('Google Login failed. Check OAuth credentials and redirect URI.')
