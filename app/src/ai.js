/* ───────── [ai] 앱 안 AI(Claude) · 분석 가이드라인 프롬프트 ───────── */
let SAMPLE = null;
const AI_RUNS = new Set(), AI_CACHE = new Map();
try {
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('sample').then(s => { SAMPLE = s || null; refreshAiUi(); }).catch(() => { /* 사용 불가 */ });
  }
} catch (e) { /* 사용 불가 */ }
function refreshAiUi() {
  document.querySelectorAll('[data-ai-run]').forEach(b => { b.hidden = !SAMPLE; });
  document.querySelectorAll('[data-ai-note]').forEach(n => { n.textContent = aiNote(); });
  if (typeof advRefresh === 'function') advRefresh();
}
function aiAbortAll() { AI_RUNS.forEach(c => { try { c.abort(); } catch (e) { /* 무시 */ } }); AI_RUNS.clear(); }
function aiNote() {
  return SAMPLE
    ? '앱 안 AI는 웹 검색을 하지 못해 이 화면의 데이터와 학습된 지식(2026년 상반기까지)으로 답해요. 확인되지 않은 최신 수치는 "확인 필요"로 쓰도록 지시했어요. 최신 공시 기반 분석이 필요하면 [프롬프트 복사] → Claude 채팅(웹 검색 켜기)에 붙여 넣으세요.'
    : 'Claude 앱(artifact)에서 열면 [AI 분석 실행] 버튼이 나타나요. 지금은 [프롬프트 복사]로 가이드라인과 이 화면의 데이터를 복사해 Claude 채팅(웹 검색 켜기)에 붙여 넣으면 같은 형식의 분석을 받을 수 있어요.';
}
const AI_ERR = {
  not_granted: 'AI 사용을 허용하지 않아 실행하지 못했어요. [프롬프트 복사]를 이용하세요.', sampling_disabled: '이 계정에서는 앱 안 AI를 쓸 수 없어요. [프롬프트 복사]를 이용하세요.',
  capability_disabled: '이 화면에서는 앱 안 AI를 쓸 수 없어요.', not_declared: '이 화면에서는 앱 안 AI를 쓸 수 없어요.',
  rate_limited: '요청이 많거나 사용량 한도에 도달했어요. 잠시 후 다시 눌러 주세요.', session_expired: '로그인이 만료됐어요. 다시 로그인한 뒤 시도해 주세요.',
  refused: 'AI가 이 요청에는 답하지 않았어요.', prompt_too_large: '보낼 데이터가 너무 많아요.', upstream_error: '일시적인 오류로 중단됐어요. 다시 눌러 주세요.', empty_completion: '답변이 비어 있어요. 다시 눌러 주세요.'
};
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {
    try { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e2) { return false; }
  }
}
// 마크다운 일부(제목·불릿·굵게·표)를 안전하게 DOM으로
function renderMd(el, md) {
  el.textContent = '';
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  let list = null, tbl = null, head = false;
  const inline = (s, parent) => { String(s).split(/(\*\*[^*]+\*\*)/).forEach(p => { if (/^\*\*[^*]+\*\*$/.test(p)) parent.append(h('b', { text: p.slice(2, -2) })); else if (p) parent.append(document.createTextNode(p)); }); return parent; };
  for (const raw of lines) {
    const ln = raw.replace(/\s+$/, '');
    if (!ln.trim()) { list = null; tbl = null; continue; }
    let m;
    if ((m = ln.match(/^\s*(#{1,4})\s+(.*)$/))) { list = null; tbl = null; el.append(inline(m[2], h(m[1].length <= 2 ? 'h3' : 'h4'))); continue; }
    if (/^\s*\|.*\|\s*$/.test(ln)) {
      const cells = ln.trim().slice(1, -1).split('|').map(x => x.trim());
      if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue;
      if (!tbl) { tbl = h('table', { class: 'ftbl' }); el.append(h('div', { class: 'tblw' }, tbl)); head = true; list = null; }
      const tr = h('tr'); cells.forEach(c => tr.append(inline(c, h(head ? 'th' : 'td')))); tbl.append(tr); head = false; continue;
    }
    if ((m = ln.match(/^\s*(?:[-*•·]|\d+[.)])\s+(.*)$/))) { if (!list) { list = h('ul'); el.append(list); } tbl = null; list.append(inline(m[1], h('li'))); continue; }
    list = null; tbl = null; el.append(inline(ln.trim(), h('p')));
  }
}
// 공용 AI 패널: [AI 분석 실행](Claude 앱에서만) · [중지] · [프롬프트 복사]
function aiPanel(o) {
  const wrap = h('div', { class: 'ai' });
  const out = h('div', { class: 'ai-out', 'aria-live': 'polite' });
  const run = h('button', { class: 'btn sm primary', type: 'button', 'data-ai-run': '1', text: 'AI 분석 실행' }); run.hidden = !SAMPLE;
  const stop = h('button', { class: 'btn sm', type: 'button', text: '중지' }); stop.hidden = true;
  const copy = h('button', { class: 'btn sm', type: 'button', text: '프롬프트 복사' });
  const msg = h('span', { class: 'mini', role: 'status', style: 'margin:0' });
  wrap.append(h('div', { class: 'ai-h' }, h('b', { text: o.title }), h('span', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap' }, msg, run, stop, copy)));
  if (o.intro) wrap.append(h('div', { class: 'ai-msg', style: 'color:var(--ink-2)', text: o.intro }));
  wrap.append(h('div', { class: 'ai-msg', 'data-ai-note': '1', text: aiNote() }), out);
  if (AI_CACHE.has(o.key)) renderMd(out, AI_CACHE.get(o.key));
  let ctl = null;
  run.addEventListener('click', async () => {
    if (!SAMPLE) return;
    ctl = new AbortController(); AI_RUNS.add(ctl);
    run.disabled = true; stop.hidden = false; msg.textContent = ''; out.textContent = 'Thinking... (보통 10초~1분, 처음엔 사용 허용 창이 떠요)';
    try {
      const res = await SAMPLE(o.prompt(), { signal: ctl.signal, onText: ({ text }) => renderMd(out, text), cache: { gcTime: 3600000 } });
      renderMd(out, res.text); AI_CACHE.set(o.key, res.text);
      if (res.truncated) msg.textContent = '답변이 길어 중간에 끊겼어요.';
    } catch (e) {
      const code = e && e.code;
      if (e && e.text) renderMd(out, e.text); else if (code !== 'cancelled') out.textContent = '';
      if (['not_granted', 'sampling_disabled', 'capability_disabled', 'not_declared', 'capability_removed'].includes(code)) { SAMPLE = null; refreshAiUi(); }
      if (code !== 'cancelled') msg.textContent = AI_ERR[code] || '실행하지 못했어요. 다시 눌러 주세요.';
    } finally { run.disabled = false; stop.hidden = true; AI_RUNS.delete(ctl); }
  });
  stop.addEventListener('click', () => { if (ctl) ctl.abort(); });
  copy.addEventListener('click', async () => {
    const txt = o.copy(), ok = await copyText(txt);
    msg.textContent = ok ? '복사했어요 → Claude 채팅(웹 검색 켜기)에 붙여 넣으세요' : '복사가 막혀 아래에 펼쳤어요 (전체 선택 후 복사)';
    if (!ok) { out.textContent = ''; const ta = h('textarea', { readonly: true, style: 'width:100%;height:240px;font-size:11.5px;font-family:inherit' }); ta.value = txt; out.append(ta); }
  });
  return wrap;
}

/* 사용자 지정 분석 가이드라인 (원문) */
const G_COMPANY = `너는 월가의 전문 주식 애널리스트야.
{T}를 다음 항목에 따라 분석해줘.
① 핵심 사업 모델과 주요 수익원
② 독보적인 경쟁력과 진입장벽
③ 향후 3~5년 성장 가능성과 핵심 성장 동력
④ 최근 실적과 재무 건전성
⑤ 주요 경쟁사와 비교분석
⑥ 현재 주가의 고평가, 저평가 여부
⑦ 투자 시 반드시 알아야 할 핵심 리스크
최신 공시와 신뢰할 수 있는 자료를 활용하고, 주요 수치에는 출처를 명시해줘. 긍정적인 전망뿐 아니라 부정적인 요인도 객관적으로 분석해.`;
const G_CHART = `너는 월가의 전문 주식 애널리스트야.
{T}의 최신 주가 차트를 분석해 줘.
① 현재 주가 추세와 차트 패턴
② 주요 지지선과 저항선
③ 이동평균선(20,60,120일선) 배열과 추세
④ 거래량을 통한 매수, 매도세 분석
⑤ RSI, MACD 등 주요 보조지표 분석
⑥ 현재 주가의 주요 상승, 하락 시나리오
⑦ 분할매수 고려 구간과 손절 기준
실제 최신 주가 데이터를 바탕으로 분석하고, 주요 가격대의 산출 근거를 제시해줘. 확인되지 않은 가격은 임의로 만들지마.`;
const G_EARN = `너는 월가의 전문 주식 애널리스트야.
{T}의 최신 분기 실적 발표를 분석해 줘.
① 매출, 영업이익, EPS 실제 실적과 시장 예상치 비교
② 어닝 서프라이즈 또는 쇼크의 주요 원인
③ 사업 부문별 실적과 성장률 분석
④ 향후 실적 가이던스와 전망 변화
⑤ 실적 발표 이후 주가에 영향을 줄 핵심 요인
⑥ 현재 주가에 실적 개선 기대가 얼마나 반영됐는지 분석
최신 실적 발표 자료와 신뢰할 수 있는 출처를 활용하고, 실제 수치와 시장 예상치를 구분해 줘. 마지막에는 이번 실적의 핵심 호재 3가지, 악재 3가지, 향후 확인해야 할 지표를 요약해 줘. 확인되지 않은 수치는 임의로 만들지 마.`;
const G_FIN = `너는 기업 재무 분석 전문가다.
{T}의 최근 3~5년간 재무제표를 분석해 줘.
① 매출액, 영업이익, 순이익의 성장 추이
② 영업이익률, ROE, ROIC 를 통한 수익성 분석
③ 부채비율, 유동비율을 통한 재무 건전성
④ 영업현금흐름과 잉여현금흐름(FCF) 분석
⑤ 재고자산, 매출채권 등에서 발견되는 위험 신호
⑥ 경쟁사 대비 재무 성과와 핵심 차이점
최신 공시를 바탕으로 실제 수치와 출처를 제시하고, 재무적으로 우량한 기업인지, 잠재적인 위협 요소는 무엇인지 객관적으로 평가해줘. 확인되지 않은 수치는 임의로 추정하지 마.`;
const G_PF = `너는 글로벌 자산운용사의 포트폴리오 매니저다.
내 투자 포트폴리오를 분석해 줘.
보유 종목 및 정보 : {HOLD}
① 종목별 비중과 특정 종목, 섹터 쏠림 분석
② 종목 간 상관관계와 중복 투자 여부
③ 포트폴리오의 주요 위험 요인과 예상 손실 가능성
④ 성장성, 수익성, 밸류에이션을 고려한 보유 종목 평가
⑤ 현재 포트폴리오의 강점과 취약점
⑥ 분산투자 및 비중 조정이 필요한 부분
내 투자 기간은 {YEARS}, 위험 감수 성향은 {RISK}이다.
최신 데이터를 활용하고, 객관적인 근거를 제시해줘.`;
const G_MACRO = `너는 글로벌 거시경제 전문 애널리스트다.
현재 글로벌 경제 상황과 주식시장에 미치는 영향을 분석해 줘.
① 미국 기준금리와 연준(Fed)의 통화정책 방향
② 물가, 고용, GDP 등 핵심 경제지표 분석
③ 달러 인덱스와 원, 달러 환율의 흐름
④ 미국 국채금리와 유동성이 증시에 미치는 영향
⑤ 미중 갈등, 지정학적 리스크 등 주요 변수
⑥ 향후 증시의 낙관, 기준, 비관 시나리오
⑦ 시나리오별 유리하거나 불리할 수 있는 업종
최신 경제지표와 공식 자료를 활용하고, 발표일과 출처를 명시해 줘. 확인된 사실과 전망을 구분하고, 주식 투자자가 주목해야 할 핵심 지표 3가지를 요약해 줘.`;

function rulesBlock(forCopy) {
  return forCopy
    ? `\n\n[작성 규칙]\n- 웹 검색으로 최신 공시·발표 자료를 확인하고 주요 수치마다 출처(문서명·날짜, 가능하면 URL)를 달아줘.\n- 아래 [앱 데이터]는 참고용 스냅샷이야. 더 최신 자료가 있으면 그것을 우선하고 기준일을 밝혀줘.\n- 한국어로, 항목별 2~4개 불릿으로 간결하게(1~2쪽). 음수는 '-' 대신 '▲'로 표기.\n- 전문 용어는 쉬운 말로 풀어줘. 마지막 줄에 '이 분석은 참고용입니다'.`
    : `\n\n[작성 규칙]\n- 너는 지금 웹 검색을 할 수 없어. 아래 [앱 데이터]와 네가 학습한 지식만 사용해.\n- 학습 지식에서 가져온 수치에는 기준 시점과 출처 이름(예: 2025년 사업보고서, 2026년 1분기 실적발표)을 적고, 이후 바뀌었을 수 있다고 밝혀.\n- 확인되지 않은 최신 수치는 '확인 필요'로 쓰고 절대 임의로 만들지 마.\n- 한국어로, 항목별 2~4개 불릿으로 간결하게(전체 1~2쪽). 음수는 '-' 대신 '▲'로 표기. 마크다운 제목(###)·불릿(-)·표만 사용.\n- 전문 용어는 쉬운 말로 풀어줘. 마지막 줄에 '이 분석은 참고용입니다'.`;
}
function tgt(it) { return `${it.name}(${it.mk === 'US' ? '티커 ' : '종목코드 '}${it.code})`; }
function stockData(it, kind) {
  const rec = it.rec, st = S(stockIdOf(it)), mkt = it.mk, L = [];
  L.push(`[앱 데이터 — 국내 ${DATA_DATE.KR}·미국 ${DATA_DATE.US} 종가 스냅샷]`);
  L.push(`- 종목: ${it.name} (${it.code}, ${rec ? mktLabel(rec) : (mkt === 'US' ? '미국' : '국내')}), 섹터: ${(st && st.sector) || (rec ? recSectorKo(rec) : '—')}${rec && rec[0] === 'US' && rec[5] ? ', 업종: ' + String(rec[5]).replace('|SP500', '') : ''}`);
  if (rec) {
    const s = rec[RF.st];
    L.push(`- 현재가 ${pxFmt(rec[RF.price], mkt)} (전일 대비 ${sp(rec[RF.chg], 2)}), ${isEtfRec(rec) ? '순자산(시가총액)' : '시가총액'} ${mcapFmt(rec)}`);
    L.push(`- 수익률: 1개월 ${sp(s[1])}, 3개월 ${sp(s[2])}, 연초 이후 ${sp(s[4])}, 1년 ${sp(s[5])}${s[6] != null ? ', 3년 ' + sp(s[6]) : ''} · 52주 범위 ${pxFmt(s[11], mkt)}~${pxFmt(s[10], mkt)} · 1년 변동성 ${s[8] != null ? fx1(s[8], 1) + '%' : '—'} · 1년 최대낙폭 ${sp(s[9])}`);
  }
  if (st && ((!st.dbOnly && !st.custom) || st.divSrc === 'db')) L.push(`- ${st.divSrc === 'db' ? '분배금(최근 12개월 실적)' : '배당'}: 연 ${st.mkt === 'US' ? '$' + st.d0.toFixed(2) : Math.round(st.d0).toLocaleString('ko-KR') + '원'}, 수익률 ${pct(yieldOf(st))}, 지급월 ${monthsText(st.mon)}, 메모: ${st.note}`);
  else if (rec && NO_DIV[rec[1]]) L.push(`- 배당: 현재 무배당 (${NO_DIV[rec[1]]})`);
  const rep = RESEARCH.stocks[it.id];
  if (rep) {
    const v = rep.valuation || {}, ne = rep.next_earnings || {};
    L.push(`- 사전 조사(${rep.asof}, 출처 확인된 값): PER ${v.per ?? '—'}배, 예상 PER ${v.fwd_per ?? '—'}배, PBR ${v.pbr ?? '—'}배, ROE ${v.roe ?? '—'}%, 배당수익률 ${v.div_yield ?? '—'}%, 목표주가 평균 ${v.target_price_avg ?? '—'} · 다음 실적 ${ne.quarter || ''} ${ne.date || ''}(${ne.status || ''})`);
    const F = rep.financials || {};
    if ((kind === 'fin' || kind === 'company') && F.years) { L.push(`- 재무(${F.unit}, ${F.years.join('/')}):`); Object.keys(F.rows || {}).forEach(k => L.push(`  · ${k}: ${(F.rows[k] || []).map(x => x == null ? '—' : x).join(' / ')}`)); }
    const E = rep.earnings || {};
    if ((kind === 'earn' || kind === 'company') && E.table) { L.push(`- 최근 실적 ${E.quarter}(${E.release_date} 발표):`); E.table.forEach(r => L.push(`  · ${r.item}: 실제 ${r.actual ?? '—'}${r.unit}, 예상 ${r.consensus ?? '확인 불가'}, 전년비 ${r.yoy_pct ?? '—'}%`)); }
    if (kind === 'company' && (rep.peers || []).length) L.push('- 경쟁사: ' + rep.peers.map(p => `${p.name} PER ${p.per ?? '—'}·PBR ${p.pbr ?? '—'}·ROE ${p.roe ?? '—'}%`).join(' / '));
  }
  return L.join('\n');
}
function promptCompany(it, forCopy) { return G_COMPANY.replace('{T}', tgt(it)) + rulesBlock(forCopy) + '\n\n' + stockData(it, 'company'); }
function promptEarnings(it, forCopy) { return G_EARN.replace('{T}', tgt(it)) + rulesBlock(forCopy) + '\n- 최신 분기를 확인할 수 없으면 네가 아는 가장 최근 분기를 분석하되 어느 분기인지 맨 위에 밝혀.\n\n' + stockData(it, 'earn'); }
function promptFinancials(it, forCopy) { return G_FIN.replace('{T}', tgt(it)) + rulesBlock(forCopy) + '\n\n' + stockData(it, 'fin'); }
function promptChart(it, ta, forCopy) {
  const rec = it.rec, D = seriesOf(rec, 'd'), mkt = it.mk, n = D.v.length, vol = volumesOf(rec).slice(-n);
  const rows = []; for (let i = Math.max(0, n - 30); i < n; i++) rows.push(`${dayStr(D.t[i])} ${pxNum(D.v[i], mkt)} (거래량 약 ${Math.round(vol[i]).toLocaleString('ko-KR')})`);
  const L = [stockData(it, 'chart'), '', '[앱이 계산한 차트 지표 — 위 종가로 계산, 가격대는 이 값만 사용]', `- 요약: ${ta.summary}`];
  ta.sec.forEach(s => { L.push(`${s.no} ${s.title}`); s.items.forEach(x => L.push('  - ' + x)); });
  L.push('', `[최근 30거래일 종가(${mkt === 'US' ? '달러' : '원'})]`, ...rows);
  return G_CHART.replace('{T}', tgt(it)) + rulesBlock(forCopy) + '\n- 지지·저항·매수 구간 가격은 아래 [앱이 계산한 차트 지표]와 종가에서 나온 값만 쓰고, 근거를 함께 적어.\n\n' + L.join('\n');
}
