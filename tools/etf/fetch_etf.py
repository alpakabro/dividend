# ETF 데이터 수집 (GitHub Actions에서 실행): 국내 ETF 목록·시세(네이버), 배당(야후), 미국 ETF 시세·배당(야후)
import json, os, sys, time, traceback, datetime as dt
import xml.etree.ElementTree as ET
import requests
import pandas as pd

OUT = 'out'
os.makedirs(OUT, exist_ok=True)
LOG = []
def log(*a):
    s = ' '.join(str(x) for x in a)
    print(s, flush=True); LOG.append(s)
def save_log():
    open(os.path.join(OUT, 'log.txt'), 'w', encoding='utf-8').write('\n'.join(LOG))

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'Referer': 'https://finance.naver.com/'}
S = requests.Session(); S.headers.update(UA)
meta = {'started': dt.datetime.utcnow().isoformat() + 'Z'}

def get(url, **kw):
    for t in range(3):
        try:
            r = S.get(url, timeout=20, **kw)
            if r.status_code == 200: return r
            log('HTTP', r.status_code, url)
        except Exception as e:
            log('ERR', url, e)
        time.sleep(1.5 * (t + 1))
    return None

# ── 1) 국내 ETF 목록 (네이버 금융 ETF API) ──
def kr_list():
    r = get('https://finance.naver.com/api/sise/etfItemList.nhn', params={'etfType': 0, 'targetColumn': 'market_sum', 'sortOrder': 'desc'})
    if r is None: return None
    js = r.json() if 'json' in r.headers.get('content-type', '') or r.text.strip().startswith('{') else json.loads(r.content.decode('euc-kr', 'ignore'))
    items = js['result']['etfItemList']
    df = pd.DataFrame(items)
    log('KR ETF list', len(df), 'cols', list(df.columns))
    return df

# ── 2) 국내 ETF 일별 시세 (네이버 차트 XML) ──
def kr_hist(code, count=2800):
    r = get('https://fchart.stock.naver.com/sise.nhn', params={'symbol': code, 'timeframe': 'day', 'count': count, 'requestType': 0})
    if r is None: return None
    txt = r.content.decode('euc-kr', 'ignore')
    root = ET.fromstring(txt)
    rows = []
    for it in root.iter('item'):
        p = it.get('data', '').split('|')
        if len(p) >= 6:
            rows.append((p[0], float(p[1]), float(p[2]), float(p[3]), float(p[4]), float(p[5])))
    if not rows: return None
    d = pd.DataFrame(rows, columns=['date', 'open', 'high', 'low', 'close', 'volume'])
    d['date'] = pd.to_datetime(d['date'], format='%Y%m%d'); d.insert(0, 'code', code)
    return d

# ── 3) 야후 배당·시세 (yfinance) ──
def yf_batch(tickers, start, what):
    import yfinance as yf
    frames = []
    for i in range(0, len(tickers), 40):
        part = tickers[i:i + 40]
        for t in range(3):
            try:
                df = yf.download(part, start=start, auto_adjust=False, actions=True, group_by='ticker', threads=True, progress=False)
                frames.append((part, df)); break
            except Exception as e:
                log('yf ERR', what, i, e); time.sleep(5 * (t + 1))
        time.sleep(2)
    return frames

def tidy(frames, keep_px):
    px, dv = [], []
    for part, df in frames:
        if df is None or df.empty: continue
        for tk in part:
            try:
                sub = df[tk] if isinstance(df.columns, pd.MultiIndex) else df
            except KeyError:
                continue
            sub = sub.dropna(how='all')
            if sub.empty or 'Close' not in sub: continue
            if 'Dividends' in sub:
                d = sub[sub['Dividends'] > 0]['Dividends']
                for idx, v in d.items(): dv.append((tk, idx.strftime('%Y-%m-%d'), float(v)))
            if keep_px:
                c = sub[['Close', 'Adj Close', 'Volume']].dropna(subset=['Close'])
                for idx, row in c.iterrows():
                    px.append((tk, idx.strftime('%Y-%m-%d'), float(row['Close']), float(row['Adj Close']), float(row['Volume']) if pd.notna(row['Volume']) else 0.0))
    return px, dv

