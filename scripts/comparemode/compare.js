// 비교 모드
const CMP_TICK = 28; //
//
function runSimulation(algo, procs, numP, numE, tq = 2) {
  if (!procs.length || (numP + numE) === 0) return { blocks: [], stats: {}, summary: {} };

  const ps = procs.map(p => ({
    name: p.name, at: p.at, bt: p.bt,
    rem: p.bt, firstRun: null, finish: null, done: false,
  }));

  const cores = [];
  for (let i = 1; i <= numP; i++) cores.push({ name: `P-core ${i}`, type: 'p', work: POWER.p.work, proc: null, qLeft: 0 });
  for (let i = 1; i <= numE; i++) cores.push({ name: `E-core ${i}`, type: 'e', work: POWER.e.work, proc: null, qLeft: 0 });

  const coreNames      = cores.map(c => c.name);
  const readyQueue     = [];
  const openBlocks     = {};
  const finishedBlocks = [];

  const getProc = name => ps.find(p => p.name === name);

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

  function selectNext(t) {
    if (!readyQueue.length) return null;
    let idx = 0;
    if (algo === 'SPN' || algo === 'SRTN') {
      for (let i = 1; i < readyQueue.length; i++)
        if ((getProc(readyQueue[i])?.rem ?? Infinity) < (getProc(readyQueue[idx])?.rem ?? Infinity)) idx = i;
    } else if (algo === 'HRRN') {
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
    ps.forEach(p => {
      if (!p.done && p.at === t && !readyQueue.includes(p.name) && !cores.some(c => c.proc === p.name))
        readyQueue.push(p.name);
    });

    if (algo === 'SRTN') {
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

    cores.forEach(core => {
      if (!core.proc) return;
      const p = getProc(core.proc);
      if (!p) { core.proc = null; return; }
      p.rem = Math.max(0, p.rem - core.work);
      if (algo === 'RR') core.qLeft--;
      if (p.rem <= 0) {
        p.done = true; p.finish = t + 1;
        closeBlock(core, t + 1);
        core.proc = null; core.qLeft = 0;
      } else if (algo === 'RR' && core.qLeft <= 0) {
        closeBlock(core, t + 1);
        readyQueue.push(core.proc);
        core.proc = null; core.qLeft = 0;
      }
    });

    if (ps.every(p => p.done)) break;
  }

  const endT = Math.max(0, ...ps.filter(p => p.finish).map(p => p.finish));
  cores.forEach(core => closeBlock(core, endT));

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
  const avgWT  = vals.length ? +(vals.reduce((s,v) => s+v.wt,  0) / vals.length).toFixed(2) : 0;
  const avgTT  = vals.length ? +(vals.reduce((s,v) => s+v.tt,  0) / vals.length).toFixed(2) : 0;
  const avgNTT = vals.length ? +(vals.reduce((s,v) => s+v.ntt, 0) / vals.length).toFixed(2) : 0;

  return { blocks: finishedBlocks, coreNames, stats, summary: { avgWT, avgTT, avgNTT, makespan: endT, count: vals.length } };
}

/* ── 비교 간트 렌더 ── */
function renderCmpGantt(containerId, blocks, coreNames) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const maxT   = blocks.length ? Math.max(...blocks.map(b => b.start + b.dur)) + 2 : 12;
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

/* ── 통계 패널 렌더 ── */
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

/* ── 판정 렌더 ── */
function renderVerdict(algo1, s1, algo2, s2) {
  const metrics = [
    { label: '평균 대기시간(WT)',  key: 'avgWT'   },
    { label: '평균 반환시간(TT)',  key: 'avgTT'   },
    { label: '평균 NTT',          key: 'avgNTT'  },
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
  if      (score1 > score2) { banner = `🏆 <strong>${algo1}</strong> 이 더 효율적입니다! (${score1} vs ${score2})`; bannerClass = 'verdict-left'; }
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

/* ── 비교 모드 UI 제어 ── */
function toggleCompare() {
  const toggle = document.getElementById('modeToggle');
  if (toggle && toggle.classList.contains('active')) closeCompare();
  else openCompare();
}

function openCompare() {
  if (!processes.length) { alert('프로세스를 먼저 추가해주세요.'); return; }
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
  if (wrap) wrap.style.display = (a1 === 'RR' || a2 === 'RR') ? 'flex' : 'none';
}

function runComparison() {
  const algo1 = document.getElementById('cmpAlgo1').value;
  const algo2 = document.getElementById('cmpAlgo2').value;
  const tq    = +document.getElementById('cmpTqInput').value || 2;
  const numP  = +pSlider.value;
  const numE  = +eSlider.value;

  const r1 = runSimulation(algo1, processes, numP, numE, tq);
  const r2 = runSimulation(algo2, processes, numP, numE, tq);

  document.getElementById('cmpLabel1').textContent = algo1;
  document.getElementById('cmpLabel2').textContent = algo2;

  renderCmpGantt('cmpGantt1', r1.blocks, r1.coreNames);
  renderCmpGantt('cmpGantt2', r2.blocks, r2.coreNames);
  renderCmpStats('cmpStats1', r1.summary, r1.stats, processes);
  renderCmpStats('cmpStats2', r2.summary, r2.stats, processes);
  renderVerdict(algo1, r1.summary, algo2, r2.summary);
}

/* ── 가로 스크롤 & 오버레이 닫기 ── */
['cmpGanttScroll1', 'cmpGanttScroll2'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('wheel', e => { e.preventDefault(); el.scrollLeft += e.deltaY; }, { passive: false });
});

document.getElementById('compareOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeCompare();
});
