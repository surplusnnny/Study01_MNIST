# 생성: 2026-09-27 01:09 KST
"""학습된 가중치와 테스트 기준값을 웹 버전(../web_version)에서 쓰는 형식으로 내보내는 스크립트.

desktop_version 폴더에서 실행한다: .venv\\Scripts\\python.exe export_web.py
- 배치정규화는 바로 앞 합성곱에 합쳐서, 웹에서는 합성곱·ReLU·최대풀링·완전연결만 구현하면 되게 한다.
- 전처리는 app.py의 MNIST형식으로_변환()을 그대로 써서 기준값을 만든다(로직을 복제하지 않는다).
"""

import hashlib
import json
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from torchvision import datasets

from app import MNIST_평균, MNIST_표준편차, MNIST형식으로_변환, 가중치경로, 모델_불러오기

# ----- 경로와 설정 -----
프로젝트폴더 = Path(__file__).resolve().parent
웹폴더 = 프로젝트폴더.parent / "web_version"
모델폴더 = 웹폴더 / "model"
기준값폴더 = 웹폴더 / "tests" / "fixtures"
데이터경로 = 프로젝트폴더 / "data"
샘플수 = 500
허용오차 = 1e-4

# MNIST에 없는 극단적인 입력. [x0, y0, x1, y1, 값] 사각형을 순서대로 채운다(끝은 미포함).
특수경우 = {
    "점하나": [[140, 140, 141, 141, 255]],
    "가로얇은선": [[40, 100, 240, 103, 255]],
    "세로얇은선": [[100, 10, 104, 270, 180]],
    "꽉참": [[0, 0, 280, 280, 255]],
    "테두리": [[0, 0, 280, 18, 255], [0, 262, 280, 280, 255],
             [0, 0, 18, 280, 255], [262, 0, 280, 280, 255]],
    "오른쪽끝막대": [[262, 5, 280, 280, 255]],
}


def 층_목록_만들기(모델):
    """모델의 층을 순서대로 훑어 내보낼 층 목록을 만든다. 배치정규화는 바로 앞 합성곱에 합친다."""
    층들 = []
    for 모듈 in list(모델.특징추출) + list(모델.분류기):
        if isinstance(모듈, nn.Conv2d):
            if 모듈.kernel_size != (3, 3) or 모듈.padding != (1, 1) or 모듈.stride != (1, 1):
                raise ValueError(f"웹 버전은 3x3·패딩 1·보폭 1 합성곱만 지원합니다: {모듈}")
            층들.append({"종류": "conv", "가중치": 모듈.weight.detach().double(),
                       "편향": 모듈.bias.detach().double()})
        elif isinstance(모듈, nn.BatchNorm2d):
            앞층 = 층들[-1]
            if 앞층["종류"] != "conv":
                raise ValueError("배치정규화 앞에는 합성곱이 있어야 합니다")
            # 배율 = γ / sqrt(분산 + eps),  W' = W·배율,  b' = (b − 평균)·배율 + β
            배율 = 모듈.weight.detach().double() / torch.sqrt(모듈.running_var.double() + 모듈.eps)
            앞층["가중치"] = 앞층["가중치"] * 배율[:, None, None, None]
            앞층["편향"] = (앞층["편향"] - 모듈.running_mean.double()) * 배율 + 모듈.bias.detach().double()
        elif isinstance(모듈, nn.ReLU):
            층들.append({"종류": "relu"})
        elif isinstance(모듈, nn.MaxPool2d):
            if 모듈.kernel_size != 2 or 모듈.stride != 2:
                raise ValueError(f"웹 버전은 2x2·보폭 2 최대풀링만 지원합니다: {모듈}")
            층들.append({"종류": "maxpool"})
        elif isinstance(모듈, nn.Flatten):
            층들.append({"종류": "flatten"})
        elif isinstance(모듈, nn.Linear):
            층들.append({"종류": "linear", "가중치": 모듈.weight.detach().double(),
                       "편향": 모듈.bias.detach().double()})
        elif isinstance(모듈, nn.Dropout):
            continue  # 추론 때는 아무 일도 하지 않는다
        else:
            raise TypeError(f"내보낼 수 없는 층입니다: {모듈}")

    # 파일에는 float32로 저장하므로, 확인도 float32로 바꾼 값으로 한다
    for 층 in 층들:
        for 키 in ("가중치", "편향"):
            if 키 in 층:
                층[키] = 층[키].float()
    return 층들


def 합친_모델로_추론(층들, 입력):
    """내보낼 층 목록으로 float64 순전파를 한다(웹 버전의 계산을 흉내 낸 것)."""
    값 = 입력.double()
    for 층 in 층들:
        if 층["종류"] == "conv":
            값 = F.conv2d(값, 층["가중치"].double(), 층["편향"].double(), padding=1)
        elif 층["종류"] == "relu":
            값 = F.relu(값)
        elif 층["종류"] == "maxpool":
            값 = F.max_pool2d(값, 2)
        elif 층["종류"] == "flatten":
            값 = 값.flatten(1)
        elif 층["종류"] == "linear":
            값 = F.linear(값, 층["가중치"].double(), 층["편향"].double())
    return 값


