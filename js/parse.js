// ─────────────────────────────────────────────────────────────
// parse.js — 표/PDF 파싱, 드래그&드롭, 일정 평탄화
// ─────────────────────────────────────────────────────────────

let dropInited = false;

function initDropZone() {
  if (dropInited) return;
  dropInited = true;
  const zone = document.getElementById('dropZone');
  ['dragenter','dragover'].forEach(e => zone.addEventListener(e, ev => { ev.preventDefault(); zone.classList.add('dragging'); }));
  ['dragleave','dragend'].forEach(e => zone.addEventListener(e, ev => { if (!zone.contains(ev.relatedTarget)) zone.classList.remove('dragging'); }));
  zone.addEventListener('drop', ev => {
    ev.preventDefault(); zone.classList.remove('dragging');
    const files = ev.dataTransfer.files;
    if (files && files.length > 0) { handleDroppedFile(files[0]); return; }
    const text = ev.dataTransfer.getData('text/plain');
    if (text) document.getElementById('pasteArea').value = text;
  });
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => { if (!document.getElementById('dropZone').contains(e.target)) e.preventDefault(); });
}

async function parsePdfToText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allItems = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      const text = item.str.trim();
      if (!text) continue;
      allItems.push({ x: item.transform[4], y: item.transform[5], text });
    }
  }

  // 위→아래(y 내림차순), 좌→우(x 오름차순) 정렬
  allItems.sort((a, b) => (b.y - a.y) || (a.x - b.x));

  // 1. 헤더 탐지 (GAP=6으로 초기 클러스터링)
  const INIT_GAP = 6;
  const initRows = [];
  for (const item of allItems) {
    const last = initRows[initRows.length - 1];
    if (!last || item.y < last[0].y - INIT_GAP) initRows.push([item]);
    else last.push(item);
  }

  let noX = -1, dateX = -1, hallX = -1, equipX = -1, descX = -1, headerY = -1;
  for (const row of initRows) {
    const sorted = [...row].sort((a, b) => a.x - b.x);
    const find = fn => sorted.find(i => fn(i.text.toLowerCase()));
    const noI = find(t => t === 'no.' || t === 'no');
    const dI  = find(t => t === 'date');
    const hI  = find(t => t.includes('datahall') || t === 'data hall');
    const eI  = find(t => t.includes('system') || t.includes('equipment'));
    const xI  = find(t => t.includes('description'));
    if (dI && hI && eI) {
      if (noI) noX = noI.x;
      dateX = dI.x; hallX = hI.x; equipX = eI.x;
      descX = xI ? xI.x : equipX + (equipX - hallX);
      headerY = Math.max(...row.map(i => i.y));
      break;
    }
  }

  if (dateX === -1) {
    return initRows.map(r => r.sort((a,b) => a.x-b.x).map(i => i.text).join('\t')).join('\n');
  }

  // 컬럼 경계: 헤더 X 중간값 사용 (실제 데이터가 헤더보다 왼쪽에 있어도 정확히 분류)
  const noDateMid   = noX >= 0 ? (noX + dateX) / 2 : dateX - 20;
  const dateHallMid = (dateX + hallX) / 2;
  const hallEquipMid = (hallX + equipX) / 2;
  const equipDescMid = (equipX + descX) / 2;

  function colOf(x) {
    if (x < noDateMid)    return 'no';
    if (x < dateHallMid)  return 'date';
    if (x < hallEquipMid) return 'hall';
    if (x < equipDescMid) return 'equip';
    return 'desc';
  }

  // 2. 헤더 아래 데이터 아이템
  const dataItems = allItems.filter(i => i.y < headerY - 3);

  // 3. No. 컬럼의 숫자를 행 앵커로 사용
  //    (날짜 클러스터링 방식 대신 → multi-line 셀 간격과 행 간격이 겹쳐도 안전)
  const noItems = dataItems
    .filter(i => colOf(i.x) === 'no' && /^\d+$/.test(i.text.trim()))
    .sort((a, b) => b.y - a.y);

  if (noItems.length === 0) {
    return initRows.map(r => r.sort((a,b) => a.x-b.x).map(i => i.text).join('\t')).join('\n');
  }

  const anchors = noItems.map(n => ({ y: n.y, dateParts: [], hall: [], equip: [] }));

  // 4. 모든 데이터 아이템을 Y 거리 기준으로 가장 가까운 앵커에 배정
  function nearestIdx(y) {
    let best = -1, bestDist = Infinity;
    for (let i = 0; i < anchors.length; i++) {
      const dist = Math.abs(y - anchors[i].y);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return best;
  }

  for (const item of dataItems) {
    const col = colOf(item.x);
    if (col === 'no' || col === 'desc') continue;
    const ai = nearestIdx(item.y);
    if (ai < 0) continue;
    if (col === 'date') anchors[ai].dateParts.push(item);
    else anchors[ai][col].push(item);
  }

  // 5. 탭 구분 출력
  const lines = ['Date\tDatahall\tSystem / Equipment'];
  for (const a of anchors) {
    const dateText = a.dateParts.sort((p,q) => (q.y-p.y)||(p.x-q.x)).map(i => i.text).join(' ');
    const hall     = a.hall.sort( (p,q) => (q.y-p.y)||(p.x-q.x)).map(i => i.text).join(' ');
    const equip    = a.equip.sort((p,q) => (q.y-p.y)||(p.x-q.x)).map(i => i.text).join(' ');
    if (hall || equip) lines.push(`${dateText}\t${hall}\t${equip}`);
  }

  return lines.join('\n');
}

function handleDroppedFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const errEl = document.getElementById('parseError');
  if (['xlsx','xls'].includes(ext)) {
    errEl.textContent = 'Excel 파일은 직접 드롭 불가. Excel에서 표 복사(Ctrl+C) 후 Ctrl+V로 붙여넣기 해주세요.';
    errEl.style.display='block'; return;
  }
  if (ext === 'pdf') {
    errEl.style.display='none';
    const fi = document.getElementById('fileInfo');
    fi.textContent = `⏳ ${file.name} PDF 파싱 중...`;
    fi.style.display='block';
    parsePdfToText(file).then(text => {
      document.getElementById('pasteArea').value = text;
      fi.textContent = `📎 ${file.name} (${(file.size/1024).toFixed(1)} KB) PDF 로드 완료`;
    }).catch(e => {
      fi.style.display='none';
      errEl.textContent = 'PDF 파싱 오류: ' + e.message;
      errEl.style.display='block';
    });
    return;
  }
  if (!['csv','txt','tsv'].includes(ext)) {
    errEl.textContent = `지원하지 않는 형식(.${ext}). pdf / csv / txt / tsv를 사용해주세요.`;
    errEl.style.display='block'; return;
  }
  errEl.style.display='none';
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('pasteArea').value = e.target.result;
    const fi = document.getElementById('fileInfo');
    fi.textContent = `📎 ${file.name} (${(file.size/1024).toFixed(1)} KB) 로드 완료`;
    fi.style.display='block';
  };
  reader.readAsText(file,'UTF-8');
}

function parseDate(raw) {
  if (!raw) return null;
  raw = raw.trim().replace(/\n/g,' ').replace(/\s+/g,' ');
  const mmap = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};

  // "2026-Dec-07" → "2026-12-07" 정규화
  raw = raw.replace(/(\d{4})-([A-Za-z]{3})-/gi, (_, yr, mon) => {
    const m = mmap[mon.toLowerCase()];
    return m ? `${yr}-${String(m).padStart(2,'0')}-` : _;
  });

  function toISO(y, m, d) { return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

  // ISO 범위: "2026-12-01 ~ 2026-12-30"
  const isoRange = raw.match(/(\d{4})-(\d{2})-(\d{2})\s*[~–]\s*(\d{4})-(\d{2})-(\d{2})/);
  if (isoRange) {
    return { start:`${isoRange[1]}-${isoRange[2]}-${isoRange[3]}`, end:`${isoRange[4]}-${isoRange[5]}-${isoRange[6]}`, isRange:true };
  }

  // ISO 단일: "2026-12-07"
  const isoSingle = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoSingle) {
    const s = `${isoSingle[1]}-${isoSingle[2]}-${isoSingle[3]}`;
    return { start:s, end:s, isRange:false };
  }

  const curY = new Date().getFullYear();

  // 영문 월 범위: "Jun.18 ~ 19" / "Jun.18 ~ Jun.19" / "Jun.18 ~ Jul.02"
  const rangeRe = /([A-Za-z]{3,9})[.\s]?(\d{1,2})\s*[~–]\s*(?:([A-Za-z]{3,9})[.\s]?)?(\d{1,2})/i;
  const rm = raw.match(rangeRe);
  if (rm) {
    const m1 = mmap[rm[1].toLowerCase().slice(0,3)], d1 = parseInt(rm[2]);
    const m2 = rm[3] ? mmap[rm[3].toLowerCase().slice(0,3)] : m1, d2 = parseInt(rm[4]);
    if (m1 && m2 && !isNaN(d1) && !isNaN(d2))
      return { start:toISO(curY,m1,d1), end:toISO(curY,m2,d2), isRange:true };
  }

  // 영문 월 단일: "Jun.01"
  const sm = raw.match(/([A-Za-z]{3,9})[.\s]?(\d{1,2})/i);
  if (sm) {
    const m = mmap[sm[1].toLowerCase().slice(0,3)], d = parseInt(sm[2]);
    if (m && !isNaN(d)) { const s=toISO(curY,m,d); return {start:s,end:s,isRange:false}; }
  }

  return null;
}

