// 생성: 2026-09-27 01:22 KST
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
