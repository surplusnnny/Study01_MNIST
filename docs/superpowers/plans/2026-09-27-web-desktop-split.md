<!-- 생성: 2026-09-27 00:54 KST -->
# 웹·데스크톱 버전 분리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 파이썬 손글씨 인식기를 `desktop_version/`으로 옮기고, 외부 라이브러리 없이 브라우저에서 추론하는 정적 웹 버전을 `web_version/`에 새로 만든다.

**Architecture:** 데스크톱 폴더가 학습·가중치의 원본이다. `desktop_version/export_web.py`가 배치정규화를 합친 가중치(`model.json` + `weights.bin`)와 테스트 기준값을 `web_version/`에 써 넣는다. 웹 버전은 순수 함수 모듈 두 개(`preprocess.js`, `model.js`)와 화면 모듈(`app.js`)로 이루어진다. 순수 함수 모듈은 Node 내장 테스트 러너로 파이썬 결과와 비트 단위로 대조한다.

**Tech Stack:** Python 3.14 + PyTorch 2.14.0(CPU) + Pillow 12.3.0(데스크톱, 내보내기) / 순수 ES 모듈 JavaScript + HTML + CSS(웹) / Node 24 `node --test`(테스트, 의존성 없음)

**Spec:** `docs/superpowers/specs/2026-09-27-web-desktop-split-design.md`

## Global Constraints

- 모든 코드·주석·식별자(변수, 함수, 클래스, JSON 키, CSS 클래스·id)는 **한글**로 쓴다. 파일 이름만 영문이다.
- **새로 만드는 파일**은 맨 위에 `생성: YYYY-MM-DD HH:MM KST` 주석을 단다. 시각은 짐작하지 말고 파일을 만들기 직전에 `TZ=KST-9 date '+%Y-%m-%d %H:%M'`(Git Bash)로 확인해 넣는다.
  - 주석 문법: `#`(Python, .gitattributes), `//`(JS), `<!-- -->`(HTML, Markdown), `/* */`(CSS)
  - `<!DOCTYPE html>`, CLAUDE.md의 `# CLAUDE.md` 제목처럼 첫 줄이 정해진 파일은 둘째 줄에 넣는다.
  - JSON·`.bin`처럼 주석을 쓸 수 없는 파일에는 넣지 않는다.
  - 이 계획의 코드 블록에 있는 `YYYY-MM-DD HH:MM`은 위 명령 결과로 바꿔 넣는다.
- `git mv`로 옮긴 기존 파일에는 생성 주석을 새로 달지 않는다.
- 웹 버전에는 외부 라이브러리·CDN·빌드 도구를 쓰지 않는다. `package.json`은 `{"type": "module"}`만 담는다.
- 파이썬은 `desktop_version\.venv\Scripts\python.exe`를 쓴다. Task 1 이전에는 루트 `.venv`를 쓴다. 콘솔 한글이 깨지지 않도록 Bash에서는 `PYTHONIOENCODING=utf-8`을 앞에 붙인다.
- 한글이 들어간 파일을 셸 heredoc 안의 문자열 치환으로 고치지 않는다. Write/Edit 도구를 쓴다.
- `create_shortcut.ps1`은 BOM이 있는 UTF-8이다. 이 계획에서는 **고치지 않는다**.
- 데스크톱 코드(`model.py`, `train.py`, `app.py`, `make_icon.py`, `create_shortcut.ps1`)의 동작은 바꾸지 않는다.
- 커밋 메시지는 한글로 쓰고 마지막 줄에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`를 넣는다. 브랜치는 `web-desktop-split`이다.

## Review Focus

1. **아주 작거나 얇은 그림**(점 하나, 한 방향 두께가 몇 픽셀인 선): 긴 변을 20으로 맞출 때 **확대** 경로를 타고, 짧은 변은 `max(1, …)`로 1이 된다. 파이썬과 똑같은 28×28이 나와야 한다 → Task 4의 `특수경우` 테스트(점하나, 가로얇은선, 세로얇은선).
2. **캔버스 가장자리에 닿거나 캔버스를 꽉 채운 그림**: 경계상자가 캔버스 끝과 같아도 인덱스가 넘치지 않고 파이썬과 같아야 한다 → Task 4의 `특수경우` 테스트(꽉참, 테두리, 오른쪽끝막대).
3. **`model.json`과 `weights.bin`이 서로 맞지 않는 경우**(다시 내보낸 뒤 브라우저가 옛 `weights.bin`을 캐시한 경우 등): 조용히 엉뚱한 결과를 내지 말고 오류를 내야 한다 → Task 3의 "weights.bin 크기가 다르면 오류" 테스트. 화면은 Task 5에서 오류 문구를 보여 준다.
4. **휴대폰처럼 좁은 화면에서 CSS로 줄어든 그림판**: 포인터 좌표를 캔버스 내부 해상도(280)로 바꾸지 않으면 획이 손가락 아래가 아닌 곳에 그려진다 → Task 5 Step 6에서 폭 300px로 줄인 뒤 드래그 위치와 그려진 위치가 같은지 확인.
5. **모델을 불러오기 전에 그리거나 버튼을 누르는 경우**: 예외 없이 무시하고, 불러오기가 끝나면 그려 둔 그림을 바로 인식해야 한다 → Task 5 Step 7의 확인.

---

## 파일 구조

| 파일 | 역할 | Task |
|---|---|---|
| `desktop_version/`(`model.py`, `train.py`, `app.py`, `make_icon.py`, `create_shortcut.ps1`, `icon.ico`, `mnist_cnn.pt`, `README.md`, `CLAUDE.md`) | 기존 파일을 `git mv`로 옮긴 것 | 1 |
| `desktop_version/.venv/`, `desktop_version/data/` | 새 가상환경, 옮긴 MNIST 데이터(git 제외) | 1 |
| `desktop_version/export_web.py` | 웹용 가중치·테스트 기준값 내보내기 | 2 |
| `.gitattributes` | `*.bin`을 바이너리로 지정(줄바꿈 변환 방지) | 2 |
| `web_version/model/model.json`, `web_version/model/weights.bin` | 내보낸 모델(생성물) | 2 |
| `web_version/tests/fixtures/`(`samples.bin`, `preprocessed.bin`, `expected.json`) | 테스트 기준값(생성물) | 2 |
| `web_version/package.json` | `{"type": "module"}` | 3 |
| `web_version/js/model.js` | 추론(순수 함수) | 3 |
| `web_version/tests/helpers.js` | 테스트 공용: 파일 읽기, 280×280 입력 만들기 | 3, 4 |
| `web_version/tests/model.test.js` | 추론 일치 테스트 | 3 |
| `web_version/js/preprocess.js` | 전처리(순수 함수) | 4 |
| `web_version/tests/preprocess.test.js`, `web_version/tests/end_to_end.test.js` | 전처리 일치, 전체 흐름 테스트 | 4 |
| `web_version/index.html`, `web_version/style.css`, `web_version/js/app.js` | 화면 | 5 |
| `web_version/CLAUDE.md`, `CLAUDE.md`(루트, 새로 작성), `README.md`(루트, 새로 작성) | 문서 | 6 |

---

### Task 1: 데스크톱 파일 이동과 새 가상환경

**Files:**
- Move: `model.py`, `train.py`, `app.py`, `make_icon.py`, `create_shortcut.ps1`, `icon.ico`, `mnist_cnn.pt`, `README.md`, `CLAUDE.md` → `desktop_version/`
- Move (git 밖): `data/` → `desktop_version/data/`
- Delete (git 밖 생성물): `__pycache__/`, `icon_preview.png`, 검증이 끝난 뒤 루트 `.venv/`
- Create (git 밖): `desktop_version/.venv/`
- Modify: `desktop_version/README.md`, `desktop_version/CLAUDE.md`

**Interfaces:**
- Consumes: 없음
- Produces: `desktop_version\.venv\Scripts\python.exe`(torch 2.14.0, torchvision 0.29.0, Pillow 12.3.0). `desktop_version/`에서 `import app`이 되고, `app.모델_불러오기()`, `app.MNIST형식으로_변환(PIL.Image) -> (torch.Tensor[1,1,28,28], PIL.Image 28x28) | None`, `app.MNIST_평균`, `app.MNIST_표준편차`, `app.가중치경로`를 쓸 수 있다. `desktop_version/data/MNIST/`에 데이터가 있다.

- [ ] **Step 1: 시작 상태 확인**

Run: `cd /c/Users/tlsdn/study01_MNIST && git status --short && git branch --show-current`
Expected: 출력이 `web-desktop-split` 한 줄뿐(변경 없음). 변경이 있으면 멈추고 보고한다.

- [ ] **Step 2: 이동 전 기준 검증 스크립트를 scratchpad에 만든다**

이 스크립트는 저장소에 넣지 않는다. scratchpad(`$SP` = 세션 scratchpad 경로)에 `데스크톱검증.py`로 저장한다.

```python
"""데스크톱 app.py의 전처리+추론을 MNIST 500장으로 검증한다. 인자: desktop 폴더 경로."""
import sys

import numpy as np
import torch
from PIL import Image
from torchvision import datasets

sys.path.insert(0, sys.argv[1])
import app  # noqa: E402

