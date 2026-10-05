/* ───────── [advisor] 메인 화면 'AI에 조언 구하기' (Claude 앱에서는 바로 답, 그 밖에서는 질문 복사) ───────── */
const ADV = { turns: [], busy: false, ctl: null };
// 별명 → 종목코드/티커 (DB의 한글명으로 못 찾는 흔한 호칭)
const ADV_ALIAS = {
  '삼전': '005930', '하닉': '000660', '하이닉스': '000660', '현차': '005380', '기아차': '000270', '엔솔': '373220', '엘지엔솔': '373220', '삼바': '207940', '셀트': '068270',
  '네이버': '035420', '포스코': '005490', '한전': '015760', '두산에너빌': '034020', '한화에어로': '012450', '케이티앤지': '033780',
  '애플': 'AAPL', '엔비디아': 'NVDA', '테슬라': 'TSLA', '마이크로소프트': 'MSFT', '마소': 'MSFT', '구글': 'GOOGL', '알파벳': 'GOOGL', '아마존': 'AMZN', '메타': 'META', '페이스북': 'META',
  '넷플릭스': 'NFLX', '브로드컴': 'AVGO', '팔란티어': 'PLTR', '인텔': 'INTC', '퀄컴': 'QCOM', '오라클': 'ORCL', '마이크론': 'MU', '코카콜라': 'KO', '펩시': 'PEP', '맥도날드': 'MCD',
  '스타벅스': 'SBUX', '리얼티인컴': 'O', '존슨앤드존슨': 'JNJ', '존슨앤존슨': 'JNJ', '코스트코': 'COST', '월마트': 'WMT', '디즈니': 'DIS', '나이키': 'NKE', '비자': 'V', '마스터카드': 'MA',
  'JP모건': 'JPM', '엑슨모빌': 'XOM', '셰브론': 'CVX', '화이자': 'PFE', '일라이릴리': 'LLY', '유나이티드헬스': 'UNH', '보잉': 'BA', '세일즈포스': 'CRM', '어도비': 'ADBE',
  '아이온큐': 'IONQ', '코인베이스': 'COIN', '스트래티지': 'MSTR', '마이크로스트래티지': 'MSTR', '로빈후드': 'HOOD', '슈드': 'SCHD', '제피': 'JEPI', '제피큐': 'JEPQ'
};
// 국내 ETF 브랜드 한글 표기 → 영문 (단어 단위로만 바꿈)
const ADV_BRAND = { '타이거': 'tiger', '코덱스': 'kodex', '에이스': 'ace', '라이즈': 'rise', '플러스': 'plus', '하나로': 'hanaro', '키움': 'kiwoom', '솔': 'sol', '아리랑': 'arirang', '킨덱스': 'kindex' };
// 흔한 낱말과 같은 종목명은 질문 속 단어로는 연결하지 않음
const ADV_STOP = new Set(['대상', '성장', '가치', '미래', '시장', '한국', '배당', '진로', '선진', '이건', '우리', '전망', '수익', '보유']);
// 한국 기업의 미국 상장 ADR 티커 → 국내 종목코드 (국내 투자자는 대부분 국내 종목을 뜻함)
const ADV_ADR = { KB: '105560', SHG: '055550', WF: '316140', KEP: '015760', PKX: '005490', KT: '030200', SKM: '017670', LPL: '034220' };
const ADV_JOSA = /(은|는|이|가|을|를|에|의|도|랑|하고|으로|로|과|와|에서|까지|만|이랑|이야|야|요)$/;
const ADV_FILLER = /^(어떻게|생각해|생각|유망해|유망|지금|사도|될까|어때|어때요|전망|분석|분석해줘|해줘|알려줘|괜찮아|괜찮을까|매수|매도|투자|배당|종목|주식|미국|국내|좋아|좋을까|사야|팔아야|할까|요즘|앞으로|계속|들고|가도|살까|팔까|이번|정도|얼마|뭐|왜|어느|어디|그리고|차트|실적|재무|재무제표|etf|펀드|지수|상품|주식들|고배당|배당주|성장주|가치주|커버드콜|월배당|채권|리츠|비교|비교해줘|추천|추천해줘)$/;

