from pydantic import BaseModel
class MarketResponse(BaseModel):
    assets:list[dict]
    source:str
    generatedAt:str
