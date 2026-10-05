# 월배당 포트폴리오 시뮬레이터 — 윈도우 PC 프로그램 (pywebview 창, 엔진은 윈도우 내장 Edge WebView2)
# 켜면 공개 사이트(매일 자동 갱신)를 열고, 인터넷이 안 되면 exe 안에 같이 넣은 index.html 사본(빌드 당시 데이터)을 연다.
# 입력한 보유 종목은 이 PC의 WebView2 저장소(%LOCALAPPDATA%\DividendSim)에 남는다. 사이트 모드와 오프라인 사본은 저장 공간이 다르다.
# 만들기: python desktop/build_exe.py → desktop/dist/월배당시뮬레이터.exe   ·   확인: 월배당시뮬레이터.exe --selftest (3초 뒤 스스로 닫힘)
import os, sys, time, urllib.request
import webview

SITE = 'https://alpakabro.github.io/dividend/'
TITLE = '월배당 포트폴리오 시뮬레이터'

def bundled():
    """exe로 포장되면 index.html이 임시 폴더(sys._MEIPASS)에 풀린다. 소스로 실행하면 저장소 루트의 index.html"""
    base = getattr(sys, '_MEIPASS', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    return os.path.join(base, 'index.html')

def online():
    try:
        urllib.request.urlopen(urllib.request.Request(SITE, method='HEAD'), timeout=4); return True
    except Exception:
        return False

def main():
    url = SITE + '?app=desktop' if online() else bundled()      # ?app=desktop: 사이트가 광고를 숨긴다
    w = webview.create_window(TITLE + ('' if url.startswith(SITE) else ' — 오프라인 사본'), url, width=1400, height=950, min_size=(900, 600))
    storage = os.path.join(os.environ.get('LOCALAPPDATA', os.path.expanduser('~')), 'DividendSim')
    after = (lambda: (time.sleep(3), w.destroy())) if '--selftest' in sys.argv else None   # 빌드 확인용 자동 종료
    webview.start(after, private_mode=False, storage_path=storage)   # private_mode=False: 보유 종목(localStorage)이 다음 실행에도 남게

if __name__ == '__main__':
    main()
