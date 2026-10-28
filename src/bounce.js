/* ============================================================
 *  ↩️ 바운스 체크 — 회계 담당이 등록 → 세일즈맨 알림 → 인보이스 잔액 되살려 홀드 → 재입금 · 새 체크 · 다른 결제로 클리어
 *    bounces/{id} = { id, eid(원래 수금), sm, acct, store, ref(체크 #), amt, d(바운스 날), fee, invs, st: open | repl(새 체크 들어옴 · 확인 대기) | cleared | cancel,
 *                    how: redeposit | newcheck | other, clearedAt, clearedBy, replEid, log: [{ at, by, who, text }], by, at }
 *    원래 수금(entries) 에 bounced: true 가 붙으면 AR 입금 · 커미션에서 빠짐 (잔액이 되살아남). 재입금 · 새 체크로 클리어하면 다시 false (새 체크 수금은 🔁 대체로 들어와 겹치지 않음).
 *    다른 결제(COD · 카드 · ACH · 대체 표시 없는 수금)로 클리어하면 원래 수금은 계속 빠짐 (새 결제가 대신 셈).
 *    앱 인보이스(invoices)에는 hold 가 붙어 가게 창 · 인보이스 조회에 ⚠️ 바운스 홀드 로 보임.
 *    세일즈맨 탭 ↩️ 바운스: 내 바운스 목록 · 메모 주고받기 · 새 체크 받음 → 수금 입력(대체 체크로 미리 채움)
 *    회계 탭 ↩️ 바운스: 전체 목록 (세일즈맨별 · 지난 날수) · 등록 · 클리어 · 메모
 * ============================================================ */
import { $, esc, money, R2, num, today, ym, md, toast, busy, openModal, closeModal, confirmBox, Router, sortBy, groupBy, sum, daysBetween, bi, bt, inputDate, sel, invNo } from './ui.js';
import { newId } from './db.js';
import { mySm } from './access.js';
import { applyToInvoices } from './mgr.js';
import { getInvoice } from './invoicing.js';

let S = null;
const isSales = () => S.role === 'salesman';
const staffOk = () => S.role === 'admin' || S.role === 'owner' || S.role === 'manager';
export function register(state) { S = state; Router.on('bounce', page); }
const ST = { open: ['⚠️ 미해결', 'Open', '#b91c1c'], repl: ['🔁 새 체크 들어옴 · 확인 대기', 'Replacement in', '#1e40af'], cleared: ['✅ 해결', 'Cleared', '#15803d'], cancel: ['✕ 취소', 'Cancelled', '#64748b'] };
const HOW = { redeposit: ['재입금 성공', 'Redeposited'], newcheck: ['새 체크', 'New check'], other: ['다른 결제', 'Other payment'] };
const who = () => (S.me && S.me.name) || S.user.email.split('@')[0];
const logLine = text => ({ at: new Date().toISOString(), by: S.user.email, who: who(), side: isSales() ? 'sm' : 'office', text });

