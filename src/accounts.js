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
  rows.forEach(a => { a.acct = pad4(a.acct || a.id); a._n = nz(a.store); a._c = nz(a.city); a._all = nz([a.store, a.city, a.state, a.addr, a.acct, a.tel, a.sm].filter(Boolean).join(' ')); });
  rows.byCode = {}; rows.forEach(a => { rows.byCode[a.acct] = a; });
  return rows;
}
/** 가게 이름 / 코드 / 도시로 찾기 — 글자 순서대로 포함 */
/** 가게 찾기 — 띄어쓴 단어가 모두 들어 있으면 맞음 (이름 · 도시 · 주 · 주소 · 번호 · 전화 · 세일즈맨), 이름이 앞부분부터 맞는 것 먼저.
 *  limit 기본 200 — 짧은 단어로도 전체가 나오고, 돌려주는 배열에 total(전체 맞는 수) 을 붙임 */
export function searchAccounts(rows, q, limit) {
  q = String(q || '').trim(); if (!q) return [];
  const words = q.split(/\s+/).map(nz).filter(Boolean), qn = nz(q);
  const first = [], rest = [], zz = [];   // zz = 💤 비활성 (맨 뒤)
  if (/^\d{1,4}$/.test(q)) { const a = rows.byCode[pad4(q)]; if (a) first.push(a); }
  for (const a of rows) {
    if (first.includes(a)) continue;
    if (!a._all) a._all = nz([a.store, a.city, a.state, a.addr, a.acct, a.tel, a.sm].filter(Boolean).join(' '));
    if (!words.every(w => a._all.includes(w))) continue;
    (a.inactive ? zz : a._n.startsWith(qn) || a._n.startsWith(words[0]) ? first : rest).push(a);
  }
  const all = first.concat(rest, zz), out = all.slice(0, limit || 200);
  out.total = all.length;
  return out;
}
export function accountLabel(a) { return a ? a.store + (a.state ? ' (' + a.state + ')' : '') + (a.inactive ? ' 💤' : '') : ''; }
/** 💤 비활성 거래처 — 3년 동안 거래가 없어 목록에서 뺀 곳 (관리자 · 오피스가 정리, 다시 활성 가능) */
export const activeOnly = rows => rows.filter(a => !a.inactive);
