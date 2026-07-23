// ─────────────────────────────────────────────────────────────
// calendar.js — Client ID/캘린더 ID 관리, Google 인증, 캘린더 등록
// ─────────────────────────────────────────────────────────────

function loadSavedClientId() {
  try {
    const saved = localStorage.getItem('mop_client_id');
    if (saved) {
      document.getElementById('clientId').value = saved;
      document.getElementById('savedHint').style.display = 'inline';
      document.getElementById('clearSavedBtn').style.display = 'inline-flex';
    }
  } catch(e) {}
}

function saveClientId(id) { try { localStorage.setItem('mop_client_id', id); } catch(e) {} }

function clearSavedId() {
  try { localStorage.removeItem('mop_client_id'); } catch(e) {}
  document.getElementById('clientId').value = '';
  document.getElementById('savedHint').style.display = 'none';
  document.getElementById('clearSavedBtn').style.display = 'none';
}

function onLabelChange() {
  const label = document.getElementById('labelSelect').value;
  const saved = calIds[label] || '';
  document.getElementById('calIdInput').value = saved;
  document.getElementById('calIdSavedHint').style.display = saved ? 'inline' : 'none';
}

function saveCalId() {
  const label = document.getElementById('labelSelect').value;
  const id = document.getElementById('calIdInput').value.trim();
  if (!id) { alert('캘린더 ID를 입력해주세요.'); return; }
  calIds[label] = id;
  saveCalIds(calIds);
  document.getElementById('calIdSavedHint').style.display = 'inline';
}

function getCurrentCalId() {
  const label = document.getElementById('labelSelect').value;
  return calIds[label] || 'primary';
}

function initGoogleAuth() {
  const clientId = document.getElementById('clientId').value.trim();
  if (!clientId) { setStatus('authStatus','error','Client ID를 입력해주세요.'); return; }
  setStatus('authStatus','info','Google 인증 초기화 중...');
  document.querySelector('#step1Buttons button').disabled = true;
  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/calendar.events',
      error_callback: (err) => {
        setStatus('authStatus','error','인증 취소 또는 오류: ' + (err.type || '알 수 없음'));
        document.querySelector('#step1Buttons button').disabled = false;
      },
      callback: (res) => {
        if (res.error) {
          setStatus('authStatus','error','인증 실패: '+res.error);
          document.querySelector('#step1Buttons button').disabled = false;
          return;
        }
        accessToken = res.access_token;
        saveClientId(clientId);
        document.getElementById('savedHint').style.display = 'inline';
        document.getElementById('clearSavedBtn').style.display = 'inline-flex';
        document.getElementById('step1DoneBadge').style.display = 'inline';
        document.getElementById('authStatus').innerHTML = '';
        stepDone[1] = true;
        setStep(2);
      }
    });
    tokenClient.requestAccessToken();
  } catch(e) {
    setStatus('authStatus','error','오류: '+e.message);
    document.querySelector('#step1Buttons button').disabled = false;
  }
}

// 종일 일정의 end.date는 배타적(exclusive) → 마지막 날 +1
function eventEndDate(ev) {
  return ev.isRange ? incrementDate(ev.endDate) : incrementDate(ev.startDate);
}

// 중복 판별 키: 시작일 | 종료일(배타) | 제목  (등록할 이벤트와 기존 이벤트 모두 동일 규칙)
function eventKey(startDate, endDate, summary) {
  return `${startDate}|${endDate}|${summary}`;
}

