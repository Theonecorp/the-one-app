/* ============================================================
 *  미수금 = 올린 AR (이전 시스템, 기준일) + 앱에서 발행한 인보이스 중 아직 덜 받은 것
 *    앱 인보이스 잔액 = bal (담당자가 수금 확인 · COD 로 넣은 돈은 이미 빠짐) − 아직 확인 전인 수금 입력
 *    → 앱을 쓰면서 쌓이는 인보이스 · 수금으로 미수금이 저절로 맞춰짐 (AR 을 다시 올리지 않아도)
 *  돌려준 AR 의 앱 인보이스 줄에는 app: true — 쓰는 쪽은 그 줄에서 수금을 다시 빼지 않음
 * ============================================================ */
import { R2, num, today, daysBetween, invNo } from './ui.js';
import { termDays } from './invoicing.js';

/** ar: { asOf, stores: [{ acct, store, sm, total, invs: [{ inv, d, amt, bal, pdd, bk }] }] } · invs: 인보이스 문서 · ents: 수금 입력 */
export function mergeAppInvoices(ar, invs, ents) {
  const out = Object.assign({ asOf: '', stores: [] }, ar || {});
  out.stores = (out.stores || []).map(s => Object.assign({}, s, { invs: (s.invs || []).slice() }));
  const by = {}, have = new Set();
  out.stores.forEach(s => { by[s.acct] = s; s.invs.forEach(v => have.add(invNo(v.inv))); });
  const unv = {};   // 인보이스 번호 → [[수금 id, 금액]]
  (ents || []).forEach(e => { if (e.void || e.repl) return; (e.invs || []).forEach(v => { if (v.no) (unv[invNo(v.no)] = unv[invNo(v.no)] || []).push([e.id, num(v.amt)]); }); });
  let n = 0;
  (invs || []).forEach(x => {
    if (!x || x.src === 'legacy' || x.st !== 'open' || have.has(invNo(x.no))) return;
    const pays = x.pays || {}, extra = (unv[invNo(x.no)] || []).filter(p => !(p[0] in pays)).reduce((a, p) => a + p[1], 0);
    const bal = R2((x.bal != null ? x.bal : x.total) - extra); if (Math.abs(bal) < 0.005) return;
    const pdd = Math.max(0, daysBetween(x.d, today()) - termDays(x.terms || 'N30')), bk = pdd <= 0 ? 0 : pdd <= 30 ? 1 : pdd <= 60 ? 2 : pdd <= 90 ? 3 : 4;
    let s = by[x.acct];
    if (!s) { s = by[x.acct] = { acct: x.acct, store: x.store, sm: x.sm, total: 0, invs: [] }; out.stores.push(s); }
    s.invs.push({ inv: x.no, d: x.d, amt: x.total, bal, pdd, bk, app: true });
    s.total = R2((s.total || 0) + bal); n++;
  });
  out.appN = n;
  return out;
}
