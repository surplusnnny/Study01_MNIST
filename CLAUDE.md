# CLAUDE.md
<!-- 생성: 2026-09-27 01:48 KST -->

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