async function createCalendarEvent(ev, calId) {
  const body = {
    summary: ev.title,
    description: `Datahall: ${ev.datahall}\nSystem/Equipment: ${ev.equipment}`,
    start: { date: ev.startDate },
    end:   { date: eventEndDate(ev) }
  };
  const encodedCalId = encodeURIComponent(calId);
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodedCalId}/events`, {
    method:'POST',
    headers:{'Authorization':'Bearer '+accessToken,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  if (!res.ok) { const err=await res.json(); throw new Error(err.error?.message||res.status); }
  return await res.json();
}

// 등록 대상 날짜 범위의 기존 일정을 조회해, 중복 판별용 키 Set을 반환한다.
async function fetchExistingEventKeys(calId, events) {
  let minStart = events[0].startDate, maxEnd = eventEndDate(events[0]);
  for (const ev of events) {
    if (ev.startDate < minStart) minStart = ev.startDate;
    const e = eventEndDate(ev);
    if (e > maxEnd) maxEnd = e;
  }
  const timeMin = `${minStart}T00:00:00Z`;
  const timeMax = `${incrementDate(maxEnd)}T00:00:00Z`;   // 경계 여유로 하루 확장
  const encodedCalId = encodeURIComponent(calId);
  const keys = new Set();
  let pageToken = '';
  do {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalId}/events`
      + `?singleEvents=true&showDeleted=false&maxResults=2500`
      + `&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`
      + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const res = await fetch(url, { headers:{'Authorization':'Bearer '+accessToken} });
    if (!res.ok) { const err=await res.json(); throw new Error(err.error?.message||res.status); }
    const data = await res.json();
    for (const item of (data.items || [])) {
      // 종일 일정만 대상 (start.date 존재). 시간 일정(start.dateTime)은 무시.
      if (item.start && item.start.date && item.end && item.end.date && item.summary != null) {
        keys.add(eventKey(item.start.date, item.end.date, item.summary));
      }
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return keys;
}

async function startRegistration() {
  if (FLAT_EVENTS.length===0) return;
  document.getElementById('registerBtn').disabled=true;
  document.getElementById('progressWrap').style.display='block';
  document.getElementById('progressText').style.display='block';
  document.getElementById('logBox').style.display='block';

  let ok=0, err=0, skip=0;
  const total=FLAT_EVENTS.length;
  const calId=getCurrentCalId();

  // 중복 방지: 체크 시 기존 일정을 미리 조회해 둔다.
  let existing = null;
  if (document.getElementById('dedupCheck').checked) {
    log('기존 일정 조회 중... (중복 검사)');
    try {
      existing = await fetchExistingEventKeys(calId, FLAT_EVENTS);
      log(`기존 일정 ${existing.size}건 확인 — 동일 일정은 건너뜁니다.`, 'ok');
    } catch(e) {
      existing = null;
      log(`⚠ 기존 일정 조회 실패 — 중복 검사 없이 진행합니다: ${e.message}`, 'err');
    }
  }

  for (let i=0; i<FLAT_EVENTS.length; i++) {
    const ev=FLAT_EVENTS[i];
    document.getElementById('progressBar').style.width=Math.round((i/total)*100)+'%';
    document.getElementById('progressText').textContent=`${i} / ${total}`;
    const dLabel = ev.isRange && ev.endDate !== ev.startDate
      ? ev.startDate.slice(5).replace('-','.')+'~'+ev.endDate.slice(5).replace('-','.')
      : ev.startDate.slice(5).replace('-','.');
    const key = eventKey(ev.startDate, eventEndDate(ev), ev.title);
    if (existing && existing.has(key)) {
      skip++;
      log(`⤴ ${dLabel}  ${ev.title} — 이미 있음 (건너뜀)`);
      continue;
    }
    try {
      await createCalendarEvent(ev, calId);
      ok++;
      if (existing) existing.add(key);   // 같은 표 안의 중복도 방지
      log(`✓ ${dLabel}  ${ev.title}`,'ok');
    } catch(e) {
      err++;
      log(`✗ ${dLabel}  ${ev.title} — ${e.message}`,'err');
    }
    await new Promise(r=>setTimeout(r,300));
  }

  document.getElementById('progressBar').style.width='100%';
  document.getElementById('progressText').textContent=`${total} / ${total}`;
  log('──────────────────────────────');
  log(`완료: 성공 ${ok}건 / 건너뜀 ${skip}건 / 실패 ${err}건`, err===0?'ok':'err');
  document.getElementById('statOk').textContent=ok;
  document.getElementById('statSkip').textContent=skip;
  document.getElementById('statErr').textContent=err;
  document.getElementById('statTotal').textContent=total;
  document.getElementById('summaryStats').style.display='grid';
}
