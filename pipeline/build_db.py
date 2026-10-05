# 종목 DB 생성: 국내(FinanceData/marcap, 2016~) + 미국(us-stock-data, 2024.7~) → 압축 JS
import os, json, math, urllib.request, time, datetime as dt
import numpy as np, pandas as pd
D = os.path.dirname(os.path.abspath(__file__))
os.chdir(D)

# ── 공통: VLQ base64 인코딩 (델타 + 지그재그) ──
B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
def vlq(n):
    z = (n << 1) if n >= 0 else ((-n) << 1) | 1
    out = ''
    while True:
        d = z & 31; z >>= 5
        if z: d |= 32
        out += B64[d]
        if not z: return out
def enc_series(vals):
    prev = 0; s = ''
    for v in vals:
        iv = int(round(v)); s += vlq(iv - prev); prev = iv
    return s
def enc_dates(dates):   # 날짜 → 1970-01-01 이후 일수의 델타
    days = [(pd.Timestamp(x) - pd.Timestamp('1970-01-01')).days for x in dates]
    return enc_series(days)
B64I = {ch: i for i, ch in enumerate(B64)}
def dec_series(s):      # 검증용 디코더 (enc_series 역변환)
    out = []; cur = 0; z = 0; sh = 0
    for ch in s:
        d = B64I[ch]; z |= (d & 31) << sh
        if d & 32: sh += 5; continue
        cur += -(z >> 1) if z & 1 else z >> 1
        out.append(cur); z = 0; sh = 0
    return out

def vol_q(vol, dts, idx):
    """거래량 → q = round(ln(1+v)*20), d 시리즈와 같은 날짜(idx)로 정렬. 결측·음수 → 0"""
    v = np.asarray(vol, dtype=float)
    v = pd.Series(np.where(np.isfinite(v) & (v > 0), v, 0.0), index=dts).reindex(idx).fillna(0.0).to_numpy()
    return np.round(np.log1p(v) * 20)

def fetch(url, path, tries=3):
    if os.path.exists(path) and os.path.getsize(path) > 1000: return path
    for t in range(tries):
        try:
            urllib.request.urlretrieve(url, path); return path
        except Exception as e:
            print('retry', url, e); time.sleep(3)
    raise RuntimeError(url)

def r(x, nd=1):
    return None if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))) else round(float(x), nd)

def stats_from(close, dates, last_date, scale):
    """close: np.array(조정 종가), dates: DatetimeIndex"""
    n = len(close); p = close[-1]
    def ret(k):
        return (p / close[-1 - k] - 1) * 100 if n > k and close[-1 - k] > 0 else None
    ytd_base = close[dates < pd.Timestamp(f'{last_date.year}-01-01')]
    ytd = (p / ytd_base[-1] - 1) * 100 if len(ytd_base) else None
    one = close[-250:] if n >= 2 else close
    lr = np.diff(np.log(one)) if len(one) > 2 else np.array([])
    vol = float(np.std(lr) * math.sqrt(250) * 100) if len(lr) > 20 else None
    peak = np.maximum.accumulate(one); mdd = float(((one / peak) - 1).min() * 100) if len(one) > 1 else None
    since = (p / close[0] - 1) * 100 if n > 1 else None
    return [r(ret(5)), r(ret(21)), r(ret(63)), r(ret(126)), r(ytd), r(ret(250)), r(ret(750)), r(ret(1250)), r(vol), r(mdd), r(float(one.max()) / scale, 2 if scale > 1 else 0), r(float(one.min()) / scale, 2 if scale > 1 else 0), r(since), str(dates[0].date())]

def resample(series_dates, close):
    s = pd.Series(close, index=series_dates)
    w = s.groupby(s.index.to_period('W-FRI')).last()
    m = s.groupby(s.index.to_period('M')).last()
    y = s.groupby(s.index.to_period('Y')).last()
    return w, m, y

