/* ============================================================
 *  ↩ 크레딧 · 리턴 (크레딧 메모 CM) — 세일즈맨이 가게에서 대미지 · 오래된 물건 교환 · 잘못 보낸 물건 · 가격 조정으로 크레딧을 줄 때
 *    · 세일즈맨이 바로 확정 → invoices 에 CM-###### (금액 마이너스) 가 생겨 거래처 잔액 · 스테이트먼트 · 커미션(CM 칸)에 바로 반영
 *    · 가격: 가게 기본 할인을 적용한 목록가가 기본. 아이템을 넣으면 그 가게의 가장 최근 인보이스에서 같은 아이템 가격을 찾아 비교해 보여 주고, 한 번에 그 가격으로 바꿀 수 있음
 *    · 사무실(인보이스 · 수금 담당)은 들어온 크레딧을 확인(✅) · 문제면 VOID. 가격이 최근 인보이스와 다르거나 할인이 가게 기본과 다르면 ⚠️ 표시 + 알림
 *    · 리턴 물건의 창고 수령 확인은 지금은 하지 않음 (랜덤으로 들어와 일일이 맞추기 어려움)
 *    · v0.8.177: 🏷 할인 백 % (기록이 없어도 할인해서 나간 것은 할인 뺀 가격으로) · 🕘 최근 인보이스에서 여러 줄 한 번에 · 📋 코드 · 수량 여러 줄 붙여넣기
 *      · 주문 화면 ↔ 크레딧 바로 이동 (같은 가게) · 사무실은 확인 전 크레딧에 할인 백을 다시 적용 가능
 *    · v0.8.179: 크레딧은 인보이스처럼 그 가게의 기록 — 가게 창 · 인보이스 조회 · 수금 고르기에 그대로 보이고 수금 때 인보이스와 같이 누르면 받을 돈에서 빠짐
 *      · ↩ 인보이스에 바로 적용 (오피스 매니저 · 관리자 · 오너만 — can('crApply')): apply = [{ no, acct, amt, d, by, at, ar }]
 *        CM pays['AP:인보이스'] = −금액 · 앱 인보이스 pays['CM:크레딧번호'] = 금액 → 두 문서의 잔액이 같이 줄어듦. 이전 시스템(AR) 인보이스는 AR 기준일 뒤 적용분을 잔액에서 뺌
 *      · 적용 기록마다 ✕ 되돌리기 · 크레딧 한 장 한도 기본 10000
 * ============================================================ */
import { $, esc, money, R2, num, today, ym, md, invNo, toast, busy, openModal, closeModal, confirmBox, Router, sortBy, bi, bt, printOpen, debounce } from './ui.js';
import { loadCatalog, catalog, exactItem, searchItems, thumb, productLine } from './catalog.js';
import { invTypes, typeOfItem, acctDisc, nextInvoiceNo, company, dropInvCache, monthsOf, getInvoice, obFix, obDisc, OB_T } from './invoicing.js';
import { searchAccounts } from './accounts.js';
import { mySm } from './access.js';
import { can } from './main.js';

let S = null;
const WHY = [['대미지', 'Damaged'], ['오래된 물건 교환', 'Old stock exchange'], ['잘못 보낸 물건', 'Wrong item shipped'], ['가격 조정', 'Price adjustment'], ['기타', 'Other']];
const isSales = () => S.role === 'salesman';
const staffOk = () => S.role === 'admin' || S.role === 'owner' || (S.role === 'manager' && (can('invoice') || can('verify')));
export function register(state) { S = state; Router.on('credit', page); }
/** CM 번호용 인보이스 종류 — 설정에 CM 칸 종류가 있으면 그것, 없으면 CM */
/** ↩ 세일즈맨 크레딧 메모 한 장 한도 — settings/app.creditMax (기본 10000, v0.8.179) · firestore.rules 의 creditMax() 와 같음 */
export const creditMax = () => { const v = Number(S && S.settings && S.settings.creditMax); return v >= 0 && isFinite(v) && S.settings.creditMax != null ? v : 10000; };
export function creditType() { return invTypes(S).find(t => t.comm === 'CM') || { c: 'CM', n: '크레딧 메모 Credit Memo', comm: 'CM', start: 1 }; }
const CR = { acct: '', store: '', sm: '', acc: null, disc: {}, dback: null, why: '', note: '', lines: [], rec: [] };
const DBACK = [0, 5, 10, 15, 20, 25, 30];
/** 이 줄에 쓸 할인 % — 🏷 할인 백을 골랐으면 그것, 아니면 가게 기본(종류별) */
const dcFor = t => CR.dback != null ? CR.dback : (Number(CR.disc[t]) || 0);
/** 할인 백이 바뀌면 — 직접 바꾼 가격 · 최근 인보이스 가격 줄은 그대로, 나머지 줄을 다시 계산 */
function reprice() { CR.lines.forEach(l => { if (l.src === 'manual' || l.src === 'recent') return; l.dc = dcFor(l.t); l.p = R2(l.lp * (1 - l.dc / 100)); }); }

async function page(arg) {
  if (arg === 'new') return form();
  if (arg && arg.indexOf('new:') === 0) return form(decodeURIComponent(arg.substring(4)));   // 🛒 주문 화면의 ↩ 크레딧 — 그 가게로 바로
  if (arg) return detail(decodeURIComponent(arg));
  return list();
}
/* ---------- 목록 — 세일즈맨: 내 크레딧 · 사무실: 확인 대기 먼저 ---------- */
async function list() {
  $('page').innerHTML = '<div class="load">' + bt('읽는 중…', 'Loading…') + '</div>';
  const T = creditType();
  let rows = [];
  try { rows = await S.DB.list('invoices', { where: isSales() ? [['t', '==', T.c], ['sm', '==', mySm()]] : [['t', '==', T.c]] }); } catch (e) { $('page').innerHTML = '<div class="card"><div class="alert a-red">' + esc(e.code || e.message) + '</div></div>'; return; }
  rows = sortBy(rows.filter(x => x.src === 'credit'), x => x.d + (x.createdAt || ''), true);
  const REQ_H = await reqListHtml();
  const wait = rows.filter(x => x.st !== 'x' && !x.reviewed), done = rows.filter(x => x.st !== 'x' && x.reviewed), voided = rows.filter(x => x.st === 'x');
  const row = x => '<div class="pr tap' + (x.st === 'x' ? '' : x.reviewed ? ' v' : '') + '" data-cr="' + esc(x.no) + '"><div class="mk">' + (x.st === 'x' ? '✕' : x.reviewed ? '✓' : '·') + '</div><div class="ct"><b>' + esc(x.store) + ' <span class="tag t-k">' + esc(x.no) + '</span>' + ((x.flags || []).length ? ' <span class="tag" style="background:#fef3c7;color:#92400e">⚠️ ' + x.flags.length + '</span>' : '') + '</b><small>' + esc(x.d) + ' · ' + esc(x.sm || '') + ' · ' + esc(x.why || '') + ' · ' + (x.qty ? Math.abs(x.qty) + bt('개', ' pcs') : '') + '</small></div><div class="pa"><b>' + money(x.total) + '</b><small>' + (x.st === 'x' ? 'VOID' : x.reviewed ? bt('사무실 확인', 'Reviewed') : bt('확인 대기', 'To review')) + '</small></div></div>';
  $('page').innerHTML = '<div class="card"><h2>↩ ' + bi('크레딧 · 리턴', 'Credits · Returns') + '</h2><div class="muted">' + (isSales() ? bt('가게에 준 크레딧 기록입니다. 확정하면 CM 번호가 생기고 가게 잔액에서 바로 빠집니다. 사무실이 내용을 확인합니다.', 'Credits you gave to stores. Once confirmed a CM number is issued and the store balance drops right away. The office reviews it.') : bt('세일즈맨이 확정한 크레딧 메모입니다. 내용 · 가격을 보고 ✅ 확인하거나, 문제면 VOID 하세요.', 'Credit memos confirmed by salesmen. Review and ✅ confirm, or VOID if wrong.')) + '</div>' +
    (isSales() || staffOk() ? '<div class="btns" style="justify-content:flex-start"><button class="b-blue" id="crNew">↩ ' + bi('크레딧 주기', 'Give credit') + '</button></div>' : '') +   // v0.8.164: 인보이스 · 사무실 담당도 바로 크레딧
    '<div class="kpi" style="grid-template-columns:repeat(3,1fr)"><div><b>' + wait.length + '</b><span>' + bt('확인 대기', 'To review') + '</span></div><div><b>' + money(-sumOf(wait.concat(done))) + '</b><span>' + bt('크레딧 합계', 'Credits total') + '</span></div><div><b>' + rows.length + '</b><span>' + bt('전체', 'All') + '</span></div></div></div>' +
    REQ_H +
    (wait.length ? '<div class="card"><h2>' + bt('확인 대기', 'To review') + ' ' + wait.length + '</h2>' + wait.map(row).join('') + '</div>' : '') +
    (done.length ? '<div class="card"><h2>' + bt('확인 완료', 'Reviewed') + ' ' + done.length + '</h2>' + done.map(row).join('') + '</div>' : '') +
    (voided.length ? '<div class="card"><h2>VOID ' + voided.length + '</h2>' + voided.map(row).join('') + '</div>' : '') +
    (!rows.length ? '<div class="card"><div class="none">' + bt('크레딧 기록이 없습니다', 'No credits yet') + '</div></div>' : '');
  if ($('crNew')) $('crNew').onclick = () => isSales() ? Router.go('order', 'credit') : Router.go('credit', 'new');   // 세일즈맨은 주문처럼 눌러 담는 크레딧 (v0.8.187)
  document.querySelectorAll('[data-crq2]').forEach(el => el.onclick = () => Router.go('order', el.dataset.crq2));
  document.querySelectorAll('[data-cr]').forEach(el => el.onclick = () => Router.go('credit', encodeURIComponent(el.dataset.cr)));
}
const sumOf = L => R2(L.reduce((a, x) => a + (Number(x.total) || 0), 0));

