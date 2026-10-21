/* ============================================================
 *  💤 비활성 거래처 — 최근 3년 동안 거래가 한 번도 없는 가게를 목록에서 빼서 따로 둠
 *    거래 = 인보이스(이전 시스템 + 앱) · 수금 · COD/카드/ACH · 앱 주문 · AR(미결 인보이스 · 마지막 입금)
 *    빼지 않는 곳: 아직 받을 돈(AR 잔액)이 있는 곳 · 3년 안에 새로 만든 곳 · 직접 "다시 활성" 한 곳(keepActive)
 *    accounts.{ inactive, inactiveAt, inactiveBy, lastTx } — 앱에서 인보이스를 발행하면 자동으로 다시 활성
 * ============================================================ */
import { $, esc, money, toast, busy, openModal, closeModal, confirmBox, addDays, today, bi, bt, sortBy } from './ui.js';

let S = null;
export function register(state) { S = state; }
export const YEARS = 3;

/** 거래처마다 마지막 거래일 찾기 → { cutoff, last:{acct:date}, owe:{acct:bal}, oldest, cand:[accounts] } */
export async function scanInactive(progress) {
  const cutoff = addDays(today(), -Math.round(YEARS * 365.25));
  const last = {}, owe = {};
  const see = (acct, d) => { if (!acct || !d) return; d = String(d).substring(0, 10); if (!last[acct] || d > last[acct]) last[acct] = d; };
  const step = m => { if (progress) progress(m); };
  step(bt('인보이스 읽는 중…', 'Reading invoices…'));
  const invs = await S.DB.list('invoices', { where: [['d', '>=', cutoff]] });
  invs.forEach(x => { if (x.st !== 'x') see(x.acct, x.d); });
  let oldest = '';
  try { const o = await S.DB.list('invoices', { order: ['d', 'asc'], limit: 1 }); oldest = o[0] ? o[0].d : ''; } catch (e) {}
  step(bt('수금 · COD 읽는 중…', 'Reading payments…'));
  const [ents, cods, ords] = await Promise.all([
    S.DB.list('entries', { where: [['d', '>=', cutoff]] }).catch(() => []),
    S.DB.list('cod', { where: [['d', '>=', cutoff]] }).catch(() => []),
    S.DB.list('orders', { where: [['d', '>=', cutoff]] }).catch(() => [])]);
  ents.forEach(e => { if (!e.void) see(e.acct, e.d); });
  cods.forEach(c => see(c.acct, c.d));
  ords.forEach(o => { if (o.st !== 'x' && o.st !== 'draft') see(o.acct, o.d); });
  step(bt('미수금(AR) 읽는 중…', 'Reading A/R…'));
  try {
    const ars = await S.DB.list('ar');
    ars.forEach(doc => (doc.stores || []).forEach(st => {
      (st.invs || []).forEach(v => see(st.acct, v.d));
      if (st.lastPaid) see(st.acct, typeof st.lastPaid === 'object' ? st.lastPaid.d : st.lastPaid);
      if ((st.total || 0) > 0.005) owe[st.acct] = (owe[st.acct] || 0) + st.total;
    }));
  } catch (e) {}
  const cand = S.accounts.filter(a => !a.inactive && !a.keepActive && !owe[a.acct] && !(a.createdAt && String(a.createdAt).substring(0, 10) >= cutoff) && !(last[a.acct] && last[a.acct] >= cutoff));
  return { cutoff, last, owe, oldest, cand, nInv: invs.length };
}

