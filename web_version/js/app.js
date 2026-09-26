// 생성: 2026-09-27 01:31 KST
/**
 * 그림판 화면: 마우스·터치로 그린 숫자를 브라우저 안에서 인식해 결과를 보여 준다.
 * 인식은 preprocess.js(전처리)와 model.js(추론)가 하고, 이 파일은 입력과 화면 갱신만 맡는다.
 */
import { MNIST형식으로_변환, 잡음_제거 } from './preprocess.js';
import { 모델_만들기, 소프트맥스 } from './model.js';

const 붓두께 = 18; // desktop_version/app.py의 붓두께와 같다

const 그림판 = document.getElementById('그림판');
const 붓 = 그림판.getContext('2d', { willReadFrequently: true });
const 미리보기 = document.getElementById('미리보기');
const 미리보기붓 = 미리보기.getContext('2d');
const 지우기버튼 = document.getElementById('지우기버튼');
const 인식버튼 = document.getElementById('인식버튼');
const 예측숫자 = document.getElementById('예측숫자');
const 확신도 = document.getElementById('확신도');
const 확률막대 = document.getElementById('확률막대');
const 상태 = document.getElementById('상태');

let 모델 = null;
let 이전좌표 = null;
let 현재포인터ID = null; // 지금 획을 긋고 있는 손가락(또는 마우스·펜)의 id. 다른 포인터는 이 획이 끝날 때까지 무시한다.

// ----- 확률 막대(0~9) 만들기 -----
const 막대들 = [];
for (let 숫자 = 0; 숫자 < 10; 숫자++) {
  const 항목 = document.createElement('li');
  항목.innerHTML = `<span>${숫자}</span><span class="막대"><span class="채움"></span></span><span class="퍼센트">0%</span>`;
  확률막대.append(항목);
  막대들.push({ 항목, 채움: 항목.querySelector('.채움'), 퍼센트: 항목.querySelector('.퍼센트') });
}

function 막대_그리기(확률, 최고) {
  확률.forEach((값, i) => {
    막대들[i].채움.style.width = `${값 * 100}%`;
    막대들[i].퍼센트.textContent = `${Math.round(값 * 100)}%`;
    막대들[i].항목.classList.toggle('최고', i === 최고);
  });
}

// ----- 그림판 -----
function 그림판_비우기() {
  붓.fillStyle = '#000';
  붓.fillRect(0, 0, 그림판.width, 그림판.height);
  붓.fillStyle = '#fff';
  붓.strokeStyle = '#fff';
  붓.lineWidth = 붓두께;
  붓.lineCap = 'round';
  붓.lineJoin = 'round';
}

function 미리보기_비우기() {
  미리보기붓.fillStyle = '#000';
  미리보기붓.fillRect(0, 0, 28, 28);
}

/** 화면 좌표를 캔버스 내부 좌표(280x280)로 바꾼다. 좁은 화면에서 CSS로 줄어든 경우를 보정한다. */
function 캔버스좌표(이벤트) {
  const 사각형 = 그림판.getBoundingClientRect();
  return [
    (이벤트.clientX - 사각형.left) * (그림판.width / 사각형.width),
    (이벤트.clientY - 사각형.top) * (그림판.height / 사각형.height),
  ];
}

/** 선의 끝과 이음새가 둥글게 보이도록 원을 찍는다. */
function 점찍기([x, y]) {
  붓.beginPath();
  붓.arc(x, y, 붓두께 / 2, 0, Math.PI * 2);
  붓.fill();
}

function 선긋기([x1, y1], [x2, y2]) {
  붓.beginPath();
  붓.moveTo(x1, y1);
  붓.lineTo(x2, y2);
  붓.stroke();
}

그림판.addEventListener('pointerdown', (이벤트) => {
  if (이벤트.button !== 0) return; // 왼쪽 버튼(터치·펜 포함)만 그린다
  if (현재포인터ID !== null) return; // 이미 다른 손가락으로 획을 긋는 중이면 무시한다(멀티터치로 선이 섞이는 것을 막음)
  이벤트.preventDefault();
  현재포인터ID = 이벤트.pointerId;
  그림판.setPointerCapture(현재포인터ID);
  이전좌표 = 캔버스좌표(이벤트);
  점찍기(이전좌표);
});

