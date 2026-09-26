# CLAUDE.md
<!-- 생성: 2026-09-27 01:48 KST -->

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 개요

손글씨 숫자 인식기의 **웹 버전**입니다. MNIST로 학습한 CNN을 브라우저 안에서 **외부 라이브러리 없이 순수 자바스크립트로** 추론하고, 정적 파일만으로 동작합니다(GitHub Pages에 그대로 올릴 수 있음).
모든 코드·주석·식별자(변수, 함수, JSON 키, CSS 클래스·id)는 한글로 씁니다. 파일 이름만 영문입니다.
학습과 가중치의 원본은 `../desktop_version`이고, 이 폴더에는 거기서 내보낸 산출물만 있습니다. 이 폴더에는 파이썬 의존성이 없습니다.

## 명령어

모두 web_version 폴더 안에서 실행합니다.

```bash
node --test                                   # 전체 테스트 (Node 24 내장 러너, 설치할 것 없음)
python -m http.server 8000 --bind 127.0.0.1   # 로컬 서버 → http://127.0.0.1:8000
```

- `index.html`을 파일로 직접 열면(`file://`) `fetch`가 막혀 모델을 불러오지 못합니다. 반드시 정적 서버로 여세요.
- Windows에서 `python3`는 스토어 별칭일 수 있으니 `python`을 쓰세요. 표준 라이브러리만 쓰므로 어느 파이썬이든 됩니다.

## 구조

- **`js/preprocess.js`**(순수 함수): 280×280 흑백 배열 → 28×28 `Uint8Array`, 그린 것이 없으면 `null`.
- **`js/model.js`**(순수 함수): `모델_만들기(model.json 내용, weights.bin ArrayBuffer)` → `{ 추론(28×28) }`. 정규화(평균·표준편차는 `model.json`에서 읽음)도 여기서 합니다.
- 두 모듈은 DOM·`fetch`를 쓰지 않으므로 브라우저와 Node 테스트에서 그대로 import됩니다. 이 성질을 유지하세요.
- **`js/app.js`**: 화면·입력만 맡습니다.
  - Pointer Events로 마우스·터치를 함께 처리하고, 캔버스 `getImageData`의 빨강 채널을 흑백으로 씁니다.
  - 캔버스 내부 해상도는 항상 280×280이고 CSS로 줄어들 수 있으므로, 포인터 좌표는 비율로 바꿉니다.
  - 캔버스에 `border`를 주면 좌표가 어긋나므로 `outline`을 씁니다.
- 모델 파일은 문서 기준 **상대 경로**(`model/…`)로 읽습니다. 하위 경로 배포(GitHub Pages 프로젝트 페이지)에서도 동작하게 하려는 것이니 절대 경로로 바꾸지 마세요.

## 생성물 — 손으로 고치지 않기

- `model/model.json`, `model/weights.bin`, `tests/fixtures/*`는 `../desktop_version/export_web.py`가 만듭니다.
  - 가중치를 다시 학습했거나, 모델 구조·전처리·정규화 상수를 바꿨다면 그 스크립트를 다시 실행하고 여기서 `node --test`로 확인하세요.
- `weights.bin`은 리틀엔디언 float32입니다. `model.json`의 `위치`·`길이`는 float32 **원소 개수** 단위입니다(바이트가 아님).
- 배치정규화는 내보낼 때 합성곱에 합쳐져 있습니다. 그래서 JS는 conv(3×3, 패딩 1)·relu·maxpool(2×2)·flatten·linear만 구현합니다. 모델에 다른 종류의 층을 넣으면 `export_web.py`와 `model.js`를 함께 고쳐야 합니다.
- `model.json`과 `weights.bin`의 크기가 맞지 않으면(한쪽만 갱신·캐시) `모델_만들기`가 오류를 냅니다.

## 전처리는 파이썬과 비트 단위로 같아야 함

`preprocess.js`는 `../desktop_version/app.py`의 `MNIST형식으로_변환()`을 그대로 옮긴 것이고, 테스트는 픽셀 단위 일치를 요구합니다.
- **반올림**: 파이썬 `round()`는 .5를 짝수 쪽으로 보냅니다(2.5 → 2). `Math.round`를 쓰지 말고 `파이썬반올림()`을 쓰세요.
- **축소**: Pillow `Image.resize(LANCZOS)`의 C 구현(`Resample.c`)을 옮겼습니다.
  - 22비트 고정소수점 계수를 쓰고, 계수 반올림 방향과 `clip8`을 원본과 같게 맞췄습니다.
  - 가로 방향을 먼저, 세로 방향을 나중에 처리하며, 두 패스 사이 값은 uint8입니다.
  - 부동소수 연산으로 "비슷하게" 바꾸면 테스트가 깨집니다.
- 한쪽 전처리를 바꾸면 다른 쪽도 같이 바꾸고 기준값을 다시 만드세요.

## 테스트

`tests/*.test.js`는 `node --test`가 자동으로 찾습니다. `tests/helpers.js`는 테스트 파일이 아닙니다.
- `model.test.js`: 파이썬이 전처리한 입력에 대해 로짓이 PyTorch와 1e-4 이내인지 확인합니다.
- `preprocess.test.js`: 같은 280×280 입력에 대해 JS 전처리가 파이썬과 픽셀 단위로 같은지 확인합니다(MNIST 500장과 극단적인 입력).
- `end_to_end.test.js`: 정확도 98% 이상, 파이썬 예측과 99% 이상 일치하는지 확인합니다.

자동 테스트가 잡지 못하는 것도 있습니다. 브라우저 캔버스는 획 가장자리를 안티앨리어싱하고, 데스크톱의 PIL `ImageDraw`는 가장자리를 딱 끊어 그립니다. 그래서 실제로 그린 입력은 두 버전이 완전히 같지 않습니다. 화면을 고친 뒤에는 로컬 서버로 띄워 직접 그려 보세요(좁은 화면 폭 포함).
