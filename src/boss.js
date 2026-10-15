/* ============================================================
 *  루크 화면 — 현황 · 정산 · 미수금 · 경영
 * ============================================================ */
import { $, esc, money, k, num, R2, today, ym, md, dlabel, toast, busy, openModal, closeModal, confirmBox, Router, inputDate, sel, sum, sortBy, groupBy, printOpen, daysBetween, pct, addDays } from './ui.js';
import { newId } from './db.js';
import { lineOfEntry, lineOfOther, computeComm, ratesOf, commSettings, SEC_LABEL } from './comm.js';
import { settlementHtml } from './sales.js';

let S = null, C = { ents: null, cod: null, at: 0 };
export function register(state) {
  S = state;
  Router.on('now', pageNow); Router.on('pay', pagePay); Router.on('bossar', pageAR); Router.on('mg', pageMg);
}
function recentYms(n) { const out = [], d = new Date(); for (let i = 0; i < n; i++) { out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); d.setMonth(d.getMonth() - 1); } return out; }
async function loadAll(force) {
  if (C.ents && !force && Date.now() - C.at < 120000) return C;
  const yms = recentYms(13);
  const [e1, c1] = await Promise.all([S.DB.list('entries', { where: [['ym', 'in', yms.slice(0, 13)]] }), S.DB.list('cod', { where: [['ym', 'in', yms.slice(0, 13)]] })]);
  C.ents = e1.filter(x => !x.void); C.cod = c1.filter(x => !x.void); C.at = Date.now();
  return C;
}
/** 모든 수금을 한 모양으로 {d, sm, store, acct, amt, src} */
function allRows() {
  const out = [];
  C.ents.forEach(e => { if (e.repl) return; out.push({ d: e.d, ym: e.ym, sm: e.sm, store: e.store, acct: e.acct, amt: e.total, src: 'FIELD', id: e.id }); });
  C.cod.forEach(c => out.push({ d: c.d, ym: c.ym, sm: c.sm, store: c.store, acct: c.acct, amt: c.amt, src: c.method === 'ACH' ? 'ACH' : c.method === 'CREDIT CARD' ? 'CARD' : 'COD', id: c.id }));
  return out;
}

/* ============================================================
 *  ① 현황
 * ============================================================ */
