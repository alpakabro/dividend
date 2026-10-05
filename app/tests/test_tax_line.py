# 세금 경계선 타일 확인 (빌드된 index.html). 출력이 'OK'로 끝나면 정상
import os, pathlib
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 1000})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(pathlib.Path(ROOT, 'index.html').as_uri()); pg.wait_for_function('() => window.__divsim && window.__divsim.DB_IDX.size > 0')
    # 미국만 / 국내만 구성: 연간 세전 배당(recvG)과 미국분(recvGus)의 관계
    r = pg.evaluate("""() => { const d = window.__divsim, a = Object.assign({}, d.state.a, { monthly: 500, years: 20, tax: 'normal' });
      const us = d.simulate(d.portOf({ 'ADP': 100 }, []), a), kr = d.simulate(d.portOf({ 'KTG': 100 }, []), a);
      return { us1: us.yrs[0].recvG, usU: us.yrs[0].recvGus, kr1: kr.yrs[0].recvG, krU: kr.yrs[0].recvGus }; }""")
    assert r['us1'] > 0 and abs(r['usU'] - r['us1']) < 1e-6 and r['kr1'] > 0 and r['krU'] == 0, r
    print('recvGus ok', r)
    # 타일: 월 500만원이면 40년 안에 2,000만원을 넘는 연차가 나와야 함
    tile = pg.evaluate("""() => { const d = window.__divsim; d.state.sel = { 'KTG': 50, 'ADP': 50 }; d.state.hold = []; d.state.a.monthly = 500; d.state.a.tax = 'normal'; d.commit();
      const t = document.getElementById('taxTile'); return t ? t.innerText : null; }""")
    assert tile and '세금 경계선' in tile and '년차 2,000만원 초과' in tile and '1,000만원 초과' in tile, tile
    print('tile:', tile.replace('\n', ' | '))
    # ISA 계좌: 국내분 제외 → 넘는 연차가 같거나 늦어진다
    tile2 = pg.evaluate("() => { const d = window.__divsim; d.state.a.tax = 'isa'; d.commit(); return document.getElementById('taxTile').innerText; }")
    assert 'ISA 밖 미국 배당만' in tile2, tile2
    y1 = int(tile.split('년차')[0].split()[-1]); y2 = int(tile2.split('년차')[0].split()[-1]) if '년차 2,000' in tile2 else 999
    assert y2 >= y1, (y1, y2)
    print('isa:', tile2.split('\n')[1])
    print('errors', errs); assert not errs
    b.close(); print('OK')
