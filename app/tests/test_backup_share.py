# 설정 내보내기·가져오기·공유 링크 확인 (빌드된 index.html). 출력이 'OK'로 끝나면 정상
import asyncio, json, os, pathlib, tempfile
from playwright.async_api import async_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = pathlib.Path(ROOT, 'index.html').as_uri()
HOLD = [{'id': 'KTG', 'mode': 'qty', 'v': 30, 'avg': 150000}, {'id': 'U:NVDA', 'mode': 'qty', 'v': 10}, {'id': '__CASH__', 'mode': 'amt', 'v': 300}]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 1000})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))        # confirm → 예
        await pg.goto(P); await pg.wait_for_function('() => window.__divsim && window.__divsim.DB_IDX.size > 0')
        # 1) 보유 종목을 넣고 내보내기 결과 확인
        exp = await pg.evaluate("h => { const d = window.__divsim; d.state.hold = h; d.state.a.monthly = 250; d.commit(); return d.exportState(); }", HOLD)
        assert exp['app'] == 'monthly-div-sim' and exp['state']['hold'] == HOLD and exp['state']['a']['monthly'] == 250, exp
        print('export keys', sorted(exp['state'].keys()))
        # 2) 공유 링크로 새 브라우저 컨텍스트(저장소 비어 있음)에서 열기 → 같은 보유 종목
        link = await pg.evaluate('() => window.__divsim.shareLink()')
        print('share link length', len(link))
        ctx2 = await b.new_context(); pg2 = await ctx2.new_page(); pg2.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg2.goto(link); await pg2.wait_for_function('() => window.__divsim && window.__divsim.DB_IDX.size > 0')
        hold2 = await pg2.evaluate('() => window.__divsim.state.hold'); monthly2 = await pg2.evaluate('() => window.__divsim.state.a.monthly')
        assert hold2 == HOLD and monthly2 == 250, (hold2, monthly2)
        assert '#' not in pg2.url, pg2.url                                   # 주소의 해시는 지워짐
        print('share link applied, hash cleared')
        # 3) 가져오기: 파일로 다른 설정을 넣으면 그 설정으로 바뀜
        f = os.path.join(tempfile.gettempdir(), 'divsim_import.json')
        json.dump({'app': 'monthly-div-sim', 'v': 1, 'state': {'hold': HOLD[:1], 'a': {'monthly': 123}}}, open(f, 'w', encoding='utf-8'), ensure_ascii=False)
        await pg2.set_input_files('#importFile', f); await pg2.wait_for_timeout(300)
        await pg2.wait_for_function('() => window.__divsim && window.__divsim.DB_IDX.size > 0 && window.__divsim.state.a.monthly === 123')
        hold3 = await pg2.evaluate('() => window.__divsim.state.hold'); assert hold3 == HOLD[:1], hold3
        print('import applied')
        # 4) 엉뚱한 파일은 거부
        bad = await pg2.evaluate("() => { try { window.__divsim.applyState({ foo: 1 }); return 'accepted'; } catch (e) { return e.message; } }")
        assert '아니에요' in bad, bad
        print('errors', errs); assert not errs
        await b.close(); print('OK')
asyncio.run(main())