async function pageNow() {
  $('page').innerHTML = '<div class="load">읽는 중…</div>';
  await loadAll();
  const rows = allRows(), t = today(), tm = ym(t), prevM = recentYms(2)[1];
  const cur = rows.filter(r => r.ym === tm), prev = rows.filter(r => r.ym === prevM), tod = rows.filter(r => r.d === t);
  const dayN = Number(t.substring(8, 10)), prevSame = prev.filter(r => Number(r.d.substring(8, 10)) <= dayN);
  const bySm = groupBy(cur, r => r.sm), smList = sortBy(Object.keys(bySm).map(s => ({ sm: s, amt: sum(bySm[s], r => r.amt), n: bySm[s].length, stores: new Set(bySm[s].map(r => r.acct || r.store)).size })), x => x.amt, true);
  const bySrc = groupBy(cur, r => r.src);
  const series = recentYms(13).reverse().map(m => ({ ym: m, amt: sum(rows.filter(r => r.ym === m), r => r.amt) }));
  const max = Math.max(1, ...series.map(x => x.amt));
  const wait = C.ents.filter(e => !e.settled && e.sb && !e.rc && !e.repl), pend = C.ents.filter(e => !e.settled && e.rc && !e.v && !e.repl), bad = C.ents.filter(e => e.mismatch && !e.settled);
  const quiet = S.sms.filter(s => s.active !== false).map(s => { const last = sortBy(C.ents.filter(e => e.sm === s.code), e => e.d, true)[0]; return { sm: s.code, days: last ? daysBetween(last.d, t) : 999 }; }).filter(x => x.days >= 5);
  let h = '<div class="card"><h2>이번 달 수금 (' + tm + ')</h2><div class="hero">' + money(sum(cur, r => r.amt)) + '</div><div class="heroSub">' + cur.length + '건 · 지난달 같은 날짜까지 ' + money(sum(prevSame, r => r.amt)) + ' ' + pct(sum(cur, r => r.amt), sum(prevSame, r => r.amt)) + '</div>' +
    '<div class="kpi"><div><b>' + money(sum(tod, r => r.amt)) + '</b><span>오늘 ' + tod.length + '건</span></div><div><b>' + money(sum(prev, r => r.amt)) + '</b><span>지난달</span></div><div><b>' + pend.length + '</b><span>정산 확인 대기</span></div><div><b>' + wait.length + '</b><span>체크 수령 대기</span></div></div>' +
    '<div class="bars">' + series.map((x, i) => '<div class="b' + (i === series.length - 1 ? ' on' : '') + '" style="height:' + Math.max(2, Math.round(x.amt / max * 78)) + 'px" data-v="' + x.ym.substring(5) + '월 ' + k(x.amt) + '"></div>').join('') + '</div><div class="xlab"><span>' + series[0].ym + '</span><span>' + tm + '</span></div></div>';
  if (quiet.length || bad.length) h += '<div class="card"><h2>신경 쓸 것</h2>' + (quiet.length ? '<div class="alert a-amb">😶 ' + quiet.map(q => esc(q.sm) + ' ' + (q.days >= 999 ? '기록 없음' : q.days + '일째 입력 없음')).join(' · ') + '</div>' : '') + (bad.length ? '<div class="alert a-red">⚠️ 인보이스 차액 ' + bad.length + '건 — 정산 전에 담당자가 고쳐야 합니다</div>' : '') + '</div>';
  h += '<div class="two-col"><div class="card"><h2>세일즈맨별 (이번 달)</h2><table>' + smList.map((x, i) => '<tr class="tap" data-smv="' + esc(x.sm) + '"><td><span class="muted">' + (i + 1) + '</span> <b>' + esc(x.sm) + '</b><br><small class="muted">' + x.n + '건 · ' + x.stores + '곳</small></td><td class="r"><b>' + money(x.amt) + '</b></td></tr>').join('') + '</table></div>' +
    '<div class="card"><h2>수단별 (이번 달)</h2><table>' + [['FIELD', '현장 (체크·캐쉬·Zelle)', 't-f'], ['COD', 'COD', 't-c'], ['ACH', 'ACH', 't-a'], ['CARD', '카드', 't-k']].filter(x => bySrc[x[0]]).map(x => '<tr><td><span class="tag ' + x[2] + '">' + x[1] + '</span></td><td class="r"><b>' + money(sum(bySrc[x[0]], r => r.amt)) + '</b> <span class="muted">' + Math.round(sum(bySrc[x[0]], r => r.amt) / Math.max(1, sum(cur, r => r.amt)) * 100) + '%</span></td></tr>').join('') + '</table></div></div>';
  $('page').innerHTML = h;
  document.querySelectorAll('[data-smv]').forEach(el => el.onclick = () => smDetail(el.dataset.smv));
}
function smDetail(sm) {
  const rows = allRows().filter(r => r.sm === sm), tm = ym(today());
  const cur = sortBy(rows.filter(r => r.ym === tm), r => r.d, true);
  const series = recentYms(6).reverse().map(m => ({ m, amt: sum(rows.filter(r => r.ym === m), r => r.amt) }));
  openModal('<h2>' + esc(sm) + '</h2><div class="heroSub">이번 달 <b>' + money(sum(cur, r => r.amt)) + '</b> · ' + cur.length + '건</div><div class="kpi" style="grid-template-columns:repeat(6,1fr)">' + series.map(x => '<div><b style="font-size:11px">' + k(x.amt) + '</b><span>' + x.m.substring(5) + '월</span></div>').join('') + '</div>' +
    '<table style="margin-top:8px">' + cur.slice(0, 60).map(r => '<tr><td>' + md(r.d) + ' <b>' + esc(r.store) + '</b> <span class="tag ' + ({ FIELD: 't-f', COD: 't-c', ACH: 't-a', CARD: 't-k' })[r.src] + '">' + r.src + '</span></td><td class="r">' + money(r.amt) + '</td></tr>').join('') + '</table>');
}