# ── KOSPI/KOSDAQ 프록시 지수: 상폐 포함 전 종목 보통주, 전일 시총 가중 · 기준가 대비 수익률 체인 ──
def kr_index(allr):
    """allr: marcap 전체 행(상폐 종목 포함). 반환 {지수명: pd.Series(지수, index=전체 거래일)}"""
    allr = allr.drop_duplicates(['Code', 'Date'], keep='last')
    cal = pd.DatetimeIndex(sorted(allr['Date'].unique()))          # 전체 거래일 축
    common = allr['Code'].str.fullmatch(r'[0-9]{5}0').fillna(False).to_numpy(dtype=bool)  # 6자리 숫자·끝자리 0 = 보통주
    lv = {}
    for name, mks in (('KOSPI', ['KOSPI']), ('KOSDAQ', ['KOSDAQ', 'KOSDAQ GLOBAL'])):
        x = allr[common & allr['Market'].isin(mks).to_numpy()].sort_values(['Code', 'Date'])
        di = pd.Series(np.searchsorted(cal.values, x['Date'].values), index=x.index)
        p_di = di.groupby(x['Code'], sort=False).shift(1)
        p_cap = x['Marcap'].groupby(x['Code'], sort=False).shift(1)
        base = x['Close'] - x['Changes']                               # KRX 기준가
        # t-1·t 모두 행 존재, 전일 시총>0, 기준가>0, 거래량>0(거래정지 제외; 종가>0은 안전장치)
        ok = ((p_di == di - 1) & (p_cap > 0) & (base > 0) & (x['Volume'] > 0) & (x['Close'] > 0) & (x['Close'] < 10 * base)).to_numpy()
        k = di.to_numpy()[ok]; w = p_cap.to_numpy()[ok]; rr = (x['Close'] / base).to_numpy()[ok] - 1
        num = np.bincount(k, weights=w * rr, minlength=len(cal)); den = np.bincount(k, weights=w, minlength=len(cal))
        ret = np.divide(num, den, out=np.zeros(len(cal)), where=den > 0); ret[0] = 0.0
        lv[name] = pd.Series(1000.0 * np.cumprod(1 + ret), index=cal)  # 2016 첫 거래일 = 1000
        print(f'index {name}: stocks {x["Code"].nunique()}, used obs {int(ok.sum())}, days without obs {int((den[1:] == 0).sum())}')
    yr = {n: s.groupby(s.index.year).last() for n, s in lv.items()}
    print('index annual price return % (2016 = vs 1000 on first trading date', str(cal[0].date()) + ')')
    for yy in yr['KOSPI'].index:
        row = [f'{(yr[n][yy] / (yr[n][yy - 1] if yy - 1 in yr[n].index else 1000.0) - 1) * 100:+.1f}' for n in lv]
        print('  ', yy, ' '.join(f'{n} {v:>6}' for n, v in zip(lv, row)), '(YTD)' if yy == cal[-1].year else '')
    print('index final', str(cal[-1].date()), {n: round(float(s.iloc[-1]), 2) for n, s in lv.items()})
    return lv

