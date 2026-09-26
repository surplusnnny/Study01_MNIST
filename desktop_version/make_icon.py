"""바로가기와 앱 창에 쓸 아이콘(icon.ico)을 만드는 스크립트."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

프로젝트폴더 = Path(__file__).resolve().parent
저장경로 = 프로젝트폴더 / "icon.ico"
원본크기 = 256
# 윈도우가 상황에 따라 골라 쓰는 아이콘 크기들 (작업 표시줄, 바탕 화면, 탐색기 등)
아이콘크기들 = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def 글꼴_불러오기(크기):
    """손글씨 느낌의 윈도우 기본 글꼴을 찾고, 없으면 일반 글꼴을 쓴다."""
    for 이름 in ["segoepr.ttf", "segoesc.ttf", "segoeuib.ttf", "arialbd.ttf"]:
        try:
            return ImageFont.truetype(이름, 크기)
        except OSError:
            continue
    return ImageFont.load_default(크기)


def 아이콘_그리기():
    """둥근 사각형 배경 위에 칠판에 쓴 듯한 흰 숫자 '7'을 그린다."""
    # 가장자리를 부드럽게 하려고 4배 크기로 그린 뒤 줄인다
    배율 = 4
    크기 = 원본크기 * 배율
    그림 = Image.new("RGBA", (크기, 크기), (0, 0, 0, 0))
    펜 = ImageDraw.Draw(그림)

    # 배경: 위에서 아래로 짙어지는 파란색 그라데이션을 둥근 사각형 모양으로 오려 낸다
    그라데이션 = Image.new("RGBA", (크기, 크기))
    그라데이션펜 = ImageDraw.Draw(그라데이션)
    for y in range(크기):
        t = y / 크기
        색 = (int(60 - 30 * t), int(140 - 60 * t), int(240 - 70 * t), 255)
        그라데이션펜.line([(0, y), (크기, y)], fill=색)
    모양 = Image.new("L", (크기, 크기), 0)
    ImageDraw.Draw(모양).rounded_rectangle([0, 0, 크기 - 1, 크기 - 1], radius=크기 // 5, fill=255)
    그림.paste(그라데이션, (0, 0), 모양)

    # 안쪽에 그림판을 뜻하는 어두운 사각형
    여백 = 크기 // 8
    펜.rounded_rectangle([여백, 여백, 크기 - 여백, 크기 - 여백],
                        radius=크기 // 12, fill=(20, 24, 36, 255))

    # 가운데에 흰색 손글씨 숫자
    글꼴 = 글꼴_불러오기(int(크기 * 0.62))
    상자 = 펜.textbbox((0, 0), "7", font=글꼴)
    글자폭, 글자높이 = 상자[2] - 상자[0], 상자[3] - 상자[1]
    위치 = ((크기 - 글자폭) // 2 - 상자[0], (크기 - 글자높이) // 2 - 상자[1])
    # 작은 크기(16px)에서도 잘 보이도록 외곽선을 같은 색으로 덧대어 획을 굵게 한다
    펜.text(위치, "7", font=글꼴, fill=(255, 255, 255, 255),
           stroke_width=크기 // 45, stroke_fill=(255, 255, 255, 255))

    return 그림.resize((원본크기, 원본크기), Image.LANCZOS)


if __name__ == "__main__":
    아이콘 = 아이콘_그리기()
    아이콘.save(저장경로, format="ICO", sizes=아이콘크기들)
    아이콘.save(프로젝트폴더 / "icon_preview.png")  # 눈으로 확인하기 위한 미리보기
    print(f"아이콘 저장 완료: {저장경로}")
