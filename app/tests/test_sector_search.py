# 조회 창 섹터별 탐색 확인 (빌드된 index.html). 출력이 'OK'로 끝나면 정상
import os, pathlib
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 1000})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(pathlib.Path(ROOT, 'index.html').as_uri()); pg.wait_for_function('() => window.__divsim && window.__divsim.DB_IDX.size > 0')
    pg.evaluate("() => window.__divsim.openSearch('')"); pg.wait_for_timeout(300)
    opts = pg.evaluate("() => [...document.querySelectorAll('#mdSector option')].map(o => o.textContent)")
    print('sector options:', len(opts), opts[:8])
    assert len(opts) > 10 and any(o.startswith('금융') for o in opts) and any(o.startswith('ETF(') for o in opts), opts
    # 1) 섹터만 고르면 그 섹터 전체가 시가총액순으로
    pg.select_option('#mdSector', '금융'); pg.wait_for_timeout(400)
    r = pg.evaluate("() => ({ count: document.querySelector('#mdList .md-count').textContent, items: [...document.querySelectorAll('#mdList .ritem .m')].slice(0, 120).map(e => e.textContent), n: window.__divsim.searchStocks ? null : null })")
    print('금융:', r['count'], '| first:', r['items'][:2])
    assert '금융' in r['count'] and len(r['items']) >= 50 and all('금융' in m for m in r['items']), r['count']
    # 2) 국내만
    pg.click('#mdMkt button[data-v="KR"]'); pg.wait_for_timeout(400)
    kr = pg.evaluate("() => document.querySelector('#mdList .md-count').textContent"); print('금융·국내:', kr); assert '국내' in kr
    pg.click('#mdMkt button[data-v="all"]'); pg.wait_for_timeout(300)
    # 3) 검색어로 섹터명을 쳐도 됨 (헬스케어) · 섹터 상자는 전체로
    pg.select_option('#mdSector', 'all'); pg.fill('#mdQ', '헬스케어'); pg.press('#mdQ', 'Enter'); pg.wait_for_timeout(500)
    hc = pg.evaluate("() => ({ count: document.querySelector('#mdList .md-count').textContent, items: [...document.querySelectorAll('#mdList .ritem')].slice(0, 80).map(e => e.textContent) })")
    hit = sum('헬스케어' in m for m in hc['items']); print('헬스케어 검색:', hc['count'], f'| 섹터·이름에 포함 {hit}/{len(hc["items"])}')
    assert len(hc['items']) >= 30 and hit >= 0.8 * len(hc['items']), [m for m in hc['items'] if '헬스케어' not in m][:3]   # ETF는 이름·유형으로 걸림
    # 4) 검색어 + 섹터: '삼성'을 IT로 거르면 삼성전자류만
    pg.fill('#mdQ', '삼성'); pg.press('#mdQ', 'Enter'); pg.wait_for_timeout(400); n_all = pg.evaluate("() => document.querySelectorAll('#mdList .ritem').length")
    pg.select_option('#mdSector', 'IT'); pg.wait_for_timeout(400)
    it = pg.evaluate("() => ({ n: document.querySelectorAll('#mdList .ritem').length, names: [...document.querySelectorAll('#mdList .ritem .n')].map(e => e.textContent) })")
    print('삼성 전체', n_all, '→ IT만', it['n'], it['names'][:4]); assert 0 < it['n'] < n_all and any('삼성전자' in x for x in it['names']), it
    # 5) 다시 열면 섹터 필터는 초기화
    pg.keyboard.press('Escape'); pg.evaluate("() => window.__divsim.openSearch('')"); pg.wait_for_timeout(200)
    assert pg.evaluate("() => document.getElementById('mdSector').value") == 'all'
    print('errors', errs); assert not errs
    b.close(); print('OK')