US_ETF = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'us_etf_list.json'), encoding='utf-8'))

def main():
    # 국내
    try:
        lst = kr_list()
        if lst is not None:
            lst.to_csv(os.path.join(OUT, 'etf_kr_list.csv'), index=False, encoding='utf-8')
            codes = [c for c in lst['itemcode'].astype(str).str.zfill(6)]
            meta['kr_list'] = len(codes)
            hist = []; fail = []
            t0 = time.time()
            for i, c in enumerate(codes):
                h = kr_hist(c)
                if h is None: fail.append(c)
                else: hist.append(h)
                if i % 100 == 0: log('KR hist', i, len(codes), round(time.time() - t0), 's'); save_log()
                time.sleep(0.12)
            if hist:
                H = pd.concat(hist, ignore_index=True)
                H.to_parquet(os.path.join(OUT, 'etf_kr_px.parquet'), index=False)
                meta['kr_hist'] = int(H['code'].nunique()); meta['kr_rows'] = int(len(H)); meta['kr_last'] = str(H['date'].max().date())
            meta['kr_hist_fail'] = fail[:200]
            # 국내 ETF 분배금(야후 .KS)
            try:
                fr = yf_batch([c + '.KS' for c in codes], '2023-01-01', 'krdiv')
                _, dv = tidy(fr, keep_px=False)
                pd.DataFrame(dv, columns=['ticker', 'date', 'div']).to_csv(os.path.join(OUT, 'etf_kr_div.csv'), index=False)
                meta['kr_div_rows'] = len(dv); meta['kr_div_codes'] = len({x[0] for x in dv})
            except Exception as e:
                log('KR div ERR', e, traceback.format_exc())
    except Exception as e:
        log('KR ERR', e, traceback.format_exc())
    save_log()
    # 네이버 분배금 정보 탐색용 원문 저장(다음 단계 참고)
    for name, url in [('integration', 'https://m.stock.naver.com/api/stock/458730/integration'),
                      ('basic', 'https://m.stock.naver.com/api/stock/458730/basic'),
                      ('etfbasic', 'https://m.stock.naver.com/api/etf/458730/basic'),
                      ('wise', 'https://navercomp.wisereport.co.kr/v2/ETF/index.aspx?cmp_cd=458730')]:
        try:
            r = S.get(url, timeout=20)
            open(os.path.join(OUT, f'probe_{name}.txt'), 'w', encoding='utf-8').write(f'{r.status_code} {r.headers.get("content-type")}\n' + r.text[:60000])
        except Exception as e:
            log('probe ERR', name, e)
    # 미국
    try:
        tks = list(US_ETF.keys())
        fr = yf_batch(tks, '2016-01-01', 'us')
        px, dv = tidy(fr, keep_px=True)
        P = pd.DataFrame(px, columns=['ticker', 'date', 'close', 'adjclose', 'volume'])
        P.to_parquet(os.path.join(OUT, 'etf_us_px.parquet'), index=False)
        pd.DataFrame(dv, columns=['ticker', 'date', 'div']).to_csv(os.path.join(OUT, 'etf_us_div.csv'), index=False)
        meta['us_tickers'] = int(P['ticker'].nunique()) if len(P) else 0; meta['us_rows'] = len(P)
        meta['us_last'] = str(P['date'].max()) if len(P) else None
        meta['us_missing'] = sorted(set(tks) - set(P['ticker'].unique())) if len(P) else tks
        meta['us_div_rows'] = len(dv)
    except Exception as e:
        log('US ERR', e, traceback.format_exc())
    meta['finished'] = dt.datetime.utcnow().isoformat() + 'Z'
    json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), ensure_ascii=False, indent=1)
    log('META', json.dumps(meta, ensure_ascii=False)[:2000])
    save_log()

if __name__ == '__main__':
    main()
