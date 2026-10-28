/* ============================================================
 *  ↩ 크레딧 · 리턴 (크레딧 메모 CM) — 세일즈맨이 가게에서 대미지 · 오래된 물건 교환 · 잘못 보낸 물건 · 가격 조정으로 크레딧을 줄 때
 *    · 세일즈맨이 바로 확정 → invoices 에 CM-###### (금액 마이너스) 가 생겨 거래처 잔액 · 스테이트먼트 · 커미션(CM 칸)에 바로 반영
 *    · 가격: 가게 기본 할인을 적용한 목록가가 기본. 아이템을 넣으면 그 가게의 가장 최근 인보이스에서 같은 아이템 가격을 찾아 비교해 보여 주고, 한 번에 그 가격으로 바꿀 수 있음
 *    · 사무실(인보이스 · 수금 담당)은 들어온 크레딧을 확인(✅) · 문제면 VOID. 가격이 최근 인보이스와 다르거나 할인이 가게 기본과 다르면 ⚠️ 표시 + 알림
 *    · 리턴 물건의 창고 수령 확인은 지금은 하지 않음 (랜덤으로 들어와 일일이 맞추기 어려움)
 * ============================================================ */
import { $, esc, money, R2, num, today, ym, md, toast, busy, openModal, closeModal, confirmBox, Router, sortBy, bi, bt, printOpen, debounce } from './ui.js';
import { loadCatalog, catalog, exactItem, searchItems, thumb } from './catalog.js';
import { invTypes, typeOfItem, acctDisc, nextInvoiceNo, company, dropInvCache } from './invoicing.js';
import { searchAccounts } from './accounts.js';
import { mySm } from './access.js';
import { can } from './main.js';

let S = null;
const WHY = [['대미지', 'Damaged'], ['오래된 물건 교환', 'Old stock exchange'], ['잘못 보낸 물건', 'Wrong item shipped'], ['가격 조정', 'Price adjustment'], ['기타', 'Other']];
const isSales = () => S.role === 'salesman';
const staffOk = () => S.role === 'admin' || S.role === 'owner' || (S.role === 'manager' && (can('invoice') || can('verify')));
export function register(state) { S = state; Router.on('credit', page); }
/** CM 번호용 인보이스 종류 — 설정에 CM 칸 종류가 있으면 그것, 없으면 CM */
export function creditType() { return invTypes(S).find(t => t.comm === 'CM') || { c: 'CM', n: '크레딧 메모 Credit Memo', comm: 'CM', start: 1 }; }
const CR = { acct: '', store: '', sm: '', acc: null, disc: {}, why: '', note: '', lines: [], rec: [] };