/* ============================================================
 *  ② 정산 — ② 체크 수령된 줄 + COD/카드/ACH 를 보고 ✓ → 정산서 → 확정
 * ============================================================ */
let P = { sm: '', from: '', to: '' };
function presets() {
  const t = today(), y = Number(t.substring(0, 4)), m = Number(t.substring(5, 7)), d = Number(t.substring(8, 10));
  const mk = (yy, mm) => { const last = new Date(yy, mm, 0).getDate(); const p = yy + '-' + String(mm).padStart(2, '0'); return [{ k: p + 'a', label: mm + '월 1~15', from: p + '-01', to: p + '-15' }, { k: p + 'b', label: mm + '월 16~' + last, from: p + '-16', to: p + '-' + last }]; };
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  const list = mk(py, pm).concat(mk(y, m));
  return { list, cur: (d <= 15 ? y + '-' + String(m).padStart(2, '0') + 'a' : y + '-' + String(m).padStart(2, '0') + 'b') };
}
async function pagePay() {
  $('page').innerHTML = '<div class="load">읽는 중…</div>';
  await loadAll(true);
  const pr = presets(); if (!P.from) { const c = pr.list.find(x => x.k === pr.cur); P.from = c.from; P.to = c.to; }
  const inRange = r => (!P.from || r.d >= P.from) && (!P.to || r.d <= P.to);
  const live = C.ents.filter(e => !e.settled && !e.repl && inRange(e)), cods = C.cod.filter(c => !c.settled && inRange(c));
  const smSet = {}; live.forEach(e => { smSet[e.sm] = 1; }); cods.forEach(c => { smSet[c.sm] = 1; });
  const smList = sortBy(Object.keys(smSet), x => x);
  if (!P.sm || !smSet[P.sm]) P.sm = smList[0] || '';
  const mine = live.filter(e => e.sm === P.sm), myCod = cods.filter(c => c.sm === P.sm);
  const ready = mine.filter(e => e.rc), wait = mine.filter(e => !e.rc);
  const cards = smList.map(sm => { const a = live.filter(e => e.sm === sm), b = cods.filter(c => c.sm === sm); return { sm, n: a.filter(e => e.rc).length + b.length, v: a.filter(e => e.rc && e.v).length + b.filter(c => c.v).length, amt: sum(a.filter(e => e.rc), e => e.total) + sum(b, c => c.amt) }; });
  let h = '<div class="card"><h2>🧾 정산</h2><div class="chips">' + pr.list.map(x => '<button class="' + (P.from === x.from && P.to === x.to ? 'on' : '') + '" data-pp="' + x.from + '|' + x.to + '">' + x.label + '</button>').join('') + '</div>' +
    '<div class="two" style="margin-top:4px">' + inputDate('pFrom', P.from) + inputDate('pTo', P.to) + '</div>' +
    '<div class="chips">' + cards.map(c => '<button class="' + (P.sm === c.sm ? 'on' : '') + '" data-ps="' + esc(c.sm) + '">' + esc(c.sm) + ' ' + c.v + '/' + c.n + '</button>').join('') + '</div></div>';
  if (!P.sm) { h += '<div class="card"><div class="none">이 기간에 정산할 줄이 없습니다</div></div>'; $('page').innerHTML = h; bindPayHead(); return; }
  const lines = ready.map(lineOfEntry).concat(myCod.map(lineOfOther)).filter(L => L.v);
  const c = computeComm(lines, ratesOf(S.smByCode[P.sm]), commSettings(S.settings));
  h += '<div class="card"><h2>' + esc(P.sm) + ' — ✓ 한 줄 ' + lines.length + '건 · 지급액 <b>' + money(c.pay) + '</b></h2>' +
    (c.skipped.length ? '<div class="alert a-red">🔴 금액 오류로 제외 ' + c.skipped.length + '건 — ' + c.skipped.map(s => esc(s.store) + ' (' + esc(s.why) + ')').join(' · ') + '</div>' : '') +
    (wait.length ? '<div class="alert a-blu">📥 체크 수령 대기 ' + wait.length + '건 (' + money(sum(wait, e => e.total)) + ') 은 담당자가 ② 를 눌러야 올라옵니다</div>' : '') +
    '<div class="btns"><button class="b-ghost" id="pAll">전부 ✓</button><button class="b-ghost" id="pNone">전부 해제</button><button class="b-blue" id="pStmt">정산서 보기</button></div></div>';
  const rowHtml = (x, isCod) => '<div class="pr tap ' + (x.v ? 'v' : '') + (x.mismatch ? ' bad' : '') + '" data-pl="' + (isCod ? 'c' : 'e') + '|' + x.id + '"><div class="mk">' + (x.v ? '✓' : '·') + '</div><div class="ct"><b>' + md(x.d) + ' ' + esc(x.store) + (isCod ? ' <span class="tag ' + (x.method === 'ACH' ? 't-a' : x.method === 'COD' ? 't-c' : 't-k') + '">' + esc(x.method) + '</span>' : '') + '</b><small>' + (isCod ? esc(x.ref || '') : (x.pays || []).map(p => (p.m === 'CHECK' ? '#' + p.ref : p.m) + ' ' + money(p.amt)).join(' · ')) + ((x.invs || []).length ? ' · ' + x.invs.map(v => v.no + (v.amt ? ' ' + money(v.amt) : '')).join(', ') : '') + (x.mismatch ? ' · ⚠️ ' + esc(x.mismatch) : '') + (x.vn ? ' · 📝 ' + esc(x.vn) : '') + '</small></div><div class="pa"><b>' + money(isCod ? x.amt : x.total) + '</b>' + (x.disc !== '' && x.disc != null ? '<small>할인 ' + x.disc + '%</small>' : '') + '</div></div>';
  const byDay = groupBy(sortBy(ready, e => e.d), e => e.d);
  h += '<div class="card"><h2>현장 수금 (② 체크 수령 완료)</h2>' + (ready.length ? Object.keys(byDay).sort().map(d => '<div class="dayhd"><span>' + dlabel(d) + '</span><span>' + money(sum(byDay[d], e => e.total)) + '</span></div>' + byDay[d].map(e => rowHtml(e, false)).join('')).join('') : '<div class="none">없음</div>') + '</div>';
  h += '<div class="card"><h2>COD · 카드 · ACH</h2>' + (myCod.length ? sortBy(myCod, c => c.d).map(c => rowHtml(c, true)).join('') : '<div class="none">없음</div>') + '</div>';
  h += '<div class="sticky"><button class="b-green" id="pConfirm">✅ 확정 — 정산서 저장 · 보관 (' + money(c.pay) + ')</button></div>';
  $('page').innerHTML = h;
  bindPayHead();
  const toggle = async (kind, id) => { const col = kind === 'c' ? 'cod' : 'entries', arr = kind === 'c' ? C.cod : C.ents, x = arr.find(y => y.id === id); if (!x) return; x.v = !x.v; try { await S.DB.update(col, id, { v: x.v, vAt: today() }); } catch (e) { toast('실패: ' + e.message, 'bad'); x.v = !x.v; } pagePay(); };
  document.querySelectorAll('[data-pl]').forEach(el => el.onclick = () => { const [kind, id] = el.dataset.pl.split('|'); toggle(kind, id); });
  const setAll = async (v) => { busy(true); const ops = []; ready.forEach(e => { if (!!e.v !== v) { e.v = v; ops.push({ op: 'update', col: 'entries', id: e.id, data: { v, vAt: today() } }); } }); myCod.forEach(c => { if (!!c.v !== v) { c.v = v; ops.push({ op: 'update', col: 'cod', id: c.id, data: { v, vAt: today() } }); } }); try { if (ops.length) await S.DB.batch(ops); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); pagePay(); };
  $('pAll').onclick = () => setAll(true); $('pNone').onclick = () => setAll(false);
  $('pStmt').onclick = () => printOpen(settlementHtml({ sm: P.sm, day: today(), from: P.from, to: P.to, comm: stmtComm(c) }));
  $('pConfirm').onclick = () => confirmSettle(c, lines);
}
function bindPayHead() {
  document.querySelectorAll('[data-pp]').forEach(b => b.onclick = () => { const [f, t] = b.dataset.pp.split('|'); P.from = f; P.to = t; pagePay(); });
  document.querySelectorAll('[data-ps]').forEach(b => b.onclick = () => { P.sm = b.dataset.ps; pagePay(); });
  $('pFrom').onchange = () => { P.from = $('pFrom').value; pagePay(); }; $('pTo').onchange = () => { P.to = $('pTo').value; pagePay(); };
}
function stmtComm(c) {
  return { lines: c.lines.map(L => ({ d: L.d, store: L.store, acct: L.acct, methods: L.methods.join(', '), e: L.e, f: L.f, invs: L.invs.join(','), P: R2(L.P), W: R2(L.W), sec: L.sec, src: L.src, part: L.part || '', ids: L.ids })),
    totals: c.totals, buckets: c.buckets, net: c.net, dp: c.dp, office: c.office, pay: c.pay, skipped: c.skipped, specialTitle: commSettings(S.settings).SPECIAL_TITLE };
}
async function confirmSettle(c, lines) {
  if (!lines.length) return toast('✓ 한 줄이 없습니다', 'bad');
  if (!(await confirmBox(P.sm + ' 정산을 확정할까요? ' + lines.length + '줄 · 지급액 ' + money(c.pay) + '. 확정하면 이 줄들은 정산 목록에서 빠지고 정산서가 보관됩니다.', '확정'))) return;
  busy(true);
  try {
    const id = newId('S'), day = today();
    const okKeys = new Set(c.lines.map(L => L.key));
    const ids = lines.filter(L => okKeys.has(L.key));
    const ops = [{ op: 'set', col: 'settlements', id, data: { id, sm: P.sm, day, from: P.from, to: P.to, n: ids.length, pay: c.pay, net: c.net, office: c.office.amt, dp: c.dp.amt, total: c.totals.total, comm: stmtComm(c), createdBy: S.user.email, createdAt: new Date().toISOString() } }];
    ids.forEach(L => ops.push({ op: 'update', col: L.src === 'FIELD' ? 'entries' : 'cod', id: L.key, data: { settled: id, settledAt: day } }));
    /* 오피스 보너스 적립 (3.5%) · 커미션 세일즈맨 1099 — 경영 모듈 */
    if (c.office.amt > 0) ops.push({ op: 'set', col: 'bonusAcc', id: 'B' + id, data: { id: 'B' + id, d: day, sm: P.sm, amt: c.office.amt, src: '정산 확정', note: '정산 ' + P.sm + ' ' + day, ref: id } });
    const payee = (await S.DB.list('payees', { where: [['who', '==', P.sm]] }))[0];
    if (payee && payee.kind === '커미션' && c.pay > 0) ops.push({ op: 'set', col: 'pay1099', id: 'N' + id, data: { id: 'N' + id, d: day, who: P.sm, co: payee.co || '', amt: c.pay, note: '정산 확정', ref: id } });
    await S.DB.batch(ops);
    toast('확정했습니다 — ' + P.sm + ' ' + money(c.pay), 'good');
    printOpen(settlementHtml({ sm: P.sm, day, from: P.from, to: P.to, comm: stmtComm(c) }));
    C.at = 0; P.sm = '';
  } catch (e) { toast('실패: ' + e.message, 'bad'); }
  busy(false);
}

