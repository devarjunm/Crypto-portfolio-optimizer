from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from ..schemas.portfolio import OptimizeRequest
from ..services.coingecko import markets, history
from ..optimization.optimizer import optimize
router=APIRouter()
@router.post('/api/optimize',description='Optimize a constrained crypto portfolio using historical CoinGecko prices.')
async def optimize_route(body:OptimizeRequest):
    ids=list(dict.fromkeys(i for i in body.asset_ids if i in {'bitcoin','ethereum','solana','binancecoin','ripple','cardano','dogecoin','chainlink'}))
    if len(ids)<2:raise HTTPException(400,'Please select at least two supported crypto assets.')
    if len(ids)>8:raise HTTPException(400,'Please select no more than eight assets for this optimizer version.')
    if body.min_weight>body.max_weight:raise HTTPException(400,'Minimum asset weight cannot exceed maximum asset weight.')
    if body.min_weight*len(ids)>1 or body.max_weight*len(ids)<1:raise HTTPException(400,'Weight constraints are infeasible for the number of assets selected.')
    try:
        import asyncio
        results=await asyncio.gather(markets(ids),*[history(i,body.days) for i in ids])
        market=results[0]; histories=results[1:]; result=optimize(market['assets'],[h['series'] for h in histories],body)
        if market['source'] != 'coingecko' or any(h['source'] != 'coingecko' for h in histories):
            raise HTTPException(502,'Live CoinGecko data is required to optimize a portfolio.')
        return {'generatedAt':datetime.now(timezone.utc).isoformat(),'dataSource':'coingecko','assets':market['assets'],**result}
    except HTTPException:
        raise
    except ValueError as e:raise HTTPException(400,str(e))
    except Exception as e:raise HTTPException(502,'Unable to calculate portfolio optimization with the available market data.') from e
