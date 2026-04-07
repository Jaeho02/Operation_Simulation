/* ── 초기 프로세스 데이터 ── */
let processes = [];

let pidCount   = 1;
let speed      = 1;
let running    = false;
let dropTimers = [];

/* ── 간트 변수 (상단 선언 필수) ── */
let ganttTimer   = null;
let ganttSeconds = 0;
const TICK_PX    = 40;

const MAX_CORES = 4;

/* ── 문맥 교환 카운터 ── */
let contextSwitchCount = 0;

/* ── 전력 상수 ── */
const POWER = {
  p: { work: 2, watt: 3, startup: 0.5 },
  e: { work: 1, watt: 1, startup: 0.1 },
};

/* ── 스케줄링 상태 ── */
const coreState    = {};
const resultData   = {};
const processState = {};

/* ── 그래프 히스토리 ── */
const perfHistory = [];   // { t, v } 성능 이력
const effHistory  = [];   // { t, v } 효율 이력

/* ════════════════════════════════
   사이드바 토글
════════════════════════════════ */
const sidebar     = document.getElementById('sidebar');
const leftCol     = document.getElementById('leftCol');
const bottomBar   = document.getElementById('bottomBar');
const toggleBtn   = document.getElementById('sidebarToggle');
const toggleArrow = document.getElementById('toggleArrow');

let sidebarOpen = true;

toggleBtn.addEventListener('click', () => {
  sidebarOpen = !sidebarOpen;
  sidebar.classList.toggle('collapsed', !sidebarOpen);
  leftCol.classList.toggle('collapsed', !sidebarOpen);
  bottomBar.classList.toggle('collapsed', !sidebarOpen);
  toggleArrow.innerHTML = sidebarOpen ? '&#9664;' : '&#9654;';
});

/* ════════════════════════════════
   코어 설정 (합계 ≤ 4)
════════════════════════════════ */
const pSlider    = document.getElementById('pSlider');
const eSlider    = document.getElementById('eSlider');
const pValEl     = document.getElementById('pVal');
const eValEl     = document.getElementById('eVal');
const badgesEl   = document.getElementById('badges');
const limitMsgEl = document.getElementById('coreLimitMsg');

function clampCores(changed) {
  let p = +pSlider.value;
  let e = +eSlider.value;

  if (p + e > MAX_CORES) {
    if (changed === 'p') {
      e = MAX_CORES - p;
      eSlider.value = e;
    } else {
      p = MAX_CORES - e;
      pSlider.value = p;
    }
  }

  pValEl.textContent = p;
  eValEl.textContent = e;

  const total = p + e;
  limitMsgEl.textContent = total === MAX_CORES
    ? `총 ${total}코어 (최대)`
    : `총 ${total}코어`;
  limitMsgEl.style.color = total === MAX_CORES ? '#c0353f' : '#2a6645';

  let html = `<span class="badge badge-p">P ${p}</span>`;
  if (e > 0) html += `<span class="badge badge-e">E ${e}</span>`;
  badgesEl.innerHTML = html;

  if (typeof buildGantt === 'function' && document.getElementById('ganttRows')) {
    buildGantt();
  }
}

pSlider.addEventListener('input', () => clampCores('p'));
eSlider.addEventListener('input', () => clampCores('e'));
clampCores('p');

/* ════════════════════════════════
   프로세스 테이블
════════════════════════════════ */
function render() {
  const tbody = document.getElementById('procBody');
  tbody.innerHTML = '';

  processes.forEach((p, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.name}</td>
      <td><input class="cell-input" type="number" min="0" value="${p.at}"
          onchange="processes[${i}].at = +this.value"></td>
      <td><input class="cell-input" type="number" min="1" value="${p.bt}"
          onchange="processes[${i}].bt = +this.value"></td>
      <td><button class="del-btn" onclick="delProc(${i})">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
}

/* ── 프로세스 추가 ── */
function addProcess() {
  const atInput = document.getElementById('inputAT');
  const btInput = document.getElementById('inputBT');

  const at = atInput.value.trim();
  const bt = btInput.value.trim();

  if (at === '' || bt === '') {
    atInput.style.borderColor = at === '' ? '#e05555' : '#9ad4b4';
    btInput.style.borderColor = bt === '' ? '#e05555' : '#9ad4b4';
    return;
  }

  atInput.style.borderColor = '#9ad4b4';
  btInput.style.borderColor = '#9ad4b4';

  const name = 'P' + pidCount;
  processes.push({ name, at: +at, bt: Math.max(1, +bt) });
  pidCount++;

  atInput.value = '';
  btInput.value = '';
  atInput.focus();

  render();
  const wrapper = document.getElementById('tableWrapper');
  wrapper.scrollTop = wrapper.scrollHeight;

  createCloud(name); // ← 구름 생성
}

document.getElementById('addBtn').addEventListener('click', addProcess);

/* ── 랜덤 프로세스 추가 ── */
function addRandomProcess() {
  const at = Math.floor(Math.random() * 11);      // 0 ~ 10
  const bt = Math.floor(Math.random() * 10) + 1;  // 1 ~ 10
  const name = 'P' + pidCount;
  processes.push({ name, at, bt });
  pidCount++;
  render();
  document.getElementById('tableWrapper').scrollTop = 99999;
  createCloud(name);
}

document.getElementById('randBtn1').addEventListener('click', () => addRandomProcess());
document.getElementById('randBtn15').addEventListener('click', () => { for (let i = 0; i < 15; i++) addRandomProcess(); });

/* 숫자만 입력 허용 */
['inputAT', 'inputBT'].forEach(id => {
  document.getElementById(id).addEventListener('keypress', (e) => {
    if (!/[0-9]/.test(e.key)) e.preventDefault();
  });
});

/* Enter 키로 추가 */
document.getElementById('inputAT').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('inputBT').focus();
});

document.getElementById('inputBT').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addProcess();
});

/* ── 프로세스 삭제 ── */
function delProc(i) {
  const name = processes[i].name; // ← 추가
  processes.splice(i, 1);
  render();
  removeCloud(name); // ← 추가
}

/* ════════════════════════════════
   속도 / 시작 / 재설정
════════════════════════════════ */
function setSpeed(s) {
  speed = s;
  document.getElementById('spd1').classList.toggle('active', s === 1);
  document.getElementById('spd3').classList.toggle('active', s === 3);

  // 실행 중이면 타이머를 새 속도로 즉시 재시작
  if (running) {
    stopGanttTimer();
    startGanttTimer();
  }
}

