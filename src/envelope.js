/* ============================================================
 *  📦 체크 봉투 — 세일즈맨이 모아 둔 체크를 회사로 보낼 때 묶고, 회계 담당이 봉투 단위로 도착을 맞춤
 *    세일즈맨: 📦 체크 보내기 — 아직 안 보낸 체크(수금 입력 중 CHECK)를 골라 봉투로 묶음 → 발송 목록 인쇄(봉투에 같이 넣음) → 봉투 번호
 *    회계 담당: 💵 수금 확인 → 📦 도착한 봉투 — 봉투를 열고 체크 번호를 치면(또는 ✓) 그 수금이 ② 체크 수령, 장수 · 금액이 다 맞으면 봉투 완료
 *              빠진 체크는 ⚠️ 미도착 — 보낸 지 LATE_DAYS 지나면 세일즈맨 · 담당자에게 알림 (apps-script/Code.gs)
 *    envelopes/{id} = { id, sm, n, total, checks:[{eid, ref, amt, store, acct, d}], entries:[eid], st: sent|done, sentAt, by, trk, note,
 *                       got: {eid: at}, miss: {eid: true}, doneAt, doneBy }
 *    entries.env = 봉투 번호 · entries.rc = 도착(② 체크 수령, 기존 그대로)
 * ============================================================ */
import { $, esc, money, num, R2, today, md, toast, busy, openModal, closeModal, confirmBox, printOpen, sum, bi, bt, daysBetween } from './ui.js';
import { newId } from './db.js';

