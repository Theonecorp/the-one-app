/* ============================================================
 *  📷 바코드 스캔 — 어디서나 같은 전체 화면 스캐너 (헤더 · 카탈로그 · 재고 · 아이템)
 *    카메라(html5-qrcode) · 카메라 전환 · 손전등 · 코드 직접 입력 · USB/블루투스 스캐너(키보드처럼 입력 → Enter)
 *    openScanner(onCode, { title, hint }) → 코드가 읽히면 onCode(text) 를 부르고 닫힘
 * ============================================================ */
import { $, esc, toast, bi, bt } from './ui.js';

const loadScript = (src, test) => test() ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('불러오지 못했습니다 (인터넷 확인) · could not load')); document.head.appendChild(s); });
export const loadScanner = () => loadScript('https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js', () => !!window.Html5Qrcode);

let SC = null, CAMS = [], CAM = 0, TORCH = false, OPEN = false;
async function stop() { if (SC) { try { await SC.stop(); } catch (e) {} try { SC.clear(); } catch (e) {} SC = null; } TORCH = false; }
export function closeScanner() { OPEN = false; stop(); const o = $('scanov'); if (o) o.classList.remove('on'); document.body.classList.remove('scanning'); }

export function openScanner(onCode, opt) {
  opt = opt || {};
  let o = $('scanov'); if (!o) { o = document.createElement('div'); o.id = 'scanov'; document.body.appendChild(o); }
  o.innerHTML = '<div class="sctop"><b>📷 ' + (opt.title || bi('바코드 스캔', 'Scan barcode')) + '</b><button type="button" class="hb" id="scX" title="' + esc(bt('닫기', 'Close')) + '">✕</button></div>' +
    '<div class="scview"><div id="scanV"></div><div class="scframe"><i></i></div><div class="schint" id="scHint">' + bt('카메라를 바코드에 맞추세요', 'Point the camera at the barcode') + '</div></div>' +
    '<div class="scbot"><div class="btns" style="margin:0 0 8px"><button type="button" class="b-ghost" id="scFlip">🔄 ' + bi('카메라 전환', 'Switch camera') + '</button><button type="button" class="b-ghost" id="scTorch">🔦 ' + bi('손전등', 'Torch') + '</button></div>' +
    '<div style="display:flex;gap:6px"><input id="scIn" placeholder="' + esc(bt('코드를 입력하거나 스캔하세요', 'Type a code or scan')) + '" autocomplete="off" autocapitalize="characters" enterkeyhint="go"><button type="button" class="b-blue" id="scUse">' + bt('사용', 'Use') + '</button></div>' +
    '<div class="muted" style="font-size:12px;margin-top:6px">' + (opt.hint || bt('휴대용 바코드 스캐너(USB · 블루투스)도 됩니다 — 스캔하면 코드가 자동으로 들어옵니다.', 'A handheld USB or Bluetooth scanner works too — the code is typed in automatically.')) + '</div></div>';
  o.classList.add('on'); document.body.classList.add('scanning'); OPEN = true;
  let done = false;
  const fire = async text => { text = String(text || '').trim(); if (!text || done) return; done = true; if (navigator.vibrate) try { navigator.vibrate(30); } catch (e) {} closeScanner(); try { await onCode(text); } catch (e) { toast(String(e.message || e), 'bad'); } };
  $('scX').onclick = closeScanner;
  $('scUse').onclick = () => fire($('scIn').value);
  $('scIn').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); fire($('scIn').value); } };
  $('scFlip').onclick = async () => { if (!CAMS.length || !SC) return; CAM = (CAM + 1) % CAMS.length; await start(fire); };
  $('scTorch').onclick = async () => { if (!SC) return; try { TORCH = !TORCH; await SC.applyVideoConstraints({ advanced: [{ torch: TORCH }] }); $('scTorch').classList.toggle('on', TORCH); } catch (e) { TORCH = false; toast(bt('이 카메라는 손전등을 켤 수 없습니다', 'This camera has no torch control'), 'bad'); } };
  start(fire);
  /* 키보드형 스캐너는 포커스된 칸에 글자를 넣으므로 입력 칸에 포커스 (폰에서는 키보드가 올라오지 않게 터치 기기면 건너뜀) */
  if (!('ontouchstart' in window)) setTimeout(() => { const i = $('scIn'); if (i && OPEN) i.focus(); }, 300);
}
async function start(fire) {
  await stop(); if (!OPEN) return;
  try {
    await loadScanner();
    if (!CAMS.length) { try { CAMS = (await window.Html5Qrcode.getCameras()) || []; } catch (e) { CAMS = []; } const back = CAMS.findIndex(c => /back|rear|environment|후면/i.test(c.label || '')); if (back >= 0) CAM = back; }
    const H = window.Html5QrcodeSupportedFormats || {};
    SC = new window.Html5Qrcode('scanV', { formatsToSupport: [H.UPC_A, H.UPC_E, H.EAN_13, H.EAN_8, H.CODE_128, H.CODE_39, H.QR_CODE].filter(x => x != null), experimentalFeatures: { useBarCodeDetectorIfSupported: true }, verbose: false });
    const cam = CAMS.length ? { deviceId: { exact: CAMS[CAM].id } } : { facingMode: 'environment' };
    await SC.start(cam, { fps: 10, qrbox: w => ({ width: Math.min(300, Math.round(w * 0.8)), height: 150 }), aspectRatio: 1.2 }, text => fire(text), () => {});
    if ($('scFlip')) $('scFlip').style.display = CAMS.length > 1 ? '' : 'none';
  } catch (e) {
    await stop();
    const h = $('scHint'); if (h) h.innerHTML = '<span class="warn">' + esc(bt('카메라를 쓸 수 없습니다 — 브라우저 카메라 권한을 허용하거나 아래에 코드를 입력하세요', 'Camera not available — allow camera access or type the code below')) + '</span>';
    const v = $('scanV'); if (v) v.classList.add('nocam');
    const i = $('scIn'); if (i && OPEN) i.focus();
  }
}
