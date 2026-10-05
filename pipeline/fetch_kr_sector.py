# 국내 상장사 업종: KRX KIND 상장법인목록(표준산업분류 업종·주요제품)을 받아 앱 섹터로 매핑 → pipeline/kr_sector.csv (git에 포함, 갱신 때 덮어씀)
#   python pipeline/fetch_kr_sector.py      # 약 1초. 실패하면 기존 csv를 그대로 쓴다(refresh.py merge 단계가 경고만 남김)
# add_etf.py가 이 csv로 국내 주식 레코드의 sector(앱 섹터)·industry(KRX 업종명)를 채운다. 우선주는 보통주 코드(끝자리 0)로 연결.
# 매핑은 규칙 기반 추정이라 화면에는 KRX 업종명을 함께 보여 준다. 순수 함수(sector_of·common_code)는 test_refresh.py에서 점검.
import csv, io, os, re, sys

D = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(D, 'kr_sector.csv')
URL = 'https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13'

# 회사명 규칙(업종보다 우선): 스팩 → 금융 이름(금융지주·은행·증권·보험·카드…) → 리츠(메리츠 같은 이름은 제외) → 지주·홀딩스
NAME_FIRST = [(re.compile(r'스팩|기업인수목적'), '스팩'), (re.compile(r'금융지주|금융$|은행|증권|보험|캐피탈|카드$|인베스트먼트|벤처투자'), '금융'), (re.compile(r'리츠(?![가-힣])'), '부동산')]
NAME_HOLD = [(re.compile(r'홀딩스|지주$|지주회사|지주\s'), '지주')]
# '기타 금융업'(KRX가 지주회사·중국계 상장사에도 붙임)에서 진짜 금융을 가르는 주요제품 키워드
FIN_PRODUCT = re.compile(r'투자|벤처|캐피탈|리스|신용|카드|대출|융자|사모|PEF|조합|송금|결제|금융|보험|증권|여신|할부|환급')
# 업종명이 애매한 경우 주요제품으로 세분 (업종명 → [(주요제품 정규식, 섹터)])
REFINE = {
    '특수 목적용 기계 제조업': [(r'반도체|디스플레이|OLED|LCD|웨이퍼|SMT|PCB|노광|증착|식각|세정|검사장비|프로브', 'IT')],
    '일반 목적용 기계 제조업': [(r'반도체|디스플레이|OLED|LCD|진공펌프', 'IT')],
    '기타 화학제품 제조업': [(r'화장품|코스메틱|뷰티|스킨|마스크팩|향수', '경기소비재'), (r'세제|치약|비누|기저귀|생활용품', '필수소비재'), (r'의약|바이오|진단', '헬스케어')],
    '기타 금융업': [(r'금융지주', '금융'), (r'지주|자회사|기업인수목적|SPAC|경영자문|경영컨설팅|경영지도|지배', '지주')],
    '금융 지원 서비스업': [(r'기업인수목적|SPAC|스팩', '스팩')],
    '기타 전문 도매업': [(r'식품|식자재|음료|농산|수산|축산', '필수소비재'), (r'의약품|의료', '헬스케어'), (r'반도체|전자부품|소프트웨어|IT', 'IT'), (r'철강|금속|화학|원자재|석유', '소재'), (r'기계|장비|건설|선박', '산업재')],
    '상품 종합 도매업': [(r'식품|식자재|음료|농산|수산|축산', '필수소비재'), (r'의약품|의료', '헬스케어'), (r'반도체|전자부품|소프트웨어|IT', 'IT'), (r'철강|금속|화학|원자재|석유', '소재'), (r'기계|장비|건설|선박', '산업재')],
    '그외 기타 제품 제조업': [(r'화장품', '경기소비재'), (r'의료', '헬스케어')],
}
# 업종명 규칙: 순서대로 첫 일치 (구체적인 것이 앞)
IND_RULES = [
    (r'^전기 통신업$', '통신'),
    (r'금융|은행|보험|신탁|집합투자|증권|여신|연금', '금융'),
    (r'부동산', '부동산'),
    (r'의약|의료|보건|병원', '헬스케어'),
    (r'자연과학 및 공학 연구개발', '헬스케어'),              # 코스닥 연구개발업은 대부분 바이오
    (r'소프트웨어|컴퓨터|반도체|전자부품|통신 및 방송 장비|영상 및 음향|정보 서비스|인터넷|자료처리|시스템 통합|광학 매체|기록매체|사진장비|정밀기기|이차전지|일차전지', 'IT'),
    (r'비료|농약|화학섬유', '소재'),
    (r'연료용 가스|배관공급|^전기업$|수도|증기, 냉|폐기물|원료 재생', '유틸리티'),
    (r'석유|정유|연료 소매|석탄|원유', '에너지'),
    (r'음·식료품|식품|식료품|음료|담배|사료|농|작물|어업|수산|축산|도축|육류|육가공|곡물|유지|낙농|떡|빵|과자|과실|채소|도시락|생활용품', '필수소비재'),
    (r'기계장비 및 관련 물품 도매|건축자재|구조용 금속|탱크', '산업재'),
    (r'자동차|의복|신발|가죽|가방|가구|가정용 기기|가정용품|호텔|숙박|여행|교육|학원|오락|스포츠|영화|방송|출판|광고|소매|도매|중개|창작|예술|오디오|귀금속|장신|악기|경기용구|디자인|인쇄물|개인 서비스|수리업|화장품|코스메틱', '경기소비재'),
    (r'화학|플라스틱|고무|철강|금속|비철|제지|펄프|종이|판지|유리|시멘트|콘크리트|요업|섬유|방적|직물|염색|광물|목재|나무|주조|도료', '소재'),
    (r'기계|장비|건설|건축|토목|공사|조선|선박|보트|항공|우주|운송|물류|창고|해운|철도|방위|무기|전기장비|전선|케이블|엔지니어링|플랜트|포장|증기발생기|사업지원|시설|경비|임대|도로|여객|화물|전동기|발전기|전기 변환|조명|인쇄', '산업재'),
    (r'회사 본부|경영 컨설팅', '지주'),
]
IND_RULES = [(re.compile(p), s) for p, s in IND_RULES]