function toggleStart() {
  running = !running;
  const btn = document.getElementById('startBtn');
  btn.textContent = running ? '정지' : '시작';
  btn.classList.toggle('running', running);

  if (running) {
    startDropAnimation();
    startGanttTimer();
  } else {
    stopDropAnimation();
    stopGanttTimer();
  }
}

function resetAll() {
  running = false;
  stopDropAnimation();
  stopGanttTimer();
  resetGanttTimer();
  document.getElementById('startBtn').textContent = '시작';
  document.getElementById('startBtn').classList.remove('running');

  document.querySelectorAll('.falling-drop').forEach(el => el.remove());
  processes.forEach(p => removeCloud(p.name));
  processes = [];
  pidCount  = 1;

  readyQueueItems.length = 0;
  contextSwitchCount = 0;
  const ctxEl = document.getElementById('pwVal-ctx');
  if (ctxEl) ctxEl.textContent = '0회';
  perfHistory.length = 0;
  effHistory.length  = 0;
  Object.keys(coreState).forEach(k => {
    coreState[k].busy = false; coreState[k].currentProcess = null;
    coreState[k].startTime = null; coreState[k].finishTime = null;
    coreState[k].usedSeconds = 0; coreState[k].everUsed = false;
  });
  Object.keys(resultData).forEach(k  => delete resultData[k]);
  Object.keys(processState).forEach(k => delete processState[k]);

  renderReadyQueue();
  if (typeof renderResultTable === 'function') renderResultTable();
  if (typeof renderPowerStats  === 'function') renderPowerStats();
  render();
}

document.getElementById('spd1').addEventListener('click', () => setSpeed(1));
document.getElementById('spd3').addEventListener('click', () => setSpeed(3));
document.getElementById('startBtn').addEventListener('click', toggleStart);
document.getElementById('resetBtn').addEventListener('click', resetAll);

/* ── 초기 렌더 ── */
render();

/* ════════════════════════════════
   Time Quantum 활성화/비활성화
════════════════════════════════ */
const algoSelect = document.getElementById('algoSelect');
const tqInput    = document.getElementById('tqInput');

function updateTQ() {
  const isRR = algoSelect.value === 'Round Robin';
  tqInput.disabled = !isRR;
}

algoSelect.addEventListener('change', updateTQ);
updateTQ();

/* ════════════════════════════════
   구름 & 물방울 (아래 전체 추가)
════════════════════════════════ */
const sky = document.getElementById('simSky');

const CLOUD_SLOTS = [
  { top: 5,  left: 3  }, { top: 3,  left: 20 },
  { top: 7,  left: 38 }, { top: 2,  left: 56 },
  { top: 6,  left: 72 }, { top: 4,  left: 55 },
  { top: 8,  left: 12 }, { top: 2,  left: 84 },
];
let cloudIndex = 0;