/* ============================================================
 *  ③ 미수금 (회사 전체)
 * ============================================================ */
let AV = 'sm';
async function pageAR() {
  $('page').innerHTML = '<div class="load">읽는 중…</div>';
  const all = await S.DB.get('ar', '_all');
  if (!all || !all.stores) { $('page').innerHTML = '<div class="card"><div class="none">아직 올라온 AR 이 없습니다 — 담당자 화면 📤 AR 에서 올립니다</div></div>'; return; }
  await loadAll();
  const asOf = all.asOf, paid = {};
  C.ents.forEach(e => { if (e.d <= asOf || e.repl) return; (e.invs || []).forEach(v => { const kk = (v.acct || e.acct) + '|' + v.no; paid[kk] = R2((paid[kk] || 0) + num(v.amt)); }); });
  const stores = all.stores.map(s => { let net = 0; const b = [0, 0, 0, 0, 0]; (s.invs || []).forEach(v => { const p = paid[s.acct + '|' + v.inv] || 0, bal = R2(v.bal - p); net += bal; if (bal > 0) b[Math.max(0, Math.min(4, v.bk || 0))] += bal; }); return Object.assign({}, s, { net: R2(net), b: b.map(R2), maxPdd: Math.max(0, ...(s.invs || []).map(v => v.pdd || 0)) }); }).filter(s => s.net > 0.005);
  const total = sum(stores, s => s.net), bk = [0, 1, 2, 3, 4].map(i => sum(stores, s => s.b[i]));
  const bySm = groupBy(stores, s => s.sm || '(없음)');
  const smRows = sortBy(Object.keys(bySm).map(sm => ({ sm, total: sum(bySm[sm], s => s.net), n: bySm[sm].length, over90: sum(bySm[sm], s => s.b[4]) })), x => x.total, true);
  const top = sortBy(stores, s => s.net, true).slice(0, 30), stale = sortBy(stores.filter(s => !s.lastPaid || daysBetween(s.lastPaid, today()) > 60), s => s.net, true).slice(0, 30);
  let h = '<div class="card"><h2>💰 회사 미수금 <span class="muted">기준일 ' + esc(asOf) + ' (' + daysBetween(asOf, today()) + '일 전)</span></h2><div class="hero">' + money(total) + '</div><div class="heroSub">' + stores.length + '곳 · 90일+ ' + money(bk[4]) + ' (' + Math.round(bk[4] / Math.max(1, total) * 100) + '%)' + (all.noSmAmt ? ' · 담당 없음 ' + money(all.noSmAmt) : '') + '</div>' +
    '<div class="kpi" style="grid-template-columns:repeat(5,1fr)">' + ['기한 전', '1-30', '31-60', '61-90', '90+'].map((l, i) => '<div><b style="font-size:11.5px">' + k(bk[i]) + '</b><span>' + l + '</span></div>').join('') + '</div>' +
    '<div class="chips">' + [['sm', '세일즈맨별'], ['top', '큰 순 30'], ['stale', '60일+ 수금 없음']].map(c => '<button class="' + (AV === c[0] ? 'on' : '') + '" data-av="' + c[0] + '">' + c[1] + '</button>').join('') + '</div></div>';
  if (AV === 'sm') h += '<div class="card"><table><tr><th>세일즈맨</th><th class="r">미수금</th><th class="r">90일+</th><th class="r">곳</th></tr>' + smRows.map(x => '<tr><td><b>' + esc(x.sm) + '</b></td><td class="r"><b>' + money(x.total) + '</b></td><td class="r ' + (x.over90 / Math.max(1, x.total) > 0.5 ? 'warn' : '') + '">' + k(x.over90) + '</td><td class="r">' + x.n + '</td></tr>').join('') + '</table></div>';
  else { const L = AV === 'top' ? top : stale; h += '<div class="card">' + L.map(s => '<div class="pr"><div class="ct"><b>' + esc(s.store) + '</b><small>' + esc(s.acct) + ' · ' + esc(s.sm || '담당 없음') + (s.lastPaid ? ' · 마지막 수금 ' + md(s.lastPaid) : ' · 수금 기록 없음') + (s.dormant ? ' · 💤' : '') + '</small></div><div class="pa"><b>' + money(s.net) + '</b><small class="' + (s.maxPdd > 90 ? 'warn' : '') + '">' + (s.maxPdd > 0 ? s.maxPdd + '일 연체' : '') + '</small></div></div>').join('') + '</div>'; }
  $('page').innerHTML = h;
  document.querySelectorAll('[data-av]').forEach(b => b.onclick = () => { AV = b.dataset.av; pageAR(); });
}

/* ============================================================
 *  ④ 경영 — 다음 단계 (공장 · 1099 · 보너스 · 매출)
 * ============================================================ */
async function pageMg() {
  $('page').innerHTML = '<div class="card"><h2>🏭 경영</h2><div class="none">공장 장부 · 1099 · 오피스 보너스 · 회사 매출은 다음 단계에서 이 자리에 들어옵니다.<br>그때까지는 대시보드 구글 시트(b18)를 그대로 쓰세요.</div></div>';
}
