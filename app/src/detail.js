/* ───────── [detail] 종목 상세: 차트·지표·배당·분석 ───────── */
const DT = { tab: 'tech', range: 'd', it: null, tableView: false };
const COMPANY_T = ['① 핵심 사업 모델과 주요 수익원', '② 독보적인 경쟁력과 진입장벽', '③ 향후 3~5년 성장 가능성과 핵심 성장 동력', '④ 최근 실적과 재무 건전성', '⑤ 주요 경쟁사와 비교분석', '⑥ 현재 주가의 고평가·저평가 여부', '⑦ 투자 시 반드시 알아야 할 핵심 리스크'];
const EARN_T = ['① 매출·영업이익·EPS 실제 실적과 시장 예상치 비교', '② 어닝 서프라이즈 또는 쇼크의 주요 원인', '③ 사업 부문별 실적과 성장률', '④ 향후 실적 가이던스와 전망 변화', '⑤ 실적 발표 이후 주가에 영향을 줄 핵심 요인', '⑥ 현재 주가에 실적 개선 기대가 얼마나 반영됐는지'];
const FIN_T = ['① 매출액·영업이익·순이익의 성장 추이', '② 영업이익률·ROE·ROIC로 본 수익성', '③ 부채비율·유동비율로 본 재무 건전성', '④ 영업현금흐름과 잉여현금흐름(FCF)', '⑤ 재고자산·매출채권 등에서 보이는 위험 신호', '⑥ 경쟁사 대비 재무 성과와 핵심 차이점'];

function isEtf(it) { const st = it.cid ? U.get(it.cid) : null; return !!((st && (st.tags || []).includes('ETF')) || (it.rec && it.rec[4] === 'ETF')); }
// "[3][12]" 같은 출처 번호를 위첨자 링크로 (텍스트는 textContent로만 넣음)
function citeFrag(str, pre) {
  const frag = document.createDocumentFragment(), parts = String(str).split(/(\[\d+\](?:\[\d+\])*)/);
  parts.forEach(p => {
    if (/^\[\d+\]/.test(p)) {
      const sup = h('sup', { class: 'cite' });
      (p.match(/\d+/g) || []).forEach(nn => sup.append(h('a', { href: '#' + pre + '-' + nn, text: '[' + nn + ']', onclick: e => { e.preventDefault(); const t = document.getElementById(pre + '-' + nn); if (t) { t.scrollIntoView({ block: 'center' }); t.style.background = 'var(--hover)'; setTimeout(() => t.style.background = '', 1200); } } })));
      frag.append(sup);
    } else if (p) frag.append(document.createTextNode(p));
  });
  return frag;
}
function bullets(arr, pre) { const ul = h('ul'); (arr || []).forEach(x => ul.append(h('li', null, citeFrag(x, pre)))); return ul; }
function srcList(rep, pre) {
  const ol = h('ol', { class: 'srcs' });
  (rep.sources || []).forEach(s => ol.append(h('li', { id: pre + '-' + s.n, value: s.n }, s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.title }) : s.title, s.date ? ` (${s.date})` : '')));
  return h('details', { class: 'sub' }, h('summary', { text: `출처 ${(rep.sources || []).length}건 (본문 [번호]와 연결)` }), ol);
}
function numFmt(v, unit) {
  if (v == null || !isFinite(v)) return '—';
  const s = v < 0 ? neg : '', a = Math.abs(v);
  if (unit === '$') return s + '$' + a.toFixed(2);
  if (unit === '조원') return s + fx1(a, 1);
  if (unit && unit.includes('%')) return s + fx1(a, 1);
  return s + a.toLocaleString('ko-KR', { maximumFractionDigits: a < 100 ? 2 : 0 });
}

