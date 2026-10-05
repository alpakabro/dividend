import asyncio
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
        pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' and 'ERR_TUNNEL' not in m.text else None)
        await pg.goto(P); await pg.wait_for_timeout(1500)
        await pg.evaluate("() => { try { localStorage.clear() } catch(e){} }"); await pg.reload(); await pg.wait_for_timeout(1500)
        print('metrics default', await pg.evaluate("() => { const M = window.__divsim.metrics(); return Math.round(M.m) }"))
        for q in ['TIGER 미국배당', 'ETF', 'JEPI', 'KODEX 200', 'SCHD', '미국배당다우존스', '커버드콜', 'TLT', '금현물']:
            r = await pg.evaluate("q => window.__divsim.searchStocks(q).slice(0,5).map(x => x.name + ' ' + x.code + (x.rec ? ' [' + x.rec[0] + '/' + x.rec[4] + ']' : ' [RAW]'))", q)
            print(f'{q} → {r}')
        for q in ['TIGER 미국배당다우존스 어때?', '타이거 미국배당다우존스 사도 돼?', '제피 어때?', '미국배당다우존스 ETF 어때?', 'KODEX 200 차트 분석해줘', 'SCHD랑 JEPI 비교해줘']:
            r = await pg.evaluate("q => { const its = window.__divsim.advFindStocks(q); return [window.__divsim.advIntent(q, its), its.map(x => x.name + '(' + x.code + ')')] }", q)
            print(f'  adv {q} → {r}')
        # 보유: TIGER 미국배당다우존스 100주 + 평균 매수가
        await pg.fill('#holdQ', 'TIGER 미국배당다우존스'); await pg.press('#holdQ', 'Enter'); await pg.wait_for_timeout(600)
        print('modal list:', (await pg.locator('#mdList').inner_text())[:200].replace('\n', ' | '))
        await pg.locator('#mdList button').first.click(); await pg.wait_for_timeout(800)
        det = await pg.locator('#mdDetail').inner_text()
        print('detail head:', det[:160].replace('\n', ' | '))
        i = det.find('분배금 (ETF)'); print('div card:', det[i:i+260].replace('\n', ' | ') if i >= 0 else 'NONE')
        await pg.locator('#mdDetail').screenshot(path=D + 'shot_etf_detail.png')
        await pg.locator('#mdDetail button:has-text("보유 종목에 추가")').first.click(); await pg.wait_for_timeout(150)
        await pg.locator('#mdDetail input[aria-label="보유 주 수"]').first.fill('100')
        await pg.locator('#mdDetail input[aria-label="평균 매수가"]').first.fill('13000')
        await pg.locator('#mdDetail .dt-form button:has-text("추가")').first.click(); await pg.wait_for_timeout(400)
        # 종목 구성에 JEPI 담기
        await pg.fill('#mdQ', 'JEPI'); await pg.press('#mdQ', 'Enter'); await pg.wait_for_timeout(600)
        await pg.locator('#mdList button').first.click(); await pg.wait_for_timeout(600)
        await pg.locator('#mdDetail button:has-text("종목 구성에 담기")').first.click(); await pg.wait_for_timeout(400)
        print('plan msg:', await pg.locator('#mdDetail .dt-actions .mini').first.inner_text())
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        print('hold rows:', await pg.evaluate("() => [...document.querySelectorAll('#holdBody tr.sub .pnl-line')].map(e => e.innerText.replace(/\\s+/g, ' '))"))
        st = await pg.evaluate("() => { const s = window.__divsim.S('U:JEPI'); return s ? [s.name, s.d0, s.p0, s.mon.map(x => +x.toFixed(2)).join(','), s.g, s.tags.join('/'), s.sector, s.note] : null }")
        print('JEPI stock obj:', st)
        print('metrics after', await pg.evaluate("() => { const M = window.__divsim.metrics(); return [Math.round(M.m), M.y.toFixed(4)] }"))
        print('picker row JEPI:', await pg.evaluate("() => { const r = document.querySelector('#pickBody tr[data-id=\"U:JEPI\"]'); return r ? r.innerText.replace(/\\s+/g, ' ').slice(0, 160) : null }"))
        # 분석 화면
        await pg.click('#btnDone'); await pg.wait_for_timeout(1500)
        print('PA table:', await pg.evaluate("() => [...document.querySelectorAll('#viewAnalysis table.patbl tr')].slice(0, 4).map(tr => tr.innerText.replace(/\\s+/g,' ').trim())"))
        print('errors', errs[:8]); await b.close()
asyncio.run(main())
