# 후원 버튼·광고 자리·개인정보 안내 확인 (빌드된 index.html). 출력이 'OK'로 끝나면 정상
import os, pathlib
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 1000})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(pathlib.Path(ROOT, 'index.html').as_uri()); pg.wait_for_function('() => window.__divsim && window.__divsim.DB_IDX.size > 0')
    st = pg.evaluate("() => ({ donate: document.getElementById('btnDonate').hidden, ad: document.getElementById('adBox').hidden, site: window.SITE, privacy: document.querySelectorAll('#privacyCard li').length })")
    print('default:', st)
    assert st['donate'] is True and st['ad'] is True and st['privacy'] == 4, st             # 값이 비어 있으면 숨김
    r = pg.evaluate("() => { const d = window.__divsim; const on = d.applySite({ donate: { url: 'https://example.com/coffee', label: '☕ 테스트 후원' }, adsense: { client: 'ca-pub-1', slot: '2' } }); const b = document.getElementById('btnDonate'); return { on, hidden: b.hidden, href: b.href, text: b.textContent, adHidden: document.getElementById('adBox').hidden }; }")
    print('with values:', r)
    assert r['hidden'] is False and r['href'] == 'https://example.com/coffee' and r['text'] == '☕ 테스트 후원', r
    assert r['on'] is False and r['adHidden'] is True, r                                      # file:// 에서는 광고 없음
    print('errors', errs); assert not errs
    b.close(); print('OK')
