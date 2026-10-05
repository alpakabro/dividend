# 월배당 포트폴리오 시뮬레이터 — Claude Code 작업 안내

국내·미국 배당주와 ETF로 "매달 배당을 받는" 포트폴리오를 설계하고 분석하는 **단일 HTML 웹앱**이다.

- **공개 사이트:** https://alpakabro.github.io/dividend/ (GitHub Pages, `main` 브랜치 루트의 `index.html`)
- **Claude 아티팩트(비공개):** 같은 앱을 Claude 안에서 연 버전. 앱 안 AI(`sample` 기능)가 바로 답하는 곳은 여기뿐
- **데이터는 스냅샷:** 국내 2026-10-01 종가, 미국 2026-10-02 종가, 원/달러 1,350.6원(`FX0`). 실시간 시세가 아님

## 1. 폴더 구조

| 경로 | 내용 |
|---|---|
| `index.html` | **빌드 결과물. 직접 고치지 않는다.** GitHub Pages가 그대로 배포 |
| `app/app_src.html` | 페이지 틀: CSS(테마 토큰) + HTML + 핵심 스크립트(상태·시뮬레이션·보유 종목·종목 구성·차트) |
| `app/src/*.js` | 기능 모듈 (2절) |
| `app/src/research.json` | 종목 리포트 8개(삼성전자·KT·KT&G·두산에너빌리티·하나금융·ADP·맥도날드·P&G) + 매크로 사실(us/kr, 출처 번호 포함) |
| `app/src/macro_report.json` | 매크로 브리핑 화면 데이터(타일 10개, 주목 지표 3개, 분석 ①~⑦, 출처 코드 U#/K#) |
| `app/data/stock_db_full.js` | 종목 DB `window.STOCK_DB`(약 11MB): 국내 주식 2,766, 국내 ETF 1,171, 미국 주식 2,031, 미국 ETF 2,033 |
| `app/build.py` | 조립 스크립트 → `index.html`, `app/dist/artifact.html` |
| `app/tests/*.py` | Playwright 확인 스크립트 |
| `pipeline/` | DB 생성 `build_db.py`, ETF 병합 `add_etf.py`, 검증 `check_db.py`, 미국 종목 메타 `universe.csv`, 주요 미국 ETF 168개의 한글명·유형 `us_etf_list.json` |
| 브랜치 `etf-job` | ETF 수집 GitHub Actions(`.github/workflows/etf-data.yml`, `tools/etf/*.py`) |
| 브랜치 `etf-data`, `etf-data-us` | 수집 결과(국내 ETF + 주요 미국 ETF / 미국 ETF 전체) |

## 2. 앱 구조

빌드는 `app_src.html`의 자리표시자 세 곳을 채운다.

- `/*__DATA_MODULES__*/`(큐레이션 `RAW` 정의 직후) ← `data.js`
- `/*__UI_MODULES__*/` ← `ui_core.js, tech.js, detail.js, ai.js, pa.js, macro.js, advisor.js`. 이 순서로 **한 스크립트 안에 이어 붙이므로 전역을 공유**한다
- `<!--__PAYLOAD__-->` ← `STOCK_DB`·`RESEARCH`·`MACRO` `<script>`

모듈별 역할:

- **`data.js`:** 큐레이션 추가분 `RAW_ADD`(RAW 총 114개), `NO_DIV`, `SECTOR`, DB 해독(`decSeries`, `seriesOf`, `volumesOf`, `idxSeries`), `recId/mktLabel/recName/recSectorKo/isEtfRec`, `CUR_BY_DB`(큐레이션↔DB 연결, 가격은 DB 종가로 통일), `DATA_DATE`
- **`ui_core.js`:** `S(id)`(종목 객체, DB 종목은 `mkDbStock`), 숫자 포맷(`pxFmt, sp, eok, mcapFmt, dateKo`), 검색 색인(`buildIndex/searchStocks`), 종목 창 모달(`openSearch/openStock`), `addHolding/addToPlan`, 화면 전환(`goAnalysis/goMain`)
- **`tech.js`:** 차트 분석 `techAnalysis`(이평 20/60/120, RSI, MACD, 볼린저, 지지·저항, 손절), `tickRound`(국내 호가단위, 국내 ETF는 1/5원)
- **`detail.js`:** 종목 창(가격 차트 일/주/월/연, 지표 표, 배당·분배금 칸, 기업/실적/재무 리포트 탭)
- **`ai.js`:** 앱 안 AI(`window.claude.use('sample')`), `aiPanel`(실행/중지/프롬프트 복사), `stockData`, 프롬프트 빌더
  - **사용자가 지정한 분석 가이드라인 원문 `G_COMPANY/G_CHART/G_EARN/G_FIN/G_PF/G_MACRO`는 문구를 바꾸지 않는다**
- **`pa.js`:** '포트폴리오 완성' 다음 화면(비중·섹터 쏠림, 상관관계, 변동성·VaR, 백테스트, 배당 현금흐름, 강점·취약점·조정안). 성향별 한도 `RISKP`
- **`macro.js`:** 메인 상단 매크로 브리핑(타일 등락 `mchg`, 접기/펼치기, 전체 분석 ①~⑦, 지수 차트, 섹터 ETF 표)
- **`advisor.js`:** 오른쪽 아래 'AI 조언' 버튼과 채팅 창
  - 질문 속 종목 자동 인식 `advFindStocks`: 이름·한글명·별명·티커(소문자 포함), 한국 기업 ADR은 국내 종목으로 연결
  - 의도 분류 `advIntent`: 의견/차트/실적/재무/기업/포트폴리오/매크로 → 해당 가이드라인 형식
  - 앱 데이터를 붙여 보내고, Claude 밖(사이트)에서는 '질문 복사'로 동작

핵심 스크립트(`app_src.html`):

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
- `div`(ETF만): `[최근 12개월 분배금, 지급월 비중 12개, 횟수, 마지막 배당락일, 성장 가정]` → `mkDbStock`이 자동 반영
- 축: 국내는 d 250일(~10/1)·w 156·m 120·y 2016~, 미국은 d 250일(~10/2)·w/m 2024-07~

화면 공통:

- 테마: `:root` 토큰 + 다크 모드(`prefers-color-scheme` / `data-theme`)
- DOM 헬퍼: `h(tag, attrs, ...kids)`, `$(sel)`

## 3. 빌드·확인·배포

```bash
python3 app/build.py                 # index.html + app/dist/artifact.html
pip install playwright pandas pyarrow numpy && python3 -m playwright install chromium
for t in app/tests/test_*.py; do echo "== $t"; python3 "$t"; done   # 'errors []'면 정상, 스크린샷은 app/tests/out/
git add -A && git commit -m "..." && git push origin main            # GitHub Pages 자동 배포(1~3분)
```

- **회귀 기준값:** 기본 구성 20년 후 세후 월배당 `metrics().m ≈ 410,542` (`test_smoke`)
- **테스트 출력:** 단언(assert)이 아니라 값을 출력하는 방식이다. 바뀐 부분의 출력을 눈으로 확인한다
- **아티팩트 갱신:** Artifact 도구가 있는 Claude 세션에서 `app/dist/artifact.html`을 기존 아티팩트(제목 '월배당 포트폴리오 시뮬레이터')에 게시한다. capabilities는 생략해서 기존 `sample`을 유지한다. Artifact 도구가 없으면 사이트만 갱신한다

## 4. 데이터 갱신 (선택, 인터넷 필요)

1. **국내·미국 주식:** `pipeline/marcap-2026.parquet`을 지운 뒤 `python3 pipeline/build_db.py` → `pipeline/stock_db.js`
   - 국내: FinanceData/marcap(GitHub, 2016~, 약 220MB 다운로드). 권리락 보정과 코스피/코스닥 프록시는 자체 계산
   - 미국: q100423gg-coder/us-stock-data 릴리스의 `prices.parquet`(시총 20억달러 이상, 2024.7~) + `universe.csv`
2. **ETF:** etf-job 브랜치의 GitHub Actions를 실행한 뒤 결과 브랜치를 내려받는다
   ```bash
   # GitHub → Actions → etf-data → Run workflow (script: fetch_etf.py 또는 fetch_us_all.py)
   git fetch origin etf-data etf-data-us
   mkdir -p pipeline/raw_etf/etf-data pipeline/raw_etf/etf-data-us
   git archive origin/etf-data | tar -x -C pipeline/raw_etf/etf-data
   git archive origin/etf-data-us | tar -x -C pipeline/raw_etf/etf-data-us
   ```
3. **병합:** `python3 pipeline/add_etf.py` (기본 `MIN_ADV=2000000`) → `app/data/stock_db_full.js`
4. **날짜·숫자가 박혀 있는 곳도 함께 고친다:**
   - `app_src.html`: 머리말 문구, `FX0`, 보유 종목 카드 안내문, 데이터 출처 목록
   - `pa.js`: `FX_RANGE`, `promptPortfolio`의 매크로 한 줄
   - `macro_report.json`, `research.json`
   - 큐레이션 배당 `RAW` / `RAW_ADD`
5. 빌드 → 테스트 → 푸시

ETF 데이터의 특성:

- **분배금:** 야후 배당락 이력의 최근 12개월 합계
- **지급월:** 추정값. 국내는 배당락일+5일, 미국은 +3일, SPY는 +40일로 계산
- **국내 ETF 가격:** 분배금이 반영되지 않은 종가
- **미국 ETF 수록 기준:** 미국 상장 ETF 5,758개 중 20일 평균 거래대금 200만 달러 이상인 것 + 주요 168개 + `MUST_US`(add_etf.py)
- **빠진 ETF를 넣을 때:** `MUST_US`와 `tools/etf/fetch_us_all.py`의 `MUST`에 티커를 추가한 뒤 2~3단계를 실행한다

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
- 사용자와 협업하는 방식:
  - 사용자는 비개발자다. 결과는 짧게, 무엇이 바뀌었고 어떻게 확인하는지 위주로 보고한다
  - "가능해?"처럼 가능 여부만 묻는 질문에는 구현하지 말고 답만 한다

## 6. 알려진 제약

- **용량:** 파일이 11.7MB라 휴대폰에서 처음 열 때 느리다. 개선 후보는 DB 분리 로딩
- **가격 이력:** 미국 개별 주식은 2024.7부터라(원본 데이터 한계) 3년·5년 수익률이 없다. 주요 미국 ETF는 2016~, 나머지 ETF는 2023.9~
- **사이트의 AI:** GitHub Pages에는 Claude 연결이 없어 AI가 바로 답하지 못한다(질문 복사로 동작). 바로 답하게 하려면 아티팩트를 공유하거나 API 키와 서버가 필요하다
- **종목 리포트:** 종목 창의 '기업/실적/재무' 리포트는 research.json의 8개 종목만 사전 조사돼 있다. 나머지 종목은 AI 실행 또는 프롬프트 복사를 쓴다

## 7. 다음 작업 후보

- 데이터 자동 갱신(정기 실행)
- DB 지연 로딩으로 용량 줄이기
- 거래량이 적은 ETF는 요청이 오면 `MUST_US`에 추가
