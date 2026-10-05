# 개별 주식 배당 이력 수집 (야후 파이낸스): pipeline/stock_db.js의 모든 주식(ETF 제외) → raw_div/stock_div.csv (code, mk, date, div) + meta.json
#   python pipeline/fetch_stock_div.py            # 약 4,800종목, 10~15분 (refresh.py의 div 단계가 실행)
#   LIMIT=80 python pipeline/fetch_stock_div.py   # 앞 80종목만 (확인용)
# add_etf.py가 이 결과로 주식 레코드에 ETF와 같은 형식의 배당 정보(div)를 붙인다. 순수 함수(지급월 추정·성장 가정·배당 정보)는 test_refresh.py에서 점검.
import datetime as dt, json, os, sys, time

D = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(D, 'raw_div')
START = '2021-01-01'      # 성장 가정에 완전한 연도 3개 이상을 쓰려고 5년치
G_DEFAULT, G_MAX = 3.0, 8.0

# ── 순수 함수 ──
def kr_pay_month(ex_date):
    """국내 지급월 추정: 12월 배당락(결산배당) → 이듬해 4월(주총 뒤), 그 외(분기·중간) → 배당락 두 달 뒤"""
    m = int(ex_date[5:7])
    return 4 if m == 12 else (m + 1) % 12 + 1

def us_pay_month(ex_date):
    """미국 지급월 추정: 배당락 약 한 달(25일) 뒤"""
    return (dt.date.fromisoformat(ex_date) + dt.timedelta(days=25)).month

def growth_est(divs, asof):
    """배당 성장 가정(%/년): 완전한 연도(기준 연도 이전) 합계가 3개 이상이면 연평균 증가율을 0~8%로 제한, 아니면 3.0"""
    yr = {}
    for d, v in divs:
        if d[:4] < asof[:4]: yr[d[:4]] = yr.get(d[:4], 0.0) + v
    ys = sorted(y for y, s in yr.items() if s > 0)
    if len(ys) < 3: return G_DEFAULT
    n = int(ys[-1]) - int(ys[0])
    cagr = ((yr[ys[-1]] / yr[ys[0]]) ** (1 / n) - 1) * 100 if n > 0 else 0.0
    return round(min(G_MAX, max(0.0, cagr)), 1)

def stock_div_info(divs, asof, kr):
    """[(배당락일, 주당 배당)] → [최근 12개월 합계, 지급월 비중 12개, 횟수, 마지막 배당락일, 성장 가정] (ETF div와 같은 형식)"""
    lo = (dt.date.fromisoformat(asof) - dt.timedelta(days=365)).isoformat()
    ttm = [(d, v) for d, v in divs if lo < d <= asof]
    g = growth_est(divs, asof)
    if not ttm: return [0, [0] * 12, 0, '', g]
    mon = [0.0] * 12
    for d, v in ttm: mon[(kr_pay_month(d) if kr else us_pay_month(d)) - 1] += v
    if len(ttm) >= 11 and sum(1 for x in mon if x > 0) >= 11: mon = [1.0] * 12     # 매월(또는 매주) 지급 → 12개월 균등
    tot = sum(mon); w = [round(x / tot, 3) for x in mon]
    s = sum(v for _, v in ttm)
    return [int(round(s)) if kr else round(s, 4), w, len(ttm), max(d for d, _ in ttm), g]

# ── 수집 ──
def tickers_from_db(path):
    """stock_db.js → [(code, 야후 심볼, mk)] 주식만(ETF 제외). 국내는 005930.KS / 코스닥 .KQ, 미국은 BRK.B → BRK-B"""
    db = json.loads(open(path, encoding='utf-8').read().strip()[len('window.STOCK_DB='):].rstrip(';'))
    out = []
    for r in db['s']:
        if r[4] == 'ETF': continue
        if r[0] == 'US': out.append((r[1], r[1].replace('.', '-'), 'US'))
        elif r[0] in ('KS', 'KQ'): out.append((r[1], f'{r[1]}.{r[0]}', r[0]))
    return out

def fetch(symbols, log=print):
    """야후 파이낸스에서 배당락 이력 → [(심볼, 날짜, 배당)], 실패 심볼 목록. 80개씩 묶어 받는다"""
    import yfinance as yf, pandas as pd
    rows, fail, t0 = [], [], time.time()
    for i in range(0, len(symbols), 80):
        part = symbols[i:i + 80]; data = None
        for t in range(3):
            try:
                data = yf.download(part, start=START, auto_adjust=False, actions=True, group_by='ticker', threads=True, progress=False); break
            except Exception as e:
                log('yf ERR', i, e); time.sleep(8 * (t + 1))
        if data is None or data.empty: fail += part; log('empty batch', i); continue
        for s in part:
            try: sub = data[s] if isinstance(data.columns, pd.MultiIndex) else data
            except KeyError: fail.append(s); continue
            if 'Dividends' not in sub: continue
            d = sub['Dividends'].dropna(); d = d[d > 0]
            rows += [(s, idx.strftime('%Y-%m-%d'), float(v)) for idx, v in d.items()]
        if (i // 80) % 10 == 0: log('batch', i, len(symbols), 'rows', len(rows), round(time.time() - t0), 's')
        time.sleep(1.5)
    return rows, fail

def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {'started': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}
    tk = tickers_from_db(os.path.join(D, 'stock_db.js'))
    if os.environ.get('LIMIT'): tk = tk[:int(os.environ['LIMIT'])]
    by_sym = {s: (c, mk) for c, s, mk in tk}
    print('tickers', len(tk), flush=True)
    rows, fail = fetch([s for _, s, _ in tk])
    with open(os.path.join(OUT, 'stock_div.csv'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('code,mk,date,div\n')
        for s, d, v in rows: f.write(f'{by_sym[s][0]},{by_sym[s][1]},{d},{v}\n')
    meta.update({'tickers': len(tk), 'with_div': len({s for s, _, _ in rows}), 'rows': len(rows), 'fail': fail[:100], 'n_fail': len(fail),
                 'finished': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')})
    json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('META', json.dumps(meta, ensure_ascii=False)[:600], flush=True)

if __name__ == '__main__':
    main()