function renderDetail(it) {
  DT.it = it; aiAbortAll();
  const box = $('#mdDetail'); box.textContent = '';
  const rec = it.rec, sid = stockIdOf(it), st = S(sid), mkt = it.mk, rep = RESEARCH.stocks[it.id] || null, pre = 'src-' + it.code;
  box.append(h('button', { class: 'btn sm md-back', type: 'button', text: '← 검색 결과', onclick: () => $('#mdBody').classList.remove('show-detail'), style: 'margin-bottom:8px' }));

  // 머리말
  const price = rec ? rec[RF.price] : st ? st.p0 : null, chg = rec ? rec[RF.chg] : null;
  const sector = st && st.sector ? st.sector : rec ? recSectorKo(rec) : '—';
  const ind = rec && rec[0] === 'US' && !isEtfRec(rec) ? String(rec[5] || '').replace('|SP500', '') : '';   // ETF는 유형이 이미 섹터 칸에 있음
  const meta = h('div', { class: 'dt-meta' }, h('span', { text: it.code }), h('span', { text: rec ? mktLabel(rec) : (mkt === 'US' ? '미국 ETF' : '국내') }), h('span', { text: sector + (ind ? ' · ' + ind : '') }));
  if (rec && /\|SP500/.test(rec[5] || '')) meta.append(h('span', { class: 'badge', text: 'S&P500' }));
  if (rec && rec[0] === 'US' && it.name !== rec[2]) meta.append(h('span', { style: 'color:var(--muted)', text: rec[2] }));
  if (rec && rec[3]) meta.append(h('span', { style: 'color:var(--muted)', text: rec[3] }));
  if (st && st.rec) meta.append(h('span', { class: 'tag rec', text: '추천' }));
  if (rep) meta.append(h('span', { class: 'badge ok', text: '분석 리포트 ' + dateKo(rep.asof) }));
  const pBox = h('div', { class: 'dt-price' },
    h('div', { class: 'pv', text: price != null ? pxFmt(price, mkt) : '—' }),
    chg != null ? h('div', { class: 'pc ' + dirCls(chg), text: `전일 대비 ${sp(chg, 2)}` }) : null,
    h('div', { class: 'pd', text: (mkt === 'US' && price != null ? `≈ ${wonT(price * FX0)} · ` : '') + (rec ? `${dataDate(mkt)} 종가` : '배당 데이터 기준가') }));
  box.append(h('div', { class: 'dt-head' }, h('div', { style: 'min-width:0' }, h('h3', { class: 'dt-name', id: 'dtName', text: it.name }), meta), pBox));

  // 행동: 보유 추가 · 구성 담기 · 외부 링크
  const msg = h('span', { class: 'mini', role: 'status', style: 'margin:0' });
  const acts = h('div', { class: 'dt-actions' });
  const form = h('div', { class: 'dt-form' });
  if (MD.ctx.mode === 'replace') {
    acts.append(h('button', { class: 'btn primary', type: 'button', text: `직접 입력 '${MD.ctx.name || ''}' → 이 종목으로 바꾸기`, onclick: () => { if (replaceCustom(MD.ctx.key, sid)) { msg.textContent = '바꿨어요. 보유 수량은 그대로 유지돼요.'; MD.ctx = { mode: 'browse' }; setTimeout(closeModal, 700); } } }));
  }
  const canQty = !!(st && !st.custom && price != null);
  acts.append(h('button', { class: 'btn' + (MD.ctx.mode === 'hold' ? ' primary' : ''), type: 'button', text: '보유 종목에 추가', onclick: () => { form.classList.toggle('open'); if (form.classList.contains('open')) setTimeout(() => qIn.focus(), 20); } }));
  const inPlan = state.sel[sid] != null;
  acts.append(h('button', { class: 'btn' + (MD.ctx.mode === 'pick' && !inPlan ? ' primary' : ''), type: 'button', text: inPlan ? '종목 구성에서 빼기' : '종목 구성에 담기', onclick: () => {
    if (state.sel[sid] != null) { toggle(sid, false); renderDetail(it); return; }
    const err = addToPlan(sid); if (err) { msg.textContent = err; return; }
    renderDetail(it); const m2 = $('#mdDetail .dt-actions .mini'); if (m2) m2.textContent = S(sid).noDiv ? '담았어요. 배당 정보가 없어 배당 0원으로 계산돼요 — 아래 배당 칸에서 입력하세요.' : `담았어요 (종목 구성 ${Object.keys(state.sel).length}종목).`;
  } }));
  const qIn = h('input', { type: 'text', inputmode: 'decimal', placeholder: canQty ? '주 수' : '만원', 'aria-label': canQty ? '보유 주 수' : '보유 금액(만원)' });
  const aIn = h('input', { type: 'text', inputmode: 'decimal', placeholder: '선택', 'aria-label': '평균 매수가' });
  form.append(h('label', null, canQty ? '수량 ' : '금액 ', qIn, canQty ? ' 주' : ' 만원'));
  if (canQty) form.append(h('label', null, '평균 매수가 ', aIn, mkt === 'US' ? ' 달러' : ' 원'));
  form.append(h('button', { class: 'btn sm dark', type: 'button', text: '추가', onclick: () => {
    const q = numOr(qIn.value, 0); if (!(q > 0)) { msg.textContent = canQty ? '보유 주 수를 넣어 주세요.' : '보유 금액(만원)을 넣어 주세요.'; qIn.focus(); return; }
    const r = canQty ? addHolding(sid, q, numOr(aIn.value, 0)) : (() => { const row = { id: sid, mode: 'amt', v: q }; if (draft.hold) { draft.hold.push(row); renderHold(); updatePending(); return 'pending'; } state.hold.push(row); renderAll(); return 'ok'; })();
    const val = canQty ? q * price * (mkt === 'US' ? FX0 : 1) : q * 1e4;
    msg.textContent = r === 'pending' ? `추가했어요(평가 ${wonT(val)}). 보유 종목 카드에서 [조회]를 누르면 반영돼요.` : `보유 종목에 추가했어요 · 평가 ${wonT(val)} → 초기 투자금에 반영`;
    form.classList.remove('open'); qIn.value = ''; aIn.value = '';
  } }));
  if (rec) {
    const url = rec[0] === 'US' ? `https://finance.yahoo.com/quote/${encodeURIComponent(rec[1])}` : `https://finance.naver.com/item/main.naver?code=${rec[1]}`;
    acts.append(h('a', { class: 'lk', href: url, target: '_blank', rel: 'noopener noreferrer', text: rec[0] === 'US' ? 'Yahoo Finance ↗' : '네이버 증권 ↗' }));
  }
  acts.append(msg);
  box.append(acts, form);

  // 차트 + 지표 | 배당 + 리포트 요약
  const left = h('div', { style: 'min-width:0' }), right = h('div', { style: 'min-width:0;display:flex;flex-direction:column;gap:12px' });
  box.append(h('div', { class: 'dgrid' }, left, right));
  if (rec) {
    const card = h('section', { class: 'card' });
    const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': '차트 기간' });
    const ranges = rec[0] === 'US' ? [['d', '일별 1년'], ['w', '주별'], ['m', '월별'], ['y', '연도별']] : [['d', '일별 1년'], ['w', '주별 3년'], ['m', '월별 10년'], ['y', '연도별']];
    const chartHost = h('div', { class: 'chart' }), cap = h('div', { class: 'legend' }), note = h('p', { class: 'mini' });
    const tvBtn = h('button', { class: 'btn sm', type: 'button', text: DT.tableView ? '차트 보기' : '표 보기' });
    const draw = () => {
      tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.r === DT.range)));
      tvBtn.textContent = DT.tableView ? '차트 보기' : '표 보기';
      priceChart(chartHost, cap, rec, DT.range);
      note.textContent = rec[0] === 'US' ? `미국 주가는 2024.7부터 수록(배당 미반영 분할조정 종가). 기준 ${dataDate('US')}.` : rec[0] === 'KE' ? `국내 ETF는 일별 종가(분배금 미반영)로 그렸어요. 기준 ${dataDate('KR')}.` : `국내 주가는 2016년부터, 액면분할·무상증자·유상증자 권리락을 반영한 수정 종가(배당 미반영). 기준 ${dataDate('KR')}.`;
    };
    ranges.forEach(([r, lab]) => { const b = h('button', { type: 'button', role: 'tab', 'data-r': r, text: lab }); b.addEventListener('click', () => { DT.range = r; draw(); }); tabs.append(b); });
    tvBtn.addEventListener('click', () => { DT.tableView = !DT.tableView; draw(); });
    card.append(h('div', { class: 'card-h', style: 'margin-bottom:4px' }, h('div', null, h('h2', { text: '주가 차트' })), h('div', { class: 'r' }, tvBtn)), tabs, cap, chartHost, note);
    left.append(card);
    draw();
    left.append(statsGrid(rec));
  } else {
    left.append(h('section', { class: 'card' }, h('div', { class: 'empty', text: '이 종목(미국 상장 ETF)은 가격 이력 데이터에 없어 차트를 그릴 수 없어요. 배당 정보로 시뮬레이션에는 쓸 수 있습니다.' })));
  }
  right.append(divCard(it, st, rec));
  if (rep) right.append(repSnapshot(rep, mkt, pre));

  // 분석 탭
  const etf = isEtf(it);
  const atabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': '분석 종류', style: 'margin-top:14px' });
  const apane = h('div', { role: 'tabpanel' });
  const TABS = [['tech', '차트 분석'], ['company', '기업 분석'], ['earn', '실적 분석'], ['fin', '재무제표 분석']];
  const drawTab = () => {
    atabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === DT.tab)));
    apane.textContent = ''; aiAbortAll();
    if (DT.tab === 'tech') {
      if (!rec) { apane.append(h('div', { class: 'empty', text: '가격 데이터가 없어 차트 분석을 할 수 없어요.' })); return; }
      const ta = renderTech(apane, rec);
      if (ta && ta.ok) apane.append(aiPanel({ key: 'chart-' + it.id, title: 'AI 차트 해설 (위 계산값 기반)', prompt: () => promptChart(it, ta, false), copy: () => promptChart(it, ta, true) }));
    } else if (DT.tab === 'company') {
      if (rep) renderCompany(apane, rep, pre, mkt);
      apane.append(aiPanel({ key: 'company-' + it.id, title: rep ? 'AI로 다시 분석 (같은 가이드라인)' : 'AI 기업 분석', prompt: () => promptCompany(it, false), copy: () => promptCompany(it, true), intro: rep ? null : '사전 조사 리포트가 없는 종목이에요. 아래 버튼으로 가이드라인(①~⑦)에 맞춘 기업 분석을 받아 보세요.' }));
    } else if (DT.tab === 'earn') {
      if (etf) { apane.append(h('div', { class: 'empty', text: 'ETF는 개별 기업 실적 발표가 없어 실적 분석 대상이 아니에요. 분배금 정보는 위 배당 칸을 보세요.' })); return; }
      if (rep) renderEarnings(apane, rep, pre);
      apane.append(aiPanel({ key: 'earn-' + it.id, title: rep ? 'AI로 다시 분석 (같은 가이드라인)' : 'AI 실적 분석', prompt: () => promptEarnings(it, false), copy: () => promptEarnings(it, true), intro: rep ? null : '사전 조사 리포트가 없는 종목이에요. 앱 안 AI는 최신 분기 실적을 모를 수 있어, 최신 실적은 [프롬프트 복사] 후 웹 검색이 되는 Claude 채팅에서 받는 것을 권해요.' }));
    } else {
      if (etf) { apane.append(h('div', { class: 'empty', text: 'ETF는 재무제표 분석 대상이 아니에요.' })); return; }
      if (rep) renderFinancials(apane, rep, pre);
      apane.append(aiPanel({ key: 'fin-' + it.id, title: rep ? 'AI로 다시 분석 (같은 가이드라인)' : 'AI 재무제표 분석', prompt: () => promptFinancials(it, false), copy: () => promptFinancials(it, true), intro: rep ? null : '사전 조사 리포트가 없는 종목이에요. 가이드라인(①~⑥)에 맞춘 재무제표 분석을 받아 보세요.' }));
    }
    if (rep && DT.tab !== 'tech') apane.append(srcList(rep, pre));
  };
  TABS.forEach(([k, lab]) => { const b = h('button', { type: 'button', role: 'tab', 'data-t': k, text: lab + (rep && k !== 'tech' ? ' ●' : '') }); b.addEventListener('click', () => { DT.tab = k; drawTab(); }); atabs.append(b); });
  if (!rec && DT.tab === 'tech') DT.tab = 'company';
  box.append(atabs, apane);
  drawTab();
  box.append(h('p', { class: 'mini', style: 'margin-top:14px', text: '주가는 스냅샷이라 실시간 시세와 다를 수 있어요. 이 분석은 참고용입니다.' }));
}

