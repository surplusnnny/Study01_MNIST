"""마우스로 숫자를 그리면 학습된 CNN(mnist_cnn.pt)이 실시간으로 인식하는 프로그램."""

import ctypes
import sys
import tkinter as tk
import traceback
from pathlib import Path
from tkinter import messagebox

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageDraw, ImageTk

from model import 숫자인식CNN

# ----- 화면 및 모델 설정 -----
캔버스크기 = 280          # 그림판 한 변의 픽셀 수 (28x28의 10배)
붓두께 = 18               # 붓 굵기 (MNIST 획 두께와 비슷하도록 설정)
# 바로가기 등 어느 위치에서 실행해도 파일을 찾을 수 있도록 이 파일 기준의 절대 경로를 쓴다
프로젝트폴더 = Path(__file__).resolve().parent
가중치경로 = 프로젝트폴더 / "mnist_cnn.pt"
아이콘경로 = 프로젝트폴더 / "icon.ico"
# 작업 표시줄에서 이 앱을 구분하는 ID. 바로가기(create_shortcut.ps1)에도 같은 값을 넣어야
# 고정한 아이콘과 실행 중인 창이 하나로 묶인다.
앱ID = "Study01.MNIST.HandwritingRecognizer"
MNIST_평균 = 0.1307
MNIST_표준편차 = 0.3081


def 모델_불러오기():
    """저장된 가중치를 불러와 추론 모드의 모델을 반환한다."""
    모델 = 숫자인식CNN()
    모델.load_state_dict(torch.load(가중치경로, map_location="cpu", weights_only=True))
    모델.eval()
    return 모델


