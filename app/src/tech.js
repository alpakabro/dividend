/* ───────── [tech] 차트(기술적) 분석: 실제 일별 종가·거래량으로 계산 ───────── */
function sma(a, k) { const out = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= k) s -= a[i - k]; if (i >= k - 1) out[i] = s / k; } return out; }
function ema(a, k) { const out = new Array(a.length).fill(null), al = 2 / (k + 1); let e = null; for (let i = 0; i < a.length; i++) { if (a[i] == null) continue; e = e == null ? a[i] : a[i] * al + e * (1 - al); out[i] = e; } return out; }
function rsiArr(c, k) {
  k = k || 14; const out = new Array(c.length).fill(null); let g = 0, l = 0;
  for (let i = 1; i < c.length; i++) {
    const d = c[i] - c[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= k) { g += up; l += dn; if (i === k) { g /= k; l /= k; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } }
    else { g = (g * (k - 1) + up) / k; l = (l * (k - 1) + dn) / k; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
  }
  return out;
}
function stdev(a) { const n = a.length; if (n < 2) return 0; const m = a.reduce((s, v) => s + v, 0) / n; return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (n - 1)); }
function avg(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }
function pivots(c, k) {
  const hi = [], lo = [];
  for (let i = k; i < c.length - k; i++) {
    let H = true, L = true;
    for (let j = i - k; j <= i + k; j++) { if (c[j] > c[i]) H = false; if (c[j] < c[i]) L = false; }
    if (H && (!hi.length || i - hi[hi.length - 1] > k)) hi.push(i);
    if (L && (!lo.length || i - lo[lo.length - 1] > k)) lo.push(i);
  }
  return { hi, lo };
}
function tickRound(v, mkt) {
  if (mkt === 'US') return Math.round(v * 100) / 100;
  if (mkt === 'KE') { const t = v < 2000 ? 1 : 5; return Math.round(v / t) * t; }   // 국내 ETF 호가단위
  const t = v < 2000 ? 1 : v < 5000 ? 5 : v < 20000 ? 10 : v < 50000 ? 50 : v < 200000 ? 100 : v < 500000 ? 500 : 1000;
  return Math.round(v / t) * t;
}
function mdShort(dn) { const d = new Date(dn * 864e5); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; }
function ymShort(dn) { const d = new Date(dn * 864e5); return `${String(d.getUTCFullYear()).slice(2)}.${d.getUTCMonth() + 1}`; }