/* 지표 표 */
function statsGrid(rec) {
  const s = rec[RF.st] || [], mkt = rec[0] === 'US' ? 'US' : 'KR', P = rec[RF.price];
  const pos = s[10] != null && s[11] != null && s[10] > s[11] ? (P - s[11]) / (s[10] - s[11]) * 100 : null;
  const cell = (k, v, cls, title) => h('div', title ? { title } : null, h('div', { class: 'k', text: k }), h('div', { class: 'v ' + (cls || ''), text: v }));
  const rc = v => cell(v[0], sp(v[1]), dirCls(v[1]));
  const g = h('div', { class: 'stats', style: 'margin-top:12px' },
    ...[['1주', s[0]], ['1개월', s[1]], ['3개월', s[2]], ['6개월', s[3]], ['연초 이후', s[4]], ['1년', s[5]], ['3년', s[6]], ['5년', s[7]]].map(rc),
    cell('52주 최고', pxFmt(s[10], mkt)), cell('52주 최저', pxFmt(s[11], mkt)), cell('52주 위치', pos == null ? '—' : fx1(pos, 0) + '%', '', '1년 최저(0%)~최고(100%) 사이에서 현재가 위치'),
    cell('변동성(1년)', s[8] == null ? '—' : fx1(s[8], 1) + '%', '', '하루 등락률의 표준편차를 1년 기준으로 환산 — 클수록 크게 출렁임'),
    cell('최대낙폭(1년)', s[9] == null ? '—' : sp(s[9]), 'down', '1년 중 고점에서 가장 크게 떨어진 비율'),
    cell(isEtfRec(rec) ? '순자산(시가총액)' : '시가총액', mcapFmt(rec)), cell(mkt === 'US' ? '20일 평균 거래대금' : '상장주식수', mkt === 'US' ? amtFmt(rec) : (rec[RF.shares] ? rec[RF.shares].toLocaleString('ko-KR') + '주' : '—')),
    cell(mkt === 'US' ? '데이터 시작' : '20일 평균 거래대금', mkt === 'US' ? dateKo(s[13]) : amtFmt(rec)));
  return h('div', null, g, h('p', { class: 'mini', text: `수익률은 ${mkt === 'US' ? '분할 조정' : '수정'} 종가 기준(배당 미포함) · 3년·5년은 ${mkt === 'US' && !isEtfRec(rec) ? '미국 데이터가 2024.7부터라 제공되지 않음' : '데이터 시작(' + dateKo(s[13]) + ') 이후 기간이 충분할 때만 표시'} · 변동성: 주가가 평균적으로 위아래로 움직이는 폭 · 최대낙폭: 고점 대비 최대 하락률` }));
}

