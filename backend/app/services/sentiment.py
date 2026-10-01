import re
POS=['surge','rally','gain','gains','bull','bullish','breakout','record','high','approval','adoption','partnership','upgrade','accumulate','buy','positive','inflow','strong','growth','recover','recovery']
NEG=['crash','drop','drops','plunge','bear','bearish','hack','lawsuit','ban','outflow','weak','loss','losses','selloff','liquidation','risk','fraud','scam','decline','falls','fear','warning']
def analyze(text):
    lower=text.lower(); p=sum(len(re.findall(r'\b'+re.escape(w)+r'\b',lower)) for w in POS); n=sum(len(re.findall(r'\b'+re.escape(w)+r'\b',lower)) for w in NEG); score=max(-100,min(100,(p-n)*18)); label='Bullish' if score>12 else 'Bearish' if score< -12 else 'Neutral'; confidence=max(50,min(92,55+abs(score)*.38+(p+n)*2)); return {'score':score,'label':label,'confidence':round(confidence)}
