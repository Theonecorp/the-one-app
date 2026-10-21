/* ============================================================
 *  📮 UPS 픽업 — 라벨 붙여 포장이 끝난 주문(st:'packed')을 모아 UPS 트럭에 넘김
 *    · 오늘 나갈 것: 주문 · 가게 · 박스 · 무게 한눈에 (가게별)
 *    · 🖨 픽업 요약 (Pickup Summary) — UPS 계정 · 박스 수 바코드 + 박스마다 트래킹 바코드 · 기사 서명 칸 (WorldShip 의 하루 마감 보고서처럼)
 *    · 🚚 트럭 인계 — 박스를 스캔(또는 체크)해서 확인 → 기사 이름 · 서명 → 주문은 출고 완료(shipped), 박스 기록(shipments)에 인계 시각
 *    · 지난 픽업 기록 — 날짜 · 시각 · 박스 · 가게 · 기사 (다시 인쇄)
 *  pickups/{PU-YYYYMMDD-HHMM} = { d, at, by, driver, sig, n(박스), stores, orders:[id], trks:[], w, left:[트래킹(못 넘긴 것)] }
 * ============================================================ */
import { $, esc, toast, busy, openModal, closeModal, bi, bt, printOpen, today, sortBy, groupBy, md } from './ui.js';
import { barcodeSvg, loadJsBarcode, loadScanner } from './catpage.js';
import { goOrder } from './orders.js';

let S = null;
export function register(state) { S = state; }
const trksOf = o => String(o.track || '').split(/[\s,]+/).filter(Boolean);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 픽업 대기 모으기 — 주문 + 그 주문의 박스 기록(무게 · 인보이스) */
async function gather(LF) {
  let ords = await S.DB.list('orders', { where: [['st', '==', 'packed']] });
  if (LF && LF.sm) ords = ords.filter(o => o.sm === LF.sm);
  const ships = {};
  for (let i = 0; i < ords.length; i += 30) { const ids = ords.slice(i, i + 30).map(o => o.id); try { (await S.DB.list('shipments', { where: [['orderId', 'in', ids]] })).forEach(x => { ships[x.trk] = x; }); } catch (e) {} }
  const boxes = [];
  ords.forEach(o => { const T = trksOf(o); const n = Math.max(T.length, o.boxes || 0, 1); for (let i = 0; i < n; i++) { const t = T[i] || '', x = ships[t] || {}; boxes.push({ o, trk: t, box: i + 1, boxes: n, w: x.w || 0, invs: x.invs || o.invs || [], svc: x.svcName || x.svc || '' }); } });
  return { ords: sortBy(ords, o => o.store || ''), boxes };
}