/* 배당 칸 */
function divCard(it, st, rec) {
  const card = h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('div', null, h('h2', { text: '배당' }))));
  const tax = TAX[A().tax] || TAX.normal;
  if (st && ((!st.dbOnly && !st.custom) || st.divSrc === 'db')) {
    const y = yieldOf(st), tr = st.mkt === 'US' ? tax.US : tax.KR, etfDb = st.divSrc === 'db';
    if (etfDb) card.querySelector('h2').textContent = '분배금 (ETF)';
    const mo = h('div', { class: 'mo', style: 'grid-template-columns:repeat(12,10px);gap:3px' }), mx = Math.max(...st.mon) || 1;
    st.mon.forEach(v => mo.append(h('i', v > 0 ? { class: 'on', style: `width:10px;height:${Math.max(6, Math.round(18 * v / mx))}px` } : { style: 'width:10px;height:3px' })));
    card.append(h('dl', { class: 'kv' },
      h('dt', { text: etfDb ? '최근 12개월 분배금' : '연간 배당(주당)' }), h('dd', { text: st.mkt === 'US' ? `$${st.d0.toFixed(st.d0 < 1 ? 3 : 2)}` : `${Math.round(st.d0).toLocaleString('ko-KR')}원` }),
      h('dt', { text: etfDb ? '분배율(최근 12개월)' : '배당수익률' }), h('dd', { text: `${pct(y)} (세후 ${pct(y * (1 - tr))})` }),
      h('dt', { text: '지급월' }), h('dd', { text: monthsText(st.mon) + (etfDb ? ' (추정)' : '') }),
      h('dt', { text: '배당성장 가정' }), h('dd', { text: fx1(st.g, 1) + '% / 년' }),
      etfDb ? h('dt', { text: '분배금 변동' }) : h('dt', { text: '삭감 위험' }), etfDb ? h('dd', { text: '시장 상황에 따라 매번 달라져요' }) : h('dd', { text: `${SAFE[st.safe].e} ${SAFE[st.safe].t}` })),
      h('div', { style: 'margin:10px 0 2px' }, mo, h('div', { class: 'mo-h', style: 'grid-template-columns:repeat(12,10px);gap:3px;font-size:9px' }, ...Array.from({ length: 12 }, (_, i) => h('span', { text: (i % 3 === 0 ? i + 1 : '') + '' })))), h('p', { class: 'mini', text: st.note }));
    if (etfDb) {
      card.append(h('p', { class: 'mini', text: '분배 이력: 야후 파이낸스(배당락일 기준). 과거 분배가 앞으로도 같다는 보장은 없어요.' }));
      const det = h('details', { style: 'margin-top:6px' }, h('summary', { style: 'cursor:pointer;font-size:12px;color:var(--ink-2)', text: '분배율·지급월 직접 고치기' }));
      det.append(divOverrideForm(it, null)); card.append(det);
    }
    return card;
  }
  const id = it.id, nd = rec ? NO_DIV[rec[1]] : null, ov = state.ov[id];
  if (nd) card.append(h('p', { style: 'margin:0 0 8px;font-size:12px', text: '현재 무배당 — ' + nd.split(' · ').slice(1).join(' · ') }));
  else if (!ov && rec && rec[RF.div]) card.append(h('p', { style: 'margin:0 0 8px;font-size:12px;color:var(--ink-2)', text: `최근 12개월 분배 기록이 없어요${rec[RF.st] && rec[RF.st][13] > '2025-10' ? ` (${dateKo(rec[RF.st][13])}부터 거래)` : ''} — 분배금을 재투자하는 상품이거나 아직 분배 전일 수 있어요. 분배를 한다면 아래에 넣어 시뮬레이션에 반영하세요.` }));
  else if (!ov) card.append(h('p', { style: 'margin:0 0 8px;font-size:12px;color:var(--ink-2)', text: '이 종목은 배당 데이터가 없어요. 배당을 준다면 아래에 넣어 시뮬레이션에 반영하세요(증권사 앱 종목 정보 → 배당).' }));
  card.append(divOverrideForm(it, ov));
  return card;
}
function divOverrideForm(it, ov) {
  const id = it.id;
  const yIn = h('input', { type: 'text', inputmode: 'decimal', value: ov ? ov.y : '', placeholder: '예: 2.5', 'aria-label': '배당수익률(%)', style: 'width:70px' });
  const mSel = h('select', { 'aria-label': '배당 지급월' }); MPRESETS.forEach(([k, lab]) => mSel.append(h('option', { value: k, text: lab }))); mSel.value = ov ? ov.mp : (it.mk === 'US' ? 'q3' : 'a4');
  const gIn = h('input', { type: 'text', inputmode: 'decimal', value: ov ? ov.g : '4', 'aria-label': '연 성장률 가정(%)', style: 'width:56px' });
  const msg = h('span', { class: 'mini', role: 'status', style: 'margin:0' });
  return (h('div', { class: 'cfields', style: 'flex-direction:column;align-items:flex-start' },
    h('label', null, '배당수익률 ', yIn, ' %'), h('label', null, '지급월 ', mSel), h('label', { title: '배당과 주가가 매년 이만큼 늘어난다고 가정 (배당 없는 종목은 주가 상승률)' }, '성장 가정 ', gIn, ' %'),
    h('div', { style: 'display:flex;gap:6px;align-items:center' }, h('button', { class: 'btn sm dark', type: 'button', text: '저장', onclick: () => {
      const y = numOr(yIn.value, 0); if (y < 0 || y > 30) { msg.textContent = '배당수익률은 0~30% 사이로 넣어 주세요.'; return; }
      state.ov[id] = { y, mp: y > 0 ? mSel.value : 'none', g: numOr(gIn.value, 4) };
      refreshDbStock(id); renderAll(); msg.textContent = `저장했어요 · 배당수익률 ${fx1(y, 2)}%, ${monthsText(presetMonths(state.ov[id].mp))}`;
    } }), ov ? h('button', { class: 'btn sm', type: 'button', text: '지우기', onclick: () => { delete state.ov[id]; refreshDbStock(id); renderAll(); renderDetail(it); } }) : null, msg)));
}