let S = null;
export function register(state) { S = state; }
export const LATE_DAYS = 14;
const mySm = () => String((S.me && S.me.sm) || '').toUpperCase();
const envId = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return 'V' + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) + '-' + Math.random().toString(36).slice(2, 5).toUpperCase(); };
const ck = r => (r.pays || []).filter(p => p.m === 'CHECK');
const refOf = p => String(p.ref || '').replace(/^#/, '').trim();
export const isLate = e => e.st !== 'done' && daysBetween((e.sentAt || '').substring(0, 10), today()) >= LATE_DAYS;
const ago = e => { const n = daysBetween((e.sentAt || '').substring(0, 10), today()); return n <= 0 ? bt('오늘', 'today') : n + bt('일 전', 'd ago'); };

/* ---------- 세일즈맨: 📦 체크 보내기 ---------- */
export async function paintSend(el, sm, myEntries) {
  if (!el) return;
  const rows = (await myEntries(true)).filter(r => !r.void && !r.env && ck(r).length);
  let envs = []; try { envs = (await S.DB.list('envelopes', { where: [['sm', '==', sm]] })).sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt))).slice(0, 12); } catch (e) {}
  const checks = []; rows.forEach(r => ck(r).forEach(p => checks.push({ eid: r.id, ref: refOf(p), amt: R2(num(p.amt)), store: r.store, acct: r.acct || '', d: r.d })));
  const tot = R2(sum(checks, c => c.amt));
  el.innerHTML = '<div class="card" style="border:2px solid #bfdbfe"><h2>📦 ' + bi('체크 보내기', 'Send checks') + ' <span class="muted" style="font-weight:400;font-size:12px">' + bt('모아 둔 체크를 회사로 보낼 때', 'when you mail your checks') + '</span></h2>' +
    '<div class="muted">' + bt('아직 안 보낸 체크입니다. 봉투에 넣을 것을 체크하고 <b>보내기</b>를 누르면 봉투 번호가 생기고 <b>발송 목록</b>이 나옵니다 — 인쇄해서 체크와 같이 넣으세요. 회계 담당이 그 목록대로 도착을 맞춥니다.', 'Checks not yet mailed. Tick the ones going in the envelope and tap <b>Send</b> — you get an envelope number and a <b>packing list</b> to print and enclose. Accounting matches arrivals against it.') + '</div>' +
    (checks.length ? '<div class="muted" style="margin:8px 0 4px;display:flex;justify-content:space-between"><span><label class="tap"><input type="checkbox" id="evAll" checked> ' + bt('모두', 'All') + '</label></span><span id="evSum"></span></div>' +
      checks.map((c, i) => '<label class="pr" style="cursor:pointer"><input type="checkbox" class="evck" data-i="' + i + '" checked style="width:20px;height:20px;margin-right:8px"><div class="ct"><b>' + esc(c.store) + '</b><small>' + esc(md(c.d)) + ' · ' + bt('체크', 'Check') + ' #' + esc(c.ref) + '</small></div><div class="pa"><b>' + money(c.amt) + '</b></div></label>').join('') +
      '<div class="fg" style="margin-top:8px"><label>' + bi('추적 번호 · 메모 (선택)', 'Tracking # · note (optional)') + '</label><input id="evTrk" placeholder="USPS 9400… · FedEx"></div>' +
      '<button class="b-blue" id="evGo" style="margin-top:8px;padding:14px">📦 ' + bt('보내기', 'Send') + '</button>'
      : '<div class="none">' + bt('보낼 체크가 없습니다 — 수금 입력의 체크는 모두 봉투로 묶였습니다', 'No checks waiting — every entered check is already in an envelope') + '</div>') + '</div>' +
    '<div class="card"><h2 style="font-size:15px">📬 ' + bi('보낸 봉투', 'Sent envelopes') + '</h2>' + (envs.length ? envs.map(e => envRow(e, true)).join('') : '<div class="none">' + bt('아직 없음', 'None yet') + '</div>') + '</div>';
  const picked = () => Array.from(el.querySelectorAll('.evck:checked')).map(x => checks[Number(x.dataset.i)]);
  const sumUp = () => { const P = picked(); const s = $('evSum'); if (s) s.innerHTML = '<b>' + P.length + bt('장', '') + ' · ' + money(sum(P, c => c.amt)) + '</b>'; const g = $('evGo'); if (g) g.textContent = '📦 ' + bt('보내기', 'Send') + ' — ' + P.length + bt('장', '') + ' · ' + money(sum(P, c => c.amt)); };
  el.querySelectorAll('.evck').forEach(c => c.onchange = sumUp); if ($('evAll')) $('evAll').onchange = () => { el.querySelectorAll('.evck').forEach(c => { c.checked = $('evAll').checked; }); sumUp(); }; sumUp();
  el.querySelectorAll('[data-evp]').forEach(b => b.onclick = () => { const e = envs.find(x => x.id === b.dataset.evp); if (e) printList(e); });
  if ($('evGo')) $('evGo').onclick = async () => {
    const P = picked(); if (!P.length) return toast(bt('보낼 체크를 고르세요', 'Pick checks to send'), 'bad');
    if (!(await confirmBox(bt('체크 ' + P.length + '장 · ' + money(sum(P, c => c.amt)) + ' 을 봉투로 묶을까요? 묶은 뒤 발송 목록을 인쇄해 체크와 같이 넣으세요.', 'Bundle ' + P.length + ' checks (' + money(sum(P, c => c.amt)) + ')? Print the packing list and enclose it.'), '📦 ' + bt('보내기', 'Send')))) return;
    const id = envId(), now = new Date().toISOString(), eids = Array.from(new Set(P.map(c => c.eid)));
    const env = { id, sm, n: P.length, total: R2(sum(P, c => c.amt)), checks: P, entries: eids, st: 'sent', sentAt: now, by: String(S.user.email || '').toLowerCase(), trk: $('evTrk').value.trim(), got: {}, miss: {} };
    busy(true);
    try {
      await S.DB.set('envelopes', id, env);
      for (const eid of eids) { try { await S.DB.update('entries', eid, { env: id, envAt: now, updatedAt: now }); } catch (e) { console.warn('env mark', eid, e); } }
      toast('📦 ' + bt('봉투', 'Envelope') + ' ' + id + ' — ' + P.length + bt('장', ''), 'good');
      printList(env);
      paintSend(el, sm, myEntries);
    } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}