모델 = app.모델_불러오기()
테스트셋 = datasets.MNIST(sys.argv[1] + "/data", train=False, download=False)
정답 = 0
for 번호 in range(500):
    그림, 라벨 = 테스트셋[번호]
    원본 = np.asarray(그림, dtype=np.uint8)
    k = 5 + 번호 % 6
    여유 = 280 - 28 * k + 1
    dx, dy = (번호 * 37) % 여유, (번호 * 53) % 여유
    큰 = np.zeros((280, 280), np.uint8)
    큰[dy:dy + 28 * k, dx:dx + 28 * k] = np.kron(원본, np.ones((k, k), np.uint8))
    텐서, _ = app.MNIST형식으로_변환(Image.fromarray(큰))
    with torch.no_grad():
        정답 += int(모델(텐서).argmax()) == 라벨
print(f"정답 {정답} / 500")
```

Run: `PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe "$SP/데스크톱검증.py" .`
Expected: `정답 498 / 500`(계획 작성 때 측정한 값)

- [ ] **Step 3: git으로 추적하는 파일 옮기기**

```bash
mkdir desktop_version
git mv model.py train.py app.py make_icon.py create_shortcut.ps1 icon.ico mnist_cnn.pt README.md CLAUDE.md desktop_version/
```

Run: `git status --short`
Expected: `R  model.py -> desktop_version/model.py` 같은 줄이 9개

- [ ] **Step 4: git 밖 데이터 옮기기, 생성물 지우기**

```bash
mv data desktop_version/data
rm -rf __pycache__ icon_preview.png
```

Run: `ls desktop_version/data/MNIST/raw | head -3`
Expected: `t10k-images-idx3-ubyte` 등 MNIST 파일 이름

- [ ] **Step 5: 새 가상환경 만들기**

```bash
/c/ProgramData/Anaconda3/python.exe -m venv desktop_version/.venv
desktop_version/.venv/Scripts/python.exe -m pip install torch==2.14.0 torchvision==0.29.0 pillow==12.3.0 --extra-index-url https://download.pytorch.org/whl/cpu
```

Run: `desktop_version/.venv/Scripts/python.exe -c "import torch, torchvision, PIL, numpy; print(torch.__version__, torchvision.__version__, PIL.__version__, numpy.__version__)"`
Expected: `2.14.0`으로 시작하는 torch 버전, `0.29.0`으로 시작하는 torchvision 버전, `12.3.0`

- [ ] **Step 6: 새 위치·새 가상환경으로 검증**

Run: `PYTHONIOENCODING=utf-8 desktop_version/.venv/Scripts/python.exe "$SP/데스크톱검증.py" desktop_version`
Expected: `정답 498 / 500`(Step 2와 같음)

- [ ] **Step 7: 그림판 창이 뜨는지 확인**

PowerShell에서 실행한다. 5초 뒤에도 프로세스가 살아 있으면 창이 정상적으로 뜬 것이다.

```powershell
$p = Start-Process -PassThru -FilePath "desktop_version\.venv\Scripts\python.exe" -ArgumentList "desktop_version\app.py"; Start-Sleep 5; "종료됨: $($p.HasExited)"; if (-not $p.HasExited) { Stop-Process -Id $p.Id }
```

Expected: `종료됨: False`

- [ ] **Step 8: 옛 루트 가상환경 지우기**

Step 6과 Step 7이 통과한 경우에만 실행한다.

```bash
rm -rf .venv
```

Run: `ls -a | grep -c '^\.venv$'`
Expected: `0`

- [ ] **Step 9: 바탕 화면 바로가기 다시 만들기**

Run: `powershell -ExecutionPolicy Bypass -File desktop_version/create_shortcut.ps1`
Expected: 오류 없이 끝남. 바로가기가 `desktop_version\.venv\Scripts\pythonw.exe`를 가리키는지 확인한다:
`powershell -Command "(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop') + '\손글씨 숫자 인식기.lnk').TargetPath"` → `...\study01_MNIST\desktop_version\.venv\Scripts\pythonw.exe`

- [ ] **Step 10: `desktop_version/README.md` 경로 설명 고치기**

Edit 도구로 다음을 바꾼다.

1. `## 프로젝트 구조` 코드 블록 첫 줄 `study01_MNIST/`를 `desktop_version/`으로 바꾸고, `├── data/ ...` 줄 다음에 다음 줄을 넣는다.
   `├── export_web.py  # 웹 버전(../web_version)용 가중치·테스트 기준값 내보내기`
   (마지막 항목의 `└──`/`├──` 모양이 맞도록 `data/` 줄을 `├──`로, `export_web.py` 줄을 `└──`로 한다.)
2. `## 설치` 바로 아래에 다음 문단을 넣는다.
   `> 아래 명령은 모두 **desktop_version 폴더 안에서** 실행합니다. 웹 버전은 [../web_version](../web_version)을 보세요.`
3. `### 3. 바탕 화면 바로가기 만들기 (선택)`의 마지막 목록 항목 다음에 한 줄을 넣는다.
   `- 저장소를 web_version/desktop_version으로 나눈 뒤에는 바로가기를 한 번 다시 만들어야 합니다.`

- [ ] **Step 11: `desktop_version/CLAUDE.md` 고치기**

Edit 도구로 다음을 바꾼다.

1. `## 개요` 문단 끝에 한 줄을 넣는다.
   `이 폴더는 저장소의 **데스크톱 버전이자 학습·가중치의 원본**입니다. 웹 버전(`../web_version`)은 여기서 내보낸 산출물만 씁니다. 저장소 전체 규칙은 루트 `CLAUDE.md`를 보세요.`
2. `## 명령어` 첫 문장을 다음으로 바꾼다.
   `이 폴더 전용 가상환경 `.venv`(`desktop_version\.venv`)를 사용하고, **모든 명령은 desktop_version 폴더 안에서** 실행합니다. 기본 `python`에는 torch가 없으므로 반드시 venv의 파이썬을 쓰세요.`
3. 명령어 코드 블록에서 `make_icon.py` 줄 다음에 다음 줄을 넣는다.
   `.venv\Scripts\python.exe export_web.py     # ../web_version/model/ 과 ../web_version/tests/fixtures/ 다시 만들기`
4. `## 구조` 목록에서 `train.py`는 …으로 시작하는 항목 끝에 다음 문장을 붙인다.
   ` `train.py`는 `mnist_cnn.pt`와 `./data`를 작업 폴더 기준 상대 경로로 쓰므로 반드시 이 폴더에서 실행하세요.`
5. `## 구조` 목록 맨 끝에 다음 항목을 넣는다.

```markdown
- **`export_web.py`** 는 `app.py`의 `모델_불러오기`·`MNIST형식으로_변환`·정규화 상수를 import해서 웹 버전 파일을 **덮어씁니다**.
  - 배치정규화를 합성곱에 합쳐 `../web_version/model/model.json`, `weights.bin`을 만들고, 합친 모델 출력이 원래 모델과 1e-4 이내인지 스스로 확인합니다.
  - MNIST 테스트 500장과 극단적인 입력 몇 가지로 `../web_version/tests/fixtures/`의 기준값을 만듭니다.
  - `mnist_cnn.pt`, 모델 구조, `MNIST형식으로_변환()`, 정규화 상수 중 하나라도 바꾸면 이 스크립트를 다시 실행하고, `web_version`에서 `node --test`로 확인하세요. 전처리를 바꿨다면 `../web_version/js/preprocess.js`도 같이 고쳐야 합니다.
```

- [ ] **Step 12: 커밋**