/* 리포트 요약(밸류에이션·다음 실적) */
function repSnapshot(rep, mkt, pre) {
  const v = rep.valuation || {}, ne = rep.next_earnings || {}, cur = rep.currency === 'USD' ? 'US' : 'KR';
  const tp = v.target_price_avg && v.price ? (v.target_price_avg / v.price - 1) * 100 : null;
  const row = (k, val) => [h('dt', { text: k }), h('dd', { text: val })];
  return h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('div', null, h('h2', { text: '밸류에이션·실적 일정' }), h('p', { text: `사전 조사 ${dateKo(rep.asof)} · 주가 ${dateKo(v.price_date)} 종가 ${pxFmt(v.price, cur)}` }))),
    h('dl', { class: 'kv' }, ...row('PER(최근 12개월)', v.per != null ? fx1(v.per, 1) + '배' : '—'), ...row('예상 PER', v.fwd_per != null ? fx1(v.fwd_per, 1) + '배' : '—'), ...row('PBR', v.pbr != null ? fx1(v.pbr, 2) + '배' : '—'), ...row('ROE', v.roe != null ? fx1(v.roe, 1) + '%' : '—'), ...row('배당수익률', v.div_yield != null ? fx1(v.div_yield, 2) + '%' : '—'), ...row('목표주가 평균', v.target_price_avg ? `${pxFmt(v.target_price_avg, cur)} (${sp(tp)})` : '—')),
    h('div', { style: 'margin-top:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12px' }, h('span', { class: 'badge ' + (ne.status === '확정' ? 'ok' : 'wn'), text: `다음 실적 ${ne.status || ''}` }), h('b', { text: `${ne.quarter || ''} · ${ne.date || '미정'}` })),
    h('p', { class: 'mini' }, citeFrag(ne.note || '', pre)),
    h('p', { class: 'mini', text: 'PER: 주가가 1년 이익의 몇 배인지 · PBR: 주가가 장부상 순자산의 몇 배인지 · ROE: 자기자본으로 1년에 낸 이익률' }));
}

