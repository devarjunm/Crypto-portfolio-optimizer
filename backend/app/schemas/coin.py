from pydantic import BaseModel
class CoinSearchResponse(BaseModel): coins:list[dict]
