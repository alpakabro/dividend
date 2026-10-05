import asyncio
from playwright.async_api import async_playwright
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = 'file://' + os.path.join(ROOT, 'index.html')   # 빌드된 사이트 파일로 테스트
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out') + '/'
os.makedirs(D, exist_ok=True)
async def info(pg):
    return await pg.evaluate("""() => { const m = document.querySelector('#macro'); return { h: Math.round(m.getBoundingClientRect().height), cls: m.className,
      tiles: !!document.querySelector('#macro .mtiles'), headline: !!document.querySelector('#macro .macro-lead'), body: !!document.querySelector('#macro .macro-body .mgrid, #macro .macro-body h3'),
      btns: [...document.querySelectorAll('#macro .macro-h button')].map(b => b.innerText + '[' + b.getAttribute('aria-expanded') + ']'), focus: document.activeElement ? document.activeElement.tagName + ':' + (document.activeElement.innerText || '').slice(0, 12) : null } }""")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        ctx = await b.new_context(viewport={'width':1400,'height':900})
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        await pg.goto(P); await pg.wait_for_timeout(1200)
        await pg.evaluate("() => { try { localStorage.clear() } catch(e){} }"); await pg.reload(); await pg.wait_for_timeout(1200)
        print('default  ', await info(pg))
        await pg.evaluate("() => { const b = document.querySelector('#macro .fold'); if (b && b.textContent.includes('펼치기')) b.click(); }"); await pg.wait_for_timeout(300)   # 기본은 접힘 → 펼친 상태에서 시작
        await pg.click('#macro .macro-h .fold'); await pg.wait_for_timeout(200)
        print('folded   ', await info(pg))
        await pg.screenshot(path=D + 'shot_fold_desk.png', clip={'x':0,'y':0,'width':1400,'height':260})
        await pg.reload(); await pg.wait_for_timeout(1200)
        print('reloaded ', await info(pg))
        await pg.keyboard.press('Tab')
        await pg.click('#macro .macro-h .fold'); await pg.wait_for_timeout(200)
        print('unfolded ', await info(pg))
        # 전체 분석 열고 → 접기 → 펼치기
        await pg.click('#macro .macro-h button:has-text("전체 분석 보기")'); await pg.wait_for_timeout(600)
        print('detail   ', await info(pg))
        await pg.click('#macro .macro-h .fold'); await pg.wait_for_timeout(200)
        print('fold w/ detail', await info(pg))
        await pg.click('#macro .macro-h .fold'); await pg.wait_for_timeout(600)
        print('unfold w/ detail', await info(pg))
        await pg.click('#macro .macro-h button:has-text("전체 분석 접기")'); await pg.wait_for_timeout(300)
        print('detail closed', await info(pg))
        # 다크 + 모바일 접힘 상태
        await pg.click('#macro .macro-h .fold'); await pg.wait_for_timeout(200)
        m = await b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, color_scheme='dark')
        mp = await m.new_page(); mp.on('pageerror', lambda e: errs.append('M PAGEERR ' + str(e)))
        await mp.goto(P); await mp.wait_for_timeout(1200)
        await mp.evaluate("() => { const s = window.__divsim.state; s.macroFold = true; }")
        await mp.evaluate("() => { document.querySelector('#macro .macro-h .fold') && null }")
        # 상태 반영: 버튼 두 번 클릭(펼침→접힘)으로 저장 경로까지 확인
        await mp.click('#macro .macro-h .fold'); await mp.wait_for_timeout(200)
        print('mobile after click', await info(mp))
        await mp.screenshot(path=D + 'shot_fold_mob_open.png', clip={'x':0,'y':0,'width':390,'height':420})
        await mp.click('#macro .macro-h .fold'); await mp.wait_for_timeout(200)
        print('mobile after 2nd click', await info(mp))
        await mp.screenshot(path=D + 'shot_fold_mob.png', clip={'x':0,'y':0,'width':390,'height':300})
        print('mobile overflow', await mp.evaluate("() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]"))
        print('errors', errs); await b.close()
asyncio.run(main())
