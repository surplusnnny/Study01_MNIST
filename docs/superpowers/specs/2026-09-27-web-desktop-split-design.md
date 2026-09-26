<!-- 생성: 2026-09-27 00:46 KST -->
# 웹 버전·데스크톱 버전 분리 설계

## 목적

지금의 손글씨 숫자 인식기(PyTorch CNN + tkinter 그림판)를 두 버전으로 나눈다.

- **데스크톱 버전**: 기존 파이썬 코드를 `desktop_version/`으로 옮긴다. 학습·가중치의 원본(본거지) 역할을 한다.
- **웹 버전**: `web_version/`에 새로 만든다. 외부 라이브러리 없이 순수 자바스크립트로 브라우저에서 추론하며, 정적 파일만으로 GitHub Pages에 올릴 수 있어야 한다.
- 각 폴더에 그 폴더용 `CLAUDE.md`를 만든다.

### 성공 기준

1. `web_version/`을 정적 서버로 띄워 브라우저에서 숫자를 그리면 데스크톱 앱과 같은 방식으로 인식한다(마우스·터치).
2. 자동 검증(아래 "검증")을 모두 통과한다. 특히 "동작은 하지만 인식률이 낮은" 상태를 테스트로 잡아낸다.
3. 옮긴 뒤에도 데스크톱 앱, 학습 스크립트, 바탕 화면 바로가기가 정상 동작한다.

## 결정 사항

| # | 결정 | 근거 | 감수하는 비용 |
|---|---|---|---|
| 1 | 추론은 **브라우저 단독** | 서버 없이 링크만으로 공유 가능, 그림이 기기 밖으로 나가지 않음 | 전처리를 JS로 다시 구현해야 함 → 파이썬과의 일치 검증을 설계에 포함 |
| 2 | **desktop이 본거지, web은 산출물만** | `web_version`에 파이썬 의존성 0, 폴더째 떼어 낼 수 있음 | 가중치를 바꾸면 내보내기를 다시 돌려야 함 → `web_version/CLAUDE.md`에 명시 |
| 3 | **GitHub Pages 배포는 범위 밖** | 로컬 폴더 분리 작업은 배포 방식과 무관 | 이번 작업으로는 공개 URL이 생기지 않음. 확인은 로컬 `python -m http.server` |
| 4 | venv는 `desktop_version/.venv`에 **새로 만든다** | venv를 옮기면 `pip.exe`·activate 스크립트의 절대 경로가 깨짐. 새로 만들면 `create_shortcut.ps1`을 고칠 필요가 없음 | torch를 다시 내려받아야 함 |
| 5 | 가중치는 `model.json` + `weights.bin`(float32), **배치정규화는 내보낼 때 합성곱에 합친다** | JS가 conv·ReLU·maxpool·linear만 구현하면 됨, 파일 1.9MB 수준 | 모델 구조를 바꾸면 내보내기 코드도 고쳐야 함 |

파일 이름은 기존 관례대로 영문, 코드 식별자·주석은 한글로 쓴다.

## 폴더 구조

```
study01_MNIST/
├── CLAUDE.md                 # 전체 개요, 두 폴더의 관계, 동기화 규칙
├── README.md                 # 전체 소개 + 각 버전 README 안내
├── CLAUDE_전역.md            # 그대로 둔다
├── .gitignore                # 기존 패턴(.venv/, data/, __pycache__/ 등)은 하위 폴더에도 적용되므로 그대로
├── docs/superpowers/         # 스펙·계획 문서
├── desktop_version/
│   ├── CLAUDE.md             # 기존 CLAUDE.md를 데스크톱 기준으로 고친 것
│   ├── README.md             # 기존 README.md를 옮긴 것(경로 설명 갱신)
│   ├── model.py, train.py, app.py, make_icon.py, create_shortcut.ps1, icon.ico, mnist_cnn.pt   # git mv
│   ├── export_web.py         # 새 파일: 웹용 가중치·테스트 기준값 내보내기
│   ├── .venv/                # 새로 만듦 (git 제외)
│   └── data/                 # 루트 data/를 옮김, 다시 받지 않음 (git 제외)
└── web_version/
    ├── CLAUDE.md
    ├── index.html
    ├── style.css
    ├── package.json          # {"type": "module"} 만. 의존성 없음
    ├── js/
    │   ├── preprocess.js     # 전처리 (순수 함수)
    │   ├── model.js          # 추론 (순수 함수)
    │   └── app.js            # 화면·입력 처리
    ├── model/
    │   ├── model.json
    │   └── weights.bin
    └── tests/
        ├── preprocess.test.js
        ├── model.test.js
        ├── end_to_end.test.js
        └── fixtures/         # export_web.py가 만든 기준값
```