/** 관리자 · 오피스: 미리 보고 → 비활성으로 옮기기 */
export async function inactiveTool(done) {
  openModal('<h2>💤 ' + bi('비활성 거래처 정리', 'Inactive accounts') + '</h2><div id="izOut"><div class="load">' + bt('읽는 중…', 'Loading…') + '</div></div>');
  let r;
  try { r = await scanInactive(m => { const o = $('izOut'); if (o) o.innerHTML = '<div class="load">' + esc(m) + '</div>'; }); }
  catch (e) { if ($('izOut')) $('izOut').innerHTML = '<div class="alert a-red">' + esc(e.code || e.message) + '</div>'; return; }
  if (!$('izOut')) return;
  const L = sortBy(r.cand, a => r.last[a.acct] || '0000', true), short = r.oldest && r.oldest > r.cutoff;
  $('izOut').innerHTML = '<div class="muted">' + bt('기준', 'Since') + ' <b>' + esc(r.cutoff) + '</b> (' + YEARS + bt('년', ' years') + ') — ' + bt('인보이스 · 수금 · COD · 앱 주문 · 미수금(AR) 중 하나도 없는 가게', 'no invoice, payment, COD, order or A/R since then') + '</div>' +
    (short ? '<div class="alert a-amb">⚠️ ' + bt('앱에 들어온 인보이스 기록이', 'Invoice history in the app starts') + ' <b>' + esc(r.oldest) + '</b> ' + bt('부터라 3년을 다 보지 못합니다. 그 전 거래만 있던 가게도 비활성으로 잡힐 수 있으니 목록을 확인하세요 (관리 → 📥 가져오기에서 이전 시스템 인보이스 목록을 더 올리면 정확해집니다).', '— older history is missing, so check the list (import more of the old invoice list to be exact).') + '</div>' : '') +
    '<div class="kpi" style="grid-template-columns:repeat(3,1fr);margin:8px 0"><div><b>' + S.accounts.filter(a => !a.inactive).length + '</b><span>' + bt('지금 활성', 'Active now') + '</span></div><div><b class="warn">' + L.length + '</b><span>' + bt('3년 거래 없음', 'No activity') + '</span></div><div><b>' + S.accounts.filter(a => a.inactive).length + '</b><span>' + bt('이미 비활성', 'Already inactive') + '</span></div></div>' +
    '<div class="muted" style="font-size:12px">' + bt('빼지 않음: 미수금이 남은 곳 · 3년 안에 만든 곳 · 직접 다시 활성한 곳', 'Kept: stores that still owe money, created recently, or re-activated by hand') + '</div>' +
    '<div style="max-height:42vh;overflow:auto;margin-top:6px">' + (L.length ? L.slice(0, 400).map(a => '<label class="pick on" style="margin-top:4px"><input type="checkbox" class="ck-big" data-iz="' + esc(a.acct) + '" checked><span class="pm"><b>' + esc(a.store) + '</b><small>' + esc(a.acct) + ' · ' + esc([a.city, a.state].filter(Boolean).join(', ')) + (a.sm ? ' · ' + esc(a.sm) : '') + ' · ' + (r.last[a.acct] ? bt('마지막 거래', 'last activity') + ' ' + esc(r.last[a.acct]) : bt('3년 안 거래 없음', 'none in 3 years')) + '</small></span></label>').join('') + (L.length > 400 ? '<div class="hint">+' + (L.length - 400) + '</div>' : '') : '<div class="none">' + bt('뺄 거래처가 없습니다', 'Nothing to move') + '</div>') + '</div>' +
    '<div class="btns"><button class="b-ghost" id="izX">' + bt('닫기', 'Close') + '</button>' + (L.length ? '<button class="b-blue" id="izGo">💤 ' + bt('체크한 곳 비활성으로', 'Move checked to inactive') + '</button>' : '') + '</div>';
  $('izX').onclick = closeModal;
  if ($('izGo')) $('izGo').onclick = async () => {
    const pick = new Set(Array.from(document.querySelectorAll('[data-iz]:checked')).map(x => x.dataset.iz));
    const go = L.filter(a => pick.has(a.acct)).concat(L.slice(400));   // 400 넘는 것은 목록에 안 보였지만 같이
    if (!go.length) return toast(bt('체크한 곳이 없습니다', 'Nothing checked'), 'bad');
    if (!(await confirmBox(go.length + bt('곳을 비활성으로 옮길까요? 목록 · 지도 · 가게 찾기에서 빠지고 💤 비활성 탭에 모입니다. 언제든 다시 활성할 수 있습니다.', ' accounts → inactive? They leave the lists and map and can be re-activated any time.'), '💤 OK'))) return inactiveTool(done);
    busy(true);
    try {
      const now = new Date().toISOString();
      await S.DB.batch(go.map(a => ({ op: 'update', col: 'accounts', id: a.acct, data: { inactive: true, inactiveAt: now, inactiveBy: S.user.email, lastTx: r.last[a.acct] || '' } })));
      const { bumpAccountsVer } = await import('./mgr.js'); await bumpAccountsVer();
      toast('💤 ' + go.length + ' ' + bt('곳 비활성', 'moved to inactive'), 'good'); closeModal(); if (done) done();
    } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}
/** 다시 활성 — 다음 정리 때 다시 빠지지 않게 keepActive */
export async function reactivate(acct, done) {
  const a = S.accounts.byCode[acct]; if (!a) return;
  if (!(await confirmBox(a.store + ' — ' + bt('다시 활성으로 돌릴까요?', 'make active again?'), bt('다시 활성', 'Re-activate')))) return;
  busy(true);
  try { await S.DB.update('accounts', acct, { inactive: false, keepActive: true, reactAt: new Date().toISOString(), reactBy: S.user.email }); const { bumpAccountsVer } = await import('./mgr.js'); await bumpAccountsVer(); toast('✅ ' + a.store, 'good'); if (done) done(); }
  catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
  busy(false);
}
