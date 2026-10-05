# 종목 DB에 ETF 추가: 국내 ETF(네이버 시세·야후 분배금) + 미국 ETF(야후) → ../app/data/stock_db_full.js
# 입력: pipeline/stock_db.js(build_db.py 결과), raw_etf/etf-data(국내 ETF·주요 미국 ETF), raw_etf/etf-data-us(미국 ETF 전체)
#   raw_etf 폴더는 저장소의 etf-data / etf-data-us 브랜치를 내려받은 것 (CLAUDE.md 참고)
# 실행: python pipeline/add_etf.py   (환경변수 MIN_ADV=2000000 → 미국 ETF 전체 목록 중 20일 평균 거래대금 하한, 달러)
# 기존 축(국내 10/1, 미국 10/2)에 맞춰 같은 형식으로 인코딩하고, 레코드 끝(인덱스 21)에 분배금 정보를 붙인다.
import json, math, os, sys
import numpy as np, pandas as pd
from build_db import enc_series, dec_series, vol_q, stats_from, resample, r

D = os.path.dirname(os.path.abspath(__file__))
ETF = os.path.join(D, 'raw_etf', 'etf-data')
ETF = os.path.normpath(sys.argv[1]) if len(sys.argv) > 1 else os.path.normpath(ETF)
US_LIST = os.path.join(D, 'us_etf_list.json')   # 주요 미국 ETF 168개: 티커 → [영문명, 한글명, 유형]

raw = open(os.path.join(D, 'stock_db.js'), encoding='utf-8').read().strip()
db = json.loads(raw[len('window.STOCK_DB='):].rstrip(';'))
# enc_dates는 '일수의 델타'를 enc_series로 저장 → dec_series는 누적값(절대 일수)을 돌려줌
def ax_from(m):
    d = pd.DatetimeIndex(pd.to_datetime(dec_series(m['d']), unit='D'))
    w = pd.PeriodIndex([pd.Period(x, 'W-FRI') for x in pd.to_datetime(dec_series(m['w']), unit='D')])
    mo = pd.PeriodIndex([pd.Period(x, 'M') for x in pd.to_datetime(dec_series(m['m']), unit='D')])
    y = pd.PeriodIndex([pd.Period(x, 'Y') for x in pd.to_datetime(dec_series(m['y']), unit='D')])
    return d, w, mo, y
KAX = ax_from(db['ax']['KR']); UAX = ax_from(db['ax']['US'])
KR_ASOF = pd.Timestamp(db['asof']['KR']); US_ASOF = pd.Timestamp(db['asof']['US'])
print('KR axis', KAX[0][0].date(), '~', KAX[0][-1].date(), len(KAX[0]), '| w', len(KAX[1]), 'm', len(KAX[2]), 'y', len(KAX[3]))
print('US axis', UAX[0][0].date(), '~', UAX[0][-1].date(), len(UAX[0]), '| w', len(UAX[1]), 'm', len(UAX[2]), 'y', len(UAX[3]))

def encode(c, dts, vol, axes):
    d_axis, w_axis, m_axis, y_axis = axes
    s_d = pd.Series(c, index=dts)
    dvals = s_d.reindex(d_axis).dropna()
    d_off = int(np.searchsorted(d_axis, dvals.index[0])) if len(dvals) else len(d_axis)
    vq = vol_q(vol, dts, dvals.index)
    w, m, y = resample(dts, c)
    w = w.reindex(w_axis).dropna(); m = m.reindex(m_axis).dropna(); y = y.reindex(y_axis).dropna()
    w_off = int(w_axis.get_loc(w.index[0])) if len(w) else len(w_axis)
    m_off = int(m_axis.get_loc(m.index[0])) if len(m) else len(m_axis)
    y_off = int(y_axis.get_loc(y.index[0])) if len(y) else len(y_axis)
    return [d_off, enc_series(dvals.values), w_off, enc_series(w.values), m_off, enc_series(m.values), y_off, enc_series(y.values), enc_series(vq)], len(dvals)

