/* 종목 분석기: 4가지 조건(테마·거래량·매수세·차트)을 각 25점으로 매겨 후보를 추린다. DB의 종가·거래량만 사용 */
const SC = { data: null, mkt: 'KR', kind: 'stock', size: 'mid', theme: 'all', open: null, limit: 50 };
const SC_SIZES = [['all', '전체'], ['mid', '중형 이상'], ['large', '대형']];
const scClamp = (v, a, b) => Math.max(0, Math.min(25, (v - a) / (b - a) * 25));
function scMedian(a) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function scSizeOk(r, size) {   // 거래가 너무 적은 종목은 항상 제외 (국내 억원, 미국 백만 달러)
  const rec = r.rec, us = r.mk === 'US', amt = rec[RF.amt] || 0, cap = rec[RF.mcap] || 0;
  if (r.etf) return amt >= (us ? { all: 1, mid: 5, large: 50 } : { all: 1, mid: 5, large: 50 })[size];
  if (amt < (us ? 1 : 1)) return false;
  return cap >= (us ? { all: 0, mid: 2000, large: 10000 } : { all: 0, mid: 1000, large: 10000 })[size];
}
function scSizeHint() {
  if (SC.kind === 'etf') return '하루 평균 거래대금 ' + (SC.mkt === 'US' ? { all: '100만 달러', mid: '500만 달러', large: '5,000만 달러' } : { all: '1억원', mid: '5억원', large: '50억원' })[SC.size] + ' 이상';
  return SC.size === 'all' ? '하루 평균 거래대금 ' + (SC.mkt === 'US' ? '100만 달러' : '1억원') + ' 이상' : '시가총액 ' + (SC.mkt === 'US' ? { mid: '20억 달러', large: '100억 달러' } : { mid: '1,000억원', large: '1조원' })[SC.size] + ' 이상';
}
function scCompute() {
  if (SC.data) return SC.data;
  if (!SIDX) buildIndex();
  const rows = [];
  for (const it of SIDX) {
    const rec = it.rec; if (!rec || !(rec[RF.price] > 0)) continue;
    const c = decSeries(rec[RF.d]), n = c.length; if (n < 65) continue;
    const vol = decSeries(rec[RF.v]).slice(-n).map(q => Math.max(0, Math.exp(q / 20) - 1));
    if (vol.length < 65) continue;
    const P = c[n - 1], v5 = avg(vol.slice(-5)), v60 = avg(vol.slice(-65, -5));
    if (!(P > 0) || !(v60 > 0) || !(v5 > 0)) continue;   // 거래정지 등
    const vr = v5 / v60, r1m = (P / c[n - 22] - 1) * 100, r3m = (P / c[n - 64] - 1) * 100;
    let upV = 0, dnV = 0;
    for (let i = n - 20; i < n; i++) { if (c[i] > c[i - 1]) upV += vol[i]; else if (c[i] < c[i - 1]) dnV += vol[i]; }
    const buy = upV + dnV > 0 ? upV / (upV + dnV) : 0.5;
    const m20 = avg(c.slice(-20)), m60 = avg(c.slice(-60)), m120 = n >= 120 ? avg(c.slice(-120)) : null;
    const e12 = ema(c, 12), e26 = ema(c, 26), macd = c.map((_, i) => e12[i] - e26[i]), sig = ema(macd, 9), hist = macd[n - 1] - sig[n - 1];
    const rsi = rsiArr(c, 14)[n - 1];
    const chk = [
      ['주가가 20일 평균선 위', P > m20],
      ['20일선이 60일선 위(단기 상승)', m20 > m60],
      [m120 != null ? '60일선이 120일선 위(중기 상승)' : '주가가 60일 평균선 위', m120 != null ? m60 > m120 : P > m60],
      ['MACD 매수 신호', hist > 0],
      ['RSI 50~70(강하지만 과열 아님)', rsi >= 50 && rsi <= 70]];
    const etf = isEtfRec(rec), ind = String(rec[RF.ind] || '').replace(/\|.*$/, '').trim();
    rows.push({ it, rec, id: it.id, mk: it.mk, etf, name: it.name, code: it.code, sec: it.sec, ind, P, vr, r1m, r3m, buy, rsi, chk,
      sVol: scClamp(vr, 0.8, 2.5), sBuy: scClamp(buy, 0.35, 0.7), sChart: chk.filter(x => x[1]).length * 5 });
  }
  // 테마: 주식은 세부 업종(8종목 이상), 없으면 섹터. ETF는 유형. 1개월 수익률 중앙값 순위 + 거래량 변화 중앙값 순위
  const cnt = new Map();
  rows.forEach(r => { if (!r.etf && r.ind) { const k = r.mk + '|' + r.ind; cnt.set(k, (cnt.get(k) || 0) + 1); } });
  const groups = new Map();
  rows.forEach(r => {
    const fine = !r.etf && r.ind && cnt.get(r.mk + '|' + r.ind) >= 8;
    r.theme = fine ? r.ind : r.sec; r.tkey = r.mk + '|' + (r.etf ? 'E' : 'S') + '|' + r.theme;
    if (!groups.has(r.tkey)) groups.set(r.tkey, { key: r.tkey, name: r.theme, mk: r.mk, etf: r.etf, m: [] });
    groups.get(r.tkey).m.push(r);
  });
  const themes = [...groups.values()];
  themes.forEach(g => { g.n = g.m.length; g.r1m = scMedian(g.m.map(r => r.r1m)); g.vr = scMedian(g.m.map(r => r.vr)); g.up = g.m.filter(r => r.chk[0][1]).length / g.n; });
  const pools = new Map();
  themes.forEach(g => { const k = g.mk + (g.etf ? 'E' : 'S'); if (!pools.has(k)) pools.set(k, []); if (g.n >= 5) pools.get(k).push(g); });
  pools.forEach(list => {
    const rank = f => { const s = list.slice().sort((a, b) => f(a) - f(b)); s.forEach((g, i) => { g._r = (g._r || 0) + (list.length > 1 ? i / (list.length - 1) : 0.5); }); };
    rank(g => g.r1m); rank(g => g.vr);
    list.forEach(g => { g.str = g._r / 2; });
    list.sort((a, b) => b.str - a.str).forEach((g, i) => { g.rank = i + 1; g.of = list.length; });
  });
  rows.forEach(r => { const g = groups.get(r.tkey); r.g = g; r.sTheme = g.str != null ? g.str * 25 : 12.5; r.tot = Math.round(r.sTheme + r.sVol + r.sBuy + r.sChart); });
  return (SC.data = { rows, themes, pools });
}
function scList() {
  const d = scCompute();
  return d.rows.filter(r => r.mk === SC.mkt && r.etf === (SC.kind === 'etf') && scSizeOk(r, SC.size) && (SC.theme === 'all' || r.tkey === SC.theme))
    .sort((a, b) => (b.tot - a.tot) || (b.sChart - a.sChart) || (b.it.mcap - a.it.mcap));
}
function scWhy(r) {
  const g = r.g, t = g.rank ? `‘${g.name}’ ${g.of}개 테마 중 ${g.rank}위 — 소속 ${g.n}종목의 1개월 수익률 중간값 ${sp(g.r1m)}, 거래량 ${fx1(g.vr, 2)}배, 20일선 위 종목 ${fx1(g.up * 100, 0)}%` : `‘${g.name}’은 종목 수가 적어 중간 점수를 줬어요`;
  return [
    ['테마', r.sTheme, t],
    ['거래량', r.sVol, `최근 5일 평균 거래량이 그 전 60일 평균의 ${fx1(r.vr, 2)}배 (0.8배 이하 0점 ~ 2.5배 이상 만점)`],
    ['매수세', r.sBuy, `최근 20일 거래량 중 오른 날 거래량 ${fx1(r.buy * 100, 0)}% (35% 이하 0점 ~ 70% 이상 만점) · 외국인·기관 매매 자료 대신 쓰는 추정치`],
    ['차트', r.sChart, r.chk.map(x => (x[1] ? '✓ ' : '✗ ') + x[0]).join(' · ') + ` (RSI ${fx1(r.rsi, 0)})`]];
}
function scBar(v, max) { return h('span', { class: 'sc-bar', title: `${fx1(v, 0)} / ${max}` }, h('i', { style: `width:${Math.round(v / max * 100)}%` })); }
function renderScreen() {
  const box = $('#viewScreen'); box.textContent = '';
  const d = scCompute(), list = scList();
  const seg = (items, cur, on) => { const s = h('div', { class: 'seg' }); items.forEach(([v, l]) => s.append(h('button', { type: 'button', 'aria-pressed': String(v === cur), text: l, onclick: () => on(v) }))); return s; };
  const set = (k, v) => { SC[k] = v; if (k !== 'theme') SC.theme = 'all'; SC.open = null; SC.limit = 50; renderScreen(); };
  const pool = (d.pools.get(SC.mkt + (SC.kind === 'etf' ? 'E' : 'S')) || []);
  const sel = h('select', { 'aria-label': '테마 선택', onchange: e => set('theme', e.target.value) }, h('option', { value: 'all', text: '전체 테마' }), ...pool.map(g => h('option', { value: g.key, text: `${g.rank}위 ${g.name} (${g.n})` })));
  sel.value = SC.theme;
  box.append(h('div', { class: 'pa-top' },
    h('div', null, h('button', { class: 'btn sm', type: 'button', text: '← 포트폴리오 설계로 돌아가기', onclick: goMain }), h('h2', { style: 'margin-top:8px', text: '종목 분석기' }),
      h('p', { text: `테마·거래량·매수세·차트 4가지 조건을 25점씩 점수로 매겨 후보를 추립니다 · 종가 국내 ${dataDate('KR')}·미국 ${dataDate('US')} 기준` })),
    h('div', { class: 'pa-set' },
      h('div', { class: 'field' }, h('span', { class: 'lab', text: '시장' }), seg([['KR', '국내'], ['US', '미국']], SC.mkt, v => set('mkt', v))),
      h('div', { class: 'field' }, h('span', { class: 'lab', text: '종류' }), seg([['stock', '주식'], ['etf', 'ETF']], SC.kind, v => set('kind', v))),
      h('div', { class: 'field' }, h('span', { class: 'lab', text: '규모' }), seg(SC_SIZES, SC.size, v => set('size', v))),
      h('div', { class: 'field' }, h('span', { class: 'lab', text: '테마' }), sel))));

  const top = pool.slice(0, 8);
  if (top.length) box.append(h('div', { class: 'card sc-themes' }, h('div', { class: 'card-h' }, h('div', null, h('h2', { text: '지금 강한 테마' }), h('p', { text: '소속 종목의 1개월 수익률·거래량 변화가 시장 안에서 상대적으로 큰 순서 · 누르면 그 테마만 봅니다' }))),
    h('div', { class: 'sc-tlist' }, ...top.map(g => h('button', { type: 'button', class: 'sc-theme', 'aria-pressed': String(SC.theme === g.key), onclick: () => set('theme', SC.theme === g.key ? 'all' : g.key) },
      h('b', { text: `${g.rank}. ${g.name}` }), h('span', { class: dirCls(g.r1m), text: `1개월 ${sp(g.r1m)}` }), h('span', { text: `거래량 ${fx1(g.vr, 2)}배 · ${g.n}종목` }))))));

  const card = h('div', { class: 'card' });
  card.append(h('div', { class: 'card-h' }, h('div', null, h('h2', { text: `점수 높은 순 ${list.length.toLocaleString('ko-KR')}종목` }), h('p', { text: `${scSizeHint()} · 종목을 누르면 점수 근거가 펼쳐집니다` }))));
  if (!list.length) card.append(h('div', { class: 'empty', text: '조건에 맞는 종목이 없어요. 규모나 테마를 바꿔 보세요.' }));
  else {
    const tb = h('tbody');
    list.slice(0, SC.limit).forEach((r, i) => {
      const open = SC.open === r.id, mkt = r.mk === 'US' ? 'US' : 'KR';
      const tr = h('tr', { class: 'sc-row' + (open ? ' hl' : ''), tabindex: 0, role: 'button', 'aria-expanded': String(open) },
        h('td', { text: String(i + 1) }),
        h('td', { class: 'sc-name' }, h('b', { text: r.name }), h('span', { class: 'mini', text: ` ${r.code} · ${r.theme}` })),
        h('td', { class: 'sc-tot' }, h('b', { text: String(r.tot) }), scBar(r.tot, 100)),
        h('td', null, scBar(r.sTheme, 25)), h('td', null, scBar(r.sVol, 25)), h('td', null, scBar(r.sBuy, 25)), h('td', null, scBar(r.sChart, 25)),
        h('td', { text: pxFmt(r.rec[RF.price], mkt) }),
        h('td', { class: dirCls(r.r1m), text: sp(r.r1m) }),
        h('td', { text: fx1(r.vr, 2) + '배' }));
      const tog = () => { SC.open = open ? null : r.id; renderScreen(); };
      tr.addEventListener('click', tog); tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } });
      tb.append(tr);
      if (open) tb.append(h('tr', { class: 'sc-det' }, h('td', { colspan: 10 },
        h('ul', null, ...scWhy(r).map(([k, s, why]) => h('li', null, h('b', { text: `${k} ${fx1(s, 0)}/25 ` }), why))),
        h('div', { class: 'sc-act' }, h('span', { class: 'mini', text: `3개월 수익률 ${sp(r.r3m)} · ${mktLabel(r.rec)} · 시가총액 ${mcapFmt(r.rec)}` }),
          h('button', { class: 'btn sm primary', type: 'button', text: '차트·배당 자세히 보기', onclick: e => { e.stopPropagation(); openStock(stockIdOf(r.it)); } })))));
    });
    card.append(h('div', { class: 'tblw' }, h('table', { class: 'ftbl sc-tbl' }, h('thead', null, h('tr', null,
      ...['순위', '종목', '종합(100)', '테마', '거래량', '매수세', '차트', '현재가', '1개월', '거래량 변화'].map(x => h('th', { text: x })))), tb)));
    if (list.length > SC.limit) card.append(h('div', { style: 'text-align:center;margin-top:10px' }, h('button', { class: 'btn sm', type: 'button', text: `50개 더 보기 (${SC.limit}/${list.length.toLocaleString('ko-KR')})`, onclick: () => { SC.limit += 50; renderScreen(); } })));
  }
  box.append(card);
  box.append(h('p', { class: 'mini', style: 'margin-top:10px', text: '점수는 과거 종가·거래량을 규칙대로 계산한 값이며 매수 추천이 아닙니다. 외국인·기관 매매 자료는 이 앱에 없어 ‘매수세’는 오른 날 거래량 비중으로 추정합니다. 실적·뉴스와 함께 판단하세요. 이 분석은 참고용입니다.' }));
}
function goScreen() {
  if (isPending()) commit();
  state.view = 'screen';
  $('#viewMain').hidden = true; $('#macro').hidden = true; $('#viewAnalysis').hidden = true; $('#viewScreen').hidden = false;
  renderScreen(); window.scrollTo(0, 0);
}
