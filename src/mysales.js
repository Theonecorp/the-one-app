/* ============================================================
 *  📈 내 매출 (세일즈맨) — 내 세일즈맨 코드로 발행된 인보이스만 월별로 (다른 사람 것은 규칙상 못 읽음)
 *    invoices where sm == 내 코드, ym in 최근 12달 · VOID(st 'x') 빼고 · 크레딧(CM, 마이너스)은 따로 보여 주고 순매출에 반영
 *    처음엔 폰에 저장해 둔 지난 숫자를 바로 보여 주고 뒤에서 새로 읽음 (snapGet / snapPut)
 * ============================================================ */
import { $, esc, money, R2, Router, bi, bt, sum, snapGet, snapPut } from './ui.js';

let S = null, MON = '';
export function register(state) { S = state; Router.on('mysales', page); }
const mySm = () => String((S.me && S.me.sm) || '').toUpperCase();
/** 최근 n달 (이번 달부터 거꾸로) */
export function lastYms(n, from) {
  const d = from ? new Date(from + '-15T12:00:00') : new Date(), out = [];
  for (let i = 0; i < n; i++) { out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); d.setMonth(d.getMonth() - 1); }
  return out;
}
/** 인보이스 → 달별 요약 { ym: { tot, gross, cr, n, ncr, byT: {A: x}, byStore: {acct: {store, tot, n}}, byDay: {DD: x} } } */
export function summarize(rows, yms) {
  const M = {}; yms.forEach(k => { M[k] = { tot: 0, gross: 0, cr: 0, n: 0, ncr: 0, byT: {}, byStore: {}, byDay: {} }; });
  rows.forEach(x => {
    if (!x || x.st === 'x') return;
    const k = x.ym || String(x.d || '').substring(0, 7), m = M[k]; if (!m) return;
    const t = Number(x.total) || 0, ty = x.t || String(x.no || '').charAt(0) || 'A';
    m.tot = R2(m.tot + t);
    if (t < 0 || ty === 'CM') { m.cr = R2(m.cr + t); m.ncr++; } else { m.gross = R2(m.gross + t); m.n++; }
    m.byT[ty] = R2((m.byT[ty] || 0) + t);
    const s = m.byStore[x.acct || x.store || '—'] = m.byStore[x.acct || x.store || '—'] || { store: x.store || x.acct || '—', tot: 0, n: 0 }; s.tot = R2(s.tot + t); s.n++;
    const dd = String(x.d || '').substring(8, 10) || '00'; m.byDay[dd] = R2((m.byDay[dd] || 0) + t);
  });
  return M;
}
const monLabel = k => { const [y, m] = k.split('-'); return bt(y.substring(2) + '년 ' + Number(m) + '월', ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1] + ' ' + y); };
const pct = (a, b) => b ? Math.round((a - b) / Math.abs(b) * 100) : null;

async function page(arg) {
  const sm = mySm();
  if (!sm) { $('page').innerHTML = '<div class="card"><div class="none">' + bt('세일즈맨 코드가 없습니다 — 관리자에게 코드를 넣어 달라고 하세요', 'No salesman code on your account — ask the administrator') + '</div></div>'; return; }
  const yms = lastYms(12), key = 'mysales.' + sm;
  if (arg && yms.includes(arg)) MON = arg; else if (!MON || !yms.includes(MON)) MON = yms[0];
  const snap = snapGet(key);
  let M = snap && snap.html && snap.html.M ? snap.html.M : null;
  if (M) paint(M, yms, true); else $('page').innerHTML = '<div class="load">' + bt('읽는 중…', 'Loading…') + '</div>';
  try {
    const rows = await S.DB.list('invoices', { where: [['sm', '==', sm], ['ym', 'in', yms]] });
    M = summarize(rows, yms); snapPut(key, { M });
    if (location.hash.indexOf('#/mysales') === 0 || !location.hash) paint(M, yms, false);
  } catch (e) { if (!M) $('page').innerHTML = '<div class="card"><div class="alert a-red">' + esc(e.code || e.message) + '</div></div>'; }
}

