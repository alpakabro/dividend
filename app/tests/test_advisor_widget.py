import asyncio
from playwright.async_api import async_playwright
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = 'file://' + os.path.join(ROOT, 'index.html')   # 빌드된 사이트 파일로 테스트
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out') + '/'
os.makedirs(D, exist_ok=True)
MOCK = """
window.__calls = [];
window.claude = { use: async (name) => {
  if (name !== 'sample') return null;
  return (input, opts) => new Promise((resolve, reject) => {
    window.__calls.push(input);
    const full = '### 한 줄 결론\\n- **중립** — 테스트 답변입니다.\\n### 핵심 근거\\n- 근거 1\\n- 근거 2\\n### 리스크\\n- 리스크 1\\n\\n| 항목 | 값 |\\n|---|---|\\n| PER | 12.4배 |\\n\\n이 분석은 참고용입니다';
    let i = 0; const step = () => {
      if (opts.signal && opts.signal.aborted) { reject({ code: 'cancelled', message: 'x', text: full.slice(0, i) }); return; }
      i = Math.min(full.length, i + 30); opts.onText && opts.onText({ text: full.slice(0, i), delta: 'x' });
      if (i >= full.length) resolve({ text: full, truncated: false, modelTierApplied: 'default' }); else setTimeout(step, 120);
    };
    setTimeout(step, 300);
  });
} };
"""
async def st(pg):
    return await pg.evaluate("""() => { const f = document.querySelector('#advFab'), p = document.querySelector('#advPanel'), r = f.getBoundingClientRect();
      return { fab: [Math.round(r.right), Math.round(r.bottom), Math.round(r.width), Math.round(r.height), getComputedStyle(f).display], panelHidden: p.hidden, expanded: f.getAttribute('aria-expanded'),
               focus: document.activeElement && (document.activeElement.id || document.activeElement.tagName), dot: !document.querySelector('#advFab .adv-dot').hidden } }""")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        # 1) Claude 밖
        pg = await b.new_page(viewport={'width':1400,'height':900})
        pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        await pg.goto(P); await pg.wait_for_timeout(1300)
        print('initial', await st(pg))
        await pg.click('#advFab'); await pg.wait_for_timeout(100)
        print('opened ', await st(pg), '| send:', await pg.locator('#advSend').inner_text())
        await pg.screenshot(path=D + 'shot_adv_widget_site.png')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(100)
        print('esc    ', await st(pg))
        await pg.close()
        # 2) Claude 안(모의)
        ctx = await b.new_context(viewport={'width':1400,'height':900}); await ctx.add_init_script(MOCK)
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append('PAGEERR2 ' + str(e)))
        await pg.goto(P); await pg.wait_for_timeout(1500)
        await pg.click('#advFab'); await pg.wait_for_timeout(100)
        print('send label:', await pg.locator('#advSend').inner_text())
        await pg.fill('#advQ', '삼성전자 어떻게 생각해?'); await pg.press('#advQ', 'Enter'); await pg.wait_for_timeout(500)
        print('streaming: stop visible', await pg.locator('#advStop').is_visible(), '| send hidden', not await pg.locator('#advSend').is_visible(), '| empty hidden', not await pg.locator('#advEmpty').is_visible())
        await pg.click('.adv-x'); await pg.wait_for_timeout(1800)
        print('closed during answer → after', await st(pg))
        await pg.click('#advFab'); await pg.wait_for_timeout(200)
        print('reopened', await st(pg))
        print('answer:', (await pg.locator('#advLog .adv-a').last.inner_text())[:90].replace('\n', ' | '))
        await pg.screenshot(path=D + 'shot_adv_widget_chat.png')
        # 참고 종목 클릭 → 종목 창이 위에, Esc는 종목 창만 닫음
        await pg.locator('#advLog .adv-ref .linkish').first.click(); await pg.wait_for_timeout(600)
        print('modal open', await pg.locator('#modal').is_visible(), '| panel still open', await pg.locator('#advPanel').is_visible())
        z = await pg.evaluate("() => { const el = document.elementFromPoint(1200, 700); return el ? (el.closest('#modal') ? 'modal' : el.closest('#advPanel') ? 'panel' : el.tagName) : null }")
        print('top layer at panel area:', z)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        print('after esc: modal', await pg.locator('#modal').is_visible(), '| panel', await pg.locator('#advPanel').is_visible())
        # 분석 화면에서도 버튼 유지
        await pg.click('.adv-x'); await pg.click('#btnDone'); await pg.wait_for_timeout(800)
        print('analysis view fab visible', await pg.locator('#advFab').is_visible())
        await ctx.close()
        # 3) 모바일·다크
        m = await b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, color_scheme='dark'); await m.add_init_script(MOCK)
        mp = await m.new_page(); mp.on('pageerror', lambda e: errs.append('M PAGEERR ' + str(e)))
        await mp.goto(P); await mp.wait_for_timeout(1500)
        print('mobile initial', await st(mp))
        await mp.screenshot(path=D + 'shot_adv_widget_mob_closed.png')
        await mp.click('#advFab'); await mp.wait_for_timeout(150)
        print('mobile open', await st(mp))
        await mp.fill('#advQ', 'KT&G 배당 안전해?'); await mp.click('#advSend'); await mp.wait_for_timeout(2600)
        await mp.screenshot(path=D + 'shot_adv_widget_mob_open.png')
        print('mobile overflow', await mp.evaluate("() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]"))
        print('errors', errs); await b.close()
asyncio.run(main())