## 데스크톱 버전

### 이동

- `git mv`로 `model.py`, `train.py`, `app.py`, `make_icon.py`, `create_shortcut.ps1`, `icon.ico`, `mnist_cnn.pt`, `README.md`를 `desktop_version/`으로 옮긴다. 파일 내용은 바꾸지 않는다(README의 경로 설명만 갱신).
- git 밖의 `data/`는 `desktop_version/data/`로 옮긴다. 루트 `__pycache__/`, `icon_preview.png`는 생성물이므로 지운다(필요하면 다시 만들어짐).
- `app.py`는 `__file__` 기준 절대 경로를 쓰므로 수정할 필요가 없다. `train.py`는 `mnist_cnn.pt`, `./data`를 **작업 폴더 기준 상대 경로**로 쓰므로 `desktop_version/` 안에서 실행해야 한다. 이 점을 `desktop_version/CLAUDE.md`에 적는다(코드는 바꾸지 않는다).

### 가상환경

- `C:\ProgramData\Anaconda3\python.exe -m venv desktop_version\.venv`로 만든다.
- 같은 버전을 설치한다: torch 2.14.0(+cpu), torchvision 0.29.0, Pillow 12.3.0. torch·torchvision은 `https://download.pytorch.org/whl/cpu` 인덱스에서 받는다.
- 새 venv에서 앱 import와 전처리 검증이 통과한 **뒤에** 루트의 옛 `.venv`를 지운다.
- 바탕 화면 바로가기는 옛 경로를 가리키므로 `create_shortcut.ps1`을 다시 실행한다. 스크립트 자체는 `$PSScriptRoot` 기준이라 고치지 않는다(BOM 유지).

### `export_web.py`

`desktop_version/`에서 `.venv\Scripts\python.exe export_web.py`로 실행한다. `app.py`의 `모델_불러오기`, `MNIST형식으로_변환`, `MNIST_평균`, `MNIST_표준편차`를 import해서 쓴다(전처리 로직을 복제하지 않는다).

1. **가중치 내보내기** → `../web_version/model/`
   - 각 `Conv2d` + 뒤따르는 `BatchNorm2d`를 하나의 합성곱으로 합친다:
     `배율 = γ / sqrt(running_var + eps)`, `W' = W · 배율`(출력 채널별), `b' = (b − running_mean) · 배율 + β`.
   - `weights.bin`: 모든 텐서를 리틀엔디언 float32로 이어 붙인 파일.
   - `model.json`: `층` 목록(순서대로 `종류`가 `conv`/`relu`/`maxpool`/`flatten`/`linear`, 텐서마다 `모양`과 `weights.bin` 안의 `위치`·`길이`(원소 수)), `입력크기: 28`, `평균`, `표준편차`, `원본가중치_sha256`(`mnist_cnn.pt`의 SHA-256 앞 12자리).
   - 합친 모델의 출력이 원래 PyTorch 모델 출력과 최대 1e-4 이내인지 스크립트 안에서 확인하고, 아니면 예외를 낸다.
2. **테스트 기준값 내보내기** → `../web_version/tests/fixtures/`
   - MNIST 테스트셋 앞 500장을 쓴다(`data/`에 이미 있음).
   - 각 샘플 i에 대해 280×280 입력을 결정적으로 만든다: 28×28 원본을 **최근접 이웃 방식으로 k배**(k = 5 + i mod 6, 즉 5~10) 키우고, 280×280 검은 배경의 (dx, dy) 위치에 붙인다. dx = (i × 37) mod (280 − 28k + 1), dy = (i × 53) mod (280 − 28k + 1). 이 방식은 JS에서 똑같이 재현할 수 있다.
   - 이 280×280 이미지를 `MNIST형식으로_변환`에 넣어 얻은 28×28 이미지와, PyTorch 출력(logits)을 저장한다.
   - MNIST에 없는 극단적인 입력도 몇 가지 넣는다. 모두 사각형 채우기(`[x0, y0, x1, y1, 값]`, 끝은 미포함)로 정의해 JS에서 똑같이 재현할 수 있다:
     - 점 하나 → 확대 경로
     - 가로·세로로 얇은 선 → 한 방향 크기 1
     - 캔버스 전체 채우기
     - 가장자리에 닿는 테두리와 막대
   - 파일:
     - `samples.bin`: 원본 28×28 uint8 × 500
     - `preprocessed.bin`: 파이썬 전처리 결과 28×28 uint8 × 500
     - `expected.json`: `개수`, `라벨[]`, `배치[[k, dx, dy]]`, `로짓[][]`(10개씩), `파이썬예측[]`, `특수경우{이름: {사각형, 출력[784]}}`

