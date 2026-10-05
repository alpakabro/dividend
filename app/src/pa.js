/* ───────── [pa] 포트폴리오 분석 ('포트폴리오 완성' 다음 화면) ───────── */
const RISKP = {
  low: { k: '낮음', single: 0.20, sector: 0.35, vol: 0.12, us: 0.60 },
  mid: { k: '보통', single: 0.25, sector: 0.45, vol: 0.18, us: 0.75 },
  high: { k: '높음', single: 0.35, sector: 0.60, vol: 0.25, us: 0.90 }
};
const FX_RANGE = { hi: 1555.8, hiD: '7/2', lo: 1336.1, loD: '9/9' };   // 2026년 원/달러 주간종가 고·저 (서울외환시장, 리서치 K4)

function paHoldPositions() {
  const map = new Map(); let cash = 0;
  state.hold.forEach((r, idx) => {
    const v = holdValue(r); if (!(v > 0)) return;
    if (r.id === CASH) { cash += v; return; }
    const st = holdStock(r); if (!st) return;
    let p = map.get(st.id);
    if (!p) { p = { id: st.id, st, name: st.name, mkt: st.mkt, sector: stockSector(st), qty: 0, qtyEst: false, value: 0, cost: 0, costOk: true, rows: [] }; map.set(st.id, p); }
    p.value += v; p.rows.push(idx);
    // 수량: '주' 입력은 그대로, '금액' 입력은 현재가로 환산한 추정치
    const px = st.custom ? (st.priced ? pxKRW0(st) : 0) : pxKRW0(st);
    if (r.mode === 'qty' && px > 0) p.qty += numOr(r.v, 0);
    else if (px > 0) { p.qty += v / px; p.qtyEst = true; }
    // 매수 원금: 평균 매수가 기준 (주·금액 입력 모두)
    const pl = pnlOf(r);
    if (pl) p.cost += pl.cost; else p.costOk = false;
  });
  return { pos: [...map.values()], cash };
}
function paPlanPositions() {
  const items = itemsOf(state.sel), yr = Math.max(1, (state.a.monthly || 0)) * 1e4 * 12;
  return { pos: items.map(x => ({ id: x.st.id, st: x.st, name: x.st.name, mkt: x.st.mkt, sector: stockSector(x.st), qty: 0, value: x.w * yr, cost: 0, costOk: false, rows: [], w0: x.w })), cash: 0, notional: yr };
}
function corr(a, b) { const n = a.length; if (n < 3) return null; const ma = avg(a), mb = avg(b); let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; } return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : null; }