그림판.addEventListener('pointermove', (이벤트) => {
  if (이벤트.pointerId !== 현재포인터ID || 이전좌표 === null) return;
  const 현재좌표 = 캔버스좌표(이벤트);
  선긋기(이전좌표, 현재좌표);
  점찍기(현재좌표);
  이전좌표 = 현재좌표;
});

function 그리기_끝(이벤트) {
  if (이벤트.pointerId !== 현재포인터ID) return; // 지금 획을 긋고 있는 포인터가 아니면 무시한다
  현재포인터ID = null;
  if (이전좌표 === null) return;
  이전좌표 = null;
  인식(); // 획을 하나 그을 때마다 자동으로 인식
}
그림판.addEventListener('pointerup', 그리기_끝);
그림판.addEventListener('pointercancel', 그리기_끝);

// ----- 인식과 결과 표시 -----
function 인식() {
  if (모델 === null) return; // 모델을 불러오기 전이면 무시한다(불러온 뒤 한 번 인식한다)
  const 픽셀 = 붓.getImageData(0, 0, 그림판.width, 그림판.height).data;
  const 흑백 = new Uint8Array(그림판.width * 그림판.height);
  for (let i = 0; i < 흑백.length; i++) 흑백[i] = 픽셀[i * 4]; // 흰 글씨라 빨강 채널 = 밝기
  // 사생활 보호 모드 등 일부 브라우저는 getImageData에 잡음을 섞으므로, 옅은 값을 지운 뒤 전처리한다
  const 이미지 = MNIST형식으로_변환(잡음_제거(흑백), 그림판.width, 그림판.height);
  if (이미지 === null) return;

  const 확률 = 소프트맥스(모델.추론(이미지));
  const 예측 = 확률.indexOf(Math.max(...확률));
  예측숫자.textContent = String(예측);
  확신도.textContent = `확신도: ${(확률[예측] * 100).toFixed(1)}%`;
  막대_그리기(확률, 예측);
  미리보기_갱신(이미지);
}

/** 모델에 들어간 28x28 이미지를 보여 준다(CSS로 4배 확대, 흐림 없이). */
function 미리보기_갱신(이미지) {
  const 데이터 = 미리보기붓.createImageData(28, 28);
  for (let i = 0; i < 이미지.length; i++) {
    데이터.data[i * 4] = 이미지[i];
    데이터.data[i * 4 + 1] = 이미지[i];
    데이터.data[i * 4 + 2] = 이미지[i];
    데이터.data[i * 4 + 3] = 255;
  }
  미리보기붓.putImageData(데이터, 0, 0);
}

function 지우기() {
  그림판_비우기();
  미리보기_비우기();
  예측숫자.textContent = '?';
  확신도.textContent = '확신도: -';
  막대_그리기(new Array(10).fill(0), -1);
}

지우기버튼.addEventListener('click', 지우기);
인식버튼.addEventListener('click', 인식);
document.addEventListener('keydown', (이벤트) => {
  if (이벤트.key === 'Escape') 지우기();
});

// ----- 모델 불러오기 -----
async function 모델_불러오기() {
  // 문서 기준 상대 경로라 GitHub Pages처럼 하위 경로에 올려도 동작한다
  // 다시 내보낸 같은 크기의 weights.bin을 브라우저 캐시가 옛 모델로 착각하지 않도록 캐시를 쓰지 않는다
  const [정보응답, 가중치응답] = await Promise.all([
    fetch('model/model.json', { cache: 'no-cache' }),
    fetch('model/weights.bin', { cache: 'no-cache' }),
  ]);
  if (!정보응답.ok || !가중치응답.ok) {
    throw new Error(`모델 파일을 받지 못했습니다 (HTTP ${정보응답.status}, ${가중치응답.status})`);
  }
  return 모델_만들기(await 정보응답.json(), await 가중치응답.arrayBuffer());
}

지우기();
모델_불러오기()
  .then((불러온모델) => {
    모델 = 불러온모델;
    인식버튼.disabled = false;
    상태.textContent = '';
    인식(); // 불러오는 동안 그려 둔 것이 있으면 바로 인식한다
  })
  .catch((오류) => {
    // file://일 때의 안내는 index.html의 인라인 스크립트가 맡는다(이 모듈은 file://에서 아예 실행되지 않으므로).
    상태.classList.add('오류');
    상태.textContent = `모델을 불러오지 못했습니다: ${오류.message}`;
  });