function envRow(e, mine) {
  const got = Object.keys(e.got || {}).length, late = isLate(e);
  const st = e.st === 'done' ? '<span class="tag t-k">✅ ' + bt('도착 완료', 'Arrived') + '</span>' : late ? '<span class="tag t-r">⚠️ ' + bt('미도착', 'Not arrived') + ' · ' + ago(e) + '</span>' : '<span class="tag t-c">📮 ' + bt('가는 중', 'In transit') + ' · ' + ago(e) + '</span>';
  return '<div class="pr"><div class="ct"><b>' + esc(e.id) + ' ' + st + '</b><small>' + esc(String(e.sentAt || '').substring(0, 10)) + ' · ' + (e.n || 0) + bt('장', '') + ' · ' + money(e.total) + (e.st !== 'done' && got ? ' · ' + bt('도착', 'arrived') + ' ' + got + '/' + (e.n || 0) : '') + (e.trk ? ' · ' + esc(e.trk) : '') + (!mine ? ' · 🧑‍💼 ' + esc(e.sm) : '') + '</small></div><div class="pa"><button class="b-ghost b-sm" data-evp="' + esc(e.id) + '">🖨</button></div></div>';
}
/** 🖨 발송 목록 — 봉투에 같이 넣는 종이 */
export function printList(e) {
  const rows = (e.checks || []).map((c, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(md(c.d)) + '</td><td>' + esc(c.store) + ' <span style="color:#64748b">' + esc(c.acct || '') + '</span></td><td>#' + esc(c.ref) + '</td><td style="text-align:right">' + money(c.amt) + '</td><td style="width:60px;border-bottom:1px solid #999"></td></tr>').join('');
  printOpen('<div style="font-family:Arial,sans-serif"><h2 style="margin:0">THE ONE — ' + bt('체크 발송 목록', 'Check Packing List') + '</h2><div style="font-size:14px;margin:4px 0 12px">' + bt('봉투', 'Envelope') + ' <b style="font-size:18px">' + esc(e.id) + '</b> · ' + bt('세일즈맨', 'Salesman') + ' <b>' + esc(e.sm) + '</b> · ' + esc(String(e.sentAt || '').substring(0, 10)) + (e.trk ? ' · ' + esc(e.trk) : '') + '</div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f1f5f9"><th>#</th><th>' + bt('수금일', 'Date') + '</th><th style="text-align:left">' + bt('가게', 'Store') + '</th><th>' + bt('체크 번호', 'Check #') + '</th><th style="text-align:right">' + bt('금액', 'Amount') + '</th><th>' + bt('도착 ✓', 'Rcvd') + '</th></tr></thead><tbody>' + rows + '</tbody>' +
    '<tfoot><tr style="font-weight:bold;border-top:2px solid #333"><td colspan="4">' + bt('합계', 'Total') + ' ' + (e.n || 0) + bt('장', ' checks') + '</td><td style="text-align:right">' + money(e.total) + '</td><td></td></tr></tfoot></table>' +
    '<p style="font-size:12px;color:#64748b;margin-top:14px">' + bt('회계 담당: 앱 → 수금 확인 → 📦 도착한 봉투에서 이 번호를 열고 체크 번호를 맞춰 주세요.', 'Accounting: App → Payment review → 📦 Envelopes → open this number and match each check.') + '</p></div>');
}

/* ---------- 회계 담당: 📦 도착한 봉투 ---------- */
/** el 안에 봉투 카드 (수금 확인 화면 위). onChange: 수령 처리 뒤 화면 새로 */
export async function envCard(el, onChange) {
  if (!el) return;
  let envs = []; try { envs = (await S.DB.list('envelopes', { where: [['st', '==', 'sent']] })).sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt))); } catch (e) { el.innerHTML = ''; return; }
  const late = envs.filter(isLate);
  el.innerHTML = '<div class="card" style="border:2px solid ' + (late.length ? '#fca5a5' : '#bfdbfe') + '"><h2>📦 ' + bi('도착한 봉투 맞추기', 'Match envelopes') + ' <span class="tag ' + (envs.length ? 't-c' : 't-k') + '">' + envs.length + '</span>' + (late.length ? ' <span class="tag t-r">⚠️ ' + bt('미도착', 'late') + ' ' + late.length + '</span>' : '') + '</h2>' +
    '<div class="muted">' + bt('세일즈맨이 보낸 봉투입니다. 봉투를 열어 안에 든 발송 목록의 번호를 누르고, 체크 번호를 치면(또는 ✓) 그 수금이 ② 체크 수령이 됩니다. 장수 · 금액이 다 맞으면 봉투 완료. ' + LATE_DAYS + '일 넘게 안 오면 ⚠️.', 'Envelopes mailed by salesmen. Open one, type each check number (or ✓) — the payment becomes ② check received. When count and total match, the envelope is done. ⚠️ after ' + LATE_DAYS + ' days.') + '</div>' +
    (envs.length ? envs.map(e => { const got = Object.keys(e.got || {}).length; return '<div class="pr tap" data-ev="' + esc(e.id) + '"><div class="ct"><b>🧑‍💼 ' + esc(e.sm) + ' · ' + esc(e.id) + (isLate(e) ? ' <span class="tag t-r">⚠️ ' + ago(e) + '</span>' : ' <span class="tag t-c">' + ago(e) + '</span>') + '</b><small>' + (e.n || 0) + bt('장', '') + ' · ' + money(e.total) + ' · ' + bt('도착', 'arrived') + ' ' + got + '/' + (e.n || 0) + (e.trk ? ' · ' + esc(e.trk) : '') + '</small></div><div class="pa"><b>' + bt('열기', 'Open') + ' ›</b></div></div>'; }).join('') : '<div class="none">' + bt('기다리는 봉투가 없습니다', 'No envelopes waiting') + '</div>') + '</div>';
  el.querySelectorAll('[data-ev]').forEach(x => x.onclick = () => envModal(envs.find(e => e.id === x.dataset.ev), () => { envCard(el, onChange); if (onChange) onChange(); }));
}
async function envModal(e, after) {
  if (!e) return;
  openModal('<div class="load">' + bt('읽는 중…', 'Loading…') + '</div>', { wide: true });
  const fresh = (await S.DB.get('envelopes', e.id)) || e; e = fresh;
  let ents = []; try { ents = await S.DB.list('entries', { where: [['env', '==', e.id]] }); } catch (x) {}
  const byE = {}; ents.forEach(r => { byE[r.id] = r; });
  /* 체크 사진 — 그 수금이 들어간 데일리 리포트의 사진 */
  let reps = []; try { reps = (await S.DB.list('reports', { where: [['sm', '==', e.sm]] })).filter(r => (r.entries || []).some(id => (e.entries || []).includes(id)) && (r.photos || []).length); } catch (x) {}
  const photosOf = eid => reps.filter(r => (r.entries || []).includes(eid)).flatMap(r => r.photos || []);
  const got = e.got || {}, miss = e.miss || {};
  const paint = () => {
    const n = (e.checks || []).length, k = Object.keys(got).length, tot = R2(sum((e.checks || []).filter(c => got[c.eid + '|' + c.ref]), c => c.amt));
    $('mbox').innerHTML = '<h2>📦 ' + esc(e.id) + ' <span class="muted" style="font-weight:600">🧑‍💼 ' + esc(e.sm) + ' · ' + esc(String(e.sentAt || '').substring(0, 10)) + '</span></h2>' +
      '<div class="kpi" style="margin:6px 0"><div><b>' + k + ' / ' + n + '</b><span>' + bt('도착한 체크', 'Checks arrived') + '</span></div><div><b>' + money(tot) + '</b><span>/ ' + money(e.total) + '</span></div></div>' +
      '<div style="display:flex;gap:6px"><input id="evNo" inputmode="numeric" placeholder="' + esc(bt('체크 번호 치고 엔터', 'Type check # + Enter')) + '" autocomplete="off" style="flex:1;font-size:18px;font-weight:800"><button class="b-blue" id="evFind" style="width:auto">✓</button></div><div id="evMsg" class="muted" style="min-height:18px;margin:4px 0"></div>' +
      (e.checks || []).map(c => { const key = c.eid + '|' + c.ref, ok = !!got[key], ms = !!miss[key], ph = photosOf(c.eid);
        return '<div class="pr' + (ok ? ' v' : ms ? ' bad' : '') + '"><div class="mk">' + (ok ? '✓' : ms ? '⚠️' : '·') + '</div><div class="ct"><b>#' + esc(c.ref) + ' · ' + money(c.amt) + '</b><small>' + esc(c.store) + ' · ' + esc(md(c.d)) + (ok ? ' · ' + bt('도착', 'arrived') + ' ' + esc(String(got[key]).substring(5, 10)) : ms ? ' · <span class="warn">' + bt('미도착 표시', 'marked missing') + '</span>' : '') + '</small>' +
          (ph.length ? '<div class="phs">' + ph.slice(0, 4).map((p, i) => '<img src="' + esc(p) + '" data-big="' + c.eid + ':' + i + '" alt="">').join('') + '</div>' : '') + '</div>' +
          '<div class="pa" style="display:flex;gap:4px">' + (ok ? '<button class="b-ghost b-sm" data-un="' + esc(key) + '">↩</button>' : '<button class="b-green b-sm" data-ok="' + esc(key) + '">✓</button><button class="b-ghost b-sm" data-ms="' + esc(key) + '" title="' + esc(bt('미도착', 'missing')) + '">⚠️</button>') + '</div></div>'; }).join('') +
      '<div class="btns" style="margin-top:8px"><button class="b-ghost" id="evPrint">🖨</button>' + (k === n ? '<button class="b-green" id="evDone">✅ ' + bt('봉투 완료', 'Envelope done') + '</button>' : (k ? '<button class="b-ghost" id="evDone">' + bt('빠진 것 미도착으로 두고 완료', 'Done — rest missing') + '</button>' : '')) + '<button class="b-ghost" id="evX">' + bt('닫기', 'Close') + '</button></div>';
    $('evX').onclick = () => { closeModal(); after(); }; $('evPrint').onclick = () => printList(e);
    const save = async (patch) => { await S.DB.update('envelopes', e.id, Object.assign({ got, miss }, patch || {})); };
    const mark = async (key, on) => {
      const [eid] = key.split('|'), r = byE[eid]; const now = new Date().toISOString();
      busy(true);
      try {
        if (on) { got[key] = now; delete miss[key]; } else delete got[key];
        /* 이 수금의 체크가 모두 도착했으면 ② 체크 수령 (기존 rc), 하나라도 빠지면 되돌림 */
        const allIn = (e.checks || []).filter(c => c.eid === eid).every(c => got[c.eid + '|' + c.ref]);
        if (r) { const patch = { rc: allIn, rcAt: allIn ? today() : '', rcEnv: e.id, updatedAt: now }; if (allIn && !r.sb) { patch.sb = true; patch.sbAt = today(); const { applyToInvoices } = await import('./mgr.js'); try { await applyToInvoices(r.id, r.invs, true); } catch (x) {} r.sb = true; } await S.DB.update('entries', r.id, patch); r.rc = allIn; }
        await save();
      } catch (x) { toast(bt('실패', 'Failed') + ': ' + (x.code || x.message), 'bad'); }
      busy(false); paint();
    };
    const find = () => {
      const no = $('evNo').value.trim().replace(/^#/, ''); if (!no) return;
      const hits = (e.checks || []).filter(c => c.ref === no || (no.length >= 3 && c.ref.endsWith(no)));
      if (!hits.length) { $('evMsg').innerHTML = '<span class="warn">⚠️ #' + esc(no) + ' ' + bt('— 이 봉투의 목록에 없는 체크입니다. 발송 목록을 확인하거나 💳 COD·카드에 우편 체크로 넣으세요.', '— not on this envelope\'s list. Check the packing list or enter it under COD · Card.') + '</span>'; try { navigator.vibrate && navigator.vibrate([80, 60, 80]); } catch (x) {} return; }
      const open = hits.filter(c => !got[c.eid + '|' + c.ref]);
      if (!open.length) { $('evMsg').textContent = '#' + no + ' ' + bt('은 이미 도착 처리됐습니다', 'already marked arrived'); return; }
      mark(open[0].eid + '|' + open[0].ref, true);
    };
    $('evNo').onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); find(); } }; $('evFind').onclick = find;
    setTimeout(() => $('evNo') && $('evNo').focus(), 50);
    $('mbox').querySelectorAll('[data-ok]').forEach(b => b.onclick = () => mark(b.dataset.ok, true));
    $('mbox').querySelectorAll('[data-un]').forEach(b => b.onclick = () => mark(b.dataset.un, false));
    $('mbox').querySelectorAll('[data-ms]').forEach(b => b.onclick = async () => { miss[b.dataset.ms] = true; const [eid] = b.dataset.ms.split('|'); try { await save(); await S.DB.update('entries', eid, { envMiss: true, updatedAt: new Date().toISOString() }); } catch (x) {} paint(); });
    $('mbox').querySelectorAll('[data-big]').forEach(im => im.onclick = () => { const w = window.open('', '_blank'); if (w) { w.document.write('<img src="' + im.src + '" style="max-width:100%">'); w.document.close(); } });
    if ($('evDone')) $('evDone').onclick = async () => {
      const left = (e.checks || []).filter(c => !got[c.eid + '|' + c.ref]);
      if (left.length && !(await confirmBox(bt(left.length + '장이 아직 안 왔습니다. 미도착으로 표시하고 봉투를 닫을까요? (나중에 오면 수금 확인에서 체크 번호로 맞출 수 있습니다)', left.length + ' checks have not arrived. Mark them missing and close the envelope?'), bt('완료', 'Done')))) return;
      busy(true);
      try { for (const c of left) { miss[c.eid + '|' + c.ref] = true; try { await S.DB.update('entries', c.eid, { envMiss: true, updatedAt: new Date().toISOString() }); } catch (x) {} } await save({ st: 'done', doneAt: new Date().toISOString(), doneBy: S.user.email }); toast('✅ ' + bt('봉투 완료', 'Envelope done') + (left.length ? ' · ⚠️ ' + left.length + bt('장 미도착', ' missing') : ''), 'good'); closeModal(); after(); }
      catch (x) { toast(bt('실패', 'Failed') + ': ' + (x.code || x.message), 'bad'); }
      busy(false);
    };
  };
  paint();
}
