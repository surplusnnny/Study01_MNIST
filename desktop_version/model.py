"""MNIST 손글씨 숫자 인식을 위한 CNN 모델 정의."""

import torch.nn as nn


class 숫자인식CNN(nn.Module):
    """28x28 흑백 이미지를 입력받아 0~9 숫자를 분류하는 합성곱 신경망."""

    def __init__(self):
        super().__init__()
        # 특징 추출부: 합성곱 → 배치정규화 → ReLU → 풀링 을 두 번 반복
        self.특징추출 = nn.Sequential(
            nn.Conv2d(1, 32, kernel_size=3, padding=1),   # 1x28x28 → 32x28x28
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.Conv2d(32, 32, kernel_size=3, padding=1),  # 32x28x28 → 32x28x28
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.MaxPool2d(2),                              # 32x28x28 → 32x14x14
            nn.Dropout(0.25),

            nn.Conv2d(32, 64, kernel_size=3, padding=1),  # 32x14x14 → 64x14x14
            nn.BatchNorm2d(64),
            nn.ReLU(),
            nn.Conv2d(64, 64, kernel_size=3, padding=1),  # 64x14x14 → 64x14x14
            nn.BatchNorm2d(64),
            nn.ReLU(),
            nn.MaxPool2d(2),                              # 64x14x14 → 64x7x7
            nn.Dropout(0.25),
        )
        # 분류부: 펼친 특징을 완전연결층으로 10개 클래스 점수로 변환
        self.분류기 = nn.Sequential(
            nn.Flatten(),
            nn.Linear(64 * 7 * 7, 128),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(128, 10),
        )

    def forward(self, x):
        x = self.특징추출(x)
        return self.분류기(x)
