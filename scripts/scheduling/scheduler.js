// 스케줄러 로직(추후 추가 예정 - 현재 FCFS로 임시)
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
    updateResultRow(
      procName,
      Math.max(0, ps.startTime - ps.arrivalInQueue),
      Math.max(0, ganttSeconds - proc.at)
    );
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
    btn.textContent = '시작';
    btn.classList.remove('running');
    processes.forEach(p => {
      const droplet = document.getElementById(`cloud-${p.name}`)?.querySelector('.droplet');
      if (droplet) droplet.style.opacity = '1';
    });
  }
}
