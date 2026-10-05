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

# ── 매크로 타일 자동 갱신 ──
# 부호 표기: 양수 '+', 음수 '▲'(앱 규칙), 0은 빈 부호
assert refresh.pm(1.234, 1, '%') == '+1.2%' and refresh.pm(-88.4, 1, '원') == '▲88.4원' and refresh.pm(0, 1, '%') == '0.0%'
# 정책금리 시리즈에서 마지막으로 값이 바뀐 날과 그 전 값
fed = [('2026-09-15', 3.75), ('2026-09-16', 4.0), ('2026-09-17', 4.0), ('2026-10-04', 4.0)]
assert refresh.last_change(fed) == ('2026-09-16', 4.0, 3.75)
# 전년 동월 대비 % (월별 지수 13개 이상), 가장 최근 달과 그 전 달
cpi = [(f'2025-{m:02d}-01', 300 + m) for m in range(1, 13)] + [('2026-01-01', 313.0), ('2026-02-01', 316.0)]
yo = refresh.yoy(cpi)
assert yo[0] == ('2026-02-01', round((316.0 / 302 - 1) * 100, 1)) and yo[1] == ('2026-01-01', round((313.0 / 301 - 1) * 100, 1)), yo
# 연초 기준값 = 전년 마지막 종가, 연중 고점
ser = [('2025-12-30', 100.0), ('2025-12-31', 102.0), ('2026-01-02', 101.0), ('2026-06-01', 130.0), ('2026-10-02', 120.0)]
assert refresh.ytd_base(ser, '2026-10-02') == 102.0
assert refresh.ytd_high(ser, '2026-10-02') == 130.0
# 기준일 이하의 마지막 두 값
assert refresh.last_two(ser, '2026-10-02') == (('2026-10-02', 120.0), ('2026-06-01', 130.0))
assert refresh.last_two(ser, '2026-01-02') == (('2026-01-02', 101.0), ('2025-12-31', 102.0))
# 한국은행 기준금리 표 해석 (연도 · 월일 · 금리 행)
html = '<table><tr><th>연도</th><th>일자</th><th>기준금리</th></tr><tr><td rowspan="2">2026</td><td>08월 27일</td><td>3.00</td></tr><tr><td>07월 16일</td><td>2.75</td></tr><tr><td>2025</td><td>05월 29일</td><td>2.50</td></tr></table>'
assert refresh.parse_bok(html) == [('2026-08-27', 3.0), ('2026-07-16', 2.75), ('2025-05-29', 2.5)]
# 타일 조립: 수집값 → 화면 타일 10개 (값·설명·등락·출처)
src = {'us': '2026-10-02',
       'fed_u': fed, 'fed_l': [(d, v - 0.25) for d, v in fed],
       'cpi': cpi, 'cpi_core': [(d, v + 1) for d, v in cpi],
       'unrate': [('2026-08-01', 4.1), ('2026-09-01', 4.2)], 'payems': [('2026-08-01', 159015), ('2026-09-01', 159044)],
       'tnx': [('2025-12-31', 4.18), ('2026-10-01', 5.24), ('2026-10-02', 5.28)],
       'dxy': [('2025-12-31', 98.3), ('2026-10-01', 102.1), ('2026-10-02', 101.93)],
       'krw': [('2025-12-31', 1439.0), ('2026-10-01', 1356.84), ('2026-10-02', 1360.59)],
       'bok': [('2026-08-27', 3.0), ('2026-07-16', 2.75)],
       'kospi': [('2025-12-31', 4213.1), ('2026-06-10', 9120.5), ('2026-10-01', 6971.35), ('2026-10-02', 7003.74)],
       'spx': [('2025-12-31', 6845.0), ('2026-10-01', 7666.45), ('2026-10-02', 7722.72)],
       'brent': [('2026-10-01', 102.31), ('2026-10-02', 102.25)], 'wti': [('2026-10-02', 91.11)]}
tiles, warn = refresh.build_tiles(src)
assert warn == [] and len(tiles) == 10, warn
T = {t['k']: t for t in tiles}
assert T['美 기준금리']['v'] == '3.75~4.00%' and T['美 기준금리']['chg']['prev'] == 3.75 and T['美 기준금리']['s'] == ['F']
assert T['美 CPI (2월)']['v'] == f"{round((316 / 302 - 1) * 100, 1)}%"
assert T['美 실업률 (9월)']['d'].startswith('고용 +2.9만')
assert T['美 10년물']['v'] == '5.28%' and T['美 10년물']['chg'] == {'lab': '전일 대비', 'cur': 5.28, 'prev': 5.24, 'kind': 'bp', 'ptxt': '5.24% (10/1)'}
assert T['美 10년물']['d'] == '연초 대비 +110bp · 10/2'
assert T['원/달러']['v'] == '1,360.6원' and T['원/달러']['d'] == '연초 대비 ▲78.4원 (원화 강세) · 10/2'
assert T['韓 기준금리']['v'] == '3.00%' and T['韓 기준금리']['chg']['ptxt'] == '2.75% (7/16 결정)'
assert T['코스피']['d'] == '연초 대비 +66.2% · 연중 고점 대비 ▲23.2% · 10/2'
assert T['브렌트유']['v'] == '$102.25' and T['브렌트유']['d'] == 'WTI $91.11 · 10/2' and T['브렌트유']['chg']['pre'] == '$'
# 한 출처가 비면 그 타일은 건너뛰고 경고만
tiles2, warn2 = refresh.build_tiles({**src, 'bok': []})
assert len(tiles2) == 9 and any('韓 기준금리' in w for w in warn2), warn2
print('OK')