```bash
git add -A
git status --short
git commit -q -F - <<'EOF'
기존 데스크톱 코드를 desktop_version 폴더로 이동

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Expected: `git status --short`에 `.venv`, `data`, `__pycache__`가 나오지 않는다(.gitignore). 나오면 커밋하지 말고 멈춘다.

---

### Task 2: 웹용 가중치·테스트 기준값 내보내기 (`export_web.py`)

**Files:**
- Create: `desktop_version/export_web.py`, `.gitattributes`
- Create (생성물): `web_version/model/model.json`, `web_version/model/weights.bin`, `web_version/tests/fixtures/samples.bin`, `web_version/tests/fixtures/preprocessed.bin`, `web_version/tests/fixtures/expected.json`

**Interfaces:**
- Consumes: Task 1의 `app.모델_불러오기`, `app.MNIST형식으로_변환`, `app.MNIST_평균`, `app.MNIST_표준편차`, `app.가중치경로`
- Produces:
  - `model.json`: `{"입력크기": 28, "평균": 0.1307, "표준편차": 0.3081, "원본가중치_sha256": "<12자>", "층": [{"종류": "conv", "가중치": {"모양": [32,1,3,3], "위치": 0, "길이": 288}, "편향": {"모양": [32], "위치": 288, "길이": 32}}, {"종류": "relu"}, …, {"종류": "maxpool"}, …, {"종류": "flatten"}, {"종류": "linear", "가중치": {"모양": [128,3136], …}, "편향": {…}}, …]}`. `위치`와 `길이`의 단위는 **float32 원소 개수**다(바이트가 아님).
  - `weights.bin`: 리틀엔디언 float32. 크기는 (모든 `길이`의 합) × 4바이트다.
  - `samples.bin`: 원본 MNIST 28×28 uint8 × 500(행 우선)
  - `preprocessed.bin`: 파이썬 전처리 결과 28×28 uint8 × 500
  - `expected.json`: `{"개수": 500, "라벨": [int×500], "배치": [[k, dx, dy]×500], "로짓": [[float×10]×500], "파이썬예측": [int×500], "특수경우": {"<이름>": {"사각형": [[x0,y0,x1,y1,값], …], "출력": [int×784]}}}`
  - 280×280 입력 만드는 규칙(번호 i): `k = 5 + i % 6`, `여유 = 280 - 28k + 1`, `dx = (i*37) % 여유`, `dy = (i*53) % 여유`. 원본을 최근접 이웃으로 k배 키워 `[dy, dy+28k) × [dx, dx+28k)`에 붙인다. 나머지는 0이다.
  - 사각형 그림 규칙: 280×280을 0으로 채운 뒤 사각형마다 `y0 ≤ y < y1`, `x0 ≤ x < x1`을 `값`으로 채운다(순서대로 덮어씀).

- [ ] **Step 1: `.gitattributes` 만들기**

```gitattributes
# 생성: YYYY-MM-DD HH:MM KST
# 가중치·테스트 기준값 같은 바이너리 파일은 줄바꿈 변환을 하지 않는다
*.bin binary
```

- [ ] **Step 2: `desktop_version/export_web.py` 작성**

```python
# 생성: YYYY-MM-DD HH:MM KST
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
```

- [ ] **Step 3: 실행**

Run: `cd desktop_version && PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe export_web.py; cd ..`
Expected (숫자는 비슷하면 됨):
```
배치정규화 합치기 확인: 최대 차이 5.xxe-06
가중치 저장: ...\web_version\model (float32 47x,xxx개, 1.8x MB)
기준값 저장: ...\web_version\tests\fixtures (파이썬 정확도 498/500)
```
최대 차이가 1e-4를 넘으면 스크립트가 예외로 멈춘다. 이 경우 커밋하지 말고 보고한다.

- [ ] **Step 4: 생성물 크기 확인**

Run: `ls -l web_version/model web_version/tests/fixtures && node -e "const j=require('./web_version/model/model.json');const n=j.층.flatMap(l=>[l.가중치,l.편향]).filter(Boolean).reduce((a,t)=>a+t.길이,0);console.log(n*4, require('fs').statSync('web_version/model/weights.bin').size)"`
Expected:
- `samples.bin`과 `preprocessed.bin`은 각각 392000바이트
- node가 출력하는 두 수가 같음

- [ ] **Step 5: 커밋**

```bash
git add .gitattributes desktop_version/export_web.py web_version/model web_version/tests/fixtures
git commit -q -F - <<'EOF'
웹 버전용 가중치·테스트 기준값 내보내기 스크립트 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: 순수 JS 추론 모듈 (`model.js`)

**Files:**
- Create: `web_version/package.json`, `web_version/js/model.js`, `web_version/tests/helpers.js`, `web_version/tests/model.test.js`

**Interfaces:**
- Consumes: Task 2의 `model.json`, `weights.bin`, `preprocessed.bin`, `expected.json`
- Produces:
  - `모델_만들기(정보: object, 가중치버퍼: ArrayBuffer) -> { 추론(이미지: Uint8Array|ArrayLike<number> 길이 784) -> Float32Array(10) }`. 가중치 크기가 맞지 않으면 `Error`, 입력 길이가 틀리면 `RangeError`를 던진다.
  - `소프트맥스(로짓: ArrayLike<number>) -> number[]`
  - `helpers.js`: `모델_파일_읽기() -> { 정보, 버퍼 }`, `기준값_읽기() -> { 기대값, 원본들: Buffer, 전처리들: Buffer }`, `최댓값_위치(배열) -> number`

- [ ] **Step 1: `web_version/package.json` 만들기** (JSON이라 생성 주석 없음)

```json
{
  "type": "module"
}
```

- [ ] **Step 2: 테스트 도우미 `web_version/tests/helpers.js` 작성**

```javascript
// 생성: YYYY-MM-DD HH:MM KST
/** 여러 테스트가 함께 쓰는 파일 읽기 도우미. 기준값은 desktop_version/export_web.py가 만든다. */
import { readFileSync } from 'node:fs';

const 경로 = (상대경로) => new URL(상대경로, import.meta.url);

/** model.json과 weights.bin을 읽어 { 정보, 버퍼(ArrayBuffer) }로 돌려준다. */
export function 모델_파일_읽기() {
  const 정보 = JSON.parse(readFileSync(경로('../model/model.json'), 'utf8'));
  const 바이트 = readFileSync(경로('../model/weights.bin'));
  const 버퍼 = 바이트.buffer.slice(바이트.byteOffset, 바이트.byteOffset + 바이트.byteLength);
  return { 정보, 버퍼 };
}

/** expected.json과 28x28 원본·파이썬 전처리 결과 묶음을 읽는다. i번째 이미지는 [i*784, (i+1)*784) 구간이다. */
export function 기준값_읽기() {
  return {
    기대값: JSON.parse(readFileSync(경로('fixtures/expected.json'), 'utf8')),
    원본들: readFileSync(경로('fixtures/samples.bin')),
    전처리들: readFileSync(경로('fixtures/preprocessed.bin')),
  };
}

/** 배열에서 가장 큰 값의 위치(첫 번째)를 돌려준다. */
export function 최댓값_위치(배열) {
  let 최고 = 0;
  for (let i = 1; i < 배열.length; i++) if (배열[i] > 배열[최고]) 최고 = i;
  return 최고;
}
```

- [ ] **Step 3: 실패하는 테스트 `web_version/tests/model.test.js` 작성**

```javascript
// 생성: YYYY-MM-DD HH:MM KST
/** JS 추론이 PyTorch와 같은 로짓을 내는지 확인한다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { 모델_만들기, 소프트맥스 } from '../js/model.js';
import { 모델_파일_읽기, 기준값_읽기 } from './helpers.js';

const { 정보, 버퍼 } = 모델_파일_읽기();

test('파이썬 전처리 입력에 대한 로짓이 PyTorch와 1e-4 이내로 같다', () => {
  const 모델 = 모델_만들기(정보, 버퍼);
  const { 기대값, 전처리들 } = 기준값_읽기();
  let 최대차이 = 0;
  for (let i = 0; i < 기대값.개수; i++) {
    const 로짓 = 모델.추론(전처리들.subarray(i * 784, (i + 1) * 784));
    for (let j = 0; j < 10; j++) {
      최대차이 = Math.max(최대차이, Math.abs(로짓[j] - 기대값.로짓[i][j]));
    }
  }
  assert.ok(최대차이 <= 1e-4, `최대 차이 ${최대차이}`);
});

test('weights.bin 크기가 model.json과 다르면 오류를 낸다', () => {
  assert.throws(() => 모델_만들기(정보, 버퍼.slice(0, 버퍼.byteLength - 4)), /weights\.bin/);
});

test('입력 픽셀 수가 784가 아니면 RangeError를 낸다', () => {
  const 모델 = 모델_만들기(정보, 버퍼);
  assert.throws(() => 모델.추론(new Uint8Array(100)), RangeError);
});

test('소프트맥스는 합이 1이고 큰 값에서도 NaN이 나오지 않는다', () => {
  const 확률 = 소프트맥스([1000, 0, 999]);
  assert.ok(확률.every(Number.isFinite));
  assert.ok(Math.abs(확률.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.ok(확률[0] > 확률[2] && 확률[2] > 확률[1]);
});
```

- [ ] **Step 4: 테스트가 실패하는지 확인**

Run: `cd web_version && node --test tests/model.test.js; cd ..`
Expected: FAIL. `Cannot find module ... js/model.js` 오류가 난다.

- [ ] **Step 5: `web_version/js/model.js` 구현**