function paCompute(basisIn, riskKey) {
  let basis = basisIn || state.paBasis || 'hold';
  let P = basis === 'hold' ? paHoldPositions() : paPlanPositions();
  let autoPlan = false;
  if (basis === 'hold' && !P.pos.length) { P = paPlanPositions(); basis = 'plan'; autoPlan = true; }
  const R = RISKP[riskKey || state.risk] || RISKP.mid;
  const stockVal = P.pos.reduce((s, p) => s + p.value, 0), total = stockVal + P.cash;
  P.pos.forEach(p => { p.w = total > 0 ? p.value / total : 0; p.rec = recOf(p.st); p.pnl = p.costOk && p.cost > 0 ? p.value - p.cost : null; });
  P.pos.sort((a, b) => b.value - a.value);
  const out = { basis, autoPlan, R, riskKey: riskKey || state.risk, pos: P.pos, cash: P.cash, total, stockVal, notional: P.notional || 0 };
  if (!P.pos.length) return out;
  // ① 비중·쏠림
  const sec = new Map(); P.pos.forEach(p => sec.set(p.sector, (sec.get(p.sector) || 0) + p.w));
  out.sectors = [...sec.entries()].map(([k, w]) => ({ k, w })).sort((a, b) => b.w - a.w);
  out.kr = P.pos.filter(p => p.mkt === 'KR').reduce((s, p) => s + p.w, 0); out.us = P.pos.filter(p => p.mkt === 'US').reduce((s, p) => s + p.w, 0); out.cashW = total > 0 ? P.cash / total : 0;
  const sw = P.pos.map(p => p.value / stockVal); out.hhi = sw.reduce((s, w) => s + w * w, 0); out.effN = out.hhi > 0 ? 1 / out.hhi : 0;
  out.top1 = P.pos[0]; out.top3 = P.pos.slice(0, 3).reduce((s, p) => s + p.w, 0);
  // ② 상관관계 (주별 로그수익률, 공통 기간)
  const cov = P.pos.filter(p => p.rec && seriesOf(p.rec, 'w').v.length >= 30);
  out.covered = cov; out.coveredW = cov.reduce((s, p) => s + p.value, 0) / (stockVal || 1);
  if (cov.length) {
    const maps = cov.map(p => { const S0 = seriesOf(p.rec, 'w'), m = new Map(); S0.t.forEach((d, i) => m.set(d, S0.v[i])); return m; });
    let common = [...maps[0].keys()].filter(d => maps.every(m => m.has(d))).sort((a, b) => a - b).slice(-105);
    out.weeks = common.length - 1;
    if (common.length >= 21) {
      const rets = maps.map(m => { const r = []; for (let i = 1; i < common.length; i++) r.push(Math.log(m.get(common[i]) / m.get(common[i - 1]))); return r; });
      out.wFrom = dayStr(common[0]); out.wTo = dayStr(common[common.length - 1]);
      const n = cov.length; out.C = []; for (let i = 0; i < n; i++) { out.C.push([]); for (let j = 0; j < n; j++) out.C[i].push(i === j ? 1 : corr(rets[i], rets[j])); }
      const pairs = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (out.C[i][j] != null) pairs.push({ a: cov[i], b: cov[j], c: out.C[i][j] });
      pairs.sort((x, y) => y.c - x.c); out.pairs = pairs; out.avgC = pairs.length ? avg(pairs.map(p => p.c)) : null;
      // ③ 위험: 공분산 → 연 변동성, 위험 기여도
      const wc = cov.map(p => p.value), ws = wc.reduce((s, v) => s + v, 0), w = wc.map(v => v / ws);
      const sd = rets.map(r => stdev(r)), Sg = [];
      for (let i = 0; i < n; i++) { Sg.push([]); for (let j = 0; j < n; j++) Sg[i].push((out.C[i][j] ?? 0) * sd[i] * sd[j]); }
      const Sw = w.map((_, i) => Sg[i].reduce((s, v, j) => s + v * w[j], 0)), varW = w.reduce((s, wi, i) => s + wi * Sw[i], 0);
      out.volCov = Math.sqrt(Math.max(varW, 0) * 52);
      out.vol = out.volCov * (stockVal / (total || 1));   // 데이터 없는 종목은 같은 위험으로 가정, 현금은 위험 0
      out.rc = cov.map((p, i) => ({ p, rc: varW > 0 ? w[i] * Sw[i] / varW : 0, vol: sd[i] * Math.sqrt(52) }));
    }
    // 최근 1년 일별 백테스트(현재 비중 고정)
    const ds = cov.map(p => seriesOf(p.rec, 'd')), dm = ds.map(D => { const m = new Map(); D.t.forEach((d, i) => m.set(d, D.v[i])); return m; });
    const allD = [...new Set(ds.flatMap(D => D.t))].sort((a, b) => a - b);
    const lastV = ds.map(() => null), wv = cov.map(p => p.value), wsum = wv.reduce((s, v) => s + v, 0) || 1, ret = [], dts = [], share = stockVal / (total || 1);
    allD.forEach(d => {
      let r = 0, ready = true;
      dm.forEach((m, k) => { const v = m.get(d); if (v != null) { if (lastV[k] != null) r += (v / lastV[k] - 1) * wv[k] / wsum; lastV[k] = v; } if (lastV[k] == null) ready = false; });
      if (ready) { ret.push(r * share); dts.push(d); }
    });
    if (ret.length > 20) {
      let v = 1, pk = 1, mdd = 0, mddD = null; const lv = [];
      ret.forEach((r, i) => { v *= 1 + r; lv.push(v); if (v > pk) pk = v; const ddv = v / pk - 1; if (ddv < mdd) { mdd = ddv; mddD = dts[i]; } });
      let worst = 0, worstD = null; ret.forEach((r, i) => { if (r < worst) { worst = r; worstD = dts[i]; } });
      let w20 = 0, w20D = null; for (let i = 20; i < lv.length; i++) { const x = lv[i] / lv[i - 20] - 1; if (x < w20) { w20 = x; w20D = dts[i]; } }
      out.bt = { ret1y: v - 1, mdd, mddD, worst, worstD, w20, w20D, from: dayStr(dts[0]), to: dayStr(dts[dts.length - 1]), days: ret.length };
    }
  }
  if (out.vol != null) { out.var1m = 1 - Math.exp(-1.645 * out.vol / Math.sqrt(12)); out.var1y = 1 - Math.exp(-1.645 * out.vol); }   // 로그정규 근사(손실 100% 상한)
  out.fxHit = out.us * (FX_RANGE.lo / FX_RANGE.hi - 1);
  // 배당
  const tax = TAX[A().tax] || TAX.normal, monthly = new Array(12).fill(0);
  let divG = 0, divN = 0;
  P.pos.forEach(p => { const y = yieldOf(p.st) || 0, tr = p.mkt === 'US' ? tax.US : tax.KR; p.y = y; divG += p.value * y; divN += p.value * y * (1 - tr); p.st.mon.forEach((m, i) => { monthly[i] += p.value * y * m; }); });
  out.divG = divG; out.divN = divN; out.monthly = monthly; out.covMonths = monthly.filter(x => x > 0.5).length; out.yieldP = total > 0 ? divG / total : 0;
  out.goodW = P.pos.filter(p => p.st.safe === 'good' && !p.st.dbOnly).reduce((s, p) => s + p.w, 0) / (stockVal / (total || 1) || 1);
  out.gAvg = P.pos.reduce((s, p) => s + p.w * (p.st.g || 0), 0) / ((stockVal / (total || 1)) || 1);
  // ④ 종목 평가 메모
  P.pos.forEach(p => {
    const s = p.rec ? p.rec[RF.st] : null, rep = RESEARCH_OF(p.st), v = rep ? rep.valuation || {} : {}, notes = [];
    p.r1y = s ? s[5] : null; p.vol1 = s ? s[8] : null; p.mdd1 = s ? s[9] : null;
    p.pos52 = s && s[10] > s[11] ? (p.rec[RF.price] - s[11]) / (s[10] - s[11]) * 100 : null;
    p.per = v.per ?? null; p.pbr = v.pbr ?? null; p.roe = v.roe ?? null; p.rep = !!rep;
    if (p.st.dbOnly && p.st.noDiv) notes.push(NO_DIV[p.st.code] ? '무배당' : '배당 정보 없음(직접 입력 필요)');
    if (p.st.safe === 'bad') notes.push('배당 삭감·중단 이력/위험');
    if (p.y > 0.06 && p.st.safe !== 'good') notes.push('고배당이나 지속성 점검');
    if ((p.st.g || 0) >= 5 && !p.st.dbOnly) notes.push('배당성장 양호');
    if ((p.st.g || 0) <= 1 && !p.st.dbOnly && p.y > 0) notes.push('배당 정체(성장 가정 1% 이하)');
    if (p.r1y != null && p.r1y <= -20) notes.push(`1년 ${sp(p.r1y)} 약세`);
    if (p.r1y != null && p.r1y >= 60) notes.push(`1년 ${sp(p.r1y)} 급등(과열 점검)`);
    if (p.vol1 != null && p.vol1 >= 35) notes.push('변동성 큼');
    if (p.per != null && p.per >= 25) notes.push(`PER ${fx1(p.per, 1)}배 밸류에이션 부담`);
    if (p.per != null && p.per > 0 && p.per < 10) notes.push(`PER ${fx1(p.per, 1)}배 저평가 구간`);
    p.memo = notes.join(' · ') || '특이사항 없음';
  });
  // ⑤ 강점·취약점, ⑥ 조정 제안
  const S_ = [], W_ = [], A_ = [];
  const stockShare = stockVal / (total || 1);
  if (out.covMonths === 12) S_.push('12개월 모두 배당이 들어오는 구조 — 월 현금흐름이 고르게 분산됨');
  else W_.push(`배당이 없는 달 ${12 - out.covMonths}개(${out.monthly.map((x, i) => x > 0.5 ? null : (i + 1) + '월').filter(Boolean).join('·')}) — 월배당 목표에 공백`);
  if (out.kr > 0.25 && out.us > 0.25) S_.push(`국내 ${pct(out.kr, 0)} · 미국 ${pct(out.us, 0)}로 국가·통화 분산`);
  if (out.us > R.us) W_.push(`미국 비중 ${pct(out.us, 0)}가 성향(${R.k}) 기준 ${pct(R.us, 0)}를 넘어 환율 영향 큼`);
  if (out.us < 0.1 && P.pos.length >= 3) W_.push('미국 비중이 거의 없어 원화·국내 경기에 집중');
  const over = P.pos.filter(p => p.w > R.single && !/ETF/.test(p.sector));
  over.forEach(p => { W_.push(`${p.name} 비중 ${pct(p.w, 1)} — 단일 종목 한도(${R.k}: ${pct(R.single, 0)}) 초과`); A_.push(`${p.name} ${pct(p.w, 1)} → ${pct(R.single, 0)} 이하로 축소(약 ${pct(p.w - R.single, 1)}p)`); });
  if (!over.length) S_.push(`개별 종목 최대 비중 ${pct(Math.max(0, ...P.pos.filter(p => !/ETF/.test(p.sector)).map(p => p.w)), 1)} — ${R.k} 성향 한도(${pct(R.single, 0)}) 이내${P.pos.some(p => /ETF/.test(p.sector)) ? ' (분산 ETF는 한도에서 제외)' : ''}`);
  const secOver = out.sectors.filter(s => s.w > R.sector && !/ETF/.test(s.k));
  secOver.forEach(s => { W_.push(`${s.k} 섹터 ${pct(s.w, 1)} — 섹터 한도(${pct(R.sector, 0)}) 초과로 같은 악재에 함께 흔들릴 위험`); A_.push(`${s.k} 비중을 ${pct(R.sector, 0)} 이하로 낮추고 부족한 섹터로 분산`); });
  if (out.avgC != null) { if (out.avgC < 0.3) S_.push(`종목 간 평균 상관계수 ${fx1(out.avgC, 2)} — 서로 다르게 움직여 분산 효과 큼`); else if (out.avgC > 0.55) W_.push(`종목 간 평균 상관계수 ${fx1(out.avgC, 2)} — 함께 움직이는 종목이 많아 분산 효과 작음`); }
  (out.pairs || []).filter(x => x.c >= 0.7).slice(0, 3).forEach(x => { W_.push(`${x.a.name}·${x.b.name} 상관계수 ${fx1(x.c, 2)} — 사실상 중복 투자`); A_.push(`${x.a.name}·${x.b.name} 중 하나를 줄이고 상관이 낮은 섹터 종목으로 교체 검토`); });
  if (out.vol != null) { if (out.vol <= R.vol) S_.push(`예상 연 변동성 ${pct(out.vol, 1)} — ${R.k} 성향 목표(${pct(R.vol, 0)}) 이내`); else { W_.push(`예상 연 변동성 ${pct(out.vol, 1)} — ${R.k} 성향 목표(${pct(R.vol, 0)})보다 큼`); const hv = (out.rc || []).slice().sort((a, b) => b.rc - a.rc)[0]; if (hv) A_.push(`위험 기여도 1위 ${hv.p.name}(${pct(hv.rc, 0)}) 비중을 줄이거나 현금·저변동 배당주로 일부 이동`); } }
  if (out.goodW >= 0.7) S_.push(`배당 삭감 위험 낮음(✅) 종목이 주식의 ${pct(out.goodW, 0)}`); else W_.push(`배당 삭감 위험 낮음(✅) 종목이 주식의 ${pct(out.goodW, 0)}에 그침`);
  if (out.gAvg >= 4) S_.push(`가중평균 배당성장 가정 ${fx1(out.gAvg, 1)}% — 물가를 웃도는 배당 증가 기대`); else if (out.gAvg < 2.5) W_.push(`가중평균 배당성장 가정 ${fx1(out.gAvg, 1)}% — 물가(2%대)를 못 따라갈 수 있음`);
  if (out.coveredW < 0.8) W_.push(`가격 데이터가 있는 종목이 주식의 ${pct(out.coveredW, 0)}뿐이라 위험 수치의 정확도가 낮음`);
  if (out.cashW > 0.3) W_.push(`현금 ${pct(out.cashW, 0)} — 기회비용(물가·배당 손실)`);
  if (P.pos.length < 4) W_.push(`종목 수 ${P.pos.length}개로 개별 기업 위험에 노출`);
  const missing = ['헬스케어', '필수소비재', '금융', '통신', 'IT', '산업재'].filter(sct => !out.sectors.some(s => s.k.startsWith(sct)));
  if (missing.length) A_.push(`비어 있는 섹터: ${missing.slice(0, 4).join('·')} — 예: ${missing.slice(0, 3).map(sct => { const c = [...U.values()].filter(s => !s.custom && !s.dbOnly && s.sector === sct && s.safe === 'good' && !P.pos.some(p => p.id === s.id)).sort((a, b) => yieldOf(b) - yieldOf(a))[0]; return c ? `${c.name}(${sct}, ${pct(yieldOf(c), 1)})` : null; }).filter(Boolean).join(', ')}`);
  const gapM = out.monthly.map((x, i) => x > 0.5 ? null : i).filter(x => x != null);
  if (gapM.length) {
    const cands = [...U.values()].filter(s => !s.custom && !s.dbOnly && s.safe === 'good' && !P.pos.some(p => p.id === s.id) && gapM.some(i => s.mon[i] > 0)).sort((a, b) => gapM.filter(i => b.mon[i] > 0).length - gapM.filter(i => a.mon[i] > 0).length || yieldOf(b) - yieldOf(a)).slice(0, 3);
    if (cands.length) A_.push(`배당 공백 월 채우기 후보: ${cands.map(c => `${c.name}(${monthsText(c.mon)}, ${pct(yieldOf(c), 1)})`).join(', ')}`);
  }
  if (out.riskKey === 'low' && out.cashW < 0.05) A_.push('위험 감수 성향이 낮다면 생활비 6개월치 정도는 현금·예금으로 별도 확보');
  if (!A_.length) A_.push('현재 비중은 설정한 성향 기준을 지키고 있어요. 분기마다 비중이 한도를 넘지 않는지만 점검(리밸런싱)하세요.');
  out.strengths = S_; out.weaknesses = W_; out.actions = A_;
  return out;
}

