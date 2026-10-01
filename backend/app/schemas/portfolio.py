from typing import Literal
from pydantic import BaseModel, Field, ConfigDict

class HoldingInput(BaseModel):
    id: str
    value: float = Field(ge=0, le=100_000_000)

class OptimizeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    asset_ids: list[str] = Field(alias='assetIds')
    holdings: list[HoldingInput] = []
    objective: Literal['max_sharpe','min_variance','target_return'] = 'max_sharpe'
    days: int = Field(default=365, ge=120, le=1825)
    samples: int = Field(default=8000, ge=500, le=30000)
    risk_free_rate: float = Field(default=.04, ge=-.05, le=.2, alias='riskFreeRate')
    min_weight: float = Field(default=0, ge=0, le=.2, alias='minWeight')
    max_weight: float = Field(default=.5, ge=.05, le=1, alias='maxWeight')
    target_return: float = Field(default=.2, ge=-.5, le=5, alias='targetReturn')
