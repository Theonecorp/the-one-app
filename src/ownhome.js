/* ============================================================
 *  🏠 오너 홈 — 경영 대시보드: 숫자를 체계적으로 (이번 기간 · 지난 기간 · 작년 같은 기간)
 *    ① 매출 (앱 인보이스, 앱 이전 달은 경영 → 매출의 월별 입력 숫자) · ② 현금 흐름 (수단별 수금 · 입금 예정 체크 · 바운스)
 *    ③ 미수금 (총액 · 60일+ · 90일+ · 세일즈맨 · 가게 상위) · ④ 공장 · 지급 · ⑤ 비용 (커미션 예상 · 1099 · 보너스 · 크레딧) · ⑥ 운영 신호
 *    칸을 누르면 그 화면으로. 기간 칩은 담당자 홈과 같음.
 * ============================================================ */
import { $, esc, money, k, R2, num, today, ym, md, Router, sortBy, groupBy, sum, daysBetween, addDays, bi, bt, pickDates, pct } from './ui.js';
import { invoicesBetween, invTypes } from './invoicing.js';
import { PERIODS, periodRange } from './fulfill.js';
import { stageAge } from './flow.js';

let S = null;
const OP = { p: 'month', from: '', to: '' };
export function register(state) { S = state; Router.on('own', page); }
const MAIN = ['month', 'lastm', 'quarter', 'year', 'week'];
const shiftYear = d => String(Number(d.substring(0, 4)) - 1) + d.substring(4);
const delta = (a, b) => b ? '<span class="' + (a >= b ? 'ok' : 'warn') + '">' + (a >= b ? '▲' : '▼') + pct(Math.abs(a - b) / b * 100).replace('%', '') + '%</span>' : '<span class="muted">—</span>';
const tile = (go, h2, hero, sub, body, cls) => '<div class="card tap' + (cls ? ' ' + cls : '') + '" data-og="' + esc(go) + '"><h2>' + h2 + '</h2>' + (hero ? '<div class="hero" style="font-size:26px">' + hero + '</div>' : '') + (sub ? '<div class="heroSub">' + sub + '</div>' : '') + (body || '') + '</div>';
const months = (from, to) => { const L = []; let m = from.substring(0, 7); while (m <= to.substring(0, 7)) { L.push(m); const y = Number(m.substring(0, 4)), mm = Number(m.substring(5, 7)); m = mm === 12 ? (y + 1) + '-01' : y + '-' + String(mm + 1).padStart(2, '0'); } return L; };

