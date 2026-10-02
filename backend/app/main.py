import os
from dotenv import load_dotenv
load_dotenv()
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from .services.coingecko import startup,shutdown
from .config import CORS_ORIGINS, validate_runtime_config
from .api import optimize,markets,market_overview,coins,portfolio,auth,news,watchlist

@asynccontextmanager
async def lifespan(app):
    validate_runtime_config()
    await startup()
    yield
    await shutdown()

app=FastAPI(title='Crypto Portfolio Optimizer API',version='1.0.0',description='FastAPI backend for market data, portfolio optimization, holdings, watchlists, news and authentication.',lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=CORS_ORIGINS,allow_credentials=True,allow_methods=['GET','POST','PUT','DELETE','OPTIONS'],allow_headers=['Content-Type','Authorization','Accept'])
for module in (optimize,markets,market_overview,coins,portfolio,auth,news,watchlist):app.include_router(module.router)

@app.get('/')
async def root():return {'name':'Crypto Portfolio Optimizer API','docs':'/docs','health':'/health'}
@app.get('/health')
async def health():return {'status':'ok'}

@app.exception_handler(Exception)
async def unexpected_error(request,exc):
    return JSONResponse(status_code=500,content={'error':'An unexpected server error occurred.'})

@app.exception_handler(HTTPException)
async def http_error(request,exc):
    detail=exc.detail if isinstance(exc.detail,str) else 'Request failed.'
    return JSONResponse(status_code=exc.status_code,content={'error':detail},headers=exc.headers)

@app.exception_handler(RequestValidationError)
async def validation_error(request,exc):
    issue=exc.errors()[0] if exc.errors() else {}
    field='.'.join(str(part) for part in issue.get('loc',())[1:])
    message=issue.get('msg','Invalid request')
    return JSONResponse(status_code=422,content={'error':f'{field}: {message}' if field else message})
