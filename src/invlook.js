/* ============================================================
 *  📄 인보이스 찾기 — 세일즈맨 (담당자도 씀)
 *    가게 이름 · 계정번호 → 가게 창 인보이스 탭 (인보이스 + AR 미결 + 수금이 한 곳에)
 *    인보이스 번호 → 인보이스 한 장 (인보이스 · AR 잔액 · 수금)
 *    내 담당 가게는 바로, 다른 세일즈맨 가게는 🔐 관리자 허락을 받은 동안만 (access.js)
 * ============================================================ */
import { $, esc, money, Router, debounce, bi, bt } from './ui.js';
import { searchAccounts, sortStores } from './accounts.js';
import { storeSheet, invDetail } from './store.js';
import { loadGrants, requestAccess, myRequests, reqStatus, untilTxt, mySm } from './access.js';

let S = null, Q = '';
export function register(state) { S = state; Router.on('invs', page); }
const isStaff = () => S.role !== 'salesman';
const looksInv = q => /^(A|P|W|CM)-?\d{3,}$/i.test(q.replace(/\s+/g, ''));
const normInv = q => { q = q.replace(/\s+/g, '').toUpperCase(); const m = q.match(/^(P|CM)(\d+)$/); return m ? m[1] + '-' + m[2].padStart(6, '0') : q; };   // SmartBee: P-007803 · CM-000161

async function page() {
  /* 허락은 다른 폰(관리자)에서 바뀜 — 화면을 열 때마다 새로 */
  if (S.DB.fresh) { S.DB.fresh('grants'); S.DB.fresh('invReq'); }
  await loadGrants(true);
  $('page').innerHTML = '<div class="card"><h2>📄 ' + bi('인보이스', 'Invoices') + '</h2>' +
    '<div class="muted">' + bt('가게 이름 · 계정번호 · 인보이스 번호로 찾으세요. 가게를 누르면 그 가게의 인보이스 전부와 미수금 · 수금이 한 화면에 나옵니다.', 'Search by store, account # or invoice #. A store shows all its invoices with A/R and payments.') + (isStaff() ? '' : ' ' + bt('다른 세일즈맨 가게는 🔐 관리자 허락을 받으면 볼 수 있습니다.', 'Other salesmen\'s stores need admin approval 🔐.')) + '</div>' +
    '<div style="display:flex;gap:6px;margin-top:10px"><input id="ivQ" placeholder="' + esc(bt('가게 · 계정 # · 인보이스 #', 'Store · Acct # · Invoice #')) + '" value="' + esc(Q) + '" autocomplete="off" autocapitalize="characters" style="flex:1"><button class="b-blue" id="ivGo" style="flex:0 0 auto;width:auto">' + bt('찾기', 'Search') + '</button></div></div>' +
    '<div id="ivOut"></div><div id="ivReqs"></div>';
  const run = () => { Q = $('ivQ').value; show(); };
  $('ivQ').oninput = debounce(run, 250); $('ivGo').onclick = run;
  $('ivQ').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const q = $('ivQ').value.trim(); if (looksInv(q)) invDetail(normInv(q)); else run(); } };
  show(); reqs();
}

async function show() {
  const out = $('ivOut'); if (!out) return;
  const q = Q.trim(), sm = mySm(), g = await loadGrants();
  const own = a => isStaff() || (sm && String(a.sm || '').toUpperCase() === sm);
  const badge = a => own(a) ? '' : g[a.acct] ? ' <span class="tag t-k">✅ ~' + esc(untilTxt(g[a.acct])) + '</span>' : ' <span class="tag t-g">🔒 ' + esc(a.sm || '') + '</span>';
  const row = a => '<div class="pr tap" data-ia="' + esc(a.acct) + '"><div class="ct"><b>' + esc(a.store) + badge(a) + '</b><small>' + esc(a.acct) + ' · ' + esc([a.city, a.state].filter(Boolean).join(', ')) + (a.sm ? ' · ' + esc(a.sm) : '') + '</small></div><div class="pa"><small>' + bt('인보이스', 'Invoices') + ' ›</small></div></div>';
  let h = '';
  if (q && looksInv(q)) h += '<div class="card"><button class="b-blue" id="ivNo">📄 ' + bt('인보이스', 'Invoice') + ' ' + esc(normInv(q)) + ' ' + bt('열기', 'open') + '</button></div>';
  if (q) {
    const hits = searchAccounts(S.accounts, q, 150);
    h += '<div class="card">' + (hits.length ? '<div class="muted" style="margin-bottom:4px">' + hits.total + bt('곳', ' stores') + '</div>' + hits.map(row).join('') : looksInv(q) ? '' : '<div class="none">' + bt('맞는 가게가 없습니다', 'No match') + '</div>') + '</div>';
  } else if (!isStaff()) {
    const mine = sortStores((S.accounts || []).filter(a => !a.inactive && String(a.sm || '').toUpperCase() === sm));
    const gr = Object.keys(g).map(k => S.accounts.byCode && S.accounts.byCode[k]).filter(Boolean);
    h += (gr.length ? '<div class="card"><h2 style="font-size:15px">✅ ' + bi('허락받은 가게', 'Approved stores') + '</h2>' + gr.map(row).join('') + '</div>' : '') +
      '<div class="card"><h2 style="font-size:15px">🏬 ' + bi('내 가게', 'My stores') + ' <span class="muted" style="font-weight:400">' + mine.length + '</span></h2>' + (mine.length ? mine.slice(0, 400).map(row).join('') : '<div class="none">' + bt('담당 가게가 없습니다 — 세일즈맨 코드를 확인하세요', 'No stores — check your salesman code') + '</div>') + '</div>';
  }
  out.innerHTML = h;
  if ($('ivNo')) $('ivNo').onclick = () => invDetail(normInv(q));
  out.querySelectorAll('[data-ia]').forEach(el => el.onclick = () => {
    const a = S.accounts.byCode[el.dataset.ia]; if (!a) return;
    if (own(a) || g[a.acct]) storeSheet(a.acct, null, 'invh');
    else requestAccess({ acct: a.acct }, reqs);
  });
}

async function reqs() {
  const box = $('ivReqs'); if (!box || isStaff()) return;
  const L = await myRequests(); if (!L.length) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="card"><h2 style="font-size:15px">🔐 ' + bi('내 조회 요청', 'My requests') + '</h2>' + L.map(r => '<div class="pr' + (r.st === 'ok' && Number(r.untilMs) > Date.now() && r.acct ? ' tap" data-ra="' + esc(r.acct) : '') + '"><div class="ct"><b>' + esc(r.store || r.no || r.acct) + '</b><small>' + esc(String(r.at || '').substring(5, 16).replace('T', ' ')) + (r.reason ? ' · ' + esc(r.reason) : '') + '</small></div><div class="pa">' + reqStatus(r) + '</div></div>').join('') + '</div>';
  box.querySelectorAll('[data-ra]').forEach(el => el.onclick = async () => { await loadGrants(true); storeSheet(el.dataset.ra, null, 'invh'); });
}