async function page(arg) {
  if (arg && PERIODS.some(p => p[0] === arg)) OP.p = arg;
  $('page').innerHTML = '<div class="load">' + bt('경영 자료 읽는 중…', 'Loading…') + '</div>';
  const t = today(), [from, to] = periodRange(OP.p, OP.from, OP.to), days = daysBetween(from, to) + 1, pf = addDays(from, -days), pt = addDays(from, -1), yf = shiftYear(from), yt = shiftYear(to);
  const plabel = PERIODS.find(p => p[0] === OP.p), ptxt = OP.p === 'custom' || !plabel ? md(from) + ' ~ ' + md(to) : plabel[1] + (days > 1 ? ' (' + md(from) + ' ~ ' + md(to) + ')' : ' ' + md(from));
  const q = (c, w) => S.DB.list(c, w).catch(() => []);
  const yms3 = Array.from(new Set(months(pf, to).concat(months(yf, yt))));
  const [invNow, invPrev, invYear, ents, cods, arAll, bounces, orders, p99, acc, dist, mg, comm, manual, manualY] = await Promise.all([
    invoicesBetween(S, from, to).catch(() => []), invoicesBetween(S, pf, pt).catch(() => []), invoicesBetween(S, yf, yt).catch(() => []),
    q('entries', { where: [['ym', 'in', yms3.slice(0, 10)]] }), q('cod', { where: [['ym', 'in', yms3.slice(0, 10)]] }), S.DB.get('ar', '_all').catch(() => null), q('bounces'),
    q('orders', { where: [['ym', 'in', months(addDays(t, -62), t).slice(-3)]] }), q('pay1099'), q('bonusAcc'), q('bonusDist'),
    import('./mg.js').then(M => M.mgNumbers(Number(t.substring(0, 4)))).catch(() => null), import('./boss.js').then(B => B.commEstimate()).catch(() => null),
    S.DB.get('sales', from.substring(0, 4)).catch(() => null), S.DB.get('sales', yf.substring(0, 4)).catch(() => null)]);
  const bank = await import('./bank.js').then(B => B.bankSummary(from, to)).catch(() => null);
  const live = x => x.st !== 'x' && x.src !== 'credit';
  /* ① 매출 — 앱 인보이스 합. 그 달 앱 인보이스가 없으면 경영 → 매출의 월별 입력(TOTAL SALES) 로 */
  const manualOf = (doc, m) => { const r = doc && (doc.rows || []).find(x => x.label === 'TOTAL SALES'); return r && Array.isArray(r.m) ? R2(num(r.m[Number(m.substring(5, 7)) - 1])) : 0; };
  const salesOf = (L, f, tt, doc) => { const app = R2(sum(L.filter(live), x => x.total)); if (app > 0) return { v: app, src: 'app' }; let man = 0; months(f, tt).forEach(m => { man += manualOf(doc, m); }); return { v: R2(man), src: man ? 'manual' : 'app' }; };
  const sNow = salesOf(invNow, from, to, manual), sPrev = salesOf(invPrev, pf, pt, manual), sYear = salesOf(invYear, yf, yt, manualY);
  const types = invTypes(S), commOf = tcode => (types.find(x => x.c === tcode) || {}).comm || (/^P/.test(tcode) ? 'P' : /^W/.test(tcode) ? 'W' : 'A');
  const byT = groupBy(invNow.filter(live), x => commOf(x.t || String(x.no || '').charAt(0))), bySm = sortBy(Object.entries(groupBy(invNow.filter(live), x => x.sm || '—')).map(([sm, L]) => ({ sm, v: R2(sum(L, x => x.total)), n: L.length })), x => x.v, true);
  const credits = R2(-sum(invNow.filter(x => x.st !== 'x' && x.src === 'credit'), x => x.total));
  const salesBody = '<div class="kpi" style="grid-template-columns:repeat(3,1fr)">' + ['A', 'P', 'W'].map(c => '<div><b>' + k(sum(byT[c] || [], x => x.total)) + '</b><span>' + c + ' ' + bt('인보이스', 'invoices') + ' ' + (byT[c] || []).length + '</span></div>').join('') + '</div>' +
    (bySm.length ? '<table style="margin-top:8px;font-size:12.5px"><tr><th>' + bt('세일즈맨', 'Salesman') + '</th><th class="r">' + bt('매출', 'Sales') + '</th><th class="r">' + bt('장', 'Inv') + '</th><th class="r">%</th></tr>' + bySm.slice(0, 6).map(x => '<tr><td><b>' + esc(x.sm) + '</b></td><td class="r">' + money(x.v) + '</td><td class="r muted">' + x.n + '</td><td class="r">' + pct(sNow.v ? x.v / sNow.v * 100 : 0) + '</td></tr>').join('') + '</table>' : '<div class="muted" style="font-size:12px;margin-top:6px">' + (sNow.src === 'manual' ? bt('이 기간은 월별 입력 숫자입니다 (앱 인보이스 없음)', 'Manual monthly figure (no app invoices)') : bt('이 기간 인보이스 없음', 'No invoices in this period')) + '</div>');
  /* ② 현금 흐름 */
  const inR = (x, f, tt) => x.d >= f && x.d <= tt, E = ents.filter(e => !e.void && !e.repl && !e.bounced), Cd = cods.filter(c => !c.void);
  const cash = f => { const m = { CHECK: 0, CASH: 0, ZELLE: 0, COD: 0, ACH: 0, 'CREDIT CARD': 0 }; E.filter(e => inR(e, f[0], f[1])).forEach(e => (e.pays || []).forEach(p => { m[p.m] = R2((m[p.m] || 0) + num(p.amt)); })); Cd.filter(c => inR(c, f[0], f[1])).forEach(c => { m[c.method] = R2((m[c.method] || 0) + num(c.amt)); }); m.total = R2(Object.values(m).reduce((a, v) => a + v, 0)); return m; };
  const cNow = cash([from, to]), cPrev = cash([pf, pt]), cYear = cash([yf, yt]);
  const up = []; E.forEach(e => (e.pays || []).forEach(p => { if (p.m === 'CHECK' && p.dep && p.dep > t && p.dep <= addDays(t, 14)) up.push({ d: p.dep, amt: num(p.amt), hold: !!p.hold }); }));
  const upBy = Object.entries(groupBy(up, x => x.d)).sort().map(([d, L]) => ({ d, amt: sum(L, x => x.amt), n: L.length, hold: L.filter(x => x.hold).length }));
  const bOpen = bounces.filter(b => b.st === 'open' || b.st === 'repl');
  const cashBody = '<div class="kpi" style="grid-template-columns:repeat(3,1fr)">' + [['CHECK', '체크', 'Check'], ['CASH', '현금', 'Cash'], ['ZELLE', 'Zelle', 'Zelle'], ['COD', 'COD', 'COD'], ['ACH', 'ACH', 'ACH'], ['CREDIT CARD', '카드', 'Card']].map(m => '<div><b>' + k(cNow[m[0]] || 0) + '</b><span>' + bt(m[1], m[2]) + '</span></div>').join('') + '</div>' +
    '<div style="font-size:12.5px;margin-top:8px"><b>📅 ' + bt('2주 안 입금 예정 체크', 'Post-dated checks, next 2 weeks') + '</b> ' + money(sum(up, x => x.amt)) + ' · ' + up.length + bt('장', '') + (upBy.length ? '<div class="muted">' + upBy.slice(0, 6).map(x => md(x.d) + ' ' + k(x.amt) + (x.hold ? ' ⏸' + x.hold : '')).join(' · ') + '</div>' : '') + '</div>' +
    (bOpen.length ? '<div class="alert a-red" style="margin-top:6px">↩️ ' + bt('바운스 미해결', 'Open bounces') + ' <b>' + bOpen.length + bt('건', '') + ' · ' + money(sum(bOpen, b => b.amt)) + '</b></div>' : '') +
    (bank ? '<div class="sumbox" style="margin-top:8px">🏦 <b>' + bt('은행 실제', 'Bank actual') + '</b> · ' + bt('입금', 'in') + ' <b style="color:#15803d">' + money(bank.in) + '</b> · ' + bt('출금', 'out') + ' <b style="color:#b91c1c">' + money(bank.out) + '</b>' + (bank.bal != null ? ' · ' + bt('잔액', 'balance') + ' <b>' + money(bank.bal) + '</b> (' + md(bank.balD) + ')' : '') + (bank.factory ? ' · 🏭 ' + bt('공장 송금', 'to factories') + ' ' + k(bank.factory) : '') + (bank.other ? ' · <span class="warn">❓ ' + bank.other + bt('줄 분류 전', ' uncategorized') + '</span>' : '') + ' <span class="muted" style="font-size:11px">(' + bt('경영 → 🏦 은행', 'Business → Bank') + ')</span></div>' : '');
  /* ③ 미수금 */
  const stores = (arAll && arAll.stores) || [], arTot = R2(sum(stores, s => s.total)), over60 = R2(sum(stores, s => (s.b || []).slice(2).reduce((a, v) => a + v, 0))), over90 = R2(sum(stores, s => (s.b || []).slice(3).reduce((a, v) => a + v, 0)));
  const arSm = sortBy(Object.entries(groupBy(stores, s => s.sm || '—')).map(([sm, L]) => ({ sm, tot: sum(L, s => s.total), over: sum(L, s => (s.b || []).slice(2).reduce((a, v) => a + v, 0)) })), x => x.over, true).slice(0, 5);
  const arStores = sortBy(stores.map(s => ({ store: s.store, sm: s.sm, over: (s.b || []).slice(2).reduce((a, v) => a + v, 0), tot: s.total })).filter(s => s.over > 0.5), x => x.over, true).slice(0, 5);
  const arBody = '<div class="kpi" style="grid-template-columns:repeat(3,1fr)"><div' + (over60 > arTot * 0.3 ? ' style="background:#fef3c7"' : '') + '><b>' + k(over60) + '</b><span>60' + bt('일 넘음', 'd+') + ' ' + pct(arTot ? over60 / arTot * 100 : 0) + '</span></div><div' + (over90 > 0 ? ' style="background:#fee2e2"' : '') + '><b>' + k(over90) + '</b><span>90' + bt('일 넘음', 'd+') + ' ' + pct(arTot ? over90 / arTot * 100 : 0) + '</span></div><div><b>' + k(sum(bOpen, b => b.amt)) + '</b><span>↩️ ' + bt('바운스 홀드', 'Bounce hold') + '</span></div></div>' +
    (arSm.length ? '<table style="margin-top:8px;font-size:12.5px"><tr><th>' + bt('세일즈맨', 'Salesman') + '</th><th class="r">' + bt('미수', 'A/R') + '</th><th class="r">60' + bt('일+', 'd+') + '</th></tr>' + arSm.map(x => '<tr><td><b>' + esc(x.sm) + '</b></td><td class="r">' + money(x.tot) + '</td><td class="r ' + (x.over > 0 ? 'warn' : '') + '">' + money(x.over) + '</td></tr>').join('') + '</table>' : '') +
    (arStores.length ? '<div class="muted" style="font-size:12px;margin-top:6px">' + bt('연체 많은 가게', 'Most overdue stores') + ': ' + arStores.map(s => esc(s.store) + ' ' + k(s.over)).join(' · ') + '</div>' : '') + (arAll && arAll.asOf ? '<div class="muted" style="font-size:11.5px">' + bt('AR 기준일', 'as of') + ' ' + esc(arAll.asOf) + '</div>' : '');
  /* ④ 공장 · 지급 */
  const F = (mg && mg.facs) || [], fBal = R2(sum(F, f => f.balance)), fBuy = R2(sum(F, f => f.buy)), fPaid = R2(sum(F, f => f.paid));
  const facBody = F.length ? '<table style="margin-top:4px;font-size:12.5px"><tr><th>' + bt('공장', 'Factory') + '</th><th class="r">' + bt('잔액', 'Balance') + '</th><th class="r">' + t.substring(0, 4) + ' ' + bt('구매', 'Buy') + '</th><th class="r">' + bt('송금', 'Paid') + '</th><th class="r">' + bt('운임%', 'Frt%') + '</th></tr>' + sortBy(F, f => f.balance, true).map(f => { const st = f.stmt && f.stmt[t.substring(0, 4)]; const bad = st && st.balance != null && Math.abs(f.balance - st.balance) > 0.011; return '<tr><td><b>' + esc(f.name) + '</b>' + (bad ? ' <span class="tag t-r">≠ 📄</span>' : '') + '</td><td class="r"><b>' + money(f.balance) + '</b></td><td class="r">' + k(f.buy) + '</td><td class="r" style="color:#15803d">' + k(f.paid) + '</td><td class="r ' + (f.frtPct > 15 ? 'warn' : '') + '">' + pct(f.frtPct) + '</td></tr>'; }).join('') + '</table>' : '<div class="none">' + bt('공장 자료 없음', 'No factory data') + '</div>';
  /* ⑤ 비용 */
  const y0 = t.substring(0, 4), p99Y = R2(sum(p99.filter(r => !r.void && String(r.d || '').startsWith(y0)), r => r.amt)), bonusAvail = R2(sum(acc.filter(a => !a.void), a => a.amt) - sum(dist, d => d.sum || 0));
  const costBody = '<div class="kpi" style="grid-template-columns:repeat(2,1fr)"><div><b>' + (comm ? money(comm.pay) : '—') + '</b><span>💵 ' + bt('커미션 예상', 'Commission est.') + (comm ? ' · ' + esc(comm.label) : '') + '</span></div><div><b>' + money(p99Y) + '</b><span>🧾 1099 ' + y0 + ' ' + bt('누계', 'YTD') + '</span></div><div><b>' + money(bonusAvail) + '</b><span>🎁 ' + bt('오피스 보너스 적립', 'Office bonus pool') + '</span></div><div' + (credits > 0 ? ' style="background:#fef3c7"' : '') + '><b>' + money(credits) + '</b><span>↩ ' + bt('크레딧 발행', 'Credits issued') + '</span></div></div>' + (comm && comm.pend ? '<div class="muted" style="font-size:12px;margin-top:6px">' + bt('정산 확인 전 줄', 'Unverified settlement lines') + ' ' + comm.pend + bt('건', '') + ' · ' + bt('체크 수령 대기', 'awaiting checks') + ' ' + comm.wait + bt('건', '') + '</div>' : '');
  /* ⑥ 운영 신호 */
  const LIVE = ['sent', 'pick', 'ok', 'picked', 'done', 'packed'], lateN = orders.filter(o => LIVE.includes(o.st)).filter(o => { const a = stageAge(o); return a && a.day; }).length, cfN = orders.filter(o => o.cfReq && !o.cfOk && o.st !== 'x').length;
  const newAcc = (S.accounts || []).filter(a => a.createdAt && String(a.createdAt).substring(0, 10) >= from && String(a.createdAt).substring(0, 10) <= to).length, pendAcc = (S.accounts || []).filter(a => a.pending).length;
  const lastBy = {}; E.forEach(e => { if (!lastBy[e.sm] || e.d > lastBy[e.sm]) lastBy[e.sm] = e.d; });
  const quiet = (S.sms || []).filter(s => s.active !== false).map(s => ({ sm: s.code, d: lastBy[s.code] || '', days: lastBy[s.code] ? daysBetween(lastBy[s.code], t) : 99 })).filter(x => x.days >= 3).sort((a, b) => b.days - a.days);
  const sig = (n, label, bad) => '<div' + (bad && n ? ' style="background:#fee2e2"' : '') + '><b>' + n + '</b><span>' + label + '</span></div>';
  const opsBody = '<div class="kpi" style="grid-template-columns:repeat(4,1fr)">' + sig(lateN, '⏱ ' + bt('하루 넘은 주문', 'Orders > 1 day'), true) + sig(cfN, '❓ ' + bt('확인 대기', 'Awaiting confirm'), true) + sig(newAcc + (pendAcc ? '<small>+' + pendAcc + '</small>' : ''), '🆕 ' + bt('신규 거래처', 'New accounts')) + sig(quiet.length, '📵 ' + bt('3일+ 입력 없음', 'Quiet 3d+'), true) + '</div>' + (quiet.length ? '<div class="muted" style="font-size:12px;margin-top:6px">' + quiet.slice(0, 6).map(x => esc(x.sm) + ' ' + (x.d ? x.days + bt('일', 'd') : bt('기록 없음', 'none'))).join(' · ') + '</div>' : '');
  /* 그리기 */
  const chips = '<div class="chips" style="margin:0 0 6px">' + PERIODS.filter(c => MAIN.includes(c[0])).map(c => '<button class="' + (OP.p === c[0] ? 'on' : '') + '" data-op="' + c[0] + '">' + c[1] + ' <span class="en">' + c[2] + '</span></button>').join('') + '<button class="' + (MAIN.includes(OP.p) ? '' : 'on') + '" id="opCal">📅 ' + bi('날짜 선택', 'Pick dates') + '</button></div>';
  const cmp = (a, b, c) => bt('지난 기간', 'prev') + ' ' + money(b) + ' ' + delta(a, b) + ' · ' + bt('작년 같은 기간', 'last year') + ' ' + money(c) + ' ' + delta(a, c);
  $('page').innerHTML = '<div class="card" style="padding:12px 14px 6px"><h2 style="margin:0 0 8px">🏭 ' + bi('경영 대시보드', 'Business dashboard') + ' — ' + esc(ptxt) + '</h2>' + chips + '</div>' +
    tile('mg/sales', '📈 ' + bi('매출', 'Sales') + (sNow.src === 'manual' ? ' <span class="tag t-g">' + bt('월별 입력', 'manual') + '</span>' : ''), money(sNow.v), cmp(sNow.v, sPrev.v, sYear.v), salesBody) +
    tile('now', '💵 ' + bi('현금 흐름 — 들어온 돈', 'Cash in'), money(cNow.total), cmp(cNow.total, cPrev.total, cYear.total), cashBody) +
    tile('bossar', '💰 ' + bi('미수금', 'Receivables'), money(arTot), stores.length + bt('곳', ' stores') + ' · ' + bt('60일 넘음', 'over 60d') + ' ' + pct(arTot ? over60 / arTot * 100 : 0), arBody) +
    tile('mg/fac', '🏭 ' + bi('공장 · 지급', 'Factories'), money(fBal), bt('미지급 잔액', 'unpaid') + ' · ' + t.substring(0, 4) + ' ' + bt('구매', 'buy') + ' ' + k(fBuy) + ' · ' + bt('송금', 'paid') + ' ' + k(fPaid), facBody) +
    tile('pay', '🧾 ' + bi('비용 · 지급', 'Costs'), '', '', costBody) +
    tile('flow', '🚦 ' + bi('운영 신호', 'Operations'), '', '', opsBody);
  document.querySelectorAll('[data-op]').forEach(b => b.onclick = () => { OP.p = b.dataset.op; page(); });
  $('opCal').onclick = async () => { const r = await pickDates({ from, to }); if (r) { OP.p = 'custom'; OP.from = r[0]; OP.to = r[1]; page(); } };
  document.querySelectorAll('[data-og]').forEach(el => el.onclick = () => { const [r, a] = el.dataset.og.split('/'); if (a) Router.go(r, a); else Router.go(r); });
}