// 연속된 날짜(달력상 바로 다음 날)끼리 묶음. 주말·공휴일이 빠지면 자연히 끊겨 주 단위 블록이 된다.
function groupConsecutive(dates) {
  const groups = [];
  for (const d of dates) {
    const last = groups[groups.length - 1];
    if (last && incrementDate(last[last.length - 1]) === d) last.push(d);
    else groups.push([d]);
  }
  return groups;
}

function flattenEvents(events) {
  const flat = [];
  for (const ev of events) {
    const title = `[${ev.datahall}] ${ev.equipment}`;
    if (ev.isRange) {
      // 범위 일정 → 토·일·공휴일 제외 후, 연속된 평일끼리 묶어 기간 일정으로 등록
      // (예: 8/1이 일요일이면 8/2~8/6 첫째 주, 8/9~8/13 둘째 주 … 식으로 한 건씩)
      const days = getDateRange(ev.startDate, ev.endDate).filter(d => !isHoliday(d));
      for (const g of groupConsecutive(days)) {
        const s = g[0], e = g[g.length - 1];
        flat.push({...ev, title, startDate:s, endDate:e, isRange: s !== e});
      }
    } else {
      // 단일 날짜 → 공휴일이면 스킵
      if (!isHoliday(ev.startDate)) flat.push({...ev, title});
    }
  }
  return flat;
}

// 탭 구분 형식인지 확인
function isTabFormat(raw) {
  const lines = raw.split('\n').filter(l => l.trim());
  const tabLines = lines.filter(l => l.includes('\t'));
  return tabLines.length >= 2;
}

// 줄 단위 형식 파싱 (메일 복사 시)
function parseLineFormat(lines) {
  const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  function isDateLine(s) {
    const sl = s.toLowerCase();
    return MONTHS.some(m => sl.startsWith(m)) || /^\d{4}-/.test(s);
  }
  function isRowNum(s) { return /^\d+$/.test(s.trim()); }
  function isDatahall(s) { return /^(ICN|Office|STORAGE)/i.test(s.trim()); }

  // 헤더 블록 끝 찾기 (description 다음부터 데이터)
  let headerEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes('description')) { headerEnd = i + 1; break; }
  }
  if (headerEnd === 0) return null;

  const data = lines.slice(headerEnd);
  const rows = [];
  let i = 0;

  while (i < data.length) {
    if (!isRowNum(data[i])) { i++; continue; }
    i++; // skip row number

    // Date (1~2 lines: "Jun.01 ~" + "Jun.30")
    const dateParts = [];
    if (i < data.length && isDateLine(data[i])) {
      dateParts.push(data[i]); i++;
      if (i < data.length && isDateLine(data[i]) && dateParts[0].trim().endsWith('~')) {
        dateParts.push(data[i]); i++;
      }
    }
    const rawDate = dateParts.join(' ').trim();

    // Datahall (1~2 lines: may have ICN57... + ICN80...)
    const hallParts = [];
    while (i < data.length && !isRowNum(data[i]) && !isDateLine(data[i]) && isDatahall(data[i])) {
      hallParts.push(data[i]); i++;
      if (hallParts.length >= 2) break;
    }
    // fallback: non-date, non-number line
    if (hallParts.length === 0 && i < data.length && !isRowNum(data[i]) && !isDateLine(data[i])) {
      hallParts.push(data[i]); i++;
    }
    const rawHall = hallParts.join(' ').trim();

    // Equipment
    const rawEquip = (i < data.length && !isRowNum(data[i])) ? data[i++] : '';

    // Description (skip, may be multi-line)
    while (i < data.length && !isRowNum(data[i])) i++;

    if (rawDate || rawEquip) rows.push({ rawDate, rawHall, rawEquip });
  }
  return rows;
}

