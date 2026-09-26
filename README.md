<!-- 생성: 2026-09-27 01:48 KST -->
# 손글씨 숫자 인식기 (MNIST CNN)

마우스나 손가락으로 숫자를 그리면 합성곱 신경망(CNN)이 0~9 중 어떤 숫자인지 실시간으로 인식합니다.
MNIST 테스트 정확도는 **99.48%** 입니다.

**바로 써 보기:** https://surplusnnny.github.io/Study01_MNIST/ (웹 버전, 휴대폰에서도 동작)

| 버전 | 특징 | 안내 |
|---|---|---|
| [데스크톱](desktop_version/) | PyTorch 학습, tkinter 그림판, 바탕 화면 바로가기(Windows) | [desktop_version/README.md](desktop_version/README.md) |
| [웹](web_version/) | 외부 라이브러리 없이 순수 자바스크립트로 브라우저 안에서 추론, 정적 호스팅 가능, 터치 지원 | 아래 참고 |

## 웹 버전 실행

`main`에 push하면 GitHub Actions가 테스트를 통과한 `web_version/`을 위 주소에 자동으로 배포합니다. 로컬에서 확인하려면:

```bash
cd web_version
python -m http.server 8000 --bind 127.0.0.1
```

브라우저에서 http://127.0.0.1:8000 을 엽니다. `index.html`을 파일로 직접 열면 모델을 불러올 수 없습니다.

- 그린 그림은 서버로 보내지 않고 브라우저 안에서만 처리합니다.
- 웹 버전은 데스크톱 버전에서 학습한 가중치를 `desktop_version/export_web.py`로 내보내 씁니다.
- 테스트는 `web_version` 폴더에서 `node --test`로 실행합니다(Node 24 이상, 설치할 것 없음). 전처리와 추론이 파이썬 결과와 같은지 확인합니다.
