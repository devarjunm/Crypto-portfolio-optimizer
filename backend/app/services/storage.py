import json, os, tempfile, asyncio
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
DATA=ROOT/'data'
_locks={}
async def read(name,default):
    path=DATA/name
    try:return json.loads(await asyncio.to_thread(path.read_text,encoding='utf8'))
    except (FileNotFoundError,json.JSONDecodeError):return default
async def write(name,value):
    DATA.mkdir(parents=True,exist_ok=True); path=DATA/name; lock=_locks.setdefault(name,asyncio.Lock())
    async with lock:
        def save():
            fd,tmp=tempfile.mkstemp(dir=DATA,prefix='.tmp-')
            try:
                with os.fdopen(fd,'w',encoding='utf8') as f:json.dump(value,f,indent=2)
                os.replace(tmp,path)
            finally:
                if os.path.exists(tmp):os.unlink(tmp)
        await asyncio.to_thread(save)
