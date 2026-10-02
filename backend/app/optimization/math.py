import numpy as np
try:
    import pandas as pd
except Exception:
    # Some locked-down Windows environments block Pandas' compiled extensions.
    pd = None

def aligned_log_returns(series):
    if pd is None:
        by_asset=[]
        for item in series:
            points=sorted({p['date']:float(p['price']) for p in item['points'] if float(p['price'])>0}.items())
            by_asset.append({date:float(np.log(price)-np.log(points[i-1][1])) for i,(date,price) in enumerate(points) if i>0})
        common=sorted(set.intersection(*(set(x) for x in by_asset))) if by_asset else []
        return np.asarray([[asset[d] for asset in by_asset] for d in common],dtype=float)
    frames=[]
    for item in series:
        frame=pd.DataFrame(item['points'])
        frame=frame.drop_duplicates('date',keep='last').set_index('date').sort_index()
        prices=frame['price'].astype(float)
        frame[item['id']]=np.log(prices)-np.log(prices.shift(1))
        frames.append(frame[[item['id']]])
    return pd.concat(frames,axis=1,join='inner').dropna()

def covariance_matrix(rows):
    return np.cov(rows,rowvar=False,ddof=1)

def portfolio_variance(weights,covariance):
    return max(float(np.asarray(weights) @ covariance @ np.asarray(weights)),0.0)
