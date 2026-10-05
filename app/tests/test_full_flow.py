import asyncio, json
from playwright.async_api import async_playwright
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = 'file://' + os.path.join(ROOT, 'index.html')   # 빌드된 사이트 파일로 테스트
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(viewport={'width':1440,'height':1000})
        pg=await ctx.new_page()
        errs=[]
        pg.on('pageerror', lambda e: errs.append('PAGEERR '+str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE '+m.text) if m.type=='error' and 'ERR_TUNNEL' not in m.text else None)
        await pg.goto(P); await pg.wait_for_timeout(1200)
        # engine regression with original RAW prices
        reg = await pg.evaluate("""() => { const d = window.__divsim; const orig = {KTG:176900, KT:51900, HANA:129100, ADP:257.68, PG:144.91, MCD:231.89}; const keep = {};
          for (const k in orig) { keep[k] = d.S(k).p0; d.S(k).p0 = orig[k]; }
          const port = d.portOf(d.state.sel, []); const r = d.simulate(port, d.state.a); const nc = d.needCalc(port, d.state.a);
          for (const k in keep) d.S(k).p0 = keep[k];
          return { mN: r.mN, value: r.hz.value, need: nc.needM, needI: nc.needI }; }""")
        print('regression (expect ~409k, 1.66e8, 367k):', reg)
        await pg.screenshot(path='shot_v6_main.png', full_page=False)
        # header search
        await pg.fill('#gQ', '두산'); await pg.click('#gSearch button[type=submit]')
        await pg.wait_for_timeout(800)
        items = await pg.eval_on_selector_all('#mdList .ritem .n', 'els => els.slice(0,8).map(e=>e.textContent)')
        print('list:', items)
        print('detail name:', await pg.text_content('#dtName'))
        await pg.screenshot(path='shot_v6_modal.png')
        # chart tabs
        for r in ['w','m','y','d']:
            await pg.click(f'#mdDetail .tabs button[data-r="{r}"]'); await pg.wait_for_timeout(150)
        # analysis tabs
        for t in ['company','earn','fin','tech']:
            await pg.click(f'#mdDetail .tabs button[data-t="{t}"]'); await pg.wait_for_timeout(200)
        tech = await pg.eval_on_selector_all('#mdDetail .ta-sec h4', 'els => els.map(e=>e.textContent)')
        print('tech sections:', tech)
        # open 두산에너빌리티 (research)
        await pg.click('#mdList .ritem:nth-child(3)'); await pg.wait_for_timeout(500)
        print('detail2:', await pg.text_content('#dtName'))
        await pg.click('#mdDetail .tabs button[data-t="company"]'); await pg.wait_for_timeout(300)
        h4 = await pg.eval_on_selector_all('#mdDetail .rep h4', 'els => els.map(e=>e.textContent)')
        print('company h4:', h4)
        await pg.screenshot(path='shot_v6_company.png')
        await pg.click('#mdDetail .tabs button[data-t="earn"]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path='shot_v6_earn.png')
        await pg.click('#mdDetail .tabs button[data-t="fin"]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path='shot_v6_fin.png')
        # add to holdings: 100 shares at 70000
        await pg.click('#mdDetail .dt-actions button:has-text("보유 종목에 추가")')
        await pg.fill('#mdDetail .dt-form input >> nth=0', '100')
        await pg.fill('#mdDetail .dt-form input >> nth=1', '70000')
        await pg.click('#mdDetail .dt-form button:has-text("추가")'); await pg.wait_for_timeout(300)
        print('msg:', await pg.text_content('#mdDetail .dt-actions .mini'))
        # add KT&G detail -> add to plan (already) ; search 애플 and add to plan
        await pg.fill('#mdQ', '애플'); await pg.click('#mdForm button'); await pg.wait_for_timeout(500)
        print('apple first:', await pg.text_content('#dtName'))
        await pg.click('#mdDetail .dt-actions button:has-text("종목 구성에 담기")'); await pg.wait_for_timeout(300)
        print('plan msg:', await pg.text_content('#mdDetail .dt-actions .mini'))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        hold = await pg.evaluate("() => window.__divsim.state.hold")
        print('hold:', hold)
        sel = await pg.evaluate("() => window.__divsim.state.sel")
        print('sel:', sel)
        # 완성
        await pg.click('#btnDone'); await pg.wait_for_timeout(800)
        h2 = await pg.eval_on_selector_all('#viewAnalysis .card h2', 'els => els.map(e=>e.textContent)')
        print('analysis cards:', h2)
        await pg.screenshot(path='shot_v6_pa.png', full_page=True)
        # avg price input & risk change
        await pg.click('#viewAnalysis .seg button:has-text("낮음")'); await pg.wait_for_timeout(400)
        await pg.click('#viewAnalysis .seg button:has-text("매달 투자 구성")'); await pg.wait_for_timeout(400)
        await pg.screenshot(path='shot_v6_pa_plan.png', full_page=True)
        await pg.click('#viewAnalysis button:has-text("설계로 돌아가기")'); await pg.wait_for_timeout(500)
        # macro open
        await pg.click('#macro .macro-h button'); await pg.wait_for_timeout(600)
        await pg.screenshot(path='shot_v6_macro.png', full_page=False)
        print('macro secs:', await pg.eval_on_selector_all('#macro .msec h3', 'els => els.map(e=>e.textContent)'))
        print('ERRORS:', errs)
        await b.close()
asyncio.run(main())