def MNIST형식으로_변환(그림: Image.Image):
    """
    사용자가 그린 이미지를 MNIST와 같은 형식의 텐서(1x1x28x28)로 변환한다.

    MNIST 숫자는 '20x20 상자 안에 비율을 유지해 축소한 뒤,
    무게중심이 28x28 이미지의 가운데에 오도록 배치'되어 있으므로 같은 과정을 따라 한다.
    숫자가 그려지지 않았으면 None을 반환한다.
    """
    # 1) 숫자가 그려진 영역만 잘라내기
    경계상자 = 그림.getbbox()
    if 경계상자 is None:
        return None
    숫자 = 그림.crop(경계상자)

    # 2) 가로세로 비율을 유지하면서 긴 변이 20픽셀이 되도록 축소
    가로, 세로 = 숫자.size
    배율 = 20.0 / max(가로, 세로)
    새크기 = (max(1, round(가로 * 배율)), max(1, round(세로 * 배율)))
    숫자 = 숫자.resize(새크기, Image.LANCZOS)

    # 3) 28x28 검은 배경의 가운데에 붙이기
    결과 = Image.new("L", (28, 28), 0)
    결과.paste(숫자, ((28 - 새크기[0]) // 2, (28 - 새크기[1]) // 2))

    # 4) 무게중심이 정확히 중앙(14, 14)에 오도록 평행 이동
    배열 = np.asarray(결과, dtype=np.float32)
    전체 = 배열.sum()
    if 전체 > 0:
        세로좌표, 가로좌표 = np.indices(배열.shape)
        중심_y = (세로좌표 * 배열).sum() / 전체
        중심_x = (가로좌표 * 배열).sum() / 전체
        이동_x = int(round(14 - 중심_x))
        이동_y = int(round(14 - 중심_y))
        결과 = 결과.transform(결과.size, Image.AFFINE, (1, 0, -이동_x, 0, 1, -이동_y), fill=0)

    # 5) 0~1 범위로 바꾼 뒤 학습 때와 같은 방식으로 정규화
    텐서 = torch.from_numpy(np.asarray(결과, dtype=np.float32) / 255.0)
    텐서 = (텐서 - MNIST_평균) / MNIST_표준편차
    return 텐서.unsqueeze(0).unsqueeze(0), 결과


class 손글씨인식앱:
    """그림판, 예측 결과, 숫자별 확률 막대를 보여주는 tkinter 화면."""

    def __init__(self, 루트: tk.Tk):
        self.루트 = 루트
        self.모델 = 모델_불러오기()
        루트.title("손글씨 숫자 인식기 (PyTorch MNIST CNN)")
        루트.resizable(False, False)
        if 아이콘경로.exists():
            루트.iconbitmap(default=str(아이콘경로))  # 제목 표시줄과 작업 표시줄 아이콘

        # 화면에 보이는 캔버스와 별개로, 실제 인식에 쓸 흑백 이미지를 메모리에 함께 그린다
        # (MNIST처럼 검은 배경에 흰 글씨)
        self.이미지 = Image.new("L", (캔버스크기, 캔버스크기), 0)
        self.그리기도구 = ImageDraw.Draw(self.이미지)
        self.이전좌표 = None

        # ----- 왼쪽: 그림판 -----
        왼쪽 = tk.Frame(루트, padx=12, pady=12)
        왼쪽.grid(row=0, column=0, sticky="n")
        tk.Label(왼쪽, text="여기에 숫자 하나를 그려 주세요", font=("맑은 고딕", 11)).pack(anchor="w")
        self.캔버스 = tk.Canvas(왼쪽, width=캔버스크기, height=캔버스크기, bg="black",
                              cursor="crosshair", highlightthickness=1, highlightbackground="#888")
        self.캔버스.pack(pady=(6, 8))
        self.캔버스.bind("<Button-1>", self.그리기_시작)
        self.캔버스.bind("<B1-Motion>", self.그리기)
        self.캔버스.bind("<ButtonRelease-1>", self.그리기_끝)

        버튼줄 = tk.Frame(왼쪽)
        버튼줄.pack(fill="x")
        tk.Button(버튼줄, text="지우기", width=12, command=self.지우기,
                  font=("맑은 고딕", 10)).pack(side="left")
        tk.Button(버튼줄, text="인식하기", width=12, command=self.인식,
                  font=("맑은 고딕", 10)).pack(side="right")
        루트.bind("<Escape>", lambda _: self.지우기())

        # ----- 오른쪽: 결과 표시 -----
        오른쪽 = tk.Frame(루트, padx=12, pady=12)
        오른쪽.grid(row=0, column=1, sticky="n")
        tk.Label(오른쪽, text="인식 결과", font=("맑은 고딕", 11)).pack(anchor="w")
        self.결과라벨 = tk.Label(오른쪽, text="?", font=("맑은 고딕", 64, "bold"), width=2)
        self.결과라벨.pack()
        self.확신도라벨 = tk.Label(오른쪽, text="확신도: -", font=("맑은 고딕", 10))
        self.확신도라벨.pack(pady=(0, 8))

        # 숫자별 확률 막대그래프
        self.막대캔버스 = tk.Canvas(오른쪽, width=220, height=200, highlightthickness=0)
        self.막대캔버스.pack()

        # 모델이 실제로 보는 28x28 입력 미리보기
        tk.Label(오른쪽, text="모델 입력(28x28)", font=("맑은 고딕", 9)).pack(pady=(8, 2))
        self.미리보기 = tk.Label(오른쪽, bg="black")
        self.미리보기.pack()
        self.미리보기이미지 = None

        self.막대그리기([0.0] * 10)

    # ----- 그리기 이벤트 -----
    def 그리기_시작(self, 이벤트):
        self.이전좌표 = (이벤트.x, 이벤트.y)
        self.점찍기(이벤트.x, 이벤트.y)

    def 그리기(self, 이벤트):
        x, y = 이벤트.x, 이벤트.y
        if self.이전좌표 is not None:
            px, py = self.이전좌표
            # 화면용 선과 인식용 이미지 선을 동시에 그린다
            self.캔버스.create_line(px, py, x, y, fill="white", width=붓두께,
                                  capstyle=tk.ROUND, smooth=True)
            self.그리기도구.line([px, py, x, y], fill=255, width=붓두께)
        self.점찍기(x, y)
        self.이전좌표 = (x, y)

    def 그리기_끝(self, _이벤트):
        self.이전좌표 = None
        self.인식()  # 획을 하나 그을 때마다 자동으로 인식

    def 점찍기(self, x, y):
        """선의 끝과 이음새가 둥글게 보이도록 원을 찍는다."""
        r = 붓두께 / 2
        self.캔버스.create_oval(x - r, y - r, x + r, y + r, fill="white", outline="white")
        self.그리기도구.ellipse([x - r, y - r, x + r, y + r], fill=255)

    # ----- 버튼 동작 -----
    def 지우기(self):
        self.캔버스.delete("all")
        self.그리기도구.rectangle([0, 0, 캔버스크기, 캔버스크기], fill=0)
        self.결과라벨.config(text="?")
        self.확신도라벨.config(text="확신도: -")
        self.미리보기.config(image="")
        self.막대그리기([0.0] * 10)

    @torch.no_grad()
    def 인식(self):
        변환결과 = MNIST형식으로_변환(self.이미지)
        if 변환결과 is None:
            return
        입력텐서, 입력이미지 = 변환결과

        확률 = F.softmax(self.모델(입력텐서), dim=1)[0].tolist()
        예측 = int(np.argmax(확률))

        self.결과라벨.config(text=str(예측))
        self.확신도라벨.config(text=f"확신도: {확률[예측] * 100:.1f}%")
        self.막대그리기(확률)
        self.미리보기_갱신(입력이미지)

    # ----- 화면 갱신 -----
    def 막대그리기(self, 확률):
        """0~9 각 숫자의 확률을 가로 막대그래프로 그린다."""
        c = self.막대캔버스
        c.delete("all")
        최대막대 = 150
        최고 = int(np.argmax(확률)) if max(확률) > 0 else -1
        for i, p in enumerate(확률):
            y = i * 20 + 2
            c.create_text(10, y + 8, text=str(i), font=("맑은 고딕", 10))
            c.create_rectangle(22, y + 2, 22 + 최대막대, y + 16, fill="#eee", outline="")
            색 = "#2b7de9" if i == 최고 else "#9bbce8"
            c.create_rectangle(22, y + 2, 22 + 최대막대 * p, y + 16, fill=색, outline="")
            c.create_text(22 + 최대막대 + 6, y + 9, text=f"{p * 100:.0f}%",
                          anchor="w", font=("맑은 고딕", 8))

    def 미리보기_갱신(self, 입력이미지: Image.Image):
        """모델에 들어간 28x28 이미지를 4배 확대해서 보여준다."""
        확대 = 입력이미지.resize((112, 112), Image.NEAREST)
        # 참조를 변수에 보관해야 가비지 컬렉션으로 이미지가 사라지지 않는다
        self.미리보기이미지 = ImageTk.PhotoImage(확대)
        self.미리보기.config(image=self.미리보기이미지)


def 작업표시줄_ID_지정():
    """윈도우 작업 표시줄이 이 앱을 파이썬이 아닌 별도의 프로그램으로 인식하게 한다."""
    if sys.platform == "win32":
        try:
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(앱ID)
        except (AttributeError, OSError):
            pass


def main():
    작업표시줄_ID_지정()  # 창을 만들기 전에 지정해야 적용된다
    루트 = tk.Tk()
    try:
        손글씨인식앱(루트)
    except FileNotFoundError:
        # pythonw로 실행하면 검은 창이 없어 오류가 보이지 않으므로 메시지 창으로 알린다
        루트.withdraw()
        messagebox.showerror("가중치 파일 없음",
                             f"학습된 가중치 파일을 찾을 수 없습니다.\n{가중치경로}\n\n"
                             "먼저 train.py를 실행해 모델을 학습해 주세요.")
        루트.destroy()
        return
    except Exception:
        루트.withdraw()
        messagebox.showerror("실행 오류", traceback.format_exc())
        루트.destroy()
        return
    루트.mainloop()


if __name__ == "__main__":
    main()
