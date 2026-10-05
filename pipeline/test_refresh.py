# refresh.py·build.py 순수 함수 점검: python pipeline/test_refresh.py  (출력 'OK'면 정상)
import os, sys
D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, D); sys.path.insert(0, os.path.join(D, '..', 'app'))
import refresh, build

# 첫 적립 월 = 미국 데이터 날짜의 다음 달
assert refresh.start_of('2026-10-02') == (2026, 11)
assert refresh.start_of('2026-12-30') == (2027, 1)

# 날짜 표기
assert refresh.ko_date('2026-10-01') == '2026.10.1'
assert refresh.short_date('2026-10-02', '2026-10-01') == '10.2'        # 기준 날짜와 같은 해 → 월.일
assert refresh.short_date('2027-01-05', '2026-12-30') == '2027.1.5'    # 해가 다르면 전체

# 연중 환율 고·저 (일별 종가 → 값과 월/일)
closes = [('2026-01-05', 1440.0), ('2026-07-02', 1555.8), ('2026-09-09', 1336.1), ('2026-10-02', 1350.6)]
assert refresh.fx_range(closes) == {'hi': 1555.8, 'hiD': '7/2', 'lo': 1336.1, 'loD': '9/9'}

# 데이터가 새로워졌는지 (어느 한 시장이라도 날짜가 뒤면 참)
assert refresh.is_newer({'KR': '2026-10-02', 'US': '2026-10-02'}, {'KR': '2026-10-01', 'US': '2026-10-02'})
assert not refresh.is_newer({'KR': '2026-10-01', 'US': '2026-10-02'}, {'KR': '2026-10-01', 'US': '2026-10-02'})
assert refresh.is_newer({'KR': '2026-10-01', 'US': '2026-10-02'}, None)

# 종목 수 관문: 이전의 90% 미만이거나 0이면 문제
assert refresh.count_gate({'kr_etf': 1000, 'us_etf': 2000}, {'kr_etf': 950, 'us_etf': 2100}) == []
bad = refresh.count_gate({'kr_etf': 1000, 'us_etf': 2000}, {'kr_etf': 850, 'us_etf': 0})
assert len(bad) == 2 and 'kr_etf' in bad[0] and 'us_etf' in bad[1], bad
assert refresh.count_gate(None, {'kr_etf': 5}) == []                   # 첫 실행(이전 값 없음)

# 매크로 브리핑이 가격 데이터보다 며칠 오래됐나
assert refresh.days_between('2026-10-04', '2026-10-09') == 5

# 빌드 때 문구 자리표시자 채우기
meta = {'asof': {'KR': '2026-10-01', 'US': '2026-10-02'}, 'fx': 1350.6, 'fx_date': '2026-10-02',
        'counts': {'kr_stk': 2766, 'kr_etf': 1171, 'us_stk': 2031, 'us_etf': 2033}, 'us_etf_universe': 5758}
out = build.fill('국내 {{KR_D}}·미국 {{US_DS}} 종가, 원/달러 {{FX}}원 · 첫 달({{START}}) · {{AS_Y}}+N년 {{AS_M}}월 · {{N_ALL}} · {{N_KR_STK}}종목 · ETF {{N_US_ETF_UNI}}개', meta)
assert out == '국내 2026.10.1·미국 10.2 종가, 원/달러 1,350.6원 · 첫 달(2026년 11월) · 2026+N년 10월 · 8,000여 개 · 2,766종목 · ETF 5,758개', out
try:
    build.fill('남은 {{UNKNOWN}}', meta); assert False, '남은 자리표시자를 잡아야 함'
except KeyError:
    pass
print('OK')
