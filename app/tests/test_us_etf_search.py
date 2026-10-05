import asyncio, time
from playwright.async_api import async_playwright
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = 'file://' + os.path.join(ROOT, 'index.html')   # 빌드된 사이트 파일로 테스트
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out') + '/'
os.makedirs(D, exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page(viewport={'width':1400,'height':1000})
        pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        t0 = time.time(); await pg.goto(P); await pg.wait_for_load_state('load'); t1 = time.time()
        await pg.wait_for_timeout(800)
        print('load s', round(t1 - t0, 2))
        await pg.evaluate("() => { try { localStorage.clear() } catch(e){} }"); await pg.reload(); await pg.wait_for_timeout(1500)
        ms = await pg.evaluate("() => { const t = performance.now(); window.__divsim.searchStocks('a'); const t2 = performance.now(); window.__divsim.searchStocks('dram'); return [Math.round(t2 - t), Math.round(performance.now() - t2)] }")
        print('search ms (first incl. index, second)', ms)
        for q in ['dram', 'DRAM', 'Roundhill Memory', '메모리', 'SOXL', 'JEPI', 'ETF']:
            r = await pg.evaluate("q => window.__divsim.searchStocks(q).slice(0,4).map(x => x.name + ' ' + x.code + (x.rec ? ' [' + x.rec[0] + '/' + x.rec[4] + ']' : ''))", q)
            print(f'{q} → {r}')
        for q in ['dram 어때?', 'DRAM 계속 들고 가도 돼?', '나 dram 가지고 있는데 더 사도 될까?', 'soxl 위험해?']:
            r = await pg.evaluate("q => { const its = window.__divsim.advFindStocks(q); return its.map(x => x.name + '(' + x.code + ')') }", q)
            print(f'  adv {q} → {r}')
        # 보유 종목 찾기로 DRAM 추가
        await pg.fill('#holdQ', 'dram'); await pg.press('#holdQ', 'Enter'); await pg.wait_for_timeout(600)
        print('modal list:', (await pg.locator('#mdList').inner_text())[:160].replace('\n', ' | '))
        await pg.locator('#mdList button').first.click(); await pg.wait_for_timeout(800)
        det = await pg.locator('#mdDetail').inner_text()
        print('detail:', det[:150].replace('\n', ' | '))
        i = det.find('배당'); print('div card:', det[i:i+150].replace('\n', ' | '))
        await pg.locator('#mdDetail').screenshot(path=D + 'shot_dram_detail.png')
        await pg.locator('#mdDetail button:has-text("보유 종목에 추가")').first.click(); await pg.wait_for_timeout(150)
        await pg.locator('#mdDetail input[aria-label="보유 주 수"]').first.fill('20')
        await pg.locator('#mdDetail input[aria-label="평균 매수가"]').first.fill('55')
        await pg.locator('#mdDetail .dt-form button:has-text("추가")').first.click(); await pg.wait_for_timeout(400)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        print('hold:', await pg.evaluate("() => [...document.querySelectorAll('#holdBody tr')].map(tr => tr.innerText.replace(/\\s+/g, ' ').slice(-90))"))
        print('errors', errs[:5]); await b.close()
asyncio.run(main())