```javascript
// 생성: YYYY-MM-DD HH:MM KST
/**
 * 내보낸 CNN(model.json + weights.bin)으로 28x28 숫자 이미지를 추론하는 순수 자바스크립트 모듈.
 * DOM이나 fetch를 쓰지 않으므로 브라우저와 Node 양쪽에서 import할 수 있다.
 * 배치정규화는 desktop_version/export_web.py가 합성곱에 미리 합쳐 두었다.
 * 값은 모두 [채널][세로][가로] 순서의 1차원 배열로 다루며, 계산은 float64로 한다.
 */

/** model.json의 텐서 정보({모양, 위치, 길이})로 weights.bin 안의 Float32Array 조각을 만든다. */
function 텐서_꺼내기(가중치버퍼, 텐서정보) {
  return new Float32Array(가중치버퍼, 텐서정보.위치 * 4, 텐서정보.길이);
}

/** 3x3 합성곱(패딩 1, 보폭 1). 가중치 모양은 [출력채널][입력채널][3][3]. */
function 합성곱(입력, 채널수, 한변, 가중치, 편향, 출력채널수) {
  const 면적 = 한변 * 한변;
  const 출력 = new Float64Array(출력채널수 * 면적);
  for (let o = 0; o < 출력채널수; o++) {
    const 출력시작 = o * 면적;
    출력.fill(편향[o], 출력시작, 출력시작 + 면적);
    for (let c = 0; c < 채널수; c++) {
      const 입력시작 = c * 면적;
      const 커널시작 = (o * 채널수 + c) * 9;
      for (let ky = 0; ky < 3; ky++) {
        const dy = ky - 1;
        // 패딩 부분(0)은 건너뛰도록 유효한 행·열 범위만 돈다
        const y시작 = Math.max(0, -dy);
        const y끝 = Math.min(한변, 한변 - dy);
        for (let kx = 0; kx < 3; kx++) {
          const dx = kx - 1;
          const w = 가중치[커널시작 + ky * 3 + kx];
          const x시작 = Math.max(0, -dx);
          const x끝 = Math.min(한변, 한변 - dx);
          for (let y = y시작; y < y끝; y++) {
            const 입력행 = 입력시작 + (y + dy) * 한변 + dx;
            const 출력행 = 출력시작 + y * 한변;
            for (let x = x시작; x < x끝; x++) 출력[출력행 + x] += w * 입력[입력행 + x];
          }
        }
      }
    }
  }
  return 출력;
}

function 렐루(입력) {
  return 입력.map((값) => (값 > 0 ? 값 : 0));
}

/** 2x2 최대풀링(보폭 2). 한 변 길이가 절반이 된다. */
function 최대풀링(입력, 채널수, 한변) {
  const 새한변 = 한변 / 2;
  const 출력 = new Float64Array(채널수 * 새한변 * 새한변);
  for (let c = 0; c < 채널수; c++) {
    for (let y = 0; y < 새한변; y++) {
      for (let x = 0; x < 새한변; x++) {
        const 왼위 = c * 한변 * 한변 + 2 * y * 한변 + 2 * x;
        출력[(c * 새한변 + y) * 새한변 + x] = Math.max(
          입력[왼위], 입력[왼위 + 1], 입력[왼위 + 한변], 입력[왼위 + 한변 + 1]);
      }
    }
  }
  return 출력;
}

/** 완전연결층. 가중치 모양은 [출력수][입력수]. */
function 완전연결(입력, 가중치, 편향, 출력수) {
  const 입력수 = 입력.length;
  const 출력 = new Float64Array(출력수);
  for (let o = 0; o < 출력수; o++) {
    let 합 = 편향[o];
    const 시작 = o * 입력수;
    for (let i = 0; i < 입력수; i++) 합 += 가중치[시작 + i] * 입력[i];
    출력[o] = 합;
  }
  return 출력;
}

/**
 * model.json 내용(정보)과 weights.bin(ArrayBuffer)으로 추론기를 만든다.
 * 반환값의 추론(이미지)은 28x28 흑백 픽셀(0~255, 검은 배경에 흰 글씨) 784개를 받아 로짓 10개를 돌려준다.
 */
export function 모델_만들기(정보, 가중치버퍼) {
  const 텐서들 = 정보.층.flatMap((층) => [층.가중치, 층.편향]).filter(Boolean);
  const 필요한바이트 = 텐서들.reduce((합, 텐서) => 합 + 텐서.길이, 0) * 4;
  if (가중치버퍼.byteLength !== 필요한바이트) {
    throw new Error(`weights.bin 크기(${가중치버퍼.byteLength}바이트)가 model.json(${필요한바이트}바이트)과 맞지 않습니다. `
      + 'desktop_version/export_web.py로 두 파일을 함께 다시 만들어 주세요.');
  }

  const 층들 = 정보.층.map((층) => ({
    종류: 층.종류,
    모양: 층.가중치 ? 층.가중치.모양 : null,
    가중치: 층.가중치 ? 텐서_꺼내기(가중치버퍼, 층.가중치) : null,
    편향: 층.편향 ? 텐서_꺼내기(가중치버퍼, 층.편향) : null,
  }));
  const 입력크기 = 정보.입력크기;
  const 픽셀수 = 입력크기 * 입력크기;

  function 추론(이미지) {
    if (이미지.length !== 픽셀수) {
      throw new RangeError(`입력은 ${입력크기}x${입력크기}=${픽셀수}개 픽셀이어야 합니다 (받은 개수: ${이미지.length})`);
    }
    // 학습 때와 같은 정규화: (픽셀/255 − 평균) / 표준편차
    let 값 = Float64Array.from(이미지, (픽셀) => (픽셀 / 255 - 정보.평균) / 정보.표준편차);
    let 채널수 = 1;
    let 한변 = 입력크기;
    for (const 층 of 층들) {
      switch (층.종류) {
        case 'conv':
          값 = 합성곱(값, 채널수, 한변, 층.가중치, 층.편향, 층.모양[0]);
          채널수 = 층.모양[0];
          break;
        case 'relu':
          값 = 렐루(값);
          break;
        case 'maxpool':
          값 = 최대풀링(값, 채널수, 한변);
          한변 /= 2;
          break;
        case 'flatten':
          break; // 이미 [채널][세로][가로] 순서의 1차원 배열이라 PyTorch Flatten과 순서가 같다
        case 'linear':
          값 = 완전연결(값, 층.가중치, 층.편향, 층.모양[0]);
          break;
        default:
          throw new Error(`알 수 없는 층 종류입니다: ${층.종류}`);
      }
    }
    return Float32Array.from(값);
  }

  return { 추론 };
}

/** 로짓을 확률로 바꾼다. 가장 큰 값을 빼고 계산해 지수 넘침을 막는다. */
export function 소프트맥스(로짓) {
  const 최대 = Math.max(...로짓);
  const 지수들 = Array.from(로짓, (값) => Math.exp(값 - 최대));
  const 합 = 지수들.reduce((a, b) => a + b, 0);
  return 지수들.map((값) => 값 / 합);
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd web_version && node --test tests/model.test.js; cd ..`
Expected: `# pass 4`, `# fail 0`. 첫 테스트는 500장 추론이라 수 초에서 수십 초 걸릴 수 있다. 1분을 넘으면 보고한다.

- [ ] **Step 7: 커밋**

```bash
git add web_version/package.json web_version/js/model.js web_version/tests/helpers.js web_version/tests/model.test.js
git commit -q -F - <<'EOF'
웹 버전 순수 자바스크립트 추론 모듈과 PyTorch 일치 테스트 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: 순수 JS 전처리 모듈 (`preprocess.js`)과 전체 흐름 테스트

**Files:**
- Create: `web_version/js/preprocess.js`, `web_version/tests/preprocess.test.js`, `web_version/tests/end_to_end.test.js`
- Modify: `web_version/tests/helpers.js`(함수 두 개 추가)

**Interfaces:**
- Consumes: Task 2의 fixture 규칙(280×280 입력 만들기, 사각형 그림), Task 3의 `모델_만들기`, `helpers.js`
- Produces:
  - `MNIST형식으로_변환(흑백: ArrayLike<number> 길이 너비*높이, 너비: number, 높이: number) -> Uint8Array(784) | null`. 길이가 틀리면 `RangeError`.
  - `파이썬반올림(x: number) -> number`, `경계상자(흑백, 너비, 높이) -> [왼, 위, 오른, 아래] | null`(오른·아래는 미포함)
  - `helpers.js`: `큰_그림_만들기(원본들: Buffer, 번호: number, 배치: [k, dx, dy]) -> Uint8Array(78400)`, `사각형_그림_만들기(사각형들) -> Uint8Array(78400)`

- [ ] **Step 1: `helpers.js`에 입력 생성 함수 추가**

Edit 도구로 `helpers.js` 끝에 다음을 붙인다.

```javascript

/** 28x28 원본을 [k, dx, dy] 규칙대로 최근접 이웃으로 k배 키워 280x280에 붙인다(export_web.py와 같은 규칙). */
export function 큰_그림_만들기(원본들, 번호, [k, dx, dy]) {
  const 큰 = new Uint8Array(280 * 280);
  const 시작 = 번호 * 784;
  for (let y = 0; y < 28 * k; y++) {
    for (let x = 0; x < 28 * k; x++) {
      큰[(dy + y) * 280 + dx + x] = 원본들[시작 + Math.floor(y / k) * 28 + Math.floor(x / k)];
    }
  }
  return 큰;
}

