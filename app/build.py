# 앱 조립: app_src.html + src/*.js + 리서치·매크로 JSON + 종목 DB + meta → 한 개의 HTML
#   python app/build.py          → ../index.html + ../db.js (GitHub Pages 사이트: 종목 DB는 별도 파일, index.html이 db.js?v=해시 로 불러옴) + dist/artifact.html (Claude 아티팩트용 조각, DB 인라인)
#   python app/build.py --nodb   → 종목 DB 없이 빠르게(화면 확인용, 사이트 파일은 덮어쓰지 않음)
# 문구 속 날짜·환율·종목 수는 data/meta.json(pipeline/refresh.py가 갱신)으로 채운다: app_src.html의 {{KR_D}} 같은 자리표시자
import hashlib, json, os, re, sys

D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(D)

DATA_MODS = ['data.js']                     # app_src.html의 /*__DATA_MODULES__*/ 자리 (RAW 정의 직후)
UI_MODS = ['ui_core.js', 'tech.js', 'detail.js', 'ai.js', 'pa.js', 'macro.js', 'advisor.js']   # /*__UI_MODULES__*/ 자리, 이 순서로 한 스크립트에 이어 붙임

# ── 날짜 표기 (refresh.py와 공유) ──
def ko_date(s):                 # '2026-10-01' → '2026.10.1' (화면의 dateKo와 같은 형식)
    y, m, d = s.split('-'); return f'{y}.{int(m)}.{int(d)}'
def short_date(s, ref):         # 기준 날짜와 같은 해면 '10.2', 다르면 '2027.1.5'
    return f'{int(s[5:7])}.{int(s[8:10])}' if s[:4] == ref[:4] else ko_date(s)
def start_of(us_asof):          # 첫 적립 (연, 월) = 미국 데이터 날짜의 다음 달
    y, m = int(us_asof[:4]), int(us_asof[5:7])
    return (y + 1, 1) if m == 12 else (y, m + 1)

def fill(src, meta):
    """app_src.html의 {{이름}} 자리표시자를 meta 값으로 채움. 모르는 이름이면 KeyError"""
    a, c = meta['asof'], meta['counts']; sy, sm = start_of(a['US'])
    V = {'KR_D': lambda: ko_date(a['KR']), 'KR_DS': lambda: short_date(a['KR'], a['KR']),
         'US_D': lambda: ko_date(a['US']), 'US_DS': lambda: short_date(a['US'], a['KR']),
         'FX': lambda: f"{meta['fx']:,.1f}", 'FX_DS': lambda: short_date(meta['fx_date'], a['KR']),
         'FX_SRC': lambda: meta['fx_src'], 'FX_URL': lambda: meta['fx_url'], 'IDX_SRC': lambda: meta['idx_src'],
         'START': lambda: f'{sy}년 {sm}월', 'AS_Y': lambda: a['US'][:4], 'AS_M': lambda: str(int(a['US'][5:7])),
         'N_ALL': lambda: f'{sum(c.values()) // 1000 * 1000:,}여 개',
         'N_KR_STK': lambda: f"{c['kr_stk']:,}", 'N_KR_ETF': lambda: f"{c['kr_etf']:,}",
         'N_US_STK': lambda: f"{c['us_stk']:,}", 'N_US_ETF': lambda: f"{c['us_etf']:,}", 'N_US_ETF_UNI': lambda: f"{meta['us_etf_universe']:,}",
         'N_KR_DIV': lambda: f"{meta.get('div_counts', {}).get('kr', 0):,}", 'N_US_DIV': lambda: f"{meta.get('div_counts', {}).get('us', 0):,}"}
    return re.sub(r'\{\{(\w+)\}\}', lambda m: V[m.group(1)](), src)

def mod(name):
    return open(os.path.join(D, 'src', name), encoding='utf-8').read()

def main():
    os.chdir(D)
    nodb = '--nodb' in sys.argv
    meta = json.load(open('data/meta.json', encoding='utf-8'))
    src = open('app_src.html', encoding='utf-8').read()
    assert '/*__DATA_MODULES__*/' in src and '/*__UI_MODULES__*/' in src and '<!--__PAYLOAD__-->' in src
    src = fill(src, meta)
    src = src.replace('/*__DATA_MODULES__*/', '\n'.join(mod(m) for m in DATA_MODS))
    src = src.replace('/*__UI_MODULES__*/', '\n'.join(mod(m) for m in UI_MODS))

    research = open('src/research.json', encoding='utf-8').read()
    macro = json.dumps(json.load(open('src/macro_report.json', encoding='utf-8')), ensure_ascii=False, separators=(',', ':'))
    db = 'window.STOCK_DB={"asof":{},"ax":{},"s":[],"idx":{}};' if nodb else open('data/stock_db_full.js', encoding='utf-8').read().strip()
    esc = lambda s: s.replace('</', '<\\/')     # <script> 안의 JSON이 태그를 닫지 못하게
    payload = lambda dbtag: ('<script>window.META=' + esc(json.dumps(meta, ensure_ascii=False, separators=(',', ':'))) + ';</script>\n'
                            + dbtag + '<script>window.RESEARCH=' + esc(research) + ';</script>\n'
                            '<script>window.MACRO=' + esc(macro) + ';</script>\n')
    inline = src.replace('<!--__PAYLOAD__-->', payload('<script>' + db + '</script>\n'))          # 아티팩트·미리보기: 한 파일
    ver = hashlib.sha1(db.encode('utf-8')).hexdigest()[:10]                                        # 데이터가 바뀌면 주소가 바뀌어 캐시가 새로 받음
    site_src = src.replace('<!--__PAYLOAD__-->', payload(f'<script src="db.js?v={ver}"></script>\n'))   # 사이트: DB 분리
    src = inline

    os.makedirs('dist', exist_ok=True)
    if nodb:
        open('dist/preview_nodb.html', 'w', encoding='utf-8').write(src)
        print('wrote dist/preview_nodb.html (DB 없음)'); return

    # 1) 공개 사이트(GitHub Pages): 완전한 문서 + 검색엔진 노출 차단
    site = site_src.replace('<meta name="viewport" content="width=device-width, initial-scale=1">',
                            '<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="robots" content="noindex, nofollow">\n'
                            f'<link rel="preload" href="db.js?v={ver}" as="script">', 1)   # 머리말 그리는 동안 DB 내려받기 시작
    assert 'noindex' in site
    open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8').write(site)
    open(os.path.join(ROOT, 'db.js'), 'w', encoding='utf-8').write(db + '\n')
    print('wrote index.html', round(len(site.encode('utf-8')) / 1e6, 2), 'MB + db.js', round(len(db.encode('utf-8')) / 1e6, 2), 'MB (v=' + ver + ')')

    # 2) Claude 아티팩트: 문서 골격(doctype/html/head/body)은 게시 때 씌워지므로 <title>부터 시작하는 조각만
    m_head = re.search(r'<head>(.*?)</head>', src, re.S); m_body = re.search(r'<body>(.*)</body>', src, re.S)
    head = re.sub(r'<meta charset="utf-8">\s*|<meta name="viewport"[^>]*>\s*', '', m_head.group(1)).strip()
    frag = head + '\n' + m_body.group(1).strip() + '\n'
    assert frag.lstrip().startswith('<title>')
    open('dist/artifact.html', 'w', encoding='utf-8').write(frag)
    print('wrote app/dist/artifact.html', round(len(frag.encode('utf-8')) / 1e6, 2), 'MB')

if __name__ == '__main__':
    main()
