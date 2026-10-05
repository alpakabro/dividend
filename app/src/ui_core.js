/* ───────── [ui_core] 종목 DB 연결 · 검색 · 검색 창(모달) ───────── */
const RESEARCH = window.RESEARCH || { stocks: {}, macro: {} };
function RESEARCH_OF(s) {
  const id = typeof s === 'string' ? s : (s && (s.db || (s.dbOnly ? s.id : null)));
  return id ? (RESEARCH.stocks[id] || null) : null;
}
function normQ(s) { return String(s || '').toLowerCase().replace(/[\s·.,\-_&()'"/]/g, ''); }

// 검색으로 추가한 종목(DB 전용)을 시뮬레이션용 객체로: 배당은 사용자가 입력한 값(state.ov)만 사용
function mkDbStock(id) {
  const rec = DB_IDX.get(id); if (!rec) return null;
  const mkt = rec[0] === 'US' ? 'US' : 'KR', ov = state.ov[id] || null, p0 = rec[RF.price];
  const y = ov ? Math.max(0, numOr(ov.y, 0)) / 100 : 0, nd = NO_DIV[rec[1]], dv = rec[RF.div] || null, etf = isEtfRec(rec);
  const tags = etf ? ['ETF'] : [];
  if (!ov && dv && dv[0] > 0) {   // ETF: 최근 12개월 분배 이력(배당락일 기준)으로 연간 분배금·지급월 자동 입력
    const amt = mkt === 'US' ? '$' + dv[0].toFixed(dv[0] < 1 ? 3 : 2) : Math.round(dv[0]).toLocaleString('ko-KR') + '원';
    if (dv[2] >= 11) tags.push('월배당');
    return { id, mkt, name: recName(rec), code: rec[1], p0, d0: dv[0], mon: dv[1].slice(), g: dv[4], safe: 'warn', rec: false, tags, note: `최근 12개월 ${etf ? '분배금' : '배당금'} ${amt}(${dv[2]}회, 마지막 배당락 ${dateKo(dv[3])}) · 지급월은 배당락일로 추정 · 성장 가정 ${fx1(dv[4], 1)}%(${etf ? '유형 기본값' : '최근 연간 배당 증가율에서 추정'})`, custom: false, db: id, dbOnly: true, noDiv: false, divSrc: 'db', sector: recSectorKo(rec) };
  }
  const note = ov ? `배당 직접 입력 · 수익률 ${fx1(y * 100, 2)}%, 성장 ${fx1(numOr(ov.g, 4), 1)}% 가정`
    : nd ? '현재 무배당 · ' + nd.split(' · ').slice(1).join(' · ')
    : dv ? (etf ? '최근 12개월 분배 없음 — 분배금을 재투자하는 상품(TR·레버리지)이거나 새로 상장했을 수 있어요' : '최근 12개월 배당 없음(야후 파이낸스 배당락 이력 기준) — 배당을 다시 준다면 종목명을 눌러 직접 입력') : '배당 정보 없음 — 종목명을 눌러 배당수익률·지급월 입력';
  return { id, mkt, name: recName(rec), code: rec[1], p0, d0: p0 * y, mon: ov ? presetMonths(ov.mp || 'none') : new Array(12).fill(0), g: ov ? numOr(ov.g, 4) : (dv ? dv[4] : 4), safe: ov ? (ov.s || 'warn') : 'warn', rec: false, tags, note, custom: false, db: id, dbOnly: true, noDiv: !ov, divSrc: ov ? 'user' : null, sector: recSectorKo(rec) };
}
function S(id) {
  if (!id) return null;
  if (U.has(id)) return U.get(id);
  if (/^[KU]:/.test(id)) {
    const cid = CUR_BY_DB.get(id); if (cid && U.has(cid)) return U.get(cid);
    const st = mkDbStock(id); if (st) { U.set(id, st); return st; }
  }
  return null;
}
function refreshDbStock(id) { if (U.has(id) && U.get(id).dbOnly) { U.delete(id); S(id); } }
function stockSector(st) { if (!st) return '기타'; if (st.sector) return st.sector; return st.mkt === 'US' ? '기타(미국)' : '기타(국내)'; }
function recOf(st) { const id = st && (st.db || (st.dbOnly ? st.id : null)); return id ? (DB_IDX.get(id) || null) : null; }

/* 숫자 표시 */
function pxFmt(v, mkt) { if (v == null || !isFinite(v)) return '—'; return mkt === 'US' ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(v).toLocaleString('ko-KR') + '원'; }
function pxNum(v, mkt) { if (v == null || !isFinite(v)) return '—'; return mkt === 'US' ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(v).toLocaleString('ko-KR'); }
function sp(v, d) { if (v == null || !isFinite(v)) return '—'; d = d == null ? 1 : d; const a = Math.abs(v) < Math.pow(10, -d) / 2 ? 0 : v; return (a > 0 ? '+' : a < 0 ? neg : '') + fx1(a, d) + '%'; }
function dirCls(v) { return v > 0 ? 'up' : v < 0 ? 'down' : ''; }
function eok(v) { if (v == null || !isFinite(v)) return '—'; const a = Math.abs(v), s = v < 0 ? neg : ''; return a >= 1e4 ? s + fx1(a / 1e4, a >= 1e5 ? 0 : 1) + '조원' : s + Math.round(a).toLocaleString('ko-KR') + '억원'; }
function mcapFmt(rec) { if (!rec) return '—'; if (rec[0] !== 'US') return eok(rec[RF.mcap]); const m = rec[RF.mcap]; if (!(m > 0)) return '—'; return (m >= 1000 ? '$' + fx1(m / 1000, m >= 1e5 ? 0 : 1) + 'B' : '$' + m.toLocaleString('en-US') + 'M') + ' (≈' + won(m * 1e6 * FX0) + ')'; }
function amtFmt(rec) { if (!rec) return '—'; return rec[0] !== 'US' ? eok(rec[RF.amt]) : '$' + rec[RF.amt].toLocaleString('en-US') + 'M'; }
function dateKo(s) { if (!s) return '—'; const p = String(s).split('-'); return p.length === 3 ? `${p[0]}.${+p[1]}.${+p[2]}` : s; }
function dataDate(mkt) { return dateKo(DATA_DATE[mkt === 'US' ? 'US' : 'KR']); }

/* 검색 색인 */
const ETF_KO = { SCHD: '슈왑 미국배당', VYM: '뱅가드 고배당', JEPQ: 'JP모건 나스닥 프리미엄인컴', VIG: '뱅가드 배당성장', DGRO: '아이셰어즈 배당성장', SPYD: 'SPDR 고배당', HDV: '아이셰어즈 고배당', NOBL: '프로셰어즈 배당귀족', DIVO: '앰플리파이 배당인컴', QYLD: '글로벌X 나스닥 커버드콜', VNQ: '뱅가드 리츠', VOO: '뱅가드 S&P500' };
let SIDX = null;
function buildIndex() {
  SIDX = [];
  DBR.s.forEach(rec => {
    const id = recId(rec), cid = CUR_BY_DB.get(id) || null, cur = cid ? U.get(cid) : null;
    const name = cur ? cur.name : recName(rec);
    const etf = isEtfRec(rec), usCap = rec[RF.mcap] > 0 ? rec[RF.mcap] : (etf ? rec[RF.amt] * 20 : 0);   // 미국 ETF는 규모 자료가 없어 거래대금으로 순위만 추정
    SIDX.push({ id, rec, cid, name, code: rec[1], mk: rec[0] === 'US' ? 'US' : 'KR', n: normQ(name), n2: normQ(rec[2]), c: normQ(rec[1]), ko: normQ((rec[3] || '') + (etf ? ' etf ' + (rec[5] || '') : '')), mcap: rec[0] === 'US' ? usCap * 1e6 * FX0 : rec[RF.mcap] * 1e8 });
  });
  RAW.forEach(r => { if (!r.db) SIDX.push({ id: r.id, rec: null, cid: r.id, name: r.name, code: r.code, mk: r.mkt, n: normQ(r.name), n2: normQ(r.code), c: normQ(r.code), ko: normQ(ETF_KO[r.code] || ''), mcap: 0 }); });
}
function searchStocks(q, mkt) {
  if (!SIDX) buildIndex();
  const nq = normQ(q); if (!nq) return [];
  const out = [];
  for (const it of SIDX) {
    if (mkt && mkt !== 'all' && it.mk !== mkt) continue;
    let sc = -1;
    if (it.c === nq || it.n === nq || it.n2 === nq) sc = 0;
    else if (it.n.startsWith(nq) || it.c.startsWith(nq)) sc = 1;
    else if (it.ko.startsWith(nq) || it.n2.startsWith(nq)) sc = 1.5;
    else if (it.n.includes(nq)) sc = 2;
    else if (it.ko.includes(nq)) sc = 2.5;
    else if (it.n2.includes(nq) || it.c.includes(nq)) sc = 3;
    if (sc >= 0) out.push({ it, sc });
  }
  out.sort((a, b) => (a.sc - b.sc) || (b.it.mcap - a.it.mcap) || a.it.name.localeCompare(b.it.name, 'ko'));
  return out.map(x => x.it);
}
function itemFor(id) {
  if (!SIDX) buildIndex();
  const st = S(id); const key = st ? (st.db || st.id) : id;
  return SIDX.find(it => it.id === key) || SIDX.find(it => it.cid === id) || null;
}
function stockIdOf(it) { return it.cid || it.id; }   // 시뮬레이션에서 쓰는 id (큐레이션 우선)

/* 검색 창 */
const MD = { q: '', mkt: 'all', results: [], sel: null, ctx: { mode: 'browse' }, lastFocus: null, limit: 120 };
const isNarrow = () => window.matchMedia('(max-width: 920px)').matches;
function initModal() {
  $('#mdForm').addEventListener('submit', e => { e.preventDefault(); runSearch($('#mdQ').value); });
  document.querySelectorAll('#mdMkt button').forEach(b => b.addEventListener('click', () => { MD.mkt = b.dataset.v; syncMdMkt(); if (MD.q) runSearch(MD.q, true); }));
  document.querySelectorAll('#modal [data-close]').forEach(el => el.addEventListener('click', closeModal));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) { e.preventDefault(); closeModal(); } });
  syncMdMkt();
}
function syncMdMkt() { document.querySelectorAll('#mdMkt button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === MD.mkt))); }
const MD_TITLE = { browse: '종목 검색', hold: '보유 종목 찾기', pick: '종목 구성에 담을 종목 찾기', replace: '직접 입력한 종목 찾기' };
function openShell() {
  const m = $('#modal');
  if (m.hidden) { MD.lastFocus = document.activeElement; m.hidden = false; document.body.style.overflow = 'hidden'; }
  $('#mdTtl').textContent = MD_TITLE[MD.ctx.mode] || '종목 검색';
}
function openSearch(q, ctx) {
  MD.ctx = ctx || { mode: 'browse' }; MD.sel = null;
  openShell();
  $('#mdQ').value = q || '';
  runSearch(q || '');
  if (!q || isNarrow()) setTimeout(() => $('#mdQ').focus(), 30);
}
function openStock(id, ctx) {
  MD.ctx = ctx || { mode: 'browse' };
  openShell();
  const it = itemFor(id);
  MD.q = it ? it.name : ''; $('#mdQ').value = MD.q;
  MD.results = it ? searchStocks(it.name, MD.mkt) : [];
  if (it && !MD.results.includes(it)) MD.results.unshift(it);
  renderList();
  if (it) selectItem(it); else emptyDetail();
}
function closeModal() {
  aiAbortAll();
  $('#modal').hidden = true; document.body.style.overflow = ''; hideTip();
  if (MD.lastFocus && document.contains(MD.lastFocus)) try { MD.lastFocus.focus(); } catch (e) { /* 무시 */ }
}
function runSearch(q, keepSel) {
  MD.q = (q || '').trim(); MD.limit = 120;
  MD.results = searchStocks(MD.q, MD.mkt);
  renderList();
  const keep = keepSel && MD.sel && MD.results.includes(MD.sel);
  if (keep) selectItem(MD.sel, true);
  else if (MD.results.length === 1 || (MD.results.length && !isNarrow())) selectItem(MD.results[0]);
  else { MD.sel = null; $('#mdBody').classList.remove('show-detail'); emptyDetail(); }
}
function itemTags(it) {
  const t = [], sid = stockIdOf(it), st = it.cid ? U.get(it.cid) : null;
  if (holdTextById(state.hold).has(sid)) t.push('보유');
  if (state.sel[sid] != null) t.push('구성');
  if (st && st.rec) t.push('추천');
  if (st && !st.custom) t.push('배당');
  if (RESEARCH.stocks[it.id]) t.push('리포트');
  return t;
}
function renderList() {
  const box = $('#mdList'); box.textContent = '';
  if (!MD.q) { box.append(h('div', { class: 'md-empty', text: '종목명 일부·종목코드·미국 티커를 넣고 [조회]를 누르세요. 예: 두산 → 두산·두산에너빌리티·두산밥캣 등이 모두 나옵니다.' })); return; }
  const n = MD.results.length;
  box.append(h('div', { class: 'md-count', role: 'status', text: n ? `‘${MD.q}’ 검색 결과 ${n.toLocaleString('ko-KR')}개${MD.mkt !== 'all' ? ' · ' + (MD.mkt === 'KR' ? '국내' : '미국') : ''} · 시가총액 큰 순` : `‘${MD.q}’ 검색 결과가 없어요` }));
  if (!n) { box.append(h('div', { class: 'md-empty', text: '철자를 바꾸거나 일부만 넣어 보세요. 국내 ETF·펀드는 이 데이터에 없어 보유 종목 카드의 [+ 목록에 없는 종목]으로 직접 입력할 수 있어요.' })); return; }
  MD.results.slice(0, MD.limit).forEach(it => {
    const rec = it.rec, st = it.cid ? U.get(it.cid) : null;
    const price = rec ? rec[RF.price] : st ? st.p0 : null, chg = rec ? rec[RF.chg] : null;
    const sub = [it.code, rec ? mktLabel(rec) : (it.mk === 'US' ? '미국 ETF' : '국내'), ...itemTags(it)].join(' · ');
    const b = h('button', { class: 'ritem', type: 'button', role: 'option', 'aria-selected': String(MD.sel === it) },
      h('span', { class: 'n', text: it.name }), h('span', { class: 'p', text: price != null ? pxFmt(price, it.mk) : '—' }),
      h('span', { class: 'm', text: sub }), h('span', { class: 'c ' + dirCls(chg), text: chg != null ? sp(chg, 2) : '' }));
    b.addEventListener('click', () => selectItem(it));
    box.append(b);
  });
  if (n > MD.limit) box.append(h('div', { style: 'padding:10px 12px' }, h('button', { class: 'btn sm', type: 'button', text: `더 보기 (${(n - MD.limit).toLocaleString('ko-KR')}개 남음)`, onclick: () => { MD.limit += 200; renderList(); } })));
}
function selectItem(it, quiet) {
  MD.sel = it;
  document.querySelectorAll('#mdList .ritem').forEach((el, i) => el.setAttribute('aria-selected', String(MD.results[i] === it)));
  $('#mdBody').classList.add('show-detail');
  if (!quiet || !$('#mdDetail').childElementCount) renderDetail(it);
  $('#mdDetail').scrollTop = 0;
}
function emptyDetail() {
  const box = $('#mdDetail'); box.textContent = '';
  box.append(h('div', { class: 'md-empty' },
    h('div', { text: MD.q ? '왼쪽 목록에서 종목을 고르면 일·주·월·연 차트와 주요 지표, 차트·기업·실적·재무 분석이 여기에 나옵니다.' : '추천 종목부터 볼까요?' }),
    h('div', { class: 'pl', style: 'justify-content:center;margin-top:10px' }, ...REC.map(id => { const st = U.get(id); return st ? h('button', { class: 'btn sm', type: 'button', text: st.name, onclick: () => openStock(id) }) : null; }))));
}

/* 보유·구성에 추가 */
function addHolding(id, qty, avg) {
  const row = { id, mode: 'qty', v: qty };
  if (avg > 0) row.avg = avg;
  if (draft.hold) { draft.hold.push(row); renderHold(); updatePending(); return 'pending'; }
  state.hold.push(row); renderAll(); return 'ok';
}
function replaceCustom(key, id) {
  const rows = draft.hold || state.hold, i = rows.findIndex(r => r.id === CUSTOM && r.key === key);
  if (i < 0) return false;
  const r = rows[i], st = S(id);
  rows[i] = { id, mode: r.mode === 'amt' || !st || st.custom ? 'amt' : 'qty', v: r.v };
  if (draft.hold) { renderHold(); updatePending(); } else renderAll();
  return true;
}
function addToPlan(id) {
  const st = S(id); if (!st) return '종목을 찾지 못했어요';
  if (state.sel[id] != null) return null;
  if (st.dbOnly && !state.extra.includes(id)) state.extra.push(id);
  toggle(id, true);
  return null;
}
function removeExtra(id) {
  state.extra = state.extra.filter(x => x !== id);
  if (state.sel[id] != null) { delete state.sel[id]; delete draft.w[id]; if (state.auto) equalize(); }
  delete state.base[id];
  renderAll();
}
// 조회 후: 이름만 넣은 직접 입력 종목이 DB에 있으면 검색 창을 띄워 바꿀 수 있게
const LOOKED = new Set();
function checkCustomLookup() {
  const row = state.hold.find(r => r.id === CUSTOM && (r.name || '').trim().length >= 2 && !LOOKED.has(r.key + '|' + r.name.trim()) && (!(numOr(r.price, 0) > 0) || !(numOr(r.y, 0) > 0)));
  if (!row) return;
  const nm = row.name.trim(); LOOKED.add(row.key + '|' + nm);
  if (searchStocks(nm).length) openSearch(nm, { mode: 'replace', key: row.key, name: nm });
}

/* 화면 전환: 설계 ↔ 포트폴리오 분석 */
function goAnalysis() {
  if (isPending()) commit();
  state.view = 'analysis';
  $('#viewMain').hidden = true; $('#macro').hidden = true; $('#viewAnalysis').hidden = false;
  renderPA(); window.scrollTo(0, 0);
}
function goMain() {
  state.view = 'main';
  $('#viewAnalysis').hidden = true; $('#viewMain').hidden = false; $('#macro').hidden = false;
  renderAll(); window.scrollTo(0, 0);
}
