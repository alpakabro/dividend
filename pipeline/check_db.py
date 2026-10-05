# stock_db.js 디코더 검증 (build_db.py 와 독립 구현)
import os, json, math
import pandas as pd
D = os.path.dirname(os.path.abspath(__file__))

B64 = {ch: i for i, ch in enumerate('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/')}
def vlq_values(s):          # 5비트 리틀엔디언 그룹, 32 = 연속, 지그재그
    out, z, sh = [], 0, 0
    for ch in s:
        d = B64[ch]; z |= (d & 31) << sh
        if d & 32: sh += 5; continue
        out.append(z >> 1 if z & 1 == 0 else -(z >> 1)); z, sh = 0, 0
    return out
def series(s):              # 델타 누적합
    acc, out = 0, []
    for n in vlq_values(s): acc += n; out.append(acc)
    return out

js = open(os.path.join(D, 'stock_db.js'), encoding='utf-8').read()
pre = 'window.STOCK_DB='
assert js.startswith(pre) and js.endswith(';')
db = json.loads(js[len(pre):-1])
recs = {r[1]: r for r in db['s']}
print('records', len(db['s']), '| KR', sum(r[0] != 'US' for r in db['s']), '| US', sum(r[0] == 'US' for r in db['s']), '| idx', list(db['idx']))
bad = [r[1] for r in db['s'] if len(series(r[20])) != len(series(r[13]))]
print('len(v) == len(d) for all records:', not bad, bad[:5])
day = lambda n: str((pd.Timestamp('1970-01-01') + pd.Timedelta(days=n)).date())

raw_kr = pd.read_parquet(os.path.join(D, 'marcap-2026.parquet'), columns=['Date', 'Code', 'Close', 'Volume'])
raw_us = pd.read_parquet(os.path.join(D, 'us_prices.parquet'), columns=['date', 'ticker', 'close', 'volume'])
for code, mk in (('005930', 'KR'), ('AAPL', 'US')):
    r = recs[code]; scale = 100 if mk == 'US' else 1
    ax = series(db['ax'][mk]['d']); d = series(r[13]); v = series(r[20])
    assert len(v) == len(d), code
    dates = ax[r[12]:r[12] + len(d)]
    if mk == 'KR': raw = raw_kr[raw_kr['Code'] == code].set_index('Date')[['Close', 'Volume']]
    else: raw = raw_us[raw_us['ticker'] == code].set_index('date')[['close', 'volume']]
    print(f'{code} ({r[2]}): d_off {r[12]}, len(d) {len(d)} = len(v) {len(v)}')
    for dt, c, q in list(zip(dates, d, v))[-5:]:
        rc, rv = raw.loc[pd.Timestamp(day(dt))].tolist()
        print(f'  {day(dt)}  close {c / scale:>10,.2f} (raw {rc:,.2f})  volume {math.exp(q / 20) - 1:>14,.0f} (raw {rv:,.0f}, q={q})')

k = db['idx']['KOSPI']; ax = series(db['ax']['KR']['d']); kd = series(k[1])
print('KOSPI proxy d series: d_off', k[0], 'len', len(kd), '| last 5:', [(day(t), x / 100) for t, x in zip(ax[k[0]:k[0] + len(kd)][-5:], kd[-5:])])
q = db['idx']['KOSDAQ']; qd = series(q[1])
print('KOSDAQ proxy d last 5:', [x / 100 for x in qd[-5:]])
