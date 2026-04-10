// 전역 변수 & 상수
let processes = [];
let pidCount  = 1;
let speed     = 1;
let running   = false;
let dropTimers = [];

//  간트관련  변수
let ganttTimer   = null;
let ganttSeconds = 0;
const TICK_PX    = 40;
const MAX_CORES  = 4;

//  문맥 교환 카운터
let contextSwitchCount = 0;

//  전력 상수
const POWER = {
  p: { work: 2, watt: 3, startup: 0.5 },
  e: { work: 1, watt: 1, startup: 0.1 },
};

//  스케줄링 상태
const coreState    = {};
const resultData   = {};
const processState = {};

//  그래프 히스토리
const perfHistory = [];
const effHistory  = [];