async function page(arg) {
  $('page').innerHTML = '<div class="load">' + bt('읽는 중…', 'Loading…') + '</div>';
  let rows = [];
  try { rows = await S.DB.list('bounces', isSales() ? { where: [['sm', '==', mySm()]] } : {}); } catch (e) { $('page').innerHTML = '<div class="card"><div class="alert a-red">' + esc(e.code || e.message) + '</div></div>'; return; }
  rows = sortBy(rows, r => (r.st === 'open' || r.st === 'repl' ? '0' : '1') + r.d, false);
  const open = rows.filter(r => r.st === 'open' || r.st === 'repl'), done = rows.filter(r => r.st === 'cleared' || r.st === 'cancel').slice(0, 60);
  const card = r => { const st = ST[r.st] || ST.open, age = daysBetween(r.d, today());
    return '<div class="pr tap" data-bn="' + esc(r.id) + '" style="border-left:4px solid ' + st[2] + ';padding-left:8px;border-radius:10px"><div class="ct"><b>' + esc(r.store) + ' <span class="tag t-g">#' + esc(r.ref) + '</span>' + (isSales() ? '' : ' <span class="muted" style="font-weight:600">' + esc(r.sm) + '</span>') + '</b><small>' + bt('바운스', 'Bounced') + ' ' + esc(r.d) + ' · ' + (r.st === 'open' || r.st === 'repl' ? '<b style="color:' + (age >= 14 ? '#b91c1c' : '#b45309') + '">' + age + bt('일째', 'd') + '</b>' : esc(String(r.clearedAt || '').substring(0, 10))) + (r.invs && r.invs.length ? ' · ' + r.invs.map(v => esc(v.no)).join(', ') : '') + (r.log && r.log.length ? ' · 💬 ' + r.log.length : '') + '</small></div><div class="pa"><b>' + money(r.amt) + '</b><small style="color:' + st[2] + '">' + bt(st[0], st[1]) + (r.how ? ' · ' + bt(HOW[r.how][0], HOW[r.how][1]) : '') + '</small></div></div>'; };
  const bySm = groupBy(open, r => r.sm);
  $('page').innerHTML = '<div class="card"><h2>↩️ ' + bi('바운스 체크', 'Bounced checks') + '</h2><div class="muted">' + (isSales() ? bt('은행에서 돌아온 체크입니다. 그 인보이스는 다시 미수로 살아나 홀드 중이니, 가게에 연락해 새 체크를 받거나 재입금 결과를 기다려 주세요. 새 체크를 받으면 아래 버튼으로 수금 입력(🔁 대체 체크)하면 됩니다. 메모로 사무실과 주고받을 수 있습니다.', 'Checks returned by the bank. Those invoices are open again and on hold. Contact the store for a new check or wait for the redeposit. Record a new check with the button below; use notes to talk to the office.') : bt('은행에서 돌아온 체크를 등록하면 세일즈맨에게 알림이 가고, 그 수금은 잔액 · 커미션에서 빠지며 인보이스가 홀드됩니다. 재입금 성공 · 새 체크 · 다른 결제가 들어오면 클리어하세요.', 'Register a returned check: the salesman is notified, the payment is removed from balances and commission, and the invoices go on hold. Clear it when it is redeposited, replaced, or paid another way.')) + '</div>' +
    '<div class="kpi" style="grid-template-columns:repeat(3,1fr)"><div' + (open.length ? ' style="background:#fee2e2"' : '') + '><b>' + open.length + '</b><span>' + bt('미해결', 'Open') + '</span></div><div><b>' + money(sum(open, r => r.amt)) + '</b><span>' + bt('홀드 금액', 'On hold') + '</span></div><div><b>' + open.filter(r => daysBetween(r.d, today()) >= 14).length + '</b><span>' + bt('14일 넘음', 'Over 14 days') + '</span></div></div>' +
    (staffOk() ? '<div class="btns" style="justify-content:flex-start"><button class="b-red" id="bnNew">＋ ' + bi('바운스 등록', 'Register bounce') + '</button></div>' : '') + '</div>' +
    (open.length ? (isSales() ? '<div class="card"><h2>' + bt('미해결', 'Open') + ' ' + open.length + '</h2>' + open.map(card).join('') + '</div>' : Object.keys(bySm).sort().map(sm => '<div class="card"><h2>' + esc(sm) + ' <span class="muted" style="font-weight:400;font-size:12px">' + bySm[sm].length + bt('건', '') + ' · ' + money(sum(bySm[sm], r => r.amt)) + '</span></h2>' + bySm[sm].map(card).join('') + '</div>').join('')) : '<div class="card"><div class="none">✅ ' + bt('미해결 바운스가 없습니다', 'No open bounces') + '</div></div>') +
    (done.length ? '<div class="card"><h2>' + bt('해결 · 취소', 'Cleared · cancelled') + ' ' + done.length + '</h2>' + done.map(card).join('') + '</div>' : '');
  if ($('bnNew')) $('bnNew').onclick = registerForm;
  document.querySelectorAll('[data-bn]').forEach(el => el.onclick = () => detail(rows.find(r => r.id === el.dataset.bn)));
  if (arg) { const r = rows.find(x => x.id === decodeURIComponent(arg)); if (r) detail(r); }
}

