/* ============================================================
 *  담당자(회계) 화면 — 수금 확인(① 접수 확인 · ② 체크 수령) · COD/카드/ACH 입력 · ACH · 거래처 · AR 올리기
 * ============================================================ */
import { invTypes, getInvoice } from './invoicing.js';
import { $, esc, money, num, R2, today, ym, md, dlabel, toast, busy, openModal, closeModal, confirmBox, Router, inputDate, sel, sum, sortBy, groupBy, pad4, nz, daysBetween, debounce, hasWords, bi, bt, invNo } from './ui.js';
import { newId } from './db.js';
import { searchAccounts, dropAccountCache, activeOnly, sortStores } from './accounts.js';
import { inactiveTool, reactivate, register as regInactive } from './inactive.js';
import { invType } from './comm.js';
import { stageText } from './sales.js';
import { storeSheet } from './store.js';
import { renderMap, nearMe, smColor } from './map.js';

let S = null;
export function register(state) {
  Router.up.stores = arg => { if (arg) return false; if (STM.city) { STM.city = ''; pageStores(); return true; } if (STM.state) { STM.state = ''; pageStores(); return true; } return false; };
  Router.upHas.stores = () => !!(STM.city || STM.state);
  S = state; regInactive(state);
  Router.on('verify', pageVerify); Router.on('cod', pageCod); Router.on('stores', pageStores); Router.on('arup', pageArUp);
}
function recentYms(n) { const out = [], d = new Date(); for (let i = 0; i < n; i++) { out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); d.setMonth(d.getMonth() - 1); } return out; }
function smOptions(v, allowBlank) { return (allowBlank ? [['', '— 세일즈맨 —']] : []).concat(S.sms.filter(x => x.active !== false).map(x => [x.code, x.code])); }
function methodTag(p) { return p.m === 'CHECK' ? '#' + esc(p.ref) : p.m === 'CASH' ? '캐쉬' : 'Zelle'; }

/* ============================================================
 *  ① 확인 — 세일즈맨이 넣은 수금을 보며 ① 접수 확인, 실물 체크 오면 수령 ✓
 * ============================================================ */
let VF = { f: 'todo', sm: '', q: '', grp: 'sm', acct: '' };
const VSEL = new Set();   // ☑ 체크해서 한 번에 ① 접수 확인 · ② 체크 수령
/* ---- 앱 인보이스에 입금 반영 (이전 시스템 입력을 대신함) ----
 *  invoices/{no}.pays = { [수금 id]: 금액 } · bal = total − Σpays  — 같은 수금을 두 번 넣어도 한 번만 잡힘, 취소하면 되돌아옴 */