# ───────── 국내 ─────────
def build_kr():
    years = list(range(2016, dt.date.today().year + 1))
    for y in years:
        try:
            fetch(f'https://raw.githubusercontent.com/FinanceData/marcap/master/data/marcap-{y}.parquet', f'marcap-{y}.parquet')
        except RuntimeError:
            if y != years[-1]: raise
            years.pop(); print('marcap', y, '파일이 아직 없음(새해 첫 거래일 전) → 전년도까지 사용')
    last = pd.read_parquet(f'marcap-{years[-1]}.parquet', columns=['Date', 'Code', 'Name', 'Close', 'Changes', 'ChangesRatio', 'Amount', 'Marcap', 'Stocks', 'Market', 'High', 'Low', 'Volume'])
    last['Date'] = pd.to_datetime(last['Date'])
    ld = last['Date'].max()
    snap = last[(last['Date'] == ld) & (last['Market'].isin(['KOSPI', 'KOSDAQ', 'KOSDAQ GLOBAL']))].copy()
    codes = set(snap['Code'])
    parts = []; full = []
    for y in years:
        df = pd.read_parquet(f'marcap-{y}.parquet', columns=['Date', 'Code', 'Close', 'Changes', 'Volume', 'Amount', 'Marcap', 'Market'])
        df['Date'] = pd.to_datetime(df['Date'])
        full.append(df[['Date', 'Code', 'Close', 'Changes', 'Volume', 'Marcap', 'Market']])   # 지수용: 상폐 포함 전 종목
        df = df.loc[df['Code'].isin(codes), ['Date', 'Code', 'Close', 'Changes', 'Volume', 'Amount']]
        parts.append(df)
        print('KR year', y, len(df))
    lv = kr_index(pd.concat(full, ignore_index=True)); del full
    allk = pd.concat(parts).sort_values(['Code', 'Date'])
    allk = allk[allk['Close'] > 0]
    # 공통 거래일 축
    dates_all = pd.DatetimeIndex(sorted(allk['Date'].unique()))
    d_axis = dates_all[-250:]
    w_axis = pd.PeriodIndex(sorted(set(dates_all.to_period('W-FRI'))))[-156:]
    m_axis = pd.PeriodIndex(sorted(set(dates_all.to_period('M'))))[-120:]
    y_axis = pd.PeriodIndex(sorted(set(dates_all.to_period('Y'))))
    out = []
    n_adj = 0
    CHECK = ('005930', '000660', '035420', '035720', '005380')
    for code, g in allk.groupby('Code', sort=False):
        g = g.drop_duplicates('Date', keep='last')
        c = g['Close'].to_numpy(dtype=float); dts = pd.DatetimeIndex(g['Date'])
        vol = g['Volume'].to_numpy(dtype=float); vol = np.where(np.isfinite(vol) & (vol > 0), vol, 0.0)
        # 권리락·액면분할/병합·무상증자·주식배당·감자·분할 보정 (KRX 수정주가 방식):
        # 기준가(종가-대비)가 전일 종가와 다르면 f = 기준가/전일종가 만큼 이전 가격 전체를 누적 조정, 거래량은 역조정
        base = c - g['Changes'].to_numpy(dtype=float)
        prev = np.r_[np.nan, c[:-1]]
        with np.errstate(divide='ignore', invalid='ignore'):
            f = base / prev
        ev = (prev > 0) & (base > 0) & (np.abs(f - 1) > 0.002) & (f >= 0.005) & (f <= 200)
        adj = np.ones(len(c))
        for i in np.flatnonzero(ev):
            adj[:i] *= f[i]; vol[:i] /= f[i]
        n_adj += int(ev.sum())
        ca = c * adj
        if code in CHECK:
            lr = np.abs(np.diff(np.log(ca))); j = int(np.argmax(lr))
            print(f'  check {code}: events {[(str(dts[i].date()), round(float(f[i]), 4)) for i in np.flatnonzero(ev)]} | max |daily log ret| {lr[j]:.4f} on {dts[j + 1].date()}')
            if code == '005930':
                win = (dts >= '2018-04-26') & (dts <= '2018-05-08')
                print('    005930 raw -> adj close', [(str(d.date()), int(a), round(float(b))) for d, a, b in zip(dts[win], c[win], ca[win])])
        row = snap[snap['Code'] == code].iloc[0]
        s_d = pd.Series(ca, index=dts)
        dvals = s_d.reindex(d_axis).dropna()
        d_off = int(np.searchsorted(d_axis, dvals.index[0])) if len(dvals) else len(d_axis)
        vq = vol_q(vol, dts, dvals.index)              # d 시리즈와 동일 날짜의 (조정) 거래량
        assert len(vq) == len(dvals), code
        w, m, y = resample(dts, ca)
        w = w.reindex(w_axis).dropna(); m = m.reindex(m_axis).dropna(); y = y.reindex(y_axis).dropna()
        w_off = int(w_axis.get_loc(w.index[0])) if len(w) else len(w_axis)
        m_off = int(m_axis.get_loc(m.index[0])) if len(m) else len(m_axis)
        y_off = int(y_axis.get_loc(y.index[0])) if len(y) else len(y_axis)
        amt20 = float(g['Amount'].to_numpy()[-20:].mean())
        stt = stats_from(ca, dts, ld, 1)
        mk = 'KQ' if row['Market'].startswith('KOSDAQ') else 'KS'
        out.append([mk, code, row['Name'], '', '', '', int(row['Close']), r(row['ChangesRatio'], 2), int(row['Marcap'] // 1e8), int(row['Stocks']), int(amt20 // 1e8), stt,
                    d_off, enc_series(dvals.values), w_off, enc_series(w.values), m_off, enc_series(m.values), y_off, enc_series(y.values), enc_series(vq)])
    print('KR stocks', len(out), 'corporate-action adjustments', n_adj, 'last date', ld.date())
    axes = {'d': enc_dates(d_axis), 'w': enc_dates([p.end_time.normalize() for p in w_axis]), 'm': enc_dates([p.start_time for p in m_axis]), 'y': enc_dates([p.start_time for p in y_axis])}
    # 지수: 종목과 같은 KR 축(d/w/m/y)에 동일 방식으로 저장, 값 = round(지수*100)
    idx = {}
    for name, s in lv.items():
        dv = s.reindex(d_axis).dropna()
        d_off = int(np.searchsorted(d_axis, dv.index[0])) if len(dv) else len(d_axis)
        w, m, y = resample(s.index, s.to_numpy())
        w = w.reindex(w_axis).dropna(); m = m.reindex(m_axis).dropna(); y = y.reindex(y_axis).dropna()
        w_off = int(w_axis.get_loc(w.index[0])) if len(w) else len(w_axis)
        m_off = int(m_axis.get_loc(m.index[0])) if len(m) else len(m_axis)
        y_off = int(y_axis.get_loc(y.index[0])) if len(y) else len(y_axis)
        idx[name] = [d_off, enc_series(dv.values * 100), w_off, enc_series(w.values * 100), m_off, enc_series(m.values * 100), y_off, enc_series(y.values * 100)]
        print(f'index {name} on KR axes: d {d_off}+{len(dv)}/{len(d_axis)}, w {w_off}+{len(w)}/{len(w_axis)}, m {m_off}+{len(m)}/{len(m_axis)}, y {y_off}+{len(y)}/{len(y_axis)}')
    return out, axes, str(ld.date()), idx

# ───────── 미국 ─────────
KO = {
 'AAPL':'애플','MSFT':'마이크로소프트','NVDA':'엔비디아','GOOGL':'알파벳 A 구글','GOOG':'알파벳 C 구글','AMZN':'아마존','META':'메타 페이스북','TSLA':'테슬라','AVGO':'브로드컴','BRK-B':'버크셔 해서웨이 B','BRK.B':'버크셔 해서웨이 B',
 'JPM':'JP모건체이스','V':'비자','MA':'마스터카드','UNH':'유나이티드헬스','LLY':'일라이 릴리','XOM':'엑슨모빌','JNJ':'존슨앤드존슨','PG':'P&G 프록터앤드갬블','HD':'홈디포','COST':'코스트코','WMT':'월마트','ABBV':'애브비',
 'KO':'코카콜라','PEP':'펩시코','MRK':'머크','CVX':'셰브론','ORCL':'오라클','NFLX':'넷플릭스','AMD':'AMD','ADBE':'어도비','CRM':'세일즈포스','BAC':'뱅크오브아메리카','TMO':'써모피셔','MCD':'맥도날드','CSCO':'시스코',
 'ACN':'액센츄어','ABT':'애보트','DIS':'디즈니','WFC':'웰스파고','INTC':'인텔','QCOM':'퀄컴','TXN':'텍사스인스트루먼트','IBM':'IBM','AMGN':'암젠','PFE':'화이자','CAT':'캐터필러','GS':'골드만삭스','MS':'모건스탠리',
 'BA':'보잉','NKE':'나이키','SBUX':'스타벅스','PLTR':'팔란티어','UBER':'우버','PYPL':'페이팔','MU':'마이크론','ASML':'ASML','TSM':'TSMC 대만반도체','ARM':'ARM 암홀딩스','SMCI':'슈퍼마이크로','COIN':'코인베이스',
 'MSTR':'스트래티지 마이크로스트래티지','SPY':'SPDR S&P500','VOO':'뱅가드 S&P500','IVV':'아이셰어즈 S&P500','QQQ':'인베스코 QQQ 나스닥100','QQQM':'인베스코 나스닥100','SCHD':'슈왑 미국배당','JEPI':'JP모건 프리미엄인컴',
 'JEPQ':'JP모건 나스닥 프리미엄인컴','O':'리얼티인컴','T':'AT&T','VZ':'버라이즌','MO':'알트리아','PM':'필립모리스','ADP':'ADP','MDT':'메드트로닉','KMB':'킴벌리클라크','GPC':'제뉴인파츠','SYY':'시스코 식품유통',
 'CL':'콜게이트','TGT':'타깃','LOW':'로우스','UPS':'UPS','LMT':'록히드마틴','RTX':'RTX 레이시온','NEE':'넥스트에라에너지','DUK':'듀크에너지','SO':'서던컴퍼니','D':'도미니언에너지','AEP':'아메리칸일렉트릭파워',
 'ED':'콘솔리데이티드에디슨','BMY':'브리스톨마이어스','GIS':'제너럴밀스','HSY':'허쉬','MAIN':'메인스트리트캐피털','ADC':'애그리리얼티','STAG':'스태그인더스트리얼','VICI':'비치프로퍼티스','PLD':'프로로지스','EPD':'엔터프라이즈프로덕츠',
 'ENB':'엔브리지','KMI':'킨더모건','ARCC':'에어리스캐피털','VIG':'뱅가드 배당성장','DGRO':'아이셰어즈 배당성장','SPYD':'SPDR 고배당','HDV':'아이셰어즈 고배당','NOBL':'프로셰어즈 배당귀족','DIVO':'앰플리파이 배당인컴',
 'QYLD':'글로벌X 나스닥 커버드콜','VNQ':'뱅가드 리츠','VYM':'뱅가드 고배당','VTI':'뱅가드 토탈마켓','DIA':'SPDR 다우존스','TLT':'아이셰어즈 미국 장기국채','IWM':'아이셰어즈 러셀2000','SOXX':'아이셰어즈 반도체',
 'SMH':'반에크 반도체','XLE':'에너지 섹터 SPDR','XLK':'기술 섹터 SPDR','XLF':'금융 섹터 SPDR','GLD':'SPDR 금','SLV':'아이셰어즈 은','SCHG':'슈왑 성장주','VUG':'뱅가드 성장주','VEA':'뱅가드 선진국','VWO':'뱅가드 신흥국',
 'BND':'뱅가드 채권','AGG':'아이셰어즈 채권','SHOP':'쇼피파이','SNOW':'스노우플레이크','CRWD':'크라우드스트라이크','PANW':'팔로알토','NOW':'서비스나우','INTU':'인튜이트','AMAT':'어플라이드머티리얼즈','LRCX':'램리서치',
 'KLAC':'KLA','ADI':'아날로그디바이스','MRVL':'마벨','ON':'온세미','NXPI':'NXP','DELL':'델','HPQ':'HP','HPE':'HPE','ANET':'아리스타','VRT':'버티브','GEV':'GE버노바','GE':'GE에어로스페이스','HON':'허니웰',
 'MMM':'3M','DE':'디어','UNP':'유니온퍼시픽','F':'포드','GM':'GM 제너럴모터스','RIVN':'리비안','LCID':'루시드','NIO':'니오','BABA':'알리바바','PDD':'핀둬둬 테무','JD':'징둥','BIDU':'바이두','SONY':'소니','TM':'도요타',
 'NVO':'노보노디스크','AZN':'아스트라제네카','MRNA':'모더나','ISRG':'인튜이티브서지컬','SPGI':'S&P글로벌','BLK':'블랙록','SCHW':'찰스슈왑','C':'씨티그룹','AXP':'아메리칸익스프레스','BX':'블랙스톤','KKR':'KKR',
 'ABNB':'에어비앤비','BKNG':'부킹홀딩스','MAR':'메리어트','CMG':'치폴레','YUM':'얌브랜즈','LULU':'룰루레몬','ROKU':'로쿠','SPOT':'스포티파이','RBLX':'로블록스','EA':'일렉트로닉아츠','TTWO':'테이크투','ZM':'줌',
 'DOCU':'도큐사인','NET':'클라우드플레어','DDOG':'데이터독','MDB':'몽고DB','TEAM':'아틀라시안','WDAY':'워크데이','TTD':'트레이드데스크','APP':'앱러빈','HOOD':'로빈후드','SOFI':'소파이','IONQ':'아이온큐','RGTI':'리게티',
 'OKLO':'오클로','SMR':'뉴스케일파워','CEG':'컨스텔레이션에너지','VST':'비스트라','CCJ':'카메코','LEU':'센트러스에너지','BWXT':'BWX테크놀로지스','RKLB':'로켓랩','ASTS':'AST스페이스모바일','LUNR':'인튜이티브머신스',
}
def build_us():
    uni = pd.read_csv('universe.csv')   # 미국 종목 메타(이름·섹터·시총·S&P500·ETF 여부) — 저장소에 포함
    fetch('https://github.com/q100423gg-coder/us-stock-data/releases/download/data/prices.parquet', 'us_prices.parquet')   # 외부 공개 데이터(시총 20억달러 이상, 2024.7~)
    px = pd.read_parquet('us_prices.parquet')
    px['date'] = pd.to_datetime(px['date'])
    ld = px['date'].max()
    dates_all = pd.DatetimeIndex(sorted(px['date'].unique()))
    d_axis = dates_all[-250:]
    w_axis = pd.PeriodIndex(sorted(set(dates_all.to_period('W-FRI'))))
    m_axis = pd.PeriodIndex(sorted(set(dates_all.to_period('M'))))
    y_axis = pd.PeriodIndex(sorted(set(dates_all.to_period('Y'))))
    meta = uni.set_index('ticker')
    out = []
    for tk, g in px.groupby('ticker', sort=False):
        g = g.sort_values('date').drop_duplicates('date', keep='last')
        g = g[g['close'] > 0]
        if len(g) < 2 or g['date'].iloc[-1] < ld - pd.Timedelta(days=7): continue
        c = g['close'].to_numpy(dtype=float) * 100; dts = pd.DatetimeIndex(g['date'])
        s_d = pd.Series(c, index=dts); dvals = s_d.reindex(d_axis).dropna()
        d_off = int(np.searchsorted(d_axis, dvals.index[0])) if len(dvals) else len(d_axis)
        vq = vol_q(g['volume'].to_numpy(dtype=float), dts, dvals.index)   # d 시리즈와 동일 날짜의 거래량
        assert len(vq) == len(dvals), tk
        w, m, y = resample(dts, c)
        w = w.reindex(w_axis).dropna(); m = m.reindex(m_axis).dropna(); y = y.reindex(y_axis).dropna()
        w_off = int(w_axis.get_loc(w.index[0])); m_off = int(m_axis.get_loc(m.index[0])); y_off = int(y_axis.get_loc(y.index[0]))
        mt = meta.loc[tk] if tk in meta.index else None
        name = str(mt['name']) if mt is not None else tk
        sector = '' if mt is None or pd.isna(mt['sector']) else str(mt['sector'])
        industry = '' if mt is None or pd.isna(mt['industry']) else str(mt['industry'])
        etf = int(mt['etf']) if mt is not None and not pd.isna(mt['etf']) else 0
        if etf and not sector: sector = 'ETF'
        mcap = float(mt['market_cap']) if mt is not None and not pd.isna(mt['market_cap']) else 0
        chg = (c[-1] / c[-2] - 1) * 100
        tv20 = float((g['close'].to_numpy()[-20:] * g['volume'].to_numpy()[-20:]).mean())
        stt = stats_from(c, dts, ld, 100)
        sp = int(mt['sp500']) if mt is not None and not pd.isna(mt['sp500']) else 0
        out.append(['US', tk, name, KO.get(tk, ''), sector, industry + ('|SP500' if sp else ''), round(c[-1] / 100, 2), r(chg, 2), int(mcap // 1e6), 0, int(tv20 // 1e6), stt,
                    d_off, enc_series(dvals.values), w_off, enc_series(w.values), m_off, enc_series(m.values), y_off, enc_series(y.values), enc_series(vq)])
    print('US tickers', len(out), 'last date', ld.date())
    axes = {'d': enc_dates(d_axis), 'w': enc_dates([p.end_time.normalize() for p in w_axis]), 'm': enc_dates([p.start_time for p in m_axis]), 'y': enc_dates([p.start_time for p in y_axis])}
    return out, axes, str(ld.date())

if __name__ == '__main__':
    kr, kax, kd, kidx = build_kr()
    us, uax, ud = build_us()
    db = {'asof': {'KR': kd, 'US': ud}, 'ax': {'KR': kax, 'US': uax}, 's': kr + us, 'idx': kidx}
    # 레코드: [mk, code, name, ko, sector, industry, price, chg, mcap, shares, avgAmt, stats, d_off, d_enc, w_off, w_enc, m_off, m_enc, y_off, y_enc, v_enc]
    for rec in db['s']:
        assert len(rec) == 21, rec[1]
        assert len(dec_series(rec[20])) == len(dec_series(rec[13])), ('volume/d length mismatch', rec[1])
    print('volume length check OK for', len(db['s']), 'records')
    js = 'window.STOCK_DB=' +json.dumps(db, ensure_ascii=False, separators=(',', ':')) + ';'
    open('stock_db.js', 'w', encoding='utf-8').write(js)
    print('stock_db.js size MB', round(len(js.encode('utf-8')) / 1e6, 2), 'stocks', len(db['s']))