export async function pickupPage(LF, head, again) {
  $('page').innerHTML = head + '<div class="load">' + bt('픽업 대기 읽는 중…', 'Loading…') + '</div>';
  let G, hist = [];
  try { [G, hist] = await Promise.all([gather(LF), S.DB.list('pickups', { order: ['at', 'desc'], limit: 15 }).catch(() => [])]); }
  catch (e) { $('page').innerHTML = head + '<div class="card"><div class="alert a-red">' + esc(e.code || e.message) + '</div></div>'; return; }
  const { ords, boxes } = G, stores = new Set(ords.map(o => o.acct || o.store)), w = boxes.reduce((a, b) => a + (Number(b.w) || 0), 0);
  const U = (S.settings && S.settings.ups) || {};
  let h = '<div class="card"><h2>📮 ' + bi('UPS 픽업 대기', 'Awaiting UPS pickup') + (U.pickT ? ' <span class="muted" style="font-size:12px;font-weight:400">· ' + bt('픽업 시간', 'pickup') + ' ' + esc(U.pickT) + '</span>' : '') + '</h2>' +
    '<div class="kpi" style="grid-template-columns:repeat(4,1fr)"><div><b>' + boxes.length + '</b><span>' + bt('박스', 'Boxes') + '</span></div><div><b>' + stores.size + '</b><span>' + bt('가게', 'Stores') + '</span></div><div><b>' + ords.length + '</b><span>' + bt('주문', 'Orders') + '</span></div><div><b>' + (w ? Math.round(w) + ' lb' : '—') + '</b><span>' + bt('무게', 'Weight') + '</span></div></div>' +
    (ords.length ? '<div class="btns" style="flex-wrap:wrap"><button class="b-ghost" id="puPrint">🖨 ' + bi('픽업 요약 인쇄', 'Print pickup summary') + '</button><button class="b-green" id="puGo">🚚 ' + bi('UPS 트럭 인계', 'Hand over to UPS') + '</button></div>' : '<div class="none">' + bt('픽업 대기가 없습니다 — 포장 대기에서 UPS 라벨을 붙이고 "포장 완료" 하면 여기로 옵니다', 'Nothing waiting — packed orders with UPS labels come here') + '</div>') + '</div>';
  if (ords.length) {
    const byS = groupBy(boxes, b => b.o.store || '—');
    h += '<div class="card"><h2>' + bi('가게별', 'By store') + '</h2>' + Object.keys(byS).sort().map(k => { const L = byS[k], O = Array.from(new Set(L.map(b => b.o))); return '<div class="iday"><b>' + esc(k) + '</b><span>' + L.length + ' ' + bt('박스', 'boxes') + ' · ' + esc(O.map(o => (o.invs || []).join(', ') || o.no).join(' / ')) + '</span></div>' +
      L.map(b => '<div class="pr tap" data-puo="' + esc(b.o.id) + '"><div class="ct"><b class="trk" style="font-family:ui-monospace,Menlo,monospace">📦 ' + b.box + '/' + b.boxes + ' · ' + esc(b.trk || bt('트래킹 없음', 'no tracking')) + '</b><small>' + esc((b.invs || []).join(', ')) + (b.w ? ' · ' + b.w + ' lb' : '') + (b.svc ? ' · ' + esc(b.svc) : '') + ' · ' + esc(b.o.sm || '') + '</small></div></div>').join(''); }).join('') + '</div>';
  }
  h += '<div class="card"><h2>🗂 ' + bi('지난 픽업', 'Past pickups') + '</h2>' + (hist.length ? hist.map(p => '<div class="pr tap" data-pu="' + esc(p.id) + '"><div class="ct"><b>' + esc(md(p.d)) + ' ' + esc(String(p.at || '').substring(11, 16)) + ' · ' + (p.n || 0) + ' ' + bt('박스', 'boxes') + ' · ' + (p.stores || 0) + ' ' + bt('가게', 'stores') + '</b><small>' + bt('기사', 'Driver') + ': ' + esc(p.driver || '—') + ' · ' + esc(String(p.by || '').split('@')[0]) + ((p.left || []).length ? ' · <span class="warn">' + bt('못 넘긴 박스', 'not handed over') + ' ' + p.left.length + '</span>' : '') + '</small></div><div class="pa">🖨</div></div>').join('') : '<div class="none">' + bt('아직 기록이 없습니다', 'No pickups yet') + '</div>') + '</div>';
  $('page').innerHTML = head + h;
  document.querySelectorAll('[data-lf]').forEach(b => b.onclick = () => { if (b.dataset.lf === 'home') LF.list = false; else LF.st = b.dataset.lf; window.dispatchEvent(new CustomEvent('theone:list', { detail: LF.st })); if (b.dataset.lf === 'home') { LF.list = false; } });
  if ($('lfSm')) $('lfSm').onchange = () => { LF.sm = $('lfSm').value; pickupPage(LF, head, again); };
  document.querySelectorAll('[data-puo]').forEach(el => el.onclick = () => goOrder(el.dataset.puo));
  if ($('puPrint')) $('puPrint').onclick = () => printSummary({ d: today(), at: new Date().toISOString(), boxes, ords, draft: true });
  if ($('puGo')) $('puGo').onclick = () => handover(G, () => (again ? again() : pickupPage(LF, head)));
  document.querySelectorAll('[data-pu]').forEach(el => el.onclick = async () => { const p = hist.find(x => x.id === el.dataset.pu); if (p) printSummary({ d: p.d, at: p.at, saved: p }); });
}

