/* ============================================================
 *  🚚 UPS 출고 입력 — UPS 프로그램(WorldShip · CampusShip)처럼 한 화면에서
 *    받는 곳(회사 · 담당 · 전화 · 이메일 · 주소 3줄 · 주거지) · 보내는 곳 · 서비스 7가지 · 토요일 배달 · 서명 · 이메일 알림
 *    · 요금 청구(우리 계정 / 받는 사람 / 제3자) · 박스마다 무게 · 크기 · 신고가 · 이 박스에 든 인보이스 · 참조번호
 *    💲 요금 보기(서비스별 비교) → 📦 라벨 만들기 → 🖨 인쇄 → 출고 완료
 *  요청은 shipq/{주문ID} (st:'wait'), 요금은 shipq/RT-… (st:'rate') — apps-script/UPS.gs 가 1분 안에 처리
 *  라벨이 나오면 UPS.gs 가 박스마다 shipments/{트래킹} 을 만듦 (어느 인보이스가 어느 박스로 — 📦 배송 조회)
 * ============================================================ */
import { $, esc, money, toast, busy, openModal, closeModal, confirmBox, bi, bt, sel, printOpen, today } from './ui.js';
import { goOrder } from './orders.js';
import { upsTo, adrKey, saveShipAddr, upsValidate, printLabels } from './fulfill.js';
import { bumpAccountsVer } from './mgr.js';

