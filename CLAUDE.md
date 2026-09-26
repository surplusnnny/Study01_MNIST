# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 개요

PyTorch CNN으로 MNIST를 학습하고, tkinter 그림판에 마우스로 그린 숫자를 실시간으로 인식하는 Windows용 프로젝트입니다.
사용자 요청에 따라 **모든 코드·주석·식별자(변수, 함수, 클래스 이름)를 한글로** 작성합니다. 새 코드도 이 방식을 따르세요.

## 명령어

프로젝트 전용 가상환경 `.venv`를 사용합니다. 기본 `python`에는 torch가 없으므로 반드시 venv의 파이썬을 쓰세요.
PowerShell에서 한글 출력이 깨지면 `$env:PYTHONIOENCODING='utf-8'`를 먼저 지정하세요.

```bash
.venv\Scripts\python.exe train.py          # 학습 → mnist_cnn.pt 저장 (CPU 약 7분, data/에 MNIST 자동 다운로드)
.venv\Scripts\python.exe app.py            # 그림판 앱 실행 (콘솔에 오류가 보이는 방식)
.venv\Scripts\python.exe make_icon.py      # icon.ico, icon_preview.png 다시 만들기
powershell -ExecutionPolicy Bypass -File create_shortcut.ps1   # 바탕 화면 바로가기 다시 만들기
```

테스트와 린터는 없습니다. GUI를 띄우지 않고 확인하려면 `app`을 import해서 `모델_불러오기()`와 `MNIST형식으로_변환()`을 직접 호출하세요.
이전에는 MNIST 테스트 이미지를 280×280으로 키워 이 두 함수에 넣는 방식으로 전처리를 검증했습니다(500장 중 498장 정답).

설치된 torch는 CPU 빌드(2.14.0+cpu)입니다. PC에 RTX 4060이 있고, 코드는 CUDA가 있으면 자동으로 GPU를 씁니다.

## 구조 (여러 파일에 걸친 연결 관계)

- **`model.py`의 `숫자인식CNN`** 을 `train.py`와 `app.py`가 함께 씁니다. `mnist_cnn.pt`는 `state_dict`만 저장하므로, 모델 구조를 바꾸면 기존 가중치를 불러올 수 없어 `train.py`로 다시 학습해야 합니다.
- **정규화 상수**(`MNIST_평균=0.1307`, `MNIST_표준편차=0.3081`)가 `train.py`와 `app.py`에 **따로** 정의되어 있습니다. 한쪽을 바꾸면 다른 쪽도 같이 바꾸세요.
- `train.py`는 테스트 정확도가 가장 높았던 에폭의 가중치만 저장합니다. 학습 데이터에는 회전·이동·확대 증강을 적용하는데, 사람이 그린 숫자를 잘 인식하게 하려는 목적입니다.
- **`app.py`의 입력 흐름**
  - 획은 화면용 `tk.Canvas`와, 인식에 쓰는 메모리 속 PIL 흑백 이미지(검은 배경에 흰 글씨) 두 곳에 **동시에** 그립니다. 그리기 코드를 고칠 때는 두 곳을 함께 고쳐야 합니다.
  - `MNIST형식으로_변환()`은 MNIST를 만든 방식을 그대로 따라 합니다: 숫자 영역 자르기 → 긴 변을 20px로 축소 → 28×28 가운데에 배치 → 무게중심을 (14,14)로 이동 → 정규화. 반환값은 `(텐서, 28x28 이미지)`이고, 그린 것이 없으면 `None`입니다.
- **바로가기와 작업 표시줄**
  - 바로가기는 `.venv\Scripts\pythonw.exe "app.py"`를 실행합니다(콘솔 창 없음).
  - venv의 `pythonw.exe`는 실제로는 `C:\ProgramData\Anaconda3\pythonw.exe`를 띄웁니다. 그래서 작업 표시줄에서 고정한 아이콘과 실행 중인 창을 묶으려면 AppUserModelID가 필요합니다.
  - AppUserModelID `Study01.MNIST.HandwritingRecognizer`는 `app.py`의 `앱ID`와 `create_shortcut.ps1`의 `$앱ID` **두 곳에서 같아야** 합니다.
  - `app.py`는 가중치·아이콘 경로를 `__file__` 기준 절대 경로로 찾기 때문에, 작업 폴더와 상관없이 실행됩니다.

## 주의할 점

- **`create_shortcut.ps1`은 BOM이 있는 UTF-8로 저장해야 합니다.** Windows PowerShell 5.1은 BOM이 없으면 한글을 깨뜨립니다. Write 도구로 다시 저장했다면 BOM을 다시 붙이세요.
- **`pythonw`로 실행하면 오류가 보이지 않습니다.**
  - 실행 중에 난 예외는 `main()`에서 잡아 메시지 창으로 보여 줍니다.
  - 문법 오류나 import 오류는 이 처리에 닿기 전에 발생하므로 아무 표시 없이 꺼집니다.
  - 그래서 `app.py`를 고친 뒤에는 `python.exe app.py`로 한 번 실행해 확인하세요.
- 한글이 들어간 파일을 셸 heredoc 안의 파이썬 문자열 치환으로 고치면 `\n` 같은 이스케이프가 실제 줄바꿈으로 들어갈 수 있습니다(실제로 있었던 일). 이런 수정에는 Edit 도구를 쓰세요.
