// 생성: 2026-09-27 01:15 KST
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
