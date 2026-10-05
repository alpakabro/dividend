# 데이터 자동 갱신: DB 생성 → (새 데이터일 때만) ETF 수집 → ETF 병합 → 메타(환율·지수·종목 수) → 매크로 타일 → 빌드 → 검증 → 커밋
#   python pipeline/refresh.py                              # 전체 실행. 데이터 날짜가 그대로면 '변동 없음'으로 끝남
#   python pipeline/refresh.py --steps meta,build,verify    # 일부 단계만 (쉼표: db etf div merge meta macro build verify commit)
#   python pipeline/refresh.py --force                      # 날짜가 같아도 끝까지 실행
#   python pipeline/refresh.py --push                       # 커밋 뒤 origin main에 푸시 (GitHub Actions가 쓰는 옵션)
# 기록: pipeline/refresh.log. GitHub Actions에서는 실행 요약도 남긴다($GITHUB_STEP_SUMMARY).
# 검증에 실패하면 커밋하지 않는다. 종료 코드 1 = 실패(Actions가 이메일로 알림).
import argparse, datetime as dt, json, os, pathlib, re, shutil, subprocess, sys, time, traceback

D = os.path.dirname(os.path.abspath(__file__))        # pipeline/
ROOT = os.path.dirname(D)
APP = os.path.join(ROOT, 'app')
sys.path.insert(0, APP)
from build import ko_date, short_date, start_of     # 날짜 표기 도우미(빌드와 공유)

META_PATH = os.path.join(APP, 'data', 'meta.json')
MACRO_PATH = os.path.join(APP, 'src', 'macro_report.json')
DB_FULL = os.path.join(APP, 'data', 'stock_db_full.js')
DB_RAW = os.path.join(D, 'stock_db.js')
RAW = os.path.join(D, 'raw_etf')
STEPS = ['db', 'etf', 'div', 'merge', 'meta', 'macro', 'build', 'verify', 'commit']
PY = sys.executable
ENV = {**os.environ, 'PYTHONUTF8': '1', 'PYTHONIOENCODING': 'utf-8'}
YF = {'fx': 'KRW=X', 'kospi': '^KS11', 'kosdaq': '^KQ11'}     # 야후 파이낸스 심볼
BOK_URL = 'https://www.bok.or.kr/portal/singl/baseRate/list.do?dataSeCd=01&menuNo=200643'
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'}
WARN = []   # 실행 요약에 ⚠로 붙는 경고(타일 수집 실패 등). 실패가 아니라 알림
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# ── 순수 함수 (pipeline/test_refresh.py에서 점검) ──
def fx_range(closes):
    """[(YYYY-MM-DD, 종가)] → 연중 고·저와 그 날짜(월/일)"""
    hi = max(closes, key=lambda x: x[1]); lo = min(closes, key=lambda x: x[1])
    return {'hi': hi[1], 'hiD': md(hi[0]), 'lo': lo[1], 'loD': md(lo[0])}

def is_newer(new, old):
    """어느 한 시장이라도 데이터 날짜가 뒤면 참 (old가 없으면 참)"""
    return old is None or any(new[k] > old.get(k, '') for k in ('KR', 'US'))

def count_gate(prev, new, ratio=0.9):
    """종목 수가 0이거나 이전의 ratio 미만이면 문제 목록(빈 목록 = 통과)"""
    bad = []
    for k, v in new.items():
        pv = (prev or {}).get(k)
        if not v: bad.append(f'{k} 0개')
        elif pv and v < pv * ratio: bad.append(f'{k} {v:,}개 < 이전 {pv:,}개의 {ratio:.0%}')
    return bad