/* 리포트 본문 */
function renderCompany(host, rep, pre, mkt) {
  const c = rep.company || {}, w = h('div', { class: 'rep' });
  w.append(h('p', { class: 'note', style: 'margin:0 0 6px', text: `${rep.name} 기업 분석 · ${dateKo(rep.asof)} 기준 공시·IR·언론 자료 조사 · 숫자 뒤 [번호]는 출처` }));
  ['s1', 's2', 's3', 's4', 's5', 's6', 's7'].forEach((k, i) => {
    w.append(h('h4', { text: COMPANY_T[i] }), bullets(c[k], pre));
    if (k === 's5' && (rep.peers || []).length) {
      const t = h('table', { class: 'ftbl', style: 'margin-top:6px' }, h('thead', null, h('tr', null, ...['기업', 'PER', 'PBR', 'ROE', '영업이익률', '배당수익률'].map(x => h('th', { text: x })))));
      const tb = h('tbody'); rep.peers.forEach(p => tb.append(h('tr', { title: p.basis || '' }, h('td', { text: p.name }), h('td', { text: p.per != null ? fx1(p.per, 1) + '배' : '—' }), h('td', { text: p.pbr != null ? fx1(p.pbr, 2) + '배' : '—' }), h('td', { text: p.roe != null ? fx1(p.roe, 1) + '%' : '—' }), h('td', { text: p.opm != null ? fx1(p.opm, 1) + '%' : '—' }), h('td', { text: p.div_yield != null ? fx1(p.div_yield, 2) + '%' : '—' }))));
      t.append(tb); w.append(h('div', { class: 'tblw' }, t), h('p', { class: 'note', text: '경쟁사 수치는 행에 마우스를 올리면 기준일·출처가 보여요. 자본잠식 기업은 PBR·ROE를 계산할 수 없어 —로 표시.' }));
    }
  });
  host.append(w);
}
function renderEarnings(host, rep, pre) {
  const e = rep.earnings || {}, ne = rep.next_earnings || {}, w = h('div', { class: 'rep' });
  w.append(h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;font-size:12px' },
    h('span', { class: 'badge', text: `최근 발표: ${e.quarter || ''} (${dateKo(e.release_date)})` }),
    h('span', { class: 'badge ' + (ne.status === '확정' ? 'ok' : 'wn'), text: `다음 발표 ${ne.status || ''}: ${ne.quarter || ''} · ${ne.date || '미정'}` })));
  if ((e.table || []).length) {
    const t = h('table', { class: 'ftbl' }, h('thead', null, h('tr', null, ...['항목', '실제 실적', '시장 예상치', '차이', '전년 대비'].map(x => h('th', { text: x })))));
    const tb = h('tbody');
    e.table.forEach(r => {
      const sur = r.actual != null && r.consensus ? (r.actual / r.consensus - 1) * 100 : null;
      tb.append(h('tr', null, h('td', { text: `${r.item} (${r.unit})` }), h('td', { text: numFmt(r.actual, r.unit) }), h('td', { text: r.consensus != null ? numFmt(r.consensus, r.unit) : '확인 불가' }), h('td', { class: dirCls(sur), text: sur == null ? '—' : sp(sur) }), h('td', { class: dirCls(r.yoy_pct), text: r.yoy_pct == null ? '—' : sp(r.yoy_pct) })));
    });
    t.append(tb); w.append(h('div', { class: 'tblw' }, t), h('p', { class: 'note', text: '실제 실적은 회사 발표, 시장 예상치는 발표 전 컨센서스(출처는 본문 [번호]). 확인하지 못한 예상치는 "확인 불가"로 남겼어요.' }));
  }
  ['s1', 's2', 's3', 's4', 's5', 's6'].forEach((k, i) => w.append(h('h4', { text: EARN_T[i] }), bullets(e[k], pre)));
  w.append(h('div', { class: 'box3' },
    h('div', null, h('b', { class: 'up', text: '핵심 호재 3' }), bullets(e.pos, pre)),
    h('div', null, h('b', { class: 'down', text: '핵심 악재 3' }), bullets(e.neg, pre)),
    h('div', null, h('b', { text: '앞으로 확인할 지표' }), bullets(e.watch, pre))));
  host.append(w);
}
function renderFinancials(host, rep, pre) {
  const F = rep.financials || {}, w = h('div', { class: 'rep' }), unit = F.unit || '';
  const vb = String(F.verdict || ''), cls = /^우량/.test(vb) ? 'ok' : /^양호/.test(vb) ? 'ok' : /^주의/.test(vb) ? 'bd' : 'wn';
  if (vb) w.append(h('div', { style: 'margin-bottom:8px;font-size:12.5px;display:flex;gap:8px;align-items:flex-start' }, h('span', { class: 'badge ' + cls, text: vb.split(/[\s—\-:]/)[0] || '평가' }), h('span', null, citeFrag(vb.replace(/^(우량|양호|보통|주의)\s*[-—:]?\s*/, ''), pre))));
  const years = F.years || [], rows = F.rows || {};
  if (years.length) {
    const t = h('table', { class: 'ftbl' }, h('thead', null, h('tr', null, h('th', { text: `항목 (${unit})` }), ...years.map(y => h('th', { text: y })))));
    const tb = h('tbody');
    Object.keys(rows).forEach(k => {
      const isPct = /%/.test(k);
      tb.append(h('tr', null, h('td', { text: k }), ...years.map((_, i) => { const v = rows[k][i]; return h('td', { class: v < 0 ? 'down' : '', text: v == null ? '—' : isPct ? numFmt(v, '%') : numFmt(v, unit) }); })));
    });
    t.append(tb); w.append(h('div', { class: 'tblw' }, t), h('p', { class: 'note' }, citeFrag('데이터 기준: ' + (F.row_src || ''), pre)));
  }
  ['s1', 's2', 's3', 's4', 's5', 's6'].forEach((k, i) => w.append(h('h4', { text: FIN_T[i] }), bullets(F[k], pre)));
  if ((F.threats || []).length) w.append(h('h4', { text: '잠재적 위협 요소' }), bullets(F.threats, pre));
  w.append(h('p', { class: 'note', text: '용어 풀이 — 영업이익률: 매출 중 본업으로 남긴 이익 비율 · ROE: 자기자본 대비 1년 순이익 · ROIC: 영업에 투입한 자본 대비 이익률 · 부채비율: 부채÷자본(낮을수록 안정) · 유동비율: 1년 안에 갚을 빚 대비 1년 안에 현금화할 자산(100% 이상이면 양호) · FCF(잉여현금흐름): 영업으로 번 현금에서 설비투자를 뺀 돈, 배당·자사주의 재원' }));
  host.append(w);
}