/* ---------- 입력 ---------- */
async function form(preAcct) {
  if (!isSales() && !staffOk()) { $('page').innerHTML = '<div class="card"><div class="none">' + bt('세일즈맨 · 담당자만', 'Salesmen and staff only') + '</div></div>'; return; }
  try { await loadCatalog(S); } catch (e) {}
  Object.assign(CR, { acct: '', store: '', sm: isSales() ? mySm() : '', acc: null, disc: {}, dback: null, why: '', note: '', lines: [], rec: [] });
  $('page').innerHTML = '<div class="card"><h2>↩ ' + bi('크레딧 주기', 'Give credit') + '</h2><div class="muted">' + bt('가게를 고르고 사유를 누른 뒤, 돌려줄 아이템과 수량을 담으세요. 가격은 가게 기본 할인을 적용한 값이 들어가고, 그 가게의 가장 최근 인보이스 가격과 다르면 비교해 보여 줍니다. 숫자는 그대로 적으면 앱이 크레딧(마이너스)으로 처리합니다.', 'Pick the store and a reason, then add the items and quantities. Prices use the store default discount; if the most recent invoice priced it differently you will see both. Type plain numbers — the app records it as a credit.') + '</div>' +
    '<div class="fg" style="margin-top:8px"><label>' + bt('가게', 'Store') + '</label><input id="crStore" placeholder="' + esc(bt('가게 이름 · 계정코드', 'Store name · account code')) + '" autocomplete="off"><div class="hits" id="crHits" style="display:none"></div><div id="crAcc" class="muted" style="font-size:12px"></div></div>' +
    '<div class="fg"><label>' + bt('사유', 'Reason') + '</label><div class="chips" style="margin:0" id="crWhy">' + WHY.map(w => '<button data-crw="' + esc(w[0]) + '">' + bi(w[0], w[1]) + '</button>').join('') + '</div><input id="crNote" placeholder="' + esc(bt('메모 (선택) — 어떤 물건 · 왜', 'Note (optional)')) + '" style="margin-top:6px"></div></div>' +
    /* 🏷 할인 백 — 기록(가게 기본 할인 · 최근 인보이스)이 없어도 할인해서 나간 물건은 할인 뺀 가격으로 크레딧 */
    '<div class="card"><h2>🏷 ' + bi('할인 백', 'Discount back') + '</h2><div class="muted">' + bt('그 물건이 할인해서 나갔으면 그 % 를 고르세요 — 모든 줄의 크레딧이 할인 뺀 가격이 됩니다. 기본은 가게 기본 할인.', 'If the goods went out discounted, pick that % — every line is credited at the discounted price. Default is the store discount.') + '</div><div class="chips" style="margin:6px 0 0" id="crDb"></div></div>' +
    '<div class="card"><h2>' + bt('돌려줄 아이템', 'Items to credit') + '</h2><div class="btns" style="justify-content:flex-start;margin:0 0 8px;flex-wrap:wrap"><button class="b-ghost b-sm" id="crFromInv">🕘 ' + bt('최근 인보이스에서 고르기', 'Pick from recent invoices') + '</button><button class="b-ghost b-sm" id="crPaste">📋 ' + bt('여러 개 한 번에 (코드 · 수량)', 'Many at once (code · qty)') + '</button></div><input id="crItem" placeholder="' + esc(bt('코드 · 바코드 · 이름', 'Code · barcode · name')) + '" autocomplete="off" autocapitalize="characters"><div class="hits" id="crIHits" style="display:none"></div><div id="crLines"></div><div id="crTot"></div></div>' +
    '<div class="card" style="text-align:center"><button class="b-blue" id="crGo" style="width:100%;padding:14px;background:#b45309" disabled>↩ ' + bi('크레딧 확정', 'Confirm credit') + '</button><div class="hint" style="text-align:left">' + bt('확정하면 CM 번호가 생기고 가게 잔액에서 바로 빠집니다. 사무실에 알림이 가고 담당자가 내용을 확인합니다. 리턴 물건은 평소처럼 회사로 보내 주세요.', 'Confirming issues a CM number and lowers the store balance right away. The office is notified and reviews it. Send returned goods to the office as usual.') + '</div></div>';
  $('crStore').oninput = debounce(() => { const hits = searchAccounts(S.accounts, $('crStore').value, 8), box = $('crHits'); box.style.display = hits.length ? '' : 'none';
    box.innerHTML = hits.map(a => '<div data-a="' + esc(a.acct) + '"><b>' + esc(a.store) + '</b> <span class="muted">' + esc(a.acct) + (a.sm ? ' · ' + esc(a.sm) : '') + '</span></div>').join('');
    box.querySelectorAll('[data-a]').forEach(d => d.onclick = () => pickStore(d.dataset.a)); }, 120);
  document.querySelectorAll('[data-crw]').forEach(b => b.onclick = () => { CR.why = b.dataset.crw; document.querySelectorAll('[data-crw]').forEach(x => x.classList.toggle('on', x === b)); paintTot(); });
  $('crNote').oninput = () => { CR.note = $('crNote').value; };
  $('crItem').oninput = debounce(() => { const q = $('crItem').value.trim(), box = $('crIHits'); if (!q) { box.style.display = 'none'; return; } const ex = exactItem(q); if (ex && /^\d{11,13}$/.test(q)) { addLine(ex); $('crItem').value = ''; box.style.display = 'none'; return; }
    const L = searchItems(q, null, 8); box.style.display = L.length ? '' : 'none'; box.innerHTML = L.map(it => '<div data-ic="' + esc(it.c) + '"><b>' + esc(it.c) + '</b> <span class="muted">' + esc(it.d) + ' · ' + money(it.p) + '</span></div>').join('');
    box.querySelectorAll('[data-ic]').forEach(d => d.onclick = () => { addLine(catalog().byCode[d.dataset.ic]); $('crItem').value = ''; box.style.display = 'none'; }); }, 120);
  $('crItem').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const ex = exactItem($('crItem').value); if (ex) { addLine(ex); $('crItem').value = ''; $('crIHits').style.display = 'none'; } } };
  $('crGo').onclick = confirm;
  $('crFromInv').onclick = pickFromInvoices; $('crPaste').onclick = pasteLines;
  paintDb(); paintLines();
  if (preAcct && S.accounts && S.accounts.byCode && S.accounts.byCode[preAcct]) pickStore(preAcct);
}
/** 🏷 할인 백 칩 — 가게 기본 · 0 · 5 · 10 … · 직접 */
function paintDb() {
  const box = $('crDb'); if (!box) return;
  const def = Object.keys(CR.disc).length ? Object.keys(CR.disc).map(k => k + ' ' + CR.disc[k] + '%').join(' · ') : '0%';
  const custom = CR.dback != null && !DBACK.includes(CR.dback);
  box.innerHTML = '<button class="' + (CR.dback == null ? 'on' : '') + '" data-crdb="">' + bt('가게 기본', 'Store default') + ' (' + esc(def) + ')</button>' + DBACK.map(v => '<button class="' + (CR.dback === v ? 'on' : '') + '" data-crdb="' + v + '">' + v + '%</button>').join('') +
    '<input id="crDbIn" type="number" inputmode="decimal" min="0" max="90" step="0.5" placeholder="' + esc(bt('직접 %', 'Other %')) + '" value="' + (custom ? CR.dback : '') + '" style="width:92px;padding:7px 9px;font-size:14px' + (custom ? ';border-color:var(--blue);font-weight:800' : '') + '">';
  box.querySelectorAll('[data-crdb]').forEach(b => b.onclick = () => { CR.dback = b.dataset.crdb === '' ? null : Number(b.dataset.crdb); reprice(); paintDb(); paintLines(); });
  $('crDbIn').onchange = () => { const v = Number($('crDbIn').value); CR.dback = $('crDbIn').value === '' ? null : Math.max(0, Math.min(90, isFinite(v) ? v : 0)); reprice(); paintDb(); paintLines(); };
}
/** 줄 여러 개를 한 번에 담기 — [{ it, q, p?, recent? }] · 같은 코드는 수량을 더함 */
function addMany(list) {
  let n = 0;
  list.forEach(x => { const it = x.it; if (!it || !(x.q > 0)) return; n++;
    const cur = CR.lines.find(l => l.c === it.c); if (cur) { cur.q += x.q; return; }
    const t = typeOfItem(S, it), lp = R2(x.lp != null ? x.lp : it.p), dc = dcFor(t);
    const l = { c: it.c, d: it.d, t, q: x.q, lp, p: R2(lp * (1 - dc / 100)), dc, src: 'store' }; withRecent(l);
    if (x.recent) { l.recent = x.recent; l.p = x.recent.p; l.dc = x.recent.disc; l.src = 'recent'; }
    CR.lines.push(l); });
  paintLines(); return n;
}
/** 🕘 최근 인보이스에서 고르기 — 인보이스를 고르면 그 줄들이 체크(수량 그대로)로 나오고, 고친 뒤 한 번에 담음. 가격은 그 인보이스 가격(할인 뺀 값) */
function pickFromInvoices() {
  if (!CR.acct) return toast(bt('가게를 먼저 고르세요', 'Pick the store first'), 'bad');
  if (!CR.rec.length) return toast(bt('이 가게의 인보이스 기록이 앱에 없습니다 — 코드로 담고 🏷 할인 백을 고르세요', 'No invoices for this store in the app — add by code and pick the discount back'), 'bad');
  const C = catalog();
  const list = () => openModal('<h2>🕘 ' + bi('최근 인보이스', 'Recent invoices') + ' — ' + esc(CR.store) + '</h2><div class="muted">' + bt('크레딧할 물건이 나간 인보이스를 고르세요', 'Pick the invoice the goods went out on') + '</div>' +
    CR.rec.slice(0, 40).map((x, i) => '<div class="pr tap" data-cri="' + i + '"><div class="ct"><b>' + esc(x.no) + '</b><small>' + esc(x.d) + ' · ' + (x.lines || []).length + bt('줄', ' lines') + (Number(x.disc) ? ' · ' + bt('할인', 'disc') + ' ' + Number(x.disc) + '%' : '') + '</small></div><div class="pa"><b>' + money(x.total) + '</b></div></div>').join('') +
    '<div class="btns"><button class="b-ghost" id="criX">' + bt('닫기', 'Close') + '</button></div>');
  const one = inv => {
    const dc = Number(inv.disc) || 0, L = (inv.lines || []).filter(l => num(l.q) > 0);
    openModal('<h2>🕘 ' + esc(inv.no) + ' <span class="muted" style="font-size:13px">' + esc(inv.d) + (dc ? ' · ' + bt('할인', 'disc') + ' ' + dc + '%' : '') + '</span></h2><div class="muted">' + bt('돌려받을 줄만 체크 · 수량을 고친 뒤 담기. 가격은 이 인보이스 가격(할인 뺀 값)', 'Tick the lines to credit, fix the qty, then add. Prices come from this invoice (after discount)') + '</div>' +
      '<div class="btns" style="justify-content:flex-start;margin:6px 0"><button class="b-ghost b-sm" id="criAll">☑ ' + bt('모두', 'All') + '</button><button class="b-ghost b-sm" id="criNone">☐ ' + bt('해제', 'None') + '</button></div>' +
      L.map((l, i) => '<label class="pick" style="margin-top:4px"><input type="checkbox" class="ck-big" data-crk="' + i + '"><span class="pm"><b>' + esc(l.c) + '</b><small>' + esc(l.d || '') + ' · ' + money(R2(num(l.p) * (1 - dc / 100))) + '</small></span><input type="number" inputmode="numeric" min="1" max="' + num(l.q) + '" data-crkq="' + i + '" value="' + num(l.q) + '" style="width:70px;text-align:right;font-weight:800"></label>').join('') +
      '<div class="btns"><button class="b-ghost" id="criBack">‹ ' + bt('인보이스 목록', 'Invoices') + '</button><button class="b-blue" id="criAdd">↩ ' + bt('체크한 줄 담기', 'Add ticked lines') + '</button></div>');
    $('criAll').onclick = () => document.querySelectorAll('[data-crk]').forEach(c => { c.checked = true; });
    $('criNone').onclick = () => document.querySelectorAll('[data-crk]').forEach(c => { c.checked = false; });
    document.querySelectorAll('[data-crkq]').forEach(q => q.oninput = () => { const c = document.querySelector('[data-crk="' + q.dataset.crkq + '"]'); if (c) c.checked = true; });
    $('criBack').onclick = list2;
    $('criAdd').onclick = () => {
      const pick = []; document.querySelectorAll('[data-crk]').forEach(c => { if (!c.checked) return; const l = L[+c.dataset.crk], q = Math.max(1, Math.floor(num(document.querySelector('[data-crkq="' + c.dataset.crk + '"]').value) || 1)); const it = (C && C.byCode[l.c]) || { c: l.c, d: l.d || l.c, p: num(l.lp != null ? l.lp : l.p) };
        pick.push({ it, q, lp: num(l.lp != null ? l.lp : l.p), recent: { no: inv.no, d: inv.d, p: R2(num(l.p) * (1 - dc / 100)), disc: dc, lp: num(l.p) } }); });
      if (!pick.length) return toast(bt('줄을 체크하세요', 'Tick some lines'), 'bad');
      closeModal(); const n = addMany(pick); toast('↩ ' + n + bt('줄 담음', ' lines added'), 'good');
    };
  };
  const list2 = () => { list(); $('criX').onclick = closeModal; document.querySelectorAll('[data-cri]').forEach(el => el.onclick = () => one(CR.rec[+el.dataset.cri])); };
  list2();
}
/** 📋 여러 개 한 번에 — 한 줄에 "코드 수량" (수량 없으면 1 · 탭 · 쉼표 · x 구분 다 됨) */
function pasteLines() {
  openModal('<h2>📋 ' + bi('여러 개 한 번에', 'Many at once') + '</h2><div class="muted">' + bt('한 줄에 하나씩 "코드 수량" — 예: HGDS02 2 · 수량을 안 쓰면 1개. 엑셀에서 두 칸(코드 · 수량)을 복사해 붙여도 됩니다.', 'One per line: "code qty" — e.g. HGDS02 2. No qty = 1. You can paste two Excel columns.') + '</div>' +
    '<textarea id="crPT" rows="9" placeholder="HGDS02 2&#10;HGDG02 2&#10;PPEG11 3" style="margin-top:8px;font-family:ui-monospace,monospace" autocapitalize="characters"></textarea><div id="crPO" class="muted" style="margin-top:4px"></div>' +
    '<div class="btns"><button class="b-ghost" id="crPX">' + bt('닫기', 'Close') + '</button><button class="b-blue" id="crPOk">↩ ' + bt('담기', 'Add') + '</button></div>');
  const parse = () => { const ok = [], bad = []; String($('crPT').value || '').split(/\r?\n/).forEach(ln => { ln = ln.trim(); if (!ln) return; const m = ln.match(/^(\S+?)(?:[\s,;]+[x×*]?\s*(\d+))?\s*$/i) || ln.match(/^(\S+)/); const code = m ? m[1] : ln, q = m && m[2] ? Number(m[2]) : 1; const it = exactItem(code); if (it) ok.push({ it, q }); else bad.push(code); }); return { ok, bad }; };
  $('crPT').oninput = debounce(() => { const r = parse(); $('crPO').innerHTML = r.ok.length + bt('줄 확인', ' ok') + ' · ' + r.ok.reduce((a, x) => a + x.q, 0) + bt('개', ' pcs') + (r.bad.length ? ' · <b class="warn">' + bt('모르는 코드', 'unknown') + ': ' + esc(r.bad.join(', ')) + '</b>' : ''); }, 200);
  $('crPX').onclick = closeModal;
  $('crPOk').onclick = () => { const r = parse(); if (!r.ok.length) return toast(bt('알아본 코드가 없습니다', 'No known codes'), 'bad'); closeModal(); const n = addMany(r.ok); toast('↩ ' + n + bt('줄 담음', ' lines added') + (r.bad.length ? ' · ' + bt('모르는 코드', 'unknown') + ' ' + r.bad.length : ''), r.bad.length ? 'bad' : 'good'); };
  setTimeout(() => $('crPT') && $('crPT').focus(), 50);
}
async function pickStore(acct) {
  const a = S.accounts.byCode[acct]; if (!a) return;
  CR.acct = a.acct; CR.store = a.store; CR.acc = a; CR.disc = acctDisc(a); if (!isSales()) CR.sm = a.sm || '';
  $('crStore').value = a.store; $('crHits').style.display = 'none';
  const dtxt = Object.keys(CR.disc).length ? Object.keys(CR.disc).map(k => k + ' ' + CR.disc[k] + '%').join(' · ') : bt('할인 없음', 'no discount');
  $('crAcc').innerHTML = '<b>' + esc(a.acct) + '</b> · ' + esc(a.sm || '') + ' · ' + bt('가게 기본 할인', 'store discount') + ': <b>' + esc(dtxt) + '</b> · <span id="crRecN">' + bt('최근 인보이스 읽는 중…', 'loading recent invoices…') + '</span>';
  /* 가장 최근 인보이스들 (크레딧 · VOID 빼고) — 아이템 가격 비교용 */
  CR.rec = [];
  try { const T = creditType(); const L = await S.DB.list('invoices', { where: [['acct', '==', a.acct]] }); CR.rec = sortBy(L.filter(x => x.st !== 'x' && x.t !== T.c && Array.isArray(x.lines)), x => x.d + (x.createdAt || ''), true).slice(0, 60); } catch (e) {}
  const n = $('crRecN'); if (n) n.textContent = bt('최근 인보이스', 'recent invoices') + ' ' + CR.rec.length + (CR.rec.length ? ' (' + bt('마지막', 'last') + ' ' + CR.rec[0].d + ')' : '');
  CR.lines.forEach(l => withRecent(l)); reprice(); paintDb(); paintLines();
}
/** 그 가게의 가장 최근 인보이스에서 같은 아이템 가격 — 인보이스 단가 × (1 − 인보이스 할인) */
function withRecent(l) {
  l.recent = null;
  for (const inv of CR.rec) { const ln = (inv.lines || []).find(x => x.c === l.c); if (ln) { const dc = Number(inv.disc) || 0; l.recent = { no: inv.no, d: inv.d, p: R2(num(ln.p) * (1 - dc / 100)), disc: dc, lp: num(ln.p) }; break; } }
}
function addLine(it) {
  if (!it) return;
  const cur = CR.lines.find(l => l.c === it.c); if (cur) { cur.q += 1; paintLines(); return; }
  const t = typeOfItem(S, it), dc = dcFor(t), lp = R2(it.p), p = R2(lp * (1 - dc / 100));
  const l = { c: it.c, d: it.d, t, q: 1, lp, p, dc, src: 'store' }; withRecent(l); CR.lines.push(l); paintLines();
  setTimeout(() => { const el = document.querySelector('[data-crq="' + CSS.escape(it.c) + '"]'); if (el) { el.focus(); el.select(); } }, 30);
}
const diffP = l => l.recent && Math.abs(l.recent.p - l.p) > 0.009;
let PAINTING = false;
function paintLines() {
  const box = $('crLines'); if (!box || PAINTING) return;
  PAINTING = true;
  /* 수량 · 가격 칸에 포커스가 있는 채로 다시 그리면 blur → change 가 겹쳐 두 번 그려짐 — 먼저 포커스를 뺌 */
  try { if (document.activeElement && box.contains(document.activeElement)) document.activeElement.blur(); } catch (e) {}
  box.innerHTML = CR.lines.length ? CR.lines.map(l => '<div class="crline" data-crl="' + esc(l.c) + '"><div class="ct"><b>' + esc(l.c) + ' <span class="tag t-g">' + esc(l.t) + '</span></b><small>' + esc(l.d) + '</small><small>' + bt('목록가', 'List') + ' ' + money(l.lp) + (l.dc ? ' − ' + l.dc + '%' + (CR.dback != null && l.src === 'store' ? ' (' + bt('할인 백', 'disc back') + ')' : '') + ' → ' + money(R2(l.lp * (1 - l.dc / 100))) : '') + (l.src === 'recent' ? ' · <b style="color:#1e40af">' + bt('최근 인보이스 가격 적용', 'recent invoice price') + '</b>' : l.src === 'manual' ? ' · <b style="color:#b45309">' + bt('직접 바꾼 가격', 'manual price') + '</b>' : '') + '</small>' +
    (l.recent ? '<small class="' + (diffP(l) ? 'warn' : 'muted') + '">🕘 ' + bt('최근', 'Recent') + ' ' + esc(l.recent.d) + ' ' + esc(l.recent.no) + ': <b>' + money(l.recent.p) + '</b>' + (l.recent.disc ? ' (' + bt('할인', 'disc') + ' ' + l.recent.disc + '%)' : '') + (diffP(l) ? ' ≠ ' + money(l.p) + ' <button class="b-ghost b-sm" data-cruse="' + esc(l.c) + '">' + bt('이 가격으로', 'Use this') + '</button>' : ' ✓') + '</small>' : CR.acct ? '<small class="muted">🕘 ' + bt('최근 인보이스에 이 아이템 없음', 'not on recent invoices') + '</small>' : '') + '</div>' +
    '<div class="qty"><button data-crd="' + esc(l.c) + '|-1">−</button><input type="number" inputmode="numeric" min="1" data-crq="' + esc(l.c) + '" value="' + l.q + '"><button data-crd="' + esc(l.c) + '|1">＋</button></div>' +
    '<div class="pa"><input type="number" step="0.01" inputmode="decimal" data-crp="' + esc(l.c) + '" value="' + l.p + '" style="width:84px;text-align:right;font-weight:800"><small>' + bt('크레딧', 'credit') + ' −' + money(R2(l.q * l.p)) + '</small></div><button class="b-ghost b-sm" data-crx="' + esc(l.c) + '">✕</button></div>').join('') : '<div class="none">' + bt('아이템 코드를 치거나 바코드를 찍으세요', 'Type a code or scan a barcode') + '</div>';
  box.querySelectorAll('[data-crq]').forEach(i => i.onchange = () => { const l = CR.lines.find(x => x.c === i.dataset.crq); l.q = Math.max(1, Math.floor(num(i.value) || 1)); paintLines(); });
  box.querySelectorAll('[data-crd]').forEach(b => b.onclick = () => { const [c, d] = b.dataset.crd.split('|'); const l = CR.lines.find(x => x.c === c); l.q = Math.max(1, l.q + Number(d)); paintLines(); });
  box.querySelectorAll('[data-crp]').forEach(i => i.onchange = () => { const l = CR.lines.find(x => x.c === i.dataset.crp); const v = R2(num(i.value)); if (v > 0) { l.p = v; l.src = Math.abs(v - R2(l.lp * (1 - dcFor(l.t) / 100))) < 0.009 ? 'store' : (l.recent && Math.abs(v - l.recent.p) < 0.009) ? 'recent' : 'manual'; } paintLines(); });
  box.querySelectorAll('[data-cruse]').forEach(b => b.onclick = () => { const l = CR.lines.find(x => x.c === b.dataset.cruse); l.p = l.recent.p; l.src = 'recent'; paintLines(); });
  box.querySelectorAll('[data-crx]').forEach(b => b.onclick = () => { CR.lines = CR.lines.filter(x => x.c !== b.dataset.crx); paintLines(); });
  PAINTING = false;
  paintTot();
}
const totals = () => { const q = CR.lines.reduce((a, l) => a + l.q, 0), sub = R2(CR.lines.reduce((a, l) => a + l.q * l.p, 0)), list = R2(CR.lines.reduce((a, l) => a + l.q * l.lp, 0)); return { q, sub, list }; };
const flagsOf = () => { const F = []; if (CR.dback != null && Object.keys(CR.disc).concat(['_']).some(k => k === '_' ? !Object.keys(CR.disc).length && CR.dback : Number(CR.disc[k]) !== CR.dback)) F.push('할인 백 ' + CR.dback + '% (가게 기본 ' + (Object.keys(CR.disc).length ? Object.keys(CR.disc).map(k => k + ' ' + CR.disc[k] + '%').join(' · ') : '0%') + ')'); const nd = CR.lines.filter(diffP).length; if (nd) F.push('가격이 최근 인보이스와 다름 ' + nd + '줄'); const nm = CR.lines.filter(l => l.src === 'manual').length; if (nm) F.push('가격을 직접 바꿈 ' + nm + '줄'); return F; };
function paintTot() {
  const t = totals(), F = flagsOf(), ok = CR.acct && CR.why && CR.lines.length && t.sub > 0;
  const el = $('crTot'); if (el) el.innerHTML = CR.lines.length ? '<div class="sumbox" style="margin-top:8px">' + bt('수량', 'Qty') + ' <b>' + t.q + '</b> · ' + bt('목록가 합', 'List total') + ' ' + money(t.list) + ' · <b style="font-size:17px;color:#b45309">' + bt('크레딧', 'Credit') + ' −' + money(t.sub) + '</b>' + (!can('invoice') && t.sub > creditMax() ? '<div class="warn" style="margin-top:4px">⛔ ' + bt('크레딧 한 장 한도', 'Credit memo limit') + ' ' + money(creditMax()) + ' — ' + bt('넘는 금액은 사무실에 요청하세요', 'ask the office for larger credits') + '</div>' : '') + (F.length ? '<div class="warn" style="margin-top:4px">⚠️ ' + F.map(esc).join(' · ') + ' — ' + bt('사무실에 표시됩니다', 'shown to the office') + '</div>' : '') + '</div>' : '';
  const g = $('crGo'); if (g) { g.disabled = !ok; g.style.background = ok ? '#b45309' : '#e2e8f0'; g.style.color = ok ? '#fff' : '#94a3b8'; }
}
async function confirm() {
  const t = totals(); if (!CR.acct) return toast(bt('가게를 고르세요', 'Pick a store'), 'bad'); if (!CR.why) return toast(bt('사유를 고르세요', 'Pick a reason'), 'bad'); if (!CR.lines.length || !(t.sub > 0)) return toast(bt('아이템을 담으세요', 'Add items'), 'bad');
  if (!can('invoice') && t.sub > creditMax()) return toast(bt('크레딧 한 장 한도', 'Credit memo limit') + ' ' + money(creditMax()) + ' — ' + bt('넘는 금액은 사무실에 요청하세요', 'ask the office for larger credits'), 'bad');   // 🔐 M2 (firestore.rules 도 같은 한도)
  if (!CR.sm) return toast(bt('세일즈맨이 없습니다', 'No salesman'), 'bad');
  const F = flagsOf();
  if (!(await confirmBox(bt('크레딧을 확정할까요?', 'Confirm this credit?') + '\n' + CR.store + ' · ' + CR.why + '\n' + CR.lines.length + bt('개 아이템 · ', ' items · ') + t.q + bt('개 · 크레딧 −', ' pcs · credit −') + money(t.sub) + (F.length ? '\n⚠️ ' + F.join(' · ') : ''), '↩ ' + bt('확정', 'Confirm')))) return;
  busy(true);
  try {
    const T = creditType(), no = await nextInvoiceNo(S, T), d = today(), now = new Date().toISOString(), C = catalog();
    const doc = { no, id: no, t: T.c, kind: 'credit', src: 'credit', d, ym: ym(d), acct: CR.acct, store: CR.store, sm: CR.sm, why: CR.why, note: CR.note.trim(),
      lines: CR.lines.map(l => { const it = C && C.byCode[l.c]; return { c: l.c, d: l.d, q: -l.q, p: l.p, lp: l.lp, dc: l.dc, src: l.src, g: it ? productLine(it) : '', ty: l.t, recent: l.recent ? { no: l.recent.no, d: l.recent.d, p: l.recent.p, disc: l.recent.disc } : null }; }),
      qty: -t.q, sub: -t.sub, list: -t.list, disc: 0, total: -t.sub, bal: -t.sub, discMap: CR.disc, dback: CR.dback, flags: F, terms: (CR.acc && CR.acc.terms) || '', st: 'open', reviewed: false, createdBy: S.user.email, createdAt: now };
    await S.DB.set('invoices', no, doc);
    dropInvCache(monthsOf([doc]));
    try { const N = await import('./notify.js'); await N.queue({ kind: 'credit', toStaff: true, pushOnly: true, subject: '[THE ONE] ↩ 크레딧 ' + (F.length ? '⚠️ ' : '') + '— ' + CR.store + ' ' + money(-t.sub), text: '↩ 크레딧 ' + no + ' · ' + CR.sm + ' · ' + CR.store + ' (' + CR.acct + ')\n' + CR.why + (CR.note ? ' — ' + CR.note.trim() : '') + (CR.dback != null ? '\n🏷 할인 백 ' + CR.dback + '%' : '') + '\n' + CR.lines.map(l => l.c + ' ×' + l.q + ' @' + money(l.p)).join(', ') + '\n크레딧 −' + money(t.sub) + (F.length ? '\n⚠️ ' + F.join(' · ') : ''), url: N.appUrl('credit/' + encodeURIComponent(no)) }); } catch (e) {}
    closeModal(); toast('↩ ' + no + ' — ' + bt('크레딧 확정', 'credit confirmed') + ' −' + money(t.sub), 'good');
    Router.go('credit', encodeURIComponent(no));
  } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
  busy(false);
}

