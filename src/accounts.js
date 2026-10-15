/* ============================================================
 *  거래처 목록 — 2,500개를 매번 읽지 않도록 폰에 저장해 두고, 버전이 바뀔 때만 다시 읽음
 *  accounts/{acct} = { acct, store, addr, city, state, zip, tel, sm, note, terms, email, ver }
 *  settings/app.accountsVer 가 바뀌면 전부 다시 받습니다 (가져오기·일괄 수정 때 올림)
 * ============================================================ */
import { nz, pad4 } from './ui.js';
const LS_KEY = 'theone.accounts.v1';

export async function loadAccounts(S) {
  const ver = String(S.settings.accountsVer || '0');
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) {}
  if (cached && cached.ver === ver && Array.isArray(cached.rows)) return index(cached.rows);
  const rows = await S.DB.list('accounts');
  try { localStorage.setItem(LS_KEY, JSON.stringify({ ver, rows })); } catch (e) {}
  return index(rows);
}
export function dropAccountCache() { try { localStorage.removeItem(LS_KEY); } catch (e) {} }

function index(rows) {
  rows.forEach(a => { a.acct = pad4(a.acct || a.id); a._n = nz(a.store); a._c = nz(a.city); });
  rows.byCode = {}; rows.forEach(a => { rows.byCode[a.acct] = a; });
  return rows;
}
/** 가게 이름 / 코드 / 도시로 찾기 — 글자 순서대로 포함 */
export function searchAccounts(rows, q, limit) {
  q = String(q || '').trim(); if (!q) return [];
  const qn = nz(q), out = [];
  if (/^\d{1,4}$/.test(q)) { const a = rows.byCode[pad4(q)]; if (a) out.push(a); }
  for (const a of rows) {
    if (out.length >= (limit || 12)) break;
    if (out.includes(a)) continue;
    if (a._n.includes(qn) || (a.acct && a.acct.includes(q)) || (qn.length >= 3 && a._c.includes(qn))) out.push(a);
  }
  return out;
}
export function accountLabel(a) { return a ? a.store + (a.state ? ' (' + a.state + ')' : '') : ''; }
