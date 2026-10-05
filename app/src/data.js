/* ───────── [data] 추가 배당 종목 · 종목 DB · 섹터 ───────── */
// 추가 큐레이션 종목 (리서치: 2026-10-04 기준 배당, 가격은 아래에서 DB 종가로 맞춤)
const RAW_ADD = [
  { id:'K000810', mkt:'KR', name:'삼성화재', code:'000810', p:626000, d:19500, mo:{4:19500}, g:7, s:'good', note:'6년 연속 증액, 2028 환원율 50% 목표 · 2019 이익 감소로 감액' },
  { id:'K032830', mkt:'KR', name:'삼성생명', code:'032830', p:284000, d:5300, mo:{4:5300}, g:7, s:'good', note:'FY25 배당성향 41%, 2028 환원율 50% 목표 · 2016·2020 감액' },
  { id:'K005830', mkt:'KR', name:'DB손해보험', code:'005830', p:183100, d:7600, mo:{4:7600}, g:7, s:'good', note:'5년 연 28% 증액, 2028 환원율 35% 목표 · 2018·19 손해율 감액' },
  { id:'K029780', mkt:'KR', name:'삼성카드', code:'029780', p:41850, d:2800, mo:{4:2800}, g:1, s:'good', note:'2년 연속 2,800원 동결 · 10년 내 감액 없음' },
  { id:'K138930', mkt:'KR', name:'BNK금융지주', code:'138930', p:15820, d:795, mo:{4:375,5:150,8:150,11:120}, g:7, s:'warn', note:'25년 분기배당 도입, 현금배당 확대 · 2020·2023 감액 이력' },
  { id:'K139130', mkt:'KR', name:'iM금융지주', code:'139130', p:18380, d:700, mo:{4:700}, g:7, s:'warn', note:'FY25 배당성향 25.3% · 2023·24 충당금·PF손실로 감액' },
  { id:'K175330', mkt:'KR', name:'JB금융지주', code:'175330', p:28350, d:1256, mo:{4:660,5:311,8:314,11:160}, g:7, s:'good', note:'26년 분기 균등배당 전환, 환원율 50% 추진 · 10년 무감액' },
  { id:'K071050', mkt:'KR', name:'한국금융지주', code:'071050', p:179500, d:8690, mo:{4:8690}, g:7, s:'warn', note:'FY25 DPS 2.2배↑, 배당성향 25% · 2022 실적급감에 ▲63% 감액' },
  { id:'K005940', mkt:'KR', name:'NH투자증권', code:'005940', p:26500, d:1300, mo:{4:1300}, g:7, s:'warn', note:'FY25 +37% 증액 · 2022 실적 감소로 ▲33% 감액' },
  { id:'K016360', mkt:'KR', name:'삼성증권', code:'016360', p:90300, d:4000, mo:{4:4000}, g:7, s:'warn', note:'FY25 4,000원(+14%) · 2022 실적 감소로 ▲55% 감액' },
  { id:'K006800', mkt:'KR', name:'미래에셋증권', code:'006800', p:32150, d:300, mo:{4:300}, g:5, s:'warn', note:'현금+주식배당 병행, 환원율 35%+(24~26) · 2020·22·23 감액' },
  { id:'K039490', mkt:'KR', name:'키움증권', code:'039490', p:262500, d:11500, mo:{4:11500}, g:7, s:'warn', note:'매년 자사주 70만주+ 소각 병행 · 2022 실적 감소로 감액' },
  { id:'K005380', mkt:'KR', name:'현대차', code:'005380', p:349000, d:10000, mo:{4:1,6:1,9:1,12:1}, g:2, s:'warn', note:'분기 2,500원, 최소 DPS 1만원·TSR 35% · FY25 ▲16.7%' },
  { id:'K000270', mkt:'KR', name:'기아', code:'000270', p:113300, d:6800, mo:{4:6800}, g:7, s:'good', note:'TSR 35% 목표, 4월 연1회 · 5년 증가율은 코로나 기저효과' },
  { id:'K005490', mkt:'KR', name:'POSCO홀딩스', code:'005490', p:306500, d:8000, mo:{4:1,6:1,9:1,12:1}, g:0, s:'bad', note:'26년 분기 2,500→2,000원 감액 · 실적연동 35~40%, 하한 폐지' },
  { id:'K012330', mkt:'KR', name:'현대모비스', code:'012330', p:382000, d:6500, mo:{4:5000,8:1500}, g:6, s:'good', tags:['반기'], note:'반기(중간 1,500원), 환원율 30% 목표 · 10년 무감액' },
  { id:'K028260', mkt:'KR', name:'삼성물산', code:'028260', p:347000, d:2800, mo:{4:2800}, g:2.5, s:'good', note:'관계사 배당수익 60~70% 환원, 최소 DPS 2,500원' },
  { id:'K003550', mkt:'KR', name:'LG', code:'003550', p:109800, d:3100, mo:{4:2100,9:1000}, g:2.5, s:'good', tags:['반기'], note:'별도순익(일회성 제외) 60%+ 배당, 25년 반기 도입 · 무감액' },
  { id:'K034730', mkt:'KR', name:'SK', code:'034730', p:587000, d:8000, mo:{4:6500,8:1500}, g:1.5, s:'warn', tags:['반기'], note:'FY25 8,000원 사상 최대 · 자회사 배당 따라 변동(2022 감액)' },
  { id:'K078930', mkt:'KR', name:'GS', code:'078930', p:102200, d:3000, mo:{4:3000}, g:6, s:'good', note:'10년간 삭감 없음 · 4월 연1회 결산배당' },
  { id:'K018670', mkt:'KR', name:'SK가스', code:'018670', p:240500, d:9000, mo:{4:7000,8:2000}, g:7, s:'good', tags:['반기'], note:'반기(중간 2,000원) · 10년간 삭감 없음' },
  { id:'K032640', mkt:'KR', name:'LG유플러스', code:'032640', p:14540, d:680, mo:{4:410,8:270}, g:5, s:'good', tags:['반기'], note:'별도순익 40%+ 배당·최소 650원(24~26) · 10년 무감액' },
  { id:'K005930', mkt:'KR', name:'삼성전자', code:'005930', p:276000, d:1496, mo:{4:1,5:1,8:1,11:1}, g:0.5, s:'good', note:'정규 분기 374원×4 기준(특별배당 제외) · 정규배당 무삭감' },
  { id:'K000150', mkt:'KR', name:'두산', code:'000150', p:1384000, d:6000, mo:{4:4000,5:1000,8:1000}, g:5, s:'warn', note:'26년 분기배당(1,000원) 도입, FY25 2배 증액 · 2020 감액' },
  { id:'K241560', mkt:'KR', name:'두산밥캣', code:'241560', p:54700, d:1600, mo:{4:500,5:400,8:400,11:400}, g:5.5, s:'warn', note:'분기배당, 환원율 40%·최소 DPS 1,600원 · 2020 무배당 이력' },
  { id:'K267250', mkt:'KR', name:'HD현대', code:'267250', p:197500, d:5200, mo:{4:1300,6:1300,9:1300,11:900}, g:1, s:'warn', note:'별도순익 70% 이상 배당 · 2022~24 연속 감액 후 회복' },
  { id:'K010950', mkt:'KR', name:'S-Oil', code:'010950', p:148800, d:1130, mo:{4:330,9:800}, g:1, s:'bad', tags:['반기'], note:'실적연동 반기 · FY24 결산 0원, 26년 중간 800원' },
  { id:'K021240', mkt:'KR', name:'코웨이', code:'021240', p:99300, d:3357, mo:{4:1957,6:700,9:700}, g:3, s:'warn', note:'26년 분기배당 도입, 매년 10%+ 증액 목표 · FY25 ▲25.6%' },
  { id:'K365550', mkt:'KR', name:'ESR켄달스퀘어리츠', code:'365550', p:3085, d:278, mo:{3:139,9:139}, g:0.5, s:'good', tags:['반기','리츠'], note:'3·9월 지급, 기간배당 소폭 꾸준히 증가 · 2023 1원 감액뿐' },
  { id:'K330590', mkt:'KR', name:'롯데리츠', code:'330590', p:4130, d:240, mo:{4:123,10:117}, g:0, s:'warn', tags:['반기','리츠'], note:'4·10월 지급 · 2023 금리상승에 ▲33% 감배 후 회복 중' },
  { id:'K293940', mkt:'KR', name:'신한알파리츠', code:'293940', p:5610, d:361, mo:{6:182,12:179}, g:2, s:'warn', tags:['반기','리츠'], note:'6·12월 지급 · 23~25년 기간배당 점감 후 반등' },
  { id:'JPM', mkt:'US', name:'JP모건', code:'JPM', p:332.38, d:6.60, mo:{1:1,4:1,7:1,10:1}, g:6.5, s:'good', note:'15년 연속 인상, 배당성향 26% · 신용사이클 민감' },
  { id:'BAC', mkt:'US', name:'뱅크오브아메리카', code:'BAC', p:53.75, d:1.28, mo:{3:1,6:1,9:1,12:1}, g:5.5, s:'good', note:'12년 연속 인상(26년 +14%), 성향 30% · 금리·신용비용 민감' },
  { id:'WFC', mkt:'US', name:'웰스파고', code:'WFC', p:80.45, d:2.00, mo:{3:1,6:1,9:1,12:1}, g:7, s:'good', note:'4년 연속 인상, 성향 29% · 2020년 감액 이력, 경기 민감' },
  { id:'HD', mkt:'US', name:'홈디포', code:'HD', p:282.85, d:9.32, mo:{3:1,6:1,9:1,12:1}, g:4.5, s:'good', note:'16년 연속 인상, 성향 65% · 26년 인상률 1.3%로 둔화, 부채↑' },
  { id:'LOW', mkt:'US', name:'로우스', code:'LOW', p:180.80, d:5.00, mo:{2:1,5:1,8:1,11:1}, g:5.5, s:'good', note:'54년 연속 인상, 성향 42% · 주택경기 부진, 인수로 차입↑' },
  { id:'PFE', mkt:'US', name:'화이자', code:'PFE', p:27.80, d:1.72, mo:{3:1,6:1,9:1,12:1}, g:1, s:'warn', note:'26년 배당 동결, FCF 성향 89% · EPS<배당, 특허만료 진행' },
  { id:'MRK', mkt:'US', name:'머크', code:'MRK', p:144.30, d:3.40, mo:{1:1,4:1,7:1,10:1}, g:3.5, s:'good', note:'15년 연속 인상, FCF 성향 52% · 키트루다 2028 특허만료' },
  { id:'AMGN', mkt:'US', name:'암젠', code:'AMGN', p:403.04, d:10.08, mo:{3:1,6:1,9:1,12:1}, g:4.5, s:'good', note:'15년 연속 인상, FCF 성향 54% · 인수 부채, 바이오시밀러 경쟁' },
  { id:'BMY', mkt:'US', name:'브리스톨마이어스', code:'BMY', p:61.15, d:2.52, mo:{2:1,5:1,8:1,11:1}, g:3, s:'good', note:'17년 연속 인상(IR), FCF 성향 45% · 주력약 특허만료 임박' },
  { id:'CSCO', mkt:'US', name:'시스코시스템즈', code:'CSCO', p:112.20, d:1.68, mo:{1:1,4:1,7:1,10:1}, g:1.5, s:'good', note:'14년 연속 인상, 성향 50% · 인상률 2%대로 저성장' },
  { id:'IBM', mkt:'US', name:'IBM', code:'IBM', p:222.64, d:6.76, mo:{3:1,6:1,9:1,12:1}, g:0.5, s:'good', note:'30년 연속 인상, FCF 성향 46% · 연 $0.01 상징적 인상만' },
  { id:'TXN', mkt:'US', name:'텍사스인스트루먼트', code:'TXN', p:293.80, d:6.08, mo:{2:1,5:1,8:1,11:1}, g:3.5, s:'warn', note:'23년 연속 인상, FCF 성향 104% · 설비투자로 커버 빠듯' },
  { id:'QCOM', mkt:'US', name:'퀄컴', code:'QCOM', p:184.87, d:3.68, mo:{3:1,6:1,9:1,12:1}, g:3.5, s:'good', note:'22년 연속 인상, 성향 43% · 애플 모뎀 자체개발 리스크' },
  { id:'AVGO', mkt:'US', name:'브로드컴', code:'AVGO', p:355.14, d:2.60, mo:{3:1,6:1,9:1,12:1}, g:7, s:'good', note:'15년 연속 인상, 성향 33% · 수익률 0.7%로 낮음' },
  { id:'AAPL', mkt:'US', name:'애플', code:'AAPL', p:333.69, d:1.08, mo:{2:1,5:1,8:1,11:1}, g:2.5, s:'good', note:'14년 연속 인상, 성향 12% · 수익률 0.3%, 환원은 자사주 중심' },
  { id:'MSFT', mkt:'US', name:'마이크로소프트', code:'MSFT', p:517.53, d:3.92, mo:{3:1,6:1,9:1,12:1}, g:6, s:'good', note:'20년 연속 인상(26.9 +7.7%) · AI 설비투자로 FCF 감소' },
  { id:'UPS', mkt:'US', name:'UPS', code:'UPS', p:93.02, d:6.56, mo:{3:1,6:1,9:1,12:1}, g:1, s:'warn', note:'26년 배당 동결, FCF 성향 102% · 삭감 경계, 아마존 물량 축소' },
  { id:'LMT', mkt:'US', name:'록히드마틴', code:'LMT', p:505.41, d:13.80, mo:{3:1,6:1,9:1,12:1}, g:3.5, s:'good', note:'23년 연속 인상, FCF 성향 36% · 국방예산 의존' },
  { id:'RTX', mkt:'US', name:'RTX', code:'RTX', p:184.68, d:2.92, mo:{3:1,6:1,9:1,12:1}, g:4.5, s:'good', note:'4년 연속 인상(26.4 +7%), FCF 성향 35% · 합병으로 기록 짧음' },
  { id:'CAT', mkt:'US', name:'캐터필러', code:'CAT', p:845.42, d:6.52, mo:{2:1,5:1,8:1,11:1}, g:5, s:'good', note:'33년 연속 인상, 성향 28% · 건설·광산 경기 민감' },
  { id:'NEE', mkt:'US', name:'넥스트에라에너지', code:'NEE', p:76.83, d:2.4928, mo:{3:1,6:1,9:1,12:1}, g:6, s:'good', note:'30년 연속 인상, 성향 56% · 27~28년 인상 연 6%로 둔화' },
  { id:'DUK', mkt:'US', name:'듀크에너지', code:'DUK', p:114.13, d:4.34, mo:{3:1,6:1,9:1,12:1}, g:1, s:'good', note:'18년 연속 인상, 성향 65% · 인상률 2% 안팎, FCF 적자' },
  { id:'SO', mkt:'US', name:'서던컴퍼니', code:'SO', p:83.72, d:3.04, mo:{3:1,6:1,9:1,12:1}, g:1.5, s:'good', note:'24년 연속 인상, 성향 73% · 설비투자로 FCF 적자' },
  { id:'AEP', mkt:'US', name:'아메리칸일렉트릭파워', code:'AEP', p:119.57, d:3.80, mo:{3:1,6:1,9:1,12:1}, g:3, s:'good', note:'16년 연속 인상, 성향 66% · 설비투자로 FCF 적자' },
  { id:'ED', mkt:'US', name:'콘솔리데이티드에디슨', code:'ED', p:103.39, d:3.55, mo:{3:1,6:1,9:1,12:1}, g:1.5, s:'good', note:'52년 연속 인상(IR), 성향 58% · 뉴욕 규제 의존' },
  { id:'T', mkt:'US', name:'AT&T', code:'T', p:24.30, d:1.11, mo:{2:1,5:1,8:1,11:1}, g:1, s:'good', note:'2022 분사 감액 후 $1.11 동결 · FCF 성향 43%로 커버 양호' },
  { id:'HSY', mkt:'US', name:'허쉬', code:'HSY', p:160.19, d:5.808, mo:{3:1,6:1,9:1,12:1}, g:6, s:'warn', note:'25년 동결 후 26년 +6% 재개, FCF 성향 52% · 코코아 원가' },
  { id:'GIS', mkt:'US', name:'제너럴밀스', code:'GIS', p:32.01, d:2.44, mo:{2:1,5:1,8:1,11:1}, g:1, s:'warn', note:'26년 배당 동결, FCF 성향 84% · 손상차손으로 순손실' },
  { id:'SBUX', mkt:'US', name:'스타벅스', code:'SBUX', p:94.71, d:2.48, mo:{2:1,5:1,8:1,11:1}, g:4, s:'warn', note:'15년 연속 인상, FCF 성향 78% · EPS<배당, 인상률 1~2%' },
  { id:'MAIN', mkt:'US', name:'메인스트리트캐피탈', code:'MAIN', p:55.11, d:3.18, mo:'M', g:3, s:'good', tags:['월배당','BDC'], note:'5년 연속 인상, 정기분 성향 75% · 분기 보충배당 별도' },
  { id:'ADC', mkt:'US', name:'애그리리얼티', code:'ADC', p:65.88, d:3.204, mo:'M', g:2.5, s:'good', tags:['월배당','리츠'], note:'13년 연속 인상, AFFO 성향 70% · 특이 리스크 낮음' },
  { id:'STAG', mkt:'US', name:'스태그인더스트리얼', code:'STAG', p:36.05, d:1.55, mo:{1:1,4:1,7:1,10:1}, g:1, s:'good', tags:['리츠'], note:'14년 연속 인상, FFO 성향 60% · 26년 분기배당 전환' },
  { id:'VICI', mkt:'US', name:'VICI프로퍼티스', code:'VICI', p:22.65, d:1.84, mo:{1:1,4:1,7:1,10:1}, g:3, s:'good', tags:['리츠'], note:'8년 연속 인상, AFFO 성향 75% · 시저스 임대 재조정 우려' },
  { id:'PLD', mkt:'US', name:'프롤로지스', code:'PLD', p:128.91, d:4.28, mo:{3:1,6:1,9:1,12:1}, g:6.5, s:'good', tags:['리츠'], note:'12년 연속 인상, FFO 성향 68% · 5년 연 11% 고성장' },
  { id:'EPD', mkt:'US', name:'엔터프라이즈프로덕츠', code:'EPD', p:36.18, d:2.24, mo:{2:1,5:1,8:1,11:1}, g:2.5, s:'good', tags:['MLP'], note:'27년 연속 인상, DCF 커버 1.9배 · K-1 발행 세무 유의' },
  { id:'ENB', mkt:'US', name:'엔브리지', code:'ENB', p:45.97, d:2.783, mo:{3:1,6:1,9:1,12:1}, g:2, s:'good', note:'31년 연속 인상(CAD 기준), DCF 성향 66% · 환율 변동, 고부채' },
  { id:'KMI', mkt:'US', name:'킨더모건', code:'KMI', p:31.07, d:1.19, mo:{2:1,5:1,8:1,11:1}, g:1, s:'good', note:'8년 연속 인상, FCF 성향 100% · 인상률 1~2%, 2015 감액' },
  { id:'ARCC', mkt:'US', name:'에어리스캐피탈', code:'ARCC', p:18.86, d:1.92, mo:{3:1,6:1,9:1,12:1}, g:1, s:'warn', tags:['BDC'], note:'$0.48 장기 동결, 코어EPS 대비 102% · NAV 하락' },
  { id:'JEPQ', mkt:'US', name:'JEPQ', code:'JEPQ', p:61.04, d:6.764, mo:'M', g:0, s:'warn', tags:['월배당','ETF'], note:'나스닥 커버드콜, 월 분배금 변동 큼 · 상승 제한, 2022 상장' },
  { id:'VIG', mkt:'US', name:'VIG', code:'VIG', p:235.05, d:3.646, mo:{3:1,6:1,9:1,12:1}, g:4.5, s:'good', tags:['ETF'], note:'미국 배당성장 지수형 · 수익률 1.5%대' },
  { id:'DGRO', mkt:'US', name:'DGRO', code:'DGRO', p:75.77, d:1.494, mo:{3:1,6:1,9:1,12:1}, g:4.5, s:'good', tags:['ETF'], note:'미국 배당성장 지수형 · 12월 분배 큼' },
  { id:'SPYD', mkt:'US', name:'SPYD', code:'SPYD', p:45.39, d:2.06, mo:{3:1,6:1,9:1,12:1}, g:0, s:'good', tags:['ETF'], note:'S&P500 고배당 80종목 동일가중 · 5년간 분배 정체' },
  { id:'HDV', mkt:'US', name:'HDV', code:'HDV', p:28.04, d:0.852, mo:'M', g:3, s:'good', tags:['월배당','ETF'], note:'26.4 5:1 분할, 26.7부터 월배당 · 분할 후 기준 금액' },
  { id:'NOBL', mkt:'US', name:'NOBL', code:'NOBL', p:54.30, d:1.173, mo:{3:1,6:1,9:1,12:1}, g:3.5, s:'good', tags:['ETF'], note:'S&P500 배당귀족 동일가중 · 26.5 2:1 분할 후 기준' },
  { id:'DIVO', mkt:'US', name:'DIVO', code:'DIVO', p:46.74, d:2.27, mo:'M', g:0, s:'good', tags:['월배당','ETF'], note:'커버드콜 · 정기 월 $0.189×12 기준(25.12 특별 $0.95 제외)' },
  { id:'QYLD', mkt:'US', name:'QYLD', code:'QYLD', p:18.63, d:2.131, mo:'M', g:0, s:'warn', tags:['월배당','ETF'], note:'나스닥100 커버드콜 · 분배금·NAV 장기 감소, 원금 잠식 주의' },
  { id:'VNQ', mkt:'US', name:'VNQ', code:'VNQ', p:89.50, d:3.406, mo:{3:1,6:1,9:1,12:1}, g:0.5, s:'good', tags:['ETF','리츠'], note:'미국 리츠 지수형 · 금리 민감, 분배금 정체' },
  { id:'SPY', mkt:'US', name:'SPY', code:'SPY', p:769.64, d:7.525, mo:{1:1,4:1,7:1,10:1}, g:5, s:'good', tags:['ETF'], note:'S&P500 · 분기말 기준일, 익월말 지급(1·4·7·10월)' },
  { id:'VOO', mkt:'US', name:'VOO', code:'VOO', p:707.54, d:7.428, mo:{3:1,6:1,9:1,12:1}, g:5, s:'good', tags:['ETF'], note:'S&P500 · 분기말 지급(SPY와 지급월 다름)' },
  { id:'QQQ', mkt:'US', name:'QQQ', code:'QQQ', p:749.58, d:3.034, mo:{3:1,7:1,10:1,12:1}, g:5, s:'good', tags:['ETF'], note:'나스닥100 · 수익률 0.4%, 25.12부터 지급일 변경' }
];
// 현재 배당 0원 — 배당 목록에서는 제외하고 상세 창에 사유 표시
const NO_DIV = {
  '001450': '현대해상 · IFRS17 해약환급금준비금 탓 배당가능이익 부족, FY24·25 무배당',
  '138040': '메리츠금융지주 · FY25 결산배당 0원, 주주환원은 자사주 매입·소각으로',
  '034020': '두산에너빌리티 · FY2017 이후 보통주 무배당(재무 악화·누적 결손), 성장 투자 우선'
};
RAW.forEach(r => { if (r.code === 'ETF') r.code = r.id; });   // SCHD·VYM 티커 정리
RAW.push(...RAW_ADD);

