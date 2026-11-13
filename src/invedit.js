/* ============================================================
 *  ✏️ 발행된 인보이스 직접 고치기 (오피스 · 관리자) — 2026-11-12 오피스 요청: "인보이스로 넘어간 후 수정"
 *    줄의 수량 · 가격 고치기 · 줄 지우기 · 아이템 더하기 · 메모 → 합계 · 잔액 · 재고 · 월 매출 요약 · 주문 금액이 같이 맞춰짐
 *    잔액 = 지금 잔액 + (새 합계 − 옛 합계) — 이미 받은 수금은 그대로 · 고친 기록(edits: 누가 · 언제 · 옛 합계 → 새 합계 · 무엇)을 남김
 *    VOID · 크레딧 · 이전 시스템 인보이스는 여기서 고치지 않음 (VOID 는 다시 발행 · 이전 시스템은 ✏️ 수정 칸)
 * ============================================================ */
import { $, esc, money, R2, toast, busy, openModal, closeModal, confirmBox, bi, bt } from './ui.js';
import { splitByType, dcPrice, lineTotal, dropInvCache, monthsOf, bumpSalesM } from './invoicing.js';
import { loadCatalog, catalog, exactItem, productLine } from './catalog.js';
import { itemSuggest } from './suggest.js';
import { applyMoves, movesOfLines } from './stock.js';

let S = null;
export function setState(state) { S = state; }
/** 이 인보이스를 고칠 수 있나 — 앱에서 발행한 세일즈 인보이스 · VOID 아님 */
export const editable = x => !!(x && x.orderId && x.src !== 'legacy' && x.src !== 'credit' && x.st !== 'x' && x.kind !== 'credit');

/** 줄 · 할인으로 합계 다시 계산 — 발행 때와 같은 식 (splitByType: 할인가를 센트로 반올림 × 수량) */
export function recalc(x, lines) {
  const t = x.t || 'A', g = splitByType(lines.map(l => Object.assign({}, l, { t })), { [t]: x.disc || 0 }, 'q')[t] || { qty: 0, sub: 0, list: 0, total: 0 };
  return { qty: g.qty, sub: g.sub, list: g.list, total: g.total };
}

