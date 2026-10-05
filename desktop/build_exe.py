# 윈도우 exe 만들기: python desktop/build_exe.py → desktop/dist/월배당시뮬레이터.exe (단일 파일, 오프라인 사본 index.html 포함, 약 1~2분)
# 필요: pip install pywebview pyinstaller pillow   (pillow은 아이콘 생성용). 먼저 python app/build.py 로 index.html을 만들어 둔다.
# 서명 인증서가 없어 처음 실행 때 Windows SmartScreen 경고가 뜬다 → '추가 정보' → '실행'. 다른 PC는 윈도우 10/11(WebView2 내장)이면 된다.
import os, subprocess, sys

D = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(D)
NAME = '월배당시뮬레이터'
ICON = os.path.join(D, 'app.ico')
INDEX = os.path.join(ROOT, 'index.html')
assert os.path.exists(INDEX), '먼저 python app/build.py 로 index.html을 만드세요'

def make_icon():
    """파란 둥근 사각형 + 흰 동전 + ₩ (맑은 고딕 굵게)"""
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new('RGBA', (256, 256), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.rounded_rectangle((8, 8, 248, 248), radius=56, fill=(31, 111, 235))
    d.ellipse((52, 52, 204, 204), fill=(255, 255, 255))
    try: font = ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf', 104)
    except Exception: font = ImageFont.load_default()
    d.text((128, 124), '₩', font=font, fill=(31, 111, 235), anchor='mm')
    img.save(ICON, sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])

if __name__ == '__main__':
    os.chdir(D)
    if not os.path.exists(ICON): make_icon()
    subprocess.run([sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean', '--onefile', '--noconsole', '--name', NAME, '--icon', ICON,
                    '--add-data', INDEX + os.pathsep + '.', 'app.py'], check=True)
    exe = os.path.join(D, 'dist', NAME + '.exe')
    print('완성:', exe, round(os.path.getsize(exe) / 1e6, 1), 'MB')
