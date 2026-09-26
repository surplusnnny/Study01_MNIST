"""MNIST 데이터셋으로 CNN을 학습하고 가중치를 mnist_cnn.pt 로 저장하는 스크립트."""

import time

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import datasets, transforms

from model import 숫자인식CNN

# ----- 학습 설정 -----
에폭수 = 8
배치크기 = 128
학습률 = 1e-3
저장경로 = "mnist_cnn.pt"
데이터경로 = "./data"

# MNIST 전체 데이터의 평균과 표준편차 (정규화에 사용)
MNIST_평균 = 0.1307
MNIST_표준편차 = 0.3081


def 데이터로더_만들기():
    """학습용/테스트용 데이터로더를 생성한다."""
    # 학습 데이터에는 약간의 회전·이동·확대 변형을 줘서
    # 사람이 직접 그린 숫자에도 잘 동작하도록 일반화 성능을 높인다.
    학습_변환 = transforms.Compose([
        transforms.RandomAffine(degrees=10, translate=(0.1, 0.1), scale=(0.9, 1.1)),
        transforms.ToTensor(),
        transforms.Normalize((MNIST_평균,), (MNIST_표준편차,)),
    ])
    테스트_변환 = transforms.Compose([
        transforms.ToTensor(),
        transforms.Normalize((MNIST_평균,), (MNIST_표준편차,)),
    ])

    학습셋 = datasets.MNIST(데이터경로, train=True, download=True, transform=학습_변환)
    테스트셋 = datasets.MNIST(데이터경로, train=False, download=True, transform=테스트_변환)

    학습로더 = DataLoader(학습셋, batch_size=배치크기, shuffle=True)
    테스트로더 = DataLoader(테스트셋, batch_size=1000, shuffle=False)
    return 학습로더, 테스트로더


def 한_에폭_학습(모델, 로더, 손실함수, 최적화기, 장치):
    """한 에폭 동안 모델을 학습하고 평균 손실과 정확도를 반환한다."""
    모델.train()
    누적손실, 정답수, 전체수 = 0.0, 0, 0
    for 이미지, 라벨 in 로더:
        이미지, 라벨 = 이미지.to(장치), 라벨.to(장치)

        최적화기.zero_grad()
        출력 = 모델(이미지)
        손실 = 손실함수(출력, 라벨)
        손실.backward()
        최적화기.step()

        누적손실 += 손실.item() * 이미지.size(0)
        정답수 += (출력.argmax(dim=1) == 라벨).sum().item()
        전체수 += 이미지.size(0)
    return 누적손실 / 전체수, 정답수 / 전체수


@torch.no_grad()
def 평가(모델, 로더, 손실함수, 장치):
    """테스트 데이터로 모델을 평가하고 평균 손실과 정확도를 반환한다."""
    모델.eval()
    누적손실, 정답수, 전체수 = 0.0, 0, 0
    for 이미지, 라벨 in 로더:
        이미지, 라벨 = 이미지.to(장치), 라벨.to(장치)
        출력 = 모델(이미지)
        누적손실 += 손실함수(출력, 라벨).item() * 이미지.size(0)
        정답수 += (출력.argmax(dim=1) == 라벨).sum().item()
        전체수 += 이미지.size(0)
    return 누적손실 / 전체수, 정답수 / 전체수


def main():
    torch.manual_seed(42)
    장치 = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"사용 장치: {장치}")

    학습로더, 테스트로더 = 데이터로더_만들기()
    모델 = 숫자인식CNN().to(장치)
    손실함수 = nn.CrossEntropyLoss()
    최적화기 = torch.optim.Adam(모델.parameters(), lr=학습률)
    # 에폭이 진행될수록 학습률을 코사인 곡선 형태로 서서히 줄인다
    스케줄러 = torch.optim.lr_scheduler.CosineAnnealingLR(최적화기, T_max=에폭수)

    최고정확도 = 0.0
    for 에폭 in range(1, 에폭수 + 1):
        시작 = time.time()
        학습손실, 학습정확도 = 한_에폭_학습(모델, 학습로더, 손실함수, 최적화기, 장치)
        테스트손실, 테스트정확도 = 평가(모델, 테스트로더, 손실함수, 장치)
        스케줄러.step()

        print(f"[에폭 {에폭}/{에폭수}] "
              f"학습 손실 {학습손실:.4f} · 학습 정확도 {학습정확도 * 100:.2f}% | "
              f"테스트 손실 {테스트손실:.4f} · 테스트 정확도 {테스트정확도 * 100:.2f}% "
              f"({time.time() - 시작:.1f}초)")

        # 테스트 정확도가 가장 높았던 시점의 가중치만 저장한다
        if 테스트정확도 > 최고정확도:
            최고정확도 = 테스트정확도
            torch.save(모델.state_dict(), 저장경로)
            print(f"  → 최고 정확도 갱신, '{저장경로}'에 가중치 저장")

    print(f"\n학습 완료! 최고 테스트 정확도: {최고정확도 * 100:.2f}%")


if __name__ == "__main__":
    main()