/** [x0, y0, x1, y1, 값] 사각형들을 280x280 검은 배경에 순서대로 채운다(끝은 미포함). */
export function 사각형_그림_만들기(사각형들) {
  const 그림 = new Uint8Array(280 * 280);
  for (const [x0, y0, x1, y1, 값] of 사각형들) {
    for (let y = y0; y < y1; y++) 그림.fill(값, y * 280 + x0, y * 280 + x1);
  }
  return 그림;
}
```

- [ ] **Step 2: 실패하는 테스트 `web_version/tests/preprocess.test.js` 작성**

```javascript
// 생성: YYYY-MM-DD HH:MM KST
/** JS 전처리가 파이썬(app.py의 MNIST형식으로_변환)과 픽셀 단위로 같은지 확인한다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MNIST형식으로_변환, 파이썬반올림, 경계상자 } from '../js/preprocess.js';
import { 기준값_읽기, 큰_그림_만들기, 사각형_그림_만들기 } from './helpers.js';

const { 기대값, 원본들, 전처리들 } = 기준값_읽기();

test('파이썬반올림은 .5를 짝수 쪽으로 반올림한다', () => {
  const 경우들 = [[0.5, 0], [1.5, 2], [2.5, 2], [3.5, 4], [-0.5, 0], [-1.5, -2], [2.4, 2], [2.6, 3], [-2.6, -3]];
  for (const [입력, 기대] of 경우들) assert.equal(파이썬반올림(입력), 기대, `입력 ${입력}`);
});

test('경계상자는 0이 아닌 픽셀을 감싸고 오른쪽·아래는 포함하지 않는다', () => {
  const 그림 = new Uint8Array(5 * 4); // 너비 5, 높이 4
  그림[1 * 5 + 1] = 10;
  그림[2 * 5 + 3] = 255;
  assert.deepEqual(경계상자(그림, 5, 4), [1, 1, 4, 3]);
  assert.equal(경계상자(new Uint8Array(20), 5, 4), null);
});

test('아무것도 그리지 않으면 null을 돌려준다', () => {
  assert.equal(MNIST형식으로_변환(new Uint8Array(280 * 280), 280, 280), null);
});

test('입력 길이가 너비×높이와 다르면 RangeError를 낸다', () => {
  assert.throws(() => MNIST형식으로_변환(new Uint8Array(10), 280, 280), RangeError);
});

test('MNIST 500장의 99% 이상이 파이썬 전처리와 픽셀 단위로 완전히 같다', () => {
  const 다른번호들 = [];
  for (let i = 0; i < 기대값.개수; i++) {
    const 결과 = MNIST형식으로_변환(큰_그림_만들기(원본들, i, 기대값.배치[i]), 280, 280);
    const 기대 = 전처리들.subarray(i * 784, (i + 1) * 784);
    if (!결과.every((값, j) => 값 === 기대[j])) 다른번호들.push(i);
  }
  const 같은수 = 기대값.개수 - 다른번호들.length;
  assert.ok(같은수 >= 기대값.개수 * 0.99, `같은 것 ${같은수}/${기대값.개수}, 다른 번호: ${다른번호들.slice(0, 10)}`);
});

for (const [이름, { 사각형, 출력 }] of Object.entries(기대값.특수경우)) {
  test(`극단적인 입력 '${이름}'도 파이썬 전처리와 완전히 같다`, () => {
    const 결과 = MNIST형식으로_변환(사각형_그림_만들기(사각형), 280, 280);
    assert.deepEqual(Array.from(결과), 출력);
  });
}
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `cd web_version && node --test tests/preprocess.test.js; cd ..`
Expected: FAIL. `Cannot find module ... js/preprocess.js` 오류가 난다.

- [ ] **Step 4: `web_version/js/preprocess.js` 구현**

이 코드는 계획을 쓸 때 scratchpad 프로토타입으로 검증했다. MNIST 500장과 극단적인 입력 6가지 모두 파이썬과 최대 차이 0이었다.

```javascript
// 생성: YYYY-MM-DD HH:MM KST
/**
 * 그림판 이미지를 MNIST 형식(28x28)으로 바꾸는 순수 자바스크립트 모듈.
 * desktop_version/app.py의 MNIST형식으로_변환()과 픽셀 단위로 같은 결과를 내도록,
 * Pillow의 Lanczos 축소(고정소수점 정수 연산)와 파이썬 round()의 짝수 반올림을 그대로 옮겼다.
 * app.py의 전처리를 바꾸면 이 파일도 같이 고치고 desktop_version/export_web.py로 기준값을 다시 만든다.
 */

const 정밀도비트 = 22; // Pillow Resample.c의 PRECISION_BITS (32 - 8 - 2)
const 결과크기 = 28;
const 숫자크기 = 20; // 긴 변을 이 길이로 맞춘다(MNIST 방식)

/** 파이썬 round()처럼 .5는 짝수 쪽으로 반올림한다(0.5 → 0, 1.5 → 2, 2.5 → 2). */
export function 파이썬반올림(x) {
  const 내림 = Math.floor(x);
  const 차 = x - 내림;
  if (차 > 0.5) return 내림 + 1;
  if (차 < 0.5) return 내림;
  return 내림 % 2 === 0 ? 내림 : 내림 + 1;
}

/** 0이 아닌 픽셀을 감싸는 [왼, 위, 오른, 아래]를 돌려준다(오른·아래는 미포함, PIL getbbox와 같음). 없으면 null. */
export function 경계상자(흑백, 너비, 높이) {
  let 왼 = 너비;
  let 위 = 높이;
  let 오른 = -1;
  let 아래 = -1;
  for (let y = 0; y < 높이; y++) {
    for (let x = 0; x < 너비; x++) {
      if (흑백[y * 너비 + x] !== 0) {
        if (x < 왼) 왼 = x;
        if (x > 오른) 오른 = x;
        if (y < 위) 위 = y;
        if (y > 아래) 아래 = y;
      }
    }
  }
  return 오른 < 0 ? null : [왼, 위, 오른 + 1, 아래 + 1];
}

function 싱크(x) {
  if (x === 0) return 1;
  const 각 = x * Math.PI;
  return Math.sin(각) / 각;
}

/** Pillow의 Lanczos 필터(a = 3). */
function 란초스(x) {
  return -3 <= x && x < 3 ? 싱크(x) * 싱크(x / 3) : 0;
}

/** 출력 픽셀마다 읽을 입력 범위의 시작과 정수 계수를 구한다(Pillow precompute_coeffs + normalize_coeffs_8bpc). */
function 계수_계산(입력길이, 출력길이) {
  const 배율 = 입력길이 / 출력길이;
  const 필터배율 = Math.max(배율, 1);
  const 지지범위 = 3 * 필터배율;
  const 목록 = [];
  for (let 출력위치 = 0; 출력위치 < 출력길이; 출력위치++) {
    const 중심 = (출력위치 + 0.5) * 배율;
    // C의 (int) 변환은 0 쪽으로 자르므로 Math.trunc를 쓴다
    const 시작 = Math.max(Math.trunc(중심 - 지지범위 + 0.5), 0);
    const 끝 = Math.min(Math.trunc(중심 + 지지범위 + 0.5), 입력길이);
    const 실수계수 = [];
    let 합 = 0;
    for (let x = 시작; x < 끝; x++) {
      const w = 란초스((x - 중심 + 0.5) / 필터배율);
      실수계수.push(w);
      합 += w;
    }
    const 정수계수 = 실수계수.map((w) => {
      const 정규 = 합 !== 0 ? w / 합 : w;
      const 값 = 정규 * (1 << 정밀도비트);
      return 정규 < 0 ? Math.trunc(-0.5 + 값) : Math.trunc(0.5 + 값);
    });
    목록.push({ 시작, 정수계수 });
  }
  return 목록;
}

/** 고정소수점 누적값을 0~255로 자른다(Pillow clip8). */
function 자르기8(누적) {
  if (누적 >= 2 ** (정밀도비트 + 8)) return 255;
  if (누적 <= 0) return 0;
  return Math.floor(누적 / 2 ** 정밀도비트);
}

/** Pillow Image.resize(LANCZOS)와 같은 결과를 낸다. 가로 방향을 먼저, 세로 방향을 나중에 처리하고 크기가 같은 방향은 건너뛴다. */
function 란초스_크기변경(흑백, 너비, 높이, 새너비, 새높이) {
  let 현재 = 흑백;
  let 현재너비 = 너비;
  if (새너비 !== 너비) {
    const 계수들 = 계수_계산(너비, 새너비);
    const 출력 = new Uint8Array(새너비 * 높이);
    for (let y = 0; y < 높이; y++) {
      for (let x = 0; x < 새너비; x++) {
        const { 시작, 정수계수 } = 계수들[x];
        let 누적 = 1 << (정밀도비트 - 1);
        for (let i = 0; i < 정수계수.length; i++) 누적 += 현재[y * 현재너비 + 시작 + i] * 정수계수[i];
        출력[y * 새너비 + x] = 자르기8(누적);
      }
    }
    현재 = 출력;
    현재너비 = 새너비;
  }
  if (새높이 !== 높이) {
    const 계수들 = 계수_계산(높이, 새높이);
    const 출력 = new Uint8Array(현재너비 * 새높이);
    for (let y = 0; y < 새높이; y++) {
      const { 시작, 정수계수 } = 계수들[y];
      for (let x = 0; x < 현재너비; x++) {
        let 누적 = 1 << (정밀도비트 - 1);
        for (let i = 0; i < 정수계수.length; i++) 누적 += 현재[(시작 + i) * 현재너비 + x] * 정수계수[i];
        출력[y * 현재너비 + x] = 자르기8(누적);
      }
    }
    현재 = 출력;
  }
  return 현재;
}

/**
 * 그림판 흑백 이미지(검은 배경에 흰 글씨, 0~255)를 MNIST와 같은 28x28 이미지로 바꾼다.
 * 숫자 영역 자르기 → 긴 변을 20px로 Lanczos 축소 → 28x28 가운데 배치 → 무게중심을 (14, 14)로 이동.
 * 그린 것이 없으면 null을 돌려준다. 정규화는 model.js가 한다.
 */
