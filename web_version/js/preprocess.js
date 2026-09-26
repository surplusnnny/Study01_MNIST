// 생성: 2026-09-27 01:22 KST
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

/**
 * 옅은 값(기준 미만)을 0으로 만든 새 배열을 돌려준다(입력은 바꾸지 않음).
 * 브라우저 canvas.getImageData는 구현에 따라 잡음(예: Brave·Safari 사생활 보호 모드의 +1)을 섞을 수 있고,
 * 획 가장자리의 안티앨리어싱도 옅은 값을 남긴다. desktop_version의 PIL ImageDraw로 그린 학습용 입력에는
 * 이런 옅은 값이 없으므로, 경계상자가 잡음까지 잉크로 잘못 재는 것을 막기 위해 미리 걸러낸다.
 */
export function 잡음_제거(흑백, 기준 = 16) {
  const 결과 = new Uint8Array(흑백.length);
  for (let i = 0; i < 흑백.length; i++) {
    const 값 = 흑백[i];
    결과[i] = 값 < 기준 ? 0 : 값;
  }
  return 결과;
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
  const 역배율 = 1 / 필터배율; // Pillow의 ss = 1.0 / filterscale와 같다. 루프 밖에서 한 번만 구해 나눗셈 대신 곱셈을 쓴다.
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
      const w = 란초스((x - 중심 + 0.5) * 역배율);
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