let S = null;
export function register(state) { S = state; }
export const SVCS = [['03', 'UPS Ground'], ['12', 'UPS 3 Day Select'], ['02', 'UPS 2nd Day Air'], ['59', 'UPS 2nd Day Air A.M.'], ['13', 'UPS Next Day Air Saver'], ['01', 'UPS Next Day Air'], ['14', 'UPS Next Day Air Early']];
export const svcName = c => (SVCS.find(x => x[0] === String(c)) || [c, 'UPS ' + c])[1];
const PKG = [['02', 'Customer box · 내 박스'], ['01', 'UPS Letter'], ['04', 'UPS PAK'], ['21', 'UPS Express Box']];
const PRESET = [['S', 12, 10, 6], ['M', 16, 12, 10], ['L', 20, 16, 12], ['XL', 24, 18, 18]];
const acctOf = a => (S.accounts.byCode ? S.accounts.byCode[a] : null);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 출고 창 — after() 가 있으면 끝난 뒤 그것을, 없으면 주문 화면으로 */
export async function shipModal(o, after) {
  const fin = () => { if (after) after(); else goOrder(o.id); };
  let q = null; try { q = await S.DB.get('shipq', o.id); } catch (e) {}
  const U = (S.settings && S.settings.ups) || {}, defW = Number(U.defW) || 5, acc = acctOf(o.acct) || {};
  const invs = (o.invs || []).slice();
  const base = upsTo(o);
  /* 입력 상태 — 지난 요청이 있으면 그대로 이어서 */
  const F = q && q.to && q.st !== 'done' ? JSON.parse(JSON.stringify({ to: q.to, fromX: q.fromX || null, svc: q.svc, opt: q.opt || {}, bill: q.bill || { type: 'ship' }, boxes: q.boxes || [], desc: q.desc || '' })) : {
    to: Object.assign({ email: acc.email || '', addr3: '', res: false }, base),
    fromX: null, svc: U.svc || '03', opt: { sat: false, sig: '', notify: false }, bill: { type: 'ship', acct: '', zip: '' }, boxes: [], desc: 'JEWELRY & ACCESSORIES'
  };
  if (!F.boxes.length) { const n = Math.max(1, o.boxes || invs.length || 1); for (let i = 0; i < n; i++) F.boxes.push({ w: defW, l: '', wd: '', h: '', pkg: '02', val: '', ref2: '', invs: n === invs.length ? [invs[i]] : invs.slice() }); }
  let saveAcct = false, showFrom = false, rates = null, rateBusy = false, av = null, stop = false;
  const from = Object.assign({ name: 'THE ONE CORP', attn: 'SHIPPING', phone: '', addr1: '', addr2: '', city: '', state: '', zip: '' }, U.from || {}, F.fromX || {});
  const inp = (path, v, ph, extra) => '<input data-f="' + path + '" value="' + esc(v == null ? '' : v) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + ' ' + (extra || '') + '>';
  const fld = (lab, html) => '<div><label class="f">' + lab + '</label>' + html + '</div>';
  const totW = () => F.boxes.reduce((a, b) => a + (Number(b.w) || 0), 0);

  const paint = () => {
    const done = q && q.st === 'done', working = q && (q.st === 'wait' || q.st === 'working' || q.st === 'void');
    let h = '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><h2 style="margin:0">🚚 ' + bi('UPS 출고', 'UPS shipment') + '</h2><div class="muted">' + esc(o.store) + ' · ' + esc(invs.join(', ') || o.no) + ' · ' + esc(o.sm) + '</div></div><button class="b-ghost b-sm" id="shX">✕</button></div>';
    if (done) {
      h += '<div class="shs" style="background:#ecfdf5"><h3>✅ ' + bi('UPS 라벨', 'UPS labels') + ' ' + (q.labels || []).length + (q.env === 'test' ? ' <span class="tag t-c">' + bt('시험 라벨', 'TEST') + '</span>' : '') + '</h3>' +
        (q.labels || []).map((l, i) => { const b = (q.boxes || [])[i] || {}; return '<div class="shpbox"><div class="top"><div><span class="trk">📦 ' + (i + 1) + '/' + q.labels.length + ' · ' + esc(l.trk) + '</span><div class="muted" style="font-size:12px">' + esc((b.invs || []).join(', ') || '') + (b.w ? ' · ' + b.w + ' lb' : '') + ([b.l, b.wd, b.h].filter(Number).length === 3 ? ' · ' + b.l + '×' + b.wd + '×' + b.h + '"' : '') + '</div></div><a class="b-ghost b-sm lnk" href="https://www.ups.com/track?tracknum=' + esc(l.trk) + '" target="_blank" rel="noopener">UPS.com</a></div></div>'; }).join('') +
        (q.charge ? '<div class="sumbox">' + bt('요금', 'Charge') + ' <b>' + money(q.charge) + '</b> · ' + esc(svcName(q.svc)) + '</div>' : '') +
        '<div class="btns" style="flex-wrap:wrap"><button class="b-blue" id="upPrint">🖨 ' + bi('라벨 인쇄', 'Print labels') + '</button><button class="b-ghost" id="upVoid" style="color:#991b1b">✕ ' + bi('라벨 취소 (Void)', 'Void') + '</button></div>' +
        (o.st === 'done' ? '<button class="b-green" id="upPacked" style="margin-top:8px;padding:15px">📦 ' + bi('라벨 붙임 · 포장 완료 → 📮 픽업 대기', 'Labels attached · packed → awaiting pickup') + '</button>' : '') + '</div>';
    } else if (working) {
      h += '<div class="alert a-blu">⏳ ' + (q.st === 'void' ? bt('UPS 라벨 취소 중…', 'Voiding…') : bt('UPS 라벨 만드는 중…', 'Creating labels…')) + ' ' + bt('1~2분 걸립니다', 'takes 1–2 min') + '</div>';
    } else {
      if (q && q.st === 'error') h += '<div class="alert a-red">UPS: ' + esc(q.err || '') + '</div>';
      if (q && q.st === 'voided') h += '<div class="muted">' + bt('이전 라벨은 취소됐습니다', 'Previous labels were voided') + ' (' + esc(q.track || '') + ')</div>';
      /* ① 받는 곳 */
      const t = F.to, diff = acc.acct && adrKey(t) !== adrKey(acc);
      h += '<div class="shs"><h3>📍 ' + bi('받는 곳', 'Ship to') + '<span><button class="b-ghost b-sm" id="toAcc">🏬 ' + bt('거래처 주소로', 'Use customer address') + '</button></span></h3>' +
        '<div class="g2">' + fld(bt('회사 · 가게 이름', 'Company') + ' *', inp('to.name', t.name)) + fld(bt('받는 사람 (Attention)', 'Attention'), inp('to.attn', t.attn)) + '</div>' +
        '<div class="g2">' + fld(bt('전화', 'Phone') + ' *', inp('to.phone', t.phone, '', 'inputmode="tel"')) + fld(bt('이메일 (알림용)', 'Email (notifications)'), inp('to.email', t.email, '', 'inputmode="email"')) + '</div>' +
        fld(bt('주소 1', 'Address 1') + ' *', inp('to.addr1', t.addr1)) + '<div class="g2">' + fld(bt('주소 2 (Suite · Unit)', 'Address 2'), inp('to.addr2', t.addr2)) + fld(bt('주소 3', 'Address 3'), inp('to.addr3', t.addr3)) + '</div>' +
        '<div class="g3">' + fld('City *', inp('to.city', t.city)) + fld('State *', inp('to.state', t.state, '', 'maxlength="2" style="text-transform:uppercase"')) + fld('ZIP *', inp('to.zip', t.zip, '', 'inputmode="numeric"')) + '</div>' +
        '<label class="pick ' + (t.res ? 'on' : '') + '" data-tg="to.res" style="margin-top:6px"><span class="ck">✓</span><span class="pm"><b>🏠 ' + bi('주거지 주소 (Residential)', 'Residential address') + '</b></span></label>' +
        (diff ? '<label class="pick ' + (saveAcct ? 'on' : '') + '" id="tgSave" style="margin-top:6px"><span class="ck">✓</span><span class="pm"><b>🏬 ' + bi('이 주소를 거래처 기록에도 저장', 'Also save to the customer record') + '</b><small>' + bt('거래처 기록', 'Record') + ': ' + esc([acc.addr, acc.city, acc.state, acc.zip].filter(Boolean).join(', ')) + ' — ' + bt('끄면 이 주문만 이 주소로', 'off = this order only') + '</small></span></label>' : '') +
        '<div class="btns" style="justify-content:flex-start"><button class="b-ghost b-sm" id="upAv">✅ ' + bi('UPS 주소 확인', 'Verify with UPS') + '</button></div><div id="upAvBox">' + avHtml() + '</div></div>';
      /* ② 보내는 곳 */
      h += '<div class="shs"><h3>🏭 ' + bi('보내는 곳', 'Ship from') + '<button class="b-ghost b-sm" id="frT">' + (showFrom ? '▴' : '✏️ ' + bt('이번만 바꾸기', 'Change')) + '</button></h3>' +
        (showFrom ? '<div class="g2">' + fld(bt('회사', 'Company'), inp('from.name', from.name)) + fld('Attention', inp('from.attn', from.attn)) + '</div>' + fld(bt('전화', 'Phone'), inp('from.phone', from.phone)) + fld(bt('주소', 'Address'), inp('from.addr1', from.addr1)) + fld(bt('주소 2', 'Address 2'), inp('from.addr2', from.addr2)) + '<div class="g3">' + fld('City', inp('from.city', from.city)) + fld('State', inp('from.state', from.state)) + fld('ZIP', inp('from.zip', from.zip)) + '</div>'
          : '<div class="muted">' + esc([from.name, from.addr1, from.addr2, from.city, from.state, from.zip].filter(Boolean).join(', ')) + '</div>') + '</div>';
      /* ③ 서비스 · 옵션 · 청구 */
      h += '<div class="shs"><h3>⚙️ ' + bi('서비스 · 옵션', 'Service · options') + '</h3>' +
        fld(bt('서비스', 'Service'), sel('svcSel', SVCS, F.svc)) +
        '<label class="f">' + bt('서명 확인', 'Delivery confirmation') + '</label><div class="seg">' + [['', bt('없음', 'None')], ['sig', bt('서명', 'Signature')], ['adult', bt('성인 서명', 'Adult signature')]].map(x => '<button class="' + ((F.opt.sig || '') === x[0] ? 'on' : '') + '" data-sig="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
        '<label class="pick ' + (F.opt.sat ? 'on' : '') + '" data-tg="opt.sat" style="margin-top:6px"><span class="ck">✓</span><span class="pm"><b>📅 ' + bi('토요일 배달', 'Saturday delivery') + '</b><small>' + bt('익일 · 2일 항공 서비스만', 'Air services only') + '</small></span></label>' +
        '<label class="pick ' + (F.opt.notify ? 'on' : '') + '" data-tg="opt.notify" style="margin-top:6px"><span class="ck">✓</span><span class="pm"><b>✉️ ' + bi('받는 사람에게 출고 이메일', 'Email ship notification to receiver') + '</b><small>' + (F.to.email ? esc(F.to.email) : bt('위에 이메일을 넣으세요', 'add an email above')) + '</small></span></label>' +
        '<label class="f">' + bt('요금 청구', 'Bill shipping to') + '</label><div class="seg">' + [['ship', bt('우리 계정', 'Shipper')], ['rcv', bt('받는 사람', 'Receiver')], ['third', bt('제3자', 'Third party')]].map(x => '<button class="' + ((F.bill.type || 'ship') === x[0] ? 'on' : '') + '" data-bill="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
        ((F.bill.type || 'ship') !== 'ship' ? '<div class="g2">' + fld(bt('UPS 계정 번호', 'UPS account #') + ' *', inp('bill.acct', F.bill.acct, '', 'style="text-transform:uppercase"')) + fld(bt('계정 ZIP', 'Account ZIP'), inp('bill.zip', F.bill.zip, '', 'inputmode="numeric"')) + '</div>' : '') +
        fld(bt('물품 설명', 'Description of goods'), inp('desc', F.desc)) + '</div>';
      /* ④ 박스 */
      h += '<div class="shs"><h3>📦 ' + bi('박스', 'Packages') + ' ' + F.boxes.length + ' · ' + totW() + ' lb<span><button class="b-ghost b-sm" id="bxAdd">＋ ' + bt('박스', 'Box') + '</button>' + (F.boxes.length > 1 ? ' <button class="b-ghost b-sm" id="bxSame">' + bt('1번 크기로 모두', 'Copy box 1 size') + '</button>' : '') + '</span></h3>' +
        F.boxes.map((b, i) => '<div class="bxc"><div class="bh"><span>📦 ' + (i + 1) + '</span>' + (F.boxes.length > 1 ? '<button class="b-ghost b-sm" data-bxdel="' + i + '">🗑</button>' : '') + '</div>' +
          '<div class="g4">' + fld(bt('무게 lb', 'Weight lb') + ' *', inp('boxes.' + i + '.w', b.w, '', 'type="number" inputmode="decimal" min="1"')) + fld('L in', inp('boxes.' + i + '.l', b.l, '', 'type="number" inputmode="decimal"')) + fld('W in', inp('boxes.' + i + '.wd', b.wd, '', 'type="number" inputmode="decimal"')) + fld('H in', inp('boxes.' + i + '.h', b.h, '', 'type="number" inputmode="decimal"')) + '</div>' +
          '<div class="chips" style="margin:4px 0">' + PRESET.map(p => '<button data-bxp="' + i + ':' + p[0] + '">' + p[0] + ' ' + p[1] + '×' + p[2] + '×' + p[3] + '</button>').join('') + '</div>' +
          '<div class="g2">' + fld(bt('포장', 'Packaging'), '<select data-f="boxes.' + i + '.pkg">' + PKG.map(p => '<option value="' + p[0] + '"' + ((b.pkg || '02') === p[0] ? ' selected' : '') + '>' + esc(p[1]) + '</option>').join('') + '</select>') + fld(bt('신고가 $ (보험)', 'Declared value $'), inp('boxes.' + i + '.val', b.val, '', 'type="number" inputmode="decimal"')) + '</div>' +
          (invs.length ? '<label class="f">' + bt('이 박스에 든 인보이스', 'Invoices in this box') + '</label><div class="chips" style="margin:0">' + invs.map(n => '<button class="' + ((b.invs || []).includes(n) ? 'on' : '') + '" data-bxi="' + i + ':' + esc(n) + '">' + esc(n) + '</button>').join('') + '</div>' : '') +
          fld(bt('참조 2 (PO · 메모)', 'Reference 2 (PO · note)'), inp('boxes.' + i + '.ref2', b.ref2)) + '</div>').join('') + '</div>';
      /* ⑤ 요금 · 만들기 */
      h += '<div class="shs"><h3>💲 ' + bi('요금', 'Rates') + '<button class="b-ghost b-sm" id="rtGo"' + (rateBusy ? ' disabled' : '') + '>' + (rateBusy ? '⏳ ' + bt('UPS 에 묻는 중…', 'Asking UPS…') : '💲 ' + bt('서비스별 요금 보기', 'Compare rates')) + '</button></h3>' +
        (rates && rates.err ? '<div class="alert a-red">' + esc(rates.err) + '</div>' : rates && rates.list ? rates.list.map(r => '<div class="rate tap' + (r.svc === F.svc ? ' on' : '') + '" data-rt="' + esc(r.svc) + '"><div><b>' + esc(r.name) + '</b><div class="muted" style="font-size:12px">' + (r.days ? r.days + ' ' + bt('영업일', 'business days') : '') + (r.list && Math.abs(r.list - r.total) > 0.01 ? ' · ' + bt('정가', 'list') + ' ' + money(r.list) : '') + '</div></div><b>' + money(r.total) + '</b></div>').join('') : '<div class="muted">' + bt('주소 · 박스를 넣고 요금을 비교한 뒤 서비스를 고르세요 (선택)', 'Optional: compare prices before creating labels') + '</div>') +
        '<button class="b-blue" id="upGo" style="margin-top:10px;padding:15px">📦 ' + bi('UPS 라벨 만들기', 'Create UPS labels') + ' — ' + F.boxes.length + ' ' + bt('박스', 'box(es)') + ' · ' + esc(svcName(F.svc)) + '</button></div>';
    }
    /* ⑥ 직접 입력 · 출고 완료 (다른 운송 · 이미 라벨이 있을 때) */
    h += '<details class="shs" open><summary><b>✍️ ' + bi('출고 완료 · 직접 입력 (다른 운송 · 다른 프로그램 라벨)', 'Mark shipped · manual entry') + '</b></summary>' +
      '<div class="g2">' + fld(bt('운송', 'Carrier'), sel('shVia', [['UPS', 'UPS'], ['FEDEX', 'FedEx'], ['USPS', 'USPS'], ['PICKUP', bt('픽업', 'Pickup')], ['DELIVERY', bt('직접 배달', 'Delivery')]], o.shipVia || 'UPS')) + fld(bt('박스 수', 'Boxes'), '<input id="shBox" type="number" inputmode="numeric" value="' + ((done && q.labels.length) || o.boxes || F.boxes.length || 1) + '">') + '</div>' +
      fld(bt('추적 번호 (여러 개는 띄어서)', 'Tracking # (space-separated)'), '<input id="shTrack" value="' + esc((done && q.track) || o.track || '') + '" autocomplete="off">') +
      '<button class="b-green" id="shOk" style="margin-top:8px">' + bi('포장 완료 (UPS → 📮 픽업 대기 · 그 외 → 출고 완료)', 'Packed (UPS → awaiting pickup · others → shipped)') + '</button></details>';
    $('mbox').innerHTML = h;
    bind();
  };
  const avHtml = () => {
    if (!av) return '';
    if (av.st === 'wait') return '<div class="alert a-blu">⏳ ' + bt('UPS 에 주소 확인 중… (최대 1분)', 'Asking UPS… (up to 1 min)') + '</div>';
    if (av.st === 'error') return '<div class="alert a-red">UPS: ' + esc(av.err || '') + '</div>';
    const same = (av.cands || []).some(c => adrKey(c) === adrKey(F.to));
    return (av.valid && same ? '<div class="alert a-grn">✅ ' + bt('UPS 확인 — 맞는 주소입니다', 'UPS: address is valid') + (av.cls ? ' · ' + esc(av.cls) : '') + '</div>' : av.none ? '<div class="alert a-red">⚠️ ' + bt('UPS 가 이 주소를 찾지 못했습니다', 'UPS could not find this address') + '</div>' : '<div class="alert a-amb">📮 ' + bt('UPS 추천 주소 — 누르면 위에 넣습니다', 'UPS suggests — tap to use') + '</div>') +
      (av.valid && same ? '' : (av.cands || []).map((c, i) => '<div class="pr tap" data-avc="' + i + '"><div class="ct"><b>' + esc([c.addr1, c.addr2].filter(Boolean).join(', ')) + '</b><small>' + esc(c.city + ', ' + c.state + ' ' + c.zip + (c.zip4 ? '-' + c.zip4 : '')) + (c.cls ? ' · ' + esc(c.cls) : '') + '</small></div><div class="pa">' + bt('쓰기', 'Use') + ' ›</div></div>').join(''));
  };
  /* 입력값 읽기 (data-f="to.name" · "boxes.0.w" …) */
  const setPath = (path, v) => { const k = path.split('.'); let x = k[0] === 'from' ? from : F; for (let i = (k[0] === 'from' ? 1 : 0); i < k.length - 1; i++) x = x[k[i]]; x[k[k.length - 1]] = v; };
  const pull = () => { document.querySelectorAll('#mbox [data-f]').forEach(el => setPath(el.dataset.f, el.value.trim())); if ($('svcSel')) F.svc = $('svcSel').value; F.to.state = String(F.to.state || '').toUpperCase(); };
  const repaint = () => { pull(); paint(); };
  const bind = () => {
    $('shX').onclick = () => { stop = true; closeModal(); };
    /* 입력은 그 자리에서만 저장 (다시 그리면 누르려던 버튼이 사라짐) — 총 무게만 바로 고침 */
    document.querySelectorAll('#mbox [data-f]').forEach(el => el.oninput = el.onchange = () => { setPath(el.dataset.f, el.value.trim()); if (/^boxes\.\d+\.w$/.test(el.dataset.f) && $('totW')) $('totW').textContent = totW(); });
    if ($('svcSel')) $('svcSel').onchange = () => { F.svc = $('svcSel').value; repaint(); };
    document.querySelectorAll('#mbox [data-tg]').forEach(el => el.onclick = e => { e.preventDefault(); pull(); const k = el.dataset.tg.split('.'); const x = k.length > 1 ? F[k[0]] : F; x[k[k.length - 1]] = !x[k[k.length - 1]]; paint(); });
    if ($('tgSave')) $('tgSave').onclick = e => { e.preventDefault(); pull(); saveAcct = !saveAcct; paint(); };
    document.querySelectorAll('#mbox [data-sig]').forEach(b => b.onclick = () => { pull(); F.opt.sig = b.dataset.sig; paint(); });
    document.querySelectorAll('#mbox [data-bill]').forEach(b => b.onclick = () => { pull(); F.bill.type = b.dataset.bill; paint(); });
    if ($('frT')) $('frT').onclick = () => { pull(); showFrom = !showFrom; paint(); };
    if ($('toAcc')) $('toAcc').onclick = () => { pull(); const a = acctOf(o.acct); if (!a) return toast(bt('계정코드가 없는 주문입니다', 'No account'), 'bad'); Object.assign(F.to, { name: a.store, addr1: a.addr || '', addr2: a.addr2 || '', addr3: '', city: a.city || '', state: a.state || '', zip: a.zip || '', phone: a.tel || F.to.phone, email: a.email || F.to.email }); av = null; paint(); };
    if ($('bxAdd')) $('bxAdd').onclick = () => { pull(); const l = F.boxes[F.boxes.length - 1] || {}; F.boxes.push({ w: l.w || defW, l: l.l || '', wd: l.wd || '', h: l.h || '', pkg: l.pkg || '02', val: '', ref2: '', invs: invs.slice() }); rates = null; paint(); };
    if ($('bxSame')) $('bxSame').onclick = () => { pull(); const b0 = F.boxes[0]; F.boxes.forEach(b => { b.l = b0.l; b.wd = b0.wd; b.h = b0.h; b.pkg = b0.pkg; }); rates = null; paint(); };
    document.querySelectorAll('#mbox [data-bxdel]').forEach(b => b.onclick = () => { pull(); F.boxes.splice(+b.dataset.bxdel, 1); rates = null; paint(); });
    document.querySelectorAll('#mbox [data-bxp]').forEach(b => b.onclick = () => { pull(); const [i, k] = b.dataset.bxp.split(':'), p = PRESET.find(x => x[0] === k); Object.assign(F.boxes[+i], { l: p[1], wd: p[2], h: p[3] }); rates = null; paint(); });
    document.querySelectorAll('#mbox [data-bxi]').forEach(b => b.onclick = () => { pull(); const [i, n] = b.dataset.bxi.split(':'), L = F.boxes[+i].invs = F.boxes[+i].invs || []; const k = L.indexOf(n); if (k >= 0) L.splice(k, 1); else L.push(n); paint(); });
    document.querySelectorAll('#mbox [data-rt]').forEach(el => el.onclick = () => { pull(); F.svc = el.dataset.rt; paint(); });
    document.querySelectorAll('#mbox [data-avc]').forEach(el => el.onclick = () => { pull(); const c = av.cands[+el.dataset.avc]; Object.assign(F.to, { addr1: c.addr1, addr2: c.addr2 || F.to.addr2, city: c.city, state: c.state, zip: c.zip }); av = null; paint(); });
    if ($('upAv')) $('upAv').onclick = async () => { pull(); if (!F.to.addr1 || !F.to.zip) return toast(bt('주소가 비었습니다', 'Address missing'), 'bad'); av = { st: 'wait' }; $('upAvBox').innerHTML = avHtml(); try { av = await upsValidate(F.to, o.id); } catch (e) { av = { st: 'error', err: String(e.code || e.message) }; } if (!stop && $('upAvBox')) { pull(); paint(); } };
    if ($('rtGo')) $('rtGo').onclick = async () => {
      pull(); const bad = check(); if (bad) return toast(bad, 'bad');
      rateBusy = true; rates = null; paint();
      const id = 'RT-' + o.id + '-' + Date.now().toString(36);
      try {
        await S.DB.set('shipq', id, Object.assign(payload(), { st: 'rate', kind: 'rate' }));
        for (let i = 0; i < 40 && !stop; i++) { await sleep(3000); const x = await S.DB.get('shipq', id).catch(() => null); if (x && x.st === 'ratedone') { rates = { list: x.rates || [] }; break; } if (x && x.st === 'rateerr') { rates = { err: x.err }; break; } }
        if (!rates) rates = { err: bt('응답이 없습니다 — UPS 스크립트(UPS.gs)를 새 버전으로 바꾸고 setup 을 실행했는지 확인하세요', 'No answer from the UPS script') };
      } catch (e) { rates = { err: String(e.code || e.message) }; }
      rateBusy = false; if (!stop && $('rtGo')) paint();
    };
    if ($('upGo')) $('upGo').onclick = async () => {
      pull(); const bad = check(); if (bad) return toast(bad, 'bad');
      const r = rates && rates.list ? rates.list.find(x => x.svc === F.svc) : null;
      if (!(await confirmBox(svcName(F.svc) + ' · ' + F.boxes.length + bt('박스', ' box(es)') + ' (' + F.boxes.map(b => b.w + 'lb').join(', ') + ')' + (r ? ' · ' + money(r.total) : '') + '\n→ ' + F.to.name + ', ' + [F.to.addr1, F.to.addr2, F.to.city, F.to.state, F.to.zip].filter(Boolean).join(', ') + '\n' + bt('UPS 라벨을 만들까요? 요금이 청구됩니다.', 'Create UPS labels? Shipping will be charged.'), bt('라벨 만들기', 'Create labels')))) return reopen();
      busy(true);
      try {
        /* 주소가 바뀌었으면 — 거래처 기록 또는 이 주문만 */
        if (adrKey(F.to) !== adrKey(base) || (F.to.name || '') !== (base.name || '')) await saveShipAddr(o, { name: F.to.name, addr1: F.to.addr1, addr2: F.to.addr2, city: F.to.city, state: F.to.state, zip: F.to.zip }, saveAcct && !!acctOf(o.acct));
        if (F.to.email && acctOf(o.acct) && !acctOf(o.acct).email) { try { await S.DB.update('accounts', o.acct, { email: F.to.email }); await bumpAccountsVer(); } catch (e) {} }
        const doc = Object.assign(payload(), { id: o.id, st: 'wait', createdAt: new Date().toISOString() });
        await S.DB.set('shipq', o.id, doc); q = doc;
      } catch (e) { busy(false); toast('실패: ' + (e.code || e.message), 'bad'); return reopen(); }
      busy(false); reopen(); poll();
    };
    if ($('upPrint')) $('upPrint').onclick = () => printLabels(q);
    if ($('upPacked')) $('upPacked').onclick = async () => { const now = new Date().toISOString(); stop = true; closeModal(); busy(true); try { await S.DB.update('orders', o.id, { st: 'packed', packAt: now, packBy: S.user.email, shipVia: 'UPS', track: q.track, boxes: (q.labels || []).length, shipCost: q.charge || 0, updatedAt: now }); toast('📮 ' + bt('픽업 대기로 — UPS 트럭이 오면 📮 UPS 픽업에서 인계', 'Awaiting pickup'), 'good'); fin(); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
    if ($('upVoid')) $('upVoid').onclick = async () => { if (!(await confirmBox(bt('UPS 라벨을 취소할까요? 붙인 라벨은 버려 주세요.', 'Void these UPS labels?') + ' (' + (q.track || '') + ')', bt('라벨 취소', 'Void')))) return reopen(); try { await S.DB.update('shipq', o.id, { st: 'void', voidBy: S.user.email, voidAt: new Date().toISOString() }); q.st = 'void'; reopen(); poll(); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } };
    $('shOk').onclick = async () => {
      const track = $('shTrack').value.trim(), via = $('shVia').value, nBox = Math.max(1, Number($('shBox').value) || 1), now = new Date().toISOString();
      /* UPS 는 트럭에 넘길 때까지 📮 픽업 대기, 그 외(픽업 · 직접 배달 · 다른 운송)는 바로 출고 완료 */
      const d = via === 'UPS' ? { st: 'packed', packAt: now, packBy: S.user.email, shipVia: via, boxes: nBox, track, updatedAt: now } : { st: 'shipped', shipAt: now, shipBy: S.user.email, shipVia: via, boxes: nBox, track, updatedAt: now }; if (q && q.st === 'done' && q.charge) d.shipCost = q.charge;
      stop = true; closeModal(); busy(true);
      try {
        await S.DB.update('orders', o.id, d);
        /* 직접 넣은 UPS 트래킹 — 배송 조회 기록도 (라벨을 앱에서 안 만든 경우) */
        if (via === 'UPS' && !(q && q.st === 'done')) { const T = track.split(/[\s,]+/).filter(x => /^1Z[0-9A-Z]{16}$/i.test(x)); if (T.length) await S.DB.batch(T.map((t, i) => ({ op: 'set', col: 'shipments', id: t.toUpperCase(), data: { trk: t.toUpperCase(), orderId: o.id, no: o.no, acct: o.acct || '', store: o.store, sm: o.sm, invs, box: i + 1, boxes: T.length, shipDate: today(), src: 'manual', by: S.user.email, status: 'Shipped', trkSt: 'open', delivered: false, at: now } }))); }
        toast(via === 'UPS' ? '📮 ' + bt('픽업 대기로', 'Awaiting pickup') : '🚚 ' + bt('출고 완료', 'Shipped'), 'good'); fin();
      } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
      busy(false);
    };
  };
  const check = () => {
    const t = F.to;
    if (!t.name || !t.addr1 || !t.city || !t.state || !t.zip) return bt('받는 곳: 회사 · 주소 · City · State · ZIP 을 넣으세요', 'Ship to: company, address, city, state, ZIP');
    if (!/^\d{5}(-?\d{4})?$/.test(String(t.zip))) return bt('ZIP 이 맞지 않습니다', 'Bad ZIP');
    if (F.boxes.some(b => !(Number(b.w) > 0))) return bt('박스마다 무게를 넣으세요', 'Each box needs a weight');
    if (F.bill.type && F.bill.type !== 'ship' && !F.bill.acct) return bt('청구할 UPS 계정 번호를 넣으세요', 'Enter the UPS account to bill');
    if (F.opt.notify && !t.email) return bt('알림 이메일을 넣으세요', 'Add the notification email');
    return '';
  };
  const payload = () => ({
    orderId: o.id, no: o.no, acct: o.acct || '', store: o.store, sm: o.sm, invs, by: S.user.email,
    svc: F.svc, to: F.to, fromX: showFrom ? { name: from.name, attn: from.attn, phone: from.phone, addr1: from.addr1, addr2: from.addr2, city: from.city, state: from.state, zip: from.zip } : null,
    opt: F.opt, bill: F.bill, desc: F.desc,
    boxes: F.boxes.map(b => ({ w: Number(b.w) || defW, l: Number(b.l) || '', wd: Number(b.wd) || '', h: Number(b.h) || '', pkg: b.pkg || '02', val: Number(b.val) || '', ref2: b.ref2 || '', invs: b.invs || [] })),
    ref: (invs.join(' ') || o.no).substring(0, 35)
  });
  const reopen = () => { openModal('', { wide: true }); paint(); };
  const poll = async () => {
    for (let i = 0; i < 60 && !stop; i++) {
      await sleep(4000); if (stop || !$('mbox')) return;
      let x = null; try { x = await S.DB.get('shipq', o.id); } catch (e) {}
      if (x && x.st !== q.st) {
        q = x; reopen();
        if (x.st === 'done') { try { await S.DB.update('orders', o.id, { track: x.track, shipVia: 'UPS', boxes: (x.labels || []).length, shipCost: x.charge || 0, updatedAt: new Date().toISOString() }); } catch (e) {} toast('✅ UPS ' + bt('라벨', 'labels') + ' ' + (x.labels || []).length, 'good'); printLabels(x); }
        if (x.st !== 'wait' && x.st !== 'working' && x.st !== 'void') return;
      }
    }
  };
  reopen();
  if (q && (q.st === 'wait' || q.st === 'working' || q.st === 'void')) poll();
}