/* 렌더 */
function renderPA() {
  const box = $('#viewAnalysis'); box.textContent = '';
  const pa = paCompute(state.paBasis, state.risk), R = pa.R, years = state.paYears || state.a.years;
  const seg = (items, cur, on) => { const d = h('div', { class: 'seg' }); items.forEach(([v, l]) => d.append(h('button', { type: 'button', 'aria-pressed': String(v === cur), text: l, onclick: () => on(v) }))); return d; };
  const yIn = h('input', { type: 'number', min: 1, max: 40, step: 1, value: years, 'aria-label': '투자 기간(년)' });
  yIn.addEventListener('change', () => { state.paYears = Math.max(1, Math.min(40, Math.round(+yIn.value || state.a.years))); save(); renderPA(); });
  box.append(h('div', { class: 'pa-top' },
    h('div', null, h('button', { class: 'btn sm', type: 'button', text: '← 포트폴리오 설계로 돌아가기', onclick: goMain }), h('h2', { style: 'margin-top:8px', text: '포트폴리오 분석' }), h('p', { text: `주가 국내 ${dataDate('KR')}·미국 ${dataDate('US')} 종가, 원/달러 ${FX0.toLocaleString('ko-KR')}원 기준 · 위험 수치는 과거 데이터로 계산한 추정치` })),
    h('div', { class: 'pa-set' },
      h('div', { class: 'field' }, h('span', { class: 'lab', text: '분석 대상' }), seg([['hold', '보유 종목'], ['plan', '매달 투자 구성']], pa.basis, v => { state.paBasis = v; save(); renderPA(); })),
      h('div', { class: 'field' }, h('span', { class: 'lab', text: '위험 감수 성향' }), seg([['low', '낮음'], ['mid', '보통'], ['high', '높음']], pa.riskKey, v => { state.risk = v; save(); renderPA(); })),
      h('div', { class: 'field' }, h('span', { class: 'lab', text: '투자 기간' }), h('label', { class: 'inp' }, yIn, h('span', { class: 'u', text: '년' }))))));
  if (pa.autoPlan) box.append(h('div', { class: 'hold-issues on', style: 'margin-bottom:10px' }, h('b', { text: '보유 종목이 없어 ‘매달 투자 구성’으로 분석했어요. ' }), '보유 종목 카드에 수량을 넣으면 실제 보유 기준으로 분석합니다.'));
  if (!pa.pos.length) { box.append(h('div', { class: 'card' }, h('div', { class: 'empty', text: '분석할 종목이 없어요. 설계 화면에서 보유 종목이나 종목 구성을 입력하세요.' }))); return; }

  const grid = h('div', { class: 'pa-grid' }); box.append(grid);
  const card = (title, sub, ...kids) => h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('div', null, h('h2', { text: title }), sub ? h('p', { text: sub }) : null)), ...kids);

  // 보유 종목 및 정보
  const t = h('table', { class: 'patbl' });
  if (pa.basis === 'hold') {
    t.append(h('thead', null, h('tr', null, ...['종목', '수량', '평균 매수가', '현재가', '투자금(매수 원금)', '평가금액', '손익', '비중'].map(x => h('th', { text: x })))));
    const tb = h('tbody'); let costSum = 0, costAll = true;
    pa.pos.forEach(p => {
      const canAvg = !p.st.custom || !!p.st.priced;   // 직접 만든 종목(현재가 없음)은 손익 계산 불가
      const avgIn = h('input', { type: 'text', inputmode: 'decimal', placeholder: canAvg ? (p.mkt === 'US' ? '달러' : '원') : '—', 'aria-label': p.name + ' 평균 매수가', disabled: !canAvg });
      const curAvg = p.rows.map(i => numOr(state.hold[i].avg, 0)).find(x => x > 0); if (curAvg) avgIn.value = curAvg.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
      avgIn.addEventListener('change', () => { const a = numOr(avgIn.value, 0); p.rows.forEach(i => { if (a > 0) state.hold[i].avg = a; else delete state.hold[i].avg; }); save(); renderPA(); });
      if (p.costOk) costSum += p.cost; else costAll = false;
      tb.append(h('tr', null, h('td', null, h('span', { class: 'sw', style: `background:${color(p.id)}` }), p.name, h('span', { class: 'cd', text: p.st.code })),
        h('td', { title: p.qtyEst ? '금액으로 입력해 현재가로 환산한 추정 수량' : null, text: p.qty ? (p.qtyEst ? '≈' : '') + p.qty.toLocaleString('ko-KR', { maximumFractionDigits: p.qtyEst ? (p.qty >= 100 ? 0 : 1) : 4 }) + '주' : '금액 입력' }), h('td', null, avgIn),
        h('td', { text: p.st.custom && p.st.priced ? pxFmt(p.st.p0, p.mkt) : priceText(p.st) }), h('td', { text: p.costOk ? won(p.cost) : '—' }), h('td', { text: won(p.value) }),
        h('td', { class: p.pnl == null ? '' : dirCls(p.pnl), text: p.pnl == null ? '—' : `${sgn(p.pnl, won)} (${sp(p.pnl / p.cost * 100)})` }), h('td', { text: pct(p.w, 1) })));
    });
    tb.append(h('tr', null, h('td', { text: '현금' }), h('td', { text: '—' }), h('td', { text: '—' }), h('td', { text: '—' }), h('td', { text: won(pa.cash) }), h('td', { text: won(pa.cash) }), h('td', { text: '—' }), h('td', { text: pct(pa.cashW, 1) })));
    const pnlAll = costAll && costSum > 0 ? pa.stockVal - costSum : null;
    tb.append(h('tr', { class: 'tot' }, h('td', { text: '합계' }), h('td', { text: '' }), h('td', { text: '' }), h('td', { text: '' }), h('td', { text: costAll ? won(costSum + pa.cash) : '평균 매수가 입력 시 표시' }), h('td', { text: won(pa.total) }), h('td', { class: pnlAll == null ? '' : dirCls(pnlAll), text: pnlAll == null ? '—' : `${sgn(pnlAll, won)} (${sp(pnlAll / costSum * 100)})` }), h('td', { text: '100%' })));
    t.append(tb);
  } else {
    t.append(h('thead', null, h('tr', null, ...['종목', '매달 비중', '월 투자액', '1년 투자액', '현재가', '배당수익률', '지급월'].map(x => h('th', { text: x })))));
    const tb = h('tbody');
    pa.pos.forEach(p => tb.append(h('tr', null, h('td', null, h('span', { class: 'sw', style: `background:${color(p.id)}` }), p.name), h('td', { text: pct(p.w0 || p.w, 1) }), h('td', { text: won((p.w0 || p.w) * state.a.monthly * 1e4) }), h('td', { text: won(p.value) }), h('td', { text: priceText(p.st) }), h('td', { text: pct(p.y || yieldOf(p.st)) }), h('td', { style: 'color:var(--muted)', text: monthsText(p.st.mon) }))));
    t.append(tb);
  }
  grid.append(h('section', { class: 'card full' }, h('div', { class: 'card-h' }, h('div', null, h('h2', { text: '보유 종목 및 정보' }), h('p', { text: pa.basis === 'hold' ? '평균 매수가를 넣으면 투자금·손익이 계산돼요(미국 종목은 달러 단가 × 현재 환율로 환산, 환차손익 제외)' : `매달 투자 비중 기준 · 금액은 월 투자금 ${fx1(state.a.monthly, 0)}만원 × 12개월로 환산` }))), h('div', { class: 'hold-wrap' }, t)));

  // ① 비중·쏠림
  const barRow = (name, w, col, cap) => h('div', { class: 'hbar' }, h('span', { class: 'nm', title: name, text: name }), h('span', { class: 'tr' }, h('i', { style: `width:${Math.min(100, w * 100)}%;background:${col}` }), cap != null ? h('em', { style: `left:${Math.min(100, cap * 100)}%`, title: '한도' }) : null), h('span', { class: 'pv', text: pct(w, 1) }));
  const c1 = card('① 종목별 비중과 종목·섹터 쏠림', `세로선 = ${R.k} 성향 한도 (종목 ${pct(R.single, 0)} · 섹터 ${pct(R.sector, 0)})`);
  pa.pos.forEach(p => c1.append(barRow(p.name, p.w, color(p.id), R.single)));
  if (pa.cash > 0) c1.append(barRow('현금', pa.cashW, 'var(--cash)'));
  c1.append(h('h3', { style: 'font-size:12px;margin:12px 0 4px', text: '섹터' }));
  pa.sectors.forEach(s => c1.append(barRow(s.k, s.w, 'var(--ink-2)', /ETF/.test(s.k) ? null : R.sector)));
  c1.append(h('p', { class: 'flag', text: `국가: 국내 ${pct(pa.kr, 0)} · 미국 ${pct(pa.us, 0)}${pa.cash > 0 ? ' · 현금 ' + pct(pa.cashW, 0) : ''} · 상위 3종목 ${pct(pa.top3, 0)} · 실질 분산 종목 수 ${fx1(pa.effN, 1)}개(허핀달 지수 ${fx1(pa.hhi, 3)}: 비중 제곱합, 낮을수록 고르게 분산)` }));
  grid.append(c1);

  // ② 상관관계
  const c2 = card('② 종목 간 상관관계와 중복 투자', pa.C ? `주별 수익률 ${pa.weeks}주(${dateKo(pa.wFrom)}~${dateKo(pa.wTo)}) 기준 · 1에 가까울수록 같이 움직임` : '가격 데이터가 있는 종목이 부족해 계산하지 못했어요');
  if (pa.C) {
    const HK = 12, nK = Math.min(pa.covered.length, HK);   // 표는 비중 상위 12종목까지(종목 수 제한 없음) — 요약 문구는 전체 기준
    const ht = h('table', { class: 'heat' }), names = pa.covered.slice(0, nK).map(p => p.name);
    ht.append(h('tr', null, h('th', { text: '' }), ...names.map(nm => h('th', { title: nm, text: nm.length > 6 ? nm.slice(0, 6) + '…' : nm }))));
    pa.C.slice(0, nK).forEach((row, i) => ht.append(h('tr', null, h('th', { title: names[i], style: 'text-align:right', text: names[i].length > 8 ? names[i].slice(0, 8) + '…' : names[i] }), ...row.slice(0, nK).map((v, j) => {
      if (v == null) return h('td', { text: '—' });
      const p = Math.round(Math.min(1, Math.abs(v)) * 72), base = v >= 0 ? 'var(--s2)' : 'var(--s1)';
      return h('td', { title: `${names[i]} × ${names[j]}: ${fx1(v, 2)}`, style: `background:color-mix(in srgb, ${base} ${i === j ? 12 : p}%, var(--surface));color:${p > 48 && i !== j ? '#fff' : 'var(--ink)'}`, text: i === j ? '1' : fx1(v, 2) });
    }))));
    c2.append(h('div', { class: 'heatw' }, ht));
    if (pa.covered.length > HK) c2.append(h('p', { class: 'mini', text: `표는 비중 상위 ${HK}종목만 보여줘요 · 아래 쌍·평균은 전체 ${pa.covered.length}종목 기준` }));
    const hi = (pa.pairs || []).filter(x => x.c >= 0.6).slice(0, 4), lo = (pa.pairs || []).slice(-2).reverse();
    c2.append(h('p', { class: 'flag' + (hi.length ? ' wn' : ' ok'), text: hi.length ? '함께 움직이는 쌍(0.6 이상): ' + hi.map(x => `${x.a.name}·${x.b.name} ${fx1(x.c, 2)}`).join(', ') : '0.6 이상으로 강하게 같이 움직이는 쌍이 없어요 — 중복 투자 신호 없음' }));
    if (lo.length) c2.append(h('p', { class: 'flag', text: '가장 다르게 움직이는 쌍: ' + lo.map(x => `${x.a.name}·${x.b.name} ${fx1(x.c, 2)}`).join(', ') }));
    c2.append(h('p', { class: 'flag', text: `평균 상관계수 ${pa.avgC != null ? fx1(pa.avgC, 2) : '—'} · 국내와 미국 종목은 거래 시간대가 달라 주별 기준으로 계산` }));
  }
  const sameSec = pa.sectors.filter(s => s.w > 0 && pa.pos.filter(p => p.sector === s.k).length >= 2 && !/ETF/.test(s.k));
  if (sameSec.length) c2.append(h('p', { class: 'flag', text: '같은 섹터 보유: ' + sameSec.map(s => `${s.k}(${pa.pos.filter(p => p.sector === s.k).map(p => p.name).join('·')})`).join(' / ') }));
  if (pa.pos.some(p => /ETF/.test(p.sector)) && pa.pos.some(p => p.mkt === 'US' && !/ETF/.test(p.sector))) c2.append(h('p', { class: 'flag wn', text: '미국 배당 ETF와 개별 미국 배당주를 함께 보유 — ETF 구성종목과 겹칠 수 있어요(ETF 보유종목은 운용사 홈페이지에서 확인).' }));
  if (pa.covered.length < pa.pos.length) c2.append(h('p', { class: 'mini', text: '가격 이력이 없는 종목(미국 ETF·직접 입력)은 상관관계 계산에서 빠졌어요: ' + pa.pos.filter(p => !pa.covered.includes(p)).map(p => p.name).join(', ') }));
  grid.append(c2);

  // ③ 위험·예상 손실
  const c3 = card('③ 주요 위험 요인과 예상 손실 가능성', '과거 변동성으로 계산한 추정치 — 미래 손실 한도를 보장하지 않아요');
  const kv = (k, v, sub) => [h('dt', { text: k }), h('dd', null, v, sub ? h('div', { style: 'font-size:10.5px;color:var(--muted);font-weight:400', text: sub }) : null)];
  c3.append(h('dl', { class: 'kv' },
    ...kv('예상 연 변동성', pa.vol != null ? pct(pa.vol, 1) : '—', `주가가 1년에 평균적으로 위아래로 움직이는 폭 · 성향 목표 ${pct(R.vol, 0)} 이하`),
    ...kv('1개월 최대 예상 손실(95%)', pa.var1m != null ? `${neg}${pct(pa.var1m, 1)} (${neg}${wonT(pa.var1m * pa.total)})` : '—', '20번 중 19번은 한 달 손실이 이보다 작다는 뜻(과거 변동성·로그정규 분포 가정)'),
    ...kv('1년 최대 예상 손실(95%)', pa.var1y != null ? `${neg}${pct(pa.var1y, 1)} (${neg}${wonT(pa.var1y * pa.total)})` : '—', '배당 수입·주가 상승 기대를 빼고 계산한 보수적 값'),
    ...(pa.bt ? [...kv('최근 1년 최대 낙폭', `${neg}${pct(-pa.bt.mdd, 1)}`, `지금 비중으로 ${dateKo(pa.bt.from)}부터 보유했다면 · 저점 ${dateKo(dayStr(pa.bt.mddD))}`), ...kv('최악의 하루 / 20거래일', `${neg}${pct(-pa.bt.worst, 1)} / ${neg}${pct(-pa.bt.w20, 1)}`, `${dateKo(dayStr(pa.bt.worstD))} / ${dateKo(dayStr(pa.bt.w20D))}까지 20일`), ...kv('같은 비중 최근 1년 수익률', sp(pa.bt.ret1y * 100), '주가만(배당 제외), 매일 같은 비중 유지 가정')] : []),
    ...kv('환율 위험', pa.us > 0 ? `${neg}${pct(-pa.fxHit, 1)}` : '없음', pa.us > 0 ? `올해 원/달러가 고점 ${FX_RANGE.hi.toLocaleString('ko-KR')}원(${FX_RANGE.hiD})→저점 ${FX_RANGE.lo.toLocaleString('ko-KR')}원(${FX_RANGE.loD})으로 움직인 만큼 원화가 강해지면 미국 비중 ${pct(pa.us, 0)}에 생기는 환차손` : '미국 주식이 없어 환율 변동의 직접 영향 없음')));
  if (pa.rc && pa.rc.length) {
    c3.append(h('h3', { style: 'font-size:12px;margin:12px 0 4px', text: '위험 기여도 (변동성 중 각 종목 몫)' }));
    pa.rc.slice().sort((a, b) => b.rc - a.rc).forEach(x => c3.append(barRow(`${x.p.name} (변동성 ${pct(x.vol, 0)})`, Math.max(0, x.rc), color(x.p.id))));
  }
  const macroRisk = ['美 10년물 5.28%(연초 대비 +110bp) — 금리 민감한 배당주·리츠 밸류에이션 부담', '브렌트유 100달러대·중동 해상봉쇄 — 물가 재상승 시 연준 추가 인상 위험', '외국인 9월 코스피 21.5조원 순매도 — 국내 대형주 수급 변동성'];
  c3.append(h('h3', { style: 'font-size:12px;margin:12px 0 4px', text: '지금 시장의 주요 위험 요인 (매크로 브리핑 기준)' }), h('ul', { class: 'bul' }, ...macroRisk.map(x => h('li', { text: x }))));
  grid.append(c3);

  // 배당 현금흐름
  const c3b = card('배당 현금흐름', `현재 ${pa.basis === 'hold' ? '보유' : '구성(1년 투자액)'} 기준 연간 배당`);
  c3b.append(h('dl', { class: 'kv' }, ...kv('연간 배당(세전)', wonT(pa.divG), `포트폴리오 배당수익률 ${pct(pa.yieldP)}`), ...kv('연간 배당(세후)', wonT(pa.divN), `월평균 ${wonT(pa.divN / 12)}`), ...kv('배당 들어오는 달', `${pa.covMonths} / 12개월`, ''), ...kv('가중평균 배당성장 가정', fx1(pa.gAvg, 1) + '%', '')));
  const mxm = Math.max(...pa.monthly, 1), bars = h('div', { style: 'display:grid;grid-template-columns:repeat(12,1fr);gap:4px;align-items:end;height:70px;margin-top:10px' });
  pa.monthly.forEach((x, i) => bars.append(h('div', { title: `${i + 1}월 ${wonT(x)}(세전)`, style: `height:${Math.max(2, x / mxm * 64)}px;background:${x > 0.5 ? 'var(--ink)' : 'var(--grid)'};border-radius:3px 3px 0 0` })));
  const lab = h('div', { style: 'display:grid;grid-template-columns:repeat(12,1fr);gap:4px;font-size:10px;color:var(--muted);text-align:center' }); for (let i = 1; i <= 12; i++) lab.append(h('span', { text: i + '월' }));
  c3b.append(bars, lab);
  grid.append(c3b);

  // ④ 종목 평가
  const et = h('table', { class: 'patbl' }, h('thead', null, h('tr', null, ...['종목', '비중', '배당수익률', '배당성장 가정', '삭감 위험', '1년 수익률', '변동성', '52주 위치', 'PER', 'PBR', 'ROE', '평가 메모'].map(x => h('th', { text: x })))));
  const etb = h('tbody');
  pa.pos.forEach(p => etb.append(h('tr', null, h('td', null, p.name), h('td', { text: pct(p.w, 1) }), h('td', { text: p.st.dbOnly && p.st.noDiv ? '—' : pct(p.y) }), h('td', { text: p.st.dbOnly && p.st.noDiv ? '—' : fx1(p.st.g, 1) + '%' }), h('td', { text: p.st.dbOnly ? '—' : SAFE[p.st.safe].e }), h('td', { class: dirCls(p.r1y), text: sp(p.r1y) }), h('td', { text: p.vol1 != null ? fx1(p.vol1, 0) + '%' : '—' }), h('td', { text: p.pos52 != null ? fx1(p.pos52, 0) + '%' : '—' }), h('td', { text: p.per != null ? fx1(p.per, 1) + '배' : '—' }), h('td', { text: p.pbr != null ? fx1(p.pbr, 2) + '배' : '—' }), h('td', { text: p.roe != null ? fx1(p.roe, 1) + '%' : '—' }), h('td', { style: 'text-align:left;white-space:normal;min-width:180px;color:var(--ink-2)', text: p.memo }))));
  et.append(etb);
  grid.append(h('section', { class: 'card full' }, h('div', { class: 'card-h' }, h('div', null, h('h2', { text: '④ 성장성·수익성·밸류에이션으로 본 보유 종목 평가' }), h('p', { text: '성장성 = 배당성장 가정·1년 주가 흐름, 수익성·밸류에이션 = PER·PBR·ROE(사전 조사 리포트가 있는 종목만 — 나머지는 종목 창의 AI 분석 이용)' }))), h('div', { class: 'hold-wrap' }, et)));

  // ⑤ ⑥
  grid.append(card('⑤ 현재 포트폴리오의 강점과 취약점', `위험 감수 성향 ${R.k} · 투자 기간 ${years}년 기준`, h('h3', { style: 'font-size:12px;margin:0 0 4px', class: 'up', text: '강점' }), h('ul', { class: 'bul' }, ...pa.strengths.map(x => h('li', { text: x }))), h('h3', { style: 'font-size:12px;margin:10px 0 4px', class: 'down', text: '취약점' }), h('ul', { class: 'bul' }, ...(pa.weaknesses.length ? pa.weaknesses : ['뚜렷한 취약점 없음']).map(x => h('li', { text: x })))));
  grid.append(card('⑥ 분산투자 및 비중 조정이 필요한 부분', '규칙 기반 제안 — 매매 전 종목 창의 분석과 함께 판단하세요', h('ul', { class: 'bul' }, ...pa.actions.map(x => h('li', { text: x }))), h('p', { class: 'mini', text: `${years}년 장기 투자라면 단기 변동보다 배당 지속성(삭감 위험)과 배당 성장률이 더 중요해요. 비중 조정은 새로 넣는 적립금으로 부족한 종목을 더 사는 방식이 세금·수수료 면에서 유리합니다.` })));

  // AI 종합 분석
  const ai = aiPanel({ key: 'pf-' + JSON.stringify([pa.basis, pa.riskKey, years, pa.pos.map(p => [p.id, Math.round(p.value)])]), title: 'AI 포트폴리오 매니저 종합 분석 (가이드라인 ①~⑥)', prompt: () => promptPortfolio(pa, years, false), copy: () => promptPortfolio(pa, years, true), intro: '위 계산 결과와 보유 정보를 가이드라인 형식 그대로 Claude에게 보내 종합 의견을 받아요.' });
  grid.append(h('section', { class: 'card full' }, ai));
  box.append(h('p', { class: 'disc', text: '이 분석은 참고용입니다. 과거 주가·배당 데이터와 가정에 기반한 추정이며 미래 수익이나 손실 한도를 보장하지 않습니다.' }));
}

