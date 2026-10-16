/* ============================================================
 *  거래처 한눈에 — SBMGo 의 "Invoices and Payment" 창
 *    미수금(AR) · 에이징 · 지난 오더 · 수금 기록, 그리고 아이템별 "이 가게가 최근에 산 기록"
 *  세일즈맨은 자기 가게(자기 sm 의 AR · 수금)만, 담당자는 가게 담당 세일즈맨 기준으로 봅니다
 * ============================================================ */
import { $, esc, money, R2, num, md, toast, openModal, closeModal, sortBy, daysBetween, today, bi, bt } from './ui.js';
import { recentYms, stTag } from './orders.js';

let S = null;
export function register(state) { S = state; }
const CACHE = {};   // acct → { at, ar, orders, pays, hist }
const BK = ['기한 전 Current', '1-30', '31-60', '61-90', '90+'];
const isStaff = () => S.role !== 'salesman';
const mySm = () => (S.me && S.me.sm ? String(S.me.sm).toUpperCase() : '');

/** 가게 자료 읽기 (10분 보관) — 인터넷이 없으면 Firestore 오프라인 사본에서 */
export async function storeInfo(acct, force) {
  const c = CACHE[acct]; if (c && !force && Date.now() - c.at < 600000) return c;
  const a = S.accounts.byCode ? S.accounts.byCode[acct] : null;
  const sm = isStaff() ? String((a && a.sm) || mySm() || '').toUpperCase() : mySm();
  const out = { at: Date.now(), acct, sm, ar: null, invs: [], bk: [0, 0, 0, 0, 0], bal: 0, asOf: '', orders: [], pays: [], hist: {}, err: '' };
  const wh = [['acct', '==', acct]]; if (!isStaff()) wh.push(['sm', '==', mySm()]);
  try {
    const [arDoc, orders, pays] = await Promise.all([
      sm ? S.DB.get('ar', sm).catch(() => null) : null,
      S.DB.list('orders', { where: wh }).catch(() => []),
      S.DB.list('entries', { where: wh.concat([['ym', 'in', recentYms(6)]]) }).catch(() => [])
    ]);
    /* AR — 기준일 이후 내가 받은 돈을 빼서 지금 잔액으로 */
    let st = arDoc && arDoc.stores ? arDoc.stores.find(s => s.acct === acct) : null;
    let arUse = arDoc;
    /* 담당자: 거래처의 담당 세일즈맨과 AR 의 세일즈맨이 다르면 다른 AR 문서도 찾아봄 */
    if (!st && isStaff()) { try { const all = await S.DB.list('ar'); for (const d of all) { const x = (d.stores || []).find(s => s.acct === acct); if (x) { st = x; arUse = d; out.sm = d.id; break; } } } catch (e) {} }
    if (arUse && arUse.stores) {
      out.asOf = arUse.asOf || '';
      if (st) {
        const paid = {};
        pays.forEach(e => { if (e.void || e.repl || e.d <= out.asOf) return; (e.invs || []).forEach(v => { const k = v.no; paid[k] = R2((paid[k] || 0) + num(v.amt)); }); });
        out.invs = (st.invs || []).map(v => { const p = paid[v.inv] || 0; return { no: v.inv, d: v.d, amt: v.amt, paid: p, bal: R2(v.bal - p), pdd: v.pdd || 0, bk: v.bk || 0 }; }).sort((x, y) => x.d < y.d ? 1 : -1);
        out.invs.forEach(v => { out.bal += v.bal; if (v.bal > 0.005) out.bk[Math.max(0, Math.min(4, v.bk))] += v.bal; });
        out.bal = R2(out.bal); out.bk = out.bk.map(R2);
      }
    }
    out.orders = sortBy(orders.filter(o => o.st !== 'x'), o => o.d + (o.createdAt || ''), true).slice(0, 30);
    out.pays = sortBy(pays.filter(e => !e.void), e => e.d + (e.createdAt || ''), true).slice(0, 30);
    /* 아이템별 최근 구매 — 최근 오더 8건의 줄을 읽음 (인보이스 확정된 것 우선) */
    const recent = out.orders.filter(o => o.st === 'done' || o.st === 'pick' || o.st === 'ok' || o.st === 'sent').slice(0, 8);
    const Ls = await Promise.all(recent.map(o => S.DB.get('orderLines', o.id).catch(() => null)));
    Ls.forEach((L, i) => { if (!L || !L.lines) return; const d = recent[i].d; L.lines.forEach(l => { const q = l.pq != null && recent[i].st === 'done' ? l.pq : l.q; if (!q) return; (out.hist[l.c] = out.hist[l.c] || []).push([d, q, l.p]); }); });
  } catch (e) { out.err = String(e.code || e.message); }
  CACHE[acct] = out;
  return out;
}
/** "10/07(3) 07/28(3)" — 최근 3번 */
export function histText(info, code) { const h = info && info.hist[code]; if (!h || !h.length) return ''; return h.slice(0, 3).map(x => md(x[0]) + '(' + x[1] + ')').join(' '); }
export function lastPrice(info, code) { const h = info && info.hist[code]; return h && h.length ? h[0][2] : null; }