// 섹터 (포트폴리오 쏠림 분석용, GICS 기준에 가깝게 직접 분류)
const SECTOR = {
  KTG:'필수소비재', KT:'통신', HANA:'금융', KB:'금융', SHINHAN:'금융', WOORI:'금융', SEC:'IT', HMC:'경기소비재', MKIF:'인프라', SKREIT:'부동산', IBK:'금융', SKT:'통신',
  K000810:'금융', K032830:'금융', K005830:'금융', K029780:'금융', K138930:'금융', K139130:'금융', K175330:'금융', K071050:'금융', K005940:'금융', K016360:'금융', K006800:'금융', K039490:'금융',
  K005380:'경기소비재', K000270:'경기소비재', K005490:'소재', K012330:'경기소비재', K028260:'산업재', K003550:'지주', K034730:'지주', K078930:'지주', K018670:'에너지', K032640:'통신',
  K005930:'IT', K000150:'지주', K241560:'산업재', K267250:'지주', K010950:'에너지', K021240:'경기소비재', K365550:'부동산', K330590:'부동산', K293940:'부동산',
  ADP:'산업재', PG:'필수소비재', MCD:'경기소비재', JNJ:'헬스케어', KO:'필수소비재', ABBV:'헬스케어', CL:'필수소비재', MDT:'헬스케어', TGT:'필수소비재', O:'부동산', PM:'필수소비재', MO:'필수소비재',
  PEP:'필수소비재', VZ:'통신', XOM:'에너지', CVX:'에너지', GPC:'경기소비재', SYY:'필수소비재', KMB:'필수소비재', SCHD:'ETF(분산)', VYM:'ETF(분산)',
  JPM:'금융', BAC:'금융', WFC:'금융', HD:'경기소비재', LOW:'경기소비재', PFE:'헬스케어', MRK:'헬스케어', AMGN:'헬스케어', BMY:'헬스케어', CSCO:'IT', IBM:'IT', TXN:'IT', QCOM:'IT', AVGO:'IT', AAPL:'IT', MSFT:'IT',
  UPS:'산업재', LMT:'산업재', RTX:'산업재', CAT:'산업재', NEE:'유틸리티', DUK:'유틸리티', SO:'유틸리티', AEP:'유틸리티', ED:'유틸리티', T:'통신', HSY:'필수소비재', GIS:'필수소비재', SBUX:'경기소비재',
  MAIN:'금융', ADC:'부동산', STAG:'부동산', VICI:'부동산', PLD:'부동산', EPD:'에너지', ENB:'에너지', KMI:'에너지', ARCC:'금융',
  JEPQ:'ETF(분산)', VIG:'ETF(분산)', DGRO:'ETF(분산)', SPYD:'ETF(분산)', HDV:'ETF(분산)', NOBL:'ETF(분산)', DIVO:'ETF(분산)', QYLD:'ETF(분산)', VNQ:'부동산', SPY:'ETF(분산)', VOO:'ETF(분산)', QQQ:'ETF(분산)'
};
const US_SECTOR_KO = { 'Consumer Discretionary':'경기소비재', 'Finance':'금융', 'Technology':'IT', 'Industrials':'산업재', 'Health Care':'헬스케어', 'Utilities':'유틸리티', 'Energy':'에너지', 'Real Estate':'부동산', 'Basic Materials':'소재', 'Consumer Staples':'필수소비재', 'Telecommunications':'통신', 'ETF':'ETF(분산)' };
// 국내 비큐레이션 종목: 회사명으로 업종을 대략 추정 (표시할 때 '추정'으로 밝힘)
const KR_NAME_SECTOR = [
  [/리츠|부동산|인프라/, '부동산'], [/은행|금융|증권|보험|생명|화재|손해|캐피탈|카드|투자|자산운용|지주$/, '금융'],
  [/바이오|제약|약품|헬스|메디|셀|진단|의료|팜|파마|생명과학/, '헬스케어'], [/반도체|하이닉스|전자|디스플레이|테크|소프트|시스템|네트웍|정보|게임|엔씨|카카오|NAVER|네이버|디지털|솔루션|AI/, 'IT'],
  [/통신|텔레콤|유플러스/, '통신'], [/전력|한전|가스공사|난방|수자원/, '유틸리티'], [/에너지|정유|석유|오일|가스|S-Oil|태양|풍력|원자력|에너빌리티/, '에너지'],
  [/화학|케미칼|철강|제철|스틸|소재|금속|비철|아연|알루미|시멘트|제지|포스코|POSCO/, '소재'], [/식품|제과|음료|주류|맥주|농심|오뚜기|담배|KT&G|생활건강|유통|마트|리테일|편의점/, '필수소비재'],
  [/자동차|모비스|타이어|기아|현대차|부품|호텔|레저|여행|화장품|패션|의류|엔터|미디어|방송|교육|가구|홈쇼핑/, '경기소비재'],
  [/건설|중공업|기계|조선|항공|해운|물류|운송|방산|에어로|전기|전선|엘리베이터|인더스트리|산업|플랜트|엔지니어링|밥캣|두산/, '산업재'],
  [/홀딩스|지주/, '지주']
];