def growth_default(name, cat):
    n = name
    if cat in ('국내 파생', '레버리지·인버스', '원자재', '가상자산') or any(k in n for k in ('레버리지', '인버스', '2X', '선물')): return 0.0
    if cat in ('채권',) or any(k in n for k in ('머니마켓', 'CD금리', 'KOFR', '채권', '국채', '단기', '금리')): return 1.0
    if cat == '커버드콜·인컴' or any(k in n for k in ('커버드콜', '프리미엄', '위클리', '+', '인컴')): return 2.0
    if cat == '리츠' or '리츠' in n or '부동산' in n: return 3.0
    if cat == '배당' or '배당' in n: return 5.0
    return 4.0

def div_info(dv, asof, price, pay_lag, name, cat, kr):
    """dv: DataFrame(date, div). 최근 12개월(배당락일 기준) 합계와 지급월 비중."""
    g = growth_default(name, cat)
    if dv is None or not len(dv):
        return [0, [0] * 12, 0, '', g]
    dv = dv[(dv['date'] > asof - pd.Timedelta(days=365)) & (dv['date'] <= asof)]
    if not len(dv): return [0, [0] * 12, 0, '', g]
    ttm = float(dv['div'].sum())
    mon = np.zeros(12)
    for d, v in zip(dv['date'], dv['div']):
        pm = (d + pd.Timedelta(days=pay_lag)).month
        mon[pm - 1] += v
    n = len(dv); cover = int((mon > 0).sum())
    if n >= 11 and cover >= 11: mon = np.ones(12)      # 매월(또는 매주) 지급 → 12개월 균등
    mon = mon / mon.sum()
    ttm = int(round(ttm)) if kr else round(ttm, 4)
    return [ttm, [round(float(x), 3) for x in mon], int(n), str(dv['date'].max().date()), g]

CAT_KR = {1: '국내 시장지수', 2: '국내 업종/테마', 3: '국내 파생', 4: '해외 주식', 5: '원자재', 6: '채권', 7: '기타'}
NICE = [0.5, 0.2, 0.1, 1 / 3, 0.25, 2, 5, 10, 3, 4]

