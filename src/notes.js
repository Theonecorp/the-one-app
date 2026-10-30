/* ============================================================
 *  📝 거래처 노트 — 가게마다 특이사항 · 간단한 메모를 남김. 세일즈맨이 바뀌어도 다음 사람이 그대로 봄
 *    acctNotes/{id} = { acct, store, text, kind, pin, by, byName, sm, at, editAt }
 *    누구나(세일즈맨 · 담당자) 남기고 읽음 · 고치기 · 지우기는 쓴 사람 또는 담당자 · 관리자 · 📌 고정은 위에 먼저
 * ============================================================ */
import { $, esc, md, toast, busy, openModal, closeModal, confirmBox, bi, bt } from './ui.js';

let S = null;
export function register(state) { S = state; }
export const KINDS = [['warn', '⚠️', '주의', 'Caution'], ['pay', '💳', '결제 · 수금', 'Payment'], ['visit', '🕐', '영업시간 · 방문', 'Hours · visit'], ['ship', '📦', '배송 · 주소', 'Delivery'], ['etc', '📝', '기타', 'Other']];
const kindOf = k => KINDS.find(x => x[0] === k) || KINDS[4];
const isStaff = () => S.role !== 'salesman';
const mine = n => String(n.by || '').toLowerCase() === String(S.user.email || '').toLowerCase();
/* 가게별 노트 — 한 번 읽은 것은 잠깐 기억 (지도 · 가게 창에서 다시 열 때 빠르게) */
const CACHE = {};
export async function loadNotes(acct, force) {
  if (!force && CACHE[acct]) return CACHE[acct];
  let L = [];
  try { L = await S.DB.list('acctNotes', { where: [['acct', '==', acct]] }); } catch (e) { L = []; }
  L.sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || String(b.at || '').localeCompare(String(a.at || '')));
  return (CACHE[acct] = L);
}
export function notesHtml(L, opt) {
  opt = opt || {};
  if (!L.length) return '<div class="none">' + bt('아직 노트가 없습니다', 'No notes yet') + '</div>';
  return L.slice(0, opt.limit || 200).map(n => { const k = kindOf(n.kind);
    return '<div class="note' + (n.pin ? ' npin' : '') + (n.kind === 'warn' ? ' nwarn' : '') + '"><div class="nt">' + (n.pin ? '📌 ' : '') + k[1] + ' <b>' + esc(n.text).replace(/\n/g, '<br>') + '</b></div><div class="nm">' + esc(k[2]) + ' · ' + esc(n.byName || String(n.by || '').split('@')[0]) + (n.sm ? ' (' + esc(n.sm) + ')' : '') + ' · ' + esc(String(n.at || '').substring(0, 10)) + (n.editAt ? ' ✎' : '') +
      (opt.edit && (mine(n) || isStaff()) ? ' <a href="#" data-ne="' + esc(n.id) + '">' + bt('고치기', 'Edit') + '</a>' : '') + '</div></div>'; }).join('');
}
/** 노트 바로 남기기 (창 없이) — ✏️ 정보 수정 요청 같은 기록 */
export async function addNote(acct, text, kind) {
  const a = S.accounts.byCode ? S.accounts.byCode[acct] : null, id = 'N' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await S.DB.set('acctNotes', id, { acct, store: a ? a.store : '', text, kind: kind || 'etc', pin: false, by: S.user.email.toLowerCase(), byName: S.user.name || S.user.email.split('@')[0], sm: (S.me && S.me.sm) || '', at: new Date().toISOString() });
  delete CACHE[acct];
}
/** 노트 남기기 · 고치기 창 — done(list) 는 저장 뒤 새 목록으로 */
export function noteForm(acct, n, done) {
  const a = S.accounts.byCode ? S.accounts.byCode[acct] : null;
  let kind = (n && n.kind) || 'etc', pin = !!(n && n.pin);
  const paint = () => {
    $('mbox').innerHTML = '<h2>📝 ' + (n ? bi('노트 고치기', 'Edit note') : bi('노트 남기기', 'Add note')) + '</h2><div class="muted">' + esc(a ? a.store + ' · ' + a.acct : acct) + ' — ' + bt('세일즈맨이 바뀌어도 다음 사람이 봅니다', 'stays with the store even if the salesman changes') + '</div>' +
      '<div class="chips" style="flex-wrap:wrap;margin-top:8px">' + KINDS.map(k => '<button class="' + (kind === k[0] ? 'on' : '') + '" data-nk="' + k[0] + '">' + k[1] + ' ' + k[2] + ' <span class="en">' + k[3] + '</span></button>').join('') + '</div>' +
      '<textarea id="nTxt" rows="4" style="width:100%;margin-top:8px" placeholder="' + esc(bt('예: 월요일 휴무 · 체크는 사장님만 · 뒷문으로 배달', 'e.g. closed Mondays · only the owner signs checks')) + '">' + esc((n && n.text) || '') + '</textarea>' +
      '<label class="pick ' + (pin ? 'on' : '') + '" id="nPin" style="margin-top:6px"><span class="ck">✓</span><span class="pm"><b>📌 ' + bi('위에 고정', 'Pin to top') + '</b><small>' + bt('가게 창 · 지도 · 주문 화면에 먼저 보임', 'shown first on the store, map and order screens') + '</small></span></label>' +
      '<div class="btns">' + (n ? '<button class="b-ghost" id="nDel" style="color:#991b1b">🗑 ' + bt('지우기', 'Delete') + '</button>' : '') + '<button class="b-ghost" id="nX">' + bt('닫기', 'Close') + '</button><button class="b-blue" id="nOk">' + bt('저장', 'Save') + '</button></div>';
    document.querySelectorAll('[data-nk]').forEach(b => b.onclick = () => { const t = $('nTxt').value; kind = b.dataset.nk; paint(); $('nTxt').value = t; });
    $('nPin').onclick = e => { e.preventDefault(); const t = $('nTxt').value; pin = !pin; paint(); $('nTxt').value = t; };
    $('nX').onclick = closeModal;
    $('nOk').onclick = async () => {
      const text = $('nTxt').value.trim(); if (!text) return toast(bt('내용을 쓰세요', 'Write something'), 'bad');
      busy(true);
      try {
        const now = new Date().toISOString();
        if (n) await S.DB.update('acctNotes', n.id, { text, kind, pin, editAt: now, editBy: S.user.email });
        else { const id = 'N' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); await S.DB.set('acctNotes', id, { acct, store: a ? a.store : '', text, kind, pin, by: S.user.email.toLowerCase(), byName: S.user.name || S.user.email.split('@')[0], sm: (S.me && S.me.sm) || '', at: now }); }
        const L = await loadNotes(acct, true); closeModal(); toast('📝 ' + bt('저장', 'Saved'), 'good'); if (done) done(L);
      } catch (e) { toast('실패: ' + (e.code || e.message) + (String(e.code || e.message).includes('permission') ? ' — Firestore 규칙에 acctNotes 를 게시해야 합니다' : ''), 'bad'); }
      busy(false);
    };
    if ($('nDel')) $('nDel').onclick = async () => { if (!(await confirmBox(bt('이 노트를 지울까요?', 'Delete this note?'), bt('지우기', 'Delete')))) return noteForm(acct, n, done); busy(true); try { await S.DB.del('acctNotes', n.id); const L = await loadNotes(acct, true); toast(bt('지웠습니다', 'Deleted')); if (done) done(L); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  };
  openModal(''); paint();
}
/** 노트 목록 안의 "고치기" 링크 연결 */
export function bindNoteEdits(root, acct, L, done) {
  root.querySelectorAll('[data-ne]').forEach(el => el.onclick = e => { e.preventDefault(); const n = L.find(x => x.id === el.dataset.ne); if (n) noteForm(acct, n, done); });
}
/** 구글 지도 — 가게 위치 보기 · 길찾기 (앱 설치돼 있으면 구글 지도 앱으로 열림) */
export function gmapUrl(a, dir) {
  const q = a.lat && a.lng ? a.lat + ',' + a.lng : [a.store, a.addr, a.city, a.state, a.zip].filter(Boolean).join(', ');
  return dir ? 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(q) : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a.lat && a.lng ? q : [a.store, a.addr, a.city, a.state, a.zip].filter(Boolean).join(', '));
}
/** 주문 화면 등 — 📌 고정 · ⚠️ 주의 노트만 짧게 (없으면 비움) */
export async function fillPinned(elId, acct) {
  if (!acct) return;
  const L = (await loadNotes(acct)).filter(n => n.pin || n.kind === 'warn'); const el = $(elId);
  if (el && L.length) el.innerHTML = notesHtml(L, { limit: 3 });
}