/* ---------- 상세 — 사무실 확인 · VOID · 인쇄 ---------- */
async function detail(no) {
  $('page').innerHTML = '<div class="load">' + bt('읽는 중…', 'Loading…') + '</div>';
  let x = null; try { x = await S.DB.get('invoices', no); } catch (e) {}
  if (!x) { $('page').innerHTML = '<div class="card"><div class="none">' + bt('크레딧을 찾지 못했습니다', 'Credit not found') + ' ' + esc(no) + '</div></div>'; return; }
  const st = x.st === 'x' ? '<span class="tag t-x">VOID</span>' : x.reviewed ? '<span class="tag t-k">✅ ' + bt('사무실 확인', 'Reviewed') + '</span>' : '<span class="tag" style="background:#fef3c7;color:#92400e">' + bt('확인 대기', 'To review') + '</span>';
  $('page').innerHTML = '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><div><h2 style="margin:0">↩ ' + esc(x.no) + ' ' + st + '</h2><div style="font-size:17px;font-weight:800;margin-top:6px">' + esc(x.store) + '</div><div class="muted">' + esc(x.acct || '') + ' · ' + esc(x.sm || '') + ' · ' + esc(x.d) + ' · ' + esc(String(x.createdBy || '').split('@')[0]) + '</div></div><button class="b-ghost b-sm" id="crBack">‹ ' + bt('목록', 'List') + '</button></div>' +
    '<div class="hero" style="font-size:26px;color:#b45309">' + money(x.total) + '</div><div class="heroSub">' + bt('사유', 'Reason') + ': <b>' + esc(x.why || '') + '</b>' + (x.note ? ' — ' + esc(x.note) : '') + (x.dback != null ? ' · 🏷 ' + bt('할인 백', 'Discount back') + ' <b>' + x.dback + '%</b>' : '') + '</div>' +
    ((x.flags || []).length ? '<div class="alert a-amb">⚠️ ' + x.flags.map(esc).join(' · ') + '</div>' : '') +
    (x.st === 'x' ? '<div class="alert a-red">✕ VOID — ' + esc(x.voidReason || '') + ' <span class="muted">' + esc(String(x.voidBy || '').split('@')[0]) + ' ' + esc(String(x.voidAt || '').substring(0, 10)) + '</span></div>' : '') +
    /* 💵 크레딧 쓰기 — 수금 입력에서 미결 인보이스와 같이 고르면 받을 돈에서 빠짐. 사무실이 그 수금을 확인하면 남은 크레딧이 줄어듦 */
    (x.st !== 'x' ? '<div class="sumbox" style="margin-top:8px">💵 ' + bt('남은 크레딧', 'Credit left') + ' <b style="color:#15803d">' + money(x.bal != null ? x.bal : x.total) + '</b>' + (usedPay(x) ? ' · ' + bt('수금에 쓴 것', 'used in payments') + ' ' + money(usedPay(x)) : '') + (usedApply(x) ? ' · ' + bt('인보이스에 적용', 'applied to invoices') + ' ' + money(usedApply(x)) : '') + '<div class="muted" style="margin-top:4px">' + bt('이 크레딧은 인보이스처럼 가게 기록에 남습니다 (가게 창 · 인보이스 조회 · 수금 고르기). 수금 받을 때(💵 수금 입력) 인보이스와 이 크레딧(↩ 표시)을 같이 누르면 받을 돈 = 인보이스 − 크레딧 이 되고, 사무실이 그 수금을 확인하면 남은 크레딧이 줄어듭니다.', 'This credit stays on the store record like an invoice (store window · invoice lookup · payment picks). Tap it together with invoices when collecting: amount to collect = invoices − credit. When the office verifies that payment, the credit is used up.') + (applyOk() ? ' ' + bt('오피스 매니저 · 관리자는 아래 ↩ 인보이스에 바로 적용 으로 돈 없이 바로 맞출 수 있습니다.', 'Office manager · admin can also apply it straight to invoices below.') : '') + '</div></div>' : '') +
    applyHtml(x) +
    (x.reviewed ? '<div class="alert a-grn">✅ ' + bt('사무실 확인', 'Reviewed') + ' — ' + esc(String(x.reviewedBy || '').split('@')[0]) + ' ' + esc(String(x.reviewedAt || '').substring(0, 16).replace('T', ' ')) + '</div>' : '') +
    '<div class="btns" style="margin-top:8px;flex-wrap:wrap"><button class="b-ghost b-sm" id="crPrint">🖨 ' + bt('크레딧 메모 인쇄', 'Print credit memo') + '</button>' + (x.st !== 'x' && x.acct ? '<button class="b-ghost b-sm" id="crOrder">🛒 ' + bt('이 가게 주문 (교환 물건)', 'Order for this store (exchange)') + '</button>' : '') + (applyOk() && x.st !== 'x' && crLeft(x) > 0.005 ? '<button class="b-blue b-sm" id="crApply">↩ ' + bt('인보이스에 바로 적용', 'Apply to invoices') + '</button>' : '') + (staffOk() && x.st !== 'x' ? (!x.reviewed ? '<button class="b-ghost b-sm" id="crRedisc">🏷 ' + bt('할인 백 적용', 'Apply discount back') + '</button><button class="b-green b-sm" id="crOk">✅ ' + bt('확인', 'Confirm') + '</button>' : '') + '<button class="b-ghost b-sm" id="crVoid" style="color:#991b1b">🚫 VOID</button>' : '') + '</div></div>' +
    '<div class="card"><h2>' + bt('아이템', 'Items') + ' ' + (x.lines || []).length + '</h2><table><tr><th>' + bt('코드', 'Code') + '</th><th class="r">' + bt('수량', 'Qty') + '</th><th class="r">' + bt('단가', 'Unit') + '</th><th class="r">' + bt('크레딧', 'Credit') + '</th></tr>' + (x.lines || []).map(l => '<tr><td><b>' + esc(l.c) + '</b><div class="muted" style="font-size:11.5px">' + esc(l.d || '') + (l.dc ? ' · ' + bt('가게 할인', 'store disc') + ' ' + l.dc + '%' : '') + (l.src === 'recent' ? ' · ' + bt('최근 인보이스 가격', 'recent invoice price') : l.src === 'manual' ? ' · <b class="warn">' + bt('직접 바꾼 가격', 'manual price') + '</b>' : '') + (l.recent ? '<br>🕘 ' + esc(l.recent.d) + ' ' + esc(l.recent.no) + ' ' + money(l.recent.p) + (Math.abs(l.recent.p - l.p) > 0.009 ? ' <b class="warn">≠</b>' : ' ✓') : '') + '</div></td><td class="r">' + Math.abs(l.q) + '</td><td class="r">' + money(l.p) + '</td><td class="r"><b>−' + money(R2(Math.abs(l.q) * l.p)) + '</b></td></tr>').join('') + '</table></div>';
  $('crBack').onclick = () => Router.go('credit');
  $('crPrint').onclick = () => printOpen(creditHtml(x));
  if ($('crOrder')) $('crOrder').onclick = async () => { const M = await import('./orders.js'); M.startOrderFor(x.acct); };
  /* 🏷 사무실: 확인 전 크레딧에 할인 백 % 를 다시 적용 — 목록가 × (1 − %) 로 줄 · 합계를 다시 계산 (직접 바꾼 가격 줄도 목록가 기준으로) */
  if ($('crRedisc')) $('crRedisc').onclick = () => {
    openModal('<h2>🏷 ' + esc(x.no) + ' ' + bi('할인 백 적용', 'Apply discount back') + '</h2><div class="muted">' + bt('모든 줄을 목록가에서 이 % 를 뺀 가격으로 다시 계산합니다. 지금', 'Every line is recalculated at list price minus this %. Now') + ' ' + money(x.total) + '</div><div class="chips" style="margin-top:8px">' + DBACK.map(v => '<button data-rdb="' + v + '"' + (x.dback === v ? ' class="on"' : '') + '>' + v + '%</button>').join('') + '</div><input id="rdbIn" type="number" inputmode="decimal" min="0" max="90" step="0.5" placeholder="' + esc(bt('직접 %', 'Other %')) + '" style="margin-top:6px"><div id="rdbOut" class="sumbox" style="margin-top:8px"></div><div class="btns"><button class="b-ghost" id="rdbX">' + bt('돌아가기', 'Back') + '</button><button class="b-blue" id="rdbGo" disabled>🏷 ' + bt('적용', 'Apply') + '</button></div>');
    let pct = null;
    const calc = p => { const L = (x.lines || []).map(l => { const lp = num(l.lp != null ? l.lp : l.p); return Object.assign({}, l, { lp, dc: p, p: R2(lp * (1 - p / 100)), src: 'store' }); }); const sub = R2(L.reduce((a, l) => a + Math.abs(l.q) * l.p, 0)), list = R2(L.reduce((a, l) => a + Math.abs(l.q) * l.lp, 0)); return { L, sub, list }; };
    const show = p => { pct = p; const r = calc(p); $('rdbOut').innerHTML = p + '% → ' + bt('크레딧', 'credit') + ' <b>−' + money(r.sub) + '</b> (' + bt('지금', 'now') + ' ' + money(x.total) + ')'; $('rdbGo').disabled = false; document.querySelectorAll('[data-rdb]').forEach(b => b.classList.toggle('on', Number(b.dataset.rdb) === p)); };
    document.querySelectorAll('[data-rdb]').forEach(b => b.onclick = () => show(Number(b.dataset.rdb)));
    $('rdbIn').oninput = () => { const v = Number($('rdbIn').value); if ($('rdbIn').value !== '' && isFinite(v) && v >= 0 && v <= 90) show(v); };
    $('rdbX').onclick = closeModal;
    $('rdbGo').onclick = async () => { if (pct == null) return; const r = calc(pct); busy(true);
      try { await S.DB.update('invoices', x.no, { lines: r.L, sub: -r.sub, list: -r.list, total: -r.sub, bal: Math.min(0, R2(-r.sub - Object.values(x.pays || {}).reduce((a, v) => a + (Number(v) || 0), 0))), dback: pct, flags: (x.flags || []).filter(f => !/^할인 백/.test(f)).concat(['할인 백 ' + pct + '% — 사무실 적용']), discAt: new Date().toISOString(), discBy: S.user.email }); dropInvCache(monthsOf([x])); closeModal(); toast('🏷 ' + x.no + ' −' + money(r.sub), 'good'); detail(no); }
      catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); } busy(false); };
  };
  if ($('crApply')) $('crApply').onclick = () => applyModal(x, () => detail(no));
  document.querySelectorAll('[data-apx]').forEach(b => b.onclick = async () => {
    const i = +b.dataset.apx, a = (x.apply || [])[i]; if (!a) return;
    if (!(await confirmBox(bt('이 적용을 되돌릴까요?', 'Undo this application?') + '\n' + x.no + ' → ' + a.no + ' ' + money(a.amt), '✕ ' + bt('되돌리기', 'Undo')))) return;
    busy(true); try { await saveApply(x, (x.apply || []).filter((_, k) => k !== i), [a.no]); toast('✕ ' + a.no + ' ' + money(a.amt)); detail(no); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); } busy(false);
  });
  if ($('crOk')) $('crOk').onclick = async () => { busy(true); try { await S.DB.update('invoices', x.no, { reviewed: true, reviewedBy: S.user.email, reviewedAt: new Date().toISOString() }); toast('✅ ' + x.no); detail(no); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('crVoid')) $('crVoid').onclick = () => {
    if ((x.apply || []).length) return toast(bt('인보이스에 적용한 기록이 있습니다 — 먼저 ✕ 되돌린 뒤 VOID 하세요', 'Applied to invoices — undo those first, then VOID'), 'bad');
    openModal('<h2 style="color:#991b1b">🚫 ' + esc(x.no) + ' VOID</h2><div class="muted">' + bt('크레딧을 무효로 합니다. 가게 잔액에서 다시 더해지고 세일즈맨에게 사유가 전달됩니다.', 'Voids the credit: the store balance goes back up and the salesman is told why.') + '</div><div class="fg"><label>' + bt('사유 (필수)', 'Reason (required)') + '</label><input id="cvWhy"></div><div class="btns"><button class="b-ghost" id="cvX">' + bt('돌아가기', 'Back') + '</button><button class="b-red" id="cvGo">🚫 VOID</button></div>');
    $('cvX').onclick = closeModal;
    $('cvGo').onclick = async () => { const why = $('cvWhy').value.trim(); if (!why) return toast(bt('사유를 적으세요', 'Type the reason'), 'bad'); busy(true);
      try { const now = new Date().toISOString(); await S.DB.update('invoices', x.no, { st: 'x', bal: 0, voidAt: now, voidBy: S.user.email, voidReason: why }); dropInvCache(monthsOf([x]));
        try { const N = await import('./notify.js'); await N.queue({ kind: 'creditVoid', toSm: x.sm, pushOnly: true, subject: '[THE ONE] 🚫 크레딧 VOID — ' + x.store, text: '🚫 크레딧 ' + x.no + ' VOID → ' + x.sm + ' · ' + x.store + ' ' + money(x.total) + '\n사유: ' + why, url: N.appUrl('credit/' + encodeURIComponent(x.no)) }); } catch (e) {}
        closeModal(); toast('🚫 VOID ' + x.no); detail(no); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); } busy(false); };
  };
}
/* ---------- ↩ 인보이스에 바로 적용 (v0.8.179) — 오피스 매니저 · 관리자 · 오너만 ---------- */
const applyOk = () => can('crApply');
/** 남은 크레딧 (양수) */
const crLeft = x => x.st === 'x' ? 0 : R2(-(x.bal != null ? x.bal : x.total));
const usedApply = x => R2((x.apply || []).reduce((a, y) => a + num(y.amt), 0));
const usedPay = x => R2(Object.keys(x.pays || {}).filter(k => k.indexOf('AP:') !== 0).reduce((a, k) => a + (Number(x.pays[k]) || 0), 0));
function applyHtml(x) {
  const L = x.apply || []; if (!L.length) return '';
  return '<div class="sumbox" style="margin-top:8px"><b>↩ ' + bt('인보이스에 적용한 기록', 'Applied to invoices') + '</b>' + L.map((a, i) => '<div class="muted" style="display:flex;gap:8px;align-items:center;margin-top:4px"><span style="flex:1">' + esc(a.d || '') + ' · <b>' + esc(a.no) + '</b>' + (a.ar ? ' <span class="tag t-c">AR</span>' : '') + ' — <b>' + money(a.amt) + '</b> · ' + esc(String(a.by || '').split('@')[0]) + '</span>' + (applyOk() && x.st !== 'x' ? '<button class="b-ghost b-sm" data-apx="' + i + '" title="' + esc(bt('되돌리기', 'Undo')) + '">✕</button>' : '') + '</div>').join('') +
    (L.some(a => a.ar) ? '<div class="muted" style="margin-top:4px;font-size:12px">AR = ' + bt('이전 시스템(SmartBee) 인보이스 — SmartBee 에도 같은 크레딧을 넣어야 다음 AR 올리기 뒤에도 맞습니다', 'SmartBee invoice — enter the same credit in SmartBee so the next A/R upload matches') + '</div>' : '') + '</div>';
}
/** 적용 기록(apply) 을 저장하고 두 쪽 잔액을 다시 맞춤 — CM: pays['AP:인보이스'] · 앱 인보이스: pays['CM:크레딧'] (touched: 바뀐 인보이스 번호) */
async function saveApply(x, apply, touched) {
  const by = {}; apply.forEach(a => { const k = invNo(a.no); by[k] = R2((by[k] || 0) + num(a.amt)); });
  const pays = {}; Object.keys(x.pays || {}).forEach(k => { if (k.indexOf('AP:') !== 0) pays[k] = x.pays[k]; });
  Object.keys(by).forEach(no => { if (by[no]) pays['AP:' + no] = -by[no]; });
  const paid = R2(Object.values(pays).reduce((a, v) => a + (Number(v) || 0), 0)), bal = Math.min(0, R2((x.total || 0) - paid)), now = new Date().toISOString();
  await S.DB.update('invoices', x.no, { apply, pays, paid, bal, applyAt: now });
  Object.assign(x, { apply, pays, paid, bal });
  const docs = [x];
  for (const no of Array.from(new Set(touched.map(invNo)))) {
    let inv = null; try { inv = await getInvoice(S, no); } catch (e) {}
    if (!inv || inv.st === 'x' || inv.src === 'legacy' || inv.src === 'credit') continue;   // 이전 시스템 인보이스는 AR 이 기준 (AR 잔액에서 뺌)
    const ip = Object.assign({}, inv.pays || {}), k = 'CM:' + x.no; if (by[no]) ip[k] = by[no]; else delete ip[k];
    const ipaid = R2(Object.values(ip).reduce((a, v) => a + (Number(v) || 0), 0)), ibal = Math.max(0, R2((inv.total || 0) - ipaid));
    await S.DB.update('invoices', inv.id || inv.no, { pays: ip, paid: ipaid, bal: ibal, updatedAt: now }); docs.push(inv);
  }
  dropInvCache(monthsOf(docs));
  try { const St = await import('./store.js'); St.dropStoreCache(x.acct); } catch (e) {}   // 가게 창 · 인보이스 상세가 새 잔액으로
}
/** 이 가게 미결 인보이스를 골라 크레딧을 적용 — 오래된 것부터 남은 크레딧만큼 자동 채움, 금액은 고칠 수 있음 */
async function applyModal(x, done) {
  const left = crLeft(x); if (!(left > 0.005)) return toast(bt('남은 크레딧이 없습니다', 'No credit left'), 'bad');
  openModal('<h2>↩ ' + esc(x.no) + ' ' + bi('인보이스에 바로 적용', 'Apply to invoices') + '</h2><div class="load">' + bt('미결 인보이스 읽는 중…', 'Loading open invoices…') + '</div>');
  let open = [];
  try { const { storeInfo } = await import('./store.js'); const info = await storeInfo(x.acct, true); open = (info.invs || []).filter(v => v.bal > 0.005 && invNo(v.no) !== invNo(x.no)).map(v => ({ no: String(v.no), d: v.d, bal: R2(v.bal), ar: !v.app, amt: 0, on: false })).sort((a, b) => String(a.d).localeCompare(String(b.d)) || a.no.localeCompare(b.no)); } catch (e) {}
  const box = $('mbox'); if (!box) return;
  const tot = () => R2(open.reduce((a, v) => a + (v.on ? num(v.amt) : 0), 0));
  let seq = 0; const fill = () => { let r = left; open.filter(v => v.on).sort((a, b) => a.seq - b.seq).concat(open.filter(v => !v.on)).forEach(v => { if (!v.on) { v.amt = 0; return; } if (v.manual) { r = R2(r - num(v.amt)); return; } v.amt = Math.max(0, Math.min(v.bal, r)); r = R2(r - v.amt); }); };
  const paint = () => {
    const t = tot(), over = t > left + 0.005;
    box.innerHTML = '<h2>↩ ' + esc(x.no) + ' ' + bi('인보이스에 바로 적용', 'Apply to invoices') + '</h2><div class="muted">' + esc(x.store) + ' · ' + bt('남은 크레딧', 'Credit left') + ' <b style="color:#15803d">' + money(left) + '</b> — ' + bt('누른 순서대로 남은 크레딧을 채웁니다. 금액은 고칠 수 있습니다. 돈을 받지 않고 크레딧으로만 인보이스 잔액을 줄입니다.', 'Tap invoices — filled in the order tapped; amounts can be edited. Reduces invoice balances with the credit only (no money).') + '</div>' +
      (open.length ? '<div style="max-height:50vh;overflow:auto;margin-top:8px">' + open.map((v, i) => '<div class="pick inv' + (v.on ? ' on' : '') + '" data-apk="' + i + '"><div class="ck">✓</div><div class="pm"><b>' + esc(v.no) + (v.ar ? ' <span class="tag t-c">AR</span>' : ' <span class="tag t-b">' + bt('앱', 'App') + '</span>') + '</b><small>' + esc(md(v.d)) + ' · ' + bt('잔액', 'balance') + ' ' + money(v.bal) + '</small></div>' + (v.on ? '<input data-apa="' + i + '" value="' + num(v.amt).toFixed(2) + '" inputmode="decimal" style="width:96px;text-align:right">' : '<b>' + money(v.bal) + '</b>') + '</div>').join('') + '</div>'
        : '<div class="none">' + bt('이 가게에 잔액 있는 인보이스가 없습니다', 'No open invoices for this store') + '</div>') +
      '<div class="sumbox" style="margin-top:8px">' + bt('적용', 'Apply') + ' <b>' + money(t) + '</b> · ' + bt('적용 뒤 남는 크레딧', 'credit left after') + ' <b>' + money(R2(left - t)) + '</b>' + (over ? ' <b class="warn">' + bt('남은 크레딧보다 많습니다', 'more than the credit left') + '</b>' : '') + '</div>' +
      '<div class="btns"><button class="b-ghost" id="apX">' + bt('돌아가기', 'Back') + '</button><button class="b-blue" id="apGo"' + (t > 0.005 && !over ? '' : ' disabled') + '>↩ ' + bt('적용', 'Apply') + ' ' + money(t) + '</button></div>';
    box.querySelectorAll('[data-apk]').forEach(el => el.onclick = e => { if (e.target.tagName === 'INPUT') return; const v = open[+el.dataset.apk]; v.on = !v.on; v.seq = ++seq; v.manual = false; fill(); paint(); });
    box.querySelectorAll('[data-apa]').forEach(el => el.onchange = () => { const v = open[+el.dataset.apa]; v.amt = Math.max(0, Math.min(v.bal, R2(num(el.value)))); v.manual = true; fill(); paint(); });
    $('apX').onclick = closeModal;
    $('apGo').onclick = async () => {
      const sel = open.filter(v => v.on && num(v.amt) > 0.005); if (!sel.length) return;
      const t2 = tot(); if (t2 > left + 0.005) return toast(bt('남은 크레딧보다 많습니다', 'More than the credit left'), 'bad');
      busy(true);
      try {
        const d = today(), at = new Date().toISOString(), by = S.user.email;
        await saveApply(x, (x.apply || []).concat(sel.map(v => ({ no: v.no, acct: x.acct, amt: R2(num(v.amt)), d, by, at, ar: v.ar }))), sel.map(v => v.no));
        closeModal(); toast('↩ ' + x.no + ' → ' + sel.length + bt('장 적용', ' invoice(s)') + ' ' + money(t2), 'good'); if (done) done();
      } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
      busy(false);
    };
  };
  paint();
}
function creditHtml(x) {
  const co = company(S);
  return '<h1>Credit Memo · 크레딧 메모</h1><div class="meta"><b>' + esc(x.no) + '</b> &nbsp;|&nbsp; ' + esc(x.d) + ' &nbsp;|&nbsp; ' + esc(co.name) + '</div>' +
    '<table class="box"><tr><td>Store</td><td><b>' + esc(x.store) + '</b> (' + esc(x.acct || '') + ')</td></tr><tr><td>Salesman</td><td>' + esc(x.sm || '') + '</td></tr><tr><td>Reason</td><td>' + esc(x.why || '') + (x.note ? ' — ' + esc(x.note) : '') + '</td></tr>' + (x.st === 'x' ? '<tr><td>VOID</td><td>' + esc(x.voidReason || '') + '</td></tr>' : '') + '</table>' +
    '<table><tr><th>Code</th><th>Description</th><th class="r">Qty</th><th class="r">List</th><th class="r">Disc</th><th class="r">Unit</th><th class="r">Credit</th></tr>' + (x.lines || []).map(l => '<tr><td>' + esc(l.c) + '</td><td>' + esc(l.d || '') + '</td><td class="r">' + Math.abs(l.q) + '</td><td class="r">' + money(l.lp != null ? l.lp : l.p) + '</td><td class="r">' + (num(l.dc) ? num(l.dc) + '%' : '') + '</td><td class="r">' + money(l.p) + '</td><td class="r">−' + money(R2(Math.abs(l.q) * l.p)) + '</td></tr>').join('') +
    '<tr class="fin"><td colspan="6" class="r"><b>TOTAL CREDIT</b></td><td class="r"><b>' + money(x.total) + '</b></td></tr></table>' +
    '<div style="font-size:11px;color:#666;margin-top:10px">This credit is applied to the store balance. 이 크레딧은 가게 잔액에 반영됩니다.</div><div class="sig"><div>Store</div><div>Salesman</div></div>';
}

