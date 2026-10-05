# 월배당 포트폴리오 시뮬레이터 — Claude Code 작업 안내

국내·미국 배당주와 ETF로 "매달 배당을 받는" 포트폴리오를 설계하고 분석하는 **단일 HTML 웹앱**이다.

- **공개 사이트:** https://alpakabro.github.io/dividend/ (GitHub Pages, `main` 브랜치 루트의 `index.html`)
- **Claude 아티팩트(비공개):** 같은 앱을 Claude 안에서 연 버전. 앱 안 AI(`sample` 기능)가 바로 답하는 곳은 여기뿐
- **데이터는 스냅샷(매일 자동 갱신):** 데이터 날짜·원/달러·지수 종가는 `app/data/meta.json`에 있고, 화면 문구와 `FX0`가 거기서 채워진다. 실시간 시세가 아님. 갱신 방법은 4절

## 1. 폴더 구조

| 경로 | 내용 |
|---|---|
| `index.html` | **빌드 결과물. 직접 고치지 않는다.** GitHub Pages가 그대로 배포 |
| `app/app_src.html` | 페이지 틀: CSS(테마 토큰) + HTML + 핵심 스크립트(상태·시뮬레이션·보유 종목·종목 구성·차트) |
| `app/src/*.js` | 기능 모듈 (2절) |
| `app/src/research.json` | 종목 리포트 8개(삼성전자·KT·KT&G·두산에너빌리티·하나금융·ADP·맥도날드·P&G) + 매크로 사실(us/kr, 출처 번호 포함) |
| `app/src/macro_report.json` | 매크로 브리핑 화면 데이터. 지표 타일 10개는 `refresh.py`의 `macro` 단계가 매일 자동 갱신(출처 코드 Y/F/B, `tiles_asof`·`src_auto`도 자동 기록), headline·주목 지표 3개·분석 ①~⑦은 수동(출처 코드 U#/K#) |
| `app/data/stock_db_full.js` | 종목 DB `window.STOCK_DB`(약 11MB): 국내 주식·ETF, 미국 주식·ETF 약 8,000개(종목 수는 `meta.json`의 `counts`) |
| `app/data/meta.json` | 데이터 날짜(`asof`)·원/달러(`fx`, 출처 `fx_src`)·연중 환율 고저(`fx_range`)·코스피/코스닥 실제 종가·첫 적립 월·종목 수. `refresh.py`가 쓰고 `build.py`가 문구와 `window.META`에 넣는다 |
| `app/build.py` | 조립 스크립트(`fill`이 문구 자리표시자 `{{KR_D}}` 등을 meta로 채움) → `index.html`, `app/dist/artifact.html` |
| `app/tests/*.py` | Playwright 확인 스크립트 |
| `pipeline/` | DB 생성 `build_db.py`, ETF 병합 `add_etf.py`(개별 주식 배당도 붙임), 검증 `check_db.py`, 미국 종목 메타 `universe.csv`, 주요 미국 ETF 168개의 한글명·유형 `us_etf_list.json` |
| `pipeline/fetch_stock_div.py` | 개별 주식 배당락 이력 수집(야후 파이낸스, 2021~) → `pipeline/raw_div/stock_div.csv`(git 제외). 지급월 추정·성장 가정·배당 정보 조립 함수는 여기 있고 `add_etf.py`가 가져다 쓴다 |
| `pipeline/refresh.py` | **데이터 자동 갱신 본체**(4절): 수집(ETF·주식 배당) → DB → 병합 → 메타 → 매크로 타일 → 빌드 → 검증 → 커밋. `test_refresh.py`는 그 도우미 함수 점검 |
| `.github/workflows/refresh.yml` | 매일 08:00 KST(화~토) GitHub Actions에서 `refresh.py --push` 정기 실행, 수동 실행(Run workflow)도 가능 |
| `desktop/app.py`, `desktop/build_exe.py` | 윈도우 PC 프로그램: pywebview 창(Edge WebView2)으로 공개 사이트를 열고, 오프라인이면 exe 안의 `index.html` 사본을 연다. `build_exe.py`가 PyInstaller로 `desktop/dist/월배당시뮬레이터.exe`(단일 파일, git 제외)를 만든다 |
| 브랜치 `etf-job` | ETF 수집 GitHub Actions(`.github/workflows/etf-data.yml`, `tools/etf/*.py`) |
| 브랜치 `etf-data`, `etf-data-us` | 수집 결과(국내 ETF + 주요 미국 ETF / 미국 ETF 전체) |

## 2. 앱 구조

빌드는 `app_src.html`의 자리표시자 세 곳을 채운다.

- `/*__DATA_MODULES__*/`(큐레이션 `RAW` 정의 직후) ← `data.js`
- `/*__UI_MODULES__*/` ← `ui_core.js, tech.js, detail.js, ai.js, pa.js, macro.js, advisor.js`. 이 순서로 **한 스크립트 안에 이어 붙이므로 전역을 공유**한다
- `<!--__PAYLOAD__-->` ← `META`(meta.json)·`STOCK_DB`·`RESEARCH`·`MACRO` `<script>`. 그 전에 `build.py`의 `fill`이 `app_src.html`의 `{{KR_D}}`·`{{US_DS}}`·`{{FX}}`·`{{START}}`·`{{N_KR_STK}}` 같은 문구 자리표시자를 meta 값으로 채운다(모르는 이름이면 빌드 실패)

모듈별 역할:

- **`data.js`:** 큐레이션 추가분 `RAW_ADD`(RAW 총 114개), `NO_DIV`, `SECTOR`, DB 해독(`decSeries`, `seriesOf`, `volumesOf`, `idxSeries`), `recId/mktLabel/recName/recSectorKo/isEtfRec`, `CUR_BY_DB`(큐레이션↔DB 연결, 가격은 DB 종가로 통일), `DATA_DATE`(DB `asof`, 없으면 `META.asof`). `idxSeries`의 수준 보정값 `ACT`는 `META.kospi/kosdaq`
- **`ui_core.js`:** `S(id)`(종목 객체, DB 종목은 `mkDbStock`), 숫자 포맷(`pxFmt, sp, eok, mcapFmt, dateKo`), 검색 색인(`buildIndex/searchStocks`), 종목 창 모달(`openSearch/openStock`), `addHolding/addToPlan`, 화면 전환(`goAnalysis/goMain`)
- **`tech.js`:** 차트 분석 `techAnalysis`(이평 20/60/120, RSI, MACD, 볼린저, 지지·저항, 손절), `tickRound`(국내 호가단위, 국내 ETF는 1/5원)
- **`detail.js`:** 종목 창(가격 차트 일/주/월/연, 지표 표, 배당·분배금 칸, 기업/실적/재무 리포트 탭)
- **`ai.js`:** 앱 안 AI(`window.claude.use('sample')`), `aiPanel`(실행/중지/프롬프트 복사), `stockData`, 프롬프트 빌더
  - **사용자가 지정한 분석 가이드라인 원문 `G_COMPANY/G_CHART/G_EARN/G_FIN/G_PF/G_MACRO`는 문구를 바꾸지 않는다**
- **`pa.js`:** '포트폴리오 완성' 다음 화면(비중·섹터 쏠림, 상관관계, 변동성·VaR, 백테스트, 배당 현금흐름, 강점·취약점·조정안). 성향별 한도 `RISKP`, 환율 고저 `FX_RANGE = META.fx_range`, `promptPortfolio`의 매크로 줄은 `MACRO.tiles`에서 조립(박힌 숫자 없음)
- **`macro.js`:** 메인 상단 매크로 브리핑(타일 등락 `mchg`, 접기/펼치기, 전체 분석 ①~⑦, 지수 차트, 섹터 ETF 표). 출처 코드 Y·F·B는 `MACRO.src_auto`에서 해석하고, 배지는 "지표 {tiles_asof} · 분석 {asof} 기준"
- **`advisor.js`:** 오른쪽 아래 'AI 조언' 버튼과 채팅 창
  - 질문 속 종목 자동 인식 `advFindStocks`: 이름·한글명·별명·티커(소문자 포함), 한국 기업 ADR은 국내 종목으로 연결
  - 의도 분류 `advIntent`: 의견/차트/실적/재무/기업/포트폴리오/매크로 → 해당 가이드라인 형식
  - 앱 데이터를 붙여 보내고, Claude 밖(사이트)에서는 '질문 복사'로 동작

핵심 스크립트(`app_src.html`):

- 상수: `META = window.META`(meta.json), `FX0 = META.fx`, `START_MONTH = META.start_month`
- 계산: `simulate`, `portOf`, `itemsOf`, `metrics`, `needCalc`
- 렌더: `renderAll`, 보유 종목(`renderHold/holdRow/holdValue/pnlOf`), 종목 구성(`renderPicker/toggle/equalize`), KPI·캘린더·성장 차트·시나리오·연도별 표
- 저장: `state`를 localStorage 키 `monthly-div-sim-v1`에 저장

`state` 주요 필드:

- `sel{id: 비중%}`, `base`(비교 기준), `a{monthly, years, target, basis, scen, tax, cg, fxg, infl, drip}`
- `hold[]`: `{id, mode:'qty'|'amt', v, avg?}`
  - 현금은 `__CASH__`(만원)
  - 직접 입력은 `__CUSTOM__`에 name/mkt/price/y/mp/g를 함께 저장
- `ov{DB종목id: {y, mp, g}}`(배당 직접 입력), `extra[]`(검색으로 추가한 DB 종목), `risk`, `paBasis`, `macroOpen/macroFold`, `slots`(색 12개, 넘치면 회색 '기타')

종목 id:

- 큐레이션: `KTG`, `ADP` 등
- DB: `K:005930`, `U:AAPL`. 국내 ETF는 `K:458730`, 미국 ETF는 `U:SCHD`

DB 레코드(인덱스는 `RF`):

```
[mk, code, name, ko, sector, industry, price, chg, mcap, shares, avgAmt, stats[14],
 d_off, d_enc, w_off, w_enc, m_off, m_enc, y_off, y_enc, v_enc, div?]
```

- `mk`: `KS`/`KQ`/`KE`(국내 ETF)/`US`. ETF는 `sector='ETF'`, `industry`=유형
- 시리즈 인코딩: base64 VLQ 델타. 미국 가격은 센트(×100), 거래량은 `round(ln(1+v)*20)`
- `stats`: `[1주, 1개월, 3개월, 6개월, 연초, 1년, 3년, 5년, 변동성, 최대낙폭, 52주고, 52주저, 상장후, 시작일]`
- `div`(ETF와 배당 이력이 있는 주식): `[최근 12개월 분배금(배당), 지급월 비중 12개, 횟수, 마지막 배당락일, 성장 가정]` → `mkDbStock`이 자동 반영(`divSrc:'db'`). 주식의 지급월 추정은 국내 12월 배당락→4월·그 외 +2개월, 미국 +25일. 성장 가정은 완전한 연도 3개 이상이면 연간 합계 증가율(0~8%), 아니면 3.0. 큐레이션(RAW) 종목은 큐레이션 값이 우선
- 축: 국내는 d 250일(~10/1)·w 156·m 120·y 2016~, 미국은 d 250일(~10/2)·w/m 2024-07~

화면 공통:

- 테마: `:root` 토큰 + 다크 모드(`prefers-color-scheme` / `data-theme`)
- DOM 헬퍼: `h(tag, attrs, ...kids)`, `$(sel)`

## 3. 빌드·확인·배포

```bash
python3 app/build.py                 # index.html + app/dist/artifact.html (문구는 app/data/meta.json으로 채움)
python3 pipeline/test_refresh.py     # 갱신·빌드 도우미 함수 점검, OK면 정상
python3 pipeline/refresh.py --steps build,verify   # 빌드 + 검증 관문(오류 0건·월배당 계산·종목 수·환율 반영)
python3 desktop/build_exe.py         # 윈도우 PC 프로그램 exe (pip install pywebview pyinstaller pillow 필요, 1~2분)
pip install playwright pandas pyarrow numpy yfinance requests && python3 -m playwright install chromium
for t in app/tests/test_*.py; do echo "== $t"; python3 "$t"; done   # 'errors []'면 정상, 스크린샷은 app/tests/out/
git add -A && git commit -m "..." && git push origin main            # GitHub Pages 자동 배포(1~3분)
```

- **회귀 기준값:** 기본 구성 20년 후 세후 월배당 `metrics().m ≈ 410,542` (`test_smoke`, 국내 2026-10-01·미국 2026-10-02 데이터 기준). 환율에는 무관하지만 가격·배당 데이터가 갱신되면 달라진다. 갱신 뒤의 값은 `pipeline/refresh.log`의 '검증 통과' 줄로 확인한다
- **테스트 출력:** 단언(assert)이 아니라 값을 출력하는 방식이다. 바뀐 부분의 출력을 눈으로 확인한다
- **아티팩트 갱신:** Artifact 도구가 있는 Claude 세션에서 `app/dist/artifact.html`을 기존 아티팩트(제목 '월배당 포트폴리오 시뮬레이터')에 게시한다. capabilities는 생략해서 기존 `sample`을 유지한다. Artifact 도구가 없으면 사이트만 갱신한다

## 4. 데이터 갱신 (자동)

`pipeline/refresh.py`가 전 과정을 한 번에 한다: **DB 생성 → (새 종가일 때만) ETF 수집 → 주식 배당 수집 → 병합 → 메타(환율·지수·종목 수) → 매크로 지표 타일 → 빌드 → 검증 → 커밋**.

- **정기 실행:** `.github/workflows/refresh.yml`이 매일 한국시간 08:00(화~토)에 GitHub Actions에서 `refresh.py --push`를 돌린다. 새 종가가 있으면 `index.html`·`app/data/stock_db_full.js`·`app/data/meta.json`을 main에 커밋하고 GitHub Pages가 배포한다. 데이터 날짜가 그대로면 "변동 없음"으로 끝난다(커밋 없음). 검증에 실패하면 커밋하지 않고 끝나며 GitHub가 소유자에게 이메일을 보낸다
- **수동 실행:** GitHub → Actions → refresh → Run workflow (`force`: 날짜가 같아도 다시 빌드·배포, `steps`: 일부 단계만). 실행 페이지의 요약(Summary)에 날짜·환율·지수·종목 수·검증 결과·경고가 나오고, `artifact.html`과 `refresh.log`를 내려받을 수 있다(14일 보관)
- **내 컴퓨터에서:** `python3 pipeline/refresh.py` (`--steps db,etf,div,merge,meta,macro,build,verify,commit` 중 골라 쉼표로, `--force`, `--push`). 필요 패키지는 3절. 기록은 `pipeline/refresh.log`
- **단계별 하는 일**
  - `db`: 올해 marcap 파일과 미국 가격 파일을 지우고 `build_db.py`(FinanceData/marcap 2016~올해 + us-stock-data) → `pipeline/stock_db.js`, `check_db.py`로 점검. 새해 첫 거래일 전에는 올해 파일이 없어 전년도까지로 만든다
  - `etf`: etf-job 브랜치의 `tools/etf/fetch_etf.py`(국내 ETF 전체 + 주요 미국 ETF 168개)·`fetch_us_all.py`(미국 ETF 전체)를 받아 실행 → `pipeline/raw_etf/etf-data`, `etf-data-us` (약 20분). etf-job 브랜치의 Actions는 그대로 있어 따로 돌려도 된다
  - `div`: `fetch_stock_div.py`가 DB의 모든 주식(약 4,800개)의 배당락 이력을 야후 파이낸스에서 받는다(80개씩 묶음, 약 6분) → `pipeline/raw_div/stock_div.csv`. 이력 있는 종목이 1,000개 미만이면 실패
  - `merge`: `add_etf.py`(`MIN_ADV=2000000`) → `app/data/stock_db_full.js`. `raw_div`가 있으면 주식 레코드에도 `div`를 붙인다(최근 12개월 배당 있는 종목 수는 `meta.json`의 `div_counts`, 검증 관문이 이전 커밋의 90% 이상인지 확인)
  - `meta`: 야후 파이낸스에서 원/달러(`KRW=X`, 미국 데이터 날짜 종가)와 연중 고저, 코스피·코스닥 실제 종가(`^KS11`·`^KQ11`, 국내 데이터 날짜) → `app/data/meta.json`. 그 날짜 종가가 아직 없으면 실패하고 다음 실행에서 다시 시도한다(수치를 지어내지 않음)
  - `macro`: 매크로 브리핑 지표 타일 10개를 다시 쓴다 → `app/src/macro_report.json`의 `tiles`(값·설명·등락·출처)와 `tiles_asof`·`src_auto`. 출처는 야후 파이낸스(美 10년물 `^TNX`, 달러인덱스 `DX-Y.NYB`, 원/달러 `KRW=X`, 코스피 `^KS11`, S&P500 `^GSPC`, 브렌트 `BZ=F`·WTI `CL=F`), FRED CSV(기준금리 `DFEDTARU`/`DFEDTARL`, CPI `CPIAUCNS`/`CPILFENS`(비계절조정, 공식 전년 대비와 같음), 실업률 `UNRATE`, 고용 `PAYEMS` — 파이썬 기본 접속은 차단되므로 `curl_cffi`로 크롬처럼 접속), 한국은행 기준금리 페이지(표 해석). 기준일은 미국 데이터 날짜. 어느 출처가 실패하면 그 타일은 이전 값을 두고 요약에 ⚠ 경고만 남긴다(수치를 지어내지 않음). headline·key3·sections는 사람이 쓴다
  - `build`: `app/build.py`
  - `verify`: 헤드리스 크롬으로 `index.html`을 열어 오류·경고 0건, 월배당 계산값 > 0, 종목 수가 마지막 커밋의 90% 이상, 페이지의 `FX0`가 meta와 같음, 검색 동작을 확인한다. 하나라도 어긋나면 실패
  - `commit`: 위 3개 파일과 `macro_report.json`만 커밋. `--push`면 `origin main`으로(거절되면 원격 변경을 받아 한 번 더)
- **사람이 계속 관리하는 것(자동 갱신 안 됨):** 매크로 브리핑의 분석 글(`macro_report.json`의 headline·key3·sections와 `asof`), `research.json`, 큐레이션 배당 `RAW`/`RAW_ADD`, Claude 아티팩트 게시(3절). 분석 글·리포트가 가격 데이터보다 7일 넘게 오래되면 실행 요약에 ⚠ 경고가 뜬다
- **환율 출처:** 뉴스 기사(서울외환시장 15:30 주간종가) 대신 야후 파이낸스 `KRW=X` 일별 종가(UTC 기준)를 쓴다. 몇 원 차이가 날 수 있고, 화면의 출처 문구는 meta의 `fx_src`·`fx_url`로 자동 표기된다

ETF 데이터의 특성:

- **분배금:** 야후 배당락 이력의 최근 12개월 합계
- **지급월:** 추정값. 국내는 배당락일+5일, 미국은 +3일, SPY는 +40일로 계산
- **국내 ETF 가격:** 분배금이 반영되지 않은 종가
- **미국 ETF 수록 기준:** 미국 상장 ETF 5,758개 중 20일 평균 거래대금 200만 달러 이상인 것 + 주요 168개 + `MUST_US`(add_etf.py)
- **빠진 ETF를 넣을 때:** `MUST_US`와 `tools/etf/fetch_us_all.py`(etf-job 브랜치)의 `MUST`에 티커를 추가한 뒤 `refresh.py --force`를 실행한다(Actions에서는 force 체크)

## 5. 규칙

- 화면과 문구는 한국어로 쓰고, 전문 용어는 쉬운 말로 푼다
- **음수는 '-' 대신 '▲'**로 쓴다(상수 `neg`, `sp()`·`sgn()` 사용). 상승은 빨강(`--up`), 하락은 파랑(`--down`)
- 분석과 AI 답변 끝에는 '이 분석은 참고용입니다'를 붙인다
- 확인되지 않은 수치는 지어내지 않는다. 매크로 수치에는 출처 코드(U#/K#)를 달고, 학습 지식에서 온 값은 기준 시점을 밝힌다
- AI 기능:
  - `sample`이 없는 곳(사이트)에서는 '프롬프트/질문 복사'로 동작해야 한다
  - 오류는 코드별로 처리하고(`AI_ERR`), 자동 반복 호출은 하지 않는다
- 저장소는 공개(GitHub Pages)다. **이름·이메일·보유 내역 같은 개인정보는 커밋하지 않는다.** 사용자 입력은 브라우저 localStorage에만 저장된다
- `index.html`, `stock_db_full.js`는 수 MB라 통째로 읽지 않는다. grep이나 부분 읽기를 쓴다
- 날짜·환율·지수·종목 수를 문구나 코드에 직접 적지 않는다. `app_src.html`은 `{{KR_D}}` 같은 자리표시자(목록은 `build.py`의 `fill`), JS는 `META`를 쓴다. 자동 갱신 때 함께 바뀌어야 하기 때문이다
- 사용자와 협업하는 방식:
  - 사용자는 비개발자다. 결과는 짧게, 무엇이 바뀌었고 어떻게 확인하는지 위주로 보고한다
  - "가능해?"처럼 가능 여부만 묻는 질문에는 구현하지 말고 답만 한다

## 6. 알려진 제약

- **용량:** 파일이 11.7MB라 휴대폰에서 처음 열 때 느리다. 개선 후보는 DB 분리 로딩
- **가격 이력:** 미국 개별 주식은 2024.7부터라(원본 데이터 한계) 3년·5년 수익률이 없다. 주요 미국 ETF는 2016~, 나머지 ETF는 2023.9~
- **사이트의 AI:** GitHub Pages에는 Claude 연결이 없어 AI가 바로 답하지 못한다(질문 복사로 동작). 바로 답하게 하려면 아티팩트를 공유하거나 API 키와 서버가 필요하다
- **종목 리포트:** 종목 창의 '기업/실적/재무' 리포트는 research.json의 8개 종목만 사전 조사돼 있다. 나머지 종목은 AI 실행 또는 프롬프트 복사를 쓴다
- **자동 갱신 범위:** 가격·분배금·개별 주식 배당·환율·지수·매크로 지표 타일만 자동이다. 매크로 분석 글·종목 리포트·큐레이션 배당은 사람이 갱신한다(4절). 분석 글이 타일보다 오래되면 글 속 숫자와 타일이 어긋날 수 있다(배지에 두 날짜를 보여 줌)

## 7. 다음 작업 후보

- 매크로 브리핑 분석 글(headline·key3·①~⑦) 자동 갱신 — 출처(U#/K#)가 필요해 AI 조사 단계가 필요(지표 타일은 이미 자동)
- 윈도우 exe를 GitHub Actions(windows 러너)에서 만들어 릴리스에 첨부하기
- DB 지연 로딩으로 용량 줄이기
- 거래량이 적은 ETF는 요청이 오면 `MUST_US`에 추가
