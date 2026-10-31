/* ============================================================
 *  📄 인보이스 찾기 — 세일즈맨 (담당자도 씀)
 *    가게 이름 · 계정번호 → 가게 창 인보이스 탭 (인보이스 + AR 미결 + 수금이 한 곳에)
 *    인보이스 번호 → 인보이스 한 장 (인보이스 · AR 잔액 · 수금)
 *    내 담당 가게는 바로, 다른 세일즈맨 가게는 🔐 관리자 허락을 받은 동안만 (access.js)
 * ============================================================ */
import { $, esc, money, md, Router, debounce, bi, bt, sortInv, invParts, invNo, itabs } from './ui.js';
import { searchAccounts, sortStores } from './accounts.js';
import { storeSheet, invDetail } from './store.js';
import { invByDigits } from './invoicing.js';
import { loadGrants, requestAccess, myRequests, reqStatus, untilTxt, mySm } from './access.js';

let S = null, Q = '', IVM = 'date', IDESC = false, IST = '';   // IVM: 📅 최근 · 🏷 종류별 · 🏙 지역별 · 🏬 가게별 (IST: 지역별에서 고른 주)
export function register(state) { S = state; Router.on('invs', page); }
const isStaff = () => S.role !== 'salesman';
const looksInv = q => /^(A|P|W|CM)-?\d{3,}$/i.test(q.replace(/\s+/g, ''));
const normInv = q => invNo(q);   // 🔢 A-043350 · P-007803 · CM-000161

