// ─────────────────────────────────────────────────────────────
// ui.js — 단계(STEP) 네비게이션, 상태 표시, 등록 로그
// ─────────────────────────────────────────────────────────────

function setStep(n) {
  currentStep = n;
  [1,2,3].forEach(i => {
    const card = document.getElementById('step'+i);
    const pip  = document.getElementById('pip'+i);
    card.classList.remove('active','done','locked');
    pip.classList.remove('active','done','locked');
    if (i < n) { card.classList.add('done'); pip.classList.add('done'); }
    else if (i === n) { card.classList.add('active'); pip.classList.add('active'); }
    else { card.classList.add('locked'); pip.classList.add('locked'); }
  });
  document.getElementById('line1').style.background = n > 1 ? 'var(--success)' : 'var(--border)';
  document.getElementById('line2').style.background = n > 2 ? 'var(--success)' : 'var(--border)';
  setTimeout(() => document.getElementById('step'+n).scrollIntoView({behavior:'smooth',block:'start'}), 80);
  if (n === 2) initDropZone();
}

function goToStep(n) {
  if (n >= currentStep) return;
  if (n === 2) resetStep3UI();
  setStep(n);
}

function resetStep3UI() {
  document.getElementById('registerBtn').disabled = false;
  document.getElementById('progressWrap').style.display = 'none';
  document.getElementById('progressText').style.display = 'none';
  document.getElementById('logBox').style.display = 'none';
  document.getElementById('logBox').innerHTML = '';
  document.getElementById('summaryStats').style.display = 'none';
  document.getElementById('progressBar').style.width = '0%';
}

function setStatus(id, type, msg) {
  document.getElementById(id).innerHTML =
    `<div class="status-bar ${type}"><div class="dot dot-${type==='info'?'yellow':type==='success'?'green':'red'}"></div><span>${msg}</span></div>`;
}

function log(msg, type='') {
  const box = document.getElementById('logBox');
  box.innerHTML += `<div class="${type?'log-'+type:''}">${msg}</div>`;
  box.scrollTop = box.scrollHeight;
}