export async function editInvoice(x, done) {
  if (!editable(x)) return toast(bt('이 인보이스는 여기서 고칠 수 없습니다', 'This invoice cannot be edited here'), 'bad');
  try { await loadCatalog(S); } catch (e) {}
  const L = (x.lines || []).map(l => Object.assign({}, l)), memo0 = x.memo || '';
  L.frt = R2(Number(x.ship) || 0); L.dc = Number(x.disc) || 0;   // 🏷 할인 % (이 인보이스만)   // 🚚 운임 (inv.ship — 합계 · 잔액에 더함, 매출 · 커미션 total 에는 안 들어감)
  const paint = () => {
    const xd = Object.assign({}, x, { disc: L.dc }), r = recalc(xd, L.filter(l => l.q > 0)), old = R2((x.total || 0) + (Number(x.ship) || 0)), now = R2(r.total + L.frt), diff = R2(now - old), bal0 = x.bal != null ? x.bal : old, bal1 = R2(bal0 + diff);
    $('mbox').innerHTML = '<h2>✏️ ' + bi('인보이스 수정', 'Edit invoice') + ' ' + esc(x.no) + '</h2><div class="muted">' + esc(x.store || '') + ' · ' + esc(x.d || '') + ' — ' + bt('합계 · 잔액 · 재고가 같이 맞춰집니다. 받은 수금은 그대로.', 'Total, balance and stock follow. Payments stay.') + '</div>' +
      '<div style="max-height:46vh;overflow:auto;margin-top:8px"><table class="ietbl"><tr><th>' + bt('코드', 'Code') + '</th><th class="r" style="width:70px">' + bt('수량', 'Qty') + '</th><th class="r" style="width:86px">' + bt('가격', 'Price') + '</th><th class="r">' + bt('금액', 'Amount') + '</th><th style="width:34px"></th></tr>' +
      L.map((l, i) => '<tr' + (l.q > 0 ? '' : ' style="opacity:.45"') + '><td><b>' + esc(l.c) + '</b><div class="muted" style="font-size:11.5px">' + esc(l.d || '') + '</div></td><td class="r"><input type="number" inputmode="numeric" min="0" step="1" data-ieq="' + i + '" value="' + (l.q || 0) + '" style="width:62px;text-align:right"></td><td class="r"><input type="number" inputmode="decimal" min="0" step="0.01" data-iep="' + i + '" value="' + l.p + '" style="width:78px;text-align:right"></td><td class="r">' + money(lineTotal(l.q, l.p, L.dc)) + '</td><td><button type="button" class="b-ghost b-sm" data-iex="' + i + '" title="' + esc(bt('줄 지우기', 'Remove line')) + '">🗑</button></td></tr>').join('') + '</table></div>' +
      /* ＋ 아이템 추가 — 코드 칸이 단추에 눌려 안 보이던 것(2026-11-12) → 코드 칸이 줄 대부분 · 치면 맞는 아이템 목록(🔎 suggest.js)에서 고름 (v0.8.200) */
      '<div class="ieadd"><label>＋ ' + bi('아이템 추가', 'Add item') + ' <span class="muted" style="font-weight:400">' + bt('코드 · 이름 일부를 치면 목록이 뜹니다 (예: CV)', 'type part of a code or name (e.g. CV)') + '</span></label><div class="ieaddrow"><input id="ieAdd" placeholder="' + esc(bt('아이템 코드 · 바코드 · 이름', 'Item code · barcode · name')) + '" autocapitalize="characters"><input id="ieAddQ" type="number" inputmode="numeric" min="1" value="1" title="' + esc(bt('수량', 'Qty')) + '"><button type="button" class="b-blue" id="ieAddGo">＋ ' + bi('더하기', 'Add') + '</button></div></div>' +
      '<div class="fg" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><div style="width:120px"><label>🏷 ' + bi('할인', 'Discount') + ' %</label><input id="ieDc" type="number" inputmode="decimal" min="0" max="100" step="0.5" value="' + (L.dc || '') + '" placeholder="0"></div><div style="width:140px"><label>🚚 ' + bi('운임', 'Freight') + ' $</label><input id="ieFrt" type="number" inputmode="decimal" min="0" step="0.01" value="' + (L.frt ? L.frt.toFixed(2) : '') + '" placeholder="0.00"></div><div style="flex:1;min-width:180px"><label>' + bi('인보이스 메모', 'Invoice memo') + '</label><input id="ieMemo" value="' + esc(L.memo != null ? L.memo : memo0) + '"></div></div>' +
      '<div class="kpi" style="margin-top:8px"><div><b>' + money(old) + '</b><span>' + bt('옛 합계', 'Old total') + '</span></div><div><b id="ieNew">' + money(now) + '</b><span>' + bt('새 합계', 'New total') + '</span></div><div><b' + (diff ? ' style="color:' + (diff > 0 ? '#15803d' : '#b91c1c') + '"' : '') + '>' + (diff > 0 ? '+' : '') + money(diff) + '</b><span>' + bt('차이', 'Change') + '</span></div><div><b' + (bal1 < -0.005 ? ' style="color:#b91c1c"' : '') + '>' + money(bal1) + '</b><span>' + bt('새 잔액', 'New balance') + '</span></div></div>' +
      (bal1 < -0.005 ? '<div class="alert a-amb">⚠️ ' + bt('받은 수금이 새 합계보다 많습니다 — 잔액이 마이너스(가게 크레딧)로 남습니다', 'Payments exceed the new total — the balance becomes a credit') + '</div>' : '') +
      '<div class="btns"><button type="button" class="b-ghost" id="ieX">' + bi('닫기', 'Close') + '</button><button type="button" class="b-green" id="ieOk">💾 ' + bi('저장', 'Save') + '</button></div>';
    const keepMemo = () => { const m = $('ieMemo'); if (m) L.memo = m.value; const f = $('ieFrt'); if (f) L.frt = R2(Math.max(0, Number(f.value) || 0)); const dc = $('ieDc'); if (dc) L.dc = Math.max(0, Math.min(100, Number(dc.value) || 0)); };
    $('ieFrt').onchange = () => { keepMemo(); paint(); }; $('ieDc').onchange = () => { keepMemo(); paint(); };
    document.querySelectorAll('[data-ieq]').forEach(el => el.onchange = () => { keepMemo(); L[Number(el.dataset.ieq)].q = Math.max(0, Math.floor(Number(el.value) || 0)); paint(); });
    document.querySelectorAll('[data-iep]').forEach(el => el.onchange = () => { keepMemo(); L[Number(el.dataset.iep)].p = R2(Math.max(0, Number(el.value) || 0)); paint(); });
    document.querySelectorAll('[data-iex]').forEach(el => el.onclick = () => { keepMemo(); L[Number(el.dataset.iex)].q = 0; paint(); });
    const add = () => {
      keepMemo(); const it = exactItem($('ieAdd').value), q = Math.max(1, Math.floor(Number($('ieAddQ').value) || 1));
      if (!it) return toast(bt('맞는 아이템 코드가 없습니다', 'No item with that code'), 'bad');
      const cur = L.find(l => l.c === it.c);
      if (cur) cur.q = (cur.q || 0) + q;
      else { const l = { c: it.c, d: it.d, q, p: it.p, lp: it.p, g: productLine(it) }; if (it.k) l.kit = it.k.map(k => ({ c: k[0], q: k[1] })); L.push(l); }
      paint(); setTimeout(() => { const f = $('ieAdd'); if (f) f.focus(); }, 0);
    };
    $('ieAddGo').onclick = add; $('ieAdd').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
    itemSuggest($('ieAdd'), () => add());   // 🔎 고르면 바로 더함 (수량은 옆 칸)
    $('ieX').onclick = () => (done ? done() : closeModal());
    $('ieOk').onclick = async () => { keepMemo(); await save(x, L, done); };
  };
  if (!$('mbox') || !document.querySelector('#modal.on')) openModal('', { wide: true });
  paint();
}