async function page() {
  if (isStaff()) { const { invTab } = await import('./orders.js'); return invTab(); }   // 담당자 · 관리자: 전체 인보이스 (기간별)
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
  /* 📊 가게 표 (코드 · 가게 · 도시, 주 · 담당 · 권한) — 줄을 누르면 그 가게 인보이스 */
  const row = a => '<tr class="tap" data-ia="' + esc(a.acct) + '"><td><b>' + esc(a.acct) + '</b></td><td class="ct wrap" style="min-width:140px"><b>' + esc(a.store) + '</b>' + badge(a) + '</td><td class="sub0">' + esc([a.city, a.state].filter(Boolean).join(', ')) + '</td><td class="hs">' + (a.sm ? '<span class="tag t-x">' + esc(a.sm) + '</span>' : '') + '</td><td class="r sub0">' + bt('인보이스', 'Invoices') + ' ›</td></tr>';
  const aTbl = L => '<div class="dtw"><table class="dt"><thead><tr><th>' + bt('코드', 'Code') + '</th><th>' + bt('가게', 'Store') + '</th><th>' + bt('도시, 주', 'City, State') + '</th><th class="hs">' + bt('담당', 'Rep') + '</th><th></th></tr></thead><tbody>' + L.map(row).join('') + '</tbody></table></div>';
  const iTbl = rowsHtml => '<div class="dtw"><table class="dt itbl"><thead><tr><th style="width:124px">' + bt('인보이스', 'Invoice') + '</th><th style="width:52px">' + bt('날짜', 'Date') + '</th><th>' + bt('가게', 'Store') + '</th><th class="hs" style="width:70px">' + bt('코드', 'Acct') + '</th><th class="r" style="width:88px">' + bt('합계', 'Total') + '</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
  let h = '';
  if (q && looksInv(q)) h += '<div class="card"><button class="b-blue" id="ivNo">📄 ' + bt('인보이스', 'Invoice') + ' ' + esc(normInv(q)) + ' ' + bt('열기', 'open') + '</button></div>';
  /* 🔢 숫자만 쳤을 때 (43350 · 7803) — 그 번호의 인보이스가 A · P · W · CM 어디에 있든 찾아 줌 (4자리면 계정코드와 같이 나옴) */
  let digitInv = []; if (q && /^\d{3,6}$/.test(q)) { try { digitInv = await invByDigits(S, q); } catch (e) {} }
  if (digitInv.length) h += '<div class="card"><div class="muted" style="margin-bottom:4px">📄 ' + bt('인보이스 번호로 찾음', 'Invoices with this number') + '</div>' + digitInv.map(c => '<div class="pr tap" data-ivd="' + esc(c.no) + '"><div class="ct"><b>' + esc(c.no) + '</b><small>' + esc(c.inv.store || c.inv.acct || '') + ' · ' + esc(md(c.inv.d)) + (c.inv.st === 'x' ? ' · VOID' : '') + '</small></div><div class="pa"><b>' + money(c.inv.total || 0) + '</b></div></div>').join('') + '</div>';
  if (q) {
    const hits = searchAccounts(S.accounts, q, 150);
    h += '<div class="card">' + (hits.length ? '<div class="muted" style="margin-bottom:4px">' + hits.total + bt('곳', ' stores') + '</div>' + aTbl(hits) : looksInv(q) ? '' : '<div class="none">' + bt('맞는 가게가 없습니다', 'No match') + '</div>') + '</div>';
  } else if (!isStaff() && IVM !== 'store') {
    /* 📅 내 인보이스 — 최근 3달. 묶음: 날짜별(기본) · 🏷 종류별(A · P · W) · 🏙 지역별(주 › 도시) */
    const yms = []; const d0 = new Date(); for (let i = 0; i < 3; i++) { yms.push(d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0')); d0.setMonth(d0.getMonth() - 1); }
    let L = [], byStore = false; try { L = await S.DB.list('invoices', { where: [['sm', '==', sm], ['ym', 'in', yms]] }); } catch (e) {}
    /* 세일즈맨 코드로 하나도 없으면 — 이전 시스템 인보이스의 코드가 다를 수 있으니 내 가게(계정코드) 기준으로 (가게마다 한 번씩, 규칙은 가게 담당으로 통과) */
    if (!L.length && sm) { const mine = (S.accounts || []).filter(a => !a.inactive && String(a.sm || '').toUpperCase() === sm).slice(0, 150); for (let i = 0; i < mine.length; i += 10) { const part = await Promise.all(mine.slice(i, i + 10).map(a => S.DB.list('invoices', { where: [['acct', '==', a.acct], ['ym', 'in', yms]] }).catch(() => []))); part.forEach(x => { L = L.concat(x); }); } byStore = L.length > 0; }
    L = sortInv(L.filter(x => x.st !== 'x'), x => x.no, IDESC);   // 인보이스 번호 순
    const accOf = x => (S.accounts.byCode && S.accounts.byCode[x.acct]) || null, stOf = x => { const a = accOf(x); return String((a && a.state) || '').toUpperCase() || '—'; }, ctOf = x => { const a = accOf(x); return String((a && a.city) || '').toUpperCase() || '—'; };
    let chips = '';
    if (IVM === 'geo') {
      const byS = {}; L.forEach(x => { const k = stOf(x); byS[k] = (byS[k] || 0) + 1; }); if (IST && !byS[IST]) IST = '';
      chips = '<div class="chips"><button class="' + (IST ? '' : 'on') + '" data-ist="">' + bi('전체', 'All') + ' ' + L.length + '</button>' + Object.keys(byS).sort().map(k => '<button class="' + (IST === k ? 'on' : '') + '" data-ist="' + esc(k) + '">' + esc(k) + ' <span class="en">' + byS[k] + '</span></button>').join('') + '</div>';
      if (IST) L = L.filter(x => stOf(x) === IST);
    }
    const keyOf = IVM === 'type' ? x => (x.t || invParts(x.no)[0]) : IVM === 'geo' ? (IST ? ctOf : stOf) : x => String(x.d || '').substring(0, 10);
    const G = {}; L.forEach(x => { const k = keyOf(x); (G[k] = G[k] || []).push(x); });
    const keys = Object.keys(G).sort(); if (IVM === 'date') keys.reverse();
    const lab = k => IVM === 'type' ? '🏷 ' + esc(k) : IVM === 'geo' ? '🏙 ' + esc(k) : '📅 ' + esc(md(k));
    h += chips + '<div class="card">' + (L.length ? '<div class="muted">' + bt('최근 3달', 'Last 3 months') + ' · ' + L.length + bt('장', '') + ' · ' + money(L.reduce((a, x) => a + (x.total || 0), 0)) + ' · <a href="#" id="ivSort" onclick="return false">' + (IDESC ? bt('번호 큰 것부터 ↓', 'Highest # first ↓') : bt('번호 작은 것부터 ↑', 'Lowest # first ↑')) + '</a>' + (byStore ? ' · <span class="warn">' + bt('내 가게 기준', 'by my stores') + '</span>' : '') + '</div>' + iTbl(keys.map(k => { const X = G[k]; return '<tr class="grp"><td colspan="5"><div class="gline"><b>' + lab(k) + '</b><span>' + X.length + ' · ' + money(X.reduce((a, x) => a + (x.total || 0), 0)) + '</span></div></td></tr>' + X.map(x => '<tr class="tap" data-in="' + esc(x.no) + '" data-inacct="' + esc(x.acct || '') + '"><td><b>' + esc(x.no) + '</b> <span class="tag t-g">' + esc(x.t || '') + '</span></td><td>' + esc(md(x.d)) + '</td><td class="wrap" style="min-width:130px">' + esc(x.store || '') + (IVM === 'geo' ? '<div class="sub0">' + esc(ctOf(x)) + ', ' + esc(stOf(x)) + '</div>' : '') + '</td><td class="hs sub0">' + esc(x.acct || '') + '</td><td class="r"><b>' + money(x.total) + '</b></td></tr>').join(''); }).join('')) : '<div class="none">' + bt('최근 3달 인보이스가 없습니다', 'No invoices in the last 3 months') + '</div>') + '</div>';
  } else if (!isStaff()) {
    const mine = sortStores((S.accounts || []).filter(a => !a.inactive && String(a.sm || '').toUpperCase() === sm));
    const gr = Object.keys(g).map(k => S.accounts.byCode && S.accounts.byCode[k]).filter(Boolean);
    h += (gr.length ? '<div class="card"><h2 style="font-size:15px">✅ ' + bi('허락받은 가게', 'Approved stores') + '</h2>' + aTbl(gr) + '</div>' : '') +
      '<div class="card"><h2 style="font-size:15px">🏬 ' + bi('내 가게', 'My stores') + ' <span class="muted" style="font-weight:400">' + mine.length + '</span></h2>' + (mine.length ? aTbl(mine.slice(0, 400)) : '<div class="none">' + bt('담당 가게가 없습니다 — 세일즈맨 코드를 확인하세요', 'No stores — check your salesman code') + '</div>') + '</div>';
  }
  out.innerHTML = (!q && !isStaff() ? itabs([['date', '📅', '최근', 'Recent'], ['type', '🏷', '종류별', 'By type'], ['geo', '🏙', '지역별', 'By region'], ['store', '🏬', '가게별', 'By store']], IVM, 'ivm') : '') + h;
  out.querySelectorAll('[data-ivm]').forEach(b => b.onclick = () => { IVM = b.dataset.ivm; show(); });
  out.querySelectorAll('[data-ist]').forEach(b => b.onclick = () => { IST = b.dataset.ist; show(); });
  if ($('ivSort')) $('ivSort').onclick = e => { e.preventDefault(); IDESC = !IDESC; show(); };
  out.querySelectorAll('[data-in]').forEach(el => el.onclick = () => invDetail(el.dataset.in, el.dataset.inacct));
  if ($('ivNo')) $('ivNo').onclick = () => invDetail(normInv(q));
  out.querySelectorAll('[data-ivd]').forEach(el => el.onclick = () => invDetail(el.dataset.ivd));
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