/* ---------- 등록 (회계) — 체크 번호로 원래 수금 찾기 ---------- */
async function registerForm() {
  openModal('<h2>↩️ ' + bi('바운스 등록', 'Register bounce') + '</h2><div class="muted">' + bt('은행에서 돌아온 체크 번호를 치세요. 최근 6개월 수금에서 찾습니다.', 'Type the returned check number (searched in the last 6 months).') + '</div>' +
    '<div class="fg"><label>' + bt('체크 번호', 'Check #') + '</label><input id="bnRef" inputmode="numeric" autocomplete="off"></div><div id="bnHits"></div>');
  const yms = []; { const d = new Date(); for (let i = 0; i < 7; i++) { yms.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); d.setMonth(d.getMonth() - 1); } }
  let ents = null;
  const find = async () => { const q = $('bnRef').value.trim(); if (!q) { $('bnHits').innerHTML = ''; return; }
    if (!ents) { $('bnHits').innerHTML = '<div class="load">…</div>'; try { ents = (await S.DB.list('entries', { where: [['ym', 'in', yms]] })).filter(e => !e.void); } catch (e) { ents = []; } }
    const hits = ents.filter(e => (e.pays || []).some(p => p.m === 'CHECK' && String(p.ref || '').replace(/^0+/, '') === q.replace(/^0+/, ''))).slice(0, 8);
    $('bnHits').innerHTML = hits.length ? hits.map(e => { const p = (e.pays || []).find(x => x.m === 'CHECK' && String(x.ref || '').replace(/^0+/, '') === q.replace(/^0+/, '')); return '<div class="pr tap" data-be="' + esc(e.id) + '"><div class="ct"><b>' + esc(e.store) + ' · ' + esc(e.sm) + (e.bounced ? ' <span class="tag t-r">' + bt('이미 바운스', 'already bounced') + '</span>' : '') + '</b><small>' + esc(e.d) + ' · #' + esc(p.ref) + ' ' + money(p.amt) + (e.invs && e.invs.length ? ' → ' + e.invs.map(v => v.no).join(', ') : '') + (e.settled ? ' · <b class="warn">' + bt('정산 완료됨', 'already settled') + '</b>' : '') + '</small></div><div class="pa"><b>' + money(e.total) + '</b></div></div>'; }).join('') : '<div class="none">' + bt('그 번호의 체크 수금이 없습니다', 'No check with that number') + '</div>';
    $('bnHits').querySelectorAll('[data-be]').forEach(el => el.onclick = () => registerGo(hits.find(e => e.id === el.dataset.be), q)); };
  $('bnRef').oninput = find; $('bnRef').onkeydown = e => { if (e.key === 'Enter') find(); };
  setTimeout(() => $('bnRef').focus(), 50);
}
function registerGo(e, q) {
  if (e.bounced) return toast(bt('이미 바운스로 등록된 수금입니다', 'Already registered'), 'bad');
  const p = (e.pays || []).find(x => x.m === 'CHECK' && String(x.ref || '').replace(/^0+/, '') === q.replace(/^0+/, ''));
  openModal('<h2>↩️ ' + esc(e.store) + ' · #' + esc(p.ref) + '</h2><div class="sumbox">' + esc(e.sm) + ' · ' + bt('받은 날', 'received') + ' ' + esc(e.d) + ' · ' + bt('체크', 'check') + ' ' + money(p.amt) + (e.invs && e.invs.length ? '<br>' + bt('인보이스', 'Invoices') + ': ' + e.invs.map(v => esc(v.no) + ' ' + money(v.amt)).join(', ') : '') + (e.settled ? '<br><b class="warn">⚠️ ' + bt('이미 정산(커미션 지급)된 수금입니다 — 공제 등록을 검토하세요', 'Already settled: consider a deduction') + '</b>' : '') + '</div>' +
    '<div class="two"><div class="fg"><label>' + bt('바운스 날', 'Bounce date') + '</label>' + inputDate('bnD', today()) + '</div><div class="fg"><label>' + bt('은행 수수료 $ (선택)', 'Bank fee (optional)') + '</label><input id="bnFee" inputmode="decimal" style="text-align:right"></div></div>' +
    '<div class="fg"><label>' + bt('메모 (세일즈맨에게 같이 감)', 'Note (sent to the salesman)') + '</label><input id="bnNote" placeholder="' + esc(bt('예: NSF · 계좌 폐쇄 · 서명 불일치', 'e.g. NSF · account closed')) + '"></div>' +
    '<div class="alert a-amb">' + bt('등록하면: 이 수금이 잔액 · 커미션에서 빠져 인보이스가 다시 미수로 살아나고(홀드), 세일즈맨에게 알림이 갑니다.', 'Registering removes this payment from balances and commission (invoices open again, on hold) and notifies the salesman.') + '</div>' +
    '<div class="btns"><button class="b-ghost" id="bnX">' + bt('취소', 'Cancel') + '</button><button class="b-red" id="bnGo">↩️ ' + bt('바운스 등록', 'Register') + '</button></div>');
  $('bnX').onclick = closeModal;
  $('bnGo').onclick = async () => {
    const d = $('bnD').value || today(), fee = R2(num($('bnFee').value)), note = $('bnNote').value.trim(); busy(true);
    try {
      const id = newId('B'), now = new Date().toISOString(), amt = R2(num(p.amt));
      const doc = { id, eid: e.id, sm: e.sm, acct: e.acct || '', store: e.store, ref: String(p.ref), amt, fee, d, ym: ym(d), invs: (e.invs || []).map(v => ({ no: v.no, amt: num(v.amt) })), settled: !!e.settled, st: 'open', how: '', log: note ? [logLine(note)] : [], by: S.user.email, at: now, updatedAt: now };
      const ops = [{ op: 'set', col: 'bounces', id, data: doc }, { op: 'update', col: 'entries', id: e.id, data: { bounced: true, bounceId: id, bounceAt: d } }];
      await S.DB.batch(ops);
      await applyToInvoices(e.id, e.invs || [], false);   /* 앱 인보이스 입금 되돌림 → 잔액 되살아남 */
      await holdInvoices(e.invs || [], id);
      try { const N = await import('./notify.js'); await N.queue({ kind: 'bounce', toSm: e.sm, chat: true, subject: '[THE ONE] ↩️ 바운스 체크 — ' + e.store + ' #' + p.ref + ' ' + money(amt), text: '↩️ 바운스 체크 → ' + e.sm + ' · ' + e.store + ' (' + (e.acct || '') + ')\n체크 #' + p.ref + ' ' + money(amt) + ' · 받은 날 ' + e.d + ' · 바운스 ' + d + (doc.invs.length ? '\n인보이스 ' + doc.invs.map(v => v.no).join(', ') + ' 다시 미수 (홀드)' : '') + (note ? '\n' + note : '') + '\n가게에 연락해 새 체크를 받거나 재입금 결과를 알려 주세요. 앱 ↩️ 바운스 탭에서 메모를 주고받을 수 있습니다.', url: N.appUrl('bounce/' + id) }); } catch (x) {}
      closeModal(); toast('↩️ ' + bt('바운스 등록', 'Registered') + ' — ' + e.store + ' #' + p.ref, 'good'); page(id);
    } catch (x) { toast(bt('실패', 'Failed') + ': ' + (x.code || x.message), 'bad'); }
    busy(false);
  };
}
async function holdInvoices(invs, bid) { for (const v of invs) { const no = invNo(v.no); if (!no) continue; try { const inv = await getInvoice(S, no); if (inv && inv.st !== 'x') await S.DB.update('invoices', inv.id || inv.no || no, { hold: bid || '' }); } catch (e) {} } }

