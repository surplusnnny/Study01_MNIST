// 생성: 2026-09-27 01:22 KST
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
