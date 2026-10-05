import asyncio, sys
from playwright.async_api import async_playwright
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = 'file://' + os.path.join(ROOT, 'index.html')   # 빌드된 사이트 파일로 테스트
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        pg=await b.new_page(viewport={'width':1400,'height':1000})
        errs=[]
        pg.on('pageerror', lambda e: errs.append('PAGEERR '+str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE '+m.type+' '+m.text) if m.type in ('error','warning') else None)
        await pg.goto(P)
        await pg.wait_for_timeout(1500)
        print('errors:', errs[:10])
        m=await pg.evaluate("() => { const M = window.__divsim.metrics(); return M ? {m: M.m, value: M.value, need: M.need} : null }")
        print('metrics', m)
        r=await pg.evaluate("() => window.__divsim.searchStocks('두산').slice(0,10).map(x=>x.name+' '+x.code)")
        print('search 두산', r)
        await b.close()
asyncio.run(main())