async function page(arg) {
  if (arg === 'new') return form();
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
  const wait = rows.filter(x => x.st !== 'x' && !x.reviewed), done = rows.filter(x => x.st !== 'x' && x.reviewed), voided = rows.filter(x => x.st === 'x');
  const row = x => '<div class="pr tap' + (x.st === 'x' ? '' : x.reviewed ? ' v' : '') + '" data-cr="' + esc(x.no) + '"><div class="mk">' + (x.st === 'x' ? '✕' : x.reviewed ? '✓' : '·') + '</div><div class="ct"><b>' + esc(x.store) + ' <span class="tag t-k">' + esc(x.no) + '</span>' + ((x.flags || []).length ? ' <span class="tag" style="background:#fef3c7;color:#92400e">⚠️ ' + x.flags.length + '</span>' : '') + '</b><small>' + esc(x.d) + ' · ' + esc(x.sm || '') + ' · ' + esc(x.why || '') + ' · ' + (x.qty ? Math.abs(x.qty) + bt('개', ' pcs') : '') + '</small></div><div class="pa"><b>' + money(x.total) + '</b><small>' + (x.st === 'x' ? 'VOID' : x.reviewed ? bt('사무실 확인', 'Reviewed') : bt('확인 대기', 'To review')) + '</small></div></div>';
  $('page').innerHTML = '<div class="card"><h2>↩ ' + bi('크레딧 · 리턴', 'Credits · Returns') + '</h2><div class="muted">' + (isSales() ? bt('가게에 준 크레딧 기록입니다. 확정하면 CM 번호가 생기고 가게 잔액에서 바로 빠집니다. 사무실이 내용을 확인합니다.', 'Credits you gave to stores. Once confirmed a CM number is issued and the store balance drops right away. The office reviews it.') : bt('세일즈맨이 확정한 크레딧 메모입니다. 내용 · 가격을 보고 ✅ 확인하거나, 문제면 VOID 하세요.', 'Credit memos confirmed by salesmen. Review and ✅ confirm, or VOID if wrong.')) + '</div>' +
    (isSales() ? '<div class="btns" style="justify-content:flex-start"><button class="b-blue" id="crNew">↩ ' + bi('크레딧 주기', 'Give credit') + '</button></div>' : '') +
    '<div class="kpi" style="grid-template-columns:repeat(3,1fr)"><div><b>' + wait.length + '</b><span>' + bt('확인 대기', 'To review') + '</span></div><div><b>' + money(-sumOf(wait.concat(done))) + '</b><span>' + bt('크레딧 합계', 'Credits total') + '</span></div><div><b>' + rows.length + '</b><span>' + bt('전체', 'All') + '</span></div></div></div>' +
    (wait.length ? '<div class="card"><h2>' + bt('확인 대기', 'To review') + ' ' + wait.length + '</h2>' + wait.map(row).join('') + '</div>' : '') +
    (done.length ? '<div class="card"><h2>' + bt('확인 완료', 'Reviewed') + ' ' + done.length + '</h2>' + done.map(row).join('') + '</div>' : '') +
    (voided.length ? '<div class="card"><h2>VOID ' + voided.length + '</h2>' + voided.map(row).join('') + '</div>' : '') +
    (!rows.length ? '<div class="card"><div class="none">' + bt('크레딧 기록이 없습니다', 'No credits yet') + '</div></div>' : '');
  if ($('crNew')) $('crNew').onclick = () => Router.go('credit', 'new');
  document.querySelectorAll('[data-cr]').forEach(el => el.onclick = () => Router.go('credit', encodeURIComponent(el.dataset.cr)));
}
const sumOf = L => R2(L.reduce((a, x) => a + (Number(x.total) || 0), 0));