function makeCloudSVG(w, h) {
  const cx = w / 2, base = h * 0.68;
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="${cx}" cy="${base}" rx="${w*0.44}" ry="${h*0.22}" fill="#c2dff5"/>
    <circle cx="${w*0.25}" cy="${base-h*0.18}" r="${w*0.18}" fill="#d4ecfc"/>
    <circle cx="${w*0.50}" cy="${base-h*0.28}" r="${w*0.22}" fill="#dff2ff"/>
    <circle cx="${w*0.74}" cy="${base-h*0.16}" r="${w*0.17}" fill="#d4ecfc"/>
    <circle cx="${w*0.38}" cy="${base-h*0.22}" r="${w*0.15}" fill="#dcf0ff"/>
    <circle cx="${w*0.63}" cy="${base-h*0.23}" r="${w*0.15}" fill="#dcf0ff"/>
    <ellipse cx="${w*0.42}" cy="${base-h*0.30}" rx="${w*0.10}" ry="${h*0.07}" fill="white" opacity="0.45"/>
  </svg>`;
}

function makeDropletSVG() {
  return `<svg viewBox="0 0 52 64" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="dg" cx="38%" cy="32%" r="60%">
        <stop offset="0%"   stop-color="#e8f6ff"/>
        <stop offset="60%"  stop-color="#7bbde0"/>
        <stop offset="100%" stop-color="#4a8fbc"/>
      </radialGradient>
    </defs>
    <path d="M26 3 C26 3, 6 26, 6 41 a20 20 0 0 0 40 0 C46 26, 26 3, 26 3Z"
          fill="url(#dg)" stroke="#5a9fcc" stroke-width="1.5"/>
    <ellipse cx="18" cy="30" rx="5" ry="7.5" fill="white" opacity="0.4" transform="rotate(-20,18,30)"/>
  </svg>`;
}


function createCloud(name) {
  const w = 200 + Math.random() * 60;
  const h = 130 + Math.random() * 30;

  // ground-block-row bottom: 62% → 꼭대기에서 38% 지점
  // 새싹 높이(45px)만큼 더 올라간 곳이 장애물 상단
  const skyH         = sky.offsetHeight;
  const sproutTop    = skyH * (1 - 0.03) - 45;   // 새싹 상단 (px)
  const maxTop       = Math.max(0, sproutTop - h); // 구름 하단이 새싹 위에 오도록
  const topPx        = Math.random() * maxTop;
  const leftPct      = Math.random() * 78;

  const cloud = document.createElement('div');
  cloud.className = 'cloud';
  cloud.id = `cloud-${name}`;
  cloud.style.cssText = `top:${topPx}px;left:${leftPct}%;width:${w}px;height:${h}px;`;

  const body = document.createElement('div');
  body.className = 'cloud-body';
  body.innerHTML = makeCloudSVG(w, h);
  cloud.appendChild(body);

  const drop = document.createElement('div');
  drop.className = 'droplet';
  drop.innerHTML = `${makeDropletSVG()}<span>${name}</span>`;
  cloud.appendChild(drop);

  sky.appendChild(cloud);
}

function removeCloud(name) {
  const el = document.getElementById(`cloud-${name}`);
  if (!el) return;
  el.style.transition = 'opacity 0.3s, transform 0.3s';
  el.style.opacity = '0';
  el.style.transform = 'scale(0.8)';
  setTimeout(() => el.remove(), 300);
}

/* ════════════════════════════════
   물방울 낙하 애니메이션
════════════════════════════════ */
function dropFromCloud(name) {
  const cloud = document.getElementById(`cloud-${name}`);
  if (!cloud) return;
  const droplet = cloud.querySelector('.droplet');
  if (!droplet) return;

  const skyRect  = sky.getBoundingClientRect();
  const dropRect = droplet.getBoundingClientRect();

  droplet.style.opacity = '0';

  const clone = document.createElement('div');
  clone.className = 'falling-drop';
  clone.innerHTML = droplet.innerHTML;
  clone.style.left = `${dropRect.left - skyRect.left}px`;
  clone.style.top  = `${dropRect.top  - skyRect.top}px`;
  sky.appendChild(clone);

  // 땅 상단까지 실제 낙하 거리 계산
  const groundEl  = document.getElementById('ground');
  const groundTop = groundEl
    ? groundEl.getBoundingClientRect().top - skyRect.top
    : sky.offsetHeight - 40;
  const dropH    = dropRect.height || 64;
  const fallDist = Math.max(10, groundTop - (dropRect.top - skyRect.top) - dropH);

  clone.style.setProperty('--fall-dist', fallDist + 'px');

  // 터짐 효과 + ready queue 추가: transition 시간(1.1s)과 동일하게 맞춤
  setTimeout(() => {
    const bx = dropRect.left - skyRect.left + dropRect.width / 2;
    triggerBurst(bx, groundTop, name);
    addToReadyQueue(name);   // ← 물방울 사라지는 순간 ready queue에 추가
  }, 1100);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    clone.classList.add('animate-fall');
  }));

  setTimeout(() => clone.remove(), 1600);
}

function stopDropAnimation() {
  dropTimers.forEach(t => clearTimeout(t));
  dropTimers = [];
  // 아직 안 떨어진 물방울 복원
  processes.forEach(p => {
    const cloud = document.getElementById(`cloud-${p.name}`);
    if (!cloud) return;
    const droplet = cloud.querySelector('.droplet');
    if (droplet) droplet.style.opacity = '1';
  });
}

function startDropAnimation() {
  if (processes.length === 0) {
    // 프로세스 없으면 즉시 정지
    running = false;
    const btn = document.getElementById('startBtn');
    btn.textContent = '시작';
    btn.classList.remove('running');
    return;
  }

  // 프로세스 번호 오름차순 정렬
  const sorted = [...processes].sort((a, b) =>
    parseInt(a.name.slice(1)) - parseInt(b.name.slice(1))
  );

  const interval = Math.round(700 / speed);

  sorted.forEach((proc, idx) => {
    const t = setTimeout(() => {
      if (!running) return;
      dropFromCloud(proc.name);
    }, idx * interval);
    dropTimers.push(t);
  });

  // 마지막 낙하 완료 후 자동 정지 & 물방울 복원 (재실행 가능)
  const endDelay = (sorted.length - 1) * interval + 1700;
  const endTimer = setTimeout(() => {
    if (!running) return;
    running = false;
    const btn = document.getElementById('startBtn');
    btn.textContent = '시작';
    btn.classList.remove('running');
    processes.forEach(p => {
      const cloud = document.getElementById(`cloud-${p.name}`);
      if (!cloud) return;
      const droplet = cloud.querySelector('.droplet');
      if (droplet) droplet.style.opacity = '1';
    });
    dropTimers = [];
  }, endDelay);
  dropTimers.push(endTimer);
}

/* ════════════════════════════════
   문맥 교환 & 번개 애니메이션
════════════════════════════════ */
function incrementContextSwitch() {
  contextSwitchCount++;
  const el = document.getElementById('pwVal-ctx');
  if (el) el.textContent = contextSwitchCount + '회';
  // 뱃지 bump 애니메이션
  const badge = document.getElementById('ctxBadge');
  if (badge) {
    badge.classList.remove('ctx-badge--bump');
    void badge.offsetWidth; // reflow
    badge.classList.add('ctx-badge--bump');
  }
  triggerLightning();
}

function makeLightningSVG(seed) {
  /* seed 기반으로 지그재그 번개 경로를 동적으로 생성 */
  const w = 44, h = 130;
  const mid = w / 2;
  // 약간씩 다른 모양의 번개 경로 생성
  const zig = (seed % 3 === 0)
    ? `${mid},0 ${mid-14},45 ${mid+6},45 ${mid-18},130 ${mid+20},55 ${mid+2},55 ${mid+16},0`
    : (seed % 3 === 1)
    ? `${mid},0 ${mid-10},40 ${mid+8},40 ${mid-16},130 ${mid+22},50 ${mid+4},50 ${mid+12},0`
    : `${mid},0 ${mid-16},50 ${mid+4},50 ${mid-12},130 ${mid+18},60 ${mid},60 ${mid+14},0`;

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="glow-${seed}">
        <feGaussianBlur stdDeviation="2.5" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <!-- 외곽 글로우 -->
    <polyline points="${zig}" fill="#ffe566" stroke="#ffffff" stroke-width="5"
              stroke-linejoin="round" opacity="0.35" filter="url(#glow-${seed})"/>
    <!-- 메인 번개 -->
    <polyline points="${zig}" fill="#ffe566" stroke="#fff8c0" stroke-width="1.5"
              stroke-linejoin="round"/>
  </svg>`;
}

function triggerLightning() {
  const skyEl = document.getElementById('simSky');
  if (!skyEl) return;

  const seed = Math.floor(Math.random() * 1000);

  /* 어두운 오버레이 */
  const overlay = document.createElement('div');
  overlay.className = 'lightning-overlay';
  skyEl.appendChild(overlay);

  /* 번개 볼트 1 (메인) */
  const bolt1 = document.createElement('div');
  bolt1.className = 'lightning-bolt';
  bolt1.innerHTML = makeLightningSVG(seed);
  bolt1.style.left = (15 + Math.random() * 55) + '%';
  bolt1.style.top  = '0';
  skyEl.appendChild(bolt1);

  /* 번개 볼트 2 (서브, 약간 뒤에) */
  const bolt2 = document.createElement('div');
  bolt2.className = 'lightning-bolt lightning-bolt--sub';
  bolt2.innerHTML = makeLightningSVG(seed + 1);
  bolt2.style.left  = (10 + Math.random() * 65) + '%';
  bolt2.style.top   = '0';
  bolt2.style.animationDelay = '80ms';
  skyEl.appendChild(bolt2);

  /* 정리 */
  setTimeout(() => { overlay.remove(); bolt1.remove(); bolt2.remove(); }, 1000);
}


