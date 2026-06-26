// ─────────────────────────────────────────────────────────────
// app.js — 시작 부트스트랩 (모든 모듈 로드 후 마지막에 실행)
// ─────────────────────────────────────────────────────────────

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
loadSavedClientId();
onLabelChange();
setStep(1);
