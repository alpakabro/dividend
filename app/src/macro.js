/* ───────── [macro] 메인 화면 매크로 브리핑 ───────── */
const MACRO = window.MACRO || null;
const SECT_ETF = [['SPY', 'S&P500'], ['QQQ', '나스닥100'], ['IWM', '러셀2000'], ['SOXX', '반도체'], ['XLK', '기술'], ['XLE', '에너지'], ['XLV', '헬스케어'], ['XLI', '산업재'], ['XLB', '소재'], ['XLP', '필수소비재'], ['XLF', '금융'], ['XLRE', '부동산'], ['XLC', '커뮤니케이션'], ['XLU', '유틸리티'], ['XLY', '경기소비재']];
function msrc(code) {
  if (code === 'DB') return { title: MACRO ? MACRO.db_note : '앱 DB 자체 계산', url: null, date: DATA_DATE.US };
  if (MACRO && MACRO.src_auto && MACRO.src_auto[code]) return MACRO.src_auto[code];   // Y·F·B: 지표 타일 자동 수집 출처(야후 파이낸스·FRED·한국은행), refresh.py가 기록
  const set = code[0] === 'U' ? (RESEARCH.macro.us || {}) : (RESEARCH.macro.kr || {}), n = +code.slice(1);
  return (set.sources || []).find(s => s.n === n) || null;
}
function mcite(codes) {
  if (!codes || !codes.length) return null;
  const sup = h('sup', { class: 'cite' });
  codes.forEach(c => sup.append(h('a', { href: '#msrc-' + c, text: '[' + c + ']', title: (msrc(c) || {}).title || '', onclick: e => { e.preventDefault(); const det = $('#macroSrc'); if (det) det.open = true; const t = document.getElementById('msrc-' + c); if (t) { t.scrollIntoView({ block: 'center' }); t.style.background = 'var(--hover)'; setTimeout(() => t.style.background = '', 1200); } } })));
  return sup;
}
// 타일 등락: 일간 시세는 전일 대비, 월간 통계는 전월 대비, 정책금리는 직전 결정 대비
function mchg(c) {
  if (!c || !isFinite(c.cur) || !isFinite(c.prev)) return null;
  const d = c.cur - c.prev, sign = v => (v > 0 ? '+' : neg);
  let txt, r;
  if (c.kind === 'bp') { r = Math.round(d * 100); txt = r ? sign(r) + Math.abs(r) + 'bp' : '변동 없음'; }
  else if (c.kind === 'pp') { r = Math.round(d * 100) / 100; txt = r ? sign(r) + String(Math.abs(r)) + '%p' : '변동 없음'; }
  else {
    const dp = c.dp == null ? 2 : c.dp; r = +d.toFixed(dp);
    txt = r ? sign(r) + (c.pre || '') + fx1(r, dp) + (c.unit || '') + ` (${sp(d / c.prev * 100, 2)})` : '변동 없음';
  }
  return { d: r, txt, lab: c.lab || '전일 대비' };
}
function renderMacro() {
  const box = $('#macro'); box.textContent = '';
  if (!MACRO) { box.hidden = true; return; }
  const folded = !!state.macroFold;   // 브리핑 전체 접기(제목 줄만 남김)
  box.classList.toggle('open', !folded && !!state.macroOpen);
  box.classList.toggle('folded', folded);
  const tog = h('button', { class: 'btn sm', type: 'button', 'aria-expanded': String(!!state.macroOpen), text: state.macroOpen ? '전체 분석 접기' : '전체 분석 보기 (①~⑦)' });
  tog.addEventListener('click', () => { state.macroOpen = !state.macroOpen; save(); renderMacro(); if (state.macroOpen) setTimeout(() => box.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30); });
  const fold = h('button', { class: 'btn sm fold', type: 'button', 'aria-expanded': String(!folded), 'aria-controls': 'macroContent', title: folded ? '매크로 브리핑 펼치기' : '매크로 브리핑 접기', text: folded ? '펼치기 ▾' : '접기 ▴' });
  fold.addEventListener('click', () => { state.macroFold = !folded; save(); renderMacro(); fold.blur(); const f2 = $('#macro .macro-h .fold'); if (f2) f2.focus(); });
  box.append(h('div', { class: 'macro-h' },
    h('div', null, h('h2', null, '글로벌 매크로 브리핑 ', h('span', { class: 'badge', style: 'vertical-align:2px', text: (MACRO.tiles_asof ? '지표 ' + dateKo(MACRO.tiles_asof) + ' · 분석 ' : '') + dateKo(MACRO.asof) + ' 기준' }))),
    h('div', { class: 'r', style: 'display:flex;gap:6px' }, folded ? null : tog, fold)));
  if (!folded) box.append(h('p', { class: 'macro-lead', text: MACRO.headline }));   // 요약 문장은 제목 줄 아래(휴대폰에서도 접기 버튼이 위에 보이게)
  const content = h('div', { id: 'macroContent', hidden: folded }); box.append(content);
  if (folded) return;
  const tiles = h('div', { class: 'mtiles' });
  MACRO.tiles.forEach(t => {
    const c = mchg(t.chg);
    tiles.append(h('div', { class: 'mtile' }, h('div', { class: 'k', text: t.k }), h('div', { class: 'v' }, t.v, mcite(t.s)),
      c ? h('div', { class: 'c ' + dirCls(c.d), title: `${c.lab} · 이전 ${t.chg.ptxt || t.chg.prev.toLocaleString('ko-KR')}` }, h('span', { class: 'l' }, c.lab.replace(/ 대비$/, ''), / 대비$/.test(c.lab) ? h('span', { class: 'lx', text: ' 대비' }) : null), c.txt) : null,
      h('div', { class: 'd', text: t.d })));
  });
  content.append(tiles);
  const k3 = h('div', { class: 'key3' });
  MACRO.key3.forEach((k, i) => k3.append(h('div', { class: 'kc' }, h('b', null, `주목할 지표 ${i + 1} · ${k.name}`, mcite(k.s)), h('span', { text: k.why }))));
  content.append(k3);
  const body = h('div', { class: 'macro-body' }); content.append(body);
  if (!state.macroOpen) return;

  // 지수 차트 + 섹터 등락
  const chartCard = h('div', { style: 'min-width:0' }, h('h3', { style: 'font-size:12.5px;margin:0 0 4px', text: '주요 지수 최근 1년 (시작=100)' }));
  const leg = h('div', { class: 'legend' }), host = h('div', { class: 'chart' });
  chartCard.append(leg, host, h('p', { class: 'mini', text: `코스피·코스닥은 상장폐지 종목 포함 시총가중 자체 계산(${dataDate('KR')} 실제 종가로 보정), 미국은 SPY·QQQ ETF 가격 · 국내 ${dataDate('KR')}·미국 ${dataDate('US')}까지` }));
  const sect = h('div', { style: 'min-width:0' }, h('h3', { style: 'font-size:12.5px;margin:0 0 4px', text: '미국 업종별 등락 (섹터 ETF)' }));
  const st = h('table', { class: 'ftbl' }, h('thead', null, h('tr', null, ...['업종', '1개월', '3개월', '연초 이후', '1년'].map(x => h('th', { text: x })))));
  const stb = h('tbody');
  SECT_ETF.map(([tk, nm]) => ({ tk, nm, r: DB_IDX.get('U:' + tk) })).filter(x => x.r).sort((a, b) => (a.tk.length === 3 && ['SPY', 'QQQ', 'IWM'].includes(a.tk) ? -1 : 0) - (['SPY', 'QQQ', 'IWM'].includes(b.tk) ? -1 : 0) || (b.r[RF.st][4] - a.r[RF.st][4])).forEach(x => {
    const s = x.r[RF.st];
    stb.append(h('tr', ['SPY', 'QQQ', 'IWM'].includes(x.tk) ? { class: 'hl' } : null, h('td', null, x.nm, h('span', { class: 'cd', text: x.tk })), ...[s[1], s[2], s[4], s[5]].map(v => h('td', { class: dirCls(v), text: sp(v) }))));
  });
  st.append(stb); sect.append(h('div', { class: 'tblw' }, st), h('p', { class: 'mini', text: `${dataDate('US')} 종가 기준 · 앱 DB 자체 계산 [DB]` }));
  body.append(h('div', { class: 'mgrid' }, chartCard, sect));
  idxChart(host, leg);

  // ①~⑦
  const secs = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:0 18px' });
  const TAGC = { 사실: 'f', 전망: 'o', 해석: 'i' };
  MACRO.sections.forEach(s => {
    const d = h('div', { class: 'msec' }, h('h3', { text: `${s.no} ${s.title}` }));
    if (s.scen) d.append(h('div', { class: 'scen3', style: 'margin-bottom:6px' }, ...s.scen.map(x => h('div', { class: 'sc' }, h('b', { class: x.k === '낙관' ? 'up' : x.k === '비관' ? 'down' : '', text: x.k + ' 시나리오' }), h('p', { text: x.x }), h('p', { style: 'color:var(--muted)' }, '(전망) ' + x.ref, mcite(x.s))))));
    if (s.sect) {
      const t = h('table', { class: 'ftbl', style: 'margin-bottom:6px' }, h('thead', null, h('tr', null, h('th', { text: '시나리오' }), h('th', { style: 'text-align:left', text: '유리할 수 있는 업종' }), h('th', { style: 'text-align:left', text: '불리할 수 있는 업종' }))));
      const tb = h('tbody'); s.sect.forEach(x => tb.append(h('tr', null, h('td', { text: x.k }), h('td', { style: 'text-align:left;white-space:normal', text: x.good }), h('td', { style: 'text-align:left;white-space:normal', text: x.bad }))));
      t.append(tb); d.append(h('div', { class: 'tblw' }, t));
    }
    const ul = h('ul', { class: 'rlist' });
    (s.items || []).forEach(it => ul.append(h('li', null, h('span', { class: 'rtag ' + (TAGC[it.t] || ''), text: it.t }), h('span', null, it.x, mcite(it.s)))));
    d.append(ul); secs.append(d);
  });
  body.append(secs);

  // 일정 · 출처 · AI
  const ev = [...((RESEARCH.macro.us || {}).calendar || []).map(e => Object.assign({ m: '미국' }, e)), ...((RESEARCH.macro.kr || {}).calendar || []).map(e => Object.assign({ m: '한국' }, e))].sort((a, b) => a.date.localeCompare(b.date));
  const cal = h('table', { class: 'cal' }); const cb = h('tbody');
  ev.forEach(e => cb.append(h('tr', null, h('td', { text: dateKo(e.date) }), h('td', null, h('span', { class: 'cd', style: 'margin:0 6px 0 0', text: e.m }), e.event, e.note ? h('span', { style: 'color:var(--muted)', text: ' · ' + e.note.replace(/\[\d+\]/g, '') }) : null))));
  cal.append(cb);
  body.append(h('div', { class: 'msec' }, h('h3', { text: '앞으로의 주요 일정 (10~12월)' }), h('div', { class: 'tv-wrap', style: 'max-height:260px' }, cal)));
  const used = new Set(); [...MACRO.tiles, ...MACRO.key3].forEach(x => (x.s || []).forEach(c => used.add(c))); MACRO.sections.forEach(s => { (s.items || []).forEach(x => (x.s || []).forEach(c => used.add(c))); (s.scen || []).forEach(x => (x.s || []).forEach(c => used.add(c))); });
  const ol = h('ul', { class: 'srcs', style: 'list-style:none;padding-left:0' });
  [...used].sort((a, b) => a[0].localeCompare(b[0]) || (+a.slice(1) - +b.slice(1))).forEach(c => { const s = msrc(c); if (!s) return; ol.append(h('li', { id: 'msrc-' + c }, h('b', { text: `[${c}] ` }), s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.title }) : s.title, s.date ? ` (${s.date})` : '')); });
  body.append(h('details', { class: 'sub', id: 'macroSrc' }, h('summary', { text: `출처 ${used.size}건 — U: 미국·글로벌, K: 한국·환율·지정학, DB: 앱 자체 계산, Y·F·B: 지표 자동 수집(야후 파이낸스·FRED·한국은행)` }), ol));
  body.append(aiPanel({ key: 'macro', title: 'AI 매크로 분석 (가이드라인 ①~⑦)', prompt: () => promptMacro(false), copy: () => promptMacro(true), intro: '위 브리핑의 분석은 ' + dateKo(MACRO.asof) + '에 공식 자료·언론 보도로 정리한 스냅샷이에요(지표 타일은 매일 자동 갱신). 그 뒤 소식은 [프롬프트 복사] 후 웹 검색이 되는 Claude 채팅에서 받아 보세요.' }));
  body.append(h('p', { class: 'mini', text: '[사실] 발표된 수치·사건 · [전망] 기관 전망·점도표 · [해석] 사실을 바탕으로 한 이 앱의 정리. 이 분석은 참고용입니다.' }));
}
function idxChart(host, leg) {
  const sers = [['코스피', () => idxSeries('KOSPI', 'd'), 'var(--s1)', v => Math.round(v).toLocaleString('ko-KR')], ['코스닥', () => idxSeries('KOSDAQ', 'd'), 'var(--s3)', v => fx1(v, 2)], ['S&P500(SPY)', () => DB_IDX.get('U:SPY') && seriesOf(DB_IDX.get('U:SPY'), 'd'), 'var(--s2)', v => '$' + v.toFixed(2)], ['나스닥100(QQQ)', () => DB_IDX.get('U:QQQ') && seriesOf(DB_IDX.get('U:QQQ'), 'd'), 'var(--s7)', v => '$' + v.toFixed(2)]]
    .map(([nm, get, col, f]) => { const S0 = get(); return S0 && S0.v.length > 1 ? { nm, col, f, t: S0.t, v: S0.v, base: S0.v[0] } : null; }).filter(Boolean);
  if (!sers.length) { host.append(h('div', { class: 'empty', text: '지수 데이터가 없어요' })); return; }
  sers.forEach(s => leg.append(h('span', null, h('i', { class: 'k-line', style: `background:${s.col}` }), `${s.nm} ${sp((s.v[s.v.length - 1] / s.base - 1) * 100)}`)));
  const t0 = Math.min(...sers.map(s => s.t[0])), t1 = Math.max(...sers.map(s => s.t[s.t.length - 1]));
  let lo = Infinity, hi = -Infinity; sers.forEach(s => s.v.forEach(v => { const x = v / s.base * 100; if (x < lo) lo = x; if (x > hi) hi = x; }));
  const W = Math.max(host.clientWidth || 560, 300), HH = 230, m = { l: 8, r: 44, t: 10, b: 22 }, pw = W - m.l - m.r, ph = HH - m.t - m.b;
  const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
  const raw = (hi - lo) / 4, p10 = Math.pow(10, Math.floor(Math.log10(raw))), step = p10 * [1, 2, 2.5, 5, 10].find(s => p10 * s >= raw);
  const X = d => m.l + (d - t0) / Math.max(1, t1 - t0) * pw, Y = v => m.t + ph - (v - lo) / (hi - lo) * ph;
  const s = sv('svg', { viewBox: `0 0 ${W} ${HH}`, width: W, height: HH, role: 'img', 'aria-label': '주요 지수 1년 추이: ' + sers.map(x => `${x.nm} ${sp((x.v[x.v.length - 1] / x.base - 1) * 100)}`).join(', ') });
  for (let y = Math.ceil(lo / step) * step; y <= hi; y += step) { sv('line', { x1: m.l, x2: m.l + pw, y1: Math.round(Y(y)) + .5, y2: Math.round(Y(y)) + .5, class: Math.abs(y - 100) < 1e-6 ? 'bl' : 'gl' }, s); sv('text', { x: m.l + pw + 6, y: Y(y) + 3.5, class: 'ax' }, s).textContent = Math.round(y); }
  for (let k = 0; k <= 4; k++) { const d = t0 + (t1 - t0) * k / 4; sv('text', { x: X(d), y: HH - 6, 'text-anchor': k === 0 ? 'start' : k === 4 ? 'end' : 'middle', class: 'ax' }, s).textContent = ymShort(d); }
  sers.forEach(x => sv('polyline', { points: x.v.map((v, i) => `${X(x.t[i])},${Y(v / x.base * 100)}`).join(' '), style: `fill:none;stroke:${x.col};stroke-width:2;stroke-linejoin:round` }, s));
  const guide = sv('line', { x1: 0, x2: 0, y1: m.t, y2: m.t + ph, class: 'guide', style: 'opacity:0' }, s);
  const ov = sv('rect', { x: m.l, y: m.t, width: pw, height: ph, class: 'hit', tabindex: 0, 'aria-label': '지수 차트' }, s);
  const at = (x, d) => { let i = -1; for (let k = 0; k < x.t.length && x.t[k] <= d; k++) i = k; return i; };
  const show = (d, cx, cy) => {
    guide.setAttribute('x1', X(d)); guide.setAttribute('x2', X(d)); guide.style.opacity = 1;
    showTip(el => { el.append(h('div', { class: 'tt', text: dateKo(dayStr(d)) })); sers.forEach(x => { const i = at(x, d); if (i >= 0) el.append(tipRow(x.col, sp((x.v[i] / x.base - 1) * 100), `${x.nm} ${x.f(x.v[i])}`)); }); }, cx, cy);
  };
  ov.addEventListener('pointermove', e => { const r = s.getBoundingClientRect(), px = (e.clientX - r.left) * (W / r.width); show(t0 + Math.max(0, Math.min(1, (px - m.l) / pw)) * (t1 - t0), e.clientX, e.clientY); });
  ov.addEventListener('pointerleave', () => { guide.style.opacity = 0; hideTip(); });
  host.append(s);
}
function promptMacro(forCopy) {
  const L = [`[앱 데이터 — 지표 타일은 ${MACRO.tiles_asof || MACRO.asof} 기준 자동 수집(야후 파이낸스·FRED·한국은행), 분석은 ${MACRO.asof}에 공식 자료·언론으로 확인한 사실, 괄호는 발표일/기준일]`];
  MACRO.tiles.forEach(t => { const c = mchg(t.chg); L.push(`- ${t.k}: ${t.v} (${c ? c.lab + ' ' + c.txt + ', ' : ''}${t.d})`); });
  const add = set => (set.facts || []).forEach(f => { if (f.value) L.push(`- ${f.label}: ${f.value} | ${f.period || ''} | ${f.date || ''}`); });
  add(RESEARCH.macro.us || {}); add(RESEARCH.macro.kr || {});
  const sects = SECT_ETF.map(([tk, nm]) => { const r = DB_IDX.get('U:' + tk); return r ? `${nm} 연초 이후 ${sp(r[RF.st][4])}, 3개월 ${sp(r[RF.st][2])}` : null; }).filter(Boolean);
  L.push('- 미국 섹터 ETF 등락(' + DATA_DATE.US + '): ' + sects.join(' / '));
  const g = G_MACRO + rulesBlock(forCopy) + (forCopy ? '' : '\n- 아래 [앱 데이터]에 있는 날짜·수치만 사실로 쓰고, 그 밖의 내용은 전망이나 해석으로 구분해.');
  return g + '\n\n' + L.join('\n').slice(0, 60000);
}