function makeSproutSVG() {
  // 물방울을 180° 뒤집은 잎사귀 경로 (tip 아래, 동그란 끝 위)
  // 반지름 16으로 키워 더 풍성하게
  const leaf = "M18 43 C18 43,2 27,2 14 a16 6 0 0 1 32 0 C34 27,18 43,18 43Z";
  const leafColor = "#93c47a";
  const stemColor = "#6fa858";

  return `<svg viewBox="0 0 70 100" xmlns="http://www.w3.org/2000/svg">
    <!-- 줄기 -->
    <rect x="32" y="52" width="6" height="46" rx="3" fill="${stemColor}"/>
    <!-- 왼쪽 잎 -->
    <g transform="translate(34,58) rotate(-50) translate(-18,-43)">
      <path d="${leaf}" fill="${leafColor}"/>
    </g>
    <!-- 오른쪽 잎 (약간 더 위) -->
    <g transform="translate(36,48) rotate(50) translate(-18,-43)">
      <path d="${leaf}" fill="${leafColor}"/>
    </g>
  </svg>`;
}

function buildGround() {
  const row    = document.getElementById('groundBlockRow');
  const ground = document.getElementById('ground');
  if (!row || !ground) return;
  row.innerHTML = '';

  // ground의 실제 위치·너비를 기준으로 row를 정렬
  row.style.left           = ground.offsetLeft + 'px';
  row.style.right          = (sky.offsetWidth - ground.offsetLeft - ground.offsetWidth) + 'px';
  row.style.padding        = '0';
  row.style.justifyContent = 'space-evenly';

  for (let i = 0; i < 5; i++) {
    const b = document.createElement('div');
    b.className  = 'ground-block';
    b.innerHTML  = makeSproutSVG();
    row.appendChild(b);
  }
}

buildGround();
window.addEventListener('resize', buildGround);


function triggerBurst(x, y, name) {
  // 납작한 물 파문 링
  const ring = document.createElement('div');
  ring.className = 'burst-ring';
  ring.style.left = x + 'px';
  ring.style.top  = y + 'px';
  sky.appendChild(ring);
  setTimeout(() => ring.remove(), 500);

  // 물 입자 튀기기
  [-80, -50, -20, 0, 20, 50, 80].forEach(deg => {
    const p   = document.createElement('div');
    p.className = 'burst-particle';
    const rad  = deg * Math.PI / 180;
    const dist = 18 + Math.random() * 16;
    p.style.left = x + 'px';
    p.style.top  = y + 'px';
    p.style.setProperty('--tx', `${Math.sin(rad) * dist}px`);
    p.style.setProperty('--ty', `${-Math.abs(Math.cos(rad)) * dist * 0.7}px`);
    p.style.animationDelay = Math.random() * 60 + 'ms';
    sky.appendChild(p);
    setTimeout(() => p.remove(), 600);
  });

  // ── 추후 간트 차트 연동 지점 ──
  // addToGanttChart(name);
}

/* ════════════════════════════════
   Ready Queue
════════════════════════════════ */
const readyQueueItems = [];   // ready queue에 표시할 프로세스 이름 목록

function positionReadyQueue() {
  // requestAnimationFrame(() => {
  //   const ground = document.getElementById('ground');
  //   const rq     = document.getElementById('readyQueue');
  //   if (!ground || !rq) return;

  //   const skyRect    = sky.getBoundingClientRect();
  //   const groundRect = ground.getBoundingClientRect();

  //   // 땅 하단 ~ sky 하단 거리 (px)
  //   const groundBottomFromSkyBottom = skyRect.bottom - groundRect.bottom;
  //   // ready queue bottom = 땅 하단에서 gap(24px) + rq높이(56px) 내려서 배치
  //   rq.style.bottom = Math.max(0, groundBottomFromSkyBottom - 80) + 'px';
  // });
}

function renderReadyQueue() {
  const track = document.getElementById('rqTrack');
  if (!track) return;
  track.innerHTML = '';

  const total = readyQueueItems.length;

  readyQueueItems.forEach((name, idx) => {
    const node = document.createElement('div');
    node.className   = 'rq-node';
    node.id          = `rq-${name}`;
    node.textContent = name;

    // 오래된(idx=0) → 진하게, 최신(idx=total-1) → 연하게
    // lightness: 32%(가장 진함) ~ 62%(가장 연함)
    const t = total <= 1 ? 1 : idx / (total - 1);
    const l = Math.round(32 + t * 30);           // 32 ~ 62
    node.style.background = `hsl(207, 70%, ${l}%)`;

    track.appendChild(node);
  });
}

function addToReadyQueue(name) {
  if (!readyQueueItems.includes(name)) {
    readyQueueItems.push(name);
    processState[name] = { arrivalInQueue: ganttSeconds, startTime: null, coreName: null };
    renderReadyQueue();
    trySchedule();
  }
}

positionReadyQueue();
window.addEventListener('resize', positionReadyQueue);






// 마우스 휠을 가로 스크롤로 변환
document.getElementById('rqTrack').addEventListener('wheel', (e) => {
  e.preventDefault();
  e.currentTarget.scrollLeft += e.deltaY;
}, { passive: false });
/* ════════════════════════════════
   FCFS 스케줄링 엔진
════════════════════════════════ */
function trySchedule() {
  const waiting   = readyQueueItems.filter(n => processState[n] && processState[n].startTime === null);
  const freeCores = Object.keys(coreState).filter(k => !coreState[k].busy);
  const n = Math.min(waiting.length, freeCores.length);
  for (let i = 0; i < n; i++) assignToCore(freeCores[i], waiting[i]);
}

function assignToCore(coreName, procName) {
  const s    = coreState[coreName];
  const proc = processes.find(p => p.name === procName);
  if (!s || !proc) return;

  /* 이전에 이미 실행한 적 있는 코어 → 문맥 교환 발생 */
  if (s.everUsed) incrementContextSwitch();

  const cfg      = POWER[s.type];
  const execSecs = Math.max(1, Math.ceil(proc.bt / cfg.work));
  s.busy = true; s.currentProcess = procName;
  s.startTime = ganttSeconds; s.finishTime = ganttSeconds + execSecs;
  s.everUsed  = true;
  processState[procName].startTime = ganttSeconds;
  processState[procName].coreName  = coreName;
  drawGanttBlock(coreName, ganttSeconds, execSecs, procName, s.type);
}

function completeProcess(coreName) {
  const s = coreState[coreName];
  if (!s || !s.busy) return;
  const procName = s.currentProcess;
  const proc     = processes.find(p => p.name === procName);
  const ps       = processState[procName];
  if (proc && ps) {
    updateResultRow(procName, Math.max(0, ps.startTime - ps.arrivalInQueue), Math.max(0, ganttSeconds - proc.at));
  }
  s.busy = false; s.currentProcess = null; s.startTime = null; s.finishTime = null;
  trySchedule();
}