/* ---------- 🖨 픽업 요약 (UPS Pickup Summary) ---------- */
async function printSummary(x) {
  busy(true); try { await loadJsBarcode(); } catch (e) {} busy(false);
  const U = (S.settings && S.settings.ups) || {}, co = (S.settings && S.settings.co && S.settings.co.name) || 'THE ONE CORP', F = U.from || {};
  const rows = x.saved ? (x.saved.rows || []) : x.boxes.map(b => ({ trk: b.trk, store: b.o.store, city: '', invs: (b.invs || []).join(' '), w: b.w, svc: b.svc, box: b.box + '/' + b.boxes }));
  const n = rows.length, stores = new Set(rows.map(r => r.store)).size, w = rows.reduce((a, r) => a + (Number(r.w) || 0), 0);
  const bc = (v, h) => v ? barcodeSvg(String(v), { h: h || 30, w: 1.4, fs: 11 }) : '';
  printOpen('<style>@page{size:letter;margin:.45in}.pus{font-family:Arial,sans-serif;color:#000;font-size:12px}.pus h1{font-size:20px;margin:0}.pus .hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:8px}.pus .bx{display:flex;gap:18px;margin:10px 0}.pus .bx div{border:1.5px solid #000;padding:6px 10px;text-align:center}.pus .bx b{display:block;font-size:22px}.pus table{width:100%;border-collapse:collapse;margin-top:8px}.pus th,.pus td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:middle}.pus th{background:#eee;font-size:11px}.pus td svg{height:32px;width:auto;max-width:2.6in}.pus .sig{display:grid;grid-template-columns:2fr 1fr 1fr;gap:16px;margin-top:22px}.pus .sig div{border-top:1px solid #000;padding-top:4px;font-size:11px}.pus .sig img{max-height:60px}</style>' +
    '<div class="pus" translate="no"><div class="hd"><div><h1>UPS PICKUP SUMMARY</h1><div><b>' + esc(co) + '</b> · ' + esc([F.addr1, F.city, F.state, F.zip].filter(Boolean).join(', ')) + '</div><div>Date: <b>' + esc(x.d) + '</b> · Printed ' + esc(new Date().toLocaleString('en-US')) + (x.saved ? ' · Handed over ' + esc(String(x.saved.at || '').substring(0, 16).replace('T', ' ')) : x.draft ? ' · (before pickup)' : '') + '</div></div>' +
    '<div style="text-align:right">' + (U.acct ? '<div>UPS Account</div>' + bc(U.acct, 40) : '<div style="color:#b91c1c">UPS account # — set in Admin → Settings → UPS</div>') + '</div></div>' +
    '<div class="bx"><div>Total Packages<b>' + n + '</b>' + bc(String(n), 26) + '</div><div>Stores<b>' + stores + '</b></div><div>Total Weight<b>' + (w ? Math.round(w) + ' lb' : '—') + '</b></div></div>' +
    '<table><tr><th>#</th><th>Tracking Number</th><th>Store</th><th>Invoice(s)</th><th>Box</th><th>Wt</th><th>Service</th></tr>' + rows.map((r, i) => '<tr><td>' + (i + 1) + '</td><td>' + (r.trk ? bc(r.trk, 30) : '<i>no tracking</i>') + '</td><td>' + esc(r.store) + '</td><td>' + esc(r.invs) + '</td><td>' + esc(r.box || '') + '</td><td>' + (r.w ? r.w : '') + '</td><td>' + esc(r.svc || '') + '</td></tr>').join('') + '</table>' +
    '<div class="sig"><div>UPS Driver Signature' + (x.saved && x.saved.sig ? '<br><img src="' + x.saved.sig + '">' : '') + '</div><div>Driver Name' + (x.saved && x.saved.driver ? '<br><b>' + esc(x.saved.driver) + '</b>' : '') + '</div><div>Packages Received' + (x.saved ? '<br><b>' + n + '</b>' : '') + '</div></div></div>');
}

