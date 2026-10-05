# 내 포트폴리오(여러 개 저장·불러오기·삭제) 확인 (빌드된 index.html). 출력이 'OK'로 끝나면 정상
import asyncio, os, pathlib
from playwright.async_api import async_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = pathlib.Path(ROOT, 'index.html').as_uri()
A = [{'id': 'KTG', 'mode': 'qty', 'v': 30, 'avg': 150000}, {'id': '__CASH__', 'mode': 'amt', 'v': 300}]
B = [{'id': 'U:NVDA', 'mode': 'qty', 'v': 10}]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(); pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(P); await pg.wait_for_function('() => window.__divsim && window.__divsim.DB_IDX.size > 0')
        n0 = await pg.evaluate('() => window.__divsim.pfAll().length'); assert n0 == 0, n0
        # 1) A 저장 → 보유 종목 바꾸고 B 저장
        ok = await pg.evaluate("h => { const d = window.__divsim; d.state.hold = h; d.commit(); return d.pfSave('은퇴 준비'); }", A); assert ok
        await pg.evaluate("h => { const d = window.__divsim; d.state.hold = h; d.state.a.monthly = 99; d.commit(); d.pfSave('공격형'); }", B)
        lst = await pg.evaluate("() => window.__divsim.pfAll().map(x => [x.name, x.state.hold.length, x.state.a.monthly])")
        print('saved:', lst); assert [x[0] for x in lst] == ['공격형', '은퇴 준비'] and lst[1][1] == 2 and lst[0][2] == 99, lst
        assert (await pg.text_content('#btnPf')).strip() == '내 포트폴리오 · 공격형'
        # 2) 창 열기: 2행, 현재 표시
        await pg.click('#btnPf'); await pg.wait_for_timeout(200)
        rows = await pg.evaluate("() => [...document.querySelectorAll('#pfList .pf-row')].map(r => r.className + ' | ' + r.querySelector('b').textContent + ' | ' + r.querySelector('.pf-sum').textContent)")
        print('rows:', rows); assert len(rows) == 2 and rows[0].startswith('pf-row cur') and '보유 1종목' in rows[0] and '현금 300만원' in rows[1], rows
        # 3) 불러오기(A): 확인 → 새로고침 → 보유 종목 복원, 버튼 이름
        a_id = await pg.evaluate("() => window.__divsim.pfAll().find(x => x.name === '은퇴 준비').id")
        await pg.evaluate("id => window.__divsim.pfLoad(id)", a_id)
        await pg.wait_for_function('() => window.__divsim && window.__divsim.DB_IDX.size > 0 && window.__divsim.state.pfName === "은퇴 준비"', timeout=30000)
        hold = await pg.evaluate('() => window.__divsim.state.hold'); assert hold == A, hold
        assert (await pg.text_content('#btnPf')).strip() == '내 포트폴리오 · 은퇴 준비'
        print('loaded A, hold restored')
        # 4) 삭제(B) → 1개
        b_id = await pg.evaluate("() => window.__divsim.pfAll().find(x => x.name === '공격형').id")
        await pg.evaluate("id => window.__divsim.pfDelete(id)", b_id)
        assert await pg.evaluate('() => window.__divsim.pfAll().length') == 1
        print('errors', errs); assert not errs
        await b.close(); print('OK')
asyncio.run(main())