function techAnalysis(rec) {
  const mkt = rec[0] === 'US' ? 'US' : rec[0] === 'KE' ? 'KE' : 'KR';
  const D = seriesOf(rec, 'd'), c = D.v, t = D.t, n = c.length, volAll = volumesOf(rec), vol = volAll.slice(-n);
  if (n < 40) return { ok: false, msg: `일별 데이터가 ${n}거래일뿐이라(최근 상장 등) 차트 분석에 필요한 기간이 부족해요.` };
  const P = c[n - 1], f = v => pxFmt(tickRound(v, mkt), mkt), pc = v => sp((v / P - 1) * 100);
  const ma20 = sma(c, 20), ma60 = sma(c, 60), ma120 = sma(c, 120);
  const m20 = ma20[n - 1], m60 = ma60[n - 1], m120 = ma120[n - 1];
  const slope = (a, k) => (a[n - 1] != null && a[n - 1 - k] != null) ? (a[n - 1] / a[n - 1 - k] - 1) * 100 : null;
  const s20 = slope(ma20, 5), s60 = slope(ma60, 10), s120 = slope(ma120, 20);
  const ret = k => n > k ? (P / c[n - 1 - k] - 1) * 100 : null;
  const r1m = ret(21), r3m = ret(63), r6m = ret(126);
  let hiI = 0, loI = 0; c.forEach((v, i) => { if (v >= c[hiI]) hiI = i; if (v <= c[loI]) loI = i; });
  const hi = c[hiI], lo = c[loI], dd = (P / hi - 1) * 100, fromLo = (P / lo - 1) * 100;
  const rets = []; for (let i = 1; i < n; i++) rets.push(c[i] / c[i - 1] - 1);
  const sd60 = stdev(rets.slice(-60)), sd1m = sd60 * Math.sqrt(21);
  const atrP = avg(rets.slice(-14).map(Math.abs));
  const sec = [];

  /* ① 추세·패턴 */
  let trend;
  if (m120 != null && P > m20 && m20 > m60 && m60 > m120) trend = '상승 추세(정배열)';
  else if (m120 != null && P < m20 && m20 < m60 && m60 < m120) trend = '하락 추세(역배열)';
  else if (m120 != null && P > m120 && P < m20) trend = '중장기 상승 속 단기 조정';
  else if (m120 != null && P < m120 && P > m20) trend = '중장기 하락 속 단기 반등';
  else if (m60 != null && P > m60 && (s60 || 0) > 0) trend = '완만한 상승 우위(혼조)';
  else if (m60 != null && P < m60 && (s60 || 0) < 0) trend = '완만한 하락 우위(혼조)';
  else trend = '방향성 탐색(혼조)';
  const up = /상승/.test(trend) && !/하락 속/.test(trend), down = /하락/.test(trend) && !/상승 속/.test(trend);
  const pv = pivots(c, 5), recentH = pv.hi.filter(i => i >= n - 140).slice(-2), recentL = pv.lo.filter(i => i >= n - 140).slice(-2);
  const i1 = [];
  i1.push(`추세 판단: ${trend} — 현재가 ${f(P)} · ${[m20, m60, m120].map((m, k) => m == null ? null : `${['20', '60', '120'][k]}일선(${f(m)}) ${P > m ? '위' : '아래'}`).filter(Boolean).join(', ')}`);
  i1.push(`수익률: 1개월 ${sp(r1m)}, 3개월 ${sp(r3m)}${r6m != null ? ', 6개월 ' + sp(r6m) : ''} · 1년 최고 종가 ${f(hi)}(${mdShort(t[hiI])}) 대비 ${sp(dd)}, 최저 ${f(lo)}(${mdShort(t[loI])}) 대비 ${sp(fromLo)}`);
  if (recentH.length === 2 && recentL.length === 2) {
    const hh = c[recentH[1]] > c[recentH[0]], hl = c[recentL[1]] > c[recentL[0]];
    const struct = hh && hl ? '고점·저점이 함께 높아지는 상승 구조' : !hh && !hl ? '고점·저점이 함께 낮아지는 하락 구조' : hh ? '고점은 높아졌지만 저점이 낮아진 확산형(변동성 확대)' : '고점은 낮아지고 저점은 높아지는 수렴형(삼각형)';
    i1.push(`최근 스윙(앞뒤 5거래일 중 최고·최저 종가): 고점 ${f(c[recentH[0]])}→${f(c[recentH[1]])}, 저점 ${f(c[recentL[0]])}→${f(c[recentL[1]])} → ${struct}`);
  }
  const pats = [];
  const prev60 = c.slice(Math.max(0, n - 61), n - 1), prevAll = c.slice(0, n - 1);
  if (P >= Math.max(...prevAll)) pats.push(`1년 신고가 경신(종가 기준) — 위쪽 매물 부담이 적은 대신 단기 과열 여부 확인 필요`);
  else if (prev60.length >= 40 && P >= Math.max(...prev60)) pats.push(`60거래일 최고 종가 돌파 — 박스권 상단 돌파 시도`);
  if (P <= Math.min(...prevAll)) pats.push(`1년 신저가(종가 기준) — 하락 추세 진행 중, 바닥 확인 전`);
  else if (prev60.length >= 40 && P <= Math.min(...prev60)) pats.push(`60거래일 최저 종가 이탈 — 지지선 붕괴 신호`);
  const last40 = c.slice(-40), b40 = (Math.max(...last40) / Math.min(...last40) - 1) * 100;
  if (b40 < Math.max(8, sd60 * 100 * 4.5)) pats.push(`최근 40거래일 ${f(Math.min(...last40))}~${f(Math.max(...last40))} 박스권(폭 ${fx1(b40, 1)}%) — 방향 결정 대기`);
  if (pv.lo.length >= 2) {
    const a = pv.lo[pv.lo.length - 2], b = pv.lo[pv.lo.length - 1];
    const mid = pv.hi.filter(i => i > a && i < b).map(i => c[i]);
    if (b >= n - 40 && b - a >= 10 && Math.abs(c[b] / c[a] - 1) < 0.03 && mid.length && Math.max(...mid) / Math.max(c[a], c[b]) > 1.05) pats.push(`이중바닥(W) 가능성 — 저점 ${f(c[a])}·${f(c[b])}, 넥라인 ${f(Math.max(...mid))}${P > Math.max(...mid) ? ' 돌파함' : ' 돌파 여부가 관건'}`);
  }
  if (pv.hi.length >= 2) {
    const a = pv.hi[pv.hi.length - 2], b = pv.hi[pv.hi.length - 1];
    const mid = pv.lo.filter(i => i > a && i < b).map(i => c[i]);
    if (b >= n - 40 && b - a >= 10 && Math.abs(c[b] / c[a] - 1) < 0.03 && mid.length && Math.min(c[a], c[b]) / Math.min(...mid) > 1.05) pats.push(`이중천장(M) 가능성 — 고점 ${f(c[a])}·${f(c[b])}, 넥라인 ${f(Math.min(...mid))}${P < Math.min(...mid) ? ' 이탈함' : ' 이탈 여부 주의'}`);
  }
  if (dd < -20 && n > 30) { const l30 = Math.min(...c.slice(-30)); if (P / l30 - 1 > 0.1) pats.push(`고점 대비 ${sp(dd)} 조정 뒤 최근 30거래일 저점에서 ${sp((P / l30 - 1) * 100)} 반등`); }
  const W = seriesOf(rec, 'w');
  if (W.v.length >= 52) {
    const w26 = sma(W.v, 26), w52 = sma(W.v, 52), wl = W.v.length - 1, wp = W.v[wl];
    i1.push(`주봉: 26주선 ${f(w26[wl])}·52주선 ${f(w52[wl])} ${wp > w26[wl] && wp > w52[wl] ? '위 → 장기 상승 흐름 유지' : wp < w26[wl] && wp < w52[wl] ? '아래 → 장기 흐름 약세' : '사이 → 장기 방향 전환 구간'}`);
  }
  i1.push(pats.length ? '차트 패턴: ' + pats.join(' / ') : '차트 패턴: 뚜렷한 돌파·이탈·반복 패턴 없음');
  sec.push({ no: '①', title: '현재 주가 추세와 차트 패턴', items: i1 });

  /* ② 지지선·저항선 */
  const pts = [...pv.hi.map(i => ({ v: c[i], i, k: 'H' })), ...pv.lo.map(i => ({ v: c[i], i, k: 'L' }))].sort((a, b) => a.v - b.v);
  const cl = [];
  pts.forEach(p => { const L = cl[cl.length - 1]; if (L && Math.abs(p.v / L.v - 1) <= 0.02) { L.pts.push(p); L.v = avg(L.pts.map(x => x.v)); } else cl.push({ v: p.v, pts: [p] }); });
  const cands = cl.map(x => ({ v: x.v, sc: x.pts.length + (x.pts.some(p => p.i >= n - 60) ? 0.5 : 0), why: `스윙 ${x.pts.every(p => p.k === 'L') ? '저점' : x.pts.every(p => p.k === 'H') ? '고점' : '고점·저점'} ${x.pts.length}회(${x.pts.slice(-3).map(p => mdShort(t[p.i])).join('·')}) 밀집 구간` }));
  [[m20, '20일 이동평균', 1], [m60, '60일 이동평균', 1.6], [m120, '120일 이동평균', 2]].forEach(([v, lab, sc]) => { if (v) cands.push({ v, sc, why: lab }); });
  cands.push({ v: hi, sc: 2, why: `1년 최고 종가(${mdShort(t[hiI])})` }, { v: lo, sc: 2, why: `1년 최저 종가(${mdShort(t[loI])})` });
  const merge = list => { const out = []; list.sort((a, b) => a.v - b.v).forEach(x => { const L = out[out.length - 1]; if (L && Math.abs(x.v / L.v - 1) <= 0.015) { L.v = (L.v * L.sc + x.v * x.sc) / (L.sc + x.sc); L.sc += x.sc; L.why += ' + ' + x.why; } else out.push(Object.assign({}, x)); }); return out; };
  const lv = merge(cands);
  const pickLv = (side) => {
    const L = lv.filter(x => side < 0 ? x.v < P * 0.995 : x.v > P * 1.005).sort((a, b) => side < 0 ? b.v - a.v : a.v - b.v);
    const near = L.filter(x => Math.abs(x.v / P - 1) <= 0.25);
    let first = near.find(x => x.sc >= 2 && Math.abs(x.v / P - 1) <= 0.1) || near.find(x => x.sc >= 1) || near[0] || null;
    let second = null;
    if (first) second = L.find(x => (side < 0 ? x.v < first.v * 0.97 : x.v > first.v * 1.03) && x.sc >= 1) || L.find(x => side < 0 ? x.v < first.v * 0.97 : x.v > first.v * 1.03) || null;
    return [first, second];
  };
  let [S1, S2] = pickLv(-1), [R1, R2] = pickLv(1);
  if (!R1) R1 = { v: P * (1 + sd1m), sc: 0, why: '1년 신고가 영역이라 위쪽 매물대 없음 → 최근 60일 변동성 기준 1개월 1σ 상단' };
  if (!R2) R2 = { v: R1.v * (1 + sd1m), sc: 0, why: '위쪽 매물대 없음 → R1에서 1개월 1σ 추가' };
  if (!S1) S1 = { v: P * (1 - sd1m), sc: 0, why: '1년 신저가 영역이라 아래 매물대 없음 → 1개월 1σ 하단' };
  if (!S2) S2 = { v: S1.v * (1 - sd1m), sc: 0, why: '아래 매물대 없음 → S1에서 1개월 1σ 추가' };
  const levels = [{ k: '2차 저항 R2', ...R2 }, { k: '1차 저항 R1', ...R1 }, { k: '현재가', v: P, why: `${dateKo(dayStr(t[n - 1]))} 종가` }, { k: '1차 지지 S1', ...S1 }, { k: '2차 지지 S2', ...S2 }];
  sec.push({ no: '②', title: '주요 지지선과 저항선', items: [
    `1차 저항 ${f(R1.v)}(${pc(R1.v)}): ${R1.why} · 2차 저항 ${f(R2.v)}(${pc(R2.v)}): ${R2.why}`,
    `1차 지지 ${f(S1.v)}(${pc(S1.v)}): ${S1.why} · 2차 지지 ${f(S2.v)}(${pc(S2.v)}): ${S2.why}`,
    `산출 근거: 최근 ${n}거래일 종가에서 앞뒤 5거래일 중 가장 높은·낮은 날(스윙 고점·저점)을 찾아 ±2% 안에 겹치는 가격을 묶고, 20·60·120일선과 1년 최고·최저 종가를 더해 겹칠수록 강한 가격대로 봄`
  ], levels });

  /* ③ 이동평균선 */
  const arr = m120 == null ? '120일선 계산 기간 부족' : (m20 > m60 && m60 > m120 ? '정배열(20>60>120)' : m20 < m60 && m60 < m120 ? '역배열(20<60<120)' : '혼조(배열 엇갈림)');
  const i3 = [];
  i3.push(`20일선 ${m20 ? f(m20) : '—'}(현재가가 ${m20 ? sp((P / m20 - 1) * 100) : '—'}), 60일선 ${m60 ? f(m60) : '—'}(${m60 ? sp((P / m60 - 1) * 100) : '—'}), 120일선 ${m120 ? f(m120) : '—'}(${m120 ? sp((P / m120 - 1) * 100) : '—'}) · 배열: ${arr}`);
  const dirW = v => v == null ? '—' : v > 0.3 ? '상승' : v < -0.3 ? '하락' : '보합';
  i3.push(`기울기: 20일선 ${dirW(s20)}(5일 ${sp(s20)}), 60일선 ${dirW(s60)}(10일 ${sp(s60)})${s120 != null ? `, 120일선 ${dirW(s120)}(20일 ${sp(s120)})` : ''}`);
  const crosses = [];
  for (let i = Math.max(61, n - 60); i < n; i++) {
    if (ma20[i - 1] != null && ma60[i - 1] != null) {
      const a0 = ma20[i - 1] - ma60[i - 1], a1 = ma20[i] - ma60[i];
      if (a0 <= 0 && a1 > 0) crosses.push(`골든크로스(20일선이 60일선 위로) ${mdShort(t[i])}`);
      if (a0 >= 0 && a1 < 0) crosses.push(`데드크로스(20일선이 60일선 아래로) ${mdShort(t[i])}`);
    }
    if (ma120[i - 1] != null) {
      if (c[i - 1] <= ma120[i - 1] && c[i] > ma120[i]) crosses.push(`120일선 상향 돌파 ${mdShort(t[i])}`);
      if (c[i - 1] >= ma120[i - 1] && c[i] < ma120[i]) crosses.push(`120일선 하향 이탈 ${mdShort(t[i])}`);
    }
  }
  i3.push(crosses.length ? '최근 60거래일 신호: ' + crosses.slice(-3).join(', ') : '최근 60거래일 동안 20·60일선 교차나 120일선 돌파·이탈 없음');
  const gap20 = m20 ? (P / m20 - 1) * 100 : 0;
  i3.push(gap20 > 10 ? `20일선과의 거리(이격)가 ${sp(gap20)}로 커서 단기 과열 — 20일선 쪽으로 되돌림이 나올 수 있음` : gap20 < -10 ? `20일선보다 ${sp(gap20)} 아래로 과도하게 벌어져 기술적 반등 여지` : `20일선과의 거리 ${sp(gap20)}로 과열·과매도 아님`);
  sec.push({ no: '③', title: '이동평균선(20·60·120일선) 배열과 추세', items: i3 });

  /* ④ 거래량 */
  const v20 = avg(vol.slice(-20)), v60 = avg(vol.slice(-60));
  let upV = 0, dnV = 0; for (let i = n - 20; i < n; i++) { if (i < 1) continue; if (c[i] > c[i - 1]) upV += vol[i]; else if (c[i] < c[i - 1]) dnV += vol[i]; }
  const udr = dnV > 0 ? upV / dnV : (upV > 0 ? 9 : 1);
  const obv = [0]; for (let i = 1; i < n; i++) obv.push(obv[i - 1] + (c[i] > c[i - 1] ? vol[i] : c[i] < c[i - 1] ? -vol[i] : 0));
  const obvCh = (obv[n - 1] - obv[Math.max(0, n - 21)]) / Math.max(v20, 1), pCh20 = ret(20) || 0;
  const spikes = []; for (let i = n - 20; i < n; i++) if (i > 0 && vol[i] > v60 * 2) spikes.push(`${mdShort(t[i])}(${sp((c[i] / c[i - 1] - 1) * 100)}, 평소의 ${fx1(vol[i] / v60, 1)}배)`);
  const volW = v => v >= 1e8 ? fx1(v / 1e8, 1) + '억주' : v >= 1e4 ? Math.round(v / 1e4).toLocaleString('ko-KR') + '만주' : Math.round(v).toLocaleString('ko-KR') + '주';
  const i4 = [];
  i4.push(`20일 평균 거래량 ${volW(v20)} — 60일 평균(${volW(v60)}) 대비 ${fx1(v20 / v60 * 100, 0)}% ${v20 > v60 * 1.2 ? '(거래 증가)' : v20 < v60 * 0.8 ? '(거래 감소)' : '(평소 수준)'}`);
  i4.push(`최근 20거래일 상승한 날의 거래량이 하락한 날의 ${fx1(udr, 2)}배 → ${udr > 1.3 ? '매수세 우위' : udr < 0.77 ? '매도세 우위' : '매수·매도 균형'}`);
  const obvTxt = obvCh > 0.5 ? '증가' : obvCh < -0.5 ? '감소' : '정체';
  i4.push(`OBV(오른 날 거래량은 더하고 내린 날은 빼서 누적) 20일간 ${obvTxt}, 같은 기간 주가 ${sp(pCh20)}${pCh20 > 2 && obvCh < -0.5 ? ' → 가격은 오르는데 거래량이 받쳐주지 않는 약세 다이버전스' : pCh20 < -2 && obvCh > 0.5 ? ' → 주가 하락에도 매집 흔적(강세 다이버전스)' : ''}`);
  if (spikes.length) i4.push(`거래량 급증일: ${spikes.slice(-3).join(', ')}`);
  i4.push('참고: 거래량은 압축 저장한 근사치(±2.5%)이며, 국내는 액면분할 등을 반영해 조정');
  sec.push({ no: '④', title: '거래량으로 본 매수·매도세', items: i4 });

  /* ⑤ 보조지표 */
  const rs = rsiArr(c, 14), R = rs[n - 1];
  const e12 = ema(c, 12), e26 = ema(c, 26), macd = c.map((_, i) => e12[i] - e26[i]), sig = ema(macd.map((v, i) => i >= 25 ? v : null), 9);
  const M = macd[n - 1], Sg = sig[n - 1], Hh = M - Sg;
  let mx = null; for (let i = n - 1; i > Math.max(26, n - 40); i--) { if (sig[i - 1] == null) break; const a0 = macd[i - 1] - sig[i - 1], a1 = macd[i] - sig[i]; if (a0 <= 0 && a1 > 0) { mx = `MACD 골든크로스 ${mdShort(t[i])}`; break; } if (a0 >= 0 && a1 < 0) { mx = `MACD 데드크로스 ${mdShort(t[i])}`; break; } }
  const sd20 = stdev(c.slice(-20)), bU = m20 + 2 * sd20, bL = m20 - 2 * sd20, pB = bU > bL ? (P - bL) / (bU - bL) : 0.5;
  const bw = []; for (let i = Math.max(20, n - 120); i < n; i++) { const s = stdev(c.slice(i - 19, i + 1)), m = ma20[i]; bw.push(4 * s / m); }
  const bwNow = bw[bw.length - 1], bwRank = bw.filter(x => x <= bwNow).length / bw.length;
  let div = '';
  const ph = pv.hi.filter(i => i >= n - 80).slice(-2), pl = pv.lo.filter(i => i >= n - 80).slice(-2);
  if (ph.length === 2 && rs[ph[0]] != null && c[ph[1]] > c[ph[0]] && rs[ph[1]] < rs[ph[0]] - 3) div = `약세 다이버전스: 주가 고점은 ${mdShort(t[ph[1]])}에 높아졌는데 RSI 고점은 낮아짐(${fx1(rs[ph[0]], 0)}→${fx1(rs[ph[1]], 0)})`;
  else if (pl.length === 2 && rs[pl[0]] != null && c[pl[1]] < c[pl[0]] && rs[pl[1]] > rs[pl[0]] + 3) div = `강세 다이버전스: 주가 저점은 ${mdShort(t[pl[1]])}에 낮아졌는데 RSI 저점은 높아짐(${fx1(rs[pl[0]], 0)}→${fx1(rs[pl[1]], 0)})`;
  const mfmt = v => (v < 0 ? neg : '') + (mkt === 'US' ? Math.abs(v).toFixed(2) : Math.round(Math.abs(v)).toLocaleString('ko-KR'));
  const i5 = [];
  i5.push(`RSI(14일, 최근 오름폭과 내림폭의 상대 강도) ${fx1(R, 1)} → ${R >= 70 ? '과매수 구간(단기 차익실현 압력)' : R <= 30 ? '과매도 구간(기술적 반등 여지)' : R >= 50 ? '50 위, 상승 모멘텀 우위' : '50 아래, 하락 모멘텀 우위'}`);
  i5.push(`MACD(12·26일 지수평균 차이) ${mfmt(M)}, 시그널(9일) ${mfmt(Sg)} → ${Hh > 0 ? '시그널 위(매수 신호 유지)' : '시그널 아래(매도 신호 유지)'}, 0선 ${M > 0 ? '위(중기 상승)' : '아래(중기 하락)'}${mx ? ' · 최근 ' + mx : ''}`);
  i5.push(`볼린저밴드(20일선±2표준편차) ${f(bL)}~${f(bU)}, 밴드 내 위치 ${fx1(pB * 100, 0)}%${pB > 1 ? ' — 상단 돌파(강한 상승 또는 과열)' : pB < 0 ? ' — 하단 이탈(과매도)' : ''} · 밴드 폭은 최근 6개월 중 ${bwRank >= 0.8 ? `넓은 편(상위 ${fx1(Math.max(1, (1 - bwRank) * 100), 0)}%) → 변동성이 커진 상태` : bwRank <= 0.2 ? `좁은 편(하위 ${fx1(Math.max(1, bwRank * 100), 0)}%) → 큰 변동이 임박했을 가능성` : '보통 수준'}`);
  if (div) i5.push(div);
  sec.push({ no: '⑤', title: 'RSI·MACD 등 주요 보조지표', items: i5 });

  /* ⑥ 시나리오 */
  const i6 = [];
  i6.push(`상승 시나리오: 종가 기준 ${f(R1.v)} 돌파·안착 시 ${f(R2.v)}까지 열림(현재가 대비 ${pc(R2.v)}). 거래량이 20일 평균 이상으로 늘고 MACD가 시그널 위를 유지하면 신뢰도↑`);
  i6.push(`하락 시나리오: ${f(S1.v)} 이탈 시 ${f(S2.v)}까지 밀릴 위험(${pc(S2.v)}). ${down ? '이미 역배열이라 반등이 저항선에서 막히면 하락 지속 가능' : 'RSI가 50 아래로 내려가고 하락일 거래량이 늘면 경계'}`);
  i6.push(`기본 시나리오: ${f(S1.v)}~${f(R1.v)} 사이 등락 — 현재 '${trend}' 흐름이 유지되는지 확인`);
  i6.push(`통계적 범위: 최근 60거래일 하루 변동성 ${fx1(sd60 * 100, 2)}% → 1개월(21거래일) 1σ 범위 ${f(P * (1 - sd1m))}~${f(P * (1 + sd1m))}(정규분포 가정 시 약 68% 확률 구간)`);
  sec.push({ no: '⑥', title: '주요 상승·하락 시나리오', items: i6 });

  /* ⑦ 분할매수·손절 */
  const zone = (v) => [v * 0.985, v * 1.015];
  let zones;
  if (down) zones = [
    { k: '1차 30%', lo: m20 || P, hi: (m20 || P) * 1.02, why: '20일선 종가 회복과 거래량 증가를 확인한 뒤(추세 전환 확인)' },
    { k: '2차 35%', lo: zone(S1.v)[0], hi: zone(S1.v)[1], why: `1차 지지 ${f(S1.v)}에서 버티는 것을 확인할 때` },
    { k: '3차 35%', lo: zone(S2.v)[0], hi: zone(S2.v)[1], why: `2차 지지 ${f(S2.v)} 부근 — 손절선과 가까워 비중 조절` }];
  else zones = [
    { k: '1차 30%', lo: Math.min(P, m20 || P), hi: Math.max(P, m20 || P), why: up ? '상승 추세 중이라 현재가~20일선에서 일부 선진입' : '현재가~20일선 사이' },
    { k: '2차 35%', lo: zone(S1.v)[0], hi: zone(S1.v)[1], why: `1차 지지 ${f(S1.v)} 눌림목` },
    { k: '3차 35%', lo: zone(S2.v)[0], hi: zone(S2.v)[1], why: `2차 지지 ${f(S2.v)} 부근` }];
  const stopBase = Math.min(S2.v, zones[2].lo), buf = Math.max(0.03, atrP * 1.5), stop = stopBase * (1 - buf);
  const wAvg = zones.reduce((s, z, k) => s + (z.lo + z.hi) / 2 * [0.3, 0.35, 0.35][k], 0);
  const risk = (wAvg - stop) / wAvg * 100, reward = (R1.v - wAvg) / wAvg * 100, rr = risk > 0 ? reward / risk : null;
  const i7 = zones.map(z => `${z.k}: ${f(z.lo)}~${f(z.hi)} — ${z.why}`);
  i7.push(`손절 기준: 종가 기준 ${f(stop)} 이탈(현재가 대비 ${pc(stop)}) — 2차 지지 아래로 하루 평균 변동폭(최근 14일 ${fx1(atrP * 100, 2)}%)의 1.5배(최소 3%) 여유를 둔 값`);
  i7.push(`위 비중대로 모두 체결되면 평균 단가 약 ${f(wAvg)}, 손절까지 ${sp(-risk)}, 1차 저항까지 ${sp(reward)}${rr != null ? ` → 손익비 ${fx1(Math.max(rr, 0), 1)}배${rr < 1 ? ' (1배 미만: 기대수익보다 위험이 큼)' : ''}` : ''}`);
  sec.push({ no: '⑦', title: '분할매수 고려 구간과 손절 기준', items: i7, zones, stop });

  const summary = `${trend} · RSI ${fx1(R, 0)} · MACD ${Hh > 0 ? '매수' : '매도'} 신호 · 1차 지지 ${f(S1.v)} / 1차 저항 ${f(R1.v)}`;
  return { ok: true, mkt, P, date: dayStr(t[n - 1]), n, trend, summary, sec, levels, ind: { rsi: R, macd: M, signal: Sg, pB, m20, m60, m120 }, S1, S2, R1, R2, stop, zones, sd60 };
}

