// ─────────────────────────────────────────────────────────────
// state.js — 앱 전역 공유 상태 + 캘린더 ID 저장소
// ─────────────────────────────────────────────────────────────

let tokenClient, accessToken = null;

let EVENTS = [], FLAT_EVENTS = [];

let currentStep = 1;

const stepDone = {1:false, 2:false};

const CAL_IDS_KEY = 'mop_cal_ids';

function loadCalIds() { try { return JSON.parse(localStorage.getItem(CAL_IDS_KEY) || '{}'); } catch(e) { return {}; } }

function saveCalIds(obj) { try { localStorage.setItem(CAL_IDS_KEY, JSON.stringify(obj)); } catch(e) {} }

// 캘린더 ID는 앱에서 입력·저장(localStorage)하며, 여기엔 기본값을 비워 둔다.
const DEFAULT_CAL_IDS = {
  '캘린더1': '',
  '캘린더2': '',
  '캘린더3': '',
  '캘린더4': '',
  '캘린더5': '',
  'Tasks':  '',
  '생일':    '',
};

let calIds = { ...DEFAULT_CAL_IDS, ...loadCalIds() };