def 합치기_확인(모델, 층들):
    """배치정규화를 합친 결과가 원래 모델과 허용오차 이내로 같은지 확인한다."""
    torch.manual_seed(0)
    입력 = torch.randn(64, 1, 28, 28)
    with torch.no_grad():
        기준 = 모델(입력).double()
    차이 = (합친_모델로_추론(층들, 입력) - 기준).abs().max().item()
    if 차이 > 허용오차:
        raise RuntimeError(f"배치정규화를 합친 모델의 출력이 원래와 다릅니다 (최대 차이 {차이:.2e})")
    print(f"배치정규화 합치기 확인: 최대 차이 {차이:.2e}")


def 가중치_저장(층들):
    """층 목록을 model.json(구조)과 weights.bin(리틀엔디언 float32)으로 저장한다."""
    모델폴더.mkdir(parents=True, exist_ok=True)
    조각들, 층정보들, 위치 = [], [], 0
    for 층 in 층들:
        정보 = {"종류": 층["종류"]}
        for 키 in ("가중치", "편향"):
            if 키 in 층:
                배열 = 층[키].numpy().astype("<f4")
                정보[키] = {"모양": list(배열.shape), "위치": 위치, "길이": int(배열.size)}
                조각들.append(배열.tobytes())
                위치 += int(배열.size)
        층정보들.append(정보)

    (모델폴더 / "weights.bin").write_bytes(b"".join(조각들))
    모델정보 = {
        "입력크기": 28,
        "평균": MNIST_평균,
        "표준편차": MNIST_표준편차,
        "원본가중치_sha256": hashlib.sha256(가중치경로.read_bytes()).hexdigest()[:12],
        "층": 층정보들,
    }
    (모델폴더 / "model.json").write_text(
        json.dumps(모델정보, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"가중치 저장: {모델폴더} (float32 {위치:,}개, {위치 * 4 / 1024 / 1024:.2f} MB)")


def 큰_그림_만들기(원본, 번호):
    """28x28 원본을 번호에 따라 정해진 배율·위치로 280x280에 붙인다(웹 테스트에서 똑같이 재현)."""
    k = 5 + 번호 % 6
    여유 = 280 - 28 * k + 1
    dx, dy = (번호 * 37) % 여유, (번호 * 53) % 여유
    큰 = np.zeros((280, 280), np.uint8)
    큰[dy:dy + 28 * k, dx:dx + 28 * k] = np.kron(원본, np.ones((k, k), np.uint8))
    return 큰, [k, dx, dy]


def 사각형_그림_만들기(사각형들):
    """[x0, y0, x1, y1, 값] 사각형들을 280x280 검은 배경에 순서대로 채운다."""
    그림 = np.zeros((280, 280), np.uint8)
    for x0, y0, x1, y1, 값 in 사각형들:
        그림[y0:y1, x0:x1] = 값
    return 그림


def 기준값_저장(모델):
    """MNIST 테스트 이미지와 극단적인 입력으로 파이썬 전처리·추론 결과를 저장한다."""
    기준값폴더.mkdir(parents=True, exist_ok=True)
    테스트셋 = datasets.MNIST(str(데이터경로), train=False, download=True)

    원본들, 전처리들, 라벨들, 배치들, 입력텐서들 = [], [], [], [], []
    for 번호 in range(샘플수):
        그림, 라벨 = 테스트셋[번호]
        원본 = np.asarray(그림, dtype=np.uint8)
        큰, 배치 = 큰_그림_만들기(원본, 번호)
        텐서, 결과 = MNIST형식으로_변환(Image.fromarray(큰))
        원본들.append(원본.tobytes())
        전처리들.append(np.asarray(결과, dtype=np.uint8).tobytes())
        라벨들.append(int(라벨))
        배치들.append(배치)
        입력텐서들.append(텐서)

    with torch.no_grad():
        로짓 = 모델(torch.cat(입력텐서들)).numpy()
    예측 = 로짓.argmax(axis=1)

    특수결과 = {}
    for 이름, 사각형들 in 특수경우.items():
        _, 결과 = MNIST형식으로_변환(Image.fromarray(사각형_그림_만들기(사각형들)))
        특수결과[이름] = {"사각형": 사각형들, "출력": np.asarray(결과, dtype=np.uint8).flatten().tolist()}

    (기준값폴더 / "samples.bin").write_bytes(b"".join(원본들))
    (기준값폴더 / "preprocessed.bin").write_bytes(b"".join(전처리들))
    기대값 = {
        "개수": 샘플수,
        "라벨": 라벨들,
        "배치": 배치들,
        "로짓": [[float(v) for v in 행] for 행 in 로짓],
        "파이썬예측": [int(v) for v in 예측],
        "특수경우": 특수결과,
    }
    (기준값폴더 / "expected.json").write_text(
        json.dumps(기대값, ensure_ascii=False) + "\n", encoding="utf-8")
    정답 = sum(int(p == l) for p, l in zip(예측, 라벨들))
    print(f"기준값 저장: {기준값폴더} (파이썬 정확도 {정답}/{샘플수})")


def main():
    모델 = 모델_불러오기()
    층들 = 층_목록_만들기(모델)
    합치기_확인(모델, 층들)
    가중치_저장(층들)
    기준값_저장(모델)


if __name__ == "__main__":
    main()
