# 조언 도우미(Claude 없이 앱 데이터로 답) 확인 (빌드된 index.html, file:// 에서는 SAMPLE 없음). 출력이 'OK'로 끝나면 정상
import os, pathlib
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CASES = [  # (질문, 답에 꼭 들어가야 하는 글자들)
    ('삼성전자 배당 어때?', ['삼성전자', '배당', '체크 포인트']),
    ('SCHD 차트 분석해줘', ['SCHD', '차트', '지지']),
    ('배당률 높은 국내 금융주 추천해줘', ['배당률 높은 국내 금융', '순위', '지급월', '%']),   # 표는 HTML table로 렌더링됨
    ('미국 월배당 ETF 5개', ['미국', 'ETF', '매월']),
    ('월 50만원 20년이면 얼마 받아?', ['월 50만원 × 20년', '월평균 배당', '평가액']),
    ('SCHD랑 JEPI 비교해줘', ['나란히 비교', 'SCHD', 'JEPI', '배당수익률']),
    ('내 포트폴리오 점검해줘', ['포트폴리오 진단', '강점', '취약점']),
    ('요즘 매크로 어때?', ['매크로 한눈에', '코스피', '주목할 지표']),
    ('ㅁㄴㅇㄹ', ['이렇게 물어보세요']),
]
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 1000})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(pathlib.Path(ROOT, 'index.html').as_uri()); pg.wait_for_function('() => window.__divsim && window.__divsim.DB_IDX.size > 0')
    pg.click('#advFab'); pg.wait_for_timeout(300)
    print('title:', pg.text_content('#advTitle'), '| send:', pg.text_content('#advSend'), '| web:', pg.text_content('#advWeb'))
    assert pg.text_content('#advTitle') == '조언 도우미' and pg.text_content('#advSend') == '보내기' and 'Claude용' in pg.text_content('#advWeb')
    for q, must in CASES:
        pg.fill('#advQ', q); pg.press('#advQ', 'Enter'); pg.wait_for_timeout(600)
        ans = pg.evaluate("() => { const a = document.querySelectorAll('#advLog .adv-a .ai-out'); return a[a.length - 1].innerText; }")
        miss = [m for m in must if m not in ans]
        print(f'{q} → {len(ans)}자 | {ans.splitlines()[0][:60]}' + (f' | MISSING {miss}' if miss else ''))
        assert not miss, (q, ans[:400])
        assert '참고용' in ans or '이렇게 물어보세요' in ans, q
    print('errors', errs); assert not errs
    b.close(); print('OK')