# ── 국내 ETF ──
L = pd.read_csv(os.path.join(ETF, 'etf_kr_list.csv'), dtype={'itemcode': str})
L['itemcode'] = L['itemcode'].str.zfill(6)
PX = pd.read_parquet(os.path.join(ETF, 'etf_kr_px.parquet'))
PX['date'] = pd.to_datetime(PX['date'])
PX = PX[PX['date'] <= KR_ASOF]
DV = pd.read_csv(os.path.join(ETF, 'etf_kr_div.csv'))
DV['code'] = DV['ticker'].str.replace('.KS', '', regex=False); DV['date'] = pd.to_datetime(DV['date'])
dv_by = {k: g[['date', 'div']].sort_values('date') for k, g in DV.groupby('code')}
have_kr = {rec[1] for rec in db['s'] if rec[0] != 'US'}
kr_out = []; n_split = 0; skipped = []
for _, row in L.iterrows():
    code = row['itemcode']
    if code in have_kr: skipped.append(code); continue
    g = PX[PX['code'] == code].sort_values('date').drop_duplicates('date', keep='last')
    g = g[g['close'] > 0]
    if len(g) < 2 or g['date'].iloc[-1] < KR_ASOF - pd.Timedelta(days=7): skipped.append(code); continue
    c = g['close'].to_numpy(dtype=float); dts = pd.DatetimeIndex(g['date']); vol = g['volume'].to_numpy(dtype=float)
    # 분할·병합 보정(드묾): 하루 변화가 깔끔한 배수이고 |로그수익률|>0.5일 때만
    adj = np.ones(len(c))
    for i in range(1, len(c)):
        f = c[i] / c[i - 1]
        if abs(math.log(f)) > 0.5 and any(abs(f / k - 1) < 0.03 for k in NICE):
            adj[:i] *= f; n_split += 1
    ca = c * adj
    enc, nd = encode(ca, dts, vol * (1 / adj), KAX)
    stt = stats_from(ca, dts, KR_ASOF, 1)
    chg = (ca[-1] / ca[-2] - 1) * 100
    amt20 = float((g['close'].to_numpy()[-20:] * g['volume'].to_numpy()[-20:]).mean())
    cat = CAT_KR.get(int(row['etfTabCode']), '기타')
    di = div_info(dv_by.get(code), KR_ASOF, ca[-1], 5, row['itemname'], cat, True)
    kr_out.append(['KE', code, row['itemname'], '', 'ETF', cat, int(round(ca[-1])), r(chg, 2), int(row['marketSum']), 0, int(amt20 // 1e8), stt] + enc + [di])
print('KR ETFs', len(kr_out), 'splits adjusted', n_split, 'skipped', len(skipped), skipped[:10])

# ── 미국 ETF ──
UL = json.load(open(US_LIST, encoding='utf-8'))
UP = pd.read_parquet(os.path.join(ETF, 'etf_us_px.parquet')); UP['date'] = pd.to_datetime(UP['date'])
UP = UP[UP['date'] <= US_ASOF]
UD = pd.read_csv(os.path.join(ETF, 'etf_us_div.csv')); UD['date'] = pd.to_datetime(UD['date'])
ud_by = {k: g[['date', 'div']].sort_values('date') for k, g in UD.groupby('ticker')}
by_us = {rec[1]: rec for rec in db['s'] if rec[0] == 'US'}
us_out = []; attached = []
for tk, (name, ko, cat) in UL.items():
    g = UP[UP['ticker'] == tk].sort_values('date').drop_duplicates('date', keep='last')
    g = g[g['close'] > 0]
    if len(g) < 2: continue
    lag = 40 if tk == 'SPY' else 3
    di = div_info(ud_by.get(tk), US_ASOF, float(g['close'].iloc[-1]), lag, name, cat, False)
    if tk in by_us:      # 이미 있는 ETF(SPY·QQQ·섹터 ETF): 분배금·유형만 덧붙임
        rec = by_us[tk]
        if not rec[3]: rec[3] = ko
        rec[4] = 'ETF'; rec[5] = cat
        if len(rec) == 21: rec.append(di)
        attached.append(tk); continue
    if g['date'].iloc[-1] < US_ASOF - pd.Timedelta(days=7): continue
    c = g['close'].to_numpy(dtype=float) * 100; dts = pd.DatetimeIndex(g['date'])
    enc, nd = encode(c, dts, g['volume'].to_numpy(dtype=float), UAX)
    stt = stats_from(c, dts, US_ASOF, 100)
    chg = (c[-1] / c[-2] - 1) * 100
    tv20 = float((g['close'].to_numpy()[-20:] * g['volume'].to_numpy()[-20:]).mean())
    us_out.append(['US', tk, name, ko, 'ETF', cat, round(c[-1] / 100, 2), r(chg, 2), 0, 0, int(tv20 // 1e6), stt] + enc + [di])
print('US ETFs new', len(us_out), '| attached to existing', attached)


# ── 미국 ETF 전체 목록(나스닥 심볼 디렉터리) 중 거래가 활발한 것 + 꼭 넣을 종목 ──
US_ALL = os.path.join(D, 'raw_etf', 'etf-data-us')
MUST_US = {'DRAM'}
MIN_ADV_BUILD = float(os.environ.get('MIN_ADV', '2000000'))   # 현재 배포본은 200만 달러 기준
def us_cat(name):
    n = ' ' + str(name).lower() + ' '
    K = lambda *ws: any(w in n for w in ws)
    if K('bull 2x', 'bull 3x', 'bear 2x', 'bear 3x', ' 2x ', ' 3x ', 'ultrapro', 'ultra ', 'ultrashort', 'leveraged', 'inverse', ' short ', 'daily '): return '레버리지·인버스'
    if K('bitcoin', 'ether', 'crypto', 'solana', 'xrp'): return '가상자산'
    if K('covered call', 'premium income', 'option income', 'buywrite', 'buy-write', 'yieldmax', '0dte', 'high income', 'enhanced income', 'income strategy'): return '커버드콜·인컴'
    if K('treasury', 'bond', 'muni', 'corporate', 'aggregate', 'fixed income', 't-bill', 'tips', 'clo', 'loan', 'mortgage-backed', 'duration'): return '채권'
    if K('reit', 'real estate'): return '리츠'
    if K('dividend', 'yield'): return '배당'
    if K('gold', 'silver', 'oil', 'commodit', 'copper', 'uranium', 'natural gas', 'platinum'): return '원자재'
    if K('international', 'emerging', 'developed', 'ex-us', 'ex us', 'japan', 'china', 'india', 'europe', 'korea', 'taiwan', 'brazil', 'world', 'global', 'eafe', 'msci all country'): return '해외(미국 외)'
    if K('semiconductor', 'memory', 'technology', ' tech', 'software', 'artificial intelligence', ' ai ', 'robot', 'cyber', 'cloud', 'internet', 'innovation', 'growth', 'nasdaq'): return '성장·기술'
    if K('s&p 500', 'total stock', 'total market', 'russell', 'dow jones', 'mid-cap', 'small-cap', 'large-cap', 'mid cap', 'small cap', 'large cap', 'equal weight'): return '미국 대표지수'
    if K('value'): return '가치'
    if K('energy', 'financial', 'health', 'industrial', 'consumer', 'utilities', 'materials', 'communication', 'bank', 'biotech', 'defense', 'aerospace', 'homebuilder', 'retail', 'transport'): return '섹터'
    return '기타'
def clean_name(n):
    import re
    n = str(n or '').strip()
    n = re.sub(r'\s*-\s*(ETF\s+)?(Common\s+)?Shares?(\s+of\s+Beneficial\s+Interest)?$', '', n, flags=re.I)
    n = re.sub(r',?\s+Series\s+\d+$', '', n, flags=re.I)
    n = re.sub(r'\s+(Common|Ordinary)\s+Shares?$', '', n, flags=re.I)
    return n.strip()
if os.path.exists(os.path.join(US_ALL, 'etf_us_all_list.csv')):
    AL = pd.read_csv(os.path.join(US_ALL, 'etf_us_all_list.csv'))
    AP = pd.read_parquet(os.path.join(US_ALL, 'etf_us_all_px.parquet')); AP['date'] = pd.to_datetime(AP['date'])
    AP = AP[AP['date'] <= US_ASOF]
    AD = pd.read_csv(os.path.join(US_ALL, 'etf_us_all_div.csv')); AD['date'] = pd.to_datetime(AD['date'])
    ad_by = {k: g[['date', 'div']].sort_values('date') for k, g in AD.groupby('ticker')}
    ap_by = {k: g for k, g in AP.groupby('ticker')}
    have_us = {rec[1] for rec in db['s'] if rec[0] == 'US'} | {x[1] for x in us_out}
    pick = AL[((AL['adv20'] >= MIN_ADV_BUILD) | AL['ticker'].isin(MUST_US)) & ~AL['ticker'].isin(have_us)]
    n_all = 0
    for _, row in pick.sort_values('adv20', ascending=False).iterrows():
        tk = row['ticker']; g = ap_by.get(tk)
        if g is None: continue
        g = g.sort_values('date').drop_duplicates('date', keep='last'); g = g[g['close'] > 0]
        if len(g) < 2 or g['date'].iloc[-1] < US_ASOF - pd.Timedelta(days=7): continue
        name = clean_name(row['name']) or tk; cat = us_cat(name)
        c = g['close'].to_numpy(dtype=float) * 100; dts = pd.DatetimeIndex(g['date'])
        enc, nd = encode(c, dts, g['volume'].to_numpy(dtype=float), UAX)
        if nd == 0: continue
        stt = stats_from(c, dts, US_ASOF, 100)
        chg = (c[-1] / c[-2] - 1) * 100
        tv20 = float((g['close'].to_numpy()[-20:] * g['volume'].to_numpy()[-20:]).mean())
        di = div_info(ad_by.get(tk), US_ASOF, float(g['close'].iloc[-1]), 3, name, cat, False)
        us_out.append(['US', tk, name, '', 'ETF', cat, round(c[-1] / 100, 2), r(chg, 2), 0, 0, int(tv20 // 1e6), stt] + enc + [di])
        n_all += 1
    print('US ETFs from full list', n_all, '(min ADV $%.1fM)' % (MIN_ADV_BUILD / 1e6), '| DRAM in:', any(x[1] == 'DRAM' for x in us_out))

# ── 개별 주식 배당 (raw_div/stock_div.csv = fetch_stock_div.py 결과) → 주식 레코드 끝에 ETF와 같은 형식의 div 정보 ──
DIVF = os.path.join(D, 'raw_div', 'stock_div.csv')
n_div = {'KR': 0, 'US': 0}
if os.path.exists(DIVF):
    from fetch_stock_div import stock_div_info
    SD = pd.read_csv(DIVF, dtype={'code': str}); SD['date'] = SD['date'].astype(str)
    sd_by = {k: sorted(zip(g['date'], g['div'])) for k, g in SD.groupby('code')}
    for rec in db['s']:
        if rec[4] == 'ETF' or len(rec) > 21 or rec[1] not in sd_by: continue
        kr = rec[0] != 'US'
        rec.append(stock_div_info(sd_by[rec[1]], str((KR_ASOF if kr else US_ASOF).date()), kr)); n_div['KR' if kr else 'US'] += 1
    print('stock dividends attached', n_div, '| KT&G', next((r[21] for r in db['s'] if r[1] == '033780' and len(r) > 21), '-'))
db['s'] = db['s'] + kr_out + us_out
for rec in db['s']:
    assert len(rec) in (21, 22), rec[1]
    assert len(dec_series(rec[20])) == len(dec_series(rec[13])), ('volume/d length mismatch', rec[1])
js = 'window.STOCK_DB=' + json.dumps(db, ensure_ascii=False, separators=(',', ':')) + ';'
OUT = os.path.join(D, '..', 'app', 'data', 'stock_db_full.js')
open(OUT, 'w', encoding='utf-8').write(js)
print('stock_db_full.js MB', round(len(js.encode('utf-8')) / 1e6, 2), 'records', len(db['s']))
# 점검용 표본
for code in ('458730', '069500', '441640', '133690', '472150'):
    rec = next((x for x in kr_out if x[1] == code), None)
    if rec: print(code, rec[2], rec[6], '원 · 분배', rec[21][:1], 'TTM', '수익률', round(rec[21][0] / rec[6] * 100, 2), '% · 지급월', [i + 1 for i, v in enumerate(rec[21][1]) if v > 0], 'n', rec[21][2], 'g', rec[21][4], '| stats 1y', rec[11][5], 'since', rec[11][13])
for tk in ('SCHD', 'JEPI', 'JEPQ', 'VOO', 'QYLD', 'TLT', 'SPY', 'O'):
    rec = next((x for x in us_out if x[1] == tk), None) or by_us.get(tk)
    if rec and len(rec) > 21: print(tk, rec[2], rec[6], '$ · TTM', rec[21][0], 'yld', round(rec[21][0] / rec[6] * 100, 2), '% · months', [i + 1 for i, v in enumerate(rec[21][1]) if v > 0], 'n', rec[21][2], 'g', rec[21][4], '| 1y', rec[11][5], '5y', rec[11][7])
