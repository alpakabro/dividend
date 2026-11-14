# 종목 분석기 화면 확인 (빌드된 index.html). 출력이 'errors []'와 'OK'로 끝나면 정상
import os, pathlib, time
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'app', 'tests', 'out'); os.makedirs(OUT, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 1000})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(pathlib.Path(ROOT, 'index.html').as_uri()); pg.wait_for_function('() => window.__divsim && window.__divsim.DB_IDX.size > 0')
    t = time.time(); pg.click('#btnScreen'); pg.wait_for_selector('#viewScreen .sc-row'); print('open sec:', round(time.time() - t, 2))
    rows = lambda: pg.evaluate("() => [...document.querySelectorAll('#viewScreen .sc-row')].slice(0, 8).map(r => r.innerText.replace(/\\s+/g, ' '))")
    print('themes:', pg.evaluate("() => [...document.querySelectorAll('.sc-theme')].map(e => e.innerText.replace(/\\n/g, ' / '))"))
    print('title:', pg.inner_text('#viewScreen .card:last-of-type h2')); [print(' ', r) for r in rows()]
    assert pg.evaluate("() => document.querySelector('#viewMain').hidden && !document.querySelector('#viewScreen').hidden")
    pg.click('#viewScreen .sc-row'); pg.wait_for_selector('.sc-det'); print('detail:', pg.inner_text('.sc-det'))
    pg.screenshot(path=os.path.join(OUT, 'screen_kr.png'), full_page=False)
    pg.click('.sc-det button'); pg.wait_for_timeout(600); print('modal open:', pg.evaluate("() => !document.querySelector('#modal').hidden")); assert pg.evaluate("() => !document.querySelector('#modal').hidden")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    for lab in ['미국', 'ETF', '대형']:
        pg.click(f'#viewScreen .seg button:text-is("{lab}")'); pg.wait_for_timeout(300)
        print(lab, '→', pg.inner_text('#viewScreen .card:last-of-type h2'), '|', (rows() or ['-'])[0])
    pg.click('#viewScreen .seg button:text-is("주식")'); pg.click('.sc-theme'); pg.wait_for_timeout(300)
    print('theme filter →', pg.inner_text('#viewScreen .card:last-of-type h2'))
    pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(300)
    print('mobile overflow px:', pg.evaluate("() => document.documentElement.scrollWidth - innerWidth"))
    pg.screenshot(path=os.path.join(OUT, 'screen_mobile.png'))
    pg.click('#viewScreen .pa-top .btn'); pg.wait_for_timeout(300)
    assert pg.evaluate("() => !document.querySelector('#viewMain').hidden && document.querySelector('#viewScreen').hidden")
    print('errors', errs); assert not errs; print('OK'); b.close()
