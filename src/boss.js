/* ============================================================
 *  루크 화면 — 옛 수금 대시보드(b20) 와 같은 흐름
 *    현황: 이번 달 · 세일즈맨 순위 · 오늘 · 월별 · 수단별 · 📵 입력 없는 세일즈맨 · 📅 입금 예정 체크 · ↩️ 바운스 · 💵 이번 정산기간 커미션 예상
 *    정산: 1~15 / 16~말 프리셋 · 전원 지급액 · 세일즈맨별 ✓ / ! / 대기 (현장 + COD/ACH/CARD) · 요율 태그 · 금액 고치기 · 수령 대기 · 왜 빠졌나
 *          📉 6개월 초과 디덕션 · 캐쉬 보관 · 정산서 🖨 · 📊 엑셀 · 🔒 확정(보관 · 1099 · 오피스 적립) · 📁 정산 완료 · % 요율표
 *    미수금: 세일즈맨별 · 연체 상위 · 60일+ 수금 없음 · 담당 바뀜 · 수금 없는 가게
 *    찾기: 가게 → 12개월 · 수금 내역 (현장 · COD · ACH · 카드)
 *  자료: entries · cod · ar/_all · settlements · deductions · salesmen(rates · cashKeep) · bonusAcc · pay1099 · payees
 * ============================================================ */
import { $, esc, money, k, num, R2, today, ym, md, dlabel, toast, busy, openModal, closeModal, confirmBox, Router, inputDate, sel, sum, sortBy, groupBy, printOpen, daysBetween, pct, addDays, nz, hasWords } from './ui.js';
import { newId } from './db.js';
import { lineOfEntry, linesOfEntry, lineOfOther, computeComm, applyDed, ratesOf, commSettings, SEC_LABEL, RATE_LABELS, setStoreLookup } from './comm.js';
import { settlementHtml } from './sales.js';
import { searchAccounts } from './accounts.js';

let S = null, C = { ents: null, cod: null, at: 0 };
export function register(state) {
  S = state; setStoreLookup(code => { const a = S.accounts && S.accounts.byCode && S.accounts.byCode[code]; return a ? a.store : ''; });
  Router.on('now', pageNow); Router.on('pay', pagePay); Router.on('bossar', pageAR); Router.on('find', a => pageFind(a ? decodeURIComponent(a) : ''));
}
const SRC_TAG = { FIELD: ['현장', 't-f'], COD: ['COD', 't-c'], ACH: ['ACH', 't-a'], CARD: ['카드', 't-k'] };
const srcOf = c => c.method === 'ACH' ? 'ACH' : c.method === 'CREDIT CARD' ? 'CARD' : 'COD';
function recentYms(n) { const out = [], d = new Date(); for (let i = 0; i < n; i++) { out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); d.setMonth(d.getMonth() - 1); } return out; }
async function loadAll(force) {
  if (C.ents && !force && Date.now() - C.at < 120000) return C;
  const yms = recentYms(13);
  const [e1, c1] = await Promise.all([S.DB.list('entries', { where: [['ym', 'in', yms]] }), S.DB.list('cod', { where: [['ym', 'in', yms]] })]);
  C.ents = e1.filter(x => !x.void); C.cod = c1.filter(x => !x.void); C.at = Date.now();
  return C;
}
/** 모든 수금을 한 모양으로 {d, sm, store, acct, amt, src} (대체 체크는 원래 체크가 이미 잡혀 있으니 뺌) */
function allRows() {
  const out = [];
  C.ents.forEach(e => { if (e.repl) return; out.push({ d: e.d, ym: e.ym, sm: e.sm, store: e.store, acct: e.acct, amt: e.total, src: 'FIELD', id: e.id, pays: e.pays, method: (e.pays || []).map(p => p.m).join(', '), check: (e.pays || []).filter(p => p.m === 'CHECK').map(p => p.ref).join(',') }); });
  C.cod.forEach(c => out.push({ d: c.d, ym: c.ym, sm: c.sm, store: c.store, acct: c.acct, amt: c.amt, src: srcOf(c), id: c.id, method: c.method, check: c.ref || '' }));
  return out;
}
/* ---------- 정산 기간 프리셋 (1~15 · 16~말) ---------- */
function presets() {
  const t = today(), y = Number(t.substring(0, 4)), m = Number(t.substring(5, 7)), d = Number(t.substring(8, 10));
  const mk = (yy, mm) => { const last = new Date(yy, mm, 0).getDate(); const p = yy + '-' + String(mm).padStart(2, '0'); return [{ k: p + 'a', label: mm + '월 1~15', from: p + '-01', to: p + '-15' }, { k: p + 'b', label: mm + '월 16~' + last, from: p + '-16', to: p + '-' + last }]; };
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  const list = mk(py, pm).concat(mk(y, m)).concat([{ k: 'r45', label: '최근 45일', from: addDays(t, -45), to: t }]);
  return { list, cur: (d <= 15 ? y + '-' + String(m).padStart(2, '0') + 'a' : y + '-' + String(m).padStart(2, '0') + 'b') };
}
const lineState = x => x.v ? 'ok' : x.vbad ? 'bad' : 'pend';
const carryTag = x => x.deferred ? ' · <span style="color:#7c3aed">↩ ' + esc(x.deferredAt || '') + ' 정산에서 넘어옴</span>' : '';

/* ============================================================
 *  ① 현황
 * ============================================================ */