function paint(M, yms, old) {
  const sm = mySm(), cur = M[yms[0]] || { tot: 0 }, prev = M[yms[1]] || { tot: 0 }, sel = M[MON] || summarize([], [MON])[MON];
  const max = Math.max(1, ...yms.map(k => Math.abs((M[k] || {}).tot || 0)));
  const yr = yms[0].substring(0, 4), ytd = R2(sum(yms.filter(k => k.substring(0, 4) === yr), k => (M[k] || {}).tot || 0));
  const p = pct(cur.tot, prev.tot);
  const stores = Object.values(sel.byStore || {}).sort((a, b) => b.tot - a.tot);
  const days = Object.keys(sel.byDay || {}).sort();
  $('page').innerHTML =
    '<div class="card"><h2>📈 ' + bi('내 매출', 'My sales') + ' <span class="muted" style="font-weight:600">🧑‍💼 ' + esc(sm) + '</span>' + (old ? ' <span class="tag t-g">' + bt('새로 읽는 중…', 'refreshing…') + '</span>' : '') + '</h2>' +
    '<div class="muted">' + bt('내 코드로 발행된 인보이스만 보입니다 (다른 세일즈맨 것은 안 보임). VOID 는 빼고, 크레딧은 빼서 순매출로.', 'Only invoices issued under your code (no one else\'s). VOIDs excluded; credits subtracted (net).') + '</div>' +
    '<div class="kpi" style="margin-top:8px"><div><b>' + money(cur.tot) + '</b><span>' + bt('이번 달', 'This month') + '<br>' + (cur.n || 0) + bt('장', ' inv') + '</span></div><div><b>' + money(prev.tot) + '</b><span>' + bt('지난달', 'Last month') + (p == null ? '' : '<br><i class="' + (p >= 0 ? 'ok' : 'warn') + '">' + (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p) + '%</i>') + '</span></div><div><b>' + money(ytd) + '</b><span>' + yr + bt('년 누계', ' YTD') + '</span></div></div></div>' +
    '<div class="card"><h2 style="font-size:15px">' + bi('월별', 'By month') + ' <span class="muted" style="font-weight:400">' + bt('누르면 그 달 자세히', 'tap a month for detail') + '</span></h2>' +
    yms.map(k => { const m = M[k] || { tot: 0, n: 0 }, w = Math.round(Math.abs(m.tot) / max * 100);
      return '<div class="pr tap' + (k === MON ? ' pend' : '') + '" data-msm="' + k + '"><div class="ct" style="flex:0 0 74px"><b>' + monLabel(k) + '</b><small>' + (m.n || 0) + bt('장', ' inv') + '</small></div><div style="flex:1;margin:0 8px"><div style="height:12px;border-radius:6px;background:#e2e8f0;overflow:hidden"><div style="height:100%;width:' + w + '%;background:' + (k === yms[0] ? 'var(--blue)' : '#64748b') + '"></div></div></div><div class="pa"><b>' + money(m.tot) + '</b></div></div>'; }).join('') + '</div>' +
    '<div class="card" id="msDetail"><h2 style="font-size:15px">🗓 ' + monLabel(MON) + ' — ' + money(sel.tot) + '</h2>' +
    '<div class="kpi" style="margin:4px 0 8px"><div><b>' + money(sel.gross) + '</b><span>' + bt('매출', 'Sales') + ' ' + (sel.n || 0) + bt('장', '') + '</span></div><div><b>' + money(sel.cr) + '</b><span>' + bt('크레딧', 'Credits') + ' ' + (sel.ncr || 0) + bt('장', '') + '</span></div><div><b>' + money(sel.tot) + '</b><span>' + bt('순매출', 'Net') + '</span></div></div>' +
    (Object.keys(sel.byT || {}).length ? '<div class="chips">' + Object.keys(sel.byT).sort().map(t => '<span class="tag t-c" style="margin:2px">' + esc(t) + ' ' + money(sel.byT[t]) + '</span>').join('') + '</div>' : '') +
    (stores.length ? '<div class="muted" style="margin:8px 0 2px">🏬 ' + bt('가게별', 'By store') + ' (' + stores.length + ')</div>' + stores.slice(0, 30).map(s => '<div class="pr"><div class="ct"><b>' + esc(s.store) + '</b><small>' + s.n + bt('장', ' inv') + '</small></div><div class="pa"><b>' + money(s.tot) + '</b></div></div>').join('') + (stores.length > 30 ? '<div class="hint">' + bt('30곳까지 표시', 'Top 30 shown') + '</div>' : '') : '<div class="none">' + bt('이 달에는 인보이스가 없습니다', 'No invoices this month') + '</div>') +
    (days.length ? '<div class="muted" style="margin:8px 0 2px">📅 ' + bt('날짜별', 'By day') + '</div><div class="chips" style="flex-wrap:wrap">' + days.map(d => '<span class="tag t-g" style="margin:2px">' + Number(d) + bt('일', '') + ' ' + money(sel.byDay[d]) + '</span>').join('') + '</div>' : '') + '</div>';
  document.querySelectorAll('[data-msm]').forEach(el => el.onclick = () => { MON = el.dataset.msm; paint(M, yms, false); const d = $('msDetail'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}
