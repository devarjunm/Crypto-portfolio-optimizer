"""Environment and production safety checks for the API service."""

import os
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
ENVIRONMENT = os.getenv('ENVIRONMENT', 'development').strip().lower()
IS_PRODUCTION = ENVIRONMENT == 'production'
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3000').strip().rstrip('/')
CORS_ORIGINS = [origin.strip().rstrip('/') for origin in os.getenv('CORS_ORIGINS', FRONTEND_URL).split(',') if origin.strip()]
COOKIE_SECURE = os.getenv('COOKIE_SECURE', 'true' if IS_PRODUCTION else 'false').strip().lower() == 'true'
AUTH_SECRET = os.getenv('AUTH_SECRET', '').strip()


def validate_runtime_config() -> None:
    if not IS_PRODUCTION:
        return
    if len(AUTH_SECRET) < 32 or AUTH_SECRET == 'replace-with-a-long-random-secret':
        raise RuntimeError('Production requires AUTH_SECRET to be a unique random value of at least 32 characters.')
    if not FRONTEND_URL.startswith('https://'):
        raise RuntimeError('Production requires FRONTEND_URL to be the HTTPS Netlify site URL.')
    if not COOKIE_SECURE:
        raise RuntimeError('Production requires COOKIE_SECURE=true.')
    if not CORS_ORIGINS or '*' in CORS_ORIGINS:
        raise RuntimeError('Production requires explicit CORS_ORIGINS; wildcard origins are not allowed.')
    if any(not origin.startswith('https://') for origin in CORS_ORIGINS):
        raise RuntimeError('Production CORS_ORIGINS must contain HTTPS origins only.')