def days_between(a, b):
    return (dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days

# ── 큐레이션 배당 변동 감지 (순수 함수) ──
CUR_RE = re.compile(r"\{\s*id:'[^']+',\s*mkt:'(KR|US)',\s*name:'([^']+)',\s*code:'([^']+)',\s*p:[\d.]+,\s*d:([\d.]+)")
def parse_curated(js):
    """RAW/RAW_ADD 자바스크립트 원문 → {DB id: (이름, 연간 배당(주당), 시장)}"""
    return {('K:' if mkt == 'KR' else 'U:') + code: (name, float(d), mkt) for mkt, name, code, d in CUR_RE.findall(js)}

def curated_drift(curated, db, th=0.10):
    """큐레이션 연간 배당과 DB의 최근 12개월 실제 배당(야후)이 th 이상 다르면 경고 문구 목록. 실제 자료가 없는 종목은 비교하지 않음"""
    out = []
    for r in db['s']:
        if len(r) < 22 or r[4] == 'ETF' or not r[21] or not r[21][0]: continue
        key = ('U:' if r[0] == 'US' else 'K:') + r[1]
        if key not in curated: continue
        name, d, mkt = curated[key]; ttm = r[21][0]
        if d <= 0: continue
        diff = (ttm - d) / d
        if abs(diff) >= th:
            f = (lambda v: f'${v:,.2f}') if mkt == 'US' else (lambda v: f'{v:,.0f}원')
            out.append(f'배당 변동 의심: {name}({r[1]}) 큐레이션 {f(d)} vs 최근 12개월 실제 {f(ttm)} ({pm(diff * 100, 0, "%")}) — RAW/RAW_ADD 확인')
    return out

# ── 매크로 타일 계산 (순수 함수) ──
def pm(x, dp, unit='', pre=''):
    """부호 표기: 양수 '+', 음수 '▲'(앱 규칙), 0은 부호 없음"""
    return ('+' if x > 0 else '▲' if x < 0 else '') + pre + f'{abs(x):,.{dp}f}' + unit
def md(d): return f'{int(d[5:7])}/{int(d[8:10])}'          # '2026-10-02' → '10/2'
def mon(d): return f'{int(d[5:7])}월'                       # '2026-08-01' → '8월'
def upto(series, asof): return [x for x in series if x[0] <= asof]
def last_two(series, asof):
    s = upto(series, asof); return s[-1], s[-2]
def last_change(series):
    """값이 마지막으로 바뀐 (날짜, 현재값, 직전값). 한 번도 안 바뀌었으면 첫 날짜"""
    for i in range(len(series) - 1, 0, -1):
        if series[i][1] != series[i - 1][1]: return series[i][0], series[-1][1], series[i - 1][1]
    return series[0][0], series[-1][1], series[-1][1]
def yoy(monthly):
    """월별 지수 → [(최근 달, 전년 동월 대비 %), (그 전 달, …)]"""
    return [(monthly[-k][0], round((monthly[-k][1] / monthly[-k - 12][1] - 1) * 100, 1)) for k in (1, 2)]
def ytd_base(series, asof):
    """연초 기준값 = 전년 마지막 값"""
    prev = [v for d, v in series if d < asof[:4] + '-01-01']; return prev[-1] if prev else None
def ytd_high(series, asof):
    return max(v for d, v in series if asof[:4] + '-01-01' <= d <= asof)
def parse_bok(html):
    """한국은행 기준금리 표 → [(YYYY-MM-DD, 금리)] 최신순 (행: 연도 · 'MM월 DD일' · 금리)"""
    out, year = [], None
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>', html, flags=re.S):
        cells = [re.sub(r'<[^>]+>', '', c).strip() for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', row, flags=re.S)]
        if cells and re.fullmatch(r'20\d\d', cells[0]): year, cells = cells[0], cells[1:]
        m = re.fullmatch(r'(\d{1,2})월\s*(\d{1,2})일', cells[0]) if cells else None
        if year and m and len(cells) > 1 and re.fullmatch(r'\d+\.\d+', cells[1]):
            out.append((f'{year}-{int(m.group(1)):02d}-{int(m.group(2)):02d}', float(cells[1])))
    return out

def build_tiles(src):
    """수집값 → 매크로 브리핑 타일 10개(값·설명·등락·출처). 자료가 빠진 타일은 건너뛰고 경고로 돌려줌
    src: us(기준일), fed_u/fed_l(FRED 연방기금금리 상·하단), cpi/cpi_core, unrate/payems, tnx/dxy/krw/kospi/spx/brent/wti(야후), bok(한국은행 최신순)"""
    us = src['us']; tiles, warn = [], []
    def tile(name, fn):
        try: tiles.append(fn())
        except Exception as e: warn.append(f'{name}: 자료 없음 ({type(e).__name__})')
    def lvl(name, key, v_fmt, d_fn, dp, unit='', pre='', s='Y'):      # 일별 시세형 타일(전일 대비)
        (d1, v1), (d0, v0) = last_two(src[key], us)
        return {'k': name, 'v': v_fmt(v1), 'd': d_fn(d1, v1), 's': [s],
                'chg': {'lab': '전일 대비', 'cur': round(v1, dp), 'prev': round(v0, dp), 'kind': 'lvl', 'dp': dp,
                        **({'unit': unit} if unit else {}), **({'pre': pre} if pre else {}), 'ptxt': f'{pre}{v0:,.{dp}f}{unit} ({md(d0)})'}}
    def fed():
        u = upto(src['fed_u'], us); l = upto(src['fed_l'], us)
        d_chg, cur_u, prev_u = last_change(u); cur_l = l[-1][1]; prev_l = [v for d, v in l if d < d_chg][-1]
        return {'k': '美 기준금리', 'v': f'{cur_l:.2f}~{cur_u:.2f}%', 's': ['F'],
                'd': f"{md(d_chg)}부터 {int(round(abs(cur_u - prev_u) * 100))}bp {'인상' if cur_u > prev_u else '인하'} 적용 · {md(u[-1][0])} 기준",   # FRED 목표범위는 결정 다음 날(시행일)에 바뀐다
                'chg': {'lab': '직전 변경 대비', 'cur': cur_u, 'prev': prev_u, 'kind': 'pp', 'ptxt': f'{prev_l:.2f}~{prev_u:.2f}% ({md(d_chg)} 적용 전)'}}
    def cpi():
        (d1, y1), (d0, y0) = yoy(src['cpi']); core = yoy(src['cpi_core'])[0][1]
        return {'k': f'美 CPI ({mon(d1)})', 'v': f'{y1}%', 'd': f'근원 {core}% · 전년 동월 대비', 's': ['F'],
                'chg': {'lab': '전월 대비', 'cur': y1, 'prev': y0, 'kind': 'pp', 'ptxt': f'{y0}% ({mon(d0)})'}}
    def jobs():
        (d1, u1), (d0, u0) = src['unrate'][-1], src['unrate'][-2]; p1, p0 = src['payems'][-1][1], src['payems'][-2][1]
        return {'k': f'美 실업률 ({mon(d1)})', 'v': f'{u1}%', 'd': f'고용 {pm((p1 - p0) / 10, 1, "만")} (비농업, 전월 대비) · {mon(d1)}', 's': ['F'],
                'chg': {'lab': '전월 대비', 'cur': u1, 'prev': u0, 'kind': 'pp', 'ptxt': f'{u0}% ({mon(d0)})'}}
    def tnx():
        (d1, v1), (d0, v0) = last_two(src['tnx'], us)
        return {'k': '美 10년물', 'v': f'{v1:.2f}%', 'd': f'연초 대비 {pm(round((v1 - ytd_base(src["tnx"], us)) * 100), 0, "bp")} · {md(d1)}', 's': ['Y'],
                'chg': {'lab': '전일 대비', 'cur': round(v1, 2), 'prev': round(v0, 2), 'kind': 'bp', 'ptxt': f'{v0:.2f}% ({md(d0)})'}}
    def bok():
        (d1, r1), (d0, r0) = src['bok'][0], src['bok'][1]
        return {'k': '韓 기준금리', 'v': f'{r1:.2f}%', 'd': f"{md(d1)} {'인상' if r1 > r0 else '인하' if r1 < r0 else '동결'} · 한국은행", 's': ['B'],
                'chg': {'lab': '직전 결정 대비', 'cur': r1, 'prev': r0, 'kind': 'pp', 'ptxt': f'{r0:.2f}% ({md(d0)} 결정)'}}
    ytd = lambda key: (lambda d1, v1: f'연초 대비 {pm((v1 / ytd_base(src[key], us) - 1) * 100, 1, "%")} · {md(d1)}')
    tile('美 기준금리', fed); tile('美 CPI', cpi); tile('美 실업률', jobs); tile('美 10년물', tnx)
    tile('달러인덱스', lambda: lvl('달러인덱스', 'dxy', lambda v: f'{v:.2f}', ytd('dxy'), 2))
    tile('원/달러', lambda: lvl('원/달러', 'krw', lambda v: f'{v:,.1f}원',
                              lambda d1, v1: f"연초 대비 {pm(round(v1 - ytd_base(src['krw'], us), 1), 1, '원')} ({'원화 강세' if v1 < ytd_base(src['krw'], us) else '원화 약세'}) · {md(d1)}", 1, unit='원'))
    tile('韓 기준금리', bok)
    tile('코스피', lambda: lvl('코스피', 'kospi', lambda v: f'{v:,.2f}',
                             lambda d1, v1: f"연초 대비 {pm((v1 / ytd_base(src['kospi'], us) - 1) * 100, 1, '%')} · 연중 고점 대비 {pm((v1 / ytd_high(src['kospi'], us) - 1) * 100, 1, '%')} · {md(d1)}", 2))
    tile('S&P500', lambda: lvl('S&P500', 'spx', lambda v: f'{v:,.2f}', ytd('spx'), 2))
    tile('브렌트유', lambda: lvl('브렌트유', 'brent', lambda v: f'${v:.2f}', lambda d1, v1: f"WTI ${upto(src['wti'], us)[-1][1]:.2f} · {md(d1)}", 2, pre='$'))
    return tiles, warn

# ── 공통 ──
LOGF = None
def log(*a):
    s = ' '.join(str(x) for x in a)
    print(s, flush=True)
    if LOGF: LOGF.write(f'{dt.datetime.now():%Y-%m-%d %H:%M:%S} {s}\n'); LOGF.flush()

def run(cmd, cwd=ROOT):
    """하위 스크립트 실행, 출력은 그대로 로그로. 실패(종료 코드≠0)면 예외"""
    rel = os.path.relpath(cwd, ROOT)
    log('$', ' '.join(os.path.basename(c) if c == PY else c for c in cmd), '' if rel == '.' else f'(cwd {rel})')
    p = subprocess.Popen(cmd, cwd=cwd, env=ENV, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
    for line in p.stdout: log('  │', line.rstrip())
    if p.wait(): raise RuntimeError(f'{os.path.basename(cmd[-1])} 실패 (exit {p.returncode})')

def git(*args, check=True):
    p = subprocess.run(['git', *args], cwd=ROOT, env=ENV, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if check and p.returncode: raise RuntimeError(f"git {' '.join(args)} 실패: {p.stderr.strip()[-500:]}")
    return p.stdout.strip() if p.returncode == 0 else ''

def read_json(path):
    return json.load(open(path, encoding='utf-8')) if os.path.exists(path) else None

def load_db(path):
    s = open(path, encoding='utf-8').read().strip()
    return json.loads(s[len('window.STOCK_DB='):].rstrip(';'))

def div_counts(db):
    """최근 12개월 배당이 있는 주식 수(ETF 제외) {'kr': n, 'us': m}"""
    c = {'kr': 0, 'us': 0}
    for r in db['s']:
        if r[4] != 'ETF' and len(r) > 21 and r[21][0] > 0: c['us' if r[0] == 'US' else 'kr'] += 1
    return c

def counts_of(db):
    c = {'kr_stk': 0, 'kr_etf': 0, 'us_stk': 0, 'us_etf': 0}
    for r in db['s']: c[('us' if r[0] == 'US' else 'kr') + ('_etf' if r[4] == 'ETF' else '_stk')] += 1
    return c

def yf_closes(sym, start, end):
    """야후 파이낸스 일별 종가 [(YYYY-MM-DD, 종가)], end 포함. 3번까지 재시도"""
    import yfinance as yf
    for t in range(3):
        try:
            df = yf.Ticker(sym).history(start=start, end=(dt.date.fromisoformat(end) + dt.timedelta(days=1)).isoformat(), auto_adjust=False)
            rows = [(d.strftime('%Y-%m-%d'), round(float(c), 2)) for d, c in df['Close'].dropna().items()]
            if rows: return rows
            log(f'yfinance {sym}: 빈 결과')
        except Exception as e:
            log(f'yfinance {sym} 오류: {e}')
        time.sleep(5 * (t + 1))
    raise RuntimeError(f'야후 파이낸스에서 {sym}을 가져오지 못함')

def yf_multi(symbols, start, end):
    """여러 심볼의 일별 종가를 한 번에 {심볼: [(날짜, 종가)]}. 일부 심볼이 비어도 나머지는 돌려줌"""
    import yfinance as yf, pandas as pd
    for t in range(3):
        try:
            df = yf.download(symbols, start=start, end=(dt.date.fromisoformat(end) + dt.timedelta(days=1)).isoformat(), auto_adjust=False, group_by='ticker', progress=False, threads=False)
            out = {}
            for s in symbols:
                try:
                    sub = df[s] if isinstance(df.columns, pd.MultiIndex) else df
                    out[s] = [(d.strftime('%Y-%m-%d'), round(float(v), 4)) for d, v in sub['Close'].dropna().items()]
                except Exception: out[s] = []
            if any(out.values()): return out
            log('yfinance 일괄: 빈 결과')
        except Exception as e:
            log(f'yfinance 일괄 오류: {e}')
        time.sleep(5 * (t + 1))
    raise RuntimeError('야후 파이낸스 일괄 조회 실패')

def http_get(url):
    """웹 페이지·CSV 텍스트. FRED는 파이썬 기본 TLS 접속을 끊어 버리므로 curl_cffi(yfinance 의존성)로 크롬처럼 접속한다"""
    try:
        from curl_cffi import requests as cr
        r = cr.get(url, impersonate='chrome', timeout=30); r.raise_for_status(); return r.text
    except ImportError:
        import urllib.request
        return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read().decode('utf-8', 'replace')

def fred(series_id):
    """FRED CSV(키 불필요) → [(YYYY-MM-DD, 값)]. 결측('.')은 제외"""
    txt = http_get(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}')
    out = [(d, float(v)) for d, v in (l.split(',') for l in txt.strip().splitlines()[1:]) if v not in ('.', '')]
    if not out: raise RuntimeError('빈 결과')
    return out

def bok_rates():
    """한국은행 기준금리 변동 추이 페이지 → [(날짜, 금리)] 최신순"""
    out = parse_bok(http_get(BOK_URL))
    if len(out) < 2: raise RuntimeError('표를 찾지 못함')
    return out

# ── 단계 ──
def step_db():
    """국내·미국 주식 DB → pipeline/stock_db.js. 올해 marcap 파일과 미국 가격 파일은 지우고 다시 내려받는다"""
    for f in (f'marcap-{dt.date.today().year}.parquet', 'us_prices.parquet'):
        if os.path.exists(os.path.join(D, f)): os.remove(os.path.join(D, f))
    run([PY, 'build_db.py'], cwd=D)
    run([PY, 'check_db.py'], cwd=D)
    return load_db(DB_RAW)['asof']

def step_etf():
    """ETF 시세·분배금 수집: etf-job 브랜치의 수집 스크립트를 받아 실행 → raw_etf/etf-data, raw_etf/etf-data-us"""
    tools = os.path.join(RAW, '_tools'); os.makedirs(tools, exist_ok=True)
    git('fetch', '--quiet', '--depth', '1', 'origin', '+refs/heads/etf-job:refs/remotes/origin/etf-job')
    for f in ('fetch_etf.py', 'fetch_us_all.py', 'us_etf_list.json'):
        open(os.path.join(tools, f), 'w', encoding='utf-8', newline='\n').write(git('show', f'origin/etf-job:tools/etf/{f}') + '\n')
    for script, out, key, least in (('fetch_etf.py', 'etf-data', 'kr_hist', 500), ('fetch_us_all.py', 'etf-data-us', 'kept', 1000)):
        work = os.path.join(RAW, '_work'); shutil.rmtree(work, ignore_errors=True); os.makedirs(work)
        run([PY, os.path.join(tools, script)], cwd=work)      # 스크립트는 cwd/out 에 결과를 쓴다
        m = read_json(os.path.join(work, 'out', 'meta.json')) or {}
        if m.get(key, 0) < least: raise RuntimeError(f'{script} 결과 부족: {key}={m.get(key)} (최소 {least})')
        dst = os.path.join(RAW, out); shutil.rmtree(dst, ignore_errors=True); shutil.move(os.path.join(work, 'out'), dst)
        log(f'{out}: ' + ', '.join(f'{k} {v}' for k, v in m.items() if not isinstance(v, list)))

def step_div():
    """개별 주식 배당 이력(야후 파이낸스) → raw_div/stock_div.csv. 약 4,800종목, 10~15분"""
    run([PY, 'fetch_stock_div.py'], cwd=D)
    m = read_json(os.path.join(D, 'raw_div', 'meta.json')) or {}
    if m.get('with_div', 0) < 1000: raise RuntimeError(f"배당 이력 수집 부족: with_div={m.get('with_div')} (최소 1000)")
    log(f"stock dividends: {m.get('tickers')}종목 중 {m.get('with_div')}종목 이력 있음, 실패 {m.get('n_fail')}")

def step_merge():
    """ETF를 DB에 병합 → app/data/stock_db_full.js"""
    run([PY, 'add_etf.py'], cwd=D)

def step_meta():
    """환율·지수·종목 수 → app/data/meta.json (가격 데이터 날짜 기준, 출처: 야후 파이낸스)"""
    db = load_db(DB_FULL); kr, us = db['asof']['KR'], db['asof']['US']
    old = read_json(META_PATH) or {}
    cur = {}   # 큐레이션 배당(RAW·RAW_ADD)이 실제 지급과 10% 이상 다르면 요약에 경고
    for f in (os.path.join(APP, 'app_src.html'), os.path.join(APP, 'src', 'data.js')): cur.update(parse_curated(open(f, encoding='utf-8').read()))
    drift = curated_drift(cur, db); WARN.extend(drift); log(f'curated check: {len(cur)}종목 중 변동 의심 {len(drift)}건')
    fx_rows = yf_closes(YF['fx'], f'{us[:4]}-01-01', us)
    fx_date, fx = fx_rows[-1]
    if days_between(fx_date, us) > 3: raise RuntimeError(f'환율이 {fx_date}까지만 있음 (미국 데이터 {us})')
    idx = {}
    for k in ('kospi', 'kosdaq'):
        rows = dict(yf_closes(YF[k], (dt.date.fromisoformat(kr) - dt.timedelta(days=10)).isoformat(), kr))
        if kr not in rows: raise RuntimeError(f'{YF[k]}에 {kr} 종가가 아직 없음 — 다음 실행에서 다시 시도')
        idx[k] = rows[kr]
    sy, sm = start_of(us)
    us_all = read_json(os.path.join(RAW, 'etf-data-us', 'meta.json')) or {}
    meta = {'asof': {'KR': kr, 'US': us},
            'fx': round(fx, 1), 'fx_date': fx_date, 'fx_src': '야후 파이낸스 USD/KRW', 'fx_url': 'https://finance.yahoo.com/quote/KRW%3DX/',
            'fx_range': fx_range(fx_rows),
            'kospi': idx['kospi'], 'kosdaq': idx['kosdaq'], 'idx_date': kr, 'idx_src': '야후 파이낸스 ^KS11·^KQ11',
            'start_year': sy, 'start_month': sm,
            'counts': counts_of(db), 'div_counts': div_counts(db), 'us_etf_universe': us_all.get('symbols', old.get('us_etf_universe', 0)),
            'updated': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}
    json.dump(meta, open(META_PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    log(f"meta: 국내 {kr} · 미국 {us} · 원/달러 {meta['fx']} ({fx_date}) · 연중 {meta['fx_range']} · 코스피 {idx['kospi']} · 코스닥 {idx['kosdaq']} · 종목 {meta['counts']}")
    return meta

def step_macro():
    """매크로 브리핑 지표 타일 10개 → app/src/macro_report.json (야후 파이낸스·FRED·한국은행). 실패한 타일은 이전 값 유지 + 경고"""
    us = read_json(META_PATH)['asof']['US']
    rep = read_json(MACRO_PATH); src = {'us': us}; warn = []
    try:
        y = yf_multi(['^TNX', 'DX-Y.NYB', 'KRW=X', '^KS11', '^GSPC', 'BZ=F', 'CL=F'], f'{int(us[:4]) - 1}-12-15', us)
        src.update(tnx=y['^TNX'], dxy=y['DX-Y.NYB'], krw=y['KRW=X'], kospi=y['^KS11'], spx=y['^GSPC'], brent=y['BZ=F'], wti=y['CL=F'])
    except Exception as e: warn.append(f'야후 파이낸스 조회 실패: {e}')
    for key, sid in (('fed_u', 'DFEDTARU'), ('fed_l', 'DFEDTARL'), ('cpi', 'CPIAUCNS'), ('cpi_core', 'CPILFENS'), ('unrate', 'UNRATE'), ('payems', 'PAYEMS')):   # CPI는 공식 전년 대비와 같은 비계절조정 지수
        try: src[key] = fred(sid)
        except Exception as e: warn.append(f'FRED {sid} 조회 실패: {e}')
    try: src['bok'] = bok_rates()
    except Exception as e: warn.append(f'한국은행 기준금리 조회 실패: {e}')
    tiles, w2 = build_tiles(src); warn += w2
    base = lambda k: k.split(' (')[0]                    # '美 CPI (8월)' → '美 CPI': 달이 바뀌어도 같은 자리
    new = {base(t['k']): t for t in tiles}
    rep['tiles'] = [new.pop(base(t['k']), t) for t in rep['tiles']] + list(new.values())
    rep['tiles_asof'] = us
    rep['src_auto'] = {'Y': {'title': '야후 파이낸스 (시세·지수·환율·유가 일별 종가)', 'url': 'https://finance.yahoo.com/', 'date': us},
                       'F': {'title': 'FRED 세인트루이스 연준 (연방기금금리 목표범위·CPI·실업률·비농업 고용)', 'url': 'https://fred.stlouisfed.org/', 'date': (upto(src.get('fed_u', []), us) or [(us, 0)])[-1][0]},
                       'B': {'title': '한국은행 기준금리 변동 추이', 'url': BOK_URL, 'date': (src.get('bok') or [(us, 0)])[0][0]}}
    json.dump(rep, open(MACRO_PATH, 'w', encoding='utf-8', newline='\n'), ensure_ascii=False, indent=1)
    WARN.extend('매크로 타일 ' + w for w in warn)
    log(f'macro: 타일 {len(tiles)}/10 갱신 ({us} 기준)' + (' · 경고: ' + ' / '.join(warn) if warn else ''))
    for t in tiles: log(f"  {t['k']}: {t['v']} · {t['d']}")
    return tiles

def step_build():
    run([PY, 'build.py'], cwd=APP)

def step_verify():
    """빌드 결과를 헤드리스 크롬으로 열어 확인: 오류 0건, 월배당 계산값, 종목 수(마지막 커밋의 90% 이상), 환율 반영"""
    from playwright.sync_api import sync_playwright
    meta = read_json(META_PATH)
    prev = json.loads(git('show', 'HEAD:app/data/meta.json', check=False) or 'null')
    bad = count_gate((prev or {}).get('counts'), meta['counts']) + count_gate((prev or {}).get('div_counts'), meta.get('div_counts', {}))
    errs = []
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 1000})
        pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        pg.on('console', lambda m: errs.append(f'CONSOLE {m.type} {m.text}') if m.type in ('error', 'warning') else None)
        pg.goto(pathlib.Path(ROOT, 'index.html').as_uri()); pg.wait_for_function('() => !!window.__divsim', timeout=60000); pg.wait_for_timeout(500)
        r = pg.evaluate("() => { const d = window.__divsim, M = d.metrics(); return { m: M ? M.m : null, n: d.DB_IDX.size, fx: d.FX0, search: d.searchStocks('두산').length }; }")
        b.close()
    if errs: bad.append('페이지 오류 ' + ' | '.join(errs[:3]))
    if not (r['m'] and r['m'] > 0): bad.append(f"월배당 계산값 이상 {r['m']}")
    if r['fx'] != meta['fx']: bad.append(f"환율 미반영 (페이지 {r['fx']} ≠ meta {meta['fx']})")
    if r['n'] != sum(meta['counts'].values()): bad.append(f"종목 수 불일치 (페이지 {r['n']} ≠ meta {sum(meta['counts'].values())})")
    if not r['search']: bad.append("검색 결과 없음('두산')")
    if bad: raise RuntimeError('검증 실패: ' + ' / '.join(bad))
    log(f"검증 통과: 기본 구성 20년 후 세후 월배당 {r['m']:,.0f}원 · 종목 {r['n']:,}개 · 원/달러 {r['fx']}")
    return r

def step_commit(meta):
    """index.html·db.js·DB·meta·매크로 타일만 커밋. --push면 origin main으로 (거절되면 원격 변경을 받아 한 번 더)"""
    git('add', '--', 'index.html', 'db.js', 'app/data/stock_db_full.js', 'app/data/meta.json', 'app/src/macro_report.json')
    if subprocess.run(['git', 'diff', '--cached', '--quiet'], cwd=ROOT).returncode == 0:
        log('커밋할 변경 없음'); return None
    msg = f"data: 국내 {meta['asof']['KR']} · 미국 {meta['asof']['US']} 종가 자동 갱신"
    git('commit', '-q', '-m', msg)
    sha = git('rev-parse', '--short', 'HEAD'); log('커밋', sha, msg)
    if ARGS.push:
        for t in range(2):
            p = subprocess.run(['git', 'push', '-q', 'origin', 'HEAD:main'], cwd=ROOT, env=ENV, capture_output=True, text=True, errors='replace')
            if p.returncode == 0: log('푸시 완료 → origin/main'); return sha
            log('푸시 거절, 원격 변경을 받아 다시 시도:', p.stderr.strip()[-300:])
            if subprocess.run(['git', 'pull', '--rebase', '-q', 'origin', 'main'], cwd=ROOT, env=ENV).returncode:
                git('rebase', '--abort', check=False); raise RuntimeError('원격 변경과 충돌해 푸시하지 못함 (다음 실행에서 다시 생성)')
        raise RuntimeError('푸시 실패')
    return sha

def summary(lines):
    log('\n'.join(['── 요약 ──'] + lines))
    gh = os.environ.get('GITHUB_STEP_SUMMARY')
    if gh: open(gh, 'a', encoding='utf-8').write('\n'.join(f'- {l}' for l in lines) + '\n')

def stale_notes(meta):
    """사람이 관리하는 콘텐츠(매크로 분석 글·종목 리포트)가 가격 데이터보다 일주일 넘게 오래되면 알림"""
    out = []
    for name, path, getter in (('매크로 브리핑 분석 글(app/src/macro_report.json)', 'macro_report.json', lambda j: j['asof']),
                               ('종목 리포트·매크로 사실(app/src/research.json)', 'research.json', lambda j: j['macro']['us']['asof'])):
        try: asof = getter(read_json(os.path.join(APP, 'src', path)))
        except Exception: continue
        age = days_between(asof, meta['asof']['US'])
        if age > 7: out.append(f'⚠ {name}은 {asof} 기준으로 가격 데이터보다 {age}일 오래됨 — 갱신 권장')
    return out

def main():
    global LOGF
    LOGF = open(os.path.join(D, 'refresh.log'), 'a', encoding='utf-8')
    steps = [s.strip() for s in ARGS.steps.split(',') if s.strip()] or STEPS
    unknown = [s for s in steps if s not in STEPS]
    if unknown: sys.exit(f"알 수 없는 단계 {unknown} — 가능한 값: {','.join(STEPS)}")
    t0 = time.time(); old = read_json(META_PATH) or {}
    log(f"=== 갱신 시작 {' → '.join(steps)}{' (force)' if ARGS.force else ''}{' (push)' if ARGS.push else ''}")
    head = [f"이전 데이터: 국내 {old.get('asof', {}).get('KR', '—')} · 미국 {old.get('asof', {}).get('US', '—')}"]
    try:
        if 'db' in steps:
            asof = step_db()
            if not ARGS.force and not is_newer(asof, old.get('asof')):
                summary(head + [f"변동 없음: 국내 {asof['KR']} · 미국 {asof['US']} 데이터가 이미 반영돼 있어 종료 ({time.time() - t0:.0f}초)"]); return
        if 'etf' in steps: step_etf()
        if 'div' in steps: step_div()
        if 'merge' in steps: step_merge()
        meta = step_meta() if 'meta' in steps else read_json(META_PATH)
        mt = step_macro() if 'macro' in steps else None
        if 'build' in steps: step_build()
        r = step_verify() if 'verify' in steps else None
        sha = step_commit(meta) if 'commit' in steps else None
    except Exception as e:
        log(traceback.format_exc()); summary(head + [f'**실패**: {e}']); sys.exit(1)
    lines = head + [f"새 데이터: 국내 {meta['asof']['KR']} · 미국 {meta['asof']['US']} · 원/달러 {meta['fx']:,}원({meta['fx_date']}, {meta['fx_src']}) · 코스피 {meta['kospi']:,} · 코스닥 {meta['kosdaq']:,}",
                   '종목 수: ' + ', '.join(f'{k} {v:,}' for k, v in meta['counts'].items()) + (f" · 배당 정보 있는 주식 국내 {meta['div_counts']['kr']:,}·미국 {meta['div_counts']['us']:,}" if meta.get('div_counts') else '')]
    if mt is not None: lines.append(f"매크로 타일 {len(mt)}/10 자동 갱신 ({meta['asof']['US']} 기준): " + ', '.join(f"{t['k']} {t['v']}" for t in mt))
    if r: lines.append(f"검증 통과: 기본 구성 20년 후 세후 월배당 {r['m']:,.0f}원, 페이지 오류 0건")
    lines += ['⚠ ' + w for w in WARN] + stale_notes(meta)
    if 'commit' in steps: lines.append((f'커밋 {sha}' + (' · origin/main 푸시 완료' if ARGS.push else ' (푸시 안 함)')) if sha else '커밋 없음')
    lines.append(f'소요 {time.time() - t0:.0f}초')
    summary(lines)

ap = argparse.ArgumentParser(description='월배당 포트폴리오 시뮬레이터 데이터 자동 갱신')
ap.add_argument('--steps', default='', help='실행할 단계(쉼표): ' + ','.join(STEPS))
ap.add_argument('--force', action='store_true', help='데이터 날짜가 같아도 끝까지 실행')
ap.add_argument('--push', action='store_true', help='커밋 뒤 origin main으로 푸시')
ARGS = ap.parse_args() if __name__ == '__main__' else ap.parse_args([])
if __name__ == '__main__':
    main()
