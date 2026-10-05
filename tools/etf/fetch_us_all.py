# 미국 상장 ETF 전체: 나스닥 심볼 목록(ETF=Y) → 야후 시세·분배금. 거래대금 기준으로 저장 범위를 줄임
import io, json, os, time, datetime as dt, traceback
import requests
import pandas as pd

OUT = 'out'
os.makedirs(OUT, exist_ok=True)
LOG = []
def log(*a):
    s = ' '.join(str(x) for x in a); print(s, flush=True); LOG.append(s)
def save_log():
    open(os.path.join(OUT, 'log.txt'), 'w', encoding='utf-8').write('\n'.join(LOG))
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'}
MUST = ['DRAM']          # 거래대금과 관계없이 꼭 포함할 ETF
MIN_ADV = 1_000_000      # 20일 평균 거래대금(달러) 기준 — 실제 수록 범위는 앱 빌드 때 다시 정함
meta = {'started': dt.datetime.utcnow().isoformat() + 'Z'}

def symdir():
    for u in ('https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqtraded.txt', 'https://ftp.nasdaqtrader.com/dynamic/SymDir/nasdaqtraded.txt'):
        for t in range(3):
            try:
                r = requests.get(u, headers=UA, timeout=40)
                if r.status_code == 200 and 'Symbol' in r.text[:300]: return r.text
                log('symdir HTTP', r.status_code, u)
            except Exception as e:
                log('symdir ERR', u, e)
            time.sleep(3)
    return None

def main():
    import yfinance as yf
    txt = symdir()
    if not txt:
        log('no symbol directory'); return
    df = pd.read_csv(io.StringIO(txt), sep='|', dtype=str)
    df = df[df['Symbol'].notna() & (df['ETF'] == 'Y') & (df['Test Issue'] == 'N')]
    df = df[~df['Symbol'].str.contains(r'[\$\^]', regex=True)]
    df['ysym'] = df['Symbol'].str.replace('.', '-', regex=False)
    names = dict(zip(df['ysym'], df['Security Name']))
    exch = dict(zip(df['ysym'], df['Listing Exchange']))
    syms = sorted(set(df['ysym']) | set(MUST))
    meta['symbols'] = len(syms); log('US ETF symbols', len(syms))
    rows, px_keep, dv_keep = [], [], []
    t0 = time.time()
    for i in range(0, len(syms), 80):
        part = syms[i:i + 80]
        data = None
        for t in range(3):
            try:
                data = yf.download(part, start='2023-09-01', auto_adjust=False, actions=True, group_by='ticker', threads=True, progress=False)
                break
            except Exception as e:
                log('yf ERR', i, e); time.sleep(8 * (t + 1))
        if data is None or data.empty:
            log('empty batch', i); continue
        for tk in part:
            try:
                sub = data[tk] if isinstance(data.columns, pd.MultiIndex) else data
            except KeyError:
                continue
            sub = sub.dropna(subset=['Close']) if 'Close' in sub else sub.iloc[0:0]
            if sub.empty: continue
            c = sub['Close'].astype(float); v = sub['Volume'].fillna(0).astype(float)
            adv = float((c.tail(20) * v.tail(20)).mean())
            rows.append((tk, names.get(tk, ''), exch.get(tk, ''), round(adv), round(float(c.iloc[-1]), 4), str(sub.index[-1].date()), len(sub), str(sub.index[0].date())))
            if adv >= MIN_ADV or tk in MUST:
                for idx, cc, vv in zip(sub.index, c, v): px_keep.append((tk, idx.strftime('%Y-%m-%d'), float(cc), float(vv)))
                if 'Dividends' in sub:
                    d = sub[sub['Dividends'] > 0]['Dividends']
                    for idx, val in d.items(): dv_keep.append((tk, idx.strftime('%Y-%m-%d'), float(val)))
        if (i // 80) % 5 == 0: log('batch', i, len(syms), 'rows', len(rows), 'kept px', len({x[0] for x in px_keep}), round(time.time() - t0), 's'); save_log()
        time.sleep(1.5)
    L = pd.DataFrame(rows, columns=['ticker', 'name', 'exchange', 'adv20', 'last_close', 'last_date', 'n', 'first_date'])
    L.to_csv(os.path.join(OUT, 'etf_us_all_list.csv'), index=False)
    pd.DataFrame(px_keep, columns=['ticker', 'date', 'close', 'volume']).to_parquet(os.path.join(OUT, 'etf_us_all_px.parquet'), index=False)
    pd.DataFrame(dv_keep, columns=['ticker', 'date', 'div']).to_csv(os.path.join(OUT, 'etf_us_all_div.csv'), index=False)
    meta.update({'priced': len(L), 'kept': len({x[0] for x in px_keep}), 'px_rows': len(px_keep), 'div_rows': len(dv_keep),
                 'must_found': [m for m in MUST if m in set(L['ticker'])], 'finished': dt.datetime.utcnow().isoformat() + 'Z'})

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        log('FATAL', e, traceback.format_exc())
    json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), ensure_ascii=False, indent=1)
    log('META', json.dumps(meta, ensure_ascii=False)[:1500]); save_log()