/* ---------- 입력 ---------- */
async function form() {
  if (!isSales() && !staffOk()) { $('page').innerHTML = '<div class="card"><div class="none">' + bt('세일즈맨 · 담당자만', 'Salesmen and staff only') + '</div></div>'; return; }
  try { await loadCatalog(S); } catch (e) {}
  Object.assign(CR, { acct: '', store: '', sm: isSales() ? mySm() : '', acc: null, disc: {}, why: '', note: '', lines: [], rec: [] });
  $('page').innerHTML = '<div class="card"><h2>↩ ' + bi('크레딧 주기', 'Give credit') + '</h2><div class="muted">' + bt('가게를 고르고 사유를 누른 뒤, 돌려줄 아이템과 수량을 담으세요. 가격은 가게 기본 할인을 적용한 값이 들어가고, 그 가게의 가장 최근 인보이스 가격과 다르면 비교해 보여 줍니다. 숫자는 그대로 적으면 앱이 크레딧(마이너스)으로 처리합니다.', 'Pick the store and a reason, then add the items and quantities. Prices use the store default discount; if the most recent invoice priced it differently you will see both. Type plain numbers — the app records it as a credit.') + '</div>' +
    '<div class="fg" style="margin-top:8px"><label>' + bt('가게', 'Store') + '</label><input id="crStore" placeholder="' + esc(bt('가게 이름 · 계정코드', 'Store name · account code')) + '" autocomplete="off"><div class="hits" id="crHits" style="display:none"></div><div id="crAcc" class="muted" style="font-size:12px"></div></div>' +
    '<div class="fg"><label>' + bt('사유', 'Reason') + '</label><div class="chips" style="margin:0" id="crWhy">' + WHY.map(w => '<button data-crw="' + esc(w[0]) + '">' + bi(w[0], w[1]) + '</button>').join('') + '</div><input id="crNote" placeholder="' + esc(bt('메모 (선택) — 어떤 물건 · 왜', 'Note (optional)')) + '" style="margin-top:6px"></div></div>' +
    '<div class="card"><h2>' + bt('돌려줄 아이템', 'Items to credit') + '</h2><input id="crItem" placeholder="' + esc(bt('코드 · 바코드 · 이름', 'Code · barcode · name')) + '" autocomplete="off" autocapitalize="characters"><div class="hits" id="crIHits" style="display:none"></div><div id="crLines"></div><div id="crTot"></div></div>' +
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
  paintLines();
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
  CR.lines.forEach(l => withRecent(l)); paintLines();
}
/** 그 가게의 가장 최근 인보이스에서 같은 아이템 가격 — 인보이스 단가 × (1 − 인보이스 할인) */
function withRecent(l) {
  l.recent = null;
  for (const inv of CR.rec) { const ln = (inv.lines || []).find(x => x.c === l.c); if (ln) { const dc = Number(inv.disc) || 0; l.recent = { no: inv.no, d: inv.d, p: R2(num(ln.p) * (1 - dc / 100)), disc: dc, lp: num(ln.p) }; break; } }
}
function addLine(it) {
  if (!it) return;
  const cur = CR.lines.find(l => l.c === it.c); if (cur) { cur.q += 1; paintLines(); return; }
  const t = typeOfItem(S, it), dc = Number(CR.disc[t]) || 0, lp = R2(it.p), p = R2(lp * (1 - dc / 100));
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
  box.innerHTML = CR.lines.length ? CR.lines.map(l => '<div class="crline" data-crl="' + esc(l.c) + '"><div class="ct"><b>' + esc(l.c) + ' <span class="tag t-g">' + esc(l.t) + '</span></b><small>' + esc(l.d) + '</small><small>' + bt('목록가', 'List') + ' ' + money(l.lp) + (l.dc ? ' − ' + l.dc + '% → ' + money(R2(l.lp * (1 - l.dc / 100))) : '') + (l.src === 'recent' ? ' · <b style="color:#1e40af">' + bt('최근 인보이스 가격 적용', 'recent invoice price') + '</b>' : l.src === 'manual' ? ' · <b style="color:#b45309">' + bt('직접 바꾼 가격', 'manual price') + '</b>' : '') + '</small>' +
    (l.recent ? '<small class="' + (diffP(l) ? 'warn' : 'muted') + '">🕘 ' + bt('최근', 'Recent') + ' ' + esc(l.recent.d) + ' ' + esc(l.recent.no) + ': <b>' + money(l.recent.p) + '</b>' + (l.recent.disc ? ' (' + bt('할인', 'disc') + ' ' + l.recent.disc + '%)' : '') + (diffP(l) ? ' ≠ ' + money(l.p) + ' <button class="b-ghost b-sm" data-cruse="' + esc(l.c) + '">' + bt('이 가격으로', 'Use this') + '</button>' : ' ✓') + '</small>' : CR.acct ? '<small class="muted">🕘 ' + bt('최근 인보이스에 이 아이템 없음', 'not on recent invoices') + '</small>' : '') + '</div>' +
    '<div class="qty"><button data-crd="' + esc(l.c) + '|-1">−</button><input type="number" inputmode="numeric" min="1" data-crq="' + esc(l.c) + '" value="' + l.q + '"><button data-crd="' + esc(l.c) + '|1">＋</button></div>' +
    '<div class="pa"><input type="number" step="0.01" inputmode="decimal" data-crp="' + esc(l.c) + '" value="' + l.p + '" style="width:84px;text-align:right;font-weight:800"><small>' + bt('크레딧', 'credit') + ' −' + money(R2(l.q * l.p)) + '</small></div><button class="b-ghost b-sm" data-crx="' + esc(l.c) + '">✕</button></div>').join('') : '<div class="none">' + bt('아이템 코드를 치거나 바코드를 찍으세요', 'Type a code or scan a barcode') + '</div>';
  box.querySelectorAll('[data-crq]').forEach(i => i.onchange = () => { const l = CR.lines.find(x => x.c === i.dataset.crq); l.q = Math.max(1, Math.floor(num(i.value) || 1)); paintLines(); });
  box.querySelectorAll('[data-crd]').forEach(b => b.onclick = () => { const [c, d] = b.dataset.crd.split('|'); const l = CR.lines.find(x => x.c === c); l.q = Math.max(1, l.q + Number(d)); paintLines(); });
  box.querySelectorAll('[data-crp]').forEach(i => i.onchange = () => { const l = CR.lines.find(x => x.c === i.dataset.crp); const v = R2(num(i.value)); if (v > 0) { l.p = v; l.src = Math.abs(v - R2(l.lp * (1 - l.dc / 100))) < 0.009 ? 'store' : (l.recent && Math.abs(v - l.recent.p) < 0.009) ? 'recent' : 'manual'; } paintLines(); });
  box.querySelectorAll('[data-cruse]').forEach(b => b.onclick = () => { const l = CR.lines.find(x => x.c === b.dataset.cruse); l.p = l.recent.p; l.src = 'recent'; paintLines(); });
  box.querySelectorAll('[data-crx]').forEach(b => b.onclick = () => { CR.lines = CR.lines.filter(x => x.c !== b.dataset.crx); paintLines(); });
  PAINTING = false;
  paintTot();
}
const totals = () => { const q = CR.lines.reduce((a, l) => a + l.q, 0), sub = R2(CR.lines.reduce((a, l) => a + l.q * l.p, 0)), list = R2(CR.lines.reduce((a, l) => a + l.q * l.lp, 0)); return { q, sub, list }; };
const flagsOf = () => { const F = []; const nd = CR.lines.filter(diffP).length; if (nd) F.push('가격이 최근 인보이스와 다름 ' + nd + '줄'); const nm = CR.lines.filter(l => l.src === 'manual').length; if (nm) F.push('가격을 직접 바꿈 ' + nm + '줄'); return F; };
function paintTot() {
  const t = totals(), F = flagsOf(), ok = CR.acct && CR.why && CR.lines.length && t.sub > 0;
  const el = $('crTot'); if (el) el.innerHTML = CR.lines.length ? '<div class="sumbox" style="margin-top:8px">' + bt('수량', 'Qty') + ' <b>' + t.q + '</b> · ' + bt('목록가 합', 'List total') + ' ' + money(t.list) + ' · <b style="font-size:17px;color:#b45309">' + bt('크레딧', 'Credit') + ' −' + money(t.sub) + '</b>' + (F.length ? '<div class="warn" style="margin-top:4px">⚠️ ' + F.map(esc).join(' · ') + ' — ' + bt('사무실에 표시됩니다', 'shown to the office') + '</div>' : '') + '</div>' : '';
  const g = $('crGo'); if (g) { g.disabled = !ok; g.style.background = ok ? '#b45309' : '#e2e8f0'; g.style.color = ok ? '#fff' : '#94a3b8'; }
}
async function confirm() {
  const t = totals(); if (!CR.acct) return toast(bt('가게를 고르세요', 'Pick a store'), 'bad'); if (!CR.why) return toast(bt('사유를 고르세요', 'Pick a reason'), 'bad'); if (!CR.lines.length || !(t.sub > 0)) return toast(bt('아이템을 담으세요', 'Add items'), 'bad');
  if (!CR.sm) return toast(bt('세일즈맨이 없습니다', 'No salesman'), 'bad');
  const F = flagsOf();
  if (!(await confirmBox(bt('크레딧을 확정할까요?', 'Confirm this credit?') + '\n' + CR.store + ' · ' + CR.why + '\n' + CR.lines.length + bt('개 아이템 · ', ' items · ') + t.q + bt('개 · 크레딧 −', ' pcs · credit −') + money(t.sub) + (F.length ? '\n⚠️ ' + F.join(' · ') : ''), '↩ ' + bt('확정', 'Confirm')))) return;
  busy(true);
  try {
    const T = creditType(), no = await nextInvoiceNo(S, T), d = today(), now = new Date().toISOString(), C = catalog();
    const doc = { no, id: no, t: T.c, kind: 'credit', src: 'credit', d, ym: ym(d), acct: CR.acct, store: CR.store, sm: CR.sm, why: CR.why, note: CR.note.trim(),
      lines: CR.lines.map(l => { const it = C && C.byCode[l.c]; return { c: l.c, d: l.d, q: -l.q, p: l.p, lp: l.lp, dc: l.dc, src: l.src, g: it ? (it.l1 || it.g || '') : '', ty: l.t, recent: l.recent ? { no: l.recent.no, d: l.recent.d, p: l.recent.p, disc: l.recent.disc } : null }; }),
      qty: -t.q, sub: -t.sub, list: -t.list, disc: 0, total: -t.sub, bal: -t.sub, discMap: CR.disc, flags: F, terms: (CR.acc && CR.acc.terms) || '', st: 'open', reviewed: false, createdBy: S.user.email, createdAt: now };
    await S.DB.set('invoices', no, doc);
    dropInvCache();
    try { const N = await import('./notify.js'); await N.queue({ kind: 'credit', toStaff: true, chat: true, subject: '[THE ONE] ↩ 크레딧 ' + (F.length ? '⚠️ ' : '') + '— ' + CR.store + ' ' + money(-t.sub), text: '↩ 크레딧 ' + no + ' · ' + CR.sm + ' · ' + CR.store + ' (' + CR.acct + ')\n' + CR.why + (CR.note ? ' — ' + CR.note.trim() : '') + '\n' + CR.lines.map(l => l.c + ' ×' + l.q + ' @' + money(l.p)).join(', ') + '\n크레딧 −' + money(t.sub) + (F.length ? '\n⚠️ ' + F.join(' · ') : ''), url: N.appUrl('credit/' + encodeURIComponent(no)) }); } catch (e) {}
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
    '<div class="hero" style="font-size:26px;color:#b45309">' + money(x.total) + '</div><div class="heroSub">' + bt('사유', 'Reason') + ': <b>' + esc(x.why || '') + '</b>' + (x.note ? ' — ' + esc(x.note) : '') + '</div>' +
    ((x.flags || []).length ? '<div class="alert a-amb">⚠️ ' + x.flags.map(esc).join(' · ') + '</div>' : '') +
    (x.st === 'x' ? '<div class="alert a-red">✕ VOID — ' + esc(x.voidReason || '') + ' <span class="muted">' + esc(String(x.voidBy || '').split('@')[0]) + ' ' + esc(String(x.voidAt || '').substring(0, 10)) + '</span></div>' : '') +
    (x.reviewed ? '<div class="alert a-grn">✅ ' + bt('사무실 확인', 'Reviewed') + ' — ' + esc(String(x.reviewedBy || '').split('@')[0]) + ' ' + esc(String(x.reviewedAt || '').substring(0, 16).replace('T', ' ')) + '</div>' : '') +
    '<div class="btns" style="margin-top:8px"><button class="b-ghost b-sm" id="crPrint">🖨 ' + bt('크레딧 메모 인쇄', 'Print credit memo') + '</button>' + (staffOk() && x.st !== 'x' ? (!x.reviewed ? '<button class="b-green b-sm" id="crOk">✅ ' + bt('확인', 'Confirm') + '</button>' : '') + '<button class="b-ghost b-sm" id="crVoid" style="color:#991b1b">🚫 VOID</button>' : '') + '</div></div>' +
    '<div class="card"><h2>' + bt('아이템', 'Items') + ' ' + (x.lines || []).length + '</h2><table><tr><th>' + bt('코드', 'Code') + '</th><th class="r">' + bt('수량', 'Qty') + '</th><th class="r">' + bt('단가', 'Unit') + '</th><th class="r">' + bt('크레딧', 'Credit') + '</th></tr>' + (x.lines || []).map(l => '<tr><td><b>' + esc(l.c) + '</b><div class="muted" style="font-size:11.5px">' + esc(l.d || '') + (l.dc ? ' · ' + bt('가게 할인', 'store disc') + ' ' + l.dc + '%' : '') + (l.src === 'recent' ? ' · ' + bt('최근 인보이스 가격', 'recent invoice price') : l.src === 'manual' ? ' · <b class="warn">' + bt('직접 바꾼 가격', 'manual price') + '</b>' : '') + (l.recent ? '<br>🕘 ' + esc(l.recent.d) + ' ' + esc(l.recent.no) + ' ' + money(l.recent.p) + (Math.abs(l.recent.p - l.p) > 0.009 ? ' <b class="warn">≠</b>' : ' ✓') : '') + '</div></td><td class="r">' + Math.abs(l.q) + '</td><td class="r">' + money(l.p) + '</td><td class="r"><b>−' + money(R2(Math.abs(l.q) * l.p)) + '</b></td></tr>').join('') + '</table></div>';
  $('crBack').onclick = () => Router.go('credit');
  $('crPrint').onclick = () => printOpen(creditHtml(x));
  if ($('crOk')) $('crOk').onclick = async () => { busy(true); try { await S.DB.update('invoices', x.no, { reviewed: true, reviewedBy: S.user.email, reviewedAt: new Date().toISOString() }); toast('✅ ' + x.no); detail(no); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); } busy(false); };
  if ($('crVoid')) $('crVoid').onclick = () => {
    openModal('<h2 style="color:#991b1b">🚫 ' + esc(x.no) + ' VOID</h2><div class="muted">' + bt('크레딧을 무효로 합니다. 가게 잔액에서 다시 더해지고 세일즈맨에게 사유가 전달됩니다.', 'Voids the credit: the store balance goes back up and the salesman is told why.') + '</div><div class="fg"><label>' + bt('사유 (필수)', 'Reason (required)') + '</label><input id="cvWhy"></div><div class="btns"><button class="b-ghost" id="cvX">' + bt('돌아가기', 'Back') + '</button><button class="b-red" id="cvGo">🚫 VOID</button></div>');
    $('cvX').onclick = closeModal;
    $('cvGo').onclick = async () => { const why = $('cvWhy').value.trim(); if (!why) return toast(bt('사유를 적으세요', 'Type the reason'), 'bad'); busy(true);
      try { const now = new Date().toISOString(); await S.DB.update('invoices', x.no, { st: 'x', bal: 0, voidAt: now, voidBy: S.user.email, voidReason: why }); dropInvCache();
        try { const N = await import('./notify.js'); await N.queue({ kind: 'creditVoid', toSm: x.sm, chat: true, subject: '[THE ONE] 🚫 크레딧 VOID — ' + x.store, text: '🚫 크레딧 ' + x.no + ' VOID → ' + x.sm + ' · ' + x.store + ' ' + money(x.total) + '\n사유: ' + why, url: N.appUrl('credit/' + encodeURIComponent(x.no)) }); } catch (e) {}
        closeModal(); toast('🚫 VOID ' + x.no); detail(no); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); } busy(false); };
  };
}
function creditHtml(x) {
  const co = company(S);
  return '<h1>Credit Memo · 크레딧 메모</h1><div class="meta"><b>' + esc(x.no) + '</b> &nbsp;|&nbsp; ' + esc(x.d) + ' &nbsp;|&nbsp; ' + esc(co.name) + '</div>' +
    '<table class="box"><tr><td>Store</td><td><b>' + esc(x.store) + '</b> (' + esc(x.acct || '') + ')</td></tr><tr><td>Salesman</td><td>' + esc(x.sm || '') + '</td></tr><tr><td>Reason</td><td>' + esc(x.why || '') + (x.note ? ' — ' + esc(x.note) : '') + '</td></tr>' + (x.st === 'x' ? '<tr><td>VOID</td><td>' + esc(x.voidReason || '') + '</td></tr>' : '') + '</table>' +
    '<table><tr><th>Code</th><th>Description</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">Credit</th></tr>' + (x.lines || []).map(l => '<tr><td>' + esc(l.c) + '</td><td>' + esc(l.d || '') + '</td><td class="r">' + Math.abs(l.q) + '</td><td class="r">' + money(l.p) + '</td><td class="r">−' + money(R2(Math.abs(l.q) * l.p)) + '</td></tr>').join('') +
    '<tr class="fin"><td colspan="4" class="r"><b>TOTAL CREDIT</b></td><td class="r"><b>' + money(x.total) + '</b></td></tr></table>' +
    '<div style="font-size:11px;color:#666;margin-top:10px">This credit is applied to the store balance. 이 크레딧은 가게 잔액에 반영됩니다.</div><div class="sig"><div>Store</div><div>Salesman</div></div>';
}