/* 종목 DB 디코딩 (가격·거래량 시계열: base64 VLQ 델타) */
const DBR = window.STOCK_DB || { asof: {}, ax: {}, s: [], idx: {} };
const B64I = (() => { const a = new Int16Array(128).fill(-1), s = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; for (let i = 0; i < 64; i++) a[s.charCodeAt(i)] = i; return a; })();
function decSeries(str) {
  const out = []; let prev = 0, z = 0, sh = 0;
  for (let i = 0; i < (str || '').length; i++) {
    const d = B64I[str.charCodeAt(i)]; z += (d & 31) * Math.pow(2, sh);
    if (d & 32) { sh += 5; continue; }
    prev += (z % 2) ? -(z - 1) / 2 : z / 2; out.push(prev); z = 0; sh = 0;
  }
  return out;
}
const RF = { mk: 0, code: 1, name: 2, ko: 3, sector: 4, ind: 5, price: 6, chg: 7, mcap: 8, shares: 9, amt: 10, st: 11, d: 13, w: 15, m: 17, y: 19, v: 20, div: 21 };   // div(ETF): [최근 12개월 분배금, 지급월 비중 12개, 횟수, 마지막 배당락일, 성장 가정]
const DB_IDX = new Map();
DBR.s.forEach(r => DB_IDX.set((r[0] === 'US' ? 'U:' : 'K:') + r[1], r));
const AXC = {};
function axis(mkt, k) {
  const key = mkt + k; if (AXC[key]) return AXC[key];
  const ax = (DBR.ax[mkt] || {})[k]; return (AXC[key] = ax ? decSeries(ax) : []);
}
const SERC = new Map();
// 반환: { t: [일수(1970-01-01 기준)], v: [가격(현지통화)] }  · k = d(일)|w(주)|m(월)|y(연)
function seriesOf(rec, k) {
  const key = rec[1] + rec[0] + k; if (SERC.has(key)) return SERC.get(key);
  const mkt = rec[0] === 'US' ? 'US' : 'KR', ax = axis(mkt, k), vals = decSeries(rec[RF[k]]), off = rec[RF[k] - 1], sc = mkt === 'US' ? 100 : 1;
  const out = { t: ax.slice(off, off + vals.length), v: vals.map(x => x / sc) };
  SERC.set(key, out); return out;
}
function volumesOf(rec) {
  const key = rec[1] + rec[0] + 'vol'; if (SERC.has(key)) return SERC.get(key);
  const v = decSeries(rec[RF.v]).map(q => Math.max(0, Math.exp(q / 20) - 1));
  SERC.set(key, v); return v;
}
function idxSeries(name, k) {   // KOSPI·KOSDAQ 시총가중 프록시 (실제 지수 종가로 수준 보정)
  const a = (DBR.idx || {})[name]; if (!a) return null;
  const key = 'IDX' + name + k; if (SERC.has(key)) return SERC.get(key);
  const pos = { d: 0, w: 2, m: 4, y: 6 }[k], vals = decSeries(a[pos + 1]), off = a[pos], ax = axis('KR', k);
  const last = decSeries(a[1]); const lastV = last[last.length - 1] / 100;
  const ACT = { KOSPI: META.kospi, KOSDAQ: META.kosdaq };   // 데이터 날짜의 실제 종가 (meta.json)
  const sc = ACT[name] && lastV ? ACT[name] / lastV : 1;
  const out = { t: ax.slice(off, off + vals.length), v: vals.map(x => x / 100 * sc) };
  SERC.set(key, out); return out;
}
function dayStr(dn) { const d = new Date(dn * 864e5); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }
function recId(rec) { return (rec[0] === 'US' ? 'U:' : 'K:') + rec[1]; }
function mktLabel(rec) { return rec[0] === 'US' ? (rec[4] === 'ETF' ? '미국 ETF' : '미국') : rec[0] === 'KE' ? '국내 ETF' : rec[0] === 'KQ' ? '코스닥' : '코스피'; }
function isEtfRec(rec) { return !!rec && rec[4] === 'ETF'; }
function recName(rec) {
  if (rec[0] !== 'US') return rec[2];
  return String(rec[2]).replace(/,?\s+(Inc\.?|Incorporated|Corporation|Corp\.?|Company|Co\.|plc|Ltd\.?|Limited|N\.V\.|S\.A\.|L\.P\.)$/i, '').trim();
}
// 국내 대형주 업종(직접 분류) — 나머지는 회사명으로 추정
const KR_SECTOR = { '005930':'IT', '005935':'IT', '000660':'IT', '373220':'IT', '006400':'IT', '009150':'IT', '066570':'IT', '018260':'IT', '035420':'IT', '035720':'IT', '036570':'IT', '259960':'IT',
  '207940':'헬스케어', '068270':'헬스케어', '000100':'헬스케어', '128940':'헬스케어', '196170':'헬스케어', '326030':'헬스케어',
  '005380':'경기소비재', '000270':'경기소비재', '012330':'경기소비재', '005387':'경기소비재', '021240':'경기소비재', '011170':'소재', '051910':'소재', '005490':'소재', '003670':'소재', '010130':'소재', '004020':'소재',
  '012450':'산업재', '034020':'산업재', '329180':'산업재', '009540':'산업재', '042660':'산업재', '010140':'산업재', '064350':'산업재', '047810':'산업재', '028260':'산업재', '011200':'산업재', '000720':'산업재', '241560':'산업재', '298040':'산업재', '010120':'산업재', '267260':'산업재',
  '015760':'유틸리티', '036460':'유틸리티', '096770':'에너지', '010950':'에너지', '078930':'지주', '003550':'지주', '034730':'지주', '000150':'지주', '267250':'지주', '402340':'지주',
  '033780':'필수소비재', '090430':'필수소비재', '097950':'필수소비재', '271560':'필수소비재', '004370':'필수소비재', '051900':'필수소비재', '017670':'통신', '030200':'통신', '032640':'통신' };
function recSectorKo(rec) {
  if (isEtfRec(rec)) return 'ETF(' + (rec[5] || '분산') + ')';
  if (rec[0] === 'US') return US_SECTOR_KO[rec[4]] || (rec[4] ? rec[4] : '기타');
  if (KR_SECTOR[rec[1]]) return KR_SECTOR[rec[1]];
  if (rec[4]) return rec[4];   // KRX 업종(표준산업분류)에서 매핑한 섹터 (pipeline/fetch_kr_sector.py), 업종명은 rec[5]
  for (const [re, s] of KR_NAME_SECTOR) if (re.test(rec[2])) return s + '(추정)';
  return '기타(국내)';
}
// 큐레이션 종목 ↔ DB 연결, 가격은 DB 종가로 통일
const CUR_BY_DB = new Map();
RAW.forEach(r => {
  const dbid = (r.mkt === 'KR' ? 'K:' : 'U:') + r.code;
  if (DB_IDX.has(dbid)) { r.db = dbid; CUR_BY_DB.set(dbid, r.id); r.p = DB_IDX.get(dbid)[RF.price]; }
});
const DATA_DATE = { KR: DBR.asof.KR || META.asof.KR, US: DBR.asof.US || META.asof.US };
