# 매크로 브리핑 자동 생성 글 확인 (빌드된 index.html): 배지·머리말·주목 지표 3개·①~⑦·시나리오·업종 표, 수동 출처(U/K)·일정표 없음. 출력이 'OK'로 끝나면 정상
import os, pathlib
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 1000})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(pathlib.Path(ROOT, 'index.html').as_uri()); pg.wait_for_function('() => window.__divsim && window.__divsim.DB_IDX.size > 0')
    if pg.locator('#macro .macro-h .fold').inner_text().startswith('펼치기'): pg.click('#macro .macro-h .fold'); pg.wait_for_timeout(200)
    badge = pg.inner_text('#macro .macro-h .badge'); lead = pg.inner_text('#macro .macro-lead')
    print('badge:', badge); print('lead:', lead[:120])
    assert '자동 생성' in badge and '분석 ' not in badge and len(lead) > 40 and '-' not in lead, (badge, lead)   # 음수는 ▲
    k3 = pg.locator('#macro .key3 .kc').all_inner_texts(); print('key3:', [k.split('\n')[0] for k in k3]); assert len(k3) == 3 and all('주목할 지표' in k for k in k3)
    pg.click('#macro .macro-h button:has-text("전체 분석 보기")'); pg.wait_for_timeout(700)
    titles = pg.locator('#macro .msec h3').all_inner_texts(); print('sections:', titles)
    assert [t[0] for t in titles[:7]] == ['①', '②', '③', '④', '⑤', '⑥', '⑦'] and not any('주요 일정' in t for t in titles), titles
    assert pg.locator('#macro .scen3 .sc').count() == 3 and pg.locator('#macro .msec table tbody tr').count() == 3
    cites = sorted(set(pg.locator('#macro sup.cite a').all_inner_texts())); print('cites:', cites)
    assert cites and all(c in ('[Y]', '[F]', '[B]', '[DB]') for c in cites), cites
    body = pg.inner_text('#macro'); assert '[사실]' in body and '[해석]' in body and '전망·뉴스 아님' in body
    src = pg.inner_text('#macroSrc summary'); print('sources:', src); assert 'U:' not in src and 'Y·F·B' in src
    print('errors', errs); assert not errs
    b.close(); print('OK')
