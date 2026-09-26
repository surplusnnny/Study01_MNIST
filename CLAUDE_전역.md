<!-- 생성: 2026-09-27 00:27 KST -->
# 전역 지침

## 새 파일에 생성 날짜·시각 주석 달기

- 새로 만드는 모든 파일의 맨 위에 생성 날짜와 시각을 **대한민국 표준시(KST, UTC+9)** 로 적는다.
  - 형식: `생성: YYYY-MM-DD HH:MM KST` (예: `생성: 2026-09-27 00:27 KST`)
  - 주석은 그 언어의 문법을 따른다: `#`(Python, PowerShell, YAML, .gitignore), `//`(JS/TS, C#), `<!-- -->`(HTML, Markdown), `/* */`(CSS) 등
- 첫 줄이 반드시 맨 앞에 있어야 하는 경우에는 그 다음 줄에 넣는다.
  - 예: 셰뱅(`#!`), 파이썬 인코딩 선언, 필수 헤더
  - CLAUDE.md처럼 첫 줄이 정해진 파일도 여기에 해당한다.
- 주석을 쓸 수 없는 파일에는 넣지 않는다: JSON, 이미지·아이콘·가중치 같은 바이너리, 데이터 파일 등
- 이미 있는 파일을 고칠 때는 생성 시각을 바꾸지 않는다.
- **시각을 짐작하지 말고 반드시 명령으로 확인한다.** 시스템 시간대가 바뀌어도 KST가 나오도록 아래 명령을 쓴다.
  - PowerShell:
    ```
    [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'Korea Standard Time').ToString('yyyy-MM-dd HH:mm')
    ```
  - Bash:
    ```
    TZ=KST-9 date '+%Y-%m-%d %H:%M'
    ```
  - Windows의 Git Bash에서 `TZ=Asia/Seoul`을 쓰면 오류 없이 UTC 시각이 나온다(9시간 차이). 쓰지 않는다.