/** 무엇이 바뀌었나 — 줄 단위 짧은 설명 (기록용) */
function changes(oldL, newL) {
  const o = {}, n = {}, out = [];
  oldL.forEach(l => { o[l.c] = l; }); newL.forEach(l => { n[l.c] = l; });
  Object.keys(Object.assign({}, o, n)).forEach(c => {
    const a = o[c], b = n[c];
    if (!a) out.push('+' + c + ' ' + b.q + '@' + b.p);
    else if (!b) out.push('−' + c);
    else { if (a.q !== b.q) out.push(c + ' ' + a.q + '→' + b.q); if (Number(a.p) !== Number(b.p)) out.push(c + ' $' + a.p + '→$' + b.p); }
  });
  return out;
}

async function save(x, L, done) {
  const lines = L.filter(l => l.q > 0).map(l => { const y = { c: l.c, d: l.d, q: l.q, p: R2(l.p), lp: l.lp != null ? l.lp : l.p, g: l.g || '' }; if (l.kit) y.kit = l.kit; return y; });
  if (!lines.length) return toast(bt('줄이 하나도 없습니다 — 인보이스 전체를 없애려면 VOID 하세요', 'No lines left — void the invoice instead'), 'bad');
  const memo = String(L.memo != null ? L.memo : (x.memo || '')).trim();
  const ch = changes(x.lines || [], lines); if (memo !== (x.memo || '')) ch.push('memo');
  const frt = R2(L.frt != null ? L.frt : (Number(x.ship) || 0)), frt0 = R2(Number(x.ship) || 0); if (frt !== frt0) ch.push('freight $' + frt0 + '→$' + frt);
  const dc = L.dc != null ? L.dc : (Number(x.disc) || 0), dc0 = Number(x.disc) || 0; if (dc !== dc0) ch.push('DC ' + dc0 + '%→' + dc + '%');
  if (!ch.length) return toast(bt('바뀐 것이 없습니다', 'Nothing changed'));
  const r = recalc(Object.assign({}, x, { disc: dc }), lines), old = R2((x.total || 0) + frt0), diff = R2(r.total + frt - old), bal0 = x.bal != null ? x.bal : old, bal = R2(bal0 + diff);
  if (!(await confirmBox('✏️ ' + x.no + ' · ' + money(old) + ' → ' + money(R2(r.total + frt)) + ' (' + (diff >= 0 ? '+' : '') + money(diff) + ')\n' + ch.slice(0, 8).join(' · ') + (ch.length > 8 ? ' …' : '') + '\n' + bt('잔액', 'Balance') + ' ' + money(bal0) + ' → ' + money(bal) + '\n' + bt('저장할까요?', 'Save?'), bt('저장', 'Save')))) return;
  busy(true);
  try {
    const now = new Date().toISOString(), fresh = await S.DB.get('invoices', x.id || x.no);
    if (!fresh || fresh.st === 'x') throw new Error(bt('인보이스가 VOID 됐거나 없습니다', 'Invoice was voided or removed'));
    if (R2(fresh.total) !== R2(x.total) || R2(Number(fresh.ship) || 0) !== frt0) throw new Error(bt('다른 사람이 먼저 고쳤습니다 — 다시 열어 주세요', 'Someone else changed it — reopen'));
    const edits = (fresh.edits || []).concat([{ at: now, by: S.user.email, from: old, to: R2(r.total + frt), what: ch.join(' · ').substring(0, 400) }]);
    const patch = { lines, qty: r.qty, sub: r.sub, list: r.list, disc: dc, total: r.total, ship: frt, bal, memo, edits, editedAt: now, editedBy: S.user.email };
    if (bal < 0.005 && bal > -0.005 && fresh.st === 'open') patch.bal = 0;
    const ops = [{ op: 'update', col: 'invoices', id: x.id || x.no, data: patch }];
    const mDiff = R2(r.total - (x.total || 0));   // 주문 금액은 물건 금액만 (운임 제외)
    if (x.orderId && mDiff) { const o = await S.DB.get('orders', x.orderId); if (o) ops.push({ op: 'update', col: 'orders', id: x.orderId, data: { amt: R2((o.amt || 0) + mDiff), updatedAt: now } }); }
    await S.DB.batch(ops);
    const nx = Object.assign({}, fresh, patch);
    try { await bumpSalesM(S, [fresh], -1); await bumpSalesM(S, [nx], 1); } catch (e) {}
    try { await applyMoves(movesOfLines(fresh.lines || [], 1).concat(movesOfLines(lines, -1)), 'invedit', x.no, bt('인보이스 수정', 'Invoice edited')); } catch (e) { console.warn('stock', e); }   // 📦 옛 줄을 되돌리고 새 줄을 뺌 (차이만 움직임)
    dropInvCache(monthsOf([nx]));
    try { const St = await import('./store.js'); St.dropStoreCache && St.dropStoreCache(); } catch (e) {}
    toast('✏️ ' + x.no + ' → ' + money(R2(r.total + frt)), 'good');
    Object.assign(x, nx);
    if (done) done(); else closeModal();
  } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
  busy(false);
}
