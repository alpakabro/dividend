import asyncio
from playwright.async_api import async_playwright
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = 'file://' + os.path.join(ROOT, 'index.html')   # 빌드된 사이트 파일로 테스트
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out') + '/'
os.makedirs(D, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 1000})
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE ' + m.type + ' ' + m.text) if m.type in ('error', 'warning') and 'ERR_TUNNEL' not in m.text else None)
        await pg.goto(P); await pg.wait_for_timeout(1200)
        await pg.evaluate("() => { try { localStorage.clear() } catch(e){} }")
        await pg.reload(); await pg.wait_for_timeout(1200)
        n0 = await pg.evaluate("() => Object.keys(window.__divsim.state.sel).length")
        print('initial selected', n0)
        # 체크 안 된 종목 행을 차례로 클릭해 20종목까지 담기
        for k in range(30):
            n = await pg.evaluate("() => Object.keys(window.__divsim.state.sel).length")
            if n >= 20: break
            row = pg.locator('#pickBody tr.row:not(.on)').first
            await row.click(); await pg.wait_for_timeout(120)
            toast = await pg.locator('#toast').inner_text()
            if toast.strip(): print('TOAST at', n, ':', toast)
        sel = await pg.evaluate("() => window.__divsim.state.sel")
        print('selected', len(sel), 'sum', round(sum(sel.values()), 4), 'min/max', min(sel.values()), max(sel.values()))
        print('pickSum:', await pg.locator('#pickSum').inner_text())
        slots = await pg.evaluate("() => window.__divsim.state.slots")
        print('slots used', sorted(slots.values()), 'count', len(slots))
        print('legend:', await pg.locator('#calLegend').inner_text())
        m = await pg.evaluate("() => { const M = window.__divsim.metrics(); return M ? {m: Math.round(M.m), need: Math.round(M.need)} : null }")
        print('metrics', m)
        # 캘린더 툴팁: 배당이 가장 많은 달에 hover
        hits = pg.locator('#calChart rect.hit')
        best = None
        for i in range(12):
            await hits.nth(i).hover(); await pg.wait_for_timeout(60)
            txt = await pg.locator('#tip').inner_text()
            rows = txt.count('\n')
            if best is None or rows > best[0]: best = (rows, i, txt)
        print('tooltip (month', best[1] + 1, '):', best[2].replace('\n', ' | ')[:400])
        # 색 토큰 12개 정의 확인 (라이트/다크)
        cols = await pg.evaluate("() => { const cs = getComputedStyle(document.documentElement); return Array.from({length: 12}, (_, i) => cs.getPropertyValue('--s' + (i + 1)).trim()) }")
        print('light colors', cols)
        await pg.evaluate("() => document.documentElement.setAttribute('data-theme', 'dark')")
        colsd = await pg.evaluate("() => { const cs = getComputedStyle(document.documentElement); return Array.from({length: 12}, (_, i) => cs.getPropertyValue('--s' + (i + 1)).trim()) }")
        print('dark colors', colsd)
        await pg.evaluate("() => document.documentElement.removeAttribute('data-theme')")
        await pg.locator('#calCard, #calChart').first.scroll_into_view_if_needed()
        await pg.screenshot(path=D + 'shot_cap_main.png', full_page=False)
        cal = pg.locator("#calCard")
        await cal.screenshot(path=D + 'shot_cap_cal.png')
        # 검색 창에서 21번째 담기
        await pg.fill('#gQ', '애플'); await pg.press('#gQ', 'Enter'); await pg.wait_for_timeout(500)
        await pg.locator('#mdList button').first.click(); await pg.wait_for_timeout(400)
        btn = pg.locator('#mdDetail button:has-text("종목 구성에 담기")')
        if await btn.count():
            await btn.first.click(); await pg.wait_for_timeout(300)
            print('detail msg:', await pg.locator('#mdDetail .dt-actions .mini').first.inner_text())
        else:
            print('detail: already in plan?', await pg.locator('#mdDetail .dt-actions').inner_text())
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        print('selected now', await pg.evaluate("() => Object.keys(window.__divsim.state.sel).length"))
        # 직접 추가 폼으로 22번째
        await pg.click('#btnAdd'); await pg.wait_for_timeout(150)
        await pg.fill('#nName', '테스트배당'); await pg.fill('#nYield', '4'); await pg.fill('#nGrowth', '3')
        await pg.locator('#nMonths button').nth(2).click()
        await pg.locator('#addForm button[type=submit]').click(); await pg.wait_for_timeout(300)
        print('after custom add selected', await pg.evaluate("() => Object.keys(window.__divsim.state.sel).length"), '| toast:', (await pg.locator('#toast').inner_text()).strip())
        print('pickSum:', await pg.locator('#pickSum').inner_text())
        # 분석 화면 (매달 투자 구성 기준)
        await pg.click('#btnDone'); await pg.wait_for_timeout(1000)
        await pg.locator('#viewAnalysis .seg button:has-text("매달 투자 구성")').first.click(); await pg.wait_for_timeout(1200)
        heat = await pg.evaluate("() => { const t = document.querySelector('#viewAnalysis table.heat'); return t ? [t.rows.length, t.rows[0].cells.length] : null }")
        print('heatmap rows/cols', heat)
        print('heat note:', await pg.evaluate("() => [...document.querySelectorAll('#viewAnalysis .card p.mini')].map(p => p.innerText).filter(t => t.includes('상위')).join(' / ')"))
        sec2 = pg.locator('#viewAnalysis section.card', has_text='② 종목 간 상관관계')
        await sec2.screenshot(path=D + 'shot_cap_heat.png')
        print('errors:', errs[:10])
        await b.close()
asyncio.run(main())
