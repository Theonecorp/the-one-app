/* ============================================================
 *  🔐 인보이스 · 가게 조회 권한 — 세일즈맨은 자기가 맡은 가게(거래처 담당 = 내 코드)는 그냥 보고,
 *     다른 사람 가게는 관리자 허락(grants)을 받은 동안만 봄
 *    invReq/{id}  조회 요청 { by, name, sm, acct, store, no, reason, st: wait|ok|no, at, untilMs, decidedBy }
 *    grants/{email}__{acct}  허락 { email, acct, store, untilMs, by, at, reqId }  — firestore.rules 가 untilMs 로 막음
 * ============================================================ */
import { $, esc, toast, busy, openModal, closeModal, bt, bi } from './ui.js';
import { newId } from './db.js';

let S = null, G = { at: 0, map: {} };
export function register(state) { S = state; }
const isStaffRole = () => S.role !== 'salesman';
export const mySm = () => String((S.me && S.me.sm) || '').toUpperCase();
const acctOf = acct => (S.accounts && S.accounts.byCode && S.accounts.byCode[acct]) || null;

/** 내가 받은 허락 — { acct: untilMs } (지난 것은 뺌) */
export async function loadGrants(force) {
  if (!S || isStaffRole()) return {};
  if (!force && Date.now() - G.at < 120000) return G.map;
  const m = {};
  try { (await S.DB.list('grants', { where: [['email', '==', S.user.email]] })).forEach(g => { if (Number(g.untilMs) > Date.now()) m[g.acct] = Number(g.untilMs); }); } catch (e) { /* 규칙 게시 전 */ }
  G = { at: Date.now(), map: m }; return m;
}
/** 이 가게를 어떻게 볼 수 있나 — staff · own(내 담당) · grant(허락, untilMs) · none */
export async function acctAccess(acct) {
  if (isStaffRole()) return { k: 'staff' };
  const a = acctOf(acct), sm = mySm();
  if (a && sm && String(a.sm || '').toUpperCase() === sm) return { k: 'own' };
  const g = await loadGrants(); if (g[acct]) return { k: 'grant', until: g[acct] };
  return { k: 'none', owner: a ? String(a.sm || '') : '' };
}
export const untilTxt = ms => { const d = new Date(ms); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

/** 🔐 조회 요청 보내기 — acct 또는 인보이스 번호(no) */
export function requestAccess(o, done) {
  const a = o.acct ? acctOf(o.acct) : null;
  openModal('<h2>🔐 ' + bi('조회 요청', 'Request access') + '</h2>' +
    '<div class="muted">' + (a ? '<b>' + esc(a.store) + '</b> (' + esc(a.acct) + ')' + (a.sm ? ' · ' + bt('담당', 'Rep') + ' ' + esc(a.sm) : '') : bt('인보이스', 'Invoice') + ' <b>' + esc(o.no || '') + '</b>') + '<br>' +
    bt('다른 세일즈맨 담당이라 관리자 허락이 있어야 인보이스를 볼 수 있습니다. 허락되면 정해진 기간 동안 보입니다.', 'This belongs to another salesman — the admin must approve. Once approved you can view it for a set time.') + '</div>' +
    '<div class="fg" style="margin-top:8px"><label>' + bi('이유', 'Reason') + '</label><input id="rqWhy" placeholder="' + esc(bt('예: 가게가 지난 인보이스를 물어봄', 'e.g. store asked about an old invoice')) + '"></div>' +
    '<div class="btns"><button class="b-ghost" id="rqX">' + bt('취소', 'Cancel') + '</button><button class="b-blue" id="rqGo">' + bt('요청 보내기', 'Send request') + '</button></div>');
  $('rqX').onclick = closeModal;
  $('rqGo').onclick = async () => {
    const id = newId('RQ');
    busy(true);
    try {
      await S.DB.set('invReq', id, { id, by: S.user.email, name: (S.me && S.me.name) || S.user.name || '', sm: mySm(), acct: o.acct || '', store: a ? a.store : (o.store || ''), no: o.no || '', reason: $('rqWhy').value.trim(), st: 'wait', at: new Date().toISOString() });
      closeModal(); toast('🔐 ' + bt('요청을 보냈습니다 — 관리자가 허락하면 보입니다', 'Request sent — visible once approved'), 'good'); if (done) done();
    } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}
/** 내 요청 목록 */
export async function myRequests() {
  try { return (await S.DB.list('invReq', { where: [['by', '==', S.user.email]] })).sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, 20); } catch (e) { return []; }
}
export function reqStatus(r) {
  if (r.st === 'ok') return Number(r.untilMs) > Date.now() ? '<span class="tag t-k">✅ ' + bt('허락', 'Approved') + ' ~' + esc(untilTxt(r.untilMs)) + '</span>' : '<span class="tag t-g">' + bt('기간 끝남', 'Expired') + '</span>';
  if (r.st === 'no') return '<span class="tag t-r">' + bt('거절', 'Declined') + '</span>';
  return '<span class="tag t-c">⏳ ' + bt('기다리는 중', 'Waiting') + '</span>';
}

/* ---------- 관리자: 요청 허락 · 거절 ---------- */
export const isRealAdmin = () => S && S.me && S.me.role === 'admin';
/** el 안에 대기 중인 요청 카드 (관리자만, 없으면 비움) */
export async function adminRequestsCard(el) {
  if (!el || !isRealAdmin()) return;
  let L = [];
  try { L = (await S.DB.list('invReq', { where: [['st', '==', 'wait']] })).sort((x, y) => String(x.at).localeCompare(String(y.at))); } catch (e) { el.innerHTML = ''; return; }
  if (!L.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="card" style="border:2px solid #fcd34d"><h2>🔐 ' + bi('인보이스 조회 요청', 'Invoice access requests') + ' <span class="tag t-c">' + L.length + '</span></h2>' +
    L.map(r => { const a = r.acct ? acctOf(r.acct) : null;
      return '<div class="pr"><div class="ct"><b>' + esc(r.name || r.by) + (r.sm ? ' <span class="tag t-g">' + esc(r.sm) + '</span>' : '') + '</b><small>' + (r.acct ? esc((a && a.store) || r.store || '') + ' (' + esc(r.acct) + ')' + (a && a.sm ? ' · ' + bt('담당', 'Rep') + ' ' + esc(a.sm) : '') : bt('인보이스', 'Invoice') + ' ' + esc(r.no)) + '</small>' + (r.reason ? '<small>💬 ' + esc(r.reason) + '</small>' : '') + '<small class="muted">' + esc(String(r.at || '').replace('T', ' ').substring(5, 16)) + '</small></div>' +
        '<div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;flex:0 0 auto;max-width:190px"><button class="b-ghost b-sm" data-rqok="' + esc(r.id) + '" data-days="1">✅ 1' + bt('일', 'd') + '</button><button class="b-ghost b-sm" data-rqok="' + esc(r.id) + '" data-days="7">✅ 7' + bt('일', 'd') + '</button><button class="b-ghost b-sm" data-rqok="' + esc(r.id) + '" data-days="30">✅ 30' + bt('일', 'd') + '</button><button class="b-ghost b-sm" data-rqno="' + esc(r.id) + '" style="color:#991b1b">✕</button></div></div>'; }).join('') + '</div>';
  el.querySelectorAll('[data-rqok]').forEach(b => b.onclick = async () => {
    const r = L.find(x => x.id === b.dataset.rqok); if (!r) return;
    busy(true);
    try {
      let acct = r.acct;
      if (!acct && r.no) { const inv = await S.DB.get('invoices', r.no); acct = inv ? inv.acct : ''; }
      if (!acct) throw new Error(bt('인보이스를 찾지 못해 가게를 알 수 없습니다', 'Invoice not found'));
      const until = Date.now() + Number(b.dataset.days) * 86400000, now = new Date().toISOString(), a = acctOf(acct);
      await S.DB.batch([{ op: 'set', col: 'grants', id: r.by + '__' + acct, data: { email: r.by, acct, store: (a && a.store) || r.store || '', untilMs: until, by: S.user.email, at: now, reqId: r.id } },
        { op: 'update', col: 'invReq', id: r.id, data: { st: 'ok', acct, untilMs: until, decidedBy: S.user.email, decidedAt: now } }]);
      toast('✅ ' + (r.name || r.by) + ' — ' + b.dataset.days + bt('일 허락', ' day(s) approved'), 'good');
    } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false); adminRequestsCard(el);
  });
  el.querySelectorAll('[data-rqno]').forEach(b => b.onclick = async () => {
    busy(true);
    try { await S.DB.update('invReq', b.dataset.rqno, { st: 'no', decidedBy: S.user.email, decidedAt: new Date().toISOString() }); toast(bt('거절했습니다', 'Declined')); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false); adminRequestsCard(el);
  });
}