## 웹 버전

### `js/preprocess.js` — 전처리

`export function MNIST형식으로_변환(흑백, 너비, 높이)`
- 입력: 길이 `너비×높이`의 흑백 배열(0~255, 검은 배경에 흰 글씨).
- 반환: 그린 것이 없으면 `null`, 있으면 28×28 `Uint8Array`(784).
- 파이썬 `MNIST형식으로_변환`을 단계별로 그대로 따라 한다.
  1. **경계상자**: 0이 아닌 픽셀의 최소 사각형(PIL `getbbox`와 같이 오른쪽·아래는 미포함).
  2. **축소**: 긴 변이 20이 되도록 `배율 = 20 / max(가로, 세로)`, 새 크기 = `max(1, 파이썬round(길이 × 배율))`. **PIL의 Lanczos 리샘플링을 그대로 옮긴다**:
     - 필터: `sinc(x)·sinc(x/3)` (|x| < 3), 지지 범위 = 3 × max(축소비, 1).
     - 가로 방향 → 세로 방향 순서로 두 번. 각 출력 픽셀의 계수 범위와 값은 PIL `Resample.c`의 `precompute_coeffs`와 같은 식으로 계산한다.
     - 8비트 경로와 같게 계수를 22비트 고정소수점으로 바꾸고(반올림 방향 포함), 누적값에 `1 << 21`을 더한 뒤 22비트 오른쪽 시프트하고 0~255로 자른다. 가로 패스 결과도 uint8로 저장한 뒤 세로 패스를 한다.
     - 크기가 같은 방향은 건너뛴다.
  3. **가운데 배치**: 28×28 검은 배경의 `(floor((28−w)/2), floor((28−h)/2))`에 붙인다.
  4. **무게중심 이동**: 밝기 가중 무게중심을 구해 `이동 = 파이썬round(14 − 중심)`만큼 정수 평행 이동한다. 밖으로 나간 부분은 버리고 빈 곳은 0.
- **반올림 주의**: 파이썬 `round()`는 짝수 쪽으로 반올림한다(0.5 → 0, 1.5 → 2, 2.5 → 2). `Math.round`와 다르므로 `파이썬반올림()` 함수를 따로 만들어 쓴다.

### `js/model.js` — 추론

`export function 모델_만들기(정보, 가중치버퍼)`
- `정보`: `model.json`을 파싱한 객체. `가중치버퍼`: `weights.bin`의 `ArrayBuffer`.
- 반환: `{ 추론(이미지28) }`. `이미지28`은 28×28 `Uint8Array`이고, 결과는 로짓 `Float32Array(10)`이다.
- 내부 단계: `(픽셀/255 − 평균) / 표준편차` 정규화 → `model.json`의 층 목록 순서대로 실행한다.
  - conv: 3×3, 패딩 1, 편향 포함
  - relu
  - maxpool: 2×2, 보폭 2
  - flatten: PyTorch와 같은 채널-행-열 순서
  - linear
- `export function 소프트맥스(로짓)`: 최댓값을 빼고 계산해 넘침을 막는다.
- DOM·`fetch`에 의존하지 않는다. 그래서 브라우저와 Node 양쪽에서 import할 수 있다.

### `js/app.js`, `index.html`, `style.css` — 화면

- 데스크톱 앱과 같은 구성: 그림판(280×280, 검은 배경), `지우기`·`인식하기` 버튼, 예측 숫자, 확신도, 0~9 확률 막대(가장 높은 것을 강조), 모델 입력 28×28 미리보기(4배 확대, 흐림 없이).
- 그리기: Pointer Events로 마우스와 터치를 함께 처리한다.
  - 캔버스에는 `touch-action: none`을 준다.
  - 선 굵기 18, 둥근 끝·이음새, 흰색.
  - 캔버스 내부 해상도는 항상 280×280이다. 화면 표시 크기는 CSS로 바뀔 수 있으므로, 포인터 좌표를 `캔버스.width / 표시너비` 비율로 바꾼다.
- 인식: 획을 뗄 때 자동으로 인식하고, `인식하기` 버튼으로도 인식한다. 캔버스 `getImageData`의 R 채널을 흑백 배열로 쓴다. `Esc` 키로 지운다.
- 모델 로딩: 시작할 때 `fetch('model/model.json')`, `fetch('model/weights.bin')`로 불러온다. 경로는 상대 경로라서 하위 경로 배포에서도 동작한다.
  - 불러오는 동안에는 "모델 불러오는 중"을 표시하고 인식을 막는다.
  - 실패하면 오류 문구를 화면에 보여 준다. `file://`로 열었을 때도 실패하므로 "로컬 서버로 열어야 한다"는 안내를 넣는다.
