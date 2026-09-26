// 생성: 2026-09-27 01:15 KST
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