function advFindStocks(q) {
  if (!SIDX) buildIndex();
  const tok = String(q).split(/\s+/).map(w => ADV_BRAND[w.toLowerCase()] || w).join(' ');
  const nq = normQ(tok), found = [];
  const toks = new Set(tok.split(/[\s,?!·/]+/).map(w => normQ(w.replace(ADV_JOSA, ''))).filter(Boolean));
  const byCode = (code, mk) => SIDX.find(x => x.code === code && (!mk || x.mk === mk));
  for (const [k, code] of Object.entries(ADV_ALIAS)) {
    const nk = normQ(k), i = nq.indexOf(nk);
    if (i >= 0) { const it = byCode(code, /^\d{6}$/.test(code) ? 'KR' : 'US') || SIDX.find(x => x.cid === code); if (it) found.push({ it, s: i, e: i + nk.length, len: nk.length + 0.5 }); }
  }
  for (const it of SIDX) {
    for (const key of [it.n, it.ko]) {
      if (!key || key.length < 2 || ADV_STOP.has(key)) continue;
      if (/^[a-z0-9]+$/.test(key) && key.length < 4 && !toks.has(key)) continue;   // 짧은 영문 이름(SK·LG·KT&G)은 단어 그대로 썼을 때만
      const i = nq.indexOf(key); if (i >= 0) found.push({ it, s: i, e: i + key.length, len: key.length });
    }
  }
  (String(q).match(/\b\d{6}\b/g) || []).forEach(c => { const it = byCode(c, 'KR'); if (it) found.push({ it, s: -1, e: -1, len: 99 }); });
  (String(q).match(/(?<![A-Za-z0-9&가-힣])[A-Z][A-Z.\-]{1,5}(?![A-Za-z0-9&가-힣])/g) || []).forEach(t => {
    const it = ADV_ADR[t] ? byCode(ADV_ADR[t], 'KR') : (byCode(t, 'US') || SIDX.find(x => x.cid === t && x.mk === 'US'));
    if (it) found.push({ it, s: -1, e: -1, len: 98 });
  });
  // 소문자로 쓴 티커(예: dram, schd) — 3~5글자 영문 단어가 미국 종목 코드와 같을 때
  const EN_STOP = new Set(['the', 'and', 'for', 'etf', 'you', 'not', 'can', 'how', 'why', 'buy', 'sell', 'hold', 'good', 'bad', 'what', 'vs']);
  toks.forEach(w => { if (/^[a-z]{3,5}$/.test(w) && !EN_STOP.has(w)) { const it = byCode(w.toUpperCase(), 'US') || SIDX.find(x => x.cid === w.toUpperCase() && x.mk === 'US'); if (it) found.push({ it, s: -1, e: -1, len: 97 }); } });
  if (!found.length) {   // 이름 일부로 묻는 경우(예: '미국배당다우존스') → 이름에 그 단어가 든 종목 중 규모가 큰 것
    tok.split(/[\s,.?!·/]+/).map(w => normQ(w.replace(ADV_JOSA, ''))).filter(w => w.length >= 3 && !ADV_FILLER.test(w)).forEach(w => {
      const c = SIDX.filter(x => x.n.includes(w) || (x.ko && x.ko.includes(w))).sort((a, b) => b.mcap - a.mcap)[0];
      if (c) found.push({ it: c, s: -1, e: -1, len: w.length });
    });
  }
  found.sort((a, b) => (b.len - a.len) || (b.it.mcap - a.it.mcap));
  const taken = [], out = [];
  for (const f of found) {
    if (out.some(o => o.id === f.it.id)) continue;
    if (f.s >= 0 && taken.some(([s, e]) => f.s < e && f.e > s)) continue;
    if (f.s >= 0) taken.push([f.s, f.e]);
    out.push(f.it); if (out.length >= 3) break;
  }
  return out;
}
function advIntent(q, its) {
  const s = String(q).replace(/\s/g, '');
  if (/포트폴리오|내종목|보유종목|내계좌|리밸런싱|비중조정/.test(s)) return 'pf';
  if (its.length && /차트|지지선|저항선|이동평균|이평선|RSI|MACD|기술적|매수구간|손절|분할매수/i.test(s)) return 'chart';
  if (its.length && /실적|어닝|분기|컨센서스|가이던스|EPS/i.test(s)) return 'earn';
  if (its.length && /재무|부채비율|현금흐름|FCF|ROIC|영업이익률/i.test(s)) return 'fin';
  if (its.length && /기업분석|사업모델|경쟁력|해자|진입장벽/.test(s)) return 'company';
  if (!its.length && /매크로|시장전망|증시전망|금리|환율|연준|FOMC|경기|인플레|물가|증시/.test(s)) return 'macro';
  return 'opinion';
}
function advRules(forCopy) {
  return `너는 월가에서 20년 넘게 일한 주식 애널리스트이자 포트폴리오 매니저야. 사용자의 질문에 전문가 수준으로 분석해서 답해 줘.

[답변 원칙]
` + (forCopy
    ? `- 웹 검색으로 최신 공시·실적·주가를 확인하고, 주요 수치마다 출처(문서명·날짜)를 달아 줘. 아래 [앱 데이터]는 참고용 스냅샷이니 더 최신 자료가 있으면 그것을 우선하고 기준일을 밝혀.`
    : `- 너는 지금 웹 검색을 할 수 없어. 질문에 붙은 [앱 데이터]와 네가 학습한 지식(2026년 상반기까지)만 사용해.
- 학습 지식에서 가져온 수치에는 기준 시점과 출처 이름을 적고, 이후 바뀌었을 수 있다고 밝혀. 확인되지 않은 최신 수치는 '확인 필요'로 쓰고 절대 지어내지 마.`) + `
- 긍정 요인과 부정 요인을 균형 있게 다루고, '무조건 사라/팔아라' 같은 단정 대신 조건과 근거가 있는 판단을 줘.
- 지지·저항·분할매수·손절 가격은 [앱 데이터]의 차트 지표와 종가에서 나온 값만 쓰고 근거를 적어.
- [앱 데이터]의 종목은 질문 속 단어로 자동으로 찾은 거야. 질문과 관계없는 종목이면 무시하고, 묻는 종목이 앱 데이터에 없으면 그렇다고 밝힌 뒤 아는 범위에서 답해.
- [내 포트폴리오]와 관련 있으면 그 맥락(비중, 손익, 월배당 목표)을 반영해 조언해.

[형식]
- 한국어. 마크다운 제목(###)·불릿(-)·표만 사용. 전체 1쪽 안팎. 음수는 '-' 대신 '▲'로 표기. 전문 용어는 괄호로 쉽게 풀어 줘.
- 종목 의견을 묻는 질문: ### 한 줄 결론(긍정·중립·신중 중 하나와 핵심 이유) → ### 핵심 근거(사업·실적·밸류에이션·차트·배당 중 중요한 3~5개) → ### 리스크(3개) → ### 체크포인트와 대응(앞으로 볼 지표·일정, 분할매수·손절 기준) 순서.
- ETF를 물으면 기초지수·운용 전략, 분배 정책과 분배율, 비용(총보수), 환율·추적 위험, 비슷한 상품과의 차이를 중심으로 같은 순서에 맞춰 답해.
- 질문에 [분석 형식]이 붙어 있으면 그 형식을 따라.
- 마지막 줄은 '이 분석은 참고용입니다'.`;
}
function advContext() {
  const L = [];
  if (MACRO) {
    L.push(`[시장 요약 — ${dateKo(MACRO.asof)} 기준, 공식 자료·언론으로 확인한 값]`);
    MACRO.tiles.forEach(t => { const c = mchg(t.chg); L.push(`- ${t.k}: ${t.v}${c ? ` (${c.lab} ${c.txt})` : ''} · ${t.d}`); });
    if (MACRO.headline) L.push(`- 요약: ${MACRO.headline}`);
    L.push('');
  }
  const a = state.a;
  L.push('[내 포트폴리오 — 앱에 입력한 값]');
  L.push(`- 매달 투자 ${fx1(a.monthly, 0)}만원 · ${a.years}년 · 목표 월배당 ${fx1(a.target, 0)}만원(${a.basis === 'gross' ? '세전' : '세후'}) · 위험 감수 성향 ${(RISKP[state.risk] || RISKP.mid).k}`);
  try { const M = CUR ? metrics(CUR_PORT, CUR) : null; if (M) L.push(`- 지금 계획대로면 ${CUR.H}년 후 월배당 ${man(M.m)}원(목표 대비 ${fx1(M.ach * 100, 0)}%), 평가액 ${won(M.value)}`); } catch (e) { /* 계산 전 */ }
  const hold = state.hold.filter(r => holdValue(r) > 0);
  L.push(hold.length ? '- 보유: ' + hold.map(r => {
    if (r.id === CASH) return `현금 ${wonT(holdValue(r))}`;
    const st = holdStock(r), p = pnlOf(r);
    return `${st ? st.name : '종목'} ${wonT(holdValue(r))}${p ? ` (평균 매수가 대비 ${sp(p.pct * 100, 1)})` : ''}`;
  }).join(', ') : '- 보유 종목: 입력 없음');
  const items = itemsOf(state.sel);
  if (items.length) L.push('- 매달 투자 구성: ' + items.map(x => `${x.st.name} ${pct(x.w, 1)}`).join(', '));
  return L.join('\n');
}
function advStockData(it, intent) {
  const L = [stockData(it, intent === 'earn' ? 'earn' : intent === 'fin' ? 'fin' : 'company')];
  if (it.rec) {
    let ta = null; try { ta = techAnalysis(it.rec); } catch (e) { ta = null; }
    if (ta && ta.ok) {
      const f = v => pxFmt(tickRound(v, ta.mkt), it.mk);
      L.push(`- 차트 요약(앱 계산): ${ta.summary}`);
      L.push(`- 주요 가격대(앱 계산): 1차 지지 ${f(ta.S1.v)}, 2차 지지 ${f(ta.S2.v)}, 1차 저항 ${f(ta.R1.v)}, 2차 저항 ${f(ta.R2.v)}${ta.stop ? ', 손절 참고 ' + f(ta.stop.v != null ? ta.stop.v : ta.stop) : ''}`);
      if (intent === 'chart') {
        ta.sec.forEach(s => { L.push(`${s.no} ${s.title}`); s.items.forEach(x => L.push('  - ' + x)); });
        const D = seriesOf(it.rec, 'd'), n = D.v.length;
        L.push(`- 최근 20거래일 종가: ` + D.v.slice(-20).map((v, i) => `${dayStr(D.t[n - 20 + i]).slice(5)} ${pxNum(v, it.mk)}`).join(', '));
      }
    }
  }
  return L.join('\n');
}
function advUserContent(q, its, intent, forCopy) {
  const L = [`[질문] ${q}`];
  if (intent === 'pf') {
    try { const pa = paCompute(state.paBasis, state.risk); if (pa.pos.length) L.push('', '[분석 형식과 데이터 — 포트폴리오 분석]', promptPortfolio(pa, state.paYears || state.a.years, forCopy)); } catch (e) { /* 데이터 부족 */ }
  } else if (intent === 'macro') {
    L.push('', '[분석 형식과 데이터 — 매크로 분석]', promptMacro(forCopy));
  }
  const G = { company: G_COMPANY, earn: G_EARN, fin: G_FIN, chart: G_CHART }[intent];
  if (G && its.length) L.push('', '[분석 형식]', G.replace('{T}', tgt(its[0])));
  its.forEach(it => L.push('', advStockData(it, intent)));
  return L.join('\n');
}
function advCopyPrompt(q) {
  const its = advFindStocks(q), intent = advIntent(q, its);
  return advRules(true) + '\n\n' + advContext() + '\n\n' + advUserContent(q, its, intent, true);
}
function advSuggestions() {
  const out = [];
  const held = state.hold.map(r => holdStock(r)).filter(st => st && !st.custom && !st.holdOnly);
  const plan = itemsOf(state.sel).map(x => x.st).filter(st => !st.custom);
  if (held[0]) out.push(`${held[0].name} 계속 들고 가도 될까?`);
  const b = plan.find(st => !held.length || st.id !== held[0].id);
  if (b) out.push(`${b.name} 배당 안전해?`);
  out.push('엔비디아 유망해?', '삼성전자 차트 분석해줘', '내 포트폴리오 점검해줘', '지금 금리 환경에서 배당주 비중 늘려도 될까?');
  return [...new Set(out)].slice(0, 6);
}