function parseTable() {
  const raw = document.getElementById('pasteArea').value;
  const errEl = document.getElementById('parseError');
  errEl.style.display='none';
  if (!raw.trim()) { errEl.textContent='표를 붙여넣기 해주세요.'; errEl.style.display='block'; return; }

  EVENTS = [];
  let lastDate = null;

  if (isTabFormat(raw)) {
    // ── 탭 구분 형식 (엑셀/워드 복사) ──────────────────────
    const rows = raw.split('\n').map(l=>l.trim()).filter(l=>l).map(l=>l.split('\t').map(c=>c.trim()));
    let dateCol=-1, hallCol=-1, equipCol=-1, headerRow=-1;
    for (let i=0; i<rows.length; i++) {
      const r = rows[i].map(c=>c.toLowerCase());
      const dI = r.findIndex(c=>c.includes('date'));
      const hI = r.findIndex(c=>c.includes('datahall')||c.includes('data hall'));
      const eI = r.findIndex(c=>c.includes('system')||c.includes('equipment'));
      if (dI!==-1 && hI!==-1 && eI!==-1) { dateCol=dI; hallCol=hI; equipCol=eI; headerRow=i; break; }
    }
    if (headerRow===-1) {
      errEl.innerHTML='헤더 행을 찾을 수 없습니다.<br><strong>Date</strong>, <strong>Datahall</strong>, <strong>System / Equipment</strong> 컬럼이 필요합니다.';
      errEl.style.display='block'; return;
    }
    let lastHall = '';
    for (let i=headerRow+1; i<rows.length; i++) {
      const row=rows[i];
      if (row.length < 3) continue;
      const rawDate=row[dateCol]||'', rawEquip=row[equipCol]||'';
      let rawHall=row[hallCol]||'';
      if (!rawHall && !rawEquip) continue;
      if (rawHall) lastHall = rawHall;
      else rawHall = lastHall;
      let dateObj = rawDate ? parseDate(rawDate) : lastDate;
      if (!dateObj) { console.warn('[MOP] 날짜 파싱 실패:', rawDate); continue; }
      lastDate = dateObj;
      EVENTS.push({no:EVENTS.length+1, startDate:dateObj.start, endDate:dateObj.end, isRange:dateObj.isRange, datahall:rawHall, equipment:rawEquip});
    }
  } else {
    // ── 줄 단위 형식 (메일 복사) ───────────────────────────
    const lines = raw.split('\n').map(l=>l.trim()).filter(l=>l);
    const parsed = parseLineFormat(lines);
    if (!parsed || parsed.length === 0) {
      errEl.innerHTML='헤더 행을 찾을 수 없습니다.<br>표에 <strong>Date</strong>, <strong>Datahall</strong>, <strong>System / Equipment</strong>, <strong>Description</strong> 헤더가 필요합니다.';
      errEl.style.display='block'; return;
    }
    for (const p of parsed) {
      let dateObj = p.rawDate ? parseDate(p.rawDate) : lastDate;
      if (!dateObj) { console.warn('[MOP] 날짜 파싱 실패:', p.rawDate); continue; }
      lastDate = dateObj;
      EVENTS.push({no:EVENTS.length+1, startDate:dateObj.start, endDate:dateObj.end, isRange:dateObj.isRange, datahall:p.rawHall, equipment:p.rawEquip});
    }
  }

  if (EVENTS.length===0) { errEl.textContent='파싱된 일정이 없습니다. 표 형식을 확인해주세요.'; errEl.style.display='block'; return; }

  FLAT_EVENTS = flattenEvents(EVENTS);

  document.getElementById('eventGrid').innerHTML = EVENTS.map(ev => {
    const fullMonth = ev.isRange && isFullMonthRange(ev.startDate, ev.endDate);
    const dateLabel = ev.isRange
      ? ev.startDate.slice(5).replace('-','.')+'~'+ev.endDate.slice(5).replace('-','.')
      : ev.startDate.slice(5).replace('-','.');
    return `<div class="event-row">
      <div class="ev-date">${dateLabel}${fullMonth?'<br><span style="font-size:10px;color:var(--muted);">평일만</span>':''}</div>
      <div class="ev-hall">${ev.datahall||'—'}</div>
      <div class="ev-equip">${ev.equipment}</div>
    </div>`;
  }).join('');

  const label = document.getElementById('labelSelect').value;
  const calId = getCurrentCalId();
  const calIdDisplay = calId === 'primary' ? '기본 캘린더 (ID 미설정)' : calId;
  document.getElementById('eventCount').textContent = FLAT_EVENTS.length;
  document.getElementById('calTargetInfo').innerHTML =
    `📅 캘린더: <strong>${label}</strong> &nbsp;|&nbsp; ID: <code style="color:var(--accent);font-family:'IBM Plex Mono',monospace;">${calIdDisplay}</code> &nbsp;|&nbsp; 등록 예정: <strong>${FLAT_EVENTS.length}건</strong>`+
    (FLAT_EVENTS.length !== EVENTS.length ? ` <span style="color:var(--muted)">(토·일·공휴일 제외, 연속 평일은 기간으로 묶어 ${FLAT_EVENTS.length}건)</span>` : '');

  stepDone[2]=true;
  setStep(3);
}

function clearPaste() {
  document.getElementById('pasteArea').value='';
  document.getElementById('parseError').style.display='none';
  document.getElementById('fileInfo').style.display='none';
  EVENTS=[]; FLAT_EVENTS=[];
}
