# 데이터 자동 갱신: DB 생성 → (새 데이터일 때만) ETF 수집 → ETF 병합 → 메타(환율·지수·종목 수) → 빌드 → 검증 → 커밋
#   python pipeline/refresh.py                              # 전체 실행. 데이터 날짜가 그대로면 '변동 없음'으로 끝남
#   python pipeline/refresh.py --steps meta,build,verify    # 일부 단계만 (쉼표: db etf merge meta build verify commit)
#   python pipeline/refresh.py --force                      # 날짜가 같아도 끝까지 실행
#   python pipeline/refresh.py --push                       # 커밋 뒤 origin main에 푸시 (GitHub Actions가 쓰는 옵션)
# 기록: pipeline/refresh.log. GitHub Actions에서는 실행 요약도 남긴다($GITHUB_STEP_SUMMARY).
# 검증에 실패하면 커밋하지 않는다. 종료 코드 1 = 실패(Actions가 이메일로 알림).
import argparse, datetime as dt, json, os, pathlib, shutil, subprocess, sys, time, traceback

D = os.path.dirname(os.path.abspath(__file__))        # pipeline/
ROOT = os.path.dirname(D)
APP = os.path.join(ROOT, 'app')
sys.path.insert(0, APP)
from build import ko_date, short_date, start_of     # 날짜 표기 도우미(빌드와 공유)

META_PATH = os.path.join(APP, 'data', 'meta.json')
DB_FULL = os.path.join(APP, 'data', 'stock_db_full.js')
DB_RAW = os.path.join(D, 'stock_db.js')
RAW = os.path.join(D, 'raw_etf')
STEPS = ['db', 'etf', 'merge', 'meta', 'build', 'verify', 'commit']
PY = sys.executable
ENV = {**os.environ, 'PYTHONUTF8': '1', 'PYTHONIOENCODING': 'utf-8'}
YF = {'fx': 'KRW=X', 'kospi': '^KS11', 'kosdaq': '^KQ11'}     # 야후 파이낸스 심볼
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# ── 순수 함수 (pipeline/test_refresh.py에서 점검) ──
def fx_range(closes):
    """[(YYYY-MM-DD, 종가)] → 연중 고·저와 그 날짜(월/일)"""
    md = lambda s: f'{int(s[5:7])}/{int(s[8:10])}'
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

def step_merge():
    """ETF를 DB에 병합 → app/data/stock_db_full.js"""
    run([PY, 'add_etf.py'], cwd=D)

def step_meta():
    """환율·지수·종목 수 → app/data/meta.json (가격 데이터 날짜 기준, 출처: 야후 파이낸스)"""
    db = load_db(DB_FULL); kr, us = db['asof']['KR'], db['asof']['US']
    old = read_json(META_PATH) or {}
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
            'counts': counts_of(db), 'us_etf_universe': us_all.get('symbols', old.get('us_etf_universe', 0)),
            'updated': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}
    json.dump(meta, open(META_PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    log(f"meta: 국내 {kr} · 미국 {us} · 원/달러 {meta['fx']} ({fx_date}) · 연중 {meta['fx_range']} · 코스피 {idx['kospi']} · 코스닥 {idx['kosdaq']} · 종목 {meta['counts']}")
    return meta

def step_build():
    run([PY, 'build.py'], cwd=APP)

def step_verify():
    """빌드 결과를 헤드리스 크롬으로 열어 확인: 오류 0건, 월배당 계산값, 종목 수(마지막 커밋의 90% 이상), 환율 반영"""
    from playwright.sync_api import sync_playwright
    meta = read_json(META_PATH)
    prev = json.loads(git('show', 'HEAD:app/data/meta.json', check=False) or 'null')
    bad = count_gate((prev or {}).get('counts'), meta['counts'])
    errs = []
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 1000})
        pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        pg.on('console', lambda m: errs.append(f'CONSOLE {m.type} {m.text}') if m.type in ('error', 'warning') else None)
        pg.goto(pathlib.Path(ROOT, 'index.html').as_uri()); pg.wait_for_timeout(1500)
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
    """index.html·DB·meta만 커밋. --push면 origin main으로 (거절되면 원격 변경을 받아 한 번 더)"""
    git('add', '--', 'index.html', 'app/data/stock_db_full.js', 'app/data/meta.json')
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
    """사람이 관리하는 콘텐츠(매크로 브리핑·종목 리포트)가 가격 데이터보다 일주일 넘게 오래되면 알림"""
    out = []
    for name, path, getter in (('매크로 브리핑(app/src/macro_report.json)', 'macro_report.json', lambda j: j['asof']),
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
        if 'merge' in steps: step_merge()
        meta = step_meta() if 'meta' in steps else read_json(META_PATH)
        if 'build' in steps: step_build()
        r = step_verify() if 'verify' in steps else None
        sha = step_commit(meta) if 'commit' in steps else None
    except Exception as e:
        log(traceback.format_exc()); summary(head + [f'**실패**: {e}']); sys.exit(1)
    lines = head + [f"새 데이터: 국내 {meta['asof']['KR']} · 미국 {meta['asof']['US']} · 원/달러 {meta['fx']:,}원({meta['fx_date']}, {meta['fx_src']}) · 코스피 {meta['kospi']:,} · 코스닥 {meta['kosdaq']:,}",
                   '종목 수: ' + ', '.join(f'{k} {v:,}' for k, v in meta['counts'].items())]
    if r: lines.append(f"검증 통과: 기본 구성 20년 후 세후 월배당 {r['m']:,.0f}원, 페이지 오류 0건")
    lines += stale_notes(meta)
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
