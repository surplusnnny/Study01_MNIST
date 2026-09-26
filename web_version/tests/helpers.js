// 생성: 2026-09-27 01:15 KST
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
