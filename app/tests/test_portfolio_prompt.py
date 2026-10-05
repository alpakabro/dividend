import asyncio, json
from playwright.async_api import async_playwright
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = 'file://' + os.path.join(ROOT, 'index.html')   # 빌드된 사이트 파일로 테스트
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page()
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(P); await pg.wait_for_timeout(1000)
        r = await pg.evaluate("""() => { const d = window.__divsim; let ok=0, notok=0, fail=[]; const t0=performance.now();
          for (const [id, rec] of d.DB_IDX) { try { const ta = d.techAnalysis(rec); if (ta.ok) { ok++; if (!isFinite(ta.S1.v)||!isFinite(ta.R1.v)||!isFinite(ta.stop)) fail.push(id+' nan'); } else notok++; } catch(e) { fail.push(id+' '+e.message); } }
          return {ok, notok, fail: fail.slice(0,10), nfail: fail.length, ms: Math.round(performance.now()-t0)}; }""")
        print('tech all:', r)
        q = await pg.evaluate("""() => { const d = window.__divsim; const qs = ['AAPL','애플','005930','kt&g','KT&G','삼성','리얼티','맥도','p&g','엔비디아','tsla','하이닉스','schd','배당']; const o = {}; qs.forEach(q => o[q] = d.searchStocks(q).slice(0,4).map(x => x.name + '/' + x.code)); return o; }""")
        print(json.dumps(q, ensure_ascii=False, indent=0))
        # prompts
        pr = await pg.evaluate("""() => { const d = window.__divsim; const out = {}; for (const id of ['K:033780','U:AAPL','K:005930','SCHD','U:MCD']) { const it = d.itemFor(id); out[id] = [d.promptCompany(it,false).length, d.promptEarnings(it,true).length, d.promptFinancials(it,false).length]; if (it.rec) { const ta = d.techAnalysis(it.rec); out[id].push(d.promptChart(it, ta, false).length); } } out.macro = [d.promptMacro(false).length, d.promptMacro(true).length]; return out; }""")
        print('prompts:', pr)
        # PA with a mixed portfolio
        pa = await pg.evaluate("""() => { const d = window.__divsim; d.state.hold = [{id:'KTG',mode:'qty',v:30,avg:150000},{id:'U:NVDA',mode:'qty',v:10},{id:'SCHD',mode:'qty',v:100},{id:'__CASH__',mode:'amt',v:300},{id:'K:034020',mode:'qty',v:50,avg:60000}];
          const p = d.paCompute('hold','low'); return {n:p.pos.length, total:p.total, vol:p.vol, var1y:p.var1y, effN:p.effN, sectors:p.sectors.map(s=>s.k+':'+(s.w*100).toFixed(1)), covered:p.covered.length, weeks:p.weeks, bt:p.bt && {mdd:p.bt.mdd, ret:p.bt.ret1y}, strengths:p.strengths, weaknesses:p.weaknesses, actions:p.actions, prompt: d.promptPortfolio(p, 20, false).slice(0, 1500)}; }""")
        print(json.dumps(pa, ensure_ascii=False, indent=1))
        print('errs', errs)
        await b.close()
asyncio.run(main())