export function MNIST형식으로_변환(흑백, 너비, 높이) {
  if (흑백.length !== 너비 * 높이) {
    throw new RangeError(`흑백 배열 길이(${흑백.length})가 ${너비}x${높이}와 맞지 않습니다`);
  }

  // 1) 숫자가 그려진 영역만 잘라내기
  const 상자 = 경계상자(흑백, 너비, 높이);
  if (상자 === null) return null;
  const [왼, 위, 오른, 아래] = 상자;
  const 가로 = 오른 - 왼;
  const 세로 = 아래 - 위;
  const 잘린것 = new Uint8Array(가로 * 세로);
  for (let y = 0; y < 세로; y++) {
    for (let x = 0; x < 가로; x++) 잘린것[y * 가로 + x] = 흑백[(위 + y) * 너비 + 왼 + x];
  }

  // 2) 가로세로 비율을 유지하면서 긴 변이 20픽셀이 되도록 크기 바꾸기
  const 배율 = 숫자크기 / Math.max(가로, 세로);
  const 새가로 = Math.max(1, 파이썬반올림(가로 * 배율));
  const 새세로 = Math.max(1, 파이썬반올림(세로 * 배율));
  const 숫자 = 란초스_크기변경(잘린것, 가로, 세로, 새가로, 새세로);

  // 3) 28x28 검은 배경의 가운데에 붙이기
  const 가운데 = new Uint8Array(결과크기 * 결과크기);
  const 붙일x = Math.floor((결과크기 - 새가로) / 2);
  const 붙일y = Math.floor((결과크기 - 새세로) / 2);
  for (let y = 0; y < 새세로; y++) {
    for (let x = 0; x < 새가로; x++) 가운데[(붙일y + y) * 결과크기 + 붙일x + x] = 숫자[y * 새가로 + x];
  }

  // 4) 무게중심이 정확히 중앙(14, 14)에 오도록 정수만큼 평행 이동
  let 전체 = 0;
  let 합x = 0;
  let 합y = 0;
  for (let y = 0; y < 결과크기; y++) {
    for (let x = 0; x < 결과크기; x++) {
      const 값 = 가운데[y * 결과크기 + x];
      전체 += 값;
      합x += x * 값;
      합y += y * 값;
    }
  }
  if (전체 === 0) return 가운데;
  const 이동x = 파이썬반올림(14 - 합x / 전체);
  const 이동y = 파이썬반올림(14 - 합y / 전체);
  const 결과 = new Uint8Array(결과크기 * 결과크기);
  for (let y = 0; y < 결과크기; y++) {
    for (let x = 0; x < 결과크기; x++) {
      const 원래x = x - 이동x;
      const 원래y = y - 이동y;
      if (원래x >= 0 && 원래x < 결과크기 && 원래y >= 0 && 원래y < 결과크기) {
        결과[y * 결과크기 + x] = 가운데[원래y * 결과크기 + 원래x];
      }
    }
  }
  return 결과;
}
```

- [ ] **Step 5: 전처리 테스트 통과 확인**

Run: `cd web_version && node --test tests/preprocess.test.js; cd ..`
Expected: `# pass 11`(단위 4 + MNIST 1 + 특수경우 6), `# fail 0`

- [ ] **Step 6: 전체 흐름 테스트 `web_version/tests/end_to_end.test.js` 작성**

```javascript
// 생성: YYYY-MM-DD HH:MM KST
/** 280x280 입력 → JS 전처리 → JS 추론의 정확도와 파이썬과의 일치율을 확인한다("동작은 하지만 인식률이 낮은" 상태를 잡는다). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MNIST형식으로_변환 } from '../js/preprocess.js';
import { 모델_만들기 } from '../js/model.js';
import { 모델_파일_읽기, 기준값_읽기, 큰_그림_만들기, 최댓값_위치 } from './helpers.js';

test('MNIST 500장 정확도 98% 이상, 파이썬 예측과 99% 이상 일치', () => {
  const { 정보, 버퍼 } = 모델_파일_읽기();
  const 모델 = 모델_만들기(정보, 버퍼);
  const { 기대값, 원본들 } = 기준값_읽기();
  let 정답수 = 0;
  let 일치수 = 0;
  for (let i = 0; i < 기대값.개수; i++) {
    const 이미지 = MNIST형식으로_변환(큰_그림_만들기(원본들, i, 기대값.배치[i]), 280, 280);
    const 예측 = 최댓값_위치(모델.추론(이미지));
    if (예측 === 기대값.라벨[i]) 정답수++;
    if (예측 === 기대값.파이썬예측[i]) 일치수++;
  }
  const 정확도 = 정답수 / 기대값.개수;
  const 일치율 = 일치수 / 기대값.개수;
  assert.ok(정확도 >= 0.98, `정확도 ${정답수}/${기대값.개수}`);
  assert.ok(일치율 >= 0.99, `파이썬과 일치 ${일치수}/${기대값.개수}`);
});
```

- [ ] **Step 7: 전체 테스트 통과 확인**

Run: `cd web_version && node --test; cd ..`
Expected: `# pass 16`(model 4 + preprocess 11 + end_to_end 1), `# fail 0`

- [ ] **Step 8: 커밋**

```bash
git add web_version/js/preprocess.js web_version/tests/helpers.js web_version/tests/preprocess.test.js web_version/tests/end_to_end.test.js
git commit -q -F - <<'EOF'
웹 버전 순수 자바스크립트 전처리 모듈과 파이썬 일치·전체 흐름 테스트 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: 웹 화면 (`index.html`, `style.css`, `app.js`)

**Files:**
- Create: `web_version/index.html`, `web_version/style.css`, `web_version/js/app.js`

**Interfaces:**
- Consumes: Task 3 `모델_만들기`, `소프트맥스` / Task 4 `MNIST형식으로_변환`. 모델 파일은 문서 기준 상대 경로 `model/model.json`, `model/weights.bin`에서 읽는다.
- Produces: `web_version/`을 정적 서버로 띄우면 동작하는 화면

- [ ] **Step 1: `web_version/index.html` 작성** (생성 주석은 `<!DOCTYPE html>` 다음 줄)

```html
<!DOCTYPE html>
<!-- 생성: YYYY-MM-DD HH:MM KST -->
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>손글씨 숫자 인식기</title>
  <link rel="stylesheet" href="style.css">
  <script type="module" src="js/app.js"></script>
</head>
<body>
  <main class="앱">
    <h1>손글씨 숫자 인식기</h1>
    <p class="설명">MNIST로 학습한 CNN이 브라우저 안에서 순수 자바스크립트로 인식합니다. 그린 그림은 기기 밖으로 나가지 않습니다.</p>

    <div class="본문">
      <section class="그림판영역">
        <p class="제목">여기에 숫자 하나를 그려 주세요</p>
        <canvas id="그림판" width="280" height="280" aria-label="숫자를 그리는 그림판"></canvas>
        <div class="버튼줄">
          <button id="지우기버튼" type="button">지우기</button>
          <button id="인식버튼" type="button" disabled>인식하기</button>
        </div>
      </section>

      <section class="결과영역" aria-live="polite">
        <p class="제목">인식 결과</p>
        <div id="예측숫자" class="예측숫자">?</div>
        <p id="확신도" class="확신도">확신도: -</p>
        <ol id="확률막대" class="확률막대"></ol>
        <p class="제목 작게">모델 입력(28x28)</p>
        <canvas id="미리보기" width="28" height="28" aria-label="모델에 들어간 28x28 이미지"></canvas>
      </section>
    </div>

    <p id="상태" class="상태">모델 불러오는 중…</p>
  </main>
</body>
</html>
```

- [ ] **Step 2: `web_version/style.css` 작성**

```css
/* 생성: YYYY-MM-DD HH:MM KST */
/* 손글씨 숫자 인식기 화면 스타일. 색은 :root 변수로 두고 어두운 화면 설정에서 바꾼다. */
:root {
  --배경: #f6f7f9;
  --면: #ffffff;
  --글자: #1d2330;
  --흐린글자: #5b6475;
  --선: #d5d9e0;
  --강조: #2b7de9;
  --옅은강조: #9bbce8;
  --막대바탕: #eceff3;
  --오류: #c62828;
}

