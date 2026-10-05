import asyncio
from playwright.async_api import async_playwright
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = 'file://' + os.path.join(ROOT, 'index.html')   # 빌드된 사이트 파일로 테스트
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out') + '/'
os.makedirs(D, exist_ok=True)
SETUP = """() => { const s = window.__divsim.state;
  s.hold.length = 0;
  s.hold.push({id:'K005930', mode:'qty', v:10, avg:250000});
  s.hold.push({id:'U:ADP', mode:'qty', v:10, avg:250});
  s.hold.push({id:'K033780', mode:'amt', v:500});
  s.hold.push({id:'__cash', mode:'amt', v:300});
  s.hold.push({id:'__custom', key:'abc', mode:'qty', v:20, name:'테스트종목', mkt:'KR', price:15000, y:3, mp:'qkr', g:4, avg:12000});
  window.__divsim.commit(); return JSON.stringify(s.hold) }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs = []
        for name, vp, scheme in [('desk', {'width':1400,'height':1000}, 'light'), ('dark', {'width':1400,'height':1000}, 'dark'), ('mob', {'width':390,'height':844}, 'light')]:
            ctx = await b.new_context(viewport=vp, color_scheme=scheme, device_scale_factor=2 if name=='mob' else 1)
            pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append('PAGEERR '+str(e)))
            await pg.goto(P); await pg.wait_for_timeout(1200)
            ids = await pg.evaluate("() => ['삼성전자','ADP','KT&G'].map(q => { const it = window.__divsim.searchStocks(q)[0]; return [it.id, it.cid] })")
            if name == 'desk': print(ids)
            idmap = {'K005930': ids[0][1] or ids[0][0], 'U:ADP': ids[1][1] or ids[1][0], 'K033780': ids[2][1] or ids[2][0]}
            # 실제 상수 이름 확인
            consts = await pg.evaluate("() => { try { return [CASH, CUSTOM] } catch(e) { return String(e) } }")
            if name == 'desk': print('consts', consts)
            setup = SETUP.replace("'__cash'", "'__CASH__'").replace("'__custom'", "'__CUSTOM__'")
            for k, v in idmap.items(): setup = setup.replace("'" + k + "'", repr(v))
            r = await pg.evaluate(setup)
            if name == 'desk': print(r)
            await pg.wait_for_timeout(400)
            card = pg.locator('#holdCard')
            await card.scroll_into_view_if_needed()
            await card.screenshot(path=D+f'shot_pnl_card_{name}.png')
            if name == 'mob':
                ov = await pg.evaluate("() => ({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, tbl: document.querySelector('.hold-wrap').scrollWidth, wrap: document.querySelector('.hold-wrap').clientWidth})")
                print('mobile', ov)
            if name == 'desk':
                print('rows:', await pg.evaluate("() => [...document.querySelectorAll('#holdBody tr.sub .pnl-out')].map(e => e.innerText)"))
                print('foot:', await pg.locator('#holdPnl').inner_text(), '|', await pg.locator('#holdSum').inner_text())
                await pg.click('#btnDone'); await pg.wait_for_timeout(800)
                t = pg.locator('#viewAnalysis table.patbl').first
                await t.screenshot(path=D+'shot_pnl_pa_tbl.png')
                print('PA:', await pg.evaluate("() => [...document.querySelectorAll('#viewAnalysis table.patbl')[0].querySelectorAll('tr')].map(tr => tr.innerText.replace(/\\s+/g,' ').trim())"))
            await ctx.close()
        print('errors', errs)
        await b.close()
asyncio.run(main())
