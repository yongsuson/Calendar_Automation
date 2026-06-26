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

async function createCalendarEvent(ev, calId) {
  const body = {
    summary: ev.title,
    description: `Datahall: ${ev.datahall}\nSystem/Equipment: ${ev.equipment}`,
    start: { date: ev.startDate },
    end:   { date: ev.isRange ? incrementDate(ev.endDate) : incrementDate(ev.startDate) }
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

async function startRegistration() {
  if (FLAT_EVENTS.length===0) return;
  document.getElementById('registerBtn').disabled=true;
  document.getElementById('progressWrap').style.display='block';
  document.getElementById('progressText').style.display='block';
  document.getElementById('logBox').style.display='block';

  let ok=0, err=0;
  const total=FLAT_EVENTS.length;
  const calId=getCurrentCalId();

  for (let i=0; i<FLAT_EVENTS.length; i++) {
    const ev=FLAT_EVENTS[i];
    document.getElementById('progressBar').style.width=Math.round((i/total)*100)+'%';
    document.getElementById('progressText').textContent=`${i} / ${total}`;
    const dLabel = ev.isRange && ev.endDate !== ev.startDate
      ? ev.startDate.slice(5).replace('-','.')+'~'+ev.endDate.slice(5).replace('-','.')
      : ev.startDate.slice(5).replace('-','.');
    try {
      await createCalendarEvent(ev, calId);
      ok++;
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
  log(`완료: 성공 ${ok}건 / 실패 ${err}건`, ok===total?'ok':'err');
  document.getElementById('statOk').textContent=ok;
  document.getElementById('statErr').textContent=err;
  document.getElementById('statTotal').textContent=total;
  document.getElementById('summaryStats').style.display='grid';
}