async function pageNow() {
  $('page').innerHTML = '<div class="load">읽는 중…</div>';
  await loadAll();
  const rows = allRows(), t = today(), tm = ym(t), prevM = recentYms(2)[1];
  const cur = rows.filter(r => r.ym === tm), prev = rows.filter(r => r.ym === prevM), tod = rows.filter(r => r.d === t);
  const dayN = Number(t.substring(8, 10)), prevSame = prev.filter(r => Number(r.d.substring(8, 10)) <= dayN);
  const wkStart = addDays(t, -((new Date(t + 'T12:00:00').getDay() + 6) % 7)), week = rows.filter(r => r.d >= wkStart && r.d <= t);
  const bySm = groupBy(cur, r => r.sm), prevBySm = groupBy(prev, r => r.sm);
  const smList = sortBy(Object.keys(bySm).map(s => ({ sm: s, amt: sum(bySm[s], r => r.amt), n: bySm[s].length, prev: sum(prevBySm[s] || [], r => r.amt) })), x => x.amt, true);
  const smMax = Math.max(1, ...smList.map(x => x.amt));
  const bySrc = groupBy(cur, r => r.src);
  const series = recentYms(13).reverse().map(m => ({ ym: m, amt: sum(rows.filter(r => r.ym === m), r => r.amt) }));
  const max = Math.max(1, ...series.map(x => x.amt));
  const wait = C.ents.filter(e => !e.settled && e.sb && !e.rc && !e.repl), pend = C.ents.filter(e => !e.settled && e.rc && !e.v && !e.repl), bad = C.ents.filter(e => e.mismatch && !e.settled);
  /* 📵 입력 없는 세일즈맨 · 📅 입금 예정 · ↩️ 바운스 */
  const quiet = S.sms.filter(s => s.active !== false).map(s => { const last = sortBy(C.ents.filter(e => e.sm === s.code), e => e.d, true)[0]; return { sm: s.code, last: last ? last.d : '', days: last ? daysBetween(last.d, t) : 999 }; }).filter(x => x.days >= 3).sort((a, b) => b.days - a.days);
  const upItems = []; C.ents.forEach(e => (e.pays || []).forEach(p => { if (p.m === 'CHECK' && p.dep && p.dep > t) upItems.push({ d: p.dep, store: e.store, sm: e.sm, check: p.ref, amt: num(p.amt) }); }));
  const upBy = groupBy(upItems, x => x.d), up = Object.keys(upBy).sort().map(d => ({ d, n: upBy[d].length, amt: sum(upBy[d], x => x.amt), items: upBy[d] }));
  const d90 = addDays(t, -90), bo = C.ents.filter(e => e.repl && e.d >= d90), boBy = groupBy(bo, e => e.sm);
  let h = '<div class="card"><h2>이번 달 ' + tm + '</h2><div class="hero">' + money(sum(cur, r => r.amt)) + '</div><div class="heroSub">' + cur.length + '건 · 지난달 같은 날짜까지 ' + money(sum(prevSame, r => r.amt)) + ' ' + pct(sum(cur, r => r.amt), sum(prevSame, r => r.amt)) + '</div>' +
    '<div class="kpi"><div><b>' + money(sum(tod, r => r.amt)) + '</b><span>오늘 ' + tod.length + '건</span></div><div><b>' + money(sum(week, r => r.amt)) + '</b><span>이번 주</span></div><div><b>' + money(sum(prev, r => r.amt)) + '</b><span>지난달 전체</span></div><div><b>' + pend.length + '</b><span>정산 확인 대기</span></div></div>' +
    '<div class="two" style="margin-top:8px"><input id="nowQ" placeholder="🔎 가게 찾기 · 코드 / 이름" autocomplete="off"><button class="b-ghost" id="nowGo">찾기</button></div></div>';
  if (quiet.length || bad.length || wait.length) h += '<div class="card"><h2>신경 쓸 것</h2>' + (bad.length ? '<div class="alert a-red">⚠️ 인보이스 차액 ' + bad.length + '건 — 정산 전에 담당자가 고쳐야 합니다 (수금 확인)</div>' : '') + (wait.length ? '<div class="alert a-blu">📥 체크 수령 대기 ' + wait.length + '건 ' + money(sum(wait, e => e.total)) + ' — 담당자가 ② 를 누르면 정산에 올라옵니다</div>' : '') + '</div>';
  h += '<div class="two-col"><div class="card"><h2>세일즈맨 · 이번 달 (' + smList.length + '명)</h2><table><tr><th>이름</th><th class="r">금액</th><th class="r">건</th><th class="r">전월비</th></tr>' + (smList.map((x, i) => '<tr class="tap" data-smv="' + esc(x.sm) + '"><td><span class="rank">' + (i + 1) + '</span><b>' + esc(x.sm) + '</b><div class="minibar"><div style="width:' + Math.round(x.amt / smMax * 100) + '%"></div></div></td><td class="r"><b>' + money(x.amt) + '</b></td><td class="r muted">' + x.n + '</td><td class="r">' + pct(x.amt, x.prev) + '</td></tr>').join('') || '<tr><td colspan="4" class="none">아직 없음</td></tr>') + '</table><div class="hint" style="text-align:center">이름을 누르면 가게별 내역</div></div>' +
    '<div class="card"><h2>오늘 들어온 수금 · ' + dlabel(t) + '</h2>' + (tod.length ? '<table><tr><th>가게</th><th>담당</th><th class="r">금액</th></tr>' + sortBy(tod, r => r.amt, true).map(r => '<tr><td class="nm">' + esc(r.store || r.acct) + ' <span class="tag ' + SRC_TAG[r.src][1] + '">' + SRC_TAG[r.src][0] + '</span></td><td class="muted" style="font-size:12px">' + esc(r.sm) + '</td><td class="r"><b>' + money(r.amt) + '</b></td></tr>').join('') + '</table>' : '<div class="none">아직 없습니다</div>') + '</div></div>';
  h += '<div class="two-col"><div class="card"><h2>월별 수금 (13개월)</h2><div class="bars">' + series.map((x, i) => '<div class="b' + (i === series.length - 1 ? ' on' : '') + '" style="height:' + Math.max(2, Math.round(x.amt / max * 78)) + 'px" data-v="' + x.ym.substring(5) + '월 ' + k(x.amt) + '"></div>').join('') + '</div><div class="xlab"><span>' + series[0].ym + '</span><span>' + tm + '</span></div></div>' +
    '<div class="card"><h2>수단별 (이번 달)</h2><table>' + [['FIELD'], ['COD'], ['ACH'], ['CARD']].filter(x => bySrc[x[0]]).map(x => '<tr><td><span class="tag ' + SRC_TAG[x[0]][1] + '">' + SRC_TAG[x[0]][0] + '</span></td><td class="r"><b>' + money(sum(bySrc[x[0]], r => r.amt)) + '</b></td><td class="r muted">' + Math.round(sum(bySrc[x[0]], r => r.amt) / Math.max(1, sum(cur, r => r.amt)) * 100) + '%</td></tr>').join('') + '</table></div></div>';
  h += '<div class="two-col"><div class="card"><h2>📵 입력 없는 세일즈맨 (3일 이상)</h2>' + (quiet.length ? '<table><tr><th>이름</th><th class="r">마지막 입력</th><th class="r">경과</th></tr>' + quiet.map(q => '<tr class="tap" data-smv="' + esc(q.sm) + '"><td><b>' + esc(q.sm) + '</b></td><td class="r muted" style="font-size:12px">' + (q.last || '기록 없음') + '</td><td class="r ' + (q.days >= 7 ? 'warn' : '') + '">' + (q.days >= 999 ? '—' : q.days + '일') + '</td></tr>').join('') + '</table>' : '<div class="alert a-grn">전원 최근 3일 안에 입력했습니다 ✓</div>') + '</div>' +
    '<div class="card"><h2>📅 입금 예정 체크 (post-dated) · ' + money(sum(upItems, x => x.amt)) + ' · ' + upItems.length + '장</h2>' + (up.length ? '<table><tr><th>입금일</th><th class="r">장</th><th class="r">금액</th></tr>' + up.slice(0, 14).map(d => '<tr class="tap" data-up="' + d.d + '"><td>' + dlabel(d.d) + '</td><td class="r muted">' + d.n + '장</td><td class="r"><b>' + money(d.amt) + '</b></td></tr>').join('') + '</table><div class="hint" style="text-align:center">날짜를 누르면 그날 체크 목록</div>' : '<div class="none">입금 예정 체크가 없습니다</div>') + '</div></div>';
  h += '<div class="two-col"><div class="card"><h2>↩️ 바운스 · 대체 체크 (최근 90일) · ' + bo.length + '건 · ' + money(sum(bo, e => e.total)) + '</h2>' + (bo.length ? '<table><tr><th>세일즈맨</th><th class="r">건</th><th class="r">금액</th></tr>' + Object.keys(boBy).map(s => '<tr><td><b>' + esc(s) + '</b></td><td class="r muted">' + boBy[s].length + '건</td><td class="r"><b>' + money(sum(boBy[s], e => e.total)) + '</b></td></tr>').join('') + '</table>' : '<div class="alert a-grn">바운스 없음 ✓</div>') + '</div>' +
    '<div class="card"><h2>💵 이번 정산기간 커미션 예상</h2><div id="estBox"></div></div></div>';
  $('page').innerHTML = h;
  document.querySelectorAll('[data-smv]').forEach(el => el.onclick = () => smDetail(el.dataset.smv));
  document.querySelectorAll('[data-up]').forEach(el => el.onclick = () => { const d = up.find(x => x.d === el.dataset.up); openModal('<h2>' + dlabel(d.d) + ' 입금 예정 · ' + money(d.amt) + '</h2><table>' + d.items.map(i => '<tr><td class="nm">' + esc(i.store) + '</td><td class="muted" style="font-size:12px">' + esc(i.sm) + ' #' + esc(i.check) + '</td><td class="r"><b>' + money(i.amt) + '</b></td></tr>').join('') + '</table><div class="btns"><button class="b-ghost" id="mX">닫기</button></div>'); $('mX').onclick = closeModal; });
  $('nowGo').onclick = () => Router.go('find', encodeURIComponent($('nowQ').value.trim())); $('nowQ').onkeydown = e => { if (e.key === 'Enter') $('nowGo').click(); };
  paintEstimate();
}
function overview(from, to) {
  const inR = r => r.d >= from && r.d <= to;
  const live = C.ents.filter(e => !e.settled && !e.repl && (inR(e) || (e.deferred && e.d < from && e.d <= to))), cods = C.cod.filter(c => !c.settled && (inR(c) || (c.deferred && c.d < from && c.d <= to)));
  const sms = Object.keys(groupBy(live.concat(cods), x => x.sm)).sort();
  const list = sms.map(sm => { const a = live.filter(e => e.sm === sm), b = cods.filter(c => c.sm === sm); const ready = a.filter(e => e.rc && e.sb); const ok = [].concat(...ready.filter(e => e.v).map(linesOfEntry)).concat(b.filter(c => c.v).map(lineOfOther)); const c = computeComm(ok, ratesOf(S.smByCode[sm]), commSettings(S.settings)); return { sm, total: c.totals.total, pay: c.pay, pend: ready.filter(e => !e.v).length + b.filter(x => !x.v).length, wait: a.filter(e => !e.rc).length, bad: c.skipped.length, n: ready.length + b.length, done: ok.length, amt: sum(ready, e => e.total) + sum(b, x => x.amt), c }; });
  return { from, to, list: sortBy(list, x => x.pay, true), tot: { pay: sum(list, x => x.pay), total: sum(list, x => x.total), pend: list.reduce((a, x) => a + x.pend, 0), wait: list.reduce((a, x) => a + x.wait, 0), bad: list.reduce((a, x) => a + x.bad, 0) } };
}
function paintEstimate() {
  const box = $('estBox'); if (!box) return;
  const pr = presets(), cur = pr.list.find(x => x.k === pr.cur), o = overview(cur.from, cur.to);
  box.innerHTML = '<div class="hero" style="font-size:26px">' + money(o.tot.pay) + '</div><div class="heroSub">' + cur.label + ' (' + o.from + ' ~ ' + o.to + ') · 수금 ' + money(o.tot.total) + ' · 미확인 ' + o.tot.pend + '건 · 수령 대기 ' + o.tot.wait + '건</div>' +
    (o.list.length ? '<table style="margin-top:8px">' + o.list.map(x => '<tr class="tap" data-est="' + esc(x.sm) + '"><td><b>' + esc(x.sm) + '</b></td><td class="r muted">' + (x.pend ? x.pend + ' 미확인' : '') + '</td><td class="r"><b>' + money(x.pay) + '</b></td></tr>').join('') + '</table><div class="hint" style="text-align:center">✓ 확인된 줄 기준 · 이름을 누르면 정산으로</div>' : '<div class="none">이 기간에 정산할 줄이 없습니다</div>');
  box.querySelectorAll('[data-est]').forEach(el => el.onclick = () => { P.sm = el.dataset.est; P.from = cur.from; P.to = cur.to; Router.go('pay'); });
}
function smDetail(sm) {
  const rows = allRows().filter(r => r.sm === sm), tm = ym(today());
  const cur = sortBy(rows.filter(r => r.ym === tm), r => r.d, true);
  const series = recentYms(6).reverse().map(m => ({ m, amt: sum(rows.filter(r => r.ym === m), r => r.amt) }));
  const byStore = sortBy(Object.values(groupBy(cur, r => r.acct || r.store)).map(L => ({ store: L[0].store, acct: L[0].acct, n: L.length, amt: sum(L, r => r.amt) })), x => x.amt, true);
  openModal('<h2>' + esc(sm) + '</h2><div class="heroSub">이번 달 <b>' + money(sum(cur, r => r.amt)) + '</b> · ' + cur.length + '건 · ' + byStore.length + '곳</div><div class="kpi" style="grid-template-columns:repeat(6,1fr)">' + series.map(x => '<div><b style="font-size:11px">' + k(x.amt) + '</b><span>' + x.m.substring(5) + '월</span></div>').join('') + '</div>' +
    '<table style="margin-top:8px">' + byStore.slice(0, 60).map(r => '<tr class="tap" data-fs="' + esc(r.acct || r.store) + '"><td><b>' + esc(r.store) + '</b> <span class="muted">' + esc(r.acct || '') + ' · ' + r.n + '건</span></td><td class="r">' + money(r.amt) + '</td></tr>').join('') + '</table><div class="btns"><button class="b-ghost" id="mX">닫기</button><button class="b-blue" id="mAr">미수금 보기</button></div>');
  $('mX').onclick = closeModal; $('mAr').onclick = () => { closeModal(); AV_SM = sm; Router.go('bossar'); };
  document.querySelectorAll('#mbox [data-fs]').forEach(el => el.onclick = () => { closeModal(); Router.go('find', encodeURIComponent(el.dataset.fs)); });
}

/* ============================================================
 *  ② 정산
 * ============================================================ */