function promptPortfolio(pa, years, forCopy) {
  const hold = pa.pos.map(p => {
    const inv = p.costOk ? wonT(p.cost) : (pa.basis === 'plan' ? `매달 ${pct(p.w0 || p.w, 1)}` : '미입력');
    const avgP = p.rows.length ? p.rows.map(i => numOr(state.hold[i].avg, 0)).find(x => x > 0) : null;
    return `\n- ${p.name}(${p.st.code}, ${p.mkt === 'US' ? '미국' : '국내'}, ${p.sector}): 투자금 ${inv}, 평균 매수가 ${avgP ? pxFmt(avgP, p.mkt) : '미입력'}, 현재가 ${pxFmt(p.st.p0, p.mkt)}, 평가금액 ${wonT(p.value)}, 비중 ${pct(p.w, 1)}`;
  }).join('') + `\n- 현금 비중: ${pct(pa.cashW, 1)}${pa.cash ? ` (${wonT(pa.cash)})` : ''}`;
  const g = G_PF.replace('{HOLD}', hold).replace('{YEARS}', `${years}년`).replace('{RISK}', pa.R.k);
  const L = ['[앱이 계산한 분석 데이터 — 국내 ' + DATA_DATE.KR + '·미국 ' + DATA_DATE.US + ' 종가 기준]'];
  L.push(`- 분석 대상: ${pa.basis === 'hold' ? '현재 보유' : '매달 투자 구성(월 ' + fx1(state.a.monthly, 0) + '만원)'} · 총 ${wonT(pa.total)} · 국내 ${pct(pa.kr, 0)}, 미국 ${pct(pa.us, 0)}`);
  L.push('- 섹터 비중: ' + pa.sectors.map(s => `${s.k} ${pct(s.w, 1)}`).join(', '));
  L.push(`- 실질 분산 종목 수 ${fx1(pa.effN, 1)}개, 상위 3종목 ${pct(pa.top3, 0)}`);
  if (pa.C) { const pr = pa.pairs || [], f2 = x => `${x.a.name}·${x.b.name} ${fx1(x.c, 2)}`; L.push(`- 주별 상관계수(${pa.weeks}주): 평균 ${pa.avgC != null ? fx1(pa.avgC, 2) : '—'}, ` + (pr.length <= 5 ? '쌍별 ' + pr.map(f2).join(', ') : '높은 쌍 ' + pr.slice(0, 3).map(f2).join(', ') + ', 낮은 쌍 ' + pr.slice(-2).map(f2).join(', '))); }
  if (pa.vol != null) L.push(`- 예상 연 변동성 ${pct(pa.vol, 1)}, 1개월 95% VaR ${neg}${pct(pa.var1m, 1)}, 1년 95% VaR ${neg}${pct(pa.var1y, 1)}`);
  if (pa.bt) L.push(`- 최근 1년 같은 비중 백테스트: 수익률 ${sp(pa.bt.ret1y * 100)}, 최대 낙폭 ${neg}${pct(-pa.bt.mdd, 1)}, 최악의 하루 ${neg}${pct(-pa.bt.worst, 1)}(${dayStr(pa.bt.worstD)})`);
  L.push(`- 배당: 포트폴리오 배당수익률 ${pct(pa.yieldP)}, 연 세후 ${wonT(pa.divN)}, 배당 들어오는 달 ${pa.covMonths}/12, 가중평균 배당성장 가정 ${fx1(pa.gAvg, 1)}%`);
  L.push('- 종목별: ' + pa.pos.map(p => `${p.name}[배당 ${pct(p.y)}, 성장가정 ${fx1(p.st.g, 1)}%, 1년 ${sp(p.r1y)}, 변동성 ${p.vol1 != null ? fx1(p.vol1, 0) + '%' : '—'}${p.per != null ? `, PER ${p.per}` : ''}${p.pbr != null ? `, PBR ${p.pbr}` : ''}${p.roe != null ? `, ROE ${p.roe}%` : ''}]`).join('; '));
  L.push('- 매크로(2026-10-04): 美 기준금리 3.75~4.00%(9/16 인상), 美 10년물 5.28%, CPI 3.4%, 원/달러 1,350.6원, 브렌트 102달러, 코스피 7,003.74');
  L.push('- 앱 규칙 기반 점검 — 강점: ' + pa.strengths.join(' / ') + ' · 취약점: ' + (pa.weaknesses.join(' / ') || '없음'));
  return g + rulesBlock(forCopy) + '\n- 위 [앱이 계산한 분석 데이터]의 수치를 근거로 쓰고, 그 밖의 수치는 출처를 밝혀.\n\n' + L.join('\n');
}
