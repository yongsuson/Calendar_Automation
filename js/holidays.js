// ─────────────────────────────────────────────────────────────
// holidays.js — 한국 공휴일 및 날짜 계산 유틸 (DOM 비의존, 순수 함수)
// ─────────────────────────────────────────────────────────────

const FIXED_HOLIDAYS = new Set(['01-01','03-01','05-05','06-06','08-15','10-03','10-09','12-25']);

const LUNAR_HOLIDAYS = {
  2025: new Set(['01-28','01-29','01-30','05-06','10-05','10-06','10-07']),
  2026: new Set(['02-16','02-17','02-18','05-25','09-24','09-25','09-26']),
  2027: new Set(['02-06','02-07','02-08','05-14','10-14','10-15','10-16']),
};

function isHoliday(dateStr) {
  const d = new Date(dateStr);
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return true;
  const year = d.getFullYear();
  const mmdd = dateStr.slice(5);
  if (FIXED_HOLIDAYS.has(mmdd)) return true;
  if (LUNAR_HOLIDAYS[year] && LUNAR_HOLIDAYS[year].has(mmdd)) return true;
  return false;
}

function isFullMonthRange(startStr, endStr) {
  const s = new Date(startStr), e = new Date(endStr);
  if (s.getDate() !== 1) return false;
  const lastDay = new Date(s.getFullYear(), s.getMonth()+1, 0);
  return e.getDate() === lastDay.getDate() && e.getMonth() === s.getMonth() && e.getFullYear() === s.getFullYear();
}

function getDateRange(startStr, endStr) {
  const dates = [], cur = new Date(startStr), end = new Date(endStr);
  while (cur <= end) { dates.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }
  return dates;
}

function incrementDate(d) {
  const dt = new Date(d); dt.setDate(dt.getDate()+1); return dt.toISOString().slice(0,10);
}