/* 화면: 오른쪽 아래 작은 버튼 → 채팅 창 */
function advNote() {
  return SAMPLE
    ? `질문 속 종목의 시세(국내 ${dataDate('KR')}·미국 ${dataDate('US')})·차트·배당·리포트와 내 포트폴리오를 함께 보내요 · 웹 검색은 못 해요 · 질문마다 Claude 사용량이 쓰여요`
    : '여기서는 AI가 바로 답할 수 없어요. [질문 복사] → Claude 채팅(웹 검색 켜기)에 붙여 넣으세요. Claude 앱에서 연 아티팩트에서는 바로 답해요.';
}
function advRefresh() {
  const send = $('#advSend'); if (send) send.textContent = SAMPLE ? '보내기' : '질문 복사';
  const note = $('#advNote'); if (note) note.textContent = advNote();
  const web = $('#advWeb'); if (web) web.hidden = !SAMPLE;
}
function advQEl(t) {
  const wrap = h('div', { class: 'adv-qw' }, h('div', { class: 'adv-q', text: t.show }));
  if (t.stocks && t.stocks.length) {
    const ref = h('div', { class: 'adv-ref' }, '참고:');
    t.stocks.forEach(s => ref.append(h('button', { class: 'linkish', type: 'button', title: s.name + ' 차트·분석 창 열기', text: `${s.name}(${s.code})`, onclick: () => openStock(s.id) })));
    wrap.append(ref);
  }
  return wrap;
}
function advAEl(t) {
  const el = h('div', { class: 'adv-a' });
  const out = h('div', { class: 'ai-out' }); el.append(out);
  if (t.content) renderMd(out, t.content); else if (t.pending) out.append(h('span', { class: 'adv-think', text: 'Thinking... 보통 10초~1분' + (ADV.turns.filter(x => x.role === 'assistant').length <= 1 ? ' (처음엔 사용 허용 창이 떠요)' : '') }));
  const foot = h('div', { class: 'adv-af' });
  if (t.note) foot.append(h('span', { text: t.note }));
  if (t.content && !t.pending) {
    const cp = h('button', { class: 'linkish', type: 'button', text: '답변 복사' });
    cp.addEventListener('click', async () => { const ok = await copyText(t.content); cp.textContent = ok ? '복사했어요' : '복사가 막혔어요'; setTimeout(() => cp.textContent = '답변 복사', 1500); });
    foot.append(cp);
  }
  if (foot.childNodes.length) el.append(foot);
  t._el = out;
  return el;
}
function advNear() { const sc = $('#advBody'); return !sc || sc.scrollHeight - sc.scrollTop - sc.clientHeight < 80; }
function advStick() { const sc = $('#advBody'); if (sc) sc.scrollTop = sc.scrollHeight; }
function advRenderLog(stick) {
  const log = $('#advLog'); if (!log) return;
  const near = advNear();
  log.textContent = '';
  ADV.turns.forEach(t => log.append(t.role === 'user' ? advQEl(t) : advAEl(t)));
  const empty = $('#advEmpty'); if (empty) empty.hidden = ADV.turns.length > 0;
  if (stick || near) advStick();
}
function advSetBusy(b) {
  const send = $('#advSend'), stop = $('#advStop');
  if (send) send.hidden = b; if (stop) stop.hidden = !b;
  document.querySelectorAll('#advisor .adv-chips .chip').forEach(c => { c.disabled = b; });
}
function advToggle(force) {
  const panel = $('#advPanel'), fab = $('#advFab'); if (!panel || !fab) return;
  const open = force != null ? !!force : panel.hidden;
  panel.hidden = !open; fab.setAttribute('aria-expanded', String(open)); fab.classList.toggle('on', open);
  if (open) {
    const dot = $('#advFab .adv-dot'); if (dot) dot.hidden = true;
    advRenderLog(true);
    setTimeout(() => { const q = $('#advQ'); if (q) q.focus(); }, 20);
  } else fab.focus();
}
async function advSend(qText) {
  const ta = $('#advQ'), msg = $('#advMsg');
  const q = String(qText != null ? qText : (ta ? ta.value : '')).trim();
  if (!q || ADV.busy) return;
  if (msg) msg.textContent = '';
  if (!SAMPLE) {   // 사이트 등 Claude 밖: 질문 + 앱 데이터를 복사
    const txt = advCopyPrompt(q), ok = await copyText(txt);
    if (msg) msg.textContent = ok ? '복사했어요 → Claude 채팅(웹 검색 켜기)에 붙여 넣으세요' : '복사가 막혀 아래에 펼쳤어요 (전체 선택 후 복사)';
    if (!ok) { const log = $('#advLog'); log.textContent = ''; const box = h('textarea', { readonly: true, style: 'width:100%;height:200px;font-size:11.5px;font-family:inherit' }); box.value = txt; log.append(box); const e = $('#advEmpty'); if (e) e.hidden = true; }
    return;
  }
  const its = advFindStocks(q), intent = advIntent(q, its);
  const user = { role: 'user', show: q, content: advUserContent(q, its, intent, false), stocks: its.map(it => ({ id: stockIdOf(it), name: it.name, code: it.code })) };
  const ans = { role: 'assistant', content: '', pending: true };
  ADV.turns.push(user, ans);
  if (ta && qText == null) ta.value = '';
  advRenderLog(true);
  const ctl = new AbortController(); ADV.ctl = ctl; ADV.busy = true; advSetBusy(true); AI_RUNS.add(ctl);
  const hist = ADV.turns.filter(t => !t.failed && (t.role === 'user' || t.content)).slice(-9);
  const input = [{ role: 'user', content: advRules(false) + '\n\n' + advContext() }, ...hist.map(t => ({ role: t.role, content: t.content }))];
  try {
    const res = await SAMPLE(input, { signal: ctl.signal, cache: false, onText: ({ text }) => {
      const first = !ans.content; ans.content = text;
      if (first || !ans._el || !document.contains(ans._el)) advRenderLog(); else { const near = advNear(); renderMd(ans._el, text); if (near) advStick(); }
    } });
    ans.content = res.text; if (res.truncated) ans.note = '답변이 길어 중간에 끊겼어요. 범위를 좁혀 다시 물어보세요.';
  } catch (e) {
    const code = e && e.code;
    ans.content = (e && e.text) || '';
    ans.note = code === 'cancelled' ? '중지했어요.' : (AI_ERR[code] || '답하지 못했어요. 다시 물어봐 주세요.');
    if (!ans.content) { ans.failed = true; user.failed = true; }
    if (['not_granted', 'sampling_disabled', 'capability_disabled', 'not_declared', 'capability_removed'].includes(code)) { SAMPLE = null; refreshAiUi(); }
  } finally {
    ans.pending = false; ADV.busy = false; ADV.ctl = null; AI_RUNS.delete(ctl);
    advSetBusy(false); advRenderLog();
    const panel = $('#advPanel'), dot = $('#advFab .adv-dot');
    if (panel && panel.hidden && dot && ans.content) dot.hidden = false;   // 창을 닫아 둔 사이 답이 오면 점 표시
  }
}
function advIcon() {
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS(ns, 'path'); p.setAttribute('d', 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z'); svg.append(p);
  [8, 12, 16].forEach(x => { const c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', x); c.setAttribute('cy', 12); c.setAttribute('r', '0.6'); c.setAttribute('fill', 'currentColor'); svg.append(c); });
  return svg;
}
function renderAdvisor() {
  const box = $('#advisor'); if (!box) return;
  box.textContent = '';
  const fab = h('button', { class: 'adv-fab', id: 'advFab', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'advPanel', 'aria-label': 'AI에 조언 구하기 열기', title: 'AI에 조언 구하기 — 종목·포트폴리오를 물어보세요' }, advIcon(), h('span', { text: 'AI 조언' }));
  const dot = h('i', { class: 'adv-dot', 'aria-hidden': 'true' }); dot.hidden = true; fab.append(dot);
  const panel = h('section', { class: 'adv-panel', id: 'advPanel', 'aria-labelledby': 'advTitle' }); panel.hidden = true;
  const close = h('button', { class: 'adv-x', type: 'button', 'aria-label': 'AI 조언 창 닫기', text: '×' });
  panel.append(h('div', { class: 'adv-ph' }, h('div', { style: 'min-width:0' }, h('b', { id: 'advTitle', text: 'AI에 조언 구하기' }), h('span', { class: 'adv-sub', text: '월가 애널리스트 관점 · 앱 데이터 기반' })), close));
  const chips = h('div', { class: 'adv-chips' });
  advSuggestions().forEach(sq => chips.append(h('button', { class: 'chip', type: 'button', text: sq, onclick: () => advSend(sq) })));
  panel.append(h('div', { class: 'adv-body', id: 'advBody' },
    h('div', { class: 'adv-empty', id: 'advEmpty' }, h('p', { text: '"삼성전자 어떻게 생각해?", "SCHD 유망해?"처럼 물어보세요. 차트·실적·재무제표·포트폴리오·시장을 물으면 정해 둔 분석 형식으로 답해요.' }), chips),
    h('div', { class: 'adv-log', id: 'advLog', 'aria-live': 'polite' })));
  const ta = h('textarea', { id: 'advQ', rows: 2, maxlength: 600, placeholder: '예: 삼성전자 지금 사도 될까?', 'aria-label': 'AI에게 질문' });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); advSend(); } });
  const send = h('button', { class: 'btn primary sm', id: 'advSend', type: 'button', text: SAMPLE ? '보내기' : '질문 복사' });
  send.addEventListener('click', () => advSend());
  const stop = h('button', { class: 'btn sm', id: 'advStop', type: 'button', text: '중지' }); stop.hidden = true;
  stop.addEventListener('click', () => { if (ADV.ctl) ADV.ctl.abort(); });
  panel.append(h('div', { class: 'adv-in' }, ta, h('div', { class: 'adv-btns' }, send, stop)));
  const web = h('button', { class: 'linkish', id: 'advWeb', type: 'button', text: '웹 검색용 복사' }); web.hidden = !SAMPLE;
  web.addEventListener('click', async () => {
    const q = (ta.value || '').trim() || (ADV.turns.filter(t => t.role === 'user').slice(-1)[0] || {}).show;
    const m = $('#advMsg'); if (!q) { m.textContent = '질문을 먼저 입력하세요'; return; }
    const ok = await copyText(advCopyPrompt(q)); m.textContent = ok ? '복사했어요 → Claude 채팅(웹 검색 켜기)에 붙여 넣으세요' : '복사가 막혔어요';
  });
  const clear = h('button', { class: 'linkish', type: 'button', text: '대화 지우기' });
  clear.addEventListener('click', () => { if (ADV.ctl) ADV.ctl.abort(); ADV.turns = []; advRenderLog(); const m = $('#advMsg'); if (m) m.textContent = ''; ta.focus(); });
  panel.append(h('div', { class: 'adv-foot' }, h('span', { class: 'mini', id: 'advMsg', role: 'status', style: 'margin:0' }), h('span', { style: 'display:flex;gap:10px' }, web, clear)));
  panel.append(h('p', { class: 'adv-note', id: 'advNote', text: advNote() }));
  fab.addEventListener('click', () => advToggle());
  close.addEventListener('click', () => advToggle(false));
  panel.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal:not([hidden])')) { e.stopPropagation(); advToggle(false); } });
  box.append(panel, fab);
  advRenderLog(true);
}