/* ---------- 🚚 트럭 인계 ---------- */
function handover(G, done) {
  const { ords, boxes } = G, ok = new Set();
  let driver = '', scanner = null, sigData = '';
  const paint = () => {
    const nOk = boxes.filter(b => ok.has(b.trk || b.o.id + ':' + b.box)).length;
    $('mbox').innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px"><h2 style="margin:0">🚚 ' + bi('UPS 트럭 인계', 'Hand over to UPS') + '</h2><button class="b-ghost b-sm" id="hoX">✕</button></div>' +
      '<div class="muted">' + bt('트럭에 싣는 박스의 라벨을 스캔하거나 눌러서 확인하세요. 확인한 박스의 주문이 출고 완료가 됩니다.', 'Scan or tap each box as it goes on the truck.') + '</div>' +
      '<div class="sumbox" style="display:flex;justify-content:space-between;align-items:center"><span>' + bt('확인', 'Checked') + ' <b style="font-size:20px" id="hoN">' + nOk + '</b> / ' + boxes.length + ' ' + bt('박스', 'boxes') + '</span><span><button class="b-ghost b-sm" id="hoAll">☑ ' + bt('모두', 'All') + '</button> <button class="b-ghost b-sm" id="hoNone">☐</button></span></div>' +
      '<div style="display:flex;gap:6px"><input id="hoScan" placeholder="' + esc(bt('라벨 바코드 스캔 · 1Z… 입력 + Enter', 'Scan label · type 1Z… + Enter')) + '" autocomplete="off" autocapitalize="characters" style="flex:1"><button class="b-blue" id="hoCam" style="flex:0 0 auto;width:auto">📷</button></div><div id="hoCamBox"></div>' +
      '<div style="max-height:34vh;overflow:auto;margin-top:6px">' + boxes.map(b => { const k = b.trk || b.o.id + ':' + b.box, on = ok.has(k); return '<label class="pick ' + (on ? 'on' : '') + '" data-hok="' + esc(k) + '" style="margin-top:4px"><span class="ck">✓</span><span class="pm"><b style="font-family:ui-monospace,Menlo,monospace">' + esc(b.trk || bt('트래킹 없음', 'no tracking')) + '</b><small>' + esc(b.o.store) + ' · ' + b.box + '/' + b.boxes + ' · ' + esc((b.invs || []).join(', ')) + '</small></span></label>'; }).join('') + '</div>' +
      '<div class="fg" style="margin-top:8px"><label>' + bi('UPS 기사 이름', 'Driver name') + '</label><input id="hoDrv" value="' + esc(driver) + '"></div>' +
      '<label class="f" style="font-size:12px;color:var(--muted)">' + bi('기사 서명 (손가락으로)', 'Driver signature') + ' <a href="#" id="hoSigC">' + bt('지우기', 'Clear') + '</a></label><canvas id="hoSig" width="600" height="160" style="width:100%;height:110px;border:1.5px dashed #94a3b8;border-radius:10px;background:#fff;touch-action:none"></canvas>' +
      '<div class="btns"><button class="b-ghost" id="hoX2">' + bt('닫기', 'Close') + '</button><button class="b-green" id="hoOk">✅ ' + bt('인계 완료', 'Handed over') + ' (<span id="hoN2">' + nOk + '</span>)</button></div>';
    bind();
  };
  /* 다시 그리지 않고 그 줄 · 숫자만 (카메라 · 서명이 그대로 있게) */
  const upd = () => { document.querySelectorAll('[data-hok]').forEach(el => el.classList.toggle('on', ok.has(el.dataset.hok))); const n = boxes.filter(b => ok.has(b.trk || b.o.id + ':' + b.box)).length; if ($('hoN')) $('hoN').textContent = n; if ($('hoN2')) $('hoN2').textContent = n; };
  const tick = v => { v = String(v || '').trim().toUpperCase(); if (!v) return false; const b = boxes.find(x => x.trk && x.trk.toUpperCase() === v); if (!b) { toast(bt('픽업 목록에 없는 트래킹', 'Not in this pickup') + ': ' + v, 'bad'); return false; } ok.add(b.trk); if (navigator.vibrate) try { navigator.vibrate(25); } catch (e) {} return true; };
  const stopCam = async () => { if (scanner) { try { await scanner.stop(); } catch (e) {} try { scanner.clear(); } catch (e) {} scanner = null; } };
  const bind = () => {
    const close = async () => { await stopCam(); closeModal(); };
    $('hoX').onclick = close; $('hoX2').onclick = close;
    $('hoDrv').oninput = () => { driver = $('hoDrv').value; };
    $('hoAll').onclick = () => { boxes.forEach(b => ok.add(b.trk || b.o.id + ':' + b.box)); upd(); };
    $('hoNone').onclick = () => { ok.clear(); upd(); };
    document.querySelectorAll('[data-hok]').forEach(el => el.onclick = e => { e.preventDefault(); const k = el.dataset.hok; if (ok.has(k)) ok.delete(k); else ok.add(k); upd(); });
    $('hoScan').onkeydown = e => { if (e.key !== 'Enter') return; e.preventDefault(); const v = $('hoScan').value; if (tick(v)) { upd(); $('hoScan').value = ''; } else $('hoScan').select(); };
    $('hoCam').onclick = async () => {
      if (scanner) return stopCam();
      $('hoCamBox').innerHTML = '<div id="hoCamV" style="width:100%;min-height:200px;border-radius:12px;overflow:hidden;margin-top:6px;background:#0f172a"></div>';
      try { await loadScanner(); scanner = new window.Html5Qrcode('hoCamV', { experimentalFeatures: { useBarCodeDetectorIfSupported: true }, verbose: false });
        let last = '', lastAt = 0;
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 280, height: 120 } }, t => { if (t === last && Date.now() - lastAt < 2500) return; last = t; lastAt = Date.now(); if (tick(t)) upd(); }, () => {});
      } catch (e) { $('hoCamBox').innerHTML = '<div class="alert a-red">' + esc(bt('카메라를 쓸 수 없습니다', 'Camera not available')) + ' (' + esc(e.message || e) + ')</div>'; }
    };
    /* 서명 칸 */
    const cv = $('hoSig'), cx = cv.getContext('2d'); cx.lineWidth = 3; cx.lineCap = 'round'; cx.strokeStyle = '#0f172a';
    if (sigData) { const im = new Image(); im.onload = () => cx.drawImage(im, 0, 0); im.src = sigData; }
    let down = false; const pt = e => { const r = cv.getBoundingClientRect(), p = e.touches ? e.touches[0] : e; return [(p.clientX - r.left) * cv.width / r.width, (p.clientY - r.top) * cv.height / r.height]; };
    const st = e => { e.preventDefault(); down = true; const [x, y] = pt(e); cx.beginPath(); cx.moveTo(x, y); }, mv = e => { if (!down) return; e.preventDefault(); const [x, y] = pt(e); cx.lineTo(x, y); cx.stroke(); }, en = () => { if (down) { down = false; sigData = cv.toDataURL('image/png'); } };
    cv.onmousedown = st; cv.onmousemove = mv; window.addEventListener('mouseup', en); cv.ontouchstart = st; cv.ontouchmove = mv; cv.ontouchend = en;
    $('hoSigC').onclick = e => { e.preventDefault(); cx.clearRect(0, 0, cv.width, cv.height); sigData = ''; };
    $('hoOk').onclick = async () => {
      const okB = boxes.filter(b => ok.has(b.trk || b.o.id + ':' + b.box)); if (!okB.length) return toast(bt('확인한 박스가 없습니다', 'Nothing checked'), 'bad');
      const left = boxes.filter(b => !okB.includes(b));
      const doneO = ords.filter(o => boxes.filter(b => b.o === o).every(b => okB.includes(b)));   // 박스가 모두 확인된 주문만 출고 완료
      if (!(window.confirm(okB.length + bt('박스를 UPS 에 넘길까요?', ' boxes handed to UPS?') + '\n' + bt('출고 완료', 'Shipped') + ': ' + doneO.length + bt('건', ' orders') + (left.length ? '\n⚠️ ' + bt('확인 안 된 박스', 'Unchecked boxes') + ' ' + left.length + ' — ' + bt('그 주문은 픽업 대기로 남습니다', 'those orders stay awaiting pickup') : '') + (driver ? '' : '\n' + bt('기사 이름이 비었습니다', 'Driver name is empty'))))) return;   // 브라우저 확인창 — 인계 창(체크 · 서명)이 그대로 남게
      await stopCam(); busy(true);
      try {
        const now = new Date(), iso = now.toISOString(), d = today(), id = 'PU-' + d.replace(/-/g, '') + '-' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
        const rows = okB.map(b => ({ trk: b.trk, store: b.o.store, invs: (b.invs || []).join(' '), w: b.w || 0, svc: b.svc || '', box: b.box + '/' + b.boxes, order: b.o.id }));
        const ops = [{ op: 'set', col: 'pickups', id, data: { d, at: iso, by: S.user.email, driver: driver.trim(), sig: sigData && sigData.length < 120000 ? sigData : '', n: okB.length, stores: new Set(okB.map(b => b.o.store)).size, orders: doneO.map(o => o.id), trks: okB.map(b => b.trk).filter(Boolean), w: rows.reduce((a, r) => a + (Number(r.w) || 0), 0), rows, left: left.map(b => b.trk || b.o.id) } }];
        doneO.forEach(o => ops.push({ op: 'update', col: 'orders', id: o.id, data: { st: 'shipped', shipAt: iso, shipBy: S.user.email, pickupId: id, updatedAt: iso } }));
        okB.filter(b => b.trk).forEach(b => ops.push({ op: 'update', col: 'shipments', id: b.trk, data: { pickupId: id, handedAt: iso } }));
        try { await S.DB.batch(ops); }
        catch (e) { /* 박스 기록이 없는 트래킹(update 실패)이 섞였으면 박스 기록 없이 다시 */ await S.DB.batch(ops.filter(o => o.col !== 'shipments')); }
        toast('🚚 ' + okB.length + ' ' + bt('박스 인계 완료', 'boxes handed over'), 'good'); closeModal();
        printSummary({ d, at: iso, saved: Object.assign({ id }, ops[0].data) });
        if (done) done();
      } catch (e) { toast('실패: ' + (e.code || e.message) + (String(e.code || e.message).includes('permission') ? ' — Firestore 규칙에 pickups 를 게시해야 합니다' : ''), 'bad'); }
      busy(false);
    };
  };
  openModal('', { wide: true }); paint();
  setTimeout(() => $('hoScan') && $('hoScan').focus(), 60);
}