/* ---------- 상세 — 메모 · 클리어 · 새 체크 ---------- */
async function detail(r) {
  if (!r) return;
  const st = ST[r.st] || ST.open, canClear = staffOk() && (r.st === 'open' || r.st === 'repl');
  openModal('<h2>↩️ ' + esc(r.store) + ' · #' + esc(r.ref) + ' <span class="tag" style="background:' + st[2] + ';color:#fff">' + bt(st[0], st[1]) + '</span></h2>' +
    '<div class="sumbox">' + esc(r.sm) + ' · ' + esc(r.acct || '') + ' · ' + bt('바운스', 'bounced') + ' <b>' + esc(r.d) + '</b> (' + daysBetween(r.d, today()) + bt('일', 'd') + ') · <b style="font-size:16px">' + money(r.amt) + '</b>' + (r.fee ? ' · ' + bt('수수료', 'fee') + ' ' + money(r.fee) : '') + (r.invs && r.invs.length ? '<br>' + bt('홀드 인보이스', 'Invoices on hold') + ': ' + r.invs.map(v => esc(v.no) + ' ' + money(v.amt)).join(', ') : '') + (r.settled ? '<br><b class="warn">⚠️ ' + bt('이미 정산된 수금', 'already settled') + '</b>' : '') + (r.how ? '<br>' + bt('해결', 'Cleared') + ': ' + bt(HOW[r.how][0], HOW[r.how][1]) + ' · ' + esc(String(r.clearedAt || '').substring(0, 10)) + (r.replEid ? ' · ' + bt('수금', 'entry') + ' ' + esc(r.replEid) : '') : '') + '</div>' +
    '<div style="max-height:200px;overflow:auto;margin-top:8px" id="bnLog">' + logHtml(r) + '</div>' +
    '<div style="display:flex;gap:6px;margin-top:6px"><input id="bnMsg" placeholder="' + esc(isSales() ? bt('사무실에 메모 (예: 가게 연락함, 금요일 새 체크)', 'Note to the office') : bt('세일즈맨에게 메모', 'Note to the salesman')) + '" style="flex:1"><button class="b-blue b-sm" id="bnSend">💬</button></div>' +
    '<div class="btns" style="flex-wrap:wrap">' + (isSales() && (r.st === 'open' || r.st === 'repl') ? '<button class="b-green" id="bnNewChk">✍️ ' + bt('새 체크 받음 → 수금 입력', 'Got a new check → enter') + '</button>' : '') +
    (canClear ? '<button class="b-green" id="bnRedep">✅ ' + bt('재입금 성공', 'Redeposited OK') + '</button><button class="b-blue" id="bnRepl">🔁 ' + bt('새 체크로 해결', 'New check') + '</button><button class="b-ghost" id="bnOther">💳 ' + bt('다른 결제로 해결', 'Other payment') + '</button><button class="b-ghost" id="bnCancel" style="color:#991b1b">✕ ' + bt('잘못 등록 · 취소', 'Cancel') + '</button>' : '') +
    '<button class="b-ghost" id="bnClose">' + bt('닫기', 'Close') + '</button></div>');
  $('bnClose').onclick = closeModal;
  $('bnSend').onclick = async () => { const t = $('bnMsg').value.trim(); if (!t) return; busy(true); try { const log = (r.log || []).concat([logLine(t)]); await S.DB.update('bounces', r.id, { log, updatedAt: new Date().toISOString() }); r.log = log; $('bnLog').innerHTML = logHtml(r); $('bnMsg').value = '';
    try { const N = await import('./notify.js'); await N.queue(Object.assign({ kind: 'bounceNote', chat: true, subject: '[THE ONE] 💬 바운스 메모 — ' + r.store + ' #' + r.ref, text: '💬 ' + who() + ': ' + t + '\n↩️ ' + r.store + ' #' + r.ref + ' ' + money(r.amt) + ' (' + r.sm + ')', url: N.appUrl('bounce/' + r.id) }, isSales() ? { toStaff: true } : { toSm: r.sm })); } catch (x) {} } catch (x) { toast(bt('실패', 'Failed') + ': ' + (x.code || x.message), 'bad'); } busy(false); };
  if ($('bnNewChk')) $('bnNewChk').onclick = async () => { closeModal(); const C = await import('./collect.js'); C.prefillRepl({ acct: r.acct, store: r.store, ref: r.ref, amt: r.amt, bounceId: r.id }); };
  if ($('bnRedep')) $('bnRedep').onclick = () => clear(r, 'redeposit');
  if ($('bnRepl')) $('bnRepl').onclick = () => pickEntry(r, 'newcheck');
  if ($('bnOther')) $('bnOther').onclick = () => pickEntry(r, 'other');
  if ($('bnCancel')) $('bnCancel').onclick = async () => { if (!(await confirmBox(bt('잘못 등록한 바운스를 취소할까요? 원래 수금이 다시 정상으로 돌아옵니다.', 'Cancel this bounce? The original payment is restored.'), bt('취소', 'Cancel bounce')))) return; await restore(r, 'cancel', ''); };
}
const logHtml = r => (r.log || []).length ? r.log.map(l => '<div style="margin:3px 0;padding:6px 8px;border-radius:8px;background:' + (l.side === 'sm' ? '#eff6ff' : '#f8fafc') + ';font-size:12.5px"><b>' + esc(l.who || '') + '</b> <span class="muted">' + esc(String(l.at || '').substring(5, 16).replace('T', ' ')) + '</span><br>' + esc(l.text) + '</div>').join('') : '<div class="muted" style="font-size:12px">' + bt('메모가 없습니다', 'No notes yet') + '</div>';
/** 새 체크 · 다른 결제 고르기 — 같은 가게의 바운스 뒤 수금 (🔁 대체 표시 된 것 먼저) · COD · 카드 · ACH */
async function pickEntry(r, how) {
  busy(true); let ents = [], cods = [];
  try { ents = (await S.DB.list('entries', { where: [['acct', '==', r.acct]] })).filter(e => !e.void && e.id !== r.eid && e.d >= r.d.substring(0, 7) + '-01'); cods = (await S.DB.list('cod', { where: [['acct', '==', r.acct]] })).filter(c => !c.void && c.d >= r.d.substring(0, 7) + '-01'); } catch (e) {}
  busy(false);
  const L = sortBy(ents.map(e => ({ k: 'e', id: e.id, d: e.d, amt: e.total, txt: (e.pays || []).map(p => p.m === 'CHECK' ? 'CHECK #' + p.ref + (p.repl ? ' 🔁' + (p.orig ? ' (' + bt('원래', 'orig') + ' #' + p.orig + ')' : '') : '') : p.m).join(' · '), pri: (e.pays || []).some(p => p.repl && String(p.orig || '').replace(/^0+/, '') === r.ref.replace(/^0+/, '')) ? 0 : 1 })).concat(how === 'other' ? cods.map(c => ({ k: 'c', id: c.id, d: c.d, amt: c.amt, txt: c.method + (c.ref ? ' ' + c.ref : ''), pri: 1 })) : []), x => x.pri + x.d, false);
  openModal('<h2>' + (how === 'newcheck' ? '🔁 ' + bt('새 체크로 해결', 'Clear with a new check') : '💳 ' + bt('다른 결제로 해결', 'Clear with another payment')) + '</h2><div class="muted">' + esc(r.store) + ' #' + esc(r.ref) + ' ' + money(r.amt) + ' — ' + (how === 'newcheck' ? bt('세일즈맨이 🔁 대체 체크로 넣은 수금이 위에 옵니다. 고르면 원래 수금이 다시 정상으로 돌아오고(커미션 포함) 대체 수금은 겹치지 않게 빠집니다.', 'Replacement checks come first. The original payment is restored (commission included); the replacement stays excluded so nothing double counts.') : bt('COD · 카드 · ACH · 일반 수금 중 이 바운스를 대신한 것을 고르세요. 원래 수금은 계속 빠지고 새 결제가 대신 셉니다.', 'Pick the COD · card · ACH · payment that replaced it. The original stays excluded; the new payment counts.')) + '</div>' +
    (L.length ? L.map(x => '<div class="pr tap" data-pk="' + x.k + '|' + esc(x.id) + '"><div class="ct"><b>' + esc(x.d) + ' · ' + esc(x.txt) + '</b><small>' + esc(x.id) + '</small></div><div class="pa"><b>' + money(x.amt) + '</b></div></div>').join('') : '<div class="none">' + bt('바운스 뒤 이 가게의 수금이 없습니다 — 세일즈맨이 먼저 수금 입력을 해야 합니다', 'No payment for this store after the bounce yet') + '</div>') +
    '<div class="btns"><button class="b-ghost" id="pkX">' + bt('닫기', 'Close') + '</button>' + (how === 'other' ? '<button class="b-ghost" id="pkNone">' + bt('연결 없이 해결 처리', 'Clear without linking') + '</button>' : '') + '</div>');
  $('pkX').onclick = () => detail(r);
  if ($('pkNone')) $('pkNone').onclick = () => clear(r, 'other', '');
  document.querySelectorAll('[data-pk]').forEach(el => el.onclick = () => { const [k, id] = el.dataset.pk.split('|'); clear(r, how, (k === 'c' ? 'cod:' : '') + id); });
}
async function clear(r, how, replEid) {
  const restoreOrig = how === 'redeposit' || how === 'newcheck';
  if (!(await confirmBox(r.store + ' #' + r.ref + ' ' + money(r.amt) + '\n' + bt(HOW[how][0], HOW[how][1]) + (restoreOrig ? '\n' + bt('원래 수금이 다시 잔액 · 커미션에 들어가고 인보이스 홀드가 풀립니다.', 'Original payment counts again; invoice hold is released.') : '\n' + bt('원래 수금은 빠진 채 두고, 인보이스 홀드만 풉니다.', 'Original stays excluded; hold is released.')), '✅ ' + bt('해결', 'Clear')))) return;
  await restore(r, 'cleared', how, replEid);
}
async function restore(r, st, how, replEid) {
  busy(true);
  try {
    const now = new Date().toISOString(), restoreOrig = st === 'cancel' || how === 'redeposit' || how === 'newcheck';
    let e = null; try { e = await S.DB.get('entries', r.eid); } catch (x) {}
    const ops = [{ op: 'update', col: 'bounces', id: r.id, data: { st, how: how || '', replEid: replEid || '', clearedAt: now, clearedBy: S.user.email, updatedAt: now, log: (r.log || []).concat([logLine((st === 'cancel' ? bt('바운스 등록 취소', 'bounce cancelled') : bt('해결', 'cleared') + ' — ' + bt(HOW[how][0], HOW[how][1])) + (replEid ? ' (' + replEid + ')' : ''))]) } }];
    if (e) ops.push({ op: 'update', col: 'entries', id: e.id, data: restoreOrig ? { bounced: false, bounceId: '', bounceCleared: r.id } : { bounced: true, bounceId: r.id, bounceCleared: r.id, bounceHow: how } });
    await S.DB.batch(ops);
    if (restoreOrig && e) await applyToInvoices(e.id, e.invs || [], true);
    await holdInvoices(r.invs || [], '');
    try { const N = await import('./notify.js'); await N.queue({ kind: 'bounceClear', toSm: r.sm, chat: true, subject: '[THE ONE] ✅ 바운스 해결 — ' + r.store + ' #' + r.ref, text: (st === 'cancel' ? '✕ 바운스 등록 취소' : '✅ 바운스 해결 (' + HOW[how][0] + ')') + ' → ' + r.sm + ' · ' + r.store + ' #' + r.ref + ' ' + money(r.amt), url: N.appUrl('bounce/' + r.id) }); } catch (x) {}
    closeModal(); toast((st === 'cancel' ? '✕ ' : '✅ ') + r.store + ' #' + r.ref, 'good'); page();
  } catch (x) { toast(bt('실패', 'Failed') + ': ' + (x.code || x.message), 'bad'); }
  busy(false);
}
/** 세일즈맨이 🔁 대체 체크 수금을 저장했을 때 — 같은 가게의 미해결 바운스에 연결 표시 (회계가 확인 뒤 해결) · collect.js 에서 부름 */
export async function linkReplacement(state, entry) {
  S = S || state;
  const origs = (entry.pays || []).filter(p => p.repl && p.orig).map(p => String(p.orig).replace(/^0+/, ''));
  if (!origs.length) return 0;
  let L = []; try { L = (await S.DB.list('bounces', { where: [['acct', '==', entry.acct]] })).filter(b => b.st === 'open' && origs.includes(String(b.ref).replace(/^0+/, ''))); } catch (e) { return 0; }
  for (const b of L) {
    try { await S.DB.update('bounces', b.id, { st: 'repl', replEid: entry.id, replAt: new Date().toISOString(), updatedAt: new Date().toISOString(), log: (b.log || []).concat([logLine(bt('새 체크 수금 입력', 'new check entered') + ' — ' + (entry.pays || []).filter(p => p.repl).map(p => '#' + p.ref + ' ' + money(p.amt)).join(', '))]) });
      const N = await import('./notify.js'); await N.queue({ kind: 'bounceRepl', toStaff: true, chat: true, subject: '[THE ONE] 🔁 바운스 새 체크 — ' + b.store + ' #' + b.ref, text: '🔁 ' + b.sm + ' · ' + b.store + ' 바운스 #' + b.ref + ' ' + money(b.amt) + ' 대신 새 체크 ' + (entry.pays || []).filter(p => p.repl).map(p => '#' + p.ref + ' ' + money(p.amt)).join(', ') + ' 수금 입력됨 — 체크 수령 뒤 ↩️ 바운스 탭에서 해결 처리', url: N.appUrl('bounce/' + b.id) }); } catch (e) {}
  }
  return L.length;
}