export async function applyToInvoices(key, invs, on) {
  let n = 0;
  for (const v of (invs || [])) {
    const no = invNo(v.no); if (!no) continue;
    let inv = null; try { inv = await getInvoice(S, no); } catch (e) {}
    if (!inv || inv.st === 'x') continue;
    const pays = Object.assign({}, inv.pays || {});
    if (on) pays[key] = R2(num(v.amt)); else delete pays[key];
    const paid = R2(Object.values(pays).reduce((a, x) => a + (Number(x) || 0), 0));
    try { await S.DB.update('invoices', inv.id || no, { pays, paid, bal: R2(Math.max(0, (inv.total || 0) - paid)), paidAt: on ? today() : inv.paidAt || '' }); n++; } catch (e) {}
  }
  return n;
}
async function pageVerify() {
  $('page').innerHTML = '<div class="load">읽는 중…</div>';
  let rows = await S.DB.list('entries', { where: [['ym', 'in', recentYms(3)]] });
  rows = rows.filter(r => !r.void);
  const open = rows.filter(r => !r.settled);
  const todo = open.filter(r => !r.sb), wait = open.filter(r => r.sb && !r.rc), bad = open.filter(r => r.mismatch && !r.v), done = rows.filter(r => r.settled);
  let list = VF.f === 'todo' ? todo : VF.f === 'wait' ? wait : VF.f === 'bad' ? bad : VF.f === 'done' ? done : open;
  if (VF.sm) list = list.filter(r => r.sm === VF.sm);
  if (VF.q) { list = list.filter(r => hasWords(r.store + ' ' + r.acct + ' ' + (r.sm || ''), VF.q) || (r.pays || []).some(p => String(p.ref).includes(VF.q.trim()))); }
  list = sortBy(list, r => r.d + (r.createdAt || ''), true);
  const tdy = rows.filter(r => r.d === today());
  const accs = VF.q && !/^\d{5,}$/.test(VF.q.trim()) ? searchAccounts(S.accounts, VF.q, 6) : [];
  let h = '<div class="kpi" style="margin:0 0 10px">' + [['todo', '① 접수 확인 대기', todo.length, 'To review'], ['wait', '② 체크 수령 대기', wait.length, 'Awaiting check'], ['bad', '⚠️ 차액', bad.length, 'Mismatch'], ['all', '오늘 수금', money(sum(tdy, r => r.total)), 'Today ' + tdy.length]].map(c => '<div class="tap' + (VF.f === c[0] ? ' on' : '') + '" data-vf="' + c[0] + '" style="' + (VF.f === c[0] ? 'background:var(--blue2);outline:2px solid var(--blue)' : '') + '"><b>' + c[2] + '</b><span>' + c[1] + '<br><i class="en">' + c[3] + '</i></span></div>').join('') + '</div>' +
    '<div class="card"><h2>💵 수금 확인 <span class="en">Payment review</span></h2>' +
    '<div class="muted">세일즈맨이 넣은 수금을 보고 <b>① 접수 확인</b>(내용이 맞고 앱 인보이스에 입금 반영) → 실물 체크가 오면 <b>② 체크 수령</b> → 루크가 ③ 정산. COD · 카드는 💳 탭. <span class="en">Review → check received → settled by Luke.</span></div>' +
    '<div class="two" style="margin-top:8px">' + sel('vfSm', [['', '전체 세일즈맨 · All salesmen']].concat(smOptions()), VF.sm) + '<input id="vfQ" placeholder="가게 · 계정 · 체크번호 / Store · Acct · Check #" value="' + esc(VF.q) + '" autocomplete="off"></div>' +
    (accs.length ? '<div class="chips">' + accs.map(a => '<button data-vacc="' + esc(a.acct) + '">📚 ' + esc(a.store) + ' ' + esc(a.acct) + ' 전체 기록</button>').join('') + '</div>' : '') +
    '<div class="chips" style="margin-top:4px"><button class="' + (VF.grp === 'sm' ? 'on' : '') + '" data-vg="sm">👤 세일즈맨별 · By salesman</button><button class="' + (VF.grp === 'day' ? 'on' : '') + '" data-vg="day">📅 날짜별 · By day</button><button class="' + (VF.f === 'done' ? 'on' : '') + '" data-vf="done">📁 정산 완료 · Settled</button></div></div>' +
    /* 📬 체크 맞추기 — 우편으로 온 체크 번호를 치면 그 수금을 찾아 수령 ✓ */
    '<div class="card" style="border:2px solid #bfdbfe"><h2>📬 들어온 체크 맞추기 <span class="en">Match incoming checks</span></h2><div class="muted">봉투에서 꺼낸 체크 번호를 치고 엔터 — 세일즈맨이 입력한 수금을 찾아 바로 <b>② 체크 수령 ✓</b>. 금액이 다르면 알려 줍니다. <span class="en">Type the check number + Enter.</span></div>' +
    '<div class="two" style="margin-top:8px;grid-template-columns:1fr auto"><input id="ckNo" inputmode="numeric" placeholder="체크 번호 · check #" autocomplete="off"><input id="ckAmt" inputmode="decimal" placeholder="금액 (선택)" style="width:120px"></div><div id="ckOut"></div></div>';
  const row = r => '<div class="pr tap ' + (r.v ? 'v' : r.rc ? 'rc' : r.sb ? 'sb' : '') + (r.mismatch && !r.v ? ' bad' : '') + '" data-vid="' + r.id + '">' + (!r.settled && !(r.sb && r.rc) ? '<input type="checkbox" class="vck" data-vck="' + r.id + '"' + (VSEL.has(r.id) ? ' checked' : '') + ' style="width:22px;height:22px;margin-right:8px;flex:0 0 auto">' : '') + '<div class="mk">' + (r.rc ? '✓' : r.sb ? '①' : '·') + '</div><div class="ct"><b>' + esc(r.sm) + ' · ' + esc(r.store) + (r.repl ? ' <span class="tag t-r">대체</span>' : '') + (r.newStore ? ' <span class="tag t-c">신규</span>' : '') + '</b><small>' + md(r.d) + ' · ' + (r.pays || []).map(p => methodTag(p) + ' ' + money(p.amt)).join(' · ') + (r.invs && r.invs.length ? ' · ' + r.invs.map(v => v.no).join(',') : '') + (r.mismatch ? ' · ⚠️' : '') + (r.settled ? ' · 📁 ' + esc(r.settled) : '') + '</small></div><div class="pa"><b>' + money(r.total) + '</b><small>' + stageText(r) + '</small></div></div>';
  if (!list.length) h += '<div class="card"><div class="none">없음 · none</div></div>';
  else if (VF.grp === 'sm' && VF.f !== 'done') {
    const by = groupBy(list, r => r.sm || '—');
    Object.keys(by).sort().forEach(sm => { const L = by[sm], t = L.filter(r => !r.sb).length, w = L.filter(r => r.sb && !r.rc).length;
      h += '<div class="card smgrp"><div class="iday tap" data-smhd="' + esc(sm) + '" style="background:#e0e7ff;margin-top:0"><b>👤 ' + esc(sm) + '</b><span>' + L.length + '건 · ' + money(sum(L, r => r.total)) + (t ? ' · <span class="warn">접수 확인 ' + t + '</span>' : '') + (w ? ' · 체크 대기 ' + w : '') + ' ▾</span></div><div class="smbody">' + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0"><button class="b-ghost b-sm" data-vckall="' + esc(sm) + '">☑ ' + esc(sm) + ' 전체 선택 · Select all</button>' + (t ? '<button class="b-ghost b-sm" data-sball="' + esc(sm) + '">✓ 접수 확인 대기 ' + t + '건 모두 확인 · Review all</button>' : '') + '</div>' + L.map(row).join('') + '</div></div>'; });
  } else {
    const by = groupBy(list, r => r.d), days = Object.keys(by).sort().reverse();
    days.forEach(d => { const L = by[d]; h += '<div class="card"><div class="dayhd"><span>' + dlabel(d) + ' <button class="b-ghost b-sm" data-vckday="' + d + '" style="margin-left:6px;padding:3px 8px">☑ 전체</button></span><span>' + money(sum(L, r => r.total)) + ' · ' + L.length + '건</span></div>' + L.map(row).join('') + '</div>'; });
  }
  h += '<div class="bulkbar" id="vBulk" style="display:none"></div>';
  $('page').innerHTML = h;
  /* ☑ 선택 → 아래 막대에서 한 번에 ① 접수 확인 · ② 체크 수령 */
  const selRows = () => rows.filter(r => VSEL.has(r.id) && !r.settled);
  const paint = () => {
    const S2 = selRows(), bar = $('vBulk'); Array.from(VSEL).forEach(id => { if (!rows.some(r => r.id === id && !r.settled)) VSEL.delete(id); });
    if (!S2.length) { bar.style.display = 'none'; return; }
    const nT = S2.filter(r => !r.sb).length, nW = S2.filter(r => !r.rc).length;
    bar.style.display = ''; bar.innerHTML = '<b>' + S2.length + '건 · ' + money(sum(S2, r => r.total)) + '</b>' + (nT ? '<button class="b-ghost b-sm" id="vbSb">① 접수 확인 ' + nT + '</button>' : '') + (nW ? '<button class="b-ghost b-sm" id="vbRc">② 체크 수령 ' + nW + '</button>' : '') + '<button class="b-ghost b-sm" id="vbClr">✕ 선택 해제</button>';
    if ($('vbSb')) $('vbSb').onclick = () => bulkApply(S2.filter(r => !r.sb), false);
    if ($('vbRc')) $('vbRc').onclick = () => bulkApply(S2.filter(r => !r.rc), true);
    $('vbClr').onclick = () => { VSEL.clear(); document.querySelectorAll('[data-vck]').forEach(c => { c.checked = false; }); paint(); };
  };
  const bulkApply = async (L, rc) => {
    const bad = L.filter(r => r.mismatch), noInv = L.filter(r => !(r.invs || []).length), tot = sum(L, r => r.total);
    if (!(await confirmBox((rc ? '② 체크 수령' : '① 접수 확인') + ' — ' + L.length + '건 · ' + money(tot) + ' 를 한 번에 처리할까요?' + (rc ? '\n(아직 ① 접수 확인 안 된 건은 ① 도 같이 처리됩니다)' : '') + '\n인보이스 번호가 있는 건은 앱 인보이스에 입금이 반영됩니다.' + (bad.length ? '\n⚠️ 차액 있는 건 ' + bad.length + '건 포함: ' + bad.slice(0, 5).map(r => r.store).join(', ') : '') + (noInv.length ? '\n· 인보이스 번호 없는 건 ' + noInv.length + '건' : ''), rc ? '② 수령 처리' : '① 확인 처리'))) return;
    busy(true); let n = 0;
    try { for (const r of L) { const patch = { updatedAt: new Date().toISOString() };
        if (!r.sb) { patch.sb = true; patch.sbAt = today(); if (!rc && !(r.pays || []).some(p => p.m === 'CHECK' || p.m === 'CASH' || p.m === 'ZELLE')) patch.rc = true; }
        if (rc) { patch.rc = true; patch.rcAt = today(); }
        await S.DB.update('entries', r.id, patch); if (!r.sb) await applyToInvoices(r.id, r.invs, true); n++; VSEL.delete(r.id); }
      toast((rc ? '② 수령 ' : '① 확인 ') + n + '건 처리', 'good'); }
    catch (e) { toast('실패 (' + n + '건까지 처리됨): ' + e.message, 'bad'); }
    busy(false); pageVerify();
  };
  document.querySelectorAll('[data-vck]').forEach(c => { c.onclick = e => e.stopPropagation(); c.onchange = () => { if (c.checked) VSEL.add(c.dataset.vck); else VSEL.delete(c.dataset.vck); paint(); }; });
  const tick = L => { const ids = L.filter(r => !r.settled && !(r.sb && r.rc)).map(r => r.id), all = ids.every(id => VSEL.has(id)); ids.forEach(id => { if (all) VSEL.delete(id); else VSEL.add(id); }); document.querySelectorAll('[data-vck]').forEach(c => { c.checked = VSEL.has(c.dataset.vck); }); paint(); };
  document.querySelectorAll('[data-vckall]').forEach(b => b.onclick = e => { e.stopPropagation(); tick(list.filter(r => (r.sm || '—') === b.dataset.vckall)); });
  document.querySelectorAll('[data-vckday]').forEach(b => b.onclick = e => { e.stopPropagation(); tick(list.filter(r => r.d === b.dataset.vckday)); });
  paint();
  document.querySelectorAll('[data-vf]').forEach(b => b.onclick = () => { VF.f = b.dataset.vf; pageVerify(); });
  document.querySelectorAll('[data-vg]').forEach(b => b.onclick = () => { VF.grp = b.dataset.vg; pageVerify(); });
  document.querySelectorAll('[data-smhd]').forEach(el => el.onclick = () => el.parentElement.classList.toggle('fold'));
  document.querySelectorAll('[data-vacc]').forEach(b => b.onclick = () => storeHistory(b.dataset.vacc));
  $('vfSm').onchange = () => { VF.sm = $('vfSm').value; pageVerify(); };
  $('vfQ').oninput = debounce(() => { VF.q = $('vfQ').value.trim(); pageVerify(); }, 400);
  document.querySelectorAll('[data-vid]').forEach(el => el.onclick = () => verifyDetail(rows.find(x => x.id === el.dataset.vid)));
  document.querySelectorAll('[data-sball]').forEach(b => b.onclick = async () => {
    const sm = b.dataset.sball, L = todo.filter(r => r.sm === sm && (!VF.sm || r.sm === VF.sm));
    if (!(await confirmBox(sm + ' 의 접수 확인 대기 ' + L.length + '건을 모두 ① 확인 처리할까요? 인보이스 번호가 있는 건은 앱 인보이스에 입금이 반영됩니다.', '모두 확인'))) return;
    busy(true); try { for (const r of L) { await S.DB.update('entries', r.id, { sb: true, sbAt: today(), rc: (r.pays || []).some(p => p.m === 'CHECK' || p.m === 'CASH' || p.m === 'ZELLE') ? !!r.rc : true, updatedAt: new Date().toISOString() }); await applyToInvoices(r.id, r.invs, true); } toast(L.length + '건 확인', 'good'); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); pageVerify();
  });
  /* 체크 맞추기 */
  const ck = $('ckNo'), out = $('ckOut');
  const find = async () => {
    const no = ck.value.trim().replace(/^#/, ''); if (!no) { out.innerHTML = ''; return; }
    let hits = rows.filter(r => (r.pays || []).some(p => p.m === 'CHECK' && String(p.ref || '').replace(/^#/, '') === no));
    if (!hits.length) { try { hits = (await S.DB.list('entries', { where: [['refs', 'array-contains', no]] })).filter(r => !r.void); } catch (e) {} }
    if (!hits.length) { out.innerHTML = '<div class="alert a-amb" style="margin-top:8px">체크 #' + esc(no) + ' 으로 입력된 수금이 없습니다 — 세일즈맨이 아직 안 넣었거나 번호가 다릅니다. 우편 체크면 💳 COD·카드에 넣으세요.</div>'; return; }
    const amt = num($('ckAmt').value);
    out.innerHTML = hits.map(r => { const p = (r.pays || []).find(p => String(p.ref || '').replace(/^#/, '') === no), diff = amt && p ? Math.abs(num(p.amt) - amt) > 0.005 : false;
      return '<div class="pr" style="margin-top:6px"><div class="ct"><b>' + esc(r.sm) + ' · ' + esc(r.store) + '</b><small>' + md(r.d) + ' · 체크 #' + esc(no) + ' ' + money(p ? p.amt : 0) + (diff ? ' <span class="warn">⚠️ 들어온 금액 ' + money(amt) + ' 과 다름</span>' : '') + ' · ' + stageText(r) + '</small></div><div class="pa">' + (r.rc ? '<span class="tag t-k">수령됨</span>' : '<button class="b-blue b-sm" data-ckrc="' + r.id + '">② 수령 ✓</button>') + '</div></div>'; }).join('');
    out.querySelectorAll('[data-ckrc]').forEach(b => b.onclick = async () => { const r = rows.find(x => x.id === b.dataset.ckrc) || hits.find(x => x.id === b.dataset.ckrc); busy(true); try { const patch = { rc: true, rcAt: today(), updatedAt: new Date().toISOString() }; if (!r.sb) { patch.sb = true; patch.sbAt = today(); await applyToInvoices(r.id, r.invs, true); } await S.DB.update('entries', r.id, patch); toast('✓ 체크 #' + no + ' 수령', 'good'); ck.value = ''; $('ckAmt').value = ''; out.innerHTML = ''; ck.focus(); pageVerify(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); });
    if (hits.length === 1 && !hits[0].rc) { const btn = out.querySelector('[data-ckrc]'); if (btn && !amt) btn.focus(); }
  };
  ck.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); find(); } }; $('ckAmt').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); find(); } };
}
/** 📚 가게 수금 기록 — 기간 상관없이 전부 (정산 완료 포함) */
async function storeHistory(acct) {
  const a = S.accounts.byCode[acct]; openModal('<h2>📚 ' + esc(a ? a.store : acct) + ' <span class="muted">' + esc(acct) + '</span></h2><div class="load">읽는 중…</div>');
  let rows = [], cods = [];
  try { [rows, cods] = await Promise.all([S.DB.list('entries', { where: [['acct', '==', acct]] }), S.DB.list('cod', { where: [['acct', '==', acct]] })]); } catch (e) {}
  const all = sortBy(rows.filter(r => !r.void).map(r => ({ d: r.d, sm: r.sm, amt: r.total, how: (r.pays || []).map(p => p.m === 'CHECK' ? '#' + p.ref : p.m).join(' · '), invs: (r.invs || []).map(v => v.no).join(','), st: stageText(r), id: r.id, kind: 'e' })).concat(cods.filter(c => !c.void).map(c => ({ d: c.d, sm: c.sm, amt: c.amt, how: c.method + (c.ref ? ' ' + c.ref : ''), invs: (c.invs || []).map(v => v.no).join(','), st: c.settled ? '정산 완료' : c.v ? '정산 확인' : '입력됨', id: c.id, kind: 'c' }))), x => x.d, true);
  $('mbox').innerHTML = '<h2>📚 ' + esc(a ? a.store : acct) + ' <span class="muted">' + esc(acct) + '</span></h2><div class="heroSub">' + all.length + '건 · ' + money(sum(all, x => x.amt)) + ' · 최근 ' + (all[0] ? md(all[0].d) : '—') + '</div>' +
    '<div style="max-height:60vh;overflow:auto;margin-top:8px">' + (all.length ? all.map(x => '<div class="pr"><div class="ct"><b>' + md(x.d) + ' · ' + esc(x.sm) + '</b><small>' + esc(x.how) + (x.invs ? ' · ' + esc(x.invs) : '') + '</small></div><div class="pa"><b>' + money(x.amt) + '</b><small>' + esc(x.st) + '</small></div></div>').join('') : '<div class="none">기록 없음</div>') + '</div>' +
    '<div class="btns"><button class="b-ghost" id="shX">닫기</button></div>';
  $('shX').onclick = closeModal;
}
function verifyDetail(r) {
  if (!r) return;
  const hasPhysical = (r.pays || []).some(p => p.m === 'CHECK' || p.m === 'CASH' || p.m === 'ZELLE');
  openModal('<h2>' + esc(r.sm) + ' · ' + esc(r.store) + '</h2><div class="muted">' + dlabel(r.d) + ' · ' + esc(r.acct || '계정 없음') + (r.addr ? ' · ' + esc(r.addr) : '') + '</div>' +
    '<table style="margin-top:8px">' + (r.pays || []).map(p => '<tr><td>' + ({ CHECK: '체크 #' + esc(p.ref), CASH: '캐쉬', ZELLE: 'Zelle ' + esc(p.ref) })[p.m] + (p.dep ? ' <span class="muted">' + md(p.dep) + '</span>' : '') + (p.mob ? ' 📱' : '') + '</td><td class="r"><b>' + money(p.amt) + '</b></td></tr>').join('') + '</table>' +
    ((r.invs || []).length ? '<table style="margin-top:6px">' + r.invs.map(v => '<tr><td>' + esc(v.no) + (v.store ? ' <span class="muted">🏬 ' + esc(v.store) + '</span>' : '') + '</td><td class="r">' + money(v.amt) + '</td></tr>').join('') + '</table>' : '<div class="muted">인보이스 없음</div>') +
    (r.mismatch ? '<div class="alert a-red">' + esc(r.mismatch) + '</div>' : '') + (r.memo ? '<div class="muted" style="margin-top:6px">세일즈맨 메모: ' + esc(r.memo) + '</div>' : '') +
    (r.repId ? '<div class="muted" style="margin-top:6px">📧 Daily Report ' + esc(md(String(r.repAt || '').substring(0, 10))) + ' 전송됨 <button type="button" class="b-ghost b-sm" id="vRep">📷 체크 사진 보기</button></div><div id="vRepBox"></div>' : r.rep === false ? '<div class="muted" style="margin-top:6px">⏳ 세일즈맨이 아직 Daily Report 를 보내지 않았습니다</div>' : '') +
    '<div style="margin-top:12px"><label class="pick ' + (r.sb ? 'on' : '') + '" id="pkSb"><div class="ck">✓</div><div class="pm"><b>① 접수 확인 <span class="en">Reviewed</span></b><small>리포트 · 사진과 내용이 맞음. 인보이스 번호가 있으면 앱 인보이스에 입금이 반영됩니다</small></div></label>' +
    (hasPhysical ? '<label class="pick ' + (r.rc ? 'on' : '') + '" id="pkRc"><div class="ck">✓</div><div class="pm"><b>② 체크 수령 / 입금 확인 <span class="en">Received</span></b><small>실물 체크가 도착했거나 캐쉬 · Zelle 입금 확인</small></div></label>' : '') + '</div>' +
    '<div class="two"><div class="fg"><label>디스카운트 %</label><input id="vDisc" inputmode="decimal" value="' + esc(r.disc == null ? '' : r.disc) + '" placeholder="예: 25"></div><div class="fg"><label>담당자 메모</label><input id="vNote" value="' + esc(r.vn || '') + '"></div></div>' +
    '<div class="btns"><button class="b-ghost" id="vEdit">금액·인보이스 수정</button><button class="b-ghost" id="vVoid">취소</button><button class="b-blue" id="vSave">저장</button></div>');
  let sb = !!r.sb, rc = !!r.rc;
  $('pkSb').onclick = () => { sb = !sb; $('pkSb').classList.toggle('on', sb); };
  if ($('pkRc')) $('pkRc').onclick = () => { rc = !rc; $('pkRc').classList.toggle('on', rc); };
  $('vSave').onclick = async () => {
    const patch = { sb, rc: hasPhysical ? rc : sb, vn: $('vNote').value.trim(), disc: $('vDisc').value.trim() === '' ? '' : num($('vDisc').value), updatedAt: new Date().toISOString() };
    if (sb && !r.sbAt) patch.sbAt = today(); if (patch.rc && !r.rcAt) patch.rcAt = today();
    busy(true); try { await S.DB.update('entries', r.id, patch); if (sb !== !!r.sb) await applyToInvoices(r.id, r.invs, sb); closeModal(); toast('저장'); pageVerify(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false);
  };
  $('vEdit').onclick = () => { closeModal(); Router.go('entry', r.id); };
  if ($('vRep')) $('vRep').onclick = async () => { const b = $('vRepBox'); b.innerHTML = '<div class="load">읽는 중…</div>'; try { const rp = await S.DB.get('reports', r.repId); const ph = (rp && rp.photos) || []; b.innerHTML = ph.length ? '<div class="phgrid">' + ph.map(d => '<a class="ph" href="' + d + '" target="_blank"><img src="' + d + '"></a>').join('') + '</div><div class="muted">' + (rp.n || '') + '건 · ' + money(rp.total || 0) + ' · ' + esc(rp.sentAt || '') + '</div>' : '<div class="muted">이 리포트에는 사진이 없습니다</div>'; } catch (e) { b.innerHTML = '<div class="muted">리포트를 읽지 못했습니다: ' + esc(e.code || e.message) + '</div>'; } };
  $('vVoid').onclick = async () => { if (!(await confirmBox('이 수금을 취소(VOID)할까요?', '취소하기'))) return; busy(true); try { await S.DB.update('entries', r.id, { void: true, updatedAt: new Date().toISOString() }); if (r.sb) await applyToInvoices(r.id, r.invs, false); closeModal(); toast('취소했습니다'); pageVerify(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); };
}

/* ============================================================
 *  ② COD · 카드 · ACH 입력  (cod/{id})
 * ============================================================ */
const METHODS = ['COD', 'CREDIT CARD'];   /* ACH 는 🏦 ACH 에서 인출 완료하면 자동으로 들어옴 — 여기서 직접 입력하지 않음 */
let CF = { q: '', m: 'all' };
async function pageCod() {
  $('page').innerHTML = '<div class="load">읽는 중…</div>';
  let rows = (await S.DB.list('cod', { where: [['ym', 'in', recentYms(2)]] })).filter(r => !r.void);
  rows = sortBy(rows, r => r.d + (r.createdAt || ''), true);
  if (CF.m !== 'all') rows = rows.filter(r => r.method === CF.m);
  const by = groupBy(rows, r => r.d), days = Object.keys(by).sort().reverse();
  let h = '<div class="card"><h2>💳 COD · 카드 입력</h2><div class="muted">우편 체크 · COD · 카드로 들어온 돈. 세일즈맨을 골라 넣으면 루크 정산에 바로 뜹니다.<br><span style="color:#1e40af">🏦 ACH 는 여기서 입력하지 않습니다 — <u data-goach>ACH 메뉴</u>에서 인출 완료하면 자동으로 이 목록에 들어옵니다.</span></div>' +
    '<div class="chips">' + [['all', '전체'], ['COD', 'COD'], ['CREDIT CARD', '카드'], ['ACH', 'ACH']].map(c => '<button class="' + (CF.m === c[0] ? 'on' : '') + '" data-cm="' + c[0] + '">' + c[1] + '</button>').join('') + '</div>' +
    '<button class="b-blue" id="btnCodNew" style="margin-top:8px">＋ 입력</button></div>';
  if (!days.length) h += '<div class="card"><div class="none">최근 2개월 기록 없음</div></div>';
  days.forEach(d => { const L = by[d]; h += '<div class="card"><div class="dayhd"><span>' + dlabel(d) + '</span><span>' + money(sum(L, r => r.amt)) + '</span></div>' +
    L.map(r => '<div class="pr tap ' + (r.v ? 'v' : '') + '" data-cid="' + r.id + '"><div class="mk">' + (r.v ? '✓' : '·') + '</div><div class="ct"><b>' + esc(r.sm) + ' · ' + esc(r.store) + ' <span class="tag ' + (r.method === 'ACH' ? 't-a' : r.method === 'COD' ? 't-c' : 't-k') + '">' + esc(r.method) + '</span></b><small>' + esc(r.ref || '') + (r.invs && r.invs.length ? ' · ' + r.invs.map(v => v.no).join(',') : '') + (r.note ? ' · ' + esc(r.note) : '') + '</small></div><div class="pa"><b>' + money(r.amt) + '</b><small>' + (r.settled ? '정산 완료' : r.v ? '정산 확인' : '입력됨') + '</small></div></div>').join('') + '</div>'; });
  $('page').innerHTML = h;
  document.querySelectorAll('[data-cm]').forEach(b => b.onclick = () => { CF.m = b.dataset.cm; pageCod(); });
  $('btnCodNew').onclick = () => codForm(null);
  document.querySelectorAll('[data-goach]').forEach(u => { u.style.cursor = 'pointer'; u.onclick = () => Router.go('ach'); });
  document.querySelectorAll('[data-cid]').forEach(el => el.onclick = () => codForm(rows.find(x => x.id === el.dataset.cid)));
}
function codForm(r) {
  r = r || {};
  const invs = (r.invs || []).concat([{ no: '', amt: '' }]);
  openModal('<h2>' + (r.id ? '수정' + (r.method === 'ACH' ? ' (ACH · 🏦 ACH 에서 들어옴)' : '') : '＋ COD · 카드') + '</h2>' +
    '<div class="two"><div class="fg"><label>세일즈맨</label>' + sel('cSm', smOptions(null, true), r.sm || '') + '</div><div class="fg"><label>날짜</label>' + inputDate('cD', r.d) + '</div></div>' +
    '<div class="fg"><label>가게</label><input id="cStore" value="' + esc(r.store || '') + '" placeholder="가게 이름 · 계정코드" autocomplete="off"><div class="hits" id="cHits" style="display:none"></div><input type="hidden" id="cAcct" value="' + esc(r.acct || '') + '"></div>' +
    '<div class="seg" id="cM">' + (r.method === 'ACH' ? ['ACH'] : METHODS).map(m => '<button class="' + ((r.method || 'COD') === m ? 'on' : '') + '" data-m="' + m + '">' + (m === 'CREDIT CARD' ? '카드' : m) + '</button>').join('') + '</div>' +
    '<div class="two"><div class="fg"><label>참조 # (선택)</label><input id="cRef" value="' + esc(r.ref || '') + '"></div><div class="fg"><label>금액 $</label><input id="cAmt" inputmode="decimal" value="' + esc(r.amt || '') + '" style="font-weight:800;text-align:right"></div></div>' +
    '<div class="fg"><label>인보이스 (번호 · 금액)</label><div id="cInvs">' + invs.map((v, i) => '<div class="invrow"><input data-cno="' + i + '" value="' + esc(v.no) + '" placeholder="A12345" style="text-transform:uppercase"><input data-camt="' + i + '" value="' + esc(v.amt) + '" inputmode="decimal" style="text-align:right"><span></span></div>').join('') + '</div><button class="b-ghost b-sm" id="cMore">＋ 줄</button></div>' +
    '<div class="two"><div class="fg"><label>디스카운트 %</label><input id="cDisc" inputmode="decimal" value="' + esc(r.disc == null ? '' : r.disc) + '"></div><div class="fg"><label>메모</label><input id="cNote" value="' + esc(r.note || '') + '"></div></div>' +
    '<div class="btns">' + (r.id ? '<button class="b-ghost" id="cDel">삭제</button>' : '') + '<button class="b-blue" id="cSave">저장</button></div>');
  let method = r.method || 'COD';
  document.querySelectorAll('#cM [data-m]').forEach(b => b.onclick = () => { method = b.dataset.m; document.querySelectorAll('#cM button').forEach(x => x.classList.toggle('on', x.dataset.m === method)); });
  $('cStore').oninput = () => { const hits = searchAccounts(S.accounts, $('cStore').value, 8), box = $('cHits'); $('cAcct').value = ''; box.style.display = hits.length ? '' : 'none';
    box.innerHTML = hits.map(a => '<div data-a="' + esc(a.acct) + '"><b>' + esc(a.store) + '</b> <span class="muted">' + esc(a.acct) + (a.sm ? ' · ' + esc(a.sm) : '') + '</span></div>').join('');
    box.querySelectorAll('[data-a]').forEach(d => d.onclick = () => { const a = S.accounts.byCode[d.dataset.a]; $('cStore').value = a.store; $('cAcct').value = a.acct; box.style.display = 'none'; if (!$('cSm').value && a.sm) $('cSm').value = a.sm; }); };
  $('cMore').onclick = () => { const n = document.querySelectorAll('[data-cno]').length; $('cInvs').insertAdjacentHTML('beforeend', '<div class="invrow"><input data-cno="' + n + '" placeholder="A12345" style="text-transform:uppercase"><input data-camt="' + n + '" inputmode="decimal" style="text-align:right"><span></span></div>'); };
  $('cSave').onclick = async () => {
    const sm = $('cSm').value, store = $('cStore').value.trim(), amt = R2(num($('cAmt').value)), d = $('cD').value;
    if (!sm) return toast('세일즈맨을 고르세요', 'bad'); if (!store) return toast('가게를 넣으세요', 'bad'); if (!amt) return toast('금액을 넣으세요', 'bad');
    const invList = []; document.querySelectorAll('[data-cno]').forEach(el => { const i = el.dataset.cno, a = document.querySelector('[data-camt="' + i + '"]'); const no = invNo(el.value); if (no || num(a.value)) invList.push({ no, t: no ? invType(no) : '', amt: R2(num(a.value)) }); });
    if (invList.some(v => !v.no)) return toast('인보이스 번호가 빈 줄이 있습니다', 'bad');
    if (method === 'ACH' && !r.id && !r.achId) {
      /* 옛 규칙(ACH_COMM_SOURCE): ACH 커미션은 한쪽에서만. 🏦 ACH 허브에 같은 가게·금액 건이 있으면 겹치니 막습니다 */
      try { const achs = (await S.DB.list('ach', { where: [['acct', '==', $('cAcct').value || r.acct || '']] })).filter(a => !a.void && Math.abs(num(a.amt) - amt) < 0.01); if (achs.length) { const a = achs[0]; if (a.codId) return toast('이 ACH 는 🏦 ACH 에서 이미 인출 완료 처리되어 COD·ACH 목록에 들어와 있습니다 (' + a.drawOn + '). 중복 입력입니다.', 'bad'); if (!(await confirmBox('🏦 ACH 에 같은 가게 · 같은 금액 건이 있습니다 (인출 예정 ' + a.drawOn + ', ' + (a.setup ? '예약됨' : '셋업 전') + ').\n인출 완료는 ACH 탭에서 처리하면 자동으로 여기 들어옵니다. 그래도 직접 넣을까요?', '그래도 저장'))) return; } } catch (e) {}
    }
    const id = r.id || newId('C');
    const doc = { id, d, ym: ym(d), sm, acct: $('cAcct').value || r.acct || '', store, method, ref: $('cRef').value.trim(), amt, invs: invList, disc: $('cDisc').value.trim() === '' ? '' : num($('cDisc').value), note: $('cNote').value.trim(), updatedAt: new Date().toISOString() };
    busy(true);
    try { if (r.id) await S.DB.update('cod', id, doc); else await S.DB.set('cod', id, Object.assign(doc, { v: false, vn: '', settled: '', void: false, createdBy: S.user.email, createdAt: new Date().toISOString() })); if (r.id && r.invs) await applyToInvoices(id, r.invs, false); await applyToInvoices(id, invList, true); closeModal(); toast('저장'); pageCod(); }
    catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false);
  };
  if ($('cDel')) $('cDel').onclick = async () => { if (!(await confirmBox('지울까요?', '삭제'))) return; busy(true); try { await S.DB.update('cod', r.id, { void: true }); await applyToInvoices(r.id, r.invs, false); closeModal(); pageCod(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); };
}

/* ③ ACH 는 ach.js (ACH 허브) 가 맡음 */

/* ============================================================
 *  ④ 거래처
 * ============================================================ */
let STQ = '';
let STM = { mode: '', sm: '', state: '', city: '', msm: null };
let MAP_FRESH = false;   // 지도 화면에서 서버 거래처를 한 번 새로 받았나
async function pageStores() {
  const isSales = S.role === 'salesman', mine = (S.me && S.me.sm) ? String(S.me.sm).toUpperCase() : '';
  if (!STM.mode) { STM.mode = 'q'; if (isSales) STM.sm = mine; }   // 처음엔 모두 전체 거래처 (가게 이름 ABC) — 세일즈맨은 👤 세일즈맨별에 내 가게가 골라져 있음
  const A = activeOnly(S.accounts), Z = S.accounts.filter(a => a.inactive);   // 💤 비활성은 목록 · 지도에서 빼고 따로
  const canZ = S.role === 'admin' || S.role === 'owner' || (!isSales && (S.me && (S.me.job || 'office') === 'office'));
  const row = a => '<div class="pr tap" data-st="' + esc(a.acct) + '"><div class="ct"><b>' + esc(a.store) + (a.inactive ? ' <span class="tag t-g">💤 ' + bt('비활성', 'Inactive') + '</span>' : '') + '</b><small>' + esc(a.acct) + ' · ' + esc([a.addr, a.city, a.state].filter(Boolean).join(', ')) + (a.sm ? ' · ' + esc(a.sm) : '') + (a.tel ? ' · ' + esc(a.tel) : '') + '</small></div>' + (!isSales ? '<button class="b-ghost b-sm" data-ste="' + esc(a.acct) + '">✏️</button>' : '') + '</div>';
  const cnt = (list, f) => { const m = {}; list.forEach(a => { const k = f(a) || '—'; m[k] = (m[k] || 0) + 1; }); return m; };
  let body = '', sub = '';
  if (STM.mode === 'q') {
    sub = '<input id="stQ" placeholder="가게 이름 · 계정코드 · 도시 · 전화 / Store · Acct · City · Phone" value="' + esc(STQ) + '" autocomplete="off" style="margin-top:8px">';
    body = '<div id="stList"></div>';
  } else if (STM.mode === 'sm') {
    const bySm = cnt(A, a => String(a.sm || '').toUpperCase()), sms = Object.keys(bySm).sort((x, y) => x === mine ? -1 : y === mine ? 1 : x < y ? -1 : 1);
    sub = '<div class="chips" style="margin-top:8px">' + sms.map(k => '<button class="' + (STM.sm === k ? 'on' : '') + '" data-stsm="' + esc(k) + '">' + (k === mine ? '👤 ' : '') + esc(k) + ' <span class="en">' + bySm[k] + '</span></button>').join('') + '</div>';
    const list = sortStores(A.filter(a => String(a.sm || '').toUpperCase() === (STM.sm || '—') || (STM.sm === '—' && !a.sm)));
    body = STM.sm ? (list.length ? '<div class="muted" style="margin:0 0 6px">' + esc(STM.sm) + ' · ' + list.length + '곳 · 이름순</div>' + list.map(row).join('') : '<div class="none">없음</div>') : '<div class="none">세일즈맨을 고르세요</div>';
  } else if (STM.mode === 'z') {
    /* 💤 비활성 — 3년 거래 없는 곳. 다시 활성 가능 */
    sub = '<div class="muted" style="margin-top:8px">' + bi('최근 3년 동안 거래가 없어 목록 · 지도 · 가게 찾기 맨 뒤로 뺀 거래처입니다. 다시 거래하면 앱에서 인보이스를 발행할 때 자동으로 활성으로 돌아갑니다.', 'No activity for 3 years — removed from lists and the map. Issuing an invoice makes them active again.') + '</div>' + (canZ ? '<div class="btns" style="justify-content:flex-start"><button class="b-ghost b-sm" id="stZscan">🔎 ' + bi('3년 거래 없는 곳 다시 찾기', 'Scan again') + '</button></div>' : '');
    body = Z.length ? '<div class="muted" style="margin:0 0 6px">💤 ' + Z.length + '</div>' + sortStores(Z).map(a => '<div class="pr"><div class="ct tap" data-st="' + esc(a.acct) + '"><b>' + esc(a.store) + '</b><small>' + esc(a.acct) + ' · ' + esc([a.city, a.state].filter(Boolean).join(', ')) + (a.sm ? ' · ' + esc(a.sm) : '') + (a.lastTx ? ' · ' + bt('마지막 거래', 'last activity') + ' ' + esc(a.lastTx) : '') + '</small></div>' + (!isSales ? '<button class="b-ghost b-sm" data-zre="' + esc(a.acct) + '">↩️ ' + bi('다시 활성', 'Re-activate') + '</button>' : '') + '</div>').join('') : '<div class="none">' + bt('비활성 거래처가 없습니다', 'No inactive accounts') + (canZ ? ' — ' + bt('위 버튼으로 3년 거래 없는 곳을 찾으세요', 'scan with the button above') : '') + '</div>';
  } else if (STM.mode === 'map') {
    /* 🗺 지도 — 세일즈맨은 내 가게가 먼저 (전체도 볼 수 있음), 담당자는 세일즈맨별 색 */
    if (STM.msm == null) STM.msm = isSales ? mine : '';
    const smsAll = Object.keys(cnt(A, a => String(a.sm || '').toUpperCase())).filter(k => k !== '—').sort();
    sub = '<div class="chips" style="margin-top:8px"><button class="' + (STM.msm === '' ? 'on' : '') + '" data-msm="">' + bi('전체', 'All') + ' <span class="en">' + A.length + '</span></button>' + smsAll.map(k => '<button class="' + (STM.msm === k ? 'on' : '') + '" data-msm="' + esc(k) + '"><i class="dot" style="background:' + smColor(k, smsAll) + '"></i>' + (k === mine ? '👤 ' : '') + esc(k) + '</button>').join('') + '</div>' +
      '<div class="btns" style="justify-content:flex-start;margin-top:4px"><button class="b-ghost b-sm" id="mapMe">📍 ' + bi('내 위치 · 가까운 가게', 'My location · nearby') + '</button></div>';
    body = '<div id="stMap" class="mapbox"></div><div class="muted" id="mapInfo" style="margin-top:6px"></div><div id="mapNear"></div>';
  } else {
    const byState = cnt(A, a => String(a.state || '').toUpperCase()), states = Object.keys(byState).sort();
    sub = '<div class="chips" style="margin-top:8px">' + states.map(k => '<button class="' + (STM.state === k ? 'on' : '') + '" data-stst="' + esc(k) + '">' + esc(k) + ' <span class="en">' + byState[k] + '</span></button>').join('') + '</div>';
    if (STM.state) {
      const inState = A.filter(a => String(a.state || '').toUpperCase() === STM.state), byCity = cnt(inState, a => String(a.city || '').toUpperCase()), cities = Object.keys(byCity).sort();
      sub += '<div class="chips">' + '<button class="' + (STM.city ? '' : 'on') + '" data-stct="">' + bi('전체', 'All') + ' ' + inState.length + '</button>' + cities.map(k => '<button class="' + (STM.city === k ? 'on' : '') + '" data-stct="' + esc(k) + '">' + esc(k) + ' <span class="en">' + byCity[k] + '</span></button>').join('') + '</div>';
      const list = sortStores(inState.filter(a => !STM.city || String(a.city || '').toUpperCase() === STM.city));
      body = list.length ? '<div class="muted" style="margin:0 0 6px">' + esc(STM.state) + (STM.city ? ' · ' + esc(STM.city) : '') + ' · ' + list.length + '곳</div>' + list.slice(0, 400).map(row).join('') + (list.length > 400 ? '<div class="hint">400곳까지 표시 — 도시를 고르세요</div>' : '') : '<div class="none">없음</div>';
    } else body = '<div class="none">주(State)를 고르세요</div>';
  }
  $('page').innerHTML = '<div class="card"><h2>🏬 ' + bi('거래처', 'Customers') + ' <span class="muted" style="font-size:12px;font-weight:400">' + A.length + '곳</span></h2>' +
    '<div class="seg" style="flex-wrap:wrap">' + [['q', '🔎 ' + bi('검색', 'Search')], ['sm', '👤 ' + bi('세일즈맨별', 'By salesman')], ['geo', '🏙 ' + bi('주 · 도시별', 'By state · city')], ['map', '🗺 ' + bi('지도', 'Map')], ['z', '💤 ' + bi('비활성', 'Inactive') + ' ' + Z.length]].map(t => '<button class="' + (STM.mode === t[0] ? 'on' : '') + '" data-stm="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' + sub +
    (!isSales ? '<div class="btns" style="justify-content:flex-start;flex-wrap:wrap"><button class="b-ghost b-sm" id="stNew">＋ 새 거래처</button>' + (canZ ? '<button class="b-ghost b-sm" id="stZ">💤 ' + bi('비활성 정리 (3년 거래 없음)', 'Clean up inactive (3 yrs)') + '</button>' : '') + '</div>' : '') + '</div>' +
    '<div class="card">' + body + '</div>';
  Router.refreshBack();
  if (STM.mode === 'map') {
    const smsAll = Object.keys(cnt(A, a => String(a.sm || '').toUpperCase())).filter(k => k !== '—').sort();
    const list = STM.msm ? A.filter(a => String(a.sm || '').toUpperCase() === STM.msm) : A;
    renderMap('stMap', list, smsAll, S);
    /* 좌표가 하나도 없으면 — 폰에 저장된 거래처가 옛것일 수 있으니 서버에서 한 번 새로 받아 봄 (geoSync 가 좌표를 넣고도 버전을 못 올렸던 경우) */
    if (!MAP_FRESH && A.length && !A.some(a => Number(a.lat) && Number(a.lng))) {
      MAP_FRESH = true;
      (async () => {
        try {
          const app = await S.DB.get('settings', 'app'); if (app) { S.settings.geo = app.geo; if (app.accountsVer) S.settings.accountsVer = app.accountsVer; }
          dropAccountCache(); const { loadAccounts } = await import('./accounts.js'); S.accounts = await loadAccounts(S);
          if (STM.mode === 'map' && location.hash.indexOf('#/stores') === 0) pageStores();
        } catch (e) { /* 다음에 다시 */ }
      })();
    }
    document.querySelectorAll('[data-msm]').forEach(b => b.onclick = () => { STM.msm = b.dataset.msm; pageStores(); });
    $('mapMe').onclick = () => nearMe(list, 'mapNear');
  }
  document.querySelectorAll('[data-stm]').forEach(b => b.onclick = () => { STM.mode = b.dataset.stm; pageStores(); });
  document.querySelectorAll('[data-stsm]').forEach(b => b.onclick = () => { STM.sm = b.dataset.stsm; pageStores(); });
  document.querySelectorAll('[data-stst]').forEach(b => b.onclick = () => { STM.state = b.dataset.stst; STM.city = ''; pageStores(); });
  document.querySelectorAll('[data-stct]').forEach(b => b.onclick = () => { STM.city = b.dataset.stct; pageStores(); });
  /* 🔎 전체 거래처를 이름순으로 먼저 보여 주고, 치는 대로 걸러짐 (목록만 다시 그림 — 입력창은 그대로) */
  if ($('stQ')) {
    let lim = 300;
    const paintList = () => {
      const hits = STQ.trim() ? searchAccounts(S.accounts, STQ, 100000) : sortStores(A), show = hits.slice(0, lim);   // 검색하면 💤 비활성도 맨 뒤에
      $('stList').innerHTML = '<div class="muted" style="margin:0 0 6px">' + (STQ.trim() ? bt('찾음', 'Found') + ' ' : bt('전체 · 이름순', 'All · by name') + ' ') + hits.length.toLocaleString() + '</div>' + (show.length ? show.map(row).join('') : '<div class="none">없음 · no match</div>') + (hits.length > show.length ? '<button class="b-ghost" id="stMore" style="margin-top:8px">' + bt('더 보기', 'More') + ' (' + (hits.length - show.length).toLocaleString() + ')</button>' : '');
      $('stList').querySelectorAll('[data-st]').forEach(el => el.onclick = () => storeSheet(el.dataset.st));
      $('stList').querySelectorAll('[data-ste]').forEach(el => el.onclick = e => { e.stopPropagation(); storeForm(S.accounts.byCode[el.dataset.ste]); });
      if ($('stMore')) $('stMore').onclick = () => { lim += 300; paintList(); };
    };
    $('stQ').oninput = debounce(() => { STQ = $('stQ').value; lim = 300; paintList(); }, 150);
    paintList();
  }
  if ($('stNew')) $('stNew').onclick = () => storeForm(null);
  if ($('stZ')) $('stZ').onclick = () => inactiveTool(() => { STM.mode = 'z'; pageStores(); });
  if ($('stZscan')) $('stZscan').onclick = () => inactiveTool(() => pageStores());
  document.querySelectorAll('[data-zre]').forEach(b => b.onclick = () => reactivate(b.dataset.zre, () => pageStores()));
  document.querySelectorAll('[data-st]').forEach(el => el.onclick = () => storeSheet(el.dataset.st));
  document.querySelectorAll('[data-ste]').forEach(el => el.onclick = e => { e.stopPropagation(); storeForm(S.accounts.byCode[el.dataset.ste]); });
}
export function storeForm(a) {
  a = a || {};
  openModal('<h2>' + (a.acct ? esc(a.store) : '＋ 새 거래처') + '</h2>' +
    '<div class="two"><div class="fg"><label>계정코드</label><input id="sAcct" value="' + esc(a.acct || '') + '" ' + (a.acct ? 'readonly' : '') + '></div><div class="fg"><label>담당 세일즈맨</label>' + sel('sSm', smOptions(null, true), a.sm || '') + '</div></div>' +
    '<div class="fg"><label>가게 이름</label><input id="sStore" value="' + esc(a.store || '') + '" style="text-transform:uppercase"></div>' +
    '<div class="fg"><label>주소</label><input id="sAddr" value="' + esc(a.addr || '') + '"></div>' +
    '<div class="three"><div class="fg"><label>City</label><input id="sCity" value="' + esc(a.city || '') + '"></div><div class="fg"><label>State</label><input id="sState" value="' + esc(a.state || '') + '" maxlength="2" style="text-transform:uppercase"></div><div class="fg"><label>Zip</label><input id="sZip" value="' + esc(a.zip || '') + '"></div></div>' +
    '<div class="two"><div class="fg"><label>전화</label><input id="sTel" value="' + esc(a.tel || '') + '"></div><div class="fg"><label>조건 (N30 · ACH60 …)</label><input id="sTerms" value="' + esc(a.terms || '') + '"></div></div>' +
    '<div class="fg"><label>메모 (주문 화면에 보임)</label><input id="sNote" value="' + esc(a.note || '') + '"></div>' +
    '<div class="fg"><label>기본 할인 % (인보이스 종류별 — 주문에 자동으로 들어감)</label><div class="three">' + invTypes(S).map(t => '<div><small class="muted">' + esc(t.c) + ' ' + esc(t.n) + '</small><input type="number" inputmode="decimal" min="0" max="100" data-sd="' + esc(t.c) + '" value="' + esc((a.disc || {})[t.c] || '') + '" placeholder="0"></div>').join('') + '</div></div>' +
    (a.acct ? '<label class="pick ' + (a.inactive ? 'on' : '') + '" id="sInact" style="margin-top:6px"><span class="ck">✓</span><span class="pm"><b>💤 ' + bi('비활성 (목록 · 지도에서 뺌)', 'Inactive (hide from lists)') + '</b><small>' + (a.lastTx ? bt('마지막 거래', 'last activity') + ' ' + esc(a.lastTx) : '') + '</small></span></label>' : '') +
    '<div class="btns"><button class="b-blue" id="sSave">저장</button></div>');
  if ($('sInact')) $('sInact').onclick = e => { e.preventDefault(); $('sInact').classList.toggle('on'); };
  $('sSave').onclick = async () => {
    const acct = pad4($('sAcct').value.trim()), store = $('sStore').value.trim().toUpperCase();
    if (!acct || !store) return toast('계정코드와 이름을 넣으세요', 'bad');
    const doc = { acct, store, sm: $('sSm').value, addr: $('sAddr').value.trim(), city: $('sCity').value.trim().toUpperCase(), state: $('sState').value.trim().toUpperCase(), zip: $('sZip').value.trim(), tel: $('sTel').value.trim(), terms: $('sTerms').value.trim().toUpperCase(), note: $('sNote').value.trim(), updatedAt: new Date().toISOString() };
    const disc = {}; document.querySelectorAll('[data-sd]').forEach(inp => { const v = Math.max(0, Math.min(100, Number(inp.value) || 0)); if (v) disc[inp.dataset.sd] = v; }); doc.disc = disc;
    Object.keys(a).forEach(k => { if (doc[k] === undefined && k !== 'id' && k[0] !== '_') doc[k] = a[k]; });
    if (!a.acct) doc.createdAt = new Date().toISOString();   // 새 거래처 — 3년 안에 만든 곳은 비활성 정리에서 빠짐
    if ($('sInact')) { const z = $('sInact').classList.contains('on'); if (z !== !!a.inactive) { doc.inactive = z; if (z) { doc.inactiveAt = new Date().toISOString(); doc.inactiveBy = S.user.email; doc.keepActive = false; } else doc.keepActive = true; } }
    busy(true);
    try { await S.DB.set('accounts', acct, doc); await bumpAccountsVer(); closeModal(); toast('저장'); pageStores(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false);
  };
}
export async function bumpAccountsVer() {
  const ver = String(Date.now());
  await S.DB.update('settings', 'app', { accountsVer: ver });
  S.settings.accountsVer = ver; dropAccountCache();
  const { loadAccounts } = await import('./accounts.js'); S.accounts = await loadAccounts(S);
}

/* ============================================================
 *  ⑤ AR 올리기 — 이전 시스템 AR 엑셀을 그대로 올리면 세일즈맨별로 나눠 저장
 *  ar/{SM} = { sm, asOf, total, stores:[{acct, store, total, b[5], invs:[{inv,d,amt,bal,pdd,bk}], lastPaid, dormant, moved}] }
 *  ar/_all = 전체 (루크 미수금 탭)
 * ============================================================ */
async function pageArUp() {
  const asOf = S.settings.arAsOf || '';
  if (S.role !== 'admin') { $('page').innerHTML = '<div class="card"><div class="none">미수금 올리기는 관리 → 📥 가져오기에서 합니다 (관리자)</div></div>'; return; }
  $('page').innerHTML = '<div class="card"><h2>📤 미수금(AR) 올리기</h2><div class="muted">AR 엑셀(.xlsx)을 그대로 고르세요. 보통은 관리 → 📥 가져오기의 ① 수금 입력 파일에 AR 탭이 있어 따로 올릴 필요가 없습니다. 세일즈맨별로 나눠 저장합니다.<br>지금 기준일: <b>' + esc(asOf || '없음') + '</b>' + (asOf ? ' (' + daysBetween(asOf, today()) + '일 전)' : '') + '</div>' +
    '<div class="fg" style="margin-top:10px"><label>기준일 (AR 을 뽑은 날)</label>' + inputDate('arD', today()) + '</div>' +
    '<input type="file" id="arFile" accept=".xlsx,.xls,.csv" style="padding:8px"><div id="arOut" style="margin-top:10px"></div></div>';
  $('arFile').onchange = () => arParse($('arFile').files[0]);
}
async function loadXlsx() {
  if (window.XLSX) return window.XLSX;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  return window.XLSX;
}
const AR_COLS = { rep: /sales\s*rep/i, acct: /customer\s*#|acct|account/i, store: /customer\s*name|store/i, inv: /^invoice$|invoice\s*#|invoice\s*no/i, d: /invoice\s*date/i, total: /invoice\s*total/i, pdd: /past\s*due/i, bal: /^balance/i, cur: /^current/i, b1: /1\s*-\s*30/i, b2: /31\s*-\s*60/i, b3: /61\s*-\s*90/i, b4: /over\s*90|90\+/i, term: /^term/i };
export function parseArRows(aoa) {
  let hi = -1, idx = {};
  for (let r = 0; r < Math.min(aoa.length, 10) && hi < 0; r++) {
    const row = aoa[r].map(x => String(x == null ? '' : x).trim());
    const m = {}; Object.keys(AR_COLS).forEach(k => { const c = row.findIndex(h => h && AR_COLS[k].test(h)); if (c >= 0) m[k] = c; });
    if (m.inv != null && m.bal != null && m.acct != null) { hi = r; idx = m; }
  }
  if (hi < 0) {
    /* 수금 앱 v79 · BOSS b22 와 같게: 머리글 줄 없이 붙여넣은 SmartBee AR (1행 비어 있음) — 자리 그대로 읽음 */
    const looks = aoa.slice(0, 8).some(r => r && /^\d{3,5}$/.test(String(r[2] == null ? '' : r[2]).replace(/\.0+$/, '').trim()) && String(r[3] || '').trim() && String(r[4] || '').trim());
    if (!looks) throw new Error('머리글(Invoice · balance · Customer #)을 못 찾았습니다');
    hi = (aoa[0] || []).some(x => /^\d{3,5}$/.test(String(x == null ? '' : x).trim())) ? -1 : 0;
    idx = { rep: 1, acct: 2, store: 3, inv: 4, d: 5, total: 6, pdd: 7, bal: 8, cur: 9, b1: 10, b2: 11, b3: 12, b4: 13, term: 14 };
  }
  const out = [], subtotals = [], closed = {}; let tail = 0;   // closed: 소계(ACE (437))가 이미 나온 담당 — 그 뒤 같은 담당 줄은 지난번 붙여넣기 꼬리
  const dateOf = v => { if (v instanceof Date) return v.toISOString().substring(0, 10); const s = String(v || '').trim(); const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0'); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10); if (typeof v === 'number' && v > 30000) { const d = new Date(Math.round((v - 25569) * 86400000)); return d.toISOString().substring(0, 10); } return ''; };
  for (let r = hi + 1; r < aoa.length; r++) {
    const row = aoa[r]; if (!row || !row.length) continue;
    const inv = invNo(row[idx.inv]), acct = String(row[idx.acct] == null ? '' : row[idx.acct]).trim();
    const bal = num(row[idx.bal]);
    const rep = String(row[idx.rep] == null ? '' : row[idx.rep]).trim().toUpperCase(), repLab = rep.replace(/\s*\(\d+\)\s*$/, '');
    if (!inv) { const lab = String(row[idx.rep] == null ? '' : row[idx.rep]).trim() || String(row[idx.store] == null ? '' : row[idx.store]).trim(); if (/\(\d+\)\s*$/.test(rep) && repLab !== 'ALL') { if (closed[repLab]) { tail++; continue; } closed[repLab] = 1; } if (lab && bal) subtotals.push({ label: lab, bal }); continue; }
    if (rep && closed[rep]) { tail++; continue; }
    if (!acct || Math.abs(bal) < 0.005) continue;
    const bk = [num(row[idx.cur]), num(row[idx.b1]), num(row[idx.b2]), num(row[idx.b3]), num(row[idx.b4])];
    let bkIdx = bk.findIndex(x => Math.abs(x) > 0.005); if (bkIdx < 0) { const p = num(row[idx.pdd]); bkIdx = p <= 0 ? 0 : p <= 30 ? 1 : p <= 60 ? 2 : p <= 90 ? 3 : 4; }
    out.push({ rep: String(row[idx.rep] || '').trim().toUpperCase(), acct: pad4(acct), store: String(row[idx.store] || '').trim(), inv, d: dateOf(row[idx.d]), amt: R2(num(row[idx.total])), bal: R2(bal), pdd: Math.round(num(row[idx.pdd])), bk: bkIdx, term: String(row[idx.term] || '').trim() });
  }
  return { rows: out, subtotals, tail };
}
async function arParse(file) {
  if (!file) return;
  const out = $('arOut'); out.innerHTML = '<div class="muted">읽는 중…</div>';
  try {
    const XLSX = await loadXlsx();
    const buf = await file.arrayBuffer(); const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]]; const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
    const { rows, subtotals, tail } = parseArRows(aoa);
    const allRow = subtotals.find(s => /^ALL$/i.test(s.label));
    const total = sum(rows, r => r.bal);
    out.innerHTML = '<div class="alert a-blu">인보이스 ' + rows.length + '건 · 잔액 합계 <b>' + money(total) + '</b>' + (allRow ? ' · 파일 ALL 행 ' + money(allRow.bal) + (Math.abs(allRow.bal - total) < 0.02 ? ' ✓' : ' <span class="warn">✗ 다름</span>') : '') + (tail ? '<br>지난번 붙여넣기에서 남은 꼬리 ' + tail + '줄은 뺐습니다' : '') + '</div><button class="b-blue" id="arGo" style="margin-top:8px">세일즈맨별로 나눠 저장</button>';
    $('arGo').onclick = () => arBuild(rows, $('arD').value);
  } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
}
/** AR 줄 → 세일즈맨별 ar/{sm} + ar/_all 저장. 반환 { stores, unmatched, noSmAmt } */
export async function saveAr(rows, asOf) {
  /* 최근 1년 수금 → 가게별 마지막 수금자 */
  const ents = (await S.DB.list('entries', { where: [['ym', 'in', recentYms(13)]] })).filter(e => !e.void && !e.repl);
  const last = {};
  ents.forEach(e => { const touch = (acct) => { if (!acct) return; if (!last[acct] || e.d > last[acct].d) last[acct] = { d: e.d, sm: e.sm }; }; touch(e.acct); (e.invs || []).forEach(v => { if (v.acct) touch(v.acct); }); });
  const byAcct = groupBy(rows, r => r.acct), unmatched = [], noSm = [];
  const stores = Object.keys(byAcct).map(acct => {
    const L = byAcct[acct], a = S.accounts.byCode[acct];
    if (!a) unmatched.push(acct + ' ' + L[0].store);
    const rep = L[0].rep, lp = last[acct];
    const sm = (lp && lp.sm) || (a && a.sm) || rep || '';
    if (!sm) noSm.push(acct);
    const b = [0, 0, 0, 0, 0]; L.forEach(r => { b[r.bk] += r.bal; });
    const newest = L.map(r => r.d).sort().reverse()[0] || '';
    const dormant = !!(newest && daysBetween(newest, asOf) > 365 && (!lp || daysBetween(lp.d, asOf) > 365));
    return { acct, store: a ? a.store : L[0].store, sm, rep, total: sum(L, r => r.bal), b: b.map(R2), invs: L.map(r => ({ inv: r.inv, d: r.d, amt: r.amt, bal: r.bal, pdd: r.pdd, bk: r.bk })), lastPaid: lp ? lp.d : '', dormant, moved: rep && rep !== sm ? rep : '', term: L[0].term };
  });
  const bySm = groupBy(stores, s => s.sm || '_none');
  const ops = [];
  S.sms.forEach(x => { const list = bySm[x.code] || []; ops.push({ op: 'set', col: 'ar', id: x.code, data: { sm: x.code, asOf, total: sum(list, s => s.total), n: list.length, stores: list } }); });
  Object.keys(bySm).forEach(code => { if (code !== '_none' && !S.smByCode[code]) ops.push({ op: 'set', col: 'ar', id: code, data: { sm: code, asOf, total: sum(bySm[code], s => s.total), n: bySm[code].length, stores: bySm[code] } }); });
  ops.push({ op: 'set', col: 'ar', id: '_all', data: { sm: '_all', asOf, total: sum(stores, s => s.total), n: stores.length, stores: stores.map(s => { const x = Object.assign({}, s); delete x.invs; return x; }), unmatched, noSmAmt: sum(bySm['_none'] || [], s => s.total), uploadedAt: new Date().toISOString(), by: S.user.email } });
  await S.DB.batch(ops);
  await S.DB.update('settings', 'app', { arAsOf: asOf }); S.settings.arAsOf = asOf;
  return { stores, unmatched, noSmAmt: sum(bySm['_none'] || [], s => s.total) };
}
async function arBuild(rows, asOf) {
  busy(true);
  try {
    const r = await saveAr(rows, asOf);
    $('arOut').innerHTML = '<div class="alert a-grn">저장했습니다 — 기준일 ' + esc(asOf) + ' · 가게 ' + r.stores.length + '곳 · ' + money(sum(r.stores, s => s.total)) + '<br>담당 없는 금액 ' + money(r.noSmAmt) + ' · 거래처 목록에 없는 가게 ' + r.unmatched.length + '곳</div>' + (r.unmatched.length ? '<div class="muted">' + r.unmatched.slice(0, 30).map(esc).join(', ') + '</div>' : '');
    toast('AR 저장 완료', 'good');
  } catch (e) { $('arOut').innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
  busy(false);
}