function checkAllDone() {
  if (processes.length === 0) return;
  if (processes.every(p => resultData[p.name]) && Object.values(coreState).every(s => !s.busy)) {
    stopGanttTimer();
    running = false;
    const btn = document.getElementById('startBtn');
    btn.textContent = '시작'; btn.classList.remove('running');
    processes.forEach(p => {
      const droplet = document.getElementById(`cloud-${p.name}`)?.querySelector('.droplet');
      if (droplet) droplet.style.opacity = '1';
    });
  }
}

function drawGanttBlock(coreName, startSec, durSec, procName, coreType) {
  const track = document.getElementById(`gantt-track-${coreName.replace(/\s/g, '-')}`);
  if (!track) return;
  const block = document.createElement('div');
  block.className = 'gantt-block' + (coreType === 'p' ? ' gantt-block--p' : ' gantt-block--e');
  block.style.left  = (startSec * TICK_PX) + 'px';
  block.style.width = Math.max(2, durSec * TICK_PX - 2) + 'px';
  block.textContent = procName;
  track.appendChild(block);
}

/* ════════════════════════════════
   간트 차트 (normal flow)
════════════════════════════════ */
function makeGanttRow(label, type) {
  const row = document.createElement('div');
  row.className = 'gantt-row';
  const lbl = document.createElement('div');
  lbl.className = `gantt-row-label ${type}`;
  lbl.textContent = label;
  const totalW = Math.max(300, (ganttSeconds + 5) * TICK_PX);
  const track  = document.createElement('div');
  track.className = 'gantt-track';
  track.id = `gantt-track-${label.replace(/\s/g, '-')}`;
  track.style.width = totalW + 'px';
  const cursor = document.createElement('div');
  cursor.className = 'gantt-cursor';
  cursor.style.height = '100%';
  cursor.style.left   = (ganttSeconds * TICK_PX) + 'px';
  track.appendChild(cursor);
  row.appendChild(lbl);
  row.appendChild(track);
  return row;
}

function buildGantt() {
  const rows = document.getElementById('ganttRows');
  if (!rows) return;
  rows.innerHTML = '';
  const p = +pSlider.value, e = +eSlider.value;
  const newKeys = [];
  for (let i = 1; i <= p; i++) newKeys.push(`P-core ${i}`);
  for (let i = 1; i <= e; i++) newKeys.push(`E-core ${i}`);
  Object.keys(coreState).forEach(k => { if (!newKeys.includes(k)) delete coreState[k]; });
  newKeys.forEach(k => {
    if (!coreState[k]) coreState[k] = { type: k.startsWith('P') ? 'p' : 'e', usedSeconds: 0, everUsed: false, busy: false, currentProcess: null, startTime: null, finishTime: null };
  });
  for (let i = 0; i < p; i++) rows.appendChild(makeGanttRow(`P-core ${i+1}`, 'p-core'));
  for (let i = 0; i < e; i++) rows.appendChild(makeGanttRow(`E-core ${i+1}`, 'e-core'));
  const timeline = document.createElement('div');
  timeline.className = 'gantt-timeline';
  const spacer = document.createElement('div');
  spacer.className = 'gantt-timeline-spacer';
  const ticks = document.createElement('div');
  ticks.className = 'gantt-ticks';
  ticks.id = 'ganttTicks';
  timeline.appendChild(spacer);
  timeline.appendChild(ticks);
  rows.appendChild(timeline);
  drawTicks(ganttSeconds);
}

function drawTicks(upToSec) {
  const ticks = document.getElementById('ganttTicks');
  if (!ticks) return;
  ticks.innerHTML = '';
  const maxSec = Math.max(upToSec + 5, 15);
  const totalW = maxSec * TICK_PX;
  document.querySelectorAll('.gantt-track').forEach(t => { t.style.width = totalW + 'px'; });
  for (let s = 0; s <= maxSec; s++) {
    const tick = document.createElement('div');
    tick.className = 'gantt-tick';
    tick.style.left = (s * TICK_PX) + 'px';
    const line = document.createElement('div'); line.className = 'gantt-tick-line';
    const lbl  = document.createElement('div'); lbl.className  = 'gantt-tick-label'; lbl.textContent = s;
    tick.appendChild(line); tick.appendChild(lbl);
    ticks.appendChild(tick);
  }
  ticks.style.width = totalW + 'px';
}

function updateCursors(sec) {
  document.querySelectorAll('.gantt-cursor').forEach(c => { c.style.left = (sec * TICK_PX) + 'px'; });
  const scroll = document.getElementById('ganttScroll');
  if (!scroll) return;
  const cursorX = sec * TICK_PX + 64;
  if (cursorX > scroll.scrollLeft + scroll.offsetWidth - 20) scroll.scrollLeft = cursorX - scroll.offsetWidth + 80;
}

function startGanttTimer() {
  if (ganttTimer) return;
  ganttTimer = setInterval(() => {
    ganttSeconds++;
    drawTicks(ganttSeconds);
    updateCursors(ganttSeconds);
    Object.entries(coreState).forEach(([name, s]) => {
      if (s.busy) { s.usedSeconds++; if (ganttSeconds >= s.finishTime) completeProcess(name); }
    });
    renderPowerStats();
    checkAllDone();
  }, Math.round(1000 / speed));
}

function stopGanttTimer()  { clearInterval(ganttTimer); ganttTimer = null; }
function resetGanttTimer() { ganttSeconds = 0; buildGantt(); }

buildGantt();
window.addEventListener('resize', buildGantt);

document.getElementById('ganttScroll').addEventListener('wheel', (e) => {
  e.preventDefault();
  e.currentTarget.scrollLeft += e.deltaY;
}, { passive: false });

/* 결과 테이블 + 전력 통계 */
function updateResultRow(name, wt, tt) {
  const proc = processes.find(p => p.name === name);
  if (!proc) return;
  const ntt = proc.bt > 0 ? +(tt / proc.bt).toFixed(2) : 0;
  resultData[name] = { at: proc.at, bt: proc.bt, wt, tt, ntt };
  renderResultTable();
  renderPowerStats();
}