@media (prefers-color-scheme: dark) {
  :root {
    --배경: #14171c;
    --면: #1d2129;
    --글자: #e7eaf0;
    --흐린글자: #9aa3b2;
    --선: #353b46;
    --강조: #5a9cf0;
    --옅은강조: #3f5f8a;
    --막대바탕: #2a2f38;
    --오류: #ef7b7b;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--배경);
  color: var(--글자);
  font-family: "맑은 고딕", "Malgun Gothic", system-ui, sans-serif;
}

.앱 { max-width: 720px; margin: 0 auto; padding: 24px 16px; }
h1 { font-size: 1.4rem; margin: 0 0 4px; }
.설명 { margin: 0 0 20px; color: var(--흐린글자); font-size: 0.9rem; }
.제목 { margin: 0 0 6px; font-size: 0.95rem; }
.작게 { margin-top: 12px; font-size: 0.8rem; color: var(--흐린글자); }

/* 좁은 화면에서는 결과 영역이 그림판 아래로 내려간다 */
.본문 { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
.그림판영역 { flex: 0 1 280px; min-width: 0; }
.결과영역 { flex: 1 1 240px; min-width: 0; }

/* 내부 해상도는 항상 280x280이고 화면에서는 폭에 맞춰 줄어든다.
   테두리(border)는 좌표 계산을 어긋나게 하므로 outline을 쓴다. */
#그림판 {
  display: block;
  width: 100%;
  max-width: 280px;
  height: auto;
  aspect-ratio: 1;
  background: #000;
  outline: 1px solid var(--선);
  touch-action: none;
  cursor: crosshair;
}

.버튼줄 { display: flex; justify-content: space-between; max-width: 280px; margin-top: 8px; }

button {
  font: inherit;
  padding: 6px 18px;
  border: 1px solid var(--선);
  border-radius: 6px;
  background: var(--면);
  color: var(--글자);
  cursor: pointer;
}
button:disabled { opacity: 0.5; cursor: default; }

.예측숫자 { font-size: 64px; font-weight: 700; line-height: 1.1; }
.확신도 { margin: 0 0 8px; font-size: 0.9rem; }

.확률막대 { list-style: none; margin: 0; padding: 0; max-width: 260px; }
.확률막대 li {
  display: grid;
  grid-template-columns: 16px 1fr 40px;
  gap: 6px;
  align-items: center;
  height: 20px;
  font-size: 0.85rem;
}
.막대 { height: 12px; border-radius: 2px; background: var(--막대바탕); overflow: hidden; }
.채움 { display: block; height: 100%; width: 0; background: var(--옅은강조); }
.최고 .채움 { background: var(--강조); }
.퍼센트 { text-align: right; color: var(--흐린글자); font-variant-numeric: tabular-nums; }

#미리보기 { display: block; width: 112px; height: 112px; background: #000; image-rendering: pixelated; }

.상태 { margin: 16px 0 0; color: var(--흐린글자); }
.상태:empty { display: none; }
.상태.오류 { color: var(--오류); }
```

- [ ] **Step 3: `web_version/js/app.js` 작성**

```javascript
// 생성: YYYY-MM-DD HH:MM KST
/**
 * 그림판 화면: 마우스·터치로 그린 숫자를 브라우저 안에서 인식해 결과를 보여 준다.
 * 인식은 preprocess.js(전처리)와 model.js(추론)가 하고, 이 파일은 입력과 화면 갱신만 맡는다.
 */
import { MNIST형식으로_변환 } from './preprocess.js';
import { 모델_만들기, 소프트맥스 } from './model.js';

const 붓두께 = 18; // desktop_version/app.py의 붓두께와 같다

const 그림판 = document.getElementById('그림판');
const 붓 = 그림판.getContext('2d', { willReadFrequently: true });
const 미리보기 = document.getElementById('미리보기');
const 미리보기붓 = 미리보기.getContext('2d');
const 지우기버튼 = document.getElementById('지우기버튼');
const 인식버튼 = document.getElementById('인식버튼');
const 예측숫자 = document.getElementById('예측숫자');
const 확신도 = document.getElementById('확신도');
const 확률막대 = document.getElementById('확률막대');
const 상태 = document.getElementById('상태');

let 모델 = null;
let 이전좌표 = null;

// ----- 확률 막대(0~9) 만들기 -----
const 막대들 = [];
for (let 숫자 = 0; 숫자 < 10; 숫자++) {
  const 항목 = document.createElement('li');
  항목.innerHTML = `<span>${숫자}</span><span class="막대"><span class="채움"></span></span><span class="퍼센트">0%</span>`;
  확률막대.append(항목);
  막대들.push({ 항목, 채움: 항목.querySelector('.채움'), 퍼센트: 항목.querySelector('.퍼센트') });
}

function 막대_그리기(확률, 최고) {
  확률.forEach((값, i) => {
    막대들[i].채움.style.width = `${값 * 100}%`;
    막대들[i].퍼센트.textContent = `${Math.round(값 * 100)}%`;
    막대들[i].항목.classList.toggle('최고', i === 최고);
  });
}

// ----- 그림판 -----
function 그림판_비우기() {
  붓.fillStyle = '#000';
  붓.fillRect(0, 0, 그림판.width, 그림판.height);
  붓.fillStyle = '#fff';
  붓.strokeStyle = '#fff';
  붓.lineWidth = 붓두께;
  붓.lineCap = 'round';
  붓.lineJoin = 'round';
}

function 미리보기_비우기() {
  미리보기붓.fillStyle = '#000';
  미리보기붓.fillRect(0, 0, 28, 28);
}

/** 화면 좌표를 캔버스 내부 좌표(280x280)로 바꾼다. 좁은 화면에서 CSS로 줄어든 경우를 보정한다. */
function 캔버스좌표(이벤트) {
  const 사각형 = 그림판.getBoundingClientRect();
  return [
    (이벤트.clientX - 사각형.left) * (그림판.width / 사각형.width),
    (이벤트.clientY - 사각형.top) * (그림판.height / 사각형.height),
  ];
}

/** 선의 끝과 이음새가 둥글게 보이도록 원을 찍는다. */
function 점찍기([x, y]) {
  붓.beginPath();
  붓.arc(x, y, 붓두께 / 2, 0, Math.PI * 2);
  붓.fill();
}

function 선긋기([x1, y1], [x2, y2]) {
  붓.beginPath();
  붓.moveTo(x1, y1);
  붓.lineTo(x2, y2);
  붓.stroke();
}

그림판.addEventListener('pointerdown', (이벤트) => {
  if (이벤트.button !== 0) return; // 왼쪽 버튼(터치·펜 포함)만 그린다
  이벤트.preventDefault();
  그림판.setPointerCapture(이벤트.pointerId);
  이전좌표 = 캔버스좌표(이벤트);
  점찍기(이전좌표);
});

그림판.addEventListener('pointermove', (이벤트) => {
  if (이전좌표 === null) return;
  const 현재좌표 = 캔버스좌표(이벤트);
  선긋기(이전좌표, 현재좌표);
  점찍기(현재좌표);
  이전좌표 = 현재좌표;
});

function 그리기_끝() {
  if (이전좌표 === null) return;
  이전좌표 = null;
  인식(); // 획을 하나 그을 때마다 자동으로 인식
}
그림판.addEventListener('pointerup', 그리기_끝);
그림판.addEventListener('pointercancel', 그리기_끝);

// ----- 인식과 결과 표시 -----
function 인식() {
  if (모델 === null) return; // 모델을 불러오기 전이면 무시한다(불러온 뒤 한 번 인식한다)
  const 픽셀 = 붓.getImageData(0, 0, 그림판.width, 그림판.height).data;
  const 흑백 = new Uint8Array(그림판.width * 그림판.height);
  for (let i = 0; i < 흑백.length; i++) 흑백[i] = 픽셀[i * 4]; // 흰 글씨라 빨강 채널 = 밝기
  const 이미지 = MNIST형식으로_변환(흑백, 그림판.width, 그림판.height);
  if (이미지 === null) return;

  const 확률 = 소프트맥스(모델.추론(이미지));
  const 예측 = 확률.indexOf(Math.max(...확률));
  예측숫자.textContent = String(예측);
  확신도.textContent = `확신도: ${(확률[예측] * 100).toFixed(1)}%`;
  막대_그리기(확률, 예측);
  미리보기_갱신(이미지);
}

/** 모델에 들어간 28x28 이미지를 보여 준다(CSS로 4배 확대, 흐림 없이). */
function 미리보기_갱신(이미지) {
  const 데이터 = 미리보기붓.createImageData(28, 28);
  for (let i = 0; i < 이미지.length; i++) {
    데이터.data[i * 4] = 이미지[i];
    데이터.data[i * 4 + 1] = 이미지[i];
    데이터.data[i * 4 + 2] = 이미지[i];
    데이터.data[i * 4 + 3] = 255;
  }
  미리보기붓.putImageData(데이터, 0, 0);
}

function 지우기() {
  그림판_비우기();
  미리보기_비우기();
  예측숫자.textContent = '?';
  확신도.textContent = '확신도: -';
  막대_그리기(new Array(10).fill(0), -1);
}

지우기버튼.addEventListener('click', 지우기);
인식버튼.addEventListener('click', 인식);
document.addEventListener('keydown', (이벤트) => {
  if (이벤트.key === 'Escape') 지우기();
});

// ----- 모델 불러오기 -----
async function 모델_불러오기() {
  // 문서 기준 상대 경로라 GitHub Pages처럼 하위 경로에 올려도 동작한다
  const [정보응답, 가중치응답] = await Promise.all([fetch('model/model.json'), fetch('model/weights.bin')]);
  if (!정보응답.ok || !가중치응답.ok) {
    throw new Error(`모델 파일을 받지 못했습니다 (HTTP ${정보응답.status}, ${가중치응답.status})`);
  }
  return 모델_만들기(await 정보응답.json(), await 가중치응답.arrayBuffer());
}

지우기();
모델_불러오기()
  .then((불러온모델) => {
    모델 = 불러온모델;
    인식버튼.disabled = false;
    상태.textContent = '';
    인식(); // 불러오는 동안 그려 둔 것이 있으면 바로 인식한다
  })
  .catch((오류) => {
    상태.classList.add('오류');
    상태.textContent = location.protocol === 'file:'
      ? 'index.html 파일을 직접 열면 모델을 불러올 수 없습니다. web_version 폴더에서 python -m http.server 를 실행한 뒤 http://localhost:8000 으로 열어 주세요.'
      : `모델을 불러오지 못했습니다: ${오류.message}`;
  });
```

- [ ] **Step 4: 로컬 서버 띄우기**

Bash `run_in_background`로 실행한다. 이 서버는 Task 5가 끝날 때 멈춘다.

Run: `cd /c/Users/tlsdn/study01_MNIST/web_version && /c/ProgramData/Anaconda3/python.exe -m http.server 8000 --bind 127.0.0.1`

- [ ] **Step 5: 브라우저에서 기본 동작 확인** (built-in browser, `anthropic-skills:built-in-browser` 스킬을 먼저 읽는다)

1. `http://127.0.0.1:8000/`을 연다. `read_console_messages`에서 오류가 없는지 본다. `get_page_text`에 "모델 불러오는 중"이 **없는지**도 확인한다(불러오기 완료).
2. 스크린샷을 찍어 그림판 위치를 확인한다. 그림판 가운데 부근을 위에서 아래로 `left_click_drag`해 세로선을 그린다. `예측숫자`가 `1`이고 막대 10개 중 하나가 강조되며, 미리보기에 세로선이 보여야 한다.
3. `지우기` 버튼을 누른다. `예측숫자`가 `?`로 돌아와야 한다.
4. 가로선(위쪽) 하나와, 가로선 오른쪽 끝에서 왼쪽 아래로 가는 사선을 차례로 드래그해 `7`을 그린다. 결과가 `7`이어야 한다. 아니라면 스크린샷과 미리보기 이미지를 보고하고 멈춘다(자동 테스트로 잡을 수 없는 안티앨리어싱 차이일 수 있다).
5. `Esc` 키를 누르면 지워지는지 확인한다.

- [ ] **Step 6: 좁은 화면 좌표 확인** (Review Focus 4)

1. `resize_window`로 폭 300, 높이 800을 지정하고 새로고침한다. 그림판 표시 크기가 280보다 작아진다(300 − 좌우 여백 32 = 268).
2. 스크린샷으로 그림판 위치를 확인한다. 그림판 **왼쪽 1/4 지점**을 세로로 드래그한다.
3. `javascript_tool`로 흰 픽셀의 가로 무게중심을 구한다:
   ```javascript
   const c = document.getElementById('그림판'); const d = c.getContext('2d').getImageData(0, 0, 280, 280).data;
   let s = 0, n = 0; for (let i = 0; i < 280 * 280; i++) if (d[i * 4] > 128) { s += i % 280; n++; }
   ({ 표시너비: c.getBoundingClientRect().width, 무게중심x: s / n })
   ```
   `표시너비`는 280보다 작아야 하고, `무게중심x`는 약 70(= 280 × 1/4, ±15)이어야 한다. 비율 보정이 빠지면 더 왼쪽으로 치우친다.
4. 결과 영역이 그림판 **아래**에 있는지 스크린샷으로 확인한다.
5. `resize_window` preset `desktop`으로 되돌린다.

- [ ] **Step 7: 모델 불러오기 전 동작 확인** (Review Focus 5)

`javascript_tool`로 `fetch`를 늦춘 상태를 흉내 낼 수는 없으므로, 코드로 확인한다.
- `인식()`은 첫 줄에서 `모델 === null`이면 반환한다.
- `인식버튼`은 HTML에서 `disabled`로 시작하고, 불러오기 성공 뒤에만 풀린다.
- 성공 콜백이 `인식()`을 한 번 부른다.

`read_console_messages`로 지금까지 오류가 하나도 없었는지 다시 확인한다.

- [ ] **Step 8: 서버 멈추기, 커밋**

백그라운드 서버를 멈춘다.

```bash
git add web_version/index.html web_version/style.css web_version/js/app.js
git commit -q -F - <<'EOF'
웹 버전 그림판 화면 추가 (마우스·터치 입력, 결과·확률 막대·28x28 미리보기)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: 문서 (`web_version/CLAUDE.md`, 루트 `CLAUDE.md`·`README.md`)와 최종 확인

**Files:**
- Create: `web_version/CLAUDE.md`, `CLAUDE.md`(루트), `README.md`(루트)

**Interfaces:**
- Consumes: Task 1~5의 파일 구조와 명령
- Produces: 문서

- [ ] **Step 1: `web_version/CLAUDE.md` 작성** (생성 주석은 둘째 줄)

````markdown
# CLAUDE.md
<!-- 생성: YYYY-MM-DD HH:MM KST -->

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
- **`js/model.js`**(순수 함수): `모델_만들기(model.json 내용, weights.bin ArrayBuffer)` → `{ 추론(28×28) → 로짓 10개 }`. 정규화(평균·표준편차는 `model.json`에서 읽음)도 여기서 합니다.
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
````

- [ ] **Step 2: 루트 `CLAUDE.md` 작성** (생성 주석은 둘째 줄)

````markdown
# CLAUDE.md
<!-- 생성: YYYY-MM-DD HH:MM KST -->

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 개요

MNIST로 학습한 CNN으로 마우스·터치로 그린 숫자를 인식하는 프로젝트입니다. 두 버전으로 나뉩니다.

| 폴더 | 내용 | 세부 지침 |
|---|---|---|
| `desktop_version/` | PyTorch 학습, tkinter 그림판(Windows). **학습·가중치의 원본** | `desktop_version/CLAUDE.md` |
| `web_version/` | 순수 자바스크립트로 브라우저에서 추론하는 정적 웹 페이지(외부 라이브러리 없음) | `web_version/CLAUDE.md` |

사용자 요청에 따라 **모든 코드·주석·식별자는 한글로** 작성합니다. 파일 이름만 영문입니다.
설계 문서는 `docs/superpowers/specs/`, 구현 계획은 `docs/superpowers/plans/`에 있습니다.

## 두 버전 사이의 동기화 규칙

- `web_version/model/`과 `web_version/tests/fixtures/`는 `desktop_version/export_web.py`가 만드는 **생성물**입니다. 손으로 고치지 마세요.
- 다음 중 하나라도 바꾸면 `desktop_version`에서 `.venv\Scripts\python.exe export_web.py`를 다시 실행하고, `web_version`에서 `node --test`로 확인하세요.
  - `mnist_cnn.pt`(다시 학습)
  - 모델 구조(`model.py`)
  - 전처리(`app.py`의 `MNIST형식으로_변환()`)
  - 정규화 상수
- 전처리를 바꿀 때는 `desktop_version/app.py`와 `web_version/js/preprocess.js`를 **함께** 고쳐야 합니다. 테스트가 두 결과의 픽셀 단위 일치를 확인합니다.
- 정규화 상수는 `desktop_version/train.py`와 `app.py`에 따로 정의되어 있습니다. 웹은 `model.json`을 통해 받습니다.

## 명령어 요약

```bash
cd desktop_version && .venv\Scripts\python.exe app.py   # 데스크톱 앱
cd desktop_version && .venv\Scripts\python.exe export_web.py   # 웹용 가중치·기준값 다시 만들기
cd web_version && node --test                           # 웹 버전 테스트
cd web_version && python -m http.server 8000 --bind 127.0.0.1   # 웹 버전 로컬 확인
```

GitHub Pages 배포 설정은 아직 없습니다. Pages는 브랜치 방식으로 루트나 `/docs`만 올릴 수 있어서, `web_version/`을 올리려면 GitHub Actions 워크플로 등이 필요합니다.
````

- [ ] **Step 3: 루트 `README.md` 작성** (생성 주석은 첫 줄)

````markdown
<!-- 생성: YYYY-MM-DD HH:MM KST -->
# 손글씨 숫자 인식기 (MNIST CNN)

마우스나 손가락으로 숫자를 그리면 합성곱 신경망(CNN)이 0~9 중 어떤 숫자인지 실시간으로 인식합니다.
MNIST 테스트 정확도는 **99.48%** 입니다.

| 버전 | 특징 | 안내 |
|---|---|---|
| [데스크톱](desktop_version/) | PyTorch 학습, tkinter 그림판, 바탕 화면 바로가기(Windows) | [desktop_version/README.md](desktop_version/README.md) |
| [웹](web_version/) | 외부 라이브러리 없이 순수 자바스크립트로 브라우저 안에서 추론, 정적 호스팅 가능, 터치 지원 | 아래 참고 |

## 웹 버전 실행

```bash
cd web_version
python -m http.server 8000 --bind 127.0.0.1
```

브라우저에서 http://127.0.0.1:8000 을 엽니다. `index.html`을 파일로 직접 열면 모델을 불러올 수 없습니다.

- 그린 그림은 서버로 보내지 않고 브라우저 안에서만 처리합니다.
- 웹 버전은 데스크톱 버전에서 학습한 가중치를 `desktop_version/export_web.py`로 내보내 씁니다.
- 테스트는 `web_version` 폴더에서 `node --test`로 실행합니다(Node 24 이상, 설치할 것 없음). 전처리와 추론이 파이썬 결과와 같은지 확인합니다.
````

- [ ] **Step 4: 최종 확인 — 웹 테스트**

Run: `cd web_version && node --test; cd ..`
Expected: `# pass 16`, `# fail 0`

- [ ] **Step 5: 최종 확인 — 데스크톱 전처리 검증**

Run: `PYTHONIOENCODING=utf-8 desktop_version/.venv/Scripts/python.exe "$SP/데스크톱검증.py" desktop_version`
Expected: `정답 498 / 500`
(scratchpad의 `데스크톱검증.py`가 없으면 Task 1 Step 2의 코드로 다시 만든다.)

- [ ] **Step 6: 최종 확인 — 파일 구조와 생성 주석**

Run: `git ls-files && grep -L "생성: 20" web_version/js/*.js web_version/tests/*.js web_version/*.html web_version/*.css web_version/CLAUDE.md desktop_version/export_web.py CLAUDE.md README.md .gitattributes`
Expected:
- `git ls-files`에 루트의 `app.py`, `model.py` 등이 없고, `desktop_version/`·`web_version/` 아래에 파일이 있다.
- `grep -L`(생성 주석이 없는 파일 목록)의 출력이 비어 있다.

- [ ] **Step 7: 커밋**

```bash
git add web_version/CLAUDE.md CLAUDE.md README.md
git commit -q -F - <<'EOF'
웹·데스크톱 버전 CLAUDE.md와 루트 개요 문서 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git status --short
```

Expected: `git status --short` 출력이 비어 있다.