function renderTech(host, rec) {
  host.textContent = '';
  const ta = techAnalysis(rec);
  if (!ta.ok) { host.append(h('div', { class: 'empty', text: ta.msg })); return ta; }
  host.append(h('div', { class: 'ta-sum' }, h('b', { text: '요약 ' }), ta.summary, h('div', { class: 'mini', style: 'margin-top:3px', text: `${dateKo(ta.date)} 종가까지 ${ta.n}거래일의 실제 종가·거래량으로 계산 · 가격대는 ${ta.mkt === 'US' ? '센트' : '호가 단위'}로 반올림` })));
  const lt = h('table', { class: 'ftbl', style: 'margin:0 0 12px' }, h('thead', null, h('tr', null, h('th', { text: '가격대' }), h('th', { text: '가격' }), h('th', { text: '현재가 대비' }), h('th', { style: 'text-align:left', text: '산출 근거' }))));
  const tb = h('tbody');
  ta.levels.forEach(l => tb.append(h('tr', l.k === '현재가' ? { class: 'hl' } : null, h('td', { text: l.k }), h('td', { text: pxFmt(tickRound(l.v, ta.mkt), ta.mkt) }), h('td', { class: dirCls(l.v - ta.P), text: l.k === '현재가' ? '—' : sp((l.v / ta.P - 1) * 100) }), h('td', { style: 'text-align:left;white-space:normal;color:var(--ink-2)', text: l.why }))));
  lt.append(tb); host.append(h('div', { class: 'tblw' }, lt));
  ta.sec.forEach(s => host.append(h('div', { class: 'ta-sec' }, h('h4', { text: `${s.no} ${s.title}` }), h('ul', null, ...s.items.map(x => h('li', { text: x }))))));
  host.append(h('p', { class: 'mini', text: '규칙에 따라 기계적으로 계산한 결과입니다. 실제 매매는 실적·뉴스·시장 상황과 함께 판단하세요. 이 분석은 참고용입니다.' }));
  return ta;
}