function renderResultTable() {
  const tbody = document.getElementById('resultBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  processes.forEach(p => {
    const d  = resultData[p.name];
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${p.name}</td><td>${p.at}</td><td>${p.bt}</td><td>${d ? d.wt : '-'}</td><td>${d ? d.tt : '-'}</td><td>${d ? d.ntt : '-'}</td>`;
    tbody.appendChild(tr);
  });
}

function renderPowerStats() {
  const doneCount = Object.keys(resultData).length;
  let maxFinish = 0;
  Object.values(resultData).forEach(d => { const f = d.at + d.tt; if (f > maxFinish) maxFinish = f; });
  const ttVals = Object.values(resultData).map(d => d.tt);
  const avgTT  = ttVals.length ? +(ttVals.reduce((a, b) => a + b, 0) / ttVals.length).toFixed(2) : null;
  let totalWatt = 0, totalWork = 0;
  Object.values(coreState).forEach(s => {
    const cfg = POWER[s.type];
    if (s.everUsed) totalWatt += cfg.startup;
    totalWatt += s.usedSeconds * cfg.watt;
    totalWork += s.usedSeconds * cfg.work;
  });
  totalWatt = +totalWatt.toFixed(2);
  const perf = ganttSeconds > 0 ? +(totalWork / ganttSeconds).toFixed(2) : null;
  const eff  = totalWatt > 0    ? +(totalWork / totalWatt).toFixed(2)    : null;

  // 매 tick마다 히스토리 기록 (중복 시각 제외)
  if (ganttSeconds > 0) {
    const last = perfHistory[perfHistory.length - 1];
    if (!last || last.t !== ganttSeconds) {
      if (perf !== null) perfHistory.push({ t: ganttSeconds, v: perf });
      if (eff  !== null) effHistory.push({  t: ganttSeconds, v: eff  });
    }
  }

  const set  = (id, val, unit = '') => { const el = document.getElementById(id); if (el) el.textContent = val !== null ? `${val}${unit}` : '-'; };
  set('pwVal-perf',  perf,                             ' work/s');
  set('pwVal-eff',   eff,                              ' work/W');
  set('pwVal-count', doneCount > 0 ? doneCount : null, '개');
  set('pwVal-time',  maxFinish > 0 ? maxFinish : null, 's');
  set('pwVal-avg',   avgTT,                            's');
  set('pwVal-total', totalWatt > 0 ? totalWatt : null, ' W');

  drawStatCanvas('perfCanvas', perfHistory, '#d05050');
  drawStatCanvas('effCanvas',  effHistory,  '#4080cc');
}

renderResultTable();
renderPowerStats();

/* Canvas 꺾은선 그래프 */
function drawStatCanvas(canvasId, history, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // DPI 대응
  const W = canvas.offsetWidth  || 220;
  const H = canvas.offsetHeight || 100;
  if (canvas.width !== W * devicePixelRatio) {
    canvas.width  = W * devicePixelRatio;
    canvas.height = H * devicePixelRatio;
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const PAD = { top: 10, right: 10, bottom: 22, left: 36 };
  const cw = W - PAD.left - PAD.right;
  const ch = H - PAD.top  - PAD.bottom;

  // 빈 데이터면 축만 그리기
  const data = history.filter(d => d.v !== null);

  const maxT = data.length > 0 ? data[data.length - 1].t : 10;
  const maxV = data.length > 0 ? Math.max(...data.map(d => d.v)) * 1.2 : 1;

  const tx = t => PAD.left + (t / maxT) * cw;
  const ty = v => PAD.top  + ch - (v / maxV) * ch;

  // 격자
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth   = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + (ch / 4) * i;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cw, y); ctx.stroke();
  }

  // Y축 레이블
  ctx.fillStyle  = '#999';
  ctx.font       = '9px sans-serif';
  ctx.textAlign  = 'right';
  for (let i = 0; i <= 4; i++) {
    const v = maxV * (1 - i / 4);
    const y = PAD.top + (ch / 4) * i;
    ctx.fillText(v.toFixed(1), PAD.left - 4, y + 3);
  }

  // X축 레이블
  ctx.textAlign = 'center';
  const tickCount = Math.min(5, maxT);
  for (let i = 0; i <= tickCount; i++) {
    const t = Math.round((maxT / tickCount) * i);
    ctx.fillText(t + 's', tx(t), H - PAD.bottom + 13);
  }

  // 축선
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top); ctx.lineTo(PAD.left, PAD.top + ch);
  ctx.lineTo(PAD.left + cw, PAD.top + ch);
  ctx.stroke();

  if (data.length < 2) return;

  // 영역 채우기
  ctx.beginPath();
  ctx.moveTo(tx(data[0].t), PAD.top + ch);
  data.forEach(d => ctx.lineTo(tx(d.t), ty(d.v)));
  ctx.lineTo(tx(data[data.length - 1].t), PAD.top + ch);
  ctx.closePath();
  ctx.fillStyle = color + '22';
  ctx.fill();

  // 꺾은선
  ctx.beginPath();
  ctx.moveTo(tx(data[0].t), ty(data[0].v));
  data.forEach(d => ctx.lineTo(tx(d.t), ty(d.v)));
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2;
  ctx.lineJoin    = 'round';
  ctx.stroke();

  // 마지막 점 강조
  const last = data[data.length - 1];
  ctx.beginPath();
  ctx.arc(tx(last.t), ty(last.v), 3.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}
/* 비교 모드 — 스케줄링 시뮬레이터 */
const CMP_TICK = 28; // 비교 간트 1초 = 28px

/**
 * 알고리즘별 스케줄링 시뮬레이션 (순수 계산)
 * @param {string} algo  - 'FCFS'|'SJF'|'SRTF'|'Round Robin'|'Priority'|'HRN'
 * @param {Array}  procs - [{name, at, bt}, ...]
 * @param {number} numP  - P-core 수
 * @param {number} numE  - E-core 수
 * @param {number} tq    - Time Quantum (Round Robin용)
 * @returns {{ blocks, stats, summary }}
 */
function runSimulation(algo, procs, numP, numE, tq = 2) {
  if (!procs.length || (numP + numE) === 0) return { blocks: [], stats: {}, summary: {} };

  /* 프로세스 복사 */
  const ps = procs.map(p => ({
    name: p.name, at: p.at, bt: p.bt,
    rem: p.bt,          // 남은 burst time
    firstRun: null,
    finish: null,
    done: false,
  }));

  /* 코어 초기화 */
  const cores = [];
  for (let i = 1; i <= numP; i++) cores.push({ name: `P-core ${i}`, type: 'p', work: POWER.p.work, proc: null, qLeft: 0 });
  for (let i = 1; i <= numE; i++) cores.push({ name: `E-core ${i}`, type: 'e', work: POWER.e.work, proc: null, qLeft: 0 });

  const coreNames = cores.map(c => c.name);
  const readyQueue   = [];
  const openBlocks   = {};
  const finishedBlocks = [];

  const getProc  = name => ps.find(p => p.name === name);

  function openBlock(core, t) {
    openBlocks[core.name] = { coreName: core.name, coreType: core.type, procName: core.proc, start: t };
  }
  function closeBlock(core, t) {
    const b = openBlocks[core.name];
    if (b) {
      if (t > b.start) finishedBlocks.push({ ...b, dur: t - b.start });
      delete openBlocks[core.name];
    }
  }

  /* 레디큐에서 다음 프로세스 선택 */
  function selectNext(t) {
    if (!readyQueue.length) return null;
    let idx = 0;
    if (algo === 'SJF' || algo === 'SRTF') {
      for (let i = 1; i < readyQueue.length; i++)
        if ((getProc(readyQueue[i])?.rem ?? Infinity) < (getProc(readyQueue[idx])?.rem ?? Infinity)) idx = i;
    } else if (algo === 'Priority') {
      for (let i = 1; i < readyQueue.length; i++)
        if ((getProc(readyQueue[i])?.bt ?? Infinity) < (getProc(readyQueue[idx])?.bt ?? Infinity)) idx = i;
    } else if (algo === 'HRN') {
      let maxR = -1;
      for (let i = 0; i < readyQueue.length; i++) {
        const p = getProc(readyQueue[i]);
        if (!p) continue;
        const waited = Math.max(0, t - p.at - (p.bt - p.rem));
        const r = (waited + p.bt) / p.bt;
        if (r > maxR) { maxR = r; idx = i; }
      }
    }
    return readyQueue.splice(idx, 1)[0];
  }

  const MAX_T = 500;
  for (let t = 0; t < MAX_T; t++) {

    /* 새 도착 프로세스 → 레디큐 */
    ps.forEach(p => {
      if (!p.done && p.at === t && !readyQueue.includes(p.name) && !cores.some(c => c.proc === p.name))
        readyQueue.push(p.name);
    });

    /* SRTF: 새 도착으로 선점 여부 확인 */
    if (algo === 'SRTF') {
      cores.forEach(core => {
        if (!core.proc) return;
        const running = getProc(core.proc);
        if (!running) return;
        for (let i = 0; i < readyQueue.length; i++) {
          const rp = getProc(readyQueue[i]);
          if (rp && rp.rem < running.rem) {
            closeBlock(core, t);
            readyQueue.splice(i, 1);
            readyQueue.unshift(core.proc);
            core.proc = rp.name;
            core.qLeft = 0;
            if (rp.firstRun === null) rp.firstRun = t;
            openBlock(core, t);
            break;
          }
        }
      });
    }

    /* 빈 코어에 프로세스 배정 */
    cores.forEach(core => {
      if (core.proc) return;
      const name = selectNext(t);
      if (!name) return;
      core.proc = name;
      core.qLeft = tq;
      const p = getProc(name);
      if (p && p.firstRun === null) p.firstRun = t;
      openBlock(core, t);
    });

    /* 4. 1 tick 실행 */
    cores.forEach(core => {
      if (!core.proc) return;
      const p = getProc(core.proc);
      if (!p) { core.proc = null; return; }

      p.rem = Math.max(0, p.rem - core.work);
      if (algo === 'Round Robin') core.qLeft--;

      if (p.rem <= 0) {
        p.done = true; p.finish = t + 1;
        closeBlock(core, t + 1);
        core.proc = null; core.qLeft = 0;
      } else if (algo === 'Round Robin' && core.qLeft <= 0) {
        closeBlock(core, t + 1);
        readyQueue.push(core.proc);
        core.proc = null; core.qLeft = 0;
      }
    });

    if (ps.every(p => p.done)) break;
  }

  /* 남은 열린 블록 닫기 */
  const endT = Math.max(0, ...ps.filter(p => p.finish).map(p => p.finish));
  cores.forEach(core => closeBlock(core, endT));

  /* 통계 계산 */
  const stats = {};
  ps.forEach(p => {
    if (p.finish !== null) {
      const tt  = p.finish - p.at;
      const wt  = Math.max(0, tt - p.bt);
      const ntt = p.bt > 0 ? +(tt / p.bt).toFixed(2) : 0;
      stats[p.name] = { at: p.at, bt: p.bt, wt, tt, ntt };
    }
  });
  const vals   = Object.values(stats);
  const avgWT  = vals.length ? +(vals.reduce((s,v) => s+v.wt, 0)  / vals.length).toFixed(2) : 0;
  const avgTT  = vals.length ? +(vals.reduce((s,v) => s+v.tt, 0)  / vals.length).toFixed(2) : 0;
  const avgNTT = vals.length ? +(vals.reduce((s,v) => s+v.ntt, 0) / vals.length).toFixed(2) : 0;
  const makespan = endT;

  return {
    blocks:   finishedBlocks,
    coreNames,
    stats,
    summary:  { avgWT, avgTT, avgNTT, makespan, count: vals.length },
  };
}

/* 비교 간트 차트 렌더 */
function renderCmpGantt(containerId, blocks, coreNames) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const maxT  = blocks.length ? Math.max(...blocks.map(b => b.start + b.dur)) + 2 : 12;
  const totalW = maxT * CMP_TICK;

  coreNames.forEach(coreName => {
    const row = document.createElement('div');
    row.className = 'gantt-row';

    const lbl = document.createElement('div');
    lbl.className   = 'gantt-row-label ' + (coreName.startsWith('P') ? 'p-core' : 'e-core');
    lbl.textContent = coreName;

    const track = document.createElement('div');
    track.className   = 'gantt-track';
    track.style.width = totalW + 'px';

    blocks.filter(b => b.coreName === coreName).forEach(b => {
      const block = document.createElement('div');
      block.className = 'gantt-block ' + (b.coreType === 'p' ? 'gantt-block--p' : 'gantt-block--e');
      block.style.left  = (b.start * CMP_TICK) + 'px';
      block.style.width = Math.max(2, b.dur * CMP_TICK - 2) + 'px';
      block.textContent = b.procName;
      track.appendChild(block);
    });

    row.appendChild(lbl);
    row.appendChild(track);
    container.appendChild(row);
  });

  /* 타임라인 */
  const timeline = document.createElement('div');
  timeline.className = 'gantt-timeline';
  const spacer = document.createElement('div');
  spacer.className = 'gantt-timeline-spacer';
  const ticks = document.createElement('div');
  ticks.className   = 'gantt-ticks';
  ticks.style.width = totalW + 'px';
  for (let s = 0; s <= maxT; s++) {
    const tick  = document.createElement('div'); tick.className  = 'gantt-tick'; tick.style.left = (s * CMP_TICK) + 'px';
    const line  = document.createElement('div'); line.className  = 'gantt-tick-line';
    const tlbl  = document.createElement('div'); tlbl.className  = 'gantt-tick-label'; tlbl.textContent = s;
    tick.appendChild(line); tick.appendChild(tlbl); ticks.appendChild(tick);
  }
  timeline.appendChild(spacer); timeline.appendChild(ticks);
  container.appendChild(timeline);
}

/* 통계 패널 렌더 */
function renderCmpStats(containerId, summary, stats, procs) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const rows = procs.map(p => {
    const d = stats[p.name];
    return `<tr>
      <td>${p.name}</td><td>${p.at}</td><td>${p.bt}</td>
      <td>${d ? d.wt  : '-'}</td>
      <td>${d ? d.tt  : '-'}</td>
      <td>${d ? d.ntt : '-'}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <table class="result-table cmp-result-table">
      <thead><tr><th>프로세스</th><th>AT</th><th>BT</th><th>WT</th><th>TT</th><th>NTT</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="cmp-summary">
      <span>평균 WT <strong>${summary.avgWT}s</strong></span>
      <span>평균 TT <strong>${summary.avgTT}s</strong></span>
      <span>평균 NTT <strong>${summary.avgNTT}</strong></span>
      <span>전체 시간 <strong>${summary.makespan}s</strong></span>
    </div>`;
}

/* 판정 렌더 */
function renderVerdict(algo1, s1, algo2, s2) {
  const metrics = [
    { label: '평균 대기시간(WT)',  key: 'avgWT'  },
    { label: '평균 반환시간(TT)',  key: 'avgTT'  },
    { label: '평균 NTT',          key: 'avgNTT' },
    { label: '전체 수행시간',      key: 'makespan'},
  ];
  let score1 = 0, score2 = 0;
  const rows = metrics.map(m => {
    const v1 = s1[m.key], v2 = s2[m.key];
    let w = 0;
    if (v1 < v2) { score1++; w = 1; }
    else if (v2 < v1) { score2++; w = 2; }
    const mark = w === 1 ? `<span class="verdict-win">✔ ${algo1}</span>`
               : w === 2 ? `<span class="verdict-win">✔ ${algo2}</span>`
               : `<span class="verdict-tie">동점</span>`;
    return `<tr><td>${m.label}</td><td>${v1}</td><td>${v2}</td><td>${mark}</td></tr>`;
  }).join('');

  let banner, bannerClass;
  if (score1 > score2)      { banner = `🏆 <strong>${algo1}</strong> 이 더 효율적입니다! (${score1} vs ${score2})`; bannerClass = 'verdict-left'; }
  else if (score2 > score1) { banner = `🏆 <strong>${algo2}</strong> 이 더 효율적입니다! (${score2} vs ${score1})`; bannerClass = 'verdict-right'; }
  else                      { banner = `🤝 두 알고리즘이 동점입니다! (${score1} vs ${score2})`;                     bannerClass = 'verdict-draw'; }

  const el = document.getElementById('cmpVerdict');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = `
    <div class="verdict-banner ${bannerClass}">${banner}</div>
    <table class="verdict-table">
      <thead><tr><th>지표</th><th>${algo1}</th><th>${algo2}</th><th>우위</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* 비교 모드 UI 제어*/
function toggleCompare() {
  const toggle = document.getElementById('modeToggle');
  if (toggle && toggle.classList.contains('active')) {
    closeCompare();
  } else {
    openCompare();
  }
}

function openCompare() {
  if (!processes.length) {
    alert('프로세스를 먼저 추가해주세요.');
    return;
  }
  /* 토글 ON */
  const toggle = document.getElementById('modeToggle');
  const icon   = document.getElementById('mtogIcon');
  if (toggle) toggle.classList.add('active');
  if (icon)   icon.textContent = '⚖️';

  document.getElementById('cmpVerdict').style.display = 'none';
  document.getElementById('cmpGantt1').innerHTML  = '';
  document.getElementById('cmpGantt2').innerHTML  = '';
  document.getElementById('cmpStats1').innerHTML  = '';
  document.getElementById('cmpStats2').innerHTML  = '';
  document.getElementById('compareOverlay').classList.remove('hidden');
}

function closeCompare() {
  /* 토글 OFF */
  const toggle = document.getElementById('modeToggle');
  const icon   = document.getElementById('mtogIcon');
  if (toggle) toggle.classList.remove('active');
  if (icon)   icon.textContent = '🖥️';

  document.getElementById('compareOverlay').classList.add('hidden');
}

function updateCmpTQ() {
  const a1   = document.getElementById('cmpAlgo1').value;
  const a2   = document.getElementById('cmpAlgo2').value;
  const wrap = document.getElementById('cmpTqWrap');
  if (wrap) wrap.style.display =
    (a1 === 'Round Robin' || a2 === 'Round Robin') ? 'flex' : 'none';
}

function runComparison() {
  const algo1 = document.getElementById('cmpAlgo1').value;
  const algo2 = document.getElementById('cmpAlgo2').value;
  const tq    = +document.getElementById('cmpTqInput').value || 2;
  const numP  = +pSlider.value;
  const numE  = +eSlider.value;

  const r1 = runSimulation(algo1, processes, numP, numE, tq);
  const r2 = runSimulation(algo2, processes, numP, numE, tq);

  /* 알고리즘 이름 레이블 업데이트 */
  document.getElementById('cmpLabel1').textContent = algo1;
  document.getElementById('cmpLabel2').textContent = algo2;

  renderCmpGantt('cmpGantt1', r1.blocks, r1.coreNames);
  renderCmpGantt('cmpGantt2', r2.blocks, r2.coreNames);
  renderCmpStats('cmpStats1', r1.summary, r1.stats, processes);
  renderCmpStats('cmpStats2', r2.summary, r2.stats, processes);
  renderVerdict(algo1, r1.summary, algo2, r2.summary);
}

/* 스크롤 휠 → 가로 스크롤 */
['cmpGanttScroll1','cmpGanttScroll2'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('wheel', e => { e.preventDefault(); el.scrollLeft += e.deltaY; }, { passive: false });
});

/* 오버레이 배경 클릭으로 닫기 */
document.getElementById('compareOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeCompare();
});