- 휴대폰 폭(약 375px)에서 그림판이 화면 폭에 맞게 줄어들고, 결과가 그림판 아래로 내려간다.
- 외부 스크립트·폰트·CDN을 쓰지 않는다.

## 검증

모두 `web_version/`에서 `node --test` 한 줄로 돌린다(Node 24 내장 러너, 외부 라이브러리 없음).

| 테스트 | 확인 내용 | 기준 |
|---|---|---|
| `model.test.js` | 파이썬 전처리 결과(`preprocessed.bin`)를 JS 모델에 넣은 로짓 vs PyTorch 로짓 | 500장 모두 원소별 차이 ≤ 1e-4 |
| `preprocess.test.js` | 같은 280×280 입력에 대한 JS 전처리 vs 파이썬 전처리 | 500장 중 **99% 이상 픽셀 단위로 완전히 같음** |
| `preprocess.test.js` | `파이썬반올림`, 빈 그림(`null` 반환), 경계상자 같은 단위 동작 | 명시한 값과 같음 |
| `preprocess.test.js` | 극단적인 입력(`특수경우`)의 JS 전처리 vs 파이썬 전처리 | 모두 픽셀 단위로 완전히 같음 |
| `end_to_end.test.js` | 280×280 입력 → JS 전처리 → JS 추론 | 정확도 **98% 이상**(파이썬은 99.6%), 파이썬 예측과 **99% 이상** 일치 |

- 전처리 기준을 "완전히 같음 99%"로 잡은 이유: Lanczos를 PIL과 같은 정수 연산으로 구현하면 같은 결과가 나와야 한다. 다만 무게중심이 정확히 x.5에 걸리는 경우처럼 부동소수 오차로 이동량이 1 달라질 수 있어 약간 여유를 둔다.
- 끝에서 끝까지 테스트는 전처리 일치 테스트가 놓칠 수 있는 인식률 저하를 잡는다.

**자동으로 확인할 수 없는 부분**: 브라우저 캔버스는 획 가장자리를 안티앨리어싱하고, PIL `ImageDraw`는 가장자리를 딱 끊어 그린다. 그래서 실제로 그린 입력은 두 버전이 완전히 같지 않다. 이 부분은 로컬 서버로 띄워 브라우저에서 0~9를 직접 그려 확인한다(데스크톱과 휴대폰 폭 모두).

### 데스크톱 쪽 검증

- `desktop_version/.venv`로 `app`을 import해 `모델_불러오기()`와 `MNIST형식으로_변환()`을 직접 호출하고, MNIST 500장 전처리 검증이 기존과 같이 나오는지 확인한다(498/500).
- `desktop_version\.venv\Scripts\python.exe desktop_version\app.py`로 창이 뜨는지 확인한다.

## CLAUDE.md

- **루트 `CLAUDE.md`**: 저장소 개요(두 버전과 역할), 한글 코드 규칙, **동기화 규칙**을 적는다. 동기화 규칙은 다음과 같다.
  - 가중치나 모델 구조를 바꾸면 `export_web.py`를 다시 실행한다.
  - 전처리를 바꾸면 `app.py`와 `preprocess.js`를 함께 고친다.
  - 정규화 상수는 `train.py`와 `app.py`에 따로 있다. 웹은 `model.json`을 통해 받는다.
  - 폴더별 세부 내용은 각 폴더의 `CLAUDE.md`를 보라고 안내한다.
- **`desktop_version/CLAUDE.md`**: 기존 `CLAUDE.md` 내용을 옮기고 다음을 반영한다.
  - 명령어는 `desktop_version/` 기준으로 쓴다.
  - `train.py`의 작업 폴더 의존성을 적는다.
  - `export_web.py`의 역할과, `web_version/` 파일을 덮어쓴다는 점을 적는다.
- **`web_version/CLAUDE.md`**: 다음을 적는다.
  - 구조(순수 함수 두 모듈 + 화면 모듈)
  - 실행 방법: `python -m http.server` 등 정적 서버. `file://`로는 동작하지 않는다.
  - 테스트 방법: `node --test`
  - 외부 라이브러리를 쓰지 않는다는 규칙
  - `model/`과 `tests/fixtures/`는 손으로 고치지 말고 `desktop_version/export_web.py`로만 다시 만든다는 점
  - 전처리가 파이썬과 비트 단위로 맞아야 하는 이유와 주의점(파이썬 반올림, PIL Lanczos 고정소수점)

## 범위 밖

- GitHub Pages 배포 설정(워크플로, 저장소 설정)
- 웹에서의 학습, 모델 구조 변경, 가중치 경량화(float16·int8)
- 데스크톱 코드의 동작 변경
