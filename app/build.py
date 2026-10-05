# 앱 조립: app_src.html + src/*.js + 리서치·매크로 JSON + 종목 DB → 한 개의 HTML
#   python app/build.py          → ../index.html (GitHub Pages 사이트) + dist/artifact.html (Claude 아티팩트용 조각)
#   python app/build.py --nodb   → 종목 DB 없이 빠르게(화면 확인용, 사이트 파일은 덮어쓰지 않음)
import json, os, re, sys

D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(D)
os.chdir(D)

DATA_MODS = ['data.js']                     # app_src.html의 /*__DATA_MODULES__*/ 자리 (RAW 정의 직후)
UI_MODS = ['ui_core.js', 'tech.js', 'detail.js', 'ai.js', 'pa.js', 'macro.js', 'advisor.js']   # /*__UI_MODULES__*/ 자리, 이 순서로 한 스크립트에 이어 붙임

def mod(name):
    return open(os.path.join('src', name), encoding='utf-8').read()

src = open('app_src.html', encoding='utf-8').read()
assert '/*__DATA_MODULES__*/' in src and '/*__UI_MODULES__*/' in src and '<!--__PAYLOAD__-->' in src
src = src.replace('/*__DATA_MODULES__*/', '\n'.join(mod(m) for m in DATA_MODS))
src = src.replace('/*__UI_MODULES__*/', '\n'.join(mod(m) for m in UI_MODS))

nodb = '--nodb' in sys.argv
research = open('src/research.json', encoding='utf-8').read()
macro = json.dumps(json.load(open('src/macro_report.json', encoding='utf-8')), ensure_ascii=False, separators=(',', ':'))
db = 'window.STOCK_DB={"asof":{},"ax":{},"s":[],"idx":{}};' if nodb else open('data/stock_db_full.js', encoding='utf-8').read().strip()
payload = ('<script>' + db + '</script>\n'
           '<script>window.RESEARCH=' + research.replace('</', '<\\/') + ';</script>\n'
           '<script>window.MACRO=' + macro.replace('</', '<\\/') + ';</script>\n')
src = src.replace('<!--__PAYLOAD__-->', payload)

os.makedirs('dist', exist_ok=True)
if nodb:
    open('dist/preview_nodb.html', 'w', encoding='utf-8').write(src)
    print('wrote dist/preview_nodb.html (DB 없음)'); sys.exit(0)

# 1) 공개 사이트(GitHub Pages): 완전한 문서 + 검색엔진 노출 차단
site = src.replace('<meta name="viewport" content="width=device-width, initial-scale=1">',
                   '<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="robots" content="noindex, nofollow">', 1)
assert 'noindex' in site
open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8').write(site)
print('wrote index.html', round(len(site.encode('utf-8')) / 1e6, 2), 'MB')

# 2) Claude 아티팩트: 문서 골격(doctype/html/head/body)은 게시 때 씌워지므로 <title>부터 시작하는 조각만
m_head = re.search(r'<head>(.*?)</head>', src, re.S); m_body = re.search(r'<body>(.*)</body>', src, re.S)
head = re.sub(r'<meta charset="utf-8">\s*|<meta name="viewport"[^>]*>\s*', '', m_head.group(1)).strip()
frag = head + '\n' + m_body.group(1).strip() + '\n'
assert frag.lstrip().startswith('<title>')
open('dist/artifact.html', 'w', encoding='utf-8').write(frag)
print('wrote app/dist/artifact.html', round(len(frag.encode('utf-8')) / 1e6, 2), 'MB')
