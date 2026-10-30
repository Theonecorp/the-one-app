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
/** 가게 이름 ABC 순 (대소문자 무시 · 숫자는 크기대로: #2 < #10) */
const COLL = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
export const byStore = (a, b) => COLL.compare(String(a.store || ''), String(b.store || '')) || String(a.acct || '').localeCompare(String(b.acct || ''));
export const sortStores = L => L.slice().sort(byStore);
/** 가게 찾기 — 띄어쓴 단어가 모두 들어 있으면 맞음 (이름 · 도시 · 주 · 주소 · 번호 · 전화 · 세일즈맨), 이름이 앞부분부터 맞는 것 먼저.
 *  결과는 가게 이름 ABC 순 (계정코드를 정확히 치면 그 가게가 맨 위, 💤 비활성은 맨 뒤). limit 기본 200 — 짧은 단어로도 전체가 나오고, 돌려주는 배열에 total(전체 맞는 수) 을 붙임 */
export function searchAccounts(rows, q, limit) {
  q = String(q || '').trim(); if (!q) return [];
  const words = q.split(/\s+/).map(nz).filter(Boolean), qn = nz(q);
  const first = [], hit = [], loose = [];   // first = 계정코드가 정확히 맞는 곳 · hit = 단어가 모두 맞음 · loose = 일부만 맞음 (모두 맞는 곳이 없을 때만)
  if (/^\d{1,4}$/.test(q)) { const a = rows.byCode[pad4(q)]; if (a) first.push(a); }
  for (const a of rows) {
    if (first.includes(a)) continue;
    if (!a._all) { a._n = nz(a.store); a._c = nz(a.city); a._all = nz([a.store, a.city, a.state, a.addr, a.acct, a.tel, a.sm].filter(Boolean).join(' ')); }
    const n = words.filter(w => a._all.includes(w)).length;
    if (!n) continue;
    if (n === words.length) hit.push(a); else if (words.length > 1 && n * 2 >= words.length) loose.push(a);
  }
  /* 가까운 순 — 이름이 그대로 > 이름이 그렇게 시작 > 이름 안에 > 이름에 단어 전부(순서 다름) > 이름에 일부 + 나머지는 도시·주소 > 도시 > 그 밖(주소 · 전화 · 세일즈맨). 💤 비활성은 맨 뒤. 같은 급은 ABC
   *   'orlando' → ORLANDO BEAUTY 가 먼저, 그다음 ORLANDO 에 있는 가게들 */
  const score = a => {
    const nm = a._n != null ? a._n : nz(a.store), c = a._c != null ? a._c : nz(a.city);
    let s = 9;
    if (nm === qn) s = 0; else if (nm.indexOf(qn) === 0) s = 1; else if (nm.includes(qn)) s = 2;
    else if (words.every(w => nm.includes(w))) s = 3;
    else if (words.some(w => nm.includes(w))) s = 4;
    else if (c === qn || c.indexOf(qn) === 0) s = 5; else if (words.every(w => c.includes(w))) s = 6;
    else if (String(a.acct || '').includes(q)) s = 7;
    return s + (a.inactive ? 20 : 0);
  };
  const rank = (x, y) => score(x) - score(y) || byStore(x, y);
  hit.sort(rank); loose.sort(rank);
  const all = first.concat(hit, hit.length ? [] : loose), out = all.slice(0, limit || 200);
  out.total = all.length; out.loose = !hit.length && loose.length > 0;   // loose: 일부 단어만 맞는 결과 (화면에서 "비슷한 가게" 라고 알림)
  return out;
}
export function accountLabel(a) { return a ? a.store + (a.state ? ' (' + a.state + ')' : '') + (a.inactive ? ' 💤' : '') : ''; }
/** 💤 비활성 거래처 — 3년 동안 거래가 없어 목록에서 뺀 곳 (관리자 · 오피스가 정리, 다시 활성 가능) */
export const activeOnly = rows => rows.filter(a => !a.inactive);