let P = { sm: '', from: '', to: '', sbOnly: true, waitOpen: false, hist: false }, DED = null, DOVER = {}, LAST_C = null;
async function pagePay() {
  $('page').innerHTML = '<div class="load">읽는 중…</div>';
  await loadAll(true);
  const pr = presets(); if (!P.from) { const c = pr.list.find(x => x.k === pr.cur); P.from = c.from; P.to = c.to; }
  const o = overview(P.from, P.to);
  let h = '<div class="card"><h2>🧾 정산 — 확인 후 커미션 확정</h2><div class="chips">' + pr.list.map(x => '<button class="' + (P.from === x.from && P.to === x.to ? 'on' : '') + '" data-pp="' + x.from + '|' + x.to + '">' + x.label + '</button>').join('') + '</div>' +
    '<div class="payhd">' + sel('pSm', [['', '— 세일즈맨 전체 —']].concat(S.sms.filter(s => s.active !== false).map(s => [s.code, s.code])), P.sm) + inputDate('pFrom', P.from) + '<span class="muted">~</span>' + inputDate('pTo', P.to) + '</div>' +
    '<div class="payopt"><label><input type="checkbox" id="pSb" ' + (P.sbOnly ? 'checked' : '') + '> SmartBee 입력(①)된 것만 — 커미션 대상</label><button class="b-ghost b-sm" id="pHist">📁 정산 완료</button><button class="b-ghost b-sm" id="pRates">% 요율표</button></div></div><div id="pOut"></div>';
  $('page').innerHTML = h;
  document.querySelectorAll('[data-pp]').forEach(b => b.onclick = () => { const [f, t] = b.dataset.pp.split('|'); P.from = f; P.to = t; P.hist = false; pagePay(); });
  $('pSm').onchange = () => { P.sm = $('pSm').value; P.hist = false; DED = null; DOVER = {}; pagePay(); };
  $('pFrom').onchange = () => { P.from = $('pFrom').value; pagePay(); }; $('pTo').onchange = () => { P.to = $('pTo').value; pagePay(); };
  $('pSb').onchange = () => { P.sbOnly = $('pSb').checked; pagePay(); };
  $('pHist').onclick = () => { P.hist = true; P.sm = ''; pagePay(); }; $('pRates').onclick = ratesOpen;
  if (P.hist) return paintHistory();
  if (!P.sm) return paintCards(o);
  paintSm(o);
}
function paintCards(o) {
  const box = $('pOut');
  if (!o.list.length) { box.innerHTML = '<div class="card"><div class="none">이 기간에 정산할 게 없습니다</div></div>'; return; }
  box.innerHTML = '<div class="card"><h2>💵 전원 지급액 · ' + o.from + ' ~ ' + o.to + '</h2><div class="hero" style="font-size:26px">' + money(o.tot.pay) + '</div><div class="heroSub">수금 ' + money(o.tot.total) + ' · 미확인 ' + o.tot.pend + '건 · 수령 대기 ' + o.tot.wait + '건' + (o.tot.bad ? ' · <b class="warn">금액 오류 ' + o.tot.bad + '건</b>' : '') + '</div>' +
    '<table style="margin-top:8px"><tr><th>이름</th><th class="r">수금 ✓</th><th class="r">지급액</th><th class="r">남음</th></tr>' + o.list.map(x => '<tr class="tap" data-pgo="' + esc(x.sm) + '"><td><b>' + esc(x.sm) + '</b></td><td class="r muted">' + money(x.total) + '</td><td class="r"><b>' + money(x.pay) + '</b></td><td class="r">' + (x.pend ? '<span class="warn">' + x.pend + '</span>' : x.wait ? '<span style="color:#1e40af">' + x.wait + '📥</span>' : '✓') + '</td></tr>').join('') + '</table>' +
    '<div class="btns"><button class="b-navy" id="pAllPrint">🖨 전원 정산서 한 번에</button></div><div class="hint" style="text-align:center">✓ 확인된 줄만 계산 · 이름을 누르면 그 사람 정산으로</div></div>' +
    '<div class="card"><h2>세일즈맨별 확인 현황</h2>' + o.list.map(c => { const left = Math.max(0, c.n - c.done - c.bad); return '<div class="pr tap" data-pgo="' + esc(c.sm) + '"><div class="mk" style="background:' + (left ? '#fef3c7' : '#dcfce7') + ';color:' + (left ? '#92400e' : '#166534') + '">' + (left || '✓') + '</div><div class="ct"><b>' + esc(c.sm) + '</b><small>' + c.n + '건 · 확인 ' + c.done + (c.bad ? ' · 문제 ' + c.bad : '') + (c.wait ? ' · <span style="color:#1e40af">수령 대기 ' + c.wait + '</span>' : '') + '</small></div><div class="pa"><b>' + money(c.amt) + '</b><small>' + (left ? left + '건 남음' : '확인 끝') + '</small></div></div>'; }).join('') + '</div>';
  box.querySelectorAll('[data-pgo]').forEach(el => el.onclick = () => { P.sm = el.dataset.pgo; DED = null; DOVER = {}; pagePay(); });
  $('pAllPrint').onclick = () => { const names = o.list.filter(x => x.c.lines.length); if (!names.length) return toast('✓ 된 줄이 있는 세일즈맨이 없습니다', 'bad'); printOpen('<div class="muted" style="font-size:12px;margin-bottom:10px">전원 정산서 · ' + names.length + '명 · ' + o.from + ' ~ ' + o.to + ' · 지급액 합계 ' + money(o.tot.pay) + '</div>' + names.map((x, i) => '<div class="' + (i < names.length - 1 ? 'pgbrk' : '') + '">' + settlementHtml({ sm: x.sm, day: today(), from: o.from, to: o.to, comm: stmtComm(x.c) }) + '</div>').join('')); };
}
/* ---- 세일즈맨 한 명 ---- */
function smRows() {
  const inR = r => r.d >= P.from && r.d <= P.to, carried = r => !!r.deferred && r.d < P.from && r.d <= P.to;   /* 지난 정산에서 ✓ 안 돼 넘어온 줄 */
  const mine = C.ents.filter(e => e.sm === P.sm && !e.settled && !e.repl && (inR(e) || carried(e))), cods = C.cod.filter(c => c.sm === P.sm && !c.settled && (inR(c) || carried(c)));
  const field = mine.filter(e => e.rc && (!P.sbOnly || e.sb)), wait = mine.filter(e => !e.rc && (!P.sbOnly || e.sb));
  const merged = sortBy(field.map(e => ({ k: 'f', x: e })).concat(cods.map(c => ({ k: 'o', x: c }))), r => r.x.d + (r.k === 'f' ? '0' : '1') + (r.x.createdAt || ''));
  const all = C.ents.filter(e => e.sm === P.sm && !e.repl);
  const why = { early: all.filter(e => e.d < P.from && !e.settled && !carried(e)).length, late: all.filter(e => e.d > P.to && !e.settled).length, closed: all.filter(e => inR(e) && e.settled).length, min: all.length ? all.map(e => e.d).sort()[0] : '', max: all.length ? all.map(e => e.d).sort().pop() : '' };
  return { mine, field, wait, cods, merged, why };
}
function calc(rows) {
  const ok = [].concat(...rows.field.filter(e => e.v).map(linesOfEntry)).concat(rows.cods.filter(c => c.v).map(lineOfOther));
  const c = computeComm(ok, ratesOf(S.smByCode[P.sm]), commSettings(S.settings));
  const sm = S.smByCode[P.sm] || {};
  const dl = (DED && DED.sm === P.sm ? DED.active : []).map(d => { const rem = R2(d.total - (d.used || 0)); const v = DOVER.hasOwnProperty(d.id) ? num(DOVER[d.id]) : Math.min(d.per || rem, rem); return { id: d.id, acct: d.acct, store: d.store, why: d.why, total: d.total, used: d.used || 0, per: d.per, remaining: rem, apply: v, start: d.start, invs: d.invs }; });
  applyDed(c, dl, !!sm.cashKeep);
  c.waitN = rows.wait.length; c.waitAmt = sum(rows.wait, e => e.total);
  c.pending = rows.field.filter(e => !e.v && !e.vbad).length; c.pendBad = rows.field.filter(e => e.vbad).length; c.pendOther = rows.cods.filter(x => !x.v).length; c.pendOtherAmt = sum(rows.cods.filter(x => !x.v), x => x.amt);
  if (DED && DED.sm === P.sm) c.arWarn = { six: DED.cand.six.map(x => ({ acct: x.acct, store: x.store, amt: x.amt, has: x.has })), four: DED.cand.four.map(x => ({ store: x.store, storeTot: x.storeTot })) };
  return c;
}
function rateTag(L, rate) {
  const SC = { REG: 's-a', SPECIAL: 's-ex', DISC: 's-dc', NEWDP: 's-w' }, SK = { REG: 'a', SPECIAL: 'ex', DISC: 'disc', NEWDP: 'w' };
  let out = '<span class="rtag ' + (SC[L.sec] || 's-a') + '">' + (SEC_LABEL[L.sec] || 'A') + ' ' + (Math.round(rate[SK[L.sec] || 'a'] * 1000) / 10) + '%</span>';
  if (L.sec === 'DISC' && L.disc !== '') out += '<span class="rtag s-dc">디스카운트 ' + L.disc + '%</span>';
  if (L.P > 0) out += '<span class="rtag s-p">P ' + (Math.round(rate.p * 1000) / 10) + '%</span>';
  return out;
}
async function paintSm(o) {
  const box = $('pOut'), rows = smRows(), rate = ratesOf(S.smByCode[P.sm]), cs = commSettings(S.settings);
  if (!DED || DED.sm !== P.sm) { DED = null; loadDed(); }
  const c = calc(rows); LAST_C = c;
  const L = rows.merged;
  if (!L.length) { box.innerHTML = '<div class="card"><div class="none">이 기간에 정산할 줄이 없습니다' + (rows.wait.length ? '<br><span style="font-size:12px;color:#1e40af">담당자 <b>체크 수령 ✓</b> 대기 ' + rows.wait.length + '건 (' + money(sum(rows.wait, e => e.total)) + ') 이 있습니다</span>' : '') + (P.sbOnly ? '<br><span style="font-size:12px">SmartBee 입력된 것만 보고 있습니다 — 위 체크를 풀어 보세요</span>' : '') + '</div>' + waitBox(rows) + whyBox(rows) + '</div><div class="card" id="dedBox"></div>'; bindWait(); dedPaint(); return; }
  const states = L.map(r => lineState(r.x)), done = states.filter(s => s === 'ok').length, bad = states.filter(s => s === 'bad').length, pend = L.length - done - bad, tot = sum(L, r => r.k === 'f' ? r.x.total : r.x.amt);
  const byKey = {}; c.bad.forEach(b => { byKey[b.key] = b; });
  /* 줄별 구역 미리 계산 (✓ 안 된 줄도 태그를 보여 주기 위해) */
  const secOfRow = r => { const Lx = r.k === 'f' ? lineOfEntry(r.x) : lineOfOther(r.x); const cc = computeComm([Lx], rate, cs); const d = cc.lines[0] || Lx; return { L: d, bad: cc.bad[0] }; };
  let html = '', seq = 0;
  Object.entries(groupBy(L, r => r.x.d)).sort().forEach(([d, G]) => {
    html += '<div class="daygrp"><div class="dayhd"><span>' + dlabel(d) + '</span><span>' + G.length + '건 · ' + money(sum(G, r => r.k === 'f' ? r.x.total : r.x.amt)) + '</span></div>';
    G.forEach(r => { seq++; const x = r.x, st = lineState(x), info = secOfRow(r), b = info.bad;
      const badLine = b ? (b.blocked ? '<div class="pw">🔴 인보이스 배분 ' + money(b.alloc) + ' ≠ 받은 돈 ' + money(b.got) + ' — ' + esc(b.why) + ' · <u>이번 정산 제외</u></div>' : '<div class="pw" style="color:#b45309">⚠️ W 금액 오타 (' + money(b.W) + ') → ' + money(b.fixed) + ' 로 계산 — 원본도 고쳐 주세요</div>') : '';
      if (r.k === 'o') html += '<div class="pr tap pl ' + st + '" data-pl="o|' + x.id + '"><span class="seq">' + seq + '</span><div class="mk">' + (st === 'ok' ? '✓' : st === 'bad' ? '!' : '') + '</div><div class="ct"><b>' + esc(x.store) + '</b><small>' + esc(x.acct || '') + ' · <span class="tag ' + SRC_TAG[srcOf(x)][1] + '">' + esc(x.method) + '</span>' + (x.ref ? ' ' + esc(x.ref) : '') + (x.achId ? ' · 🏦 ACH 인출' : '') + carryTag(x) + '</small><div class="rt">' + rateTag(info.L, rate) + '</div>' + badLine + (st === 'bad' && x.vn ? '<div class="pw">⚠️ ' + esc(x.vn) + '</div>' : '') + '</div><div class="pa"><b>' + money(x.amt) + '</b><small>' + (st === 'ok' ? '확인됨' : '탭해서 ✓') + '</small></div></div>';
      else { const pay = (x.pays || []).map(p => p.m === 'CHECK' ? 'CHECK #' + esc(p.ref || '') : p.m).join(' · '), dep = (x.pays || []).find(p => p.dep && p.dep !== x.d);
        html += '<div class="pr tap pl ' + st + '" data-pl="f|' + x.id + '"><span class="seq">' + seq + '</span><div class="mk">' + (st === 'ok' ? '✓' : st === 'bad' ? '!' : '') + '</div><div class="ct"><b>' + esc(x.store) + '</b><small>' + esc(x.acct || '') + ' · ' + pay + (dep ? ' · 입금 ' + esc(dep.dep.substring(5)) : '') + (x.rep ? '' : x.rep === false ? ' · <span class="warn">리포트 미전송</span>' : '') + carryTag(x) + '</small><div class="rt">' + rateTag(info.L, rate) + '</div>' + badLine + (st === 'bad' && x.vn ? '<div class="pw">⚠️ ' + esc(x.vn) + '</div>' : '') + (x.mismatch && !b ? '<div class="pw">' + esc(x.mismatch) + '</div>' : '') + '</div><div class="pa"><b>' + money(x.total) + '</b>' + (x.sb ? '<small>SmartBee ✓</small>' : '<small style="color:#b45309">SmartBee 미입력</small>') + '</div></div>'; }
    });
    html += '</div>';
  });
  /* 금액 안 맞는 줄은 ✓ 여부와 상관없이 고치기 칸을 보여 줌 (옛 앱과 같이) */
  const allBad = L.map(r => secOfRow(r).bad).filter(Boolean), blocked = allBad.filter(b => b.blocked), warnN = allBad.filter(b => b.derived).length;
  const fixes = blocked.length ? '<div class="whybox bad">🔴 <b>인보이스 금액이 받은 돈과 안 맞는 줄 ' + blocked.length + '건</b> (차이 ' + money(sum(blocked, b => Math.abs(b.got - b.alloc))) + ')<br>이 줄들은 <b>이번 정산에서 빠지고</b> 나머지는 확정됩니다. 아래에서 금액을 맞춰 저장하면 바로 들어갑니다.' + blocked.map(b => fixBox(b, rows)).join('') + '</div>' : '';
  const hist = (HIST || []).filter(s => s.sm === P.sm).slice(0, 6);
  box.innerHTML = '<div class="card"><h2>' + esc(P.sm) + ' · ' + P.from + ' ~ ' + P.to + '</h2><div class="hero" style="font-size:28px">' + money(tot) + '</div><div class="heroSub">' + L.length + '건 (현장 ' + rows.field.length + ' · COD/ACH/카드 ' + rows.cods.length + ')' + (rows.why.closed ? ' · <span class="muted">마감 ' + rows.why.closed + '건 제외</span>' : '') + '</div>' +
    '<div class="paybar"><i style="width:' + Math.round(done / L.length * 100) + '%;background:#15803d"></i><i style="width:' + Math.round(bad / L.length * 100) + '%;background:#b91c1c"></i></div><div class="heroSub" style="margin-top:6px">확인 <b class="ok">' + done + '</b> · 문제 <b class="warn">' + bad + '</b> · 남음 <b>' + pend + '</b> · 지급액 <b>' + money(c.pay) + '</b>' + (c.ded.amt ? ' (공제 ' + money(c.ded.amt) + ')' : '') + '</div>' +
    (hist.length ? '<div class="histstrip">' + hist.map(s => '<div data-sid="' + s.id + '">' + esc(s.day) + '<b>' + money(s.pay) + '</b></div>').join('') + '</div>' : '') + fixes +
    (warnN ? '<div class="whybox">⚠️ W 금액 오타 ' + warnN + '건은 A·P·CM 이 적혀 있어 W 를 계산해 넣었습니다. 확정은 됩니다.</div>' : '') + '</div>' +
    '<div class="card">' + html + waitBox(rows) + whyBox(rows) + '</div><div class="card" id="dedBox"></div>' +
    '<div class="paybtns"><button class="b-ghost" id="pAll">전부 ✓</button><button class="b-ghost" id="pNone">전부 해제</button><button class="b-navy" id="pPrint">정산서 🖨</button><button class="b-ghost" id="pXlsx">📊 엑셀</button></div>' +
    '<div class="card" style="text-align:center"><button class="b-blue" id="pConfirm" style="width:100%;padding:15px;background:' + (done ? '#7c3aed' : '#e2e8f0') + ';color:' + (done ? '#fff' : '#94a3b8') + '" ' + (done ? '' : 'disabled') + '>🔒 확정 — 커미션 마감하고 보관 (' + money(c.finalPay) + ')</button>' +
    '<div class="hint" style="text-align:left">' + (!done ? '✓ 한 줄이 없습니다. 정산할 줄을 먼저 ✓ 해 주세요.' : (pend + bad ? '<b style="color:#7c3aed">↩ ✓ 안 한 ' + (pend + bad) + '건은 다음 정산으로 넘어갑니다</b> (다음 정산 목록에 다시 올라옵니다). ' : '') + '확정하면 ✓ 한 줄들에 정산 번호가 찍혀 <b>이 목록에서 빠지고</b>, 정산서가 📁 정산 완료에 보관됩니다. 세일즈맨 앱 🧾 정산서에도 바로 보입니다.' + (blocked.length ? ' <b style="color:#b91c1c">금액 오류 ' + blocked.length + '건은 빠진 채</b> 확정됩니다.' : '')) + '</div></div>';
  bindWait(); dedPaint();
  box.querySelectorAll('[data-pl]').forEach(el => el.onclick = () => { const [kind, id] = el.dataset.pl.split('|'); tapLine(kind, id); });
  box.querySelectorAll('[data-sid]').forEach(el => el.onclick = async () => { const s = await S.DB.get('settlements', el.dataset.sid); if (s) printOpen(settlementHtml(s)); });
  $('pAll').onclick = () => setAll(rows, true); $('pNone').onclick = () => setAll(rows, false);
  $('pPrint').onclick = () => printOpen(settlementHtml({ sm: P.sm, day: today(), from: P.from, to: P.to, comm: stmtComm(c) }));
  $('pXlsx').onclick = () => xlsxSave(Object.assign({ sm: P.sm, day: today(), from: P.from, to: P.to }, stmtComm(c)));
  $('pConfirm').onclick = () => confirmAsk(rows);
  box.querySelectorAll('[data-fxsave]').forEach(b => b.onclick = () => fixSave(b.dataset.fxsave, rows));
  box.querySelectorAll('[data-fxin]').forEach(inp => inp.oninput = () => fixSum(inp.dataset.fxin));
}
function waitBox(rows) {
  const w = rows.wait; if (!w.length) return '';
  return '<div class="whybox blu" style="margin-top:14px">📥 <b>체크 수령 대기 ' + w.length + '건</b> (' + money(sum(w, e => e.total)) + ') — 담당자가 수금 확인에서 <b>② 체크 수령</b> ✓ 하면 여기 올라옵니다. <a href="#" id="waitTg" style="color:#1d4ed8;font-weight:800">' + (P.waitOpen ? '접기' : '보기') + '</a>' +
    (P.waitOpen ? w.map(e => '<div class="pr" style="opacity:.65"><span class="seq">·</span><div class="mk" style="font-size:11px">②</div><div class="ct"><b>' + esc(e.store) + '</b><small>' + esc(e.d) + ' · ' + esc(e.acct || '') + ' · ' + (e.pays || []).map(p => p.m === 'CHECK' ? 'CHECK #' + esc(p.ref || '') : p.m).join(' · ') + '</small></div><div class="pa"><b>' + money(e.total) + '</b><small>수령 대기</small></div></div>').join('') : '') + '</div>';
}
function bindWait() { const a = $('waitTg'); if (a) a.onclick = e => { e.preventDefault(); P.waitOpen = !P.waitOpen; pagePay(); }; }
function whyBox(rows) {
  const w = rows.why, t = [];
  if (w.early) t.push('기간 <b>앞</b>이라 빠진 줄 ' + w.early + '건'); if (w.late) t.push('기간 <b>뒤</b>라 빠진 줄 ' + w.late + '건'); if (w.closed) t.push('이미 <b>확정</b>된 줄 ' + w.closed + '건');
  if (!t.length) return '';
  return '<div class="whybox">이 세일즈맨 기록(최근 13개월)의 날짜 범위: <b>' + (w.min || '—') + ' ~ ' + (w.max || '—') + '</b><br>' + t.join(' · ') + '</div>';
}
async function tapLine(kind, id) {
  const col = kind === 'o' ? 'cod' : 'entries', arr = kind === 'o' ? C.cod : C.ents, x = arr.find(y => y.id === id); if (!x) return;
  const st = lineState(x); let patch;
  if (st === 'pend') patch = { v: true, vbad: false, vn: '', vAt: today() };
  else if (st === 'ok') { const m = await askNote('무엇이 문제인가요?', '예: 체크 없음 / 금액 다름 $780.30→$708.30', x.vn || ''); if (m === null) return; patch = { v: false, vbad: true, vn: m, vAt: today() }; }
  else patch = { v: false, vbad: false, vn: '', vAt: today() };
  Object.assign(x, patch);
  try { await S.DB.update(col, id, patch); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
  pagePay();
}
function askNote(title, ph, v) { return new Promise(res => { openModal('<h2>' + esc(title) + '</h2><div class="fg"><input id="nq" value="' + esc(v) + '" placeholder="' + esc(ph) + '"></div><div class="btns"><button class="b-ghost" id="nqX">취소</button><button class="b-red" id="nqOk">! 문제 표시</button></div>'); $('nqX').onclick = () => { closeModal(); res(null); }; $('nqOk').onclick = () => { const t = $('nq').value.trim(); closeModal(); res(t || '문제 있음'); }; setTimeout(() => $('nq').focus(), 50); }); }
async function setAll(rows, v) {
  busy(true); const ops = [];
  rows.field.forEach(e => { if (lineState(e) === 'bad' && v) return; if (!!e.v !== v) { e.v = v; e.vbad = false; ops.push({ op: 'update', col: 'entries', id: e.id, data: { v, vbad: false, vn: v ? '' : e.vn || '', vAt: today() } }); } });
  rows.cods.forEach(c => { if (lineState(c) === 'bad' && v) return; if (!!c.v !== v) { c.v = v; c.vbad = false; ops.push({ op: 'update', col: 'cod', id: c.id, data: { v, vbad: false, vn: '', vAt: today() } }); } });
  try { if (ops.length) await S.DB.batch(ops); toast(v ? '전부 ✓ (' + ops.length + '줄)' : '전부 해제', 'good'); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
  busy(false); pagePay();
}
/* ---- 금액 고치기 (인보이스 배분 ≠ 받은 돈) ---- */
function fixBox(b, rows) {
  const src = b.src === 'FIELD' ? C.ents.find(e => e.id === b.key) : C.cod.find(c => c.id === b.key); if (!src) return '';
  const invs = src.invs || [], kk = b.key.replace(/[^A-Za-z0-9]/g, '_');
  return '<div class="fixbox"><div style="font-size:13px"><b>' + esc(src.store) + '</b> <span class="muted">' + esc(src.d) + ' · 받은 돈 <b>' + money(b.got) + '</b></span></div>' +
    '<div class="fixrows" data-fxk="' + kk + '">' + invs.map((v, i) => '<label><span class="ity ' + esc(v.t || '') + '">' + esc(v.t || '?') + '</span>' + esc(v.no) + '<input type="number" step="0.01" data-fxin="' + kk + '" data-fxi="' + i + '" value="' + (v.amt == null ? '' : v.amt) + '"></label>').join('') + '</div>' +
    '<div style="display:flex;align-items:center;gap:8px;margin-top:7px"><span id="fxs_' + kk + '" class="muted" style="flex:1;font-size:12px">합계 ' + money(b.alloc) + ' / 받은 돈 ' + money(b.got) + '</span><button type="button" class="b-red b-sm" data-fxsave="' + b.key + '" data-got="' + b.got + '">저장</button></div></div>';
}
function fixVals(kk) { return Array.from(document.querySelectorAll('[data-fxin="' + kk + '"]')).map(el => R2(num(el.value))); }
function fixSum(kk) { const btn = document.querySelector('[data-fxsave][data-got]'); const box = document.querySelector('[data-fxk="' + kk + '"]'); if (!box) return; const got = Number(box.parentNode.querySelector('[data-got]').dataset.got), s = R2(fixVals(kk).reduce((a, b) => a + b, 0)), ok = Math.abs(s - got) <= 0.01; const el = $('fxs_' + kk); if (el) el.innerHTML = '합계 <b style="color:' + (ok ? '#15803d' : '#b91c1c') + '">' + money(s) + '</b> / 받은 돈 ' + money(got) + (ok ? ' ✓' : ' (차이 ' + money(s - got) + ')'); }
async function fixSave(key, rows) {
  const kk = key.replace(/[^A-Za-z0-9]/g, '_'), vals = fixVals(kk);
  const e = C.ents.find(x => x.id === key), c = C.cod.find(x => x.id === key), src = e || c; if (!src) return;
  const got = e ? e.total : c.amt, s = R2(vals.reduce((a, b) => a + b, 0));
  if (Math.abs(s - got) > 0.01) return toast('합계가 받은 돈과 다릅니다 (' + money(s) + ' ≠ ' + money(got) + ')', 'bad');
  const invs = (src.invs || []).map((v, i) => Object.assign({}, v, { amt: vals[i] }));
  busy(true);
  try { await S.DB.update(e ? 'entries' : 'cod', key, { invs, invTotal: s, mismatch: '', fixedBy: S.user.email, fixedAt: today() }); src.invs = invs; src.mismatch = ''; toast('금액을 고쳤습니다', 'good'); } catch (x) { toast('실패: ' + (x.code || x.message), 'bad'); }
  busy(false); pagePay();
}
/* ---- 정산서 자료 (보관용 · 직렬화) ---- */
function stmtComm(c) {
  return { lines: c.lines.map(L => ({ d: L.d, store: L.store, acct: L.acct, methods: L.methods.join(', '), e: L.e, f: L.f, invs: L.invs.join(','), P: R2(L.P), W: R2(L.W), sec: L.sec, src: L.src, part: L.part || '', disc: L.disc, mismatch: !!L.mismatch, ids: L.ids })),
    totals: c.totals, buckets: c.buckets, net: c.net, netPay: c.netPay, ded: c.ded, dp: c.dp, office: c.office, pay: c.pay, cashKeep: c.cashKeep, finalPay: c.finalPay, skipped: c.skipped, skippedAmt: c.skippedAmt,
    warn: c.bad.filter(b => b.derived).map(b => ({ d: b.d, store: b.store, W: b.W, fixed: b.fixed })), waitN: c.waitN || 0, waitAmt: c.waitAmt || 0, pending: c.pending || 0, pendBad: c.pendBad || 0, pendOther: c.pendOther || 0, pendOtherAmt: c.pendOtherAmt || 0, arWarn: c.arWarn || null, specialTitle: commSettings(S.settings).SPECIAL_TITLE };
}
/* ---- 확정 ---- */
async function confirmAsk(rows) {
  const c = calc(rows); const okLines = c.lines.length; if (!okLines) return toast('✓ 한 줄이 없습니다', 'bad');
  const defer = rows.merged.filter(r => lineState(r.x) !== 'ok').map(r => ({ d: r.x.d, store: r.x.store, amt: r.k === 'f' ? r.x.total : r.x.amt, why: lineState(r.x) === 'bad' ? '문제 표시' : '미확인' }));
  openModal('<h2>확정하시겠습니까?</h2><div class="muted">' + esc(P.sm) + ' · ' + P.from + ' ~ ' + P.to + '</div>' +
    '<table style="margin-top:10px"><tr><td>포함되는 줄</td><td class="r"><b>' + new Set(c.lines.map(L => L.key)).size + '건</b></td></tr><tr><td>수금 합계</td><td class="r"><b>' + money(c.totals.total) + '</b></td></tr><tr><td>커미션 NET</td><td class="r">' + money(c.net) + '</td></tr>' +
    (c.ded.amt ? '<tr><td>공제 (' + c.ded.list.filter(d => d.apply > 0).map(d => esc(d.store)).join(', ') + ')</td><td class="r warn">− ' + money(c.ded.amt) + '</td></tr>' : '') + '<tr><td>DP · OFFICE</td><td class="r">− ' + money(R2(c.dp.amt + c.office.amt)) + '</td></tr><tr><td>TOTAL</td><td class="r"><b>' + money(c.pay) + '</b></td></tr>' +
    (c.cashKeep ? '<tr><td>CASH (세일즈맨 보관)</td><td class="r warn">− ' + money(c.cashKeep) + '</td></tr>' : '') + '<tr><td>송금할 금액</td><td class="r"><b style="font-size:17px">' + money(c.finalPay) + '</b></td></tr></table>' +
    (c.skipped.length ? '<div class="whybox bad">🔴 금액 오류 ' + c.skipped.length + '건 (' + money(c.skippedAmt) + ') 은 <b>이번 정산에서 빠집니다</b> — 고치면 다음 정산에 올라옵니다</div>' : '') +
    (defer.length ? '<div class="whybox vio">↩ <b>다음 정산으로 넘어가는 줄 ' + defer.length + '건 (' + money(sum(defer, x => x.amt)) + ')</b><div style="font-size:12px;margin-top:6px;max-height:140px;overflow:auto">' + defer.map(x => esc(x.d.substring(5)) + ' ' + esc(x.store) + ' ' + money(x.amt) + ' <span style="color:#7c3aed">(' + x.why + ')</span>').join('<br>') + '</div></div>' : '') +
    '<div class="btns"><button class="b-ghost" id="cfX">취소</button><button class="b-blue" id="cfGo" style="background:#7c3aed">확정하고 보관</button></div>');
  $('cfX').onclick = closeModal; $('cfGo').onclick = () => { closeModal(); confirmGo(rows, c, defer.length); };
}
async function confirmGo(rows, c, deferred) {
  busy(true);
  try {
    const id = newId('S'), day = today(), now = new Date().toISOString();
    const keys = new Set(c.lines.map(L => L.key));
    const ents = rows.field.filter(e => keys.has(e.id)), cods = rows.cods.filter(x => keys.has(x.id));
    const comm = stmtComm(c);
    const ops = [{ op: 'set', col: 'settlements', id, data: { id, sm: P.sm, day, from: P.from, to: P.to, n: keys.size, pay: c.pay, finalPay: c.finalPay, cashKeep: c.cashKeep, ded: c.ded.amt, net: c.net, office: c.office.amt, dp: c.dp.amt, total: c.totals.total, deferred, skipped: c.skipped.length, comm, createdBy: S.user.email, createdAt: now } }];
    ents.forEach(e => ops.push({ op: 'update', col: 'entries', id: e.id, data: { settled: id, settledAt: day } }));
    cods.forEach(x => ops.push({ op: 'update', col: 'cod', id: x.id, data: { settled: id, settledAt: day } }));
    /* ✓ 안 된 줄은 다음 정산으로 넘김 — 표시만 남겨 다음 기간에서도 보이게 (옛 대시보드 '정산 미룸') */
    rows.merged.filter(r => !keys.has(r.x.id)).forEach(r => ops.push({ op: 'update', col: r.k === 'f' ? 'entries' : 'cod', id: r.x.id, data: { deferred: id, deferredAt: day } }));
    c.ded.list.forEach(d => { if (!(d.apply > 0)) return; const src = DED.active.find(a => a.id === d.id); if (!src) return; const used = R2((src.used || 0) + d.apply), hist = (src.hist || []).concat([{ d: day, amt: d.apply, ref: id }]); ops.push({ op: 'update', col: 'deductions', id: d.id, data: { used, hist, st: used >= src.total - 0.005 ? '완료' : src.st || '', updatedAt: now } }); });
    if (c.office.amt > 0) ops.push({ op: 'set', col: 'bonusAcc', id: 'B' + id, data: { id: 'B' + id, d: day, sm: P.sm, amt: c.office.amt, src: '정산 확정', note: '정산 ' + P.sm + ' ' + day, ref: id } });
    let payee = null; try { payee = await S.DB.get('payees', P.sm); } catch (e) {}
    if (payee && payee.kind === '커미션' && c.pay > 0) ops.push({ op: 'set', col: 'pay1099', id: 'N' + id, data: { id: 'N' + id, d: day, who: P.sm, co: payee.co || '', amt: c.pay, gross: c.pay, acc: 0, note: '정산 확정', ref: id } });
    await S.DB.batch(ops);
    toast('확정 완료 — ' + keys.size + '건' + (deferred ? ' · 다음 정산으로 ' + deferred + '건' : '') + (c.skipped.length ? ' (금액 오류 ' + c.skipped.length + '건 제외)' : ''), 'good');
    HIST = null; C.at = 0; DED = null; DOVER = {};
    printOpen(settlementHtml({ sm: P.sm, day, from: P.from, to: P.to, comm, conf: { day, id } }));
    P.sm = ''; await loadAll(true); pagePay();
  } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
  busy(false);
}
/* ---- 📁 정산 완료 ---- */
let HIST = null;
async function loadHist() { if (HIST) return HIST; try { HIST = sortBy(await S.DB.list('settlements', { limit: 300 }), s => s.day + (s.createdAt || ''), true); } catch (e) { HIST = []; } return HIST; }
async function paintHistory() {
  const box = $('pOut'); box.innerHTML = '<div class="load">정산 기록 읽는 중…</div>';
  const list = await loadHist();
  if (!list.length) { box.innerHTML = '<div class="card"><h2>📁 정산 완료</h2><div class="none">아직 확정한 정산이 없습니다.<br><span style="font-size:12px">확정하면 여기에 날짜 · 세일즈맨별로 쌓입니다.</span></div></div>'; return; }
  let cur = '', html = '';
  list.forEach(s => { if (s.day !== cur) { cur = s.day; html += '<div class="dayhd" style="margin-top:12px"><span>' + esc(cur) + '</span></div>'; } html += '<div class="pr tap" data-sh="' + s.id + '"><div class="mk" style="background:#7c3aed;color:#fff;font-size:13px">🔒</div><div class="ct"><b>' + esc(s.sm) + '</b><small>' + esc(s.from || '') + ' ~ ' + esc(s.to || '') + ' · ' + s.n + '건' + (s.deferred ? ' · ↩ ' + s.deferred : '') + '</small></div><div class="pa"><b>' + money(s.finalPay != null ? s.finalPay : s.pay) + '</b><small>송금액 · 수금 ' + money(s.total) + '</small></div><button class="b-ghost b-sm" data-sx="' + s.id + '">📊</button></div>'; });
  box.innerHTML = '<div class="card"><h2>📁 정산 완료 — 확정된 커미션 지급 목록</h2>' + html + '<div class="hint" style="text-align:center">줄을 누르면 정산서 · 📊 는 엑셀</div></div>';
  box.querySelectorAll('[data-sh]').forEach(el => el.onclick = e => { if (e.target.dataset.sx) return; const s = list.find(x => x.id === el.dataset.sh); printOpen(settlementHtml(Object.assign({}, s, { conf: { day: s.day, id: s.id } }))); });
  box.querySelectorAll('[data-sx]').forEach(b => b.onclick = () => { const s = list.find(x => x.id === b.dataset.sx); xlsxSave(Object.assign({ sm: s.sm, day: s.day, from: s.from, to: s.to }, s.comm)); });
}
function ratesOpen() {
  const cols = RATE_LABELS.map(x => x[0]);
  openModal('<h2>세일즈맨 요율표</h2><table style="font-size:12.5px"><tr><th>이름</th>' + ['A', '할인', 'W', 'P', 'EX', 'DP', 'OFF'].map(c => '<th class="r">' + c + '</th>').join('') + '<th class="r">캐쉬</th></tr>' + S.sms.filter(s => s.active !== false).map(s => { const r = ratesOf(s); return '<tr><td><b>' + esc(s.code) + '</b></td>' + cols.map(c => '<td class="r">' + (Math.round(r[c] * 1000) / 10) + '%</td>').join('') + '<td class="r">' + (s.cashKeep ? '보관' : '') + '</td></tr>'; }).join('') + '</table><div class="hint">고치려면 관리 → 세일즈맨 요율. 캐쉬 보관은 정산 화면 공제 칸에서.</div><div class="btns"><button class="b-ghost" id="mX">닫기</button></div>');
  $('mX').onclick = closeModal;
}

/* ============================================================
 *  📉 디덕션 (6개월 초과 미수) · 캐쉬 보관
 * ============================================================ */
async function loadDed() {
  const sm = P.sm; if (!sm) return;
  let active = [], ar = null;
  try { active = (await S.DB.list('deductions', { where: [['sm', '==', sm]] })).filter(d => d.st !== '취소'); } catch (e) {}
  try { ar = await S.DB.get('ar', '_all'); } catch (e) {}
  const cand = { six: [], four: [], asOf: ar && ar.asOf || '', note: ar ? '' : 'AR 이 아직 없습니다' };
  if (ar && ar.stores) {
    const paid = {}; C.ents.forEach(e => { if (e.d <= ar.asOf || e.repl) return; (e.invs || []).forEach(v => { const kk = (v.acct || e.acct) + '|' + v.no; paid[kk] = R2((paid[kk] || 0) + num(v.amt)); }); });
    ar.stores.filter(s => (s.sm || '') === sm).forEach(s => {
      let pool = {}; const invs = sortBy((s.invs || []).map(v => Object.assign({}, v, { age: v.d ? daysBetween(v.d, today()) : (v.pdd || 0) + 30 })), v => v.d || '');
      /* 기준일 뒤 받은 돈은 인보이스별로, 남으면 오래된 것부터 */
      let extra = 0; invs.forEach(v => { const p = paid[s.acct + '|' + v.inv] || 0; v.net = R2(v.bal - p); if (v.net < 0 && v.bal > 0) { extra += -v.net; v.net = 0; } });
      invs.forEach(v => { if (extra > 0 && v.net > 0) { const t = Math.min(v.net, extra); v.net = R2(v.net - t); extra = R2(extra - t); } });
      const old = invs.filter(v => v.age >= 180 && v.net > 0.005), cr = invs.filter(v => v.net < -0.005), storeTot = R2(invs.reduce((a, v) => a + v.net, 0));
      const has = active.some(d => d.acct === s.acct && d.st !== '완료');
      if (old.length) { const amt = R2(sum(old, v => v.net) + sum(cr, v => v.net)); if (amt > 0.005 || has) cand.six.push({ acct: s.acct, store: s.store, amt, oldest: old[0].d, age: old[0].age, storeTot, has, invs: invs.filter(v => Math.abs(v.net) > 0.005).map(v => ({ inv: v.inv, d: v.d, age: v.age, amt: v.net })) }); }
      else { const mid = invs.filter(v => v.age >= 120 && v.net > 0.005); if (mid.length) cand.four.push({ acct: s.acct, store: s.store, storeTot, age: Math.max(...mid.map(v => v.age)) }); }
    });
  }
  cand.six = sortBy(cand.six, x => x.amt, true); cand.four = sortBy(cand.four, x => x.age, true);
  active.forEach(d => { const c6 = cand.six.find(x => x.acct === d.acct); d.nowSix = c6 ? c6.amt : 0; d.paidDown = c6 ? Math.max(0, R2(d.total - (d.used || 0) - c6.amt)) : 0; });
  DED = { sm, active: sortBy(active, d => d.start || ''), cand, per: Number(S.settings.dedPer) || 500 };
  if (P.sm === sm && TABNOW()) pagePay();
}
const TABNOW = () => location.hash.indexOf('#/pay') === 0;
function dedPaint() {
  const box = $('dedBox'); if (!box) return;
  if (!DED || DED.sm !== P.sm) { box.innerHTML = '<div class="none" style="padding:8px 0">공제 · 캐쉬 읽는 중…</div>'; return; }
  const d = DED, act = d.active.filter(x => x.st !== '완료'), c = d.cand, per = d.per, six = c.six.filter(x => !x.has), sm = S.smByCode[P.sm] || {};
  let h = '<h2 style="display:flex;justify-content:space-between;align-items:center;gap:8px">📉 6개월 초과 디덕션 <button class="b-ghost b-sm" id="dedAdd">＋ 직접 추가</button></h2><div class="hint">계산: 가게의 <b>180일 넘은 인보이스 잔액 + 크레딧</b> = 총 공제액 → 정산마다 <b>회당 ' + money(per) + '</b>씩 커미션(NET)에서 뺍니다. NET 을 넘지 않고, 다 빠지면 완료. AR 기준일 ' + esc(c.asOf || '—') + ' 뒤 받은 돈은 오래된 인보이스부터 뺐습니다.</div>';
  let sumNow = 0;
  h += '<div class="dedSub">① 진행 중 공제 · 이번 정산</div>';
  if (!act.length) h += '<div class="none" style="padding:6px 0;text-align:left">진행 중인 공제 없음</div>';
  else { act.forEach(x => { const rem = R2(x.total - (x.used || 0)); const capped = LAST_C && LAST_C.ded && LAST_C.ded.list.find(q => q.id === x.id); let v = capped ? capped.apply : DOVER.hasOwnProperty(x.id) ? num(DOVER[x.id]) : Math.min(x.per || rem, rem); v = Math.min(v, rem); sumNow += v;   /* NET 한도로 깎인 값을 그대로 보여 줌 */ const after = R2(rem - v), left = x.per > 0 ? Math.ceil(after / x.per - 1e-9) : 0;
    h += '<div class="dedCard"><div class="dedTop"><div style="flex:1;min-width:0" class="tap" data-ddt="' + x.id + '"><b>' + esc(x.acct || '') + '</b> ' + esc(x.store || '(가게 없음)') + ' <span style="font-size:11px;color:#2563eb">▾ 자세히</span><br><small class="muted">' + esc(x.why || '') + ' · 시작 ' + esc(x.start || '') + ' · 회당 ' + money(x.per) + '</small></div><div style="text-align:right"><small class="muted">이번 공제</small><br><input data-dov="' + x.id + '" value="' + v + '" inputmode="decimal" style="width:92px;text-align:right;padding:6px;font-size:15px;font-weight:700"></div></div>' +
      '<div class="dedNums"><div><small>총 공제</small>' + money(x.total) + '</div><div><small>지금까지</small>' + money(x.used || 0) + '</div><div><small>이번 뒤 남음</small><b>' + money(after) + '</b></div><div><small>남은 회차</small>' + (after > 0.005 ? left + '회' : '<span class="ok">완료</span>') + '</div></div>' +
      (x.paidDown > 0.005 ? '<div class="dedWarn">💰 가게가 그 뒤 ' + money(x.paidDown) + ' 갚음 — 지금 6개월+ 잔액 ' + money(x.nowSix) + ' <button class="b-ghost b-sm" data-dred="' + x.id + '">공제 줄이기</button></div>' : '') +
      '<div class="dedDet" id="dd_' + x.id + '" style="display:none"><div><b>근거 인보이스</b>: ' + esc(x.invs || '—') + '</div><div><b>공제 기록</b>: ' + ((x.hist || []).length ? x.hist.map(l => l.d + ' ' + money(l.amt)).join(' · ') : '아직 없음') + '</div>' + (x.note ? '<div><b>메모</b>: ' + esc(x.note) + '</div>' : '') + '<div style="margin-top:6px"><button class="b-ghost b-sm" data-dedit="' + x.id + '">수정</button> <button class="b-ghost b-sm" data-dcan="' + x.id + '">공제 취소</button></div></div></div>'; });
    h += '<div class="dedTotBar"><span>이번 정산 공제 합계</span><b>− ' + money(sumNow) + '</b></div>'; }
  h += '<div class="dedSub" style="display:flex;justify-content:space-between;align-items:center">② 6개월 넘은 미수 — 아직 공제 안 함 (' + six.length + '곳)' + (six.length > 1 ? '<button class="b-ghost b-sm" id="dedAll">전부 등록</button>' : '') + '</div>';
  if (!six.length) h += '<div class="none" style="padding:6px 0;text-align:left">없음 ' + (c.note ? '— ' + esc(c.note) : '') + '</div>';
  else six.forEach((x, i) => { h += '<div class="dedCand"><div style="display:flex;justify-content:space-between;gap:8px"><div><b>' + esc(x.acct) + '</b> ' + esc(x.store) + '<br><small class="muted">가장 오래된 ' + esc(x.oldest || '') + ' (' + x.age + '일) · 가게 잔액 ' + money(x.storeTot) + '</small></div><div class="r"><b class="warn">' + money(x.amt) + '</b><br><button class="b-ghost b-sm" data-dmk="' + x.acct + '">공제 등록</button></div></div><table class="dedInv">' + x.invs.map(v => '<tr class="' + (v.age >= 180 || v.amt < 0 ? 'on' : '') + '"><td>' + esc(v.inv) + '</td><td>' + esc(v.d || '') + '</td><td class="r">' + v.age + '일</td><td class="r">' + money(v.amt) + '</td><td>' + (v.amt < 0 ? '크레딧 (뺌)' : v.age >= 180 ? '⏰ 공제 포함' : '아직 6개월 전') + '</td></tr>').join('') + '</table></div>'; });
  if (c.four.length) h += '<div class="whybox" style="margin-top:8px">🕑 <b>곧 6개월</b> (4~6개월 미수) — 다음 정산 전에 정리 부탁: ' + c.four.slice(0, 10).map(x => esc(x.acct) + ' ' + esc(x.store) + ' ' + money(x.storeTot) + ' (' + x.age + '일)').join(' · ') + (c.four.length > 10 ? ' 외 ' + (c.four.length - 10) + '곳' : '') + '</div>';
  h += '<label class="cashkeep"><input type="checkbox" id="dedCash" ' + (sm.cashKeep ? 'checked' : '') + '> <span>받은 <b>캐쉬는 세일즈맨이 보관</b> — 지급액에서 캐쉬만큼 뺍니다</span></label>';
  box.innerHTML = h;
  box.querySelectorAll('[data-dov]').forEach(inp => inp.onchange = () => { DOVER[inp.dataset.dov] = inp.value; pagePay(); });
  box.querySelectorAll('[data-ddt]').forEach(el => el.onclick = () => { const r = $('dd_' + el.dataset.ddt); r.style.display = r.style.display === 'none' ? '' : 'none'; });
  box.querySelectorAll('[data-dmk]').forEach(b => b.onclick = () => { const x = six.find(y => y.acct === b.dataset.dmk); dedSave({ sm: P.sm, acct: x.acct, store: x.store, why: '6개월+ 미수 (' + (x.oldest || '') + '~)', total: x.amt, per, invs: x.invs.filter(v => v.age >= 180 || v.amt < 0).map(v => v.inv + ':' + v.amt).join(', ') }); });
  if ($('dedAll')) $('dedAll').onclick = async () => { const L = six.filter(x => x.amt > 0); if (!(await confirmBox(L.length + '곳을 공제로 등록할까요? (회당 ' + money(per) + ')\n' + L.map(x => x.acct + ' ' + x.store + ' ' + money(x.amt)).join('\n'), '등록'))) return; for (const x of L) await dedSave({ sm: P.sm, acct: x.acct, store: x.store, why: '6개월+ 미수 (' + (x.oldest || '') + '~)', total: x.amt, per, invs: x.invs.filter(v => v.age >= 180 || v.amt < 0).map(v => v.inv + ':' + v.amt).join(', ') }, true); DED = null; loadDed(); };
  $('dedAdd').onclick = dedManual;
  box.querySelectorAll('[data-dedit]').forEach(b => b.onclick = () => dedEdit(b.dataset.dedit));
  box.querySelectorAll('[data-dcan]').forEach(b => b.onclick = async () => { if (!(await confirmBox('이 공제를 취소할까요? (지금까지 뺀 기록은 남습니다)', '공제 취소'))) return; await S.DB.update('deductions', b.dataset.dcan, { st: '취소', updatedAt: new Date().toISOString() }); DED = null; loadDed(); });
  box.querySelectorAll('[data-dred]').forEach(b => b.onclick = async () => { const x = act.find(y => y.id === b.dataset.dred); const nt = R2((x.used || 0) + Math.max(0, x.nowSix)); if (!(await confirmBox(x.store + ' — 총 공제액 ' + money(x.total) + ' → ' + money(nt) + ' 로 줄입니다. (가게가 갚은 ' + money(x.paidDown) + ' 만큼. 이미 뺀 ' + money(x.used || 0) + ' 는 그대로)', '줄이기'))) return; await S.DB.update('deductions', x.id, nt <= (x.used || 0) + 0.005 ? { total: x.used || 0, st: (x.used || 0) > 0.005 ? '완료' : '취소', note: (x.note ? x.note + ' · ' : '') + '가게 수금으로 종료' } : { total: nt, note: (x.note ? x.note + ' · ' : '') + '가게 수금 ' + x.paidDown + ' 반영' }); DED = null; loadDed(); });
  $('dedCash').onchange = async () => { const on = $('dedCash').checked; try { await S.DB.update('salesmen', P.sm, { cashKeep: on }); if (S.smByCode[P.sm]) S.smByCode[P.sm].cashKeep = on; toast(on ? '캐쉬 차감 켬' : '캐쉬 차감 끔'); } catch (e) { toast('실패: ' + e.message, 'bad'); } pagePay(); };
}
async function dedSave(o, quiet) {
  const id = o.id || newId('D'), now = new Date().toISOString();
  const doc = Object.assign({ used: 0, st: '', start: today(), note: '', hist: [], createdBy: S.user.email, createdAt: now }, o, { id, total: R2(num(o.total)), per: R2(num(o.per)) || R2(num(o.total)), updatedAt: now });
  if (!doc.total) return toast('총 공제액을 넣어 주세요', 'bad');
  try { await S.DB.set('deductions', id, doc); if (!quiet) { toast('공제 등록 — ' + (doc.store || ''), 'good'); DED = null; loadDed(); } } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
}
function dedManual() {
  const per = DED ? DED.per : 500;
  openModal('<h2>＋ 직접 공제 — ' + esc(P.sm) + '</h2><div class="fg"><label>가게 / 사유</label><input id="dmS" placeholder="예: ABC BEAUTY 반품 미처리"></div><div class="two"><div class="fg"><label>총액 $</label><input id="dmA" inputmode="decimal"></div><div class="fg"><label>회당 $</label><input id="dmP" inputmode="decimal" value="' + per + '"></div></div><div class="fg"><label>계정코드 (선택)</label><input id="dmC" inputmode="numeric" maxlength="4"></div><div class="btns"><button class="b-ghost" id="mX">취소</button><button class="b-blue" id="mOk">추가</button></div>');
  $('mX').onclick = closeModal; $('mOk').onclick = () => { const s = $('dmS').value.trim(); if (!s) return toast('가게 / 사유를 넣어 주세요', 'bad'); closeModal(); dedSave({ sm: P.sm, acct: $('dmC').value.trim(), store: s, why: '기타', total: $('dmA').value, per: $('dmP').value }); };
}
function dedEdit(id) {
  const x = DED.active.find(a => a.id === id); if (!x) return;
  openModal('<h2>공제 수정 — ' + esc(x.store) + '</h2><div class="two"><div class="fg"><label>총 공제액</label><input id="deT" value="' + x.total + '" inputmode="decimal"></div><div class="fg"><label>회당 공제액</label><input id="deP" value="' + x.per + '" inputmode="decimal"></div></div><div class="fg"><label>메모</label><input id="deN" value="' + esc(x.note || '') + '"></div><div class="heroSub">지금까지 공제 ' + money(x.used || 0) + ' · 남은 ' + money(R2(x.total - (x.used || 0))) + '</div><div class="btns"><button class="b-ghost" id="mX">취소</button><button class="b-blue" id="mOk">저장</button></div>');
  $('mX').onclick = closeModal; $('mOk').onclick = async () => { closeModal(); await S.DB.update('deductions', id, { total: R2(num($('deT').value)), per: R2(num($('deP').value)), note: $('deN').value.trim(), updatedAt: new Date().toISOString() }); DED = null; loadDed(); };
}

/* ============================================================
 *  📊 엑셀 (정산서 → xlsx, 수식 포함)
 * ============================================================ */
function loadXlsx() { return new Promise((res, rej) => { if (window.XLSX) return res(); const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
function stmtRows(c) {
  const R = [], A = r => { R.push(r); return R.length; }; const SL = { REG: 'A', SPECIAL: 'EX', DISC: 'DISC', NEWDP: 'NEW DP' };
  A([c.sm + ' COMMISSION ' + (c.day || '') + '  (' + (c.from || '') + ' ~ ' + (c.to || '') + ')']);
  A(['할인 %', '가게 Store', 'CHECK # / 방법', 'CHECK·ACH $', 'CASH $', '인보이스', 'P $', 'W $', '구역', '받은 날']);
  const first = R.length + 1;
  const sec = (title, list) => { if (!list.length) return; A(['', title]); list.forEach(L => A([L.disc === '' || L.disc == null ? '' : { pct: Number(L.disc) / 100 }, L.store + (L.part === 'W' ? ' (W 분)' : L.part === 'A' ? ' (A 분)' : ''), L.methods, L.e || 0, L.f || 0, L.invs, L.P || 0, L.W || 0, SL[L.sec] || L.sec, L.d])); };
  sec('현장 수금 (CHECK · CASH · ZELLE)', c.lines.filter(L => L.src === 'FIELD')); A([]); sec('COD & ACH & CREDIT CARD', c.lines.filter(L => L.src !== 'FIELD'));
  const last = R.length; A([]); const rT = R.length + 1;
  A(['', '', 'TOTAL', { f: 'SUM(D' + first + ':D' + last + ')', v: c.totals.check }, { f: 'SUM(E' + first + ':E' + last + ')', v: c.totals.cash }, { f: 'D' + rT + '+E' + rT, v: c.totals.total }]); A([]);
  const bStart = R.length + 1; c.buckets.forEach(b => { const r = R.length + 1; A(['', b.label, '', '', '', b.base, { pct: b.rate }, { f: 'F' + r + '*G' + r, v: b.amt }]); }); const bEnd = R.length; A([]);
  const rNet = A(['', '', '', '', '', '', 'NET', { f: 'SUM(H' + bStart + ':H' + bEnd + ')', v: c.net }]);
  const dedRows = []; ((c.ded && c.ded.list) || []).filter(d => d.apply > 0).forEach(d => dedRows.push(A(['', 'DEDUCTION · ' + d.store, d.why || '', '', '총 ' + d.total, '남은 ' + R2(d.remaining - d.apply), 'DEDUCTION', -d.apply])));
  const rNp = A(['', '', '', '', '', '', 'NET PAYMENT', { f: 'H' + rNet + (dedRows.length ? '+SUM(H' + dedRows[0] + ':H' + dedRows[dedRows.length - 1] + ')' : ''), v: c.netPay }]);
  const rDp = A(['', '', '', '', '', 'DP', { pct: c.dp.rate }, { f: '-H' + rNp + '*G' + (R.length + 1), v: -c.dp.amt }]);
  const rOf = A(['', '', '', '', '', 'OFFICE', { pct: c.office.rate }, { f: '-H' + rNp + '*G' + (R.length + 1), v: -c.office.amt }]);
  const rTot = A(['', '', '', '', '', '', 'TOTAL', { f: 'H' + rNp + '+H' + rDp + '+H' + rOf, v: c.pay }]);
  if (c.cashKeep) { const rC = A(['', '', '', '', '', '', 'CASH (보관)', { f: '-E' + rT, v: -c.cashKeep }]); A(['', '', '', '', '', '', 'FINAL PAY', { f: 'H' + rTot + '+H' + rC, v: c.finalPay }]); }
  if (c.ded && c.ded.list && c.ded.list.length) { A([]); A(['', 'DEDUCTION 내역 — 6개월 넘게 수금 못 한 계정']); A(['계정', '가게', '근거 인보이스', '총 공제', '이전까지', '이번', '남은', '남은 회차', '사유', '시작']); c.ded.list.forEach(d => { const after = R2(d.remaining - d.apply), left = d.per > 0 ? Math.ceil(after / d.per - 1e-9) : 0; A([d.acct || '', d.store, String(d.invs || ''), d.total, d.used, d.apply, after, after > 0.005 ? left + '회' : '완료', d.why || '', d.start || '']); }); }
  if (c.skipped && c.skipped.length) { A([]); A(['', '금액 오류로 이번 정산에서 제외']); c.skipped.forEach(s => A(['', s.store, s.methods, s.got, '', s.invs, '', '', s.why, s.d])); }
  return R;
}
async function xlsxSave(c) {
  try { await loadXlsx(); } catch (e) { return toast('엑셀 도구를 불러오지 못했습니다 (인터넷 확인)', 'bad'); }
  try {
    const rows = stmtRows(c), ws = {}; let maxC = 0;
    rows.forEach((r, i) => r.forEach((v, j) => { if (v === '' || v == null) return; const ref = XLSX.utils.encode_cell({ r: i, c: j }); let cell; if (typeof v === 'object' && v.pct != null) cell = { t: 'n', v: v.pct, z: '0.0%' }; else if (typeof v === 'object') cell = { t: 'n', f: v.f, v: v.v, z: '#,##0.00' }; else if (typeof v === 'number') cell = { t: 'n', v, z: '#,##0.00' }; else cell = { t: 's', v: String(v) }; ws[ref] = cell; maxC = Math.max(maxC, j); }));
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: Math.max(maxC, 9) } });
    ws['!cols'] = [{ wch: 8 }, { wch: 34 }, { wch: 22 }, { wch: 13 }, { wch: 11 }, { wch: 28 }, { wch: 11 }, { wch: 13 }, { wch: 9 }, { wch: 11 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, (c.sm + ' ' + (c.day || '')).substring(0, 31));
    XLSX.writeFile(wb, c.sm + '_COMMISSION_' + String(c.day || '').replace(/-/g, '') + '.xlsx'); toast('엑셀 파일을 내려받았습니다', 'good');
  } catch (e) { toast('엑셀 저장 실패: ' + e.message, 'bad'); }
}

/* ============================================================
 *  ③ 미수금 (회사 전체) — 세일즈맨별 · 연체 상위 · 60일+ 수금 없음 · 담당 바뀜 · 수금 없는 가게
 * ============================================================ */
let AV = 'sum', AV_SM = '';
async function pageAR() {
  $('page').innerHTML = '<div class="load">읽는 중…</div>';
  const all = await S.DB.get('ar', '_all');
  await loadAll();
  if (!all || !all.stores) { $('page').innerHTML = '<div class="card"><h2>💰 미수금</h2><div class="none">아직 올라온 AR 이 없습니다 — 담당자 화면 📤 AR 올리기에서 올립니다</div></div>' + '<div class="card" id="oldBox"></div>'; paintOld(); return; }
  const asOf = all.asOf, paid = {}, t = today();
  C.ents.forEach(e => { if (e.d <= asOf || e.repl) return; (e.invs || []).forEach(v => { const kk = (v.acct || e.acct) + '|' + v.no; paid[kk] = R2((paid[kk] || 0) + num(v.amt)); }); });
  /* 실제 수금 담당 (최근 1년) */
  const payer = {}; C.ents.forEach(e => { if (!e.acct) return; payer[e.acct] = payer[e.acct] || {}; payer[e.acct][e.sm] = (payer[e.acct][e.sm] || 0) + 1; });
  const realSm = acct => { const m = payer[acct]; if (!m) return ''; return Object.keys(m).sort((a, b) => m[b] - m[a])[0]; };
  let stores = all.stores.map(s => { let net = 0; const b = [0, 0, 0, 0, 0]; const invs = (s.invs || []).map(v => { const p = paid[s.acct + '|' + v.inv] || 0, bal = R2(v.bal - p); net += bal; if (bal > 0) b[Math.max(0, Math.min(4, v.bk || 0))] += bal; return Object.assign({}, v, { net: bal }); }); const rs = realSm(s.acct); return Object.assign({}, s, { net: R2(net), b: b.map(R2), invs, maxPdd: Math.max(0, ...invs.filter(v => v.net > 0.005).map(v => v.pdd || 0)), moved: rs && rs !== (s.sm || '') ? s.sm : '', sm: rs || s.sm || '' }); }).filter(s => s.net > 0.005);
  const smAll = Object.keys(groupBy(stores, s => s.sm || '(없음)')).sort();
  if (AV_SM) stores = stores.filter(s => (s.sm || '(없음)') === AV_SM);
  const total = sum(stores, s => s.net), bk = [0, 1, 2, 3, 4].map(i => sum(stores, s => s.b[i])), pct90 = Math.round(bk[4] / Math.max(1, total) * 100);
  const bySm = groupBy(stores, s => s.sm || '(없음)');
  const trend = AV_SM ? [] : await arTrend(asOf, total, bk);
  const smRows = sortBy(Object.keys(bySm).map(sm => ({ sm, total: sum(bySm[sm], s => s.net), n: bySm[sm].length, b: [0, 1, 2, 3, 4].map(i => sum(bySm[sm], s => s.b[i])), dorm: bySm[sm].filter(s => s.dormant).length })), x => x.total, true);
  const top = sortBy(stores.filter(s => s.maxPdd > 60), s => s.net, true).slice(0, 40), stale = sortBy(stores.filter(s => !s.lastPaid || daysBetween(s.lastPaid, t) > 60), s => s.net, true).slice(0, 40), moved = sortBy(stores.filter(s => s.moved), s => s.net, true);
  const LB = ['기한 전', '1-30', '31-60', '61-90', '90+'];
  const stack = (b, tot) => tot ? '<div class="stack">' + b.map((v, i) => '<i class="s' + i + '" style="width:' + (v / tot * 100) + '%"></i>').join('') + '</div>' : '';
  const views = [['sum', '요약'], ['top', '연체 상위 ' + top.length], ['stale', '60일+ 수금 없음 ' + stale.length], ['moved', '담당 바뀜 ' + moved.length], ['old', '수금 없는 가게']];
  let h = '<div class="card"><h2>💰 미수금 (AR) · 기준일 ' + esc(asOf) + (daysBetween(asOf, t) > 10 ? ' <span class="warn">(' + daysBetween(asOf, t) + '일 전 — 새로 올려 주세요)</span>' : ' (' + daysBetween(asOf, t) + '일 전)') + '</h2>' +
    '<div class="seg"><button class="' + (AV_SM ? '' : 'on') + '" data-avsm="">전체</button>' + smAll.map(s => '<button class="' + (AV_SM === s ? 'on' : '') + '" data-avsm="' + esc(s) + '">' + esc(s) + '</button>').join('') + '</div>' +
    '<div class="hero">' + money(total) + '</div><div class="heroSub">' + stores.length + '곳 · 90일+ <b class="' + (pct90 >= 30 ? 'warn' : '') + '">' + pct90 + '%</b>' + (stores.filter(s => s.dormant).length ? ' · 💤 1년+ 거래 없음 ' + stores.filter(s => s.dormant).length + '곳' : '') + (all.noSmAmt && !AV_SM ? ' · 담당 없음 ' + money(all.noSmAmt) : '') + '</div>' +
    '<div class="kpi" style="grid-template-columns:repeat(5,1fr)">' + LB.map((l, i) => '<div class="k' + i + '"><b style="font-size:11.5px">' + k(bk[i]) + '</b><span>' + l + '</span></div>').join('') + '</div>' +
    '<div class="chips">' + views.map(v => '<button class="' + (AV === v[0] ? 'on' : '') + '" data-av="' + v[0] + '">' + v[1] + '</button>').join('') + '</div></div>';
  const storeRow = (s, extra) => '<div class="pr tap" data-fs="' + esc(s.acct) + '"><div class="ct"><b>' + esc(s.store) + '</b><small>' + esc(s.acct) + ' · ' + esc(s.sm || '담당 없음') + (s.moved ? ' <span style="color:#6b21a8">← SmartBee ' + esc(s.moved) + '</span>' : '') + (s.lastPaid ? ' · 마지막 수금 ' + md(s.lastPaid) : ' · 수금 기록 없음') + (s.dormant ? ' · 💤' : '') + '</small></div>' + (extra || '') + '<div class="pa"><b>' + money(s.net) + '</b></div></div>';
  if (AV === 'sum') h += trendBox(trend) + '<div class="card"><h2>세일즈맨별 미수금 · 90일+ 비율</h2><table><tr><th>이름</th><th class="r">미수금</th><th class="r">90일+</th></tr>' + smRows.map(x => '<tr class="tap" data-avsm="' + esc(x.sm) + '"><td><b>' + esc(x.sm) + '</b><small style="display:block;color:#94a3b8;font-size:11px">' + x.n + '곳' + (x.dorm ? ' · 💤 ' + x.dorm : '') + '</small>' + stack(x.b, x.total) + '</td><td class="r"><b>' + money(x.total) + '</b></td><td class="r ' + (x.b[4] / Math.max(1, x.total) >= 0.3 ? 'warn' : '') + '">' + Math.round(x.b[4] / Math.max(1, x.total) * 100) + '%</td></tr>').join('') + '</table><div class="hint" style="text-align:center">이름을 누르면 그 담당만 · 막대 = 기한전/1-30/31-60/61-90/90+</div></div>';
  else if (AV === 'top') h += '<div class="card"><h2>연체 큰 순 (61일 이상)</h2>' + (top.map(s => storeRow(s, '<span class="agebadge ' + (s.maxPdd > 90 ? 'a4' : 'a3') + '">' + s.maxPdd + '일</span>')).join('') || '<div class="none">없음</div>') + '</div>';
  else if (AV === 'stale') h += '<div class="card"><h2>잔액은 있는데 60일 넘게 수금 없음</h2>' + (stale.map(s => storeRow(s, '<span class="agebadge a3">' + (s.lastPaid ? daysBetween(s.lastPaid, t) + '일' : '없음') + '</span>')).join('') || '<div class="none">없음</div>') + '</div>';
  else if (AV === 'moved') h += '<div class="card"><h2>SmartBee 담당과 실제 수금 담당이 다른 가게</h2><div class="alert a-blu">앱은 최근 1년 실제 수금한 사람을 담당으로 봅니다. SmartBee 쪽 담당을 고치면 사라집니다.</div>' + (moved.map(s => storeRow(s)).join('') || '<div class="none">없음</div>') + '</div>';
  else h += '<div class="card" id="oldBox"></div>';
  $('page').innerHTML = h;
  document.querySelectorAll('[data-avsm]').forEach(b => b.onclick = () => { AV_SM = b.dataset.avsm; pageAR(); });
  document.querySelectorAll('[data-av]').forEach(b => b.onclick = () => { AV = b.dataset.av; pageAR(); });
  document.querySelectorAll('[data-fs]').forEach(el => el.onclick = () => Router.go('find', encodeURIComponent(el.dataset.fs)));
  if (AV === 'old') paintOld();
}
/* ---- AR 추이 — AR 을 올릴 때마다 기준일별 합계를 ar/_trend 에 쌓아 둠 (옛 대시보드 AR TREND) ---- */
async function arTrend(asOf, total, bk) {
  let doc = null; try { doc = await S.DB.get('ar', '_trend'); } catch (e) {}
  const pts = (doc && doc.pts) || [];
  if (asOf && !pts.some(p => p.asOf === asOf)) { pts.push({ asOf, total: R2(total), b90: R2(bk[4]), b61: R2(bk[3]) }); pts.sort((a, b) => a.asOf < b.asOf ? -1 : 1); while (pts.length > 60) pts.shift(); try { await S.DB.set('ar', '_trend', { pts, updatedAt: new Date().toISOString() }); } catch (e) {} }
  return pts;
}
function trendBox(pts) {
  if (!pts || pts.length < 2) return '';
  const P2 = pts.slice(-16), mx = Math.max(1, ...P2.map(p => p.total)), first = P2[0], last = P2[P2.length - 1], diff = R2(last.total - first.total);
  return '<div class="card"><h2>📈 미수금 추이 (AR 올린 기준일마다)</h2><div class="heroSub">' + esc(first.asOf) + ' → ' + esc(last.asOf) + ' · <b class="' + (diff > 0 ? 'warn' : 'ok') + '">' + (diff > 0 ? '+' : '') + money(diff) + '</b></div>' +
    '<div class="trend">' + P2.map(p => '<div title="' + esc(p.asOf) + ' ' + money(p.total) + '"><i style="height:' + Math.max(3, Math.round(p.total / mx * 70)) + 'px"><b style="height:' + Math.round(p.b90 / Math.max(1, p.total) * 100) + '%"></b></i><span>' + esc(p.asOf.substring(5)) + '</span></div>').join('') + '</div><div class="hint" style="text-align:center">막대 = 미수금 합계 · 빨간 부분 = 90일+</div></div>';
}
function paintOld() {
  const el = $('oldBox'); if (!el) return;
  const t = today(), old = Number(S.settings.oldDays) || 45, last = {};
  C.ents.forEach(e => { if (e.acct && (!last[e.acct] || e.d > last[e.acct])) last[e.acct] = e.d; });
  const list = sortBy(S.accounts.filter(a => !AV_SM || (a.sm || '') === AV_SM).map(a => ({ store: a.store, acct: a.acct, sm: a.sm, last: last[a.acct] || '', days: last[a.acct] ? daysBetween(last[a.acct], t) : '' })), x => x.days === '' ? 99999 : x.days, true);
  const overdue = list.filter(x => x.days === '' || x.days > old).length;
  el.innerHTML = '<h2>수금 없는 가게 (수금 기록 기준)</h2><div class="heroSub" style="margin-bottom:8px"><b class="warn">' + overdue + '곳</b> 이 ' + old + '일 넘게 수금이 없습니다 (최근 13개월 기록 기준) · 전체 ' + list.length + '곳</div><table><tr><th>가게</th><th>담당</th><th class="r">마지막 수금</th><th class="r">경과</th></tr>' + list.slice(0, 150).map(x => '<tr class="tap" data-fs="' + esc(x.acct) + '"><td class="nm">' + esc(x.store) + ' <span style="font-size:11px;color:#94a3b8">' + esc(x.acct) + '</span></td><td class="muted" style="font-size:12px">' + esc(x.sm || '—') + '</td><td class="r" style="font-size:12px">' + (x.last || '<span class="warn">없음</span>') + '</td><td class="r ' + (x.days === '' || x.days > old ? 'warn' : '') + '">' + (x.days === '' ? '—' : x.days + '일') + '</td></tr>').join('') + '</table>';
  el.querySelectorAll('[data-fs]').forEach(e => e.onclick = () => Router.go('find', encodeURIComponent(e.dataset.fs)));
}

/* ============================================================
 *  ④ 찾기 — 가게 수금 이력
 * ============================================================ */
async function pageFind(q) {
  await loadAll();
  $('page').innerHTML = '<div class="card"><h2>🔎 가게 찾기</h2><div class="two"><input id="fq" placeholder="가게 이름 또는 계정코드" value="' + esc(q || '') + '" autocomplete="off"><button class="b-blue" id="fgo">찾기</button></div><div id="fHits"></div></div><div id="fOut"></div>';
  $('fgo').onclick = () => Router.go('find', encodeURIComponent($('fq').value.trim())); $('fq').onkeydown = e => { if (e.key === 'Enter') $('fgo').click(); };
  if (!q) { setTimeout(() => $('fq').focus(), 0); return; }
  const rows = allRows(); let acct = '', store = '';
  const a = S.accounts.byCode[q] || (searchAccounts(S.accounts, q, 1)[0]);
  const hits = searchAccounts(S.accounts, q, 8);
  if (hits.length > 1) $('fHits').innerHTML = '<div class="chips" style="margin-top:8px">' + hits.map(x => '<button class="' + (a && x.acct === a.acct ? 'on' : '') + '" data-fh="' + esc(x.acct) + '">' + esc(x.store) + ' ' + esc(x.acct) + '</button>').join('') + '</div>';
  document.querySelectorAll('[data-fh]').forEach(b => b.onclick = () => Router.go('find', encodeURIComponent(b.dataset.fh)));
  if (a) { acct = a.acct; store = a.store; }
  const items = sortBy(rows.filter(r => acct ? r.acct === acct : hasWords(r.store, q)), r => r.d, true);
  if (!items.length && !a) { $('fOut').innerHTML = '<div class="card"><div class="none">"' + esc(q) + '" — 가게도 수금 기록도 없습니다</div></div>'; return; }
  const months = recentYms(12).reverse().map(m => ({ ym: m, amt: sum(items.filter(r => r.ym === m), r => r.amt) })), mx = Math.max(1, ...months.map(x => x.amt));
  const ar = await S.DB.get('ar', '_all').catch(() => null); const ars = ar && ar.stores ? ar.stores.find(s => s.acct === acct) : null;
  $('fOut').innerHTML = '<div class="card"><h2>' + esc(store || items[0].store) + (acct ? ' <span class="code">' + esc(acct) + '</span>' : '') + (a && a.sm ? ' · 담당 ' + esc(a.sm) : '') + '</h2>' + (a ? '<div class="muted">' + esc([a.addr, a.city, a.state, a.zip].filter(Boolean).join(', ')) + (a.tel ? ' · ' + esc(a.tel) : '') + (a.terms ? ' · ' + esc(a.terms) : '') + '</div>' : '') +
    '<div class="hero">' + money(sum(items, r => r.amt)) + '</div><div class="heroSub">' + items.length + '건 (최근 13개월)' + (ars ? ' · AR 잔액 ' + money(ars.total) + ' (기준일 ' + esc(ar.asOf) + ')' : '') + '</div><div class="bars" style="margin-top:12px">' + months.map(x => '<div class="b' + (x.ym === ym(today()) ? ' on' : '') + '" style="height:' + Math.max(2, Math.round(x.amt / mx * 78)) + 'px" data-v="' + x.ym.substring(5) + '월 ' + k(x.amt) + '"></div>').join('') + '</div><div class="xlab"><span>' + months[0].ym + '</span><span>최근 12개월</span><span>' + months[11].ym + '</span></div></div>' +
    '<div class="card"><h2>수금 내역</h2>' + (items.length ? '<table><tr><th>날짜</th><th>방법</th><th>담당</th><th class="r">금액</th></tr>' + items.map(r => '<tr><td style="font-size:13px">' + esc(r.d) + '</td><td><span class="tag ' + SRC_TAG[r.src][1] + '">' + SRC_TAG[r.src][0] + '</span> <span class="muted" style="font-size:12px">' + esc(r.method || '') + (r.check ? ' #' + esc(r.check) : '') + '</span></td><td class="muted" style="font-size:12px">' + esc(r.sm) + '</td><td class="r"><b>' + money(r.amt) + '</b></td></tr>').join('') + '</table>' : '<div class="none">수금 기록이 없습니다</div>') + '</div>';
}