/* 주가 차트 (일별: 이동평균 + 거래량) */
function priceChart(host, cap, rec, range) {
  host.textContent = ''; cap.textContent = '';
  const mkt = rec[0] === 'US' ? 'US' : 'KR', S0 = seriesOf(rec, range), t = S0.t, v = S0.v, n = v.length;
  if (n < 2) { host.append(h('div', { class: 'empty', text: '이 기간에 그릴 데이터가 부족해요.' })); return; }
  const daily = range === 'd', vol = daily ? volumesOf(rec).slice(-n) : null;
  const mas = daily ? [[20, 'var(--s2)'], [60, 'var(--s1)'], [120, 'var(--s7)']].map(([k, col]) => ({ k, col, a: sma(v, k) })) : [];
  const first = v[0], last = v[n - 1], prd = (last / first - 1) * 100;
  const lbl = { d: '1년', w: (n / 52).toFixed(1).replace('.0', '') + '년', m: (n / 12).toFixed(1).replace('.0', '') + '년', y: '전체' }[range];
  cap.append(h('span', null, h('i', { class: 'k-line', style: 'background:var(--ink)' }), '종가'));
  mas.forEach(m => cap.append(h('span', null, h('i', { class: 'k-line', style: `background:${m.col}` }), m.k + '일선')));
  if (daily) cap.append(h('span', null, h('i', { class: 'k-rect', style: 'background:var(--up-fill);opacity:.6' }), '거래량(상승일)'), h('span', null, h('i', { class: 'k-rect', style: 'background:var(--down-fill);opacity:.6' }), '하락일'));
  cap.append(h('span', { style: 'margin-left:auto;font-weight:600', class: dirCls(prd), text: `${lbl} 기간 수익률 ${sp(prd)}` }));
  const fmtD = dn => { const d = new Date(dn * 864e5), y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, dd = d.getUTCDate(); return range === 'y' ? `${y}` : range === 'm' ? `${y}.${m}` : `${y}.${m}.${dd}`; };
  if (DT.tableView) {
    const tb = h('tbody');
    for (let i = n - 1; i >= Math.max(0, n - 60); i--) tb.append(h('tr', null, h('td', { text: fmtD(t[i]) }), h('td', { text: pxNum(v[i], mkt) }), h('td', { class: i ? dirCls(v[i] - v[i - 1]) : '', text: i ? sp((v[i] / v[i - 1] - 1) * 100, 2) : '—' }), daily ? h('td', { text: Math.round(vol[i]).toLocaleString('ko-KR') }) : null));
    host.append(h('div', { class: 'tv-wrap' }, h('table', { class: 'tv' }, h('thead', null, h('tr', null, h('th', { text: '날짜' }), h('th', { text: '종가' }), h('th', { text: '직전 대비' }), daily ? h('th', { text: '거래량(근사)' }) : null)), tb)));
    return;
  }
  const W = Math.max(host.clientWidth || 640, 300), PH = 230, VH = daily ? 56 : 0, m = { l: 8, r: 58, t: 12, b: 22 }, HH = m.t + PH + (VH ? VH + 8 : 0) + m.b, pw = W - m.l - m.r;
  let lo = Math.min(...v), hi = Math.max(...v); mas.forEach(mm => mm.a.forEach(x => { if (x != null) { if (x < lo) lo = x; if (x > hi) hi = x; } }));
  const pad = (hi - lo) * 0.08 || hi * 0.05; lo -= pad; hi += pad;
  const raw = (hi - lo) / 4, p10 = Math.pow(10, Math.floor(Math.log10(raw))), step = p10 * [1, 2, 2.5, 5, 10].find(s => p10 * s >= raw);
  const ticks = []; for (let y = Math.ceil(lo / step) * step; y <= hi; y += step) ticks.push(y);
  const X = i => m.l + (n === 1 ? pw / 2 : i / (n - 1) * pw), Y = y => m.t + PH - (y - lo) / (hi - lo) * PH;
  const s = sv('svg', { viewBox: `0 0 ${W} ${HH}`, width: W, height: HH, role: 'img', 'aria-label': `${recName(rec)} ${lbl} 종가 ${pxFmt(first, mkt)}에서 ${pxFmt(last, mkt)}, ${sp(prd)}` });
  const tfmt = y => mkt === 'US' ? (y >= 1000 ? Math.round(y).toLocaleString('en-US') : y.toFixed(step < 1 ? 2 : step < 10 ? 1 : 0)) : (y >= 1e4 ? Math.round(y).toLocaleString('ko-KR') : Math.round(y).toLocaleString('ko-KR'));
  ticks.forEach(y => { sv('line', { x1: m.l, x2: m.l + pw, y1: Math.round(Y(y)) + .5, y2: Math.round(Y(y)) + .5, class: 'gl' }, s); if (Y(y) < m.t + PH - 8 || !VH) sv('text', { x: m.l + pw + 6, y: Y(y) + 3.5, class: 'ax' }, s).textContent = tfmt(y); });
  const nt = Math.min(6, n), xt = []; for (let k = 0; k < nt; k++) xt.push(Math.round(k * (n - 1) / Math.max(1, nt - 1)));
  const xl = dn => { const d = new Date(dn * 864e5); return range === 'y' ? String(d.getUTCFullYear()) : range === 'd' ? `${d.getUTCMonth() + 1}/${d.getUTCDate()}` : `${String(d.getUTCFullYear()).slice(2)}.${d.getUTCMonth() + 1}`; };
  [...new Set(xt)].forEach(i => sv('text', { x: X(i), y: HH - 6, 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle', class: 'ax' }, s).textContent = xl(t[i]));
  sv('polygon', { points: `${X(0)},${m.t + PH} ` + v.map((y, i) => `${X(i)},${Y(y)}`).join(' ') + ` ${X(n - 1)},${m.t + PH}`, style: 'fill:var(--ink);opacity:.06' }, s);
  mas.forEach(mm => { const pts = mm.a.map((y, i) => y == null ? null : `${X(i)},${Y(y)}`).filter(Boolean).join(' '); if (pts) sv('polyline', { points: pts, style: `fill:none;stroke:${mm.col};stroke-width:1.5;stroke-linejoin:round` }, s); });
  sv('polyline', { points: v.map((y, i) => `${X(i)},${Y(y)}`).join(' '), style: 'fill:none;stroke:var(--ink);stroke-width:2;stroke-linejoin:round;stroke-linecap:round' }, s);
  sv('circle', { cx: X(n - 1), cy: Y(last), r: 4, style: 'fill:var(--ink);stroke:var(--surface);stroke-width:2' }, s);
  if (VH) {
    const vt = m.t + PH + 8, vmax = Math.max(...vol) || 1, bw = Math.max(1, pw / n - 1);
    sv('line', { x1: m.l, x2: m.l + pw, y1: vt + VH + .5, y2: vt + VH + .5, class: 'bl' }, s);
    vol.forEach((q, i) => { const hh = q / vmax * VH; if (hh <= 0) return; sv('rect', { x: X(i) - bw / 2, y: vt + VH - hh, width: bw, height: hh, style: `fill:${i && v[i] < v[i - 1] ? 'var(--down-fill)' : 'var(--up-fill)'};opacity:.5` }, s); });
    sv('text', { x: m.l + pw + 6, y: vt + VH, class: 'ax' }, s).textContent = '거래량';
  }
  const guide = sv('line', { x1: 0, x2: 0, y1: m.t, y2: m.t + PH + (VH ? VH + 8 : 0), class: 'guide', style: 'opacity:0' }, s);
  const dot = sv('circle', { r: 4, style: 'fill:var(--ink);stroke:var(--surface);stroke-width:2;opacity:0' }, s);
  const ov = sv('rect', { x: m.l, y: m.t, width: pw, height: PH + (VH ? VH + 8 : 0), class: 'hit', tabindex: 0, 'aria-label': '차트 (좌우 화살표로 이동)' }, s);
  let cur = n - 1;
  const show = (i, cx, cy) => {
    cur = i; const x = X(i); guide.setAttribute('x1', x); guide.setAttribute('x2', x); guide.style.opacity = 1; dot.setAttribute('cx', x); dot.setAttribute('cy', Y(v[i])); dot.style.opacity = 1;
    showTip(el => {
      el.append(h('div', { class: 'tt', text: fmtD(t[i]) + (range === 'w' ? ' 주' : '') }), h('div', { class: 'tv1', text: pxFmt(v[i], mkt) }));
      if (i) el.append(tipRow(v[i] >= v[i - 1] ? 'var(--up-fill)' : 'var(--down-fill)', sp((v[i] / v[i - 1] - 1) * 100, 2), '직전 대비'));
      el.append(tipRow('var(--ghost)', sp((v[i] / first - 1) * 100), '기간 시작 대비'));
      mas.forEach(mm => { if (mm.a[i] != null) el.append(tipRow(mm.col, pxNum(mm.a[i], mkt), mm.k + '일선')); });
      if (daily) el.append(h('div', { class: 'tf', text: `거래량 약 ${Math.round(vol[i]).toLocaleString('ko-KR')}주` }));
    }, cx, cy);
  };
  const hide = () => { guide.style.opacity = 0; dot.style.opacity = 0; hideTip(); };
  ov.addEventListener('pointermove', e => { const r = s.getBoundingClientRect(), px = (e.clientX - r.left) * (W / r.width); show(Math.max(0, Math.min(n - 1, Math.round((px - m.l) / pw * (n - 1)))), e.clientX, e.clientY); });
  ov.addEventListener('pointerleave', hide); ov.addEventListener('blur', hide);
  ov.addEventListener('focus', () => { const r = s.getBoundingClientRect(); show(cur, r.left + X(cur) * r.width / W, r.top + 30); });
  ov.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const i = Math.max(0, Math.min(n - 1, cur + (e.key === 'ArrowRight' ? 1 : -1))); const r = s.getBoundingClientRect(); show(i, r.left + X(i) * r.width / W, r.top + 30); } });
  host.append(s);
  if (range === 'y' && n >= 2) {
    const yr = h('div', { class: 'pl', style: 'margin-top:6px' });
    for (let i = 1; i < n; i++) { const r = (v[i] / v[i - 1] - 1) * 100; yr.append(h('span', { class: 'chip' }, new Date(t[i] * 864e5).getUTCFullYear() + (i === n - 1 ? '년(연초 이후) ' : '년 '), h('b', { class: dirCls(r), text: sp(r) }))); }
    host.append(yr);
  }
}