/* ---------- 📥 세일즈맨 크레딧 요청 (v0.8.187) — 주문처럼 눌러 담아 보낼 주문과 같이 보낸 것 (orders.kind 'credit', 금액 마이너스)
 *   사무실이 열어 확인 → ↩ 크레딧 확정 = CM 번호 발행(invoices · 이 때 가게 잔액에서 빠짐 · 사무실 확인됨) + 요청은 완료(cmNo) · ✕ 취소는 사유와 함께
 *   가격 = 주문 줄 가격 × (1 − 가게 할인 · 할인 백 %) — 주문 화면 합계와 같음 ---------- */
/*   🏷 타사 제품(OB) 줄: 옛 요청에 소매가로 담긴 줄도 판매가로 바꾸고 할인 백(없으면 가게 기본)을 뺌 (v0.8.198) */
const reqLines = (o, lines) => (lines || []).filter(l => l.q > 0).map(l => { l = obFix(Object.assign({}, l)); const t = l.t || 'A', dc = t === OB_T ? obDisc(o, (invTypes(S)[0] || {}).c) : Number((o.disc || {})[t]) || 0, lp = l.lp != null ? l.lp : l.p; return { c: l.c, d: l.d || '', q: l.q, lp, p: R2(l.p * (1 - dc / 100)), dc, t }; });
export async function reviewRequest(o, lines) {
  const L = reqLines(o, lines), sub = R2(L.reduce((a, l) => a + l.q * l.p, 0)), q = L.reduce((a, l) => a + l.q, 0), can2 = staffOk() && o.st === 'sent' && !o.cmNo;
  const stT = o.cmNo ? '<span class="tag t-k">✅ ' + esc(o.cmNo) + '</span>' : o.st === 'x' ? '<span class="tag t-x">✕ ' + bt('취소', 'Cancelled') + '</span>' : o.st === 'draft' ? '<span class="tag">' + bt('세일즈맨 작성 중', 'Draft') + '</span>' : '<span class="tag" style="background:#fef3c7;color:#92400e">⏳ ' + bt('확인 대기', 'To review') + '</span>';
  $('page').innerHTML = '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><div><h2 style="margin:0">↩ ' + bi('크레딧 요청', 'Credit request') + ' ' + esc(o.no) + ' ' + stT + '</h2><div style="font-size:17px;font-weight:800;margin-top:6px">' + esc(o.store) + '</div><div class="muted">' + esc(o.acct || '') + ' · ' + esc(o.sm || '') + ' · ' + esc(o.d || '') + '</div></div><button class="b-ghost b-sm" id="crrBack">‹ ' + bt('목록', 'List') + '</button></div>' +
    '<div class="hero" style="font-size:26px;color:#b45309">−' + money(sub) + '</div><div class="heroSub">' + bt('사유', 'Reason') + ': <b>' + esc(o.why || '—') + '</b>' + (o.memo ? ' — ' + esc(o.memo) : '') + (o.dback != null ? ' · 🏷 ' + bt('할인 백', 'Discount back') + ' <b>' + o.dback + '%</b>' : '') + ' · ' + L.length + bt('줄 · ', ' lines · ') + q + bt('개', ' pcs') + '</div>' +
    (o.st === 'x' ? '<div class="alert a-red">✕ ' + esc(o.cancelWhy || '') + '</div>' : '') +
    (can2 ? '<div class="btns" style="margin-top:10px;flex-wrap:wrap"><button class="b-ghost" id="crrEd">✏️ ' + bt('수정', 'Edit') + '</button><button class="b-ghost" id="crrDel" style="color:#991b1b">🗑 ' + bt('삭제', 'Delete') + '</button><button class="b-ghost" id="crrX">✕ ' + bt('취소', 'Cancel') + '</button><button class="b-blue" id="crrOk" style="background:#b45309;flex:1 1 auto">↩ ' + bi('크레딧 확정 — CM 발행', 'Confirm credit — issue CM') + '</button></div><div class="hint">' + bt('확정하면 CM 번호가 생기고 가게 잔액에서 빠집니다. 세일즈맨에게 알림이 갑니다.', 'Confirming issues the CM number and takes it off the store balance. The salesman is notified.') + ' ' + bt('✏️ 수정: 줄 · 수량 · 할인 백 · 사유 고치기 · 🗑 삭제: 중복 요청 등 기록 없이 지우기 · ✕ 취소: 사유를 남기고 취소', '✏️ Edit lines · qty · discount back · reason · 🗑 Delete a duplicate without a trace · ✕ Cancel with a reason') + '</div>' : '') +
    (o.cmNo ? '<div class="btns" style="justify-content:flex-start"><button class="b-ghost b-sm" id="crrCm">📄 ' + esc(o.cmNo) + '</button></div>' : '') + '</div>' +
    '<div class="card"><h2>' + bt('아이템', 'Items') + ' ' + L.length + '</h2><table><tr><th>' + bt('코드', 'Code') + '</th><th class="r">' + bt('수량', 'Qty') + '</th><th class="r">' + bt('단가', 'Unit') + '</th><th class="r">' + bt('크레딧', 'Credit') + '</th></tr>' +
    L.map(l => '<tr><td><b>' + esc(l.c) + '</b><div class="muted" style="font-size:11.5px">' + esc(l.d) + (l.dc ? ' · ' + bt('목록가', 'list') + ' ' + money(l.lp) + ' − ' + l.dc + '%' : '') + '</div></td><td class="r">' + l.q + '</td><td class="r">' + money(l.p) + '</td><td class="r">−' + money(R2(l.q * l.p)) + '</td></tr>').join('') +
    '<tr><td colspan="3" class="r"><b>' + bt('합계', 'Total') + '</b></td><td class="r"><b>−' + money(sub) + '</b></td></tr></table></div>';
  $('crrBack').onclick = () => history.length > 1 ? history.back() : Router.go('order');
  if ($('crrCm')) $('crrCm').onclick = () => Router.go('credit', encodeURIComponent(o.cmNo));
  /* ✏️ 수정 — 주문 편집 화면 그대로 (줄 · 수량 · 🏷 할인 백 · 사유) · 저장하면 다시 이 확인 화면 (v0.8.227 관리자: "디스카운트 백이 안 잡힌 경우 · 중복 크레딧 — 수정 · 삭제") */
  if ($('crrEd')) $('crrEd').onclick = async () => { const OR = await import('./orders.js'); OR.openEditor(o, null, lines); };
  /* 🗑 삭제 — 중복 요청처럼 남길 필요 없는 것 (CM 발행 전만 · 세일즈맨에게 알림) */
  if ($('crrDel')) $('crrDel').onclick = async () => {
    if (!(await confirmBox('🗑 ' + o.store + ' ↩ −' + money(sub) + ' (' + (o.why || '') + ')\n' + bt('이 크레딧 요청을 지울까요? 되돌릴 수 없습니다.', 'Delete this credit request? This cannot be undone.'), bt('삭제', 'Delete')))) return;
    busy(true); try { await S.DB.batch([{ op: 'del', col: 'orderLines', id: o.id }, { op: 'del', col: 'orders', id: o.id }]);
      try { const N = await import('./notify.js'); await N.queue({ kind: 'creditReq', toSm: o.sm, pushOnly: true, subject: '[THE ONE] 🗑 크레딧 요청 삭제 — ' + o.store, text: '🗑 ' + o.store + ' ↩ ' + money(sub) + ' — ' + bt('사무실에서 삭제 (중복 등)', 'deleted by the office (duplicate etc.)') }); } catch (e) {}
      toast('🗑 ' + bt('삭제했습니다', 'Deleted'), 'good'); Router.go('order'); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
  if ($('crrX')) $('crrX').onclick = async () => {
    const why = prompt(bt('취소 사유', 'Reason to cancel')); if (why == null) return;
    busy(true); try { const now = new Date().toISOString(); await S.DB.update('orders', o.id, { st: 'x', cancelAt: now, cancelBy: S.user.email, cancelWhy: why || bt('사무실 취소', 'Cancelled by office'), updatedAt: now });
      try { const N = await import('./notify.js'); await N.queue({ kind: 'creditReq', toSm: o.sm, pushOnly: true, subject: '[THE ONE] ✕ 크레딧 요청 취소 — ' + o.store, text: '✕ ' + o.store + ' ↩ ' + money(sub) + ' — ' + (why || '') }); } catch (e) {}
      toast('✕ ' + bt('취소했습니다', 'Cancelled'), 'good'); Router.go('order'); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
  if ($('crrOk')) $('crrOk').onclick = async () => {
    if (!(await confirmBox(o.store + ' · ' + (o.why || '') + '\n↩ −' + money(sub) + ' — ' + bt('CM 을 발행할까요?', 'Issue the CM?'), '↩ ' + bt('확정', 'Confirm')))) return;
    busy(true);
    try {
      const T = creditType(), no = await nextInvoiceNo(S, T), d = today(), now = new Date().toISOString(), C = catalog(), acc = S.accounts && S.accounts.byCode ? S.accounts.byCode[o.acct] : null;
      const doc = { no, id: no, t: T.c, kind: 'credit', src: 'credit', d, ym: ym(d), acct: o.acct, store: o.store, sm: o.smFor || o.sm, why: o.why || '', note: (o.memo || '').trim(),
        lines: L.map(l => { const it = C && C.byCode[l.c]; return { c: l.c, d: l.d, q: -l.q, p: l.p, lp: l.lp, dc: l.dc, src: 'order', g: it ? productLine(it) : '', ty: l.t, recent: null }; }),
        qty: -q, sub: -sub, list: -R2(L.reduce((a, l) => a + l.q * l.lp, 0)), disc: 0, total: -sub, bal: -sub, discMap: o.disc || {}, dback: o.dback != null ? o.dback : null, flags: [], terms: (acc && acc.terms) || '', st: 'open',
        reviewed: true, reviewedBy: S.user.email, reviewedAt: now, createdBy: o.createdBy || S.user.email, createdAt: now, issuedBy: S.user.email, fromOrder: o.id };
      await S.DB.batch([{ op: 'set', col: 'invoices', id: no, data: doc }, { op: 'update', col: 'orders', id: o.id, data: { st: 'done', cmNo: no, invs: [no], doneAt: now, doneBy: S.user.email, updatedAt: now } }]);
      dropInvCache(monthsOf([doc]));
      try { const N = await import('./notify.js'); await N.queue({ kind: 'creditReq', toSm: o.sm, pushOnly: true, subject: '[THE ONE] ↩ 크레딧 발행 ' + no + ' — ' + o.store, text: '↩ ' + no + ' · ' + o.store + ' −' + money(sub) + ' (' + (o.why || '') + ')' }); } catch (e) {}
      toast('↩ ' + no + ' — ' + bt('발행', 'issued') + ' −' + money(sub), 'good');
      Router.go('credit', encodeURIComponent(no));
    } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}
/** 크레딧 목록 위 — 세일즈맨: 내가 보낸 요청 · 사무실: 확인 대기 요청 */
async function reqListHtml() {
  let R = [];
  try { R = isSales() ? (await S.DB.list('orders', { where: [['sm', '==', mySm()]] })).filter(o => o.kind === 'credit' && (o.st === 'draft' || o.st === 'sent')) : (await S.DB.list('orders', { where: [['st', '==', 'sent']] })).filter(o => o.kind === 'credit'); } catch (e) { return ''; }
  if (!R.length) return '';
  R = sortBy(R, o => o.d + (o.createdAt || ''), true);
  return '<div class="card" style="border:2px solid #fb923c"><h2>' + (isSales() ? '📤 ' + bt('보낸 · 보낼 크레딧 요청', 'Your credit requests') : '📥 ' + bt('세일즈맨 크레딧 요청 — 확인 대기', 'Credit requests to review')) + ' ' + R.length + '</h2>' +
    R.map(o => '<div class="pr tap" data-crq2="' + esc(o.id) + '"><div class="mk">↩</div><div class="ct"><b>' + esc(o.store) + ' <span class="tag crtag">' + esc(o.why || '') + '</span>' + (o.st === 'draft' ? ' <span class="tag">' + bt('보내기 전', 'not sent') + '</span>' : '') + '</b><small>' + esc(o.d || '') + ' · ' + esc(o.sm || '') + ' · ' + (o.n || 0) + bt('줄', ' lines') + '</small></div><div class="pa"><b>' + money(o.amt) + '</b></div></div>').join('') + '</div>';
}