def sector_of(industry, name, product=''):
    """KRX 업종명 + 회사명 + 주요제품 → 앱 섹터(금융·IT·헬스케어·경기소비재·필수소비재·산업재·소재·에너지·유틸리티·통신·부동산·지주·스팩·기타)"""
    name, industry, product = str(name or ''), str(industry or ''), str(product or '')
    for rx, sec in NAME_FIRST:
        if rx.search(name): return sec
    if '금융지주' in product: return '금융'                      # 신한지주처럼 이름에 '금융'이 없는 금융지주
    for rx, sec in NAME_HOLD:
        if rx.search(name): return sec
    for rx, sec in REFINE.get(industry, []):
        if re.search(rx, product): return sec
    if industry == '기타 금융업':                                # 금융 키워드가 없으면 지주회사(에코프로·LS·효성 등)
        return '금융' if FIN_PRODUCT.search(product) else '지주'
    for rx, sec in IND_RULES:
        if rx.search(industry): return sec
    return '기타'

def common_code(code):
    """우선주(끝자리 5·7·9 등) → 보통주 코드(끝자리 0). 6자리 숫자가 아니면 그대로"""
    return code[:5] + '0' if re.fullmatch(r'\d{6}', code) and code[-1] != '0' else code

def download():
    try:
        from curl_cffi import requests as cr
        r = cr.get(URL, impersonate='chrome', timeout=60); r.raise_for_status(); raw = r.content
    except ImportError:
        import urllib.request
        raw = urllib.request.urlopen(urllib.request.Request(URL, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60).read()
    import pandas as pd
    html = raw.decode('euc-kr', 'replace')
    df = pd.read_html(io.StringIO(html), converters={'종목코드': str})[0]
    need = {'회사명', '시장구분', '종목코드', '업종', '주요제품'}
    if not need <= set(df.columns): raise RuntimeError(f'KIND 표 열이 다름: {list(df.columns)}')
    return df

def main():
    df = download()
    rows = []
    for _, r in df.iterrows():
        code, name, mk, ind, prod = str(r['종목코드']).zfill(6), str(r['회사명']), str(r['시장구분']), str(r['업종'] if r['업종'] == r['업종'] else ''), str(r['주요제품'] if r['주요제품'] == r['주요제품'] else '')
        rows.append([code, name, mk, ind, prod[:60].replace('\n', ' '), sector_of(ind, name, prod)])
    if len(rows) < 2000: raise RuntimeError(f'행이 너무 적음: {len(rows)}')
    with open(OUT, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f); w.writerow(['code', 'name', 'market', 'industry', 'product', 'sector']); w.writerows(sorted(rows))
    from collections import Counter
    c = Counter(x[5] for x in rows)
    print('kr_sector.csv', len(rows), '사', '| 섹터:', ', '.join(f'{k} {v}' for k, v in c.most_common()))

if __name__ == '__main__':
    main()