/** 가게 창 열기 */
export async function storeSheet(acct, onPick) {
  const a = S.accounts.byCode ? S.accounts.byCode[acct] : null;
  openModal('<h2>' + esc(a ? a.store : acct) + '</h2><div class="load">읽는 중…</div>');
  const info = await storeInfo(acct);
  const live = info.invs.filter(v => v.bal > 0.005), credits = info.invs.filter(v => v.bal < -0.005);
  const stale = info.asOf ? daysBetween(info.asOf, today()) : 0;
  let tab = 'inv';
  const paint = () => {
    let body = '';
    if (tab === 'inv') body = live.length || credits.length ? '<table><tr><th>인보이스 Invoice</th><th>날짜 Date</th><th class="r">금액 Amt</th><th class="r">잔액 Bal</th></tr>' +
      live.concat(credits).map(v => '<tr' + (v.bk >= 3 ? ' style="background:#fef2f2"' : '') + '><td><b>' + esc(v.no) + '</b></td><td>' + esc(md(v.d)) + (v.pdd > 0 ? ' <span class="muted">' + v.pdd + '일</span>' : '') + '</td><td class="r">' + money(v.amt) + '</td><td class="r"><b>' + money(v.bal) + '</b></td></tr>').join('') + '</table>' : '<div class="none">미결 인보이스 없음 · No open invoices' + (info.asOf ? '' : ' (AR 아직 안 올라옴 · AR not uploaded yet)') + '</div>';
    else if (tab === 'ord') body = info.orders.length ? info.orders.map(o => '<div class="pr tap" data-so="' + esc(o.id) + '"><div class="ct"><b>' + esc(o.no) + ' ' + stTag(o.st) + '</b><small>' + esc(o.d) + ' · ' + esc(o.sm) + (o.invs && o.invs.length ? ' · ' + esc(o.invs.join(', ')) : '') + (o.memo ? ' · ' + esc(o.memo) : '') + '</small></div><div class="pa"><b>' + money(o.amt) + '</b><small>' + (o.n || 0) + '줄 · ' + (o.qty || 0) + '개</small></div></div>').join('') : '<div class="none">앱으로 넣은 오더가 아직 없습니다 · No app orders yet</div>';
    else body = info.pays.length ? info.pays.map(e => '<div class="pr"><div class="ct"><b>' + esc((e.pays || []).map(p => p.m === 'CHECK' ? '#' + p.ref : p.m).join(', ') || '수금') + '</b><small>' + esc(e.d) + ' · ' + esc(e.sm) + (e.invs && e.invs.length ? ' · ' + esc(e.invs.map(v => v.no).filter(Boolean).join(', ')) : '') + '</small></div><div class="pa"><b>' + money(e.total) + '</b><small>' + (e.settled ? '정산됨' : e.v ? '확인' : e.sb ? '입력' : '') + '</small></div></div>').join('') : '<div class="none">최근 6개월 수금 기록 없음 · No payments in 6 months</div>';
    $('mbox').innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div><h2 style="margin:0">' + esc(a ? a.store : acct) + '</h2><div class="muted">' + esc(acct) + (a ? ' · ' + esc([a.addr, a.city, a.state].filter(Boolean).join(', ')) + (a.tel ? ' · ' + esc(a.tel) : '') + (a.terms ? ' · ' + esc(a.terms) : '') + (a.sm ? ' · ' + esc(a.sm) : '') : '') + '</div>' + (a && a.note ? '<div class="alert a-blu" style="margin-top:6px">📝 ' + esc(a.note) + '</div>' : '') + '</div><button class="b-ghost b-sm" id="ssX">✕</button></div>' +
      '<div class="kpi" style="grid-template-columns:repeat(5,1fr);margin-top:10px">' + info.bk.map((v, i) => '<div' + (i >= 3 && v > 0.005 ? ' style="background:#fef2f2"' : '') + '><b style="font-size:12px">' + money(v) + '</b><span>' + BK[i] + '</span></div>').join('') + '</div>' +
      '<div class="sumbox" style="display:flex;justify-content:space-between"><span>' + bi('미수금 합계', 'Balance due') + (info.asOf ? ' <span class="muted">기준 as of ' + esc(info.asOf) + (stale > 10 ? ' (' + stale + '일 전)' : '') + '</span>' : '') + '</span><b class="' + (info.bal > 0.005 ? 'warn' : 'ok') + '">' + money(info.bal) + '</b></div>' +
      (info.err ? '<div class="alert a-amb">일부를 읽지 못했습니다 (' + esc(info.err) + ')</div>' : '') +
      '<div class="seg">' + [['inv', bi('미결 인보이스', 'Open inv') + ' ' + live.length], ['ord', bi('오더', 'Orders') + ' ' + info.orders.length], ['pay', bi('수금', 'Payments') + ' ' + info.pays.length]].map(t => '<button class="' + (tab === t[0] ? 'on' : '') + '" data-ss="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' +
      '<div style="max-height:45vh;overflow:auto">' + body + '</div>' +
      (onPick ? '<div class="btns"><button class="b-blue" id="ssPick">' + bi('이 가게로 오더', 'Order for this store') + '</button></div>' : '');
    $('ssX').onclick = closeModal;
    document.querySelectorAll('[data-ss]').forEach(b => b.onclick = () => { tab = b.dataset.ss; paint(); });
    document.querySelectorAll('[data-so]').forEach(el => el.onclick = () => { closeModal(); location.hash = '#/order/' + encodeURIComponent(el.dataset.so); });
    if ($('ssPick')) $('ssPick').onclick = () => { closeModal(); onPick(acct); };
  };
  paint();
  return info;
}
