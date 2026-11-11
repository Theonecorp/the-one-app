/* ============================================================
 *  🚢 입고 예정 — 공장(중국)이 보낸 인보이스 → 오는 중인 물건 → 창고에서 수량 확인 → 재고 (v0.8.182, 2026-11-11 관리자)
 *    ① 등록(관리자 · 오피스): 공장 커머셜 인보이스(엑셀 · CSV)를 올리면 공장 이름 · 인보이스 번호 · 날짜 · 묶음(18K CHAIN …) · 코드 · 수량 · 단가를 읽음
 *       · 앱 카탈로그 코드로 맞춤 (붙임표 · 띄어쓰기 달라도) · 목록에 없는 코드는 빨갛게 — 고쳐서 등록 · 합친 칸(같은 단가)은 위 줄 단가로
 *       · 등록하면 창고 · 오피스에 📱 팝업 (오는 중)
 *    ② 목록(창고 · 오피스): 공장별 · 인보이스별 — 오는 중 / 확인 중 / 입고 완료
 *    ③ 도착(창고 매니저): 줄마다 받은 수량 (또는 ✅ 모두 맞음) → 💾 중간 저장(확인 중) → 📥 입고 확정 = 재고에 더함 (stock.applyMoves 'recv')
 *       · 받은 수량이 보낸 수량과 다르면 차이를 기록하고 오피스 · 관리자에게 알림
 *    · 공장 단가(원가)는 관리자 · 오너 · 오피스만 봄
 *  inbound/{id} = { id, no, factory, fromCode, d, eta, file, st: coming|checking|done|x, secs:[{n, q, amt}],
 *                   lines:[{ c, raw, d, q, p, sec, ok, rq }], n, qty, amt, boxes, note, by, at, recvAt, recvBy, receiptId, diff:[{c, q, rq}] }
 *  🔜 공장이 직접 올리기: 중국은 구글(로그인 · 데이터베이스)이 막혀 있어 앱 대신 이메일로 받는 것을 권함 (Apps Script 가 첨부 파일을 받아 여기 '확인 대기'로)
 * ============================================================ */
import { $, esc, money, toast, busy, openModal, closeModal, confirmBox, bi, bt, today, md, sortBy } from './ui.js';
import { loadCatalog, catalog, exactItem } from './catalog.js';
import { can, isTop, jobOf } from './main.js';
import { newId } from './db.js';
import * as Stock from './stock.js';
import { S_, num, norm, codeFinder, similarCode, parseFactoryInvoice, dateOf } from './inbound-parse.js';
export { codeFinder, similarCode, parseFactoryInvoice } from './inbound-parse.js';
const ERR = { nocode: () => bt('아이템 코드 칸을 찾지 못했습니다', 'Could not find the item code column'), nolines: () => bt('수량이 있는 아이템 줄을 찾지 못했습니다', 'No item lines with a quantity') };

let S = null;
export function register(state) { S = state; }
const ST = { f: 'open', draft: null };
/** 등록 · 지우기 — 관리자 · 오너 · 오피스 매니저 / 받기 — + 창고 매니저 · 창고 직원 · 출고 담당 */
export const canAdd = () => isTop() || (S.role === 'manager' && jobOf() === 'office');
export const canRecv = () => canAdd() || (S.role === 'manager' && ['whmgr', 'pick', 'pickinv'].includes(jobOf()));
/** 공장 단가(원가)는 관리자만 — 단가는 따로 inboundCost/{id} 에 두고 firestore.rules 로 관리자만 읽음 (오피스는 등록할 때 쓰기만) */
const seeCost = () => !!(S && S.me && S.me.role === 'admin');
/** 금액 — 위안이면 ¥ */
const amtTxt = (v, cur) => /CNY/.test(cur || '') ? '¥' + (Math.round(v * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : money(v);
const tot = L => ({ n: L.length, qty: L.reduce((a, l) => a + l.q, 0), amt: Math.round(L.reduce((a, l) => a + l.q * (l.p || 0), 0) * 100) / 100 });

/* ---------- 화면 (재고 → 🚢 입고 예정) ---------- */
const ISSUE = [['short', '수량 모자람', 'Short'], ['over', '수량 많음', 'Over'], ['damaged', '불량 · 파손', 'Damaged'], ['wrong', '다른 아이템', 'Wrong item'], ['other', '기타', 'Other']];
const issueLabel = k => { const x = ISSUE.find(i => i[0] === k); return x ? bt(x[1], x[2]) : k; };
/** 줄의 받은 수량 — 박스가 있으면 박스마다 받은 수량의 합(하나라도 확인 전이면 null), 아이템별로 직접 넣었으면 그 값 */
export const lineRq = l => { if (l.bx && l.bx.length && !l.byItem) return l.bx.some(b => b.rq == null) ? null : l.bx.reduce((a, b) => a + b.rq, 0); return l.rq == null ? null : l.rq; };
export async function paint(box) {
  box.innerHTML = '<div class="load">' + bt('읽는 중…', 'Loading…') + '</div>';
  let L = [], C = {}; try { L = await S.DB.list('inbound'); } catch (e) { box.innerHTML = '<div class="card"><div class="alert a-red">' + esc(e.code || e.message) + '</div></div>'; return; }
  if (seeCost()) { try { (await S.DB.list('inboundCost')).forEach(c => { C[c.id] = c; }); } catch (e) {} }
  L = L.filter(x => x.st !== 'x');
  const open = L.filter(x => x.st !== 'done'), shown = ST.f === 'open' ? open : ST.f === 'done' ? L.filter(x => x.st === 'done') : L;
  const byF = {}; sortBy(shown, x => x.d || x.at || '', true).forEach(x => { (byF[x.factory || '—'] = byF[x.factory || '—'] || []).push(x); });
  const stTag = x => x.st === 'review' ? '<span class="tag" style="background:#fef3c7;color:#92400e">🔎 ' + bt('확인 대기', 'To review') + '</span>' : x.st === 'done' ? '<span class="tag t-k">✅ ' + bt('입고 완료', 'Received') + '</span>' : x.st === 'checking' ? '<span class="tag t-a">📦 ' + bt('도착 · 확인 중', 'Arrived · checking') + '</span>' : '<span class="tag t-b">🚢 ' + bt('오는 중', 'On the way') + '</span>';
  box.innerHTML = '<div class="card"><h2 style="font-size:15px">🚢 ' + bi('입고 예정 — 공장에서 보낸 물건', 'Inbound — shipped from factories') + '</h2><div class="muted">' + bt('공장 인보이스를 등록하면 여기에 오는 중으로 보입니다. 박스가 도착하면 창고에서 받은 수량을 확인하고 📥 입고 확정을 누르면 재고에 더해집니다.', 'Registered factory invoices show here as on the way. When boxes arrive, the warehouse checks the quantities and confirms — then stock goes up.') + '</div>' +
    (canAdd() ? '<div class="fg" style="margin-top:8px"><label>📎 ' + bt('공장 인보이스 등록 (엑셀 · CSV)', 'Register a factory invoice (Excel · CSV)') + '</label><input type="file" id="ibFile" accept=".xlsx,.xls,.csv"></div><div id="ibOut"></div>' : '') +
    '<div class="chips" style="margin-top:8px">' + [['open', bt('진행 중', 'Open') + ' ' + open.length], ['done', bt('입고 완료', 'Received')], ['all', bt('전체', 'All')]].map(c => '<button class="' + (ST.f === c[0] ? 'on' : '') + '" data-ibf="' + c[0] + '">' + c[1] + '</button>').join('') + '</div></div>' +
    (Object.keys(byF).length ? Object.keys(byF).sort().map(f => '<div class="card"><h2 style="font-size:15px">🏭 ' + esc(f) + ' <span class="muted" style="font-weight:400">' + byF[f].length + bt('건', '') + ' · ' + byF[f].reduce((a, x) => a + (x.qty || 0), 0).toLocaleString() + bt('개', ' pcs') + '</span></h2>' +
      byF[f].map(x => '<div class="pr tap" data-ib="' + esc(x.id) + '"><div class="ct"><b>' + esc(x.no || x.id) + ' ' + stTag(x) + '</b><small>' + esc(md(x.d || '')) + ' · ' + (x.n || 0) + bt('종', ' items') + (x.boxes ? ' · 📦 ' + x.boxes : '') + ' · ' + esc((x.secs || []).map(s => s.n).filter(Boolean).join(' · ')) + (x.diff && x.diff.length ? ' · <span class="warn">⚠️ ' + bt('차이', 'diff') + ' ' + x.diff.length + '</span>' : '') + '</small></div><div class="pa"><b>' + (x.qty || 0).toLocaleString() + '</b><small>' + (C[x.id] && C[x.id].amt ? amtTxt(C[x.id].amt, C[x.id].cur) : bt('개', 'pcs')) + '</small></div></div>').join('') + '</div>').join('')
      : '<div class="card"><div class="none">' + bt('입고 예정이 없습니다', 'Nothing inbound') + '</div></div>');
  box.querySelectorAll('[data-ibf]').forEach(b => b.onclick = () => { ST.f = b.dataset.ibf; paint(box); });
  box.querySelectorAll('[data-ib]').forEach(el => el.onclick = () => { const x = L.find(z => z.id === el.dataset.ib); if (x && x.st === 'review' && canAdd()) return openReview(x, C[x.id] || null, box); detail(x, box, C[el.dataset.ib] || null); });
  if ($('ibFile')) $('ibFile').onchange = async () => { const f = $('ibFile').files[0]; $('ibFile').value = ''; if (f) await readFile(f, box); };
}
async function readFile(f, box) {
  const out = $('ibOut'); out.innerHTML = '<div class="muted">' + bt('읽는 중…', 'Reading…') + '</div>';
  try {
    await loadCatalog(S); const C = catalog();
    let aoa = [];
    if (/\.(csv|txt)$/i.test(f.name)) { const tx = (await f.text()).replace(/^﻿/, ''); aoa = tx.split(/\r?\n/).map(r => r.split(r.includes('\t') ? '\t' : ',')); }
    else { const A = await import('./admin.js'); const { XLSX, wb } = await A.readBook(f); aoa = A.aoa(XLSX, wb, wb.SheetNames[0]) || []; }
    const P = parseFactoryInvoice(aoa, C.byCode);
    if (P.err) { out.innerHTML = '<div class="alert a-red">' + esc(ERR[P.err] ? ERR[P.err]() : P.err) + '</div>'; return; }
    ST.draft = Object.assign(P, { file: f.name }); preview(box);
  } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.code || e.message) + '</div>'; }
}
/** 등록 전 확인 — 공장 · 번호 · 날짜 고치기 · 목록에 없는 코드는 코드를 고쳐 맞춤 · 단가 · 통화는 관리자만 */
function preview(box) {
  const P = ST.draft, t = tot(P.lines), bad = P.lines.filter(l => !l.ok), sups = Stock.suppliers(), $c = seeCost();
  openModal('<h2>🚢 ' + bi('공장 인보이스 확인', 'Check the factory invoice') + '</h2><div class="muted">' + esc(P.file) + '</div>' +
    '<div class="two"><div class="fg"><label>🏭 ' + bt('공장', 'Factory') + '</label><input id="ibF" value="' + esc(P.factory) + '" list="ibFL"><datalist id="ibFL">' + sups.map(s => '<option value="' + esc(s.name || s.alias || s.code) + '">').join('') + '</datalist></div><div class="fg"><label>' + bt('인보이스 번호', 'Invoice no') + '</label><input id="ibNo" value="' + esc(P.no) + '" placeholder="' + esc(bt('비우면 공장 · 날짜로', 'empty = factory · date')) + '"></div></div>' +
    '<div class="two"><div class="fg"><label>' + bt('인보이스 날짜', 'Invoice date') + '</label><input type="date" id="ibD" value="' + esc(P.d || today()) + '"></div><div class="fg"><label>' + bt('도착 예정 (선택)', 'ETA (optional)') + '</label><input type="date" id="ibEta" value="' + esc(P.eta || '') + '"></div></div>' +
    ($c ? '<div class="fg"><label>💱 ' + bt('단가 통화', 'Price currency') + (/\?/.test(P.cur || '?') ? ' <span class="warn">— ' + bt('파일에 안 적혀 있어 추정했습니다. 확인하세요', 'not stated in the file — estimated, please check') + '</span>' : '') + '</label><div class="seg">' + [['USD', '$ USD'], ['CNY', '¥ CNY (위안)']].map(c => '<button type="button" class="' + (String(P.cur || 'USD?').replace('?', '') === c[0] ? 'on' : '') + '" data-ibcur="' + c[0] + '">' + c[1] + '</button>').join('') + '</div></div>' : '') +
    ((P.boxes || P.trk || P.frt) ? '<div class="muted" style="font-size:12.5px">' + [P.boxes ? '📦 ' + bt('박스', 'Boxes') + ' ' + P.boxes : '', P.trk ? '🚚 UPS ' + esc(P.trk) : '', P.frt && $c ? bt('운임', 'Freight') + ' ' + amtTxt(P.frt, P.cur) : ''].filter(Boolean).join(' · ') + '</div>' : '') +
    '<div class="sumbox">' + P.secs.map(s => '<div>' + esc(s.n || '—') + ' — <b>' + s.q.toLocaleString() + '</b>' + bt('개', ' pcs') + ($c ? ' · ' + amtTxt(s.amt, P.cur) : '') + '</div>').join('') + '<div style="margin-top:4px"><b>' + t.n + bt('종 · ', ' items · ') + t.qty.toLocaleString() + bt('개', ' pcs') + ($c ? ' · ' + amtTxt(t.amt, P.cur) : '') + '</b></div></div>' +
    (P.why ? '<div class="alert a-amb" id="ibWhy">🔎 ' + bt('인보이스인지 확실하지 않습니다 — 인보이스 번호 · 단가가 없고 메일 제목 · 파일 이름에 INVOICE 가 없습니다. 패킹리스트 · 주문표인지 확인하고 등록하세요', 'Not sure this is an invoice — no invoice no., no prices and no INVOICE in the subject or file name. Check it is not a packing list or order sheet before registering') + '</div>' : '') +
    (bad.length ? '<div class="alert a-red">⚠️ ' + bt('앱에 없는 코드', 'Codes not in the app') + ' ' + bad.length + ' — ' + bt('맞는 코드로 고치거나, 새 아이템이면 먼저 등록하세요 (그대로 두면 받을 때 재고 코드로 그대로 들어갑니다)', 'fix them to the right code, or register the new items first (left as is, they go in as these codes)') + '</div>' : '<div class="alert a-grn">✅ ' + bt('모든 코드가 앱 카탈로그와 맞습니다', 'All codes match the catalog') + '</div>') +
    '<div style="max-height:42vh;overflow:auto"><table><tr><th>' + bt('코드', 'Code') + '</th><th>' + bt('이름', 'Name') + '</th><th class="r">' + bt('수량', 'Qty') + '</th>' + ($c ? '<th class="r">' + bt('단가', 'Unit') + '</th>' : '') + '</tr>' +
      P.lines.map((l, i) => '<tr' + (l.ok ? '' : ' style="background:#fef2f2"') + '><td>' + (l.ok ? '<b>' + esc(l.c) + '</b>' : '<input data-ibc="' + i + '" value="' + esc(l.c) + '" style="width:110px;text-transform:uppercase">') + '</td><td><small>' + esc(l.d || (l.ok ? '' : bt('목록에 없음', 'not in catalog'))) + '</small>' + (!l.ok && l.sim ? ' <button type="button" class="b-ghost b-sm" data-ibsim="' + i + '">≈ ' + esc(l.sim) + '?</button>' : '') + (l.box && l.box.length ? '<div class="muted" style="font-size:11px">📦 ' + esc(l.box.join(' · ')) + '</div>' : '') + '</td><td class="r">' + l.q.toLocaleString() + '</td>' + ($c ? '<td class="r">' + amtTxt(l.p, P.cur) + '</td>' : '') + '</tr>').join('') + '</table></div>' +
    (P.mailFrom ? '<div class="muted" style="font-size:12px">📧 ' + bt('메일로 들어옴', 'Came by email') + ': ' + esc(P.mailFrom) + (P.mailSubject ? ' · ' + esc(P.mailSubject) : '') + '</div>' : '') +
    '<div class="btns"><button class="b-ghost" id="ibX">' + bt('취소', 'Cancel') + '</button>' + (P.id ? '<button class="b-ghost" id="ibDel2" style="color:#991b1b">🗑 ' + bt('지우기', 'Delete') + '</button>' : '') + '<button class="b-blue" id="ibGo">🚢 ' + bt('입고 예정으로 등록', 'Register as inbound') + '</button></div>');
  if ($('ibDel2')) $('ibDel2').onclick = async () => { if (!(await confirmBox(bt('이 확인 대기 인보이스를 지울까요?', 'Delete this pending invoice?'), bt('지우기', 'Delete')))) return preview(box); busy(true); try { await S.DB.update('inbound', P.id, { st: 'x', delAt: new Date().toISOString(), delBy: S.user.email }); ST.draft = null; closeModal(); paint(box); } catch (e) { toast(e.code || e.message, 'bad'); } busy(false); };
  const keep = () => { P.factory = $('ibF').value.trim(); P.no = $('ibNo').value.trim(); P.d = $('ibD').value; P.eta = $('ibEta').value; };
  document.querySelectorAll('[data-ibc]').forEach(inp => inp.onchange = () => { const l = P.lines[+inp.dataset.ibc], it = exactItem(inp.value); l.c = it ? it.c : inp.value.trim().toUpperCase(); l.d = it ? it.d : ''; l.ok = !!it; keep(); preview(box); });
  document.querySelectorAll('[data-ibsim]').forEach(b => b.onclick = () => { const l = P.lines[+b.dataset.ibsim], it = exactItem(l.sim); if (it) { l.c = it.c; l.d = it.d; l.ok = true; } keep(); preview(box); });   // ≈ 비슷한 코드 — 눌러야 바뀜
  document.querySelectorAll('[data-ibcur]').forEach(b => b.onclick = () => { keep(); P.cur = b.dataset.ibcur; preview(box); });
  ['ibF', 'ibNo', 'ibD', 'ibEta'].forEach(id => { $(id).onchange = keep; });
  $('ibX').onclick = () => { ST.draft = null; closeModal(); };
  $('ibGo').onclick = async () => {
    keep(); if (!P.factory) return toast(bt('공장 이름을 넣으세요', 'Enter the factory'), 'bad');
    const no = P.no || (P.factory.split(/\s+/)[0].toUpperCase().slice(0, 10) + '-' + (P.d || today()).replace(/-/g, ''));
    busy(true);
    try {
      let dup = null; try { dup = (await S.DB.list('inbound', { where: [['no', '==', no]] })).find(x => x.st !== 'x' && x.factory === P.factory && x.id !== P.id); } catch (e) {}
      if (dup) { busy(false); return toast(bt('이미 등록된 인보이스입니다', 'Already registered') + ': ' + no, 'bad'); }
      const id = P.id ? await registerReview(P, no) : await saveInbound(P, no);   /* 🔎 메일로 들어온 확인 대기 → 고쳐서 등록 */
      ST.draft = null; closeModal(); toast('🚢 ' + no + ' — ' + tot(P.lines).qty.toLocaleString() + bt('개 입고 예정', ' pcs inbound'), 'good'); paint(box);
      return id;
    } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}
/** 저장 — 입고 예정(inbound: 단가 없음) + 단가(inboundCost: 관리자만 읽음) + 창고 · 오피스 팝업 */
export async function saveInbound(P, no, src) {
  const id = newId('IB'), now = new Date().toISOString(), t2 = tot(P.lines), sup = Stock.supFind(P.factory);
  const doc = { id, no, factory: P.factory, fromCode: sup ? sup.code : '', d: P.d || today(), eta: P.eta || '', file: P.file || '', src: src || 'app', st: 'coming', boxes: P.boxes || 0, trk: P.trk || '', secs: P.secs.map(x => ({ n: x.n, q: x.q })),
    lines: P.lines.map(l => ({ c: l.c, raw: l.raw, d: l.d, q: l.q, sec: l.sec, ok: l.ok, rq: null, box: l.box || [], bx: (l.bx || []).map(b => ({ b: b.b, q: b.q, rq: null })) })), n: t2.n, qty: t2.qty, by: (S.user && S.user.email) || '', at: now };
  await S.DB.set('inbound', id, doc);
  const p = {}, praw = {}; P.lines.forEach(l => { p[l.c] = l.p || 0; praw[l.raw || l.c] = l.p || 0; });
  await S.DB.set('inboundCost', id, { id, no, factory: P.factory, praw, cur: String(P.cur || 'USD').replace('?', ''), curGuess: /\?/.test(P.cur || ''), frt: P.frt || 0, amt: t2.amt, secs: P.secs.map(x => ({ n: x.n, amt: x.amt })), p, at: now });
  try { const N = await import('./notify.js'); await N.queue({ kind: 'inbound', pushOnly: true, toGroup: 'g:wh', toStaff: true, subject: '[THE ONE] 🚢 ' + bt('입고 예정', 'Inbound') + ' — ' + P.factory, text: '🚢 ' + P.factory + ' · ' + no + ' · ' + t2.n + bt('종 ', ' items ') + t2.qty.toLocaleString() + bt('개 — 오는 중', ' pcs — on the way') + (P.boxes ? ' · 📦 ' + P.boxes : ''), url: N.appUrl('stock/inb') }); } catch (e) {}
  return id;
}
/** 🔎 확인 대기 (메일로 들어온 것) 열기 — 등록 전 확인 화면으로 (단가는 관리자에게만) */
function openReview(x, cost, box) {
  const pr = l => cost ? (cost.p && cost.p[l.c] != null ? cost.p[l.c] : (cost.praw && cost.praw[l.raw]) || 0) : 0;
  const lines = x.lines.map(l => Object.assign({}, l, { p: pr(l) }));
  const secs = {}; lines.forEach(l => { secs[l.sec] = secs[l.sec] || { n: l.sec, q: 0, amt: 0 }; secs[l.sec].q += l.q; secs[l.sec].amt = Math.round((secs[l.sec].amt + l.q * l.p) * 100) / 100; });
  ST.draft = { id: x.id, factory: x.factory, no: x.no, d: x.d, eta: x.eta || '', file: x.file, boxes: x.boxes, trk: x.trk, frt: cost ? cost.frt : 0, cur: cost ? cost.cur + (cost.curGuess ? '?' : '') : '', lines, secs: Object.values(secs), mailFrom: x.mailFrom || '', mailSubject: x.mailSubject || '', why: x.why || '' };
  preview(box);
}
/** 확인 대기 → 오는 중 (고친 코드 · 공장 · 번호 · 날짜) — 관리자면 통화도 */
async function registerReview(P, no) {
  const t2 = tot(P.lines), now = new Date().toISOString(), sup = Stock.supFind(P.factory);
  await S.DB.update('inbound', P.id, { no, factory: P.factory, fromCode: sup ? sup.code : '', d: P.d || today(), eta: P.eta || '', st: 'coming', lines: P.lines.map(l => ({ c: l.c, raw: l.raw, d: l.d || '', q: l.q, sec: l.sec, ok: l.ok, rq: null, box: l.box || [], bx: (l.bx || []).map(b => ({ b: b.b, q: b.q, rq: null })) })), n: t2.n, qty: t2.qty, regAt: now, regBy: S.user.email });
  if (seeCost()) { const p = {}; P.lines.forEach(l => { p[l.c] = l.p || 0; }); try { await S.DB.update('inboundCost', P.id, { cur: String(P.cur || 'USD').replace('?', ''), curGuess: /\?/.test(P.cur || ''), p, amt: t2.amt }); } catch (e) {} }
  try { const N = await import('./notify.js'); await N.queue({ kind: 'inbound', pushOnly: true, toGroup: 'g:wh', toStaff: true, subject: '[THE ONE] 🚢 ' + bt('입고 예정', 'Inbound') + ' — ' + P.factory, text: '🚢 ' + P.factory + ' · ' + no + ' · ' + t2.n + bt('종 ', ' items ') + t2.qty.toLocaleString() + bt('개 — 오는 중', ' pcs — on the way') + (P.boxes ? ' · 📦 ' + P.boxes : ''), url: N.appUrl('stock/inb') }); } catch (e) {}
  return P.id;
}
/** 상세 — 📋 아이템별 / 📦 박스별 · 받은 수량 · 문제 표시 · 인보이스에 없는 아이템 · 중간 저장 · 입고 확정 */
function detail(x, box, cost) {
  if (!x) return;
  const done = x.st === 'done', L = JSON.parse(JSON.stringify(x.lines)), rcv = canRecv() && !done && x.st !== 'review', $c = seeCost() && cost;
  const boxes = []; L.forEach(l => (l.bx || []).forEach(b => { if (!boxes.includes(b.b)) boxes.push(b.b); }));
  const noBoxL = L.filter(l => !(l.bx && l.bx.length));
  const V = { view: boxes.length ? 'box' : 'item', box: '', iss: -1, add: false };
  const cell = (rq, q) => rq == null ? '—' : rq.toLocaleString() + (rq !== q ? ' <b class="warn">(' + (rq - q > 0 ? '+' : '') + (rq - q) + ')</b>' : '');
  const issueTag = l => l.issue ? ' <span class="tag" style="background:#fef3c7;color:#92400e">⚠️ ' + esc(issueLabel(l.issue.k)) + (l.issue.note ? ' · ' + esc(l.issue.note) : '') + '</span>' : '';
  const name = l => '<b>' + esc(l.c) + '</b>' + (l.extra ? ' <span class="tag t-a">' + bt('인보이스에 없음', 'not on invoice') + '</span>' : '') + issueTag(l) + '<div class="muted" style="font-size:11.5px">' + esc(l.d || (l.ok ? '' : bt('목록에 없는 코드', 'not in catalog'))) + (l.sec ? ' · ' + esc(l.sec) : '') + '</div>';
  const boxSt = b => { const E = L.map(l => (l.bx || []).find(z => z.b === b && !l.byItem)).filter(Boolean); if (!E.length) { const byI = L.some(l => l.byItem && (l.bx || []).some(z => z.b === b)); return byI ? 'item' : 'none'; } if (E.every(z => z.rq == null)) return 'none'; if (E.some(z => z.rq == null)) return 'part'; const prob = L.some(l => (l.bx || []).some(z => z.b === b) && ((l.issue && (!l.issue.box || l.issue.box === b)) || (l.bx || []).some(z => z.b === b && z.rq !== z.q)));   /* 문제는 그 박스에서 적은 것만 */ return prob ? 'prob' : 'ok'; };
  const BST = { none: ['·', bt('확인 전', 'to check'), ''], part: ['…', bt('확인 중', 'checking'), 't-a'], ok: ['✓', bt('확인 · 맞음', 'checked'), 't-k'], prob: ['⚠️', bt('문제 있음', 'issue'), 't-r'], item: ['📋', bt('아이템별로 확인', 'checked by item'), 't-g'] };
  const issueForm = (i) => { const l = L[i]; return '<tr><td colspan="3" style="background:#fffbeb"><div class="chips" style="margin:2px 0">' + ISSUE.map(k => '<button type="button" class="' + (l.issue && l.issue.k === k[0] ? 'on' : '') + '" data-iss="' + k[0] + '">' + bt(k[1], k[2]) + '</button>').join('') + '</div><div style="display:flex;gap:6px"><input id="issNote" value="' + esc((l.issue && l.issue.note) || '') + '" placeholder="' + esc(bt('메모 — 예: 3개 파손, 다른 색이 들어옴', 'note — e.g. 3 broken, wrong color')) + '" style="flex:1"><button type="button" class="b-ghost b-sm" id="issClr">' + bt('문제 없음', 'No issue') + '</button><button type="button" class="b-blue b-sm" id="issOk">' + bt('적기', 'Save') + '</button></div></td></tr>'; };
  const paintM = () => {
    const sent = L.reduce((a, l) => a + l.q, 0), got = L.reduce((a, l) => a + (lineRq(l) || 0), 0), left = L.filter(l => lineRq(l) == null).length, diff = L.filter(l => lineRq(l) != null && lineRq(l) !== l.q || l.issue);
    let body = '';
    if (V.view === 'box' && !V.box) {
      body = '<div class="muted" style="margin:4px 0">' + bt('박스를 열면서 누르세요 — 박스마다 들어 있어야 할 아이템과 수량이 나옵니다.', 'Tap each box as you open it — it shows what should be inside.') + '</div>' +
        boxes.map(b => { const st = boxSt(b), E = L.filter(l => (l.bx || []).some(z => z.b === b)), q = E.reduce((a, l) => a + l.bx.find(z => z.b === b).q, 0); return '<div class="pr tap" data-box="' + esc(b) + '"><div class="ct"><b>📦 ' + esc(b) + ' <span class="tag ' + BST[st][2] + '">' + BST[st][0] + ' ' + BST[st][1] + '</span></b><small>' + E.length + bt('종 · ', ' items · ') + q.toLocaleString() + bt('개', ' pcs') + '</small></div><div class="pa">›</div></div>'; }).join('') +
        (noBoxL.length ? '<div class="pr tap" data-box="__nobox"><div class="ct"><b>' + bt('박스 번호 없는 아이템', 'Items without a box no.') + '</b><small>' + noBoxL.length + bt('종', ' items') + '</small></div><div class="pa">›</div></div>' : '');
    } else {
      const inBox = V.view === 'box' && V.box && V.box !== '__nobox';
      const rows = V.view === 'box' ? (V.box === '__nobox' ? noBoxL.map(l => L.indexOf(l)) : L.map((l, i) => (l.bx || []).some(z => z.b === V.box) ? i : -1).filter(i => i >= 0)) : L.map((l, i) => i);
      body = (V.view === 'box' ? '<div class="btns" style="justify-content:flex-start;margin:4px 0"><button class="b-ghost b-sm" id="bxBack">‹ ' + bt('박스 목록', 'Boxes') + '</button>' + (rcv ? '<button class="b-ghost b-sm" id="bxAll">✅ ' + bt('이 박스 모두 맞음', 'This box is all correct') + '</button><button class="b-ghost b-sm" id="bxAdd">＋ ' + bt('인보이스에 없는 아이템', 'Item not on invoice') + '</button>' : '') + '</div><h3 style="margin:4px 0">📦 ' + esc(V.box === '__nobox' ? bt('박스 번호 없음', 'No box no.') : V.box) + '</h3>' : (rcv ? '<div class="btns" style="justify-content:flex-start;margin:6px 0"><button class="b-ghost b-sm" id="ibAll">✅ ' + bt('남은 줄 모두 맞음', 'All remaining correct') + '</button><button class="b-ghost b-sm" id="bxAdd">＋ ' + bt('인보이스에 없는 아이템', 'Item not on invoice') + '</button></div>' : '')) +
        (V.add ? '<div class="sumbox" style="margin:6px 0"><b>＋ ' + bt('인보이스에 없는데 들어온 아이템', 'Item received but not on the invoice') + '</b><div style="display:flex;gap:6px;margin-top:4px"><input id="adC" placeholder="' + esc(bt('코드', 'Code')) + '" style="flex:1;text-transform:uppercase"><input id="adQ" inputmode="numeric" placeholder="' + esc(bt('수량', 'Qty')) + '" style="width:80px"><button type="button" class="b-blue b-sm" id="adGo">' + bt('넣기', 'Add') + '</button></div></div>' : '') +
        '<div style="max-height:46vh;overflow:auto"><table><tr><th>' + bt('코드', 'Code') + '</th><th class="r">' + bt('보낸', 'Sent') + '</th><th class="r">' + bt('받은', 'Got') + '</th></tr>' +
        rows.map(i => { const l = L[i], bxe = inBox ? l.bx.find(z => z.b === V.box) : null, q = bxe ? bxe.q : l.q, rq = bxe ? (l.byItem ? null : bxe.rq) : lineRq(l);
          const inp = rcv ? '<input data-q="' + i + '" inputmode="numeric" value="' + (rq == null ? '' : rq) + '" placeholder="—" style="width:70px;text-align:right">' + ' <button type="button" class="b-ghost b-sm" data-isb="' + i + '" title="' + esc(bt('문제 적기', 'Report a problem')) + '">⚠️</button>' : cell(rq, q);
          return '<tr' + (!l.ok ? ' style="background:#fef2f2"' : (rq != null && rq !== q) || l.issue ? ' style="background:#fef3c7"' : '') + '><td>' + name(l) + (!inBox && l.box && l.box.length ? '<div class="muted" style="font-size:11px">📦 ' + esc(l.box.join(' · ')) + '</div>' : '') + '</td><td class="r">' + q.toLocaleString() + ($c && cost.p && cost.p[l.c] != null ? '<div class="muted" style="font-size:11px">' + amtTxt(cost.p[l.c], cost.cur) + '</div>' : '') + '</td><td class="r" style="white-space:nowrap">' + inp + '</td></tr>' + (V.iss === i ? issueForm(i) : ''); }).join('') + '</table></div>';
    }
    openModal('<h2>🚢 ' + esc(x.no) + '</h2><div class="muted">🏭 ' + esc(x.factory) + ' · ' + esc(md(x.d || '')) + (x.eta ? ' · ' + bt('도착 예정', 'ETA') + ' ' + esc(md(x.eta)) : '') + (x.boxes ? ' · 📦 ' + bt('박스', 'Boxes') + ' ' + x.boxes : '') + (x.trk ? ' · 🚚 ' + esc(x.trk) : '') + ' · ' + esc(x.file || '') + '</div>' +
      ($c ? '<div class="sumbox" style="margin-top:6px">💰 ' + bt('공장 금액 (관리자만)', 'Factory amount (admin only)') + ': <b>' + amtTxt(cost.amt || 0, cost.cur) + '</b>' + (cost.frt ? ' · ' + bt('운임', 'Freight') + ' ' + amtTxt(cost.frt, cost.cur) : '') + (cost.pay ? ' · ' + bt('송금 요청', 'Payment request') + ' <b>' + amtTxt(cost.pay, cost.cur) + '</b>' : '') + (cost.amtMismatch ? ' <span class="warn">⚠️ ' + bt('메일 금액', 'email amount') + ' ' + amtTxt(cost.bodyAmt, cost.cur) + ' ≠ ' + bt('엑셀 합계', 'Excel total') + '</span>' : '') + (cost.curGuess ? ' <span class="warn">(' + bt('통화 추정', 'currency estimated') + ')</span>' : '') + ' <span class="seg" style="display:inline-flex;vertical-align:middle">' + [['USD', '$'], ['CNY', '¥']].map(c => '<button type="button" class="' + (cost.cur === c[0] ? 'on' : '') + '" data-ccur="' + c[0] + '">' + c[1] + '</button>').join('') + '</span></div>' : '') +
      '<div class="kpi" style="grid-template-columns:repeat(3,1fr);margin-top:8px"><div><b>' + sent.toLocaleString() + '</b><span>' + bt('보낸 수량', 'Shipped') + '</span></div><div><b>' + got.toLocaleString() + '</b><span>' + bt('받은 수량', 'Received') + '</span></div><div' + (diff.length ? ' style="background:#fef3c7"' : '') + '><b>' + (left ? left + bt('줄 남음', ' left') : diff.length ? '⚠️ ' + diff.length : '✓') + '</b><span>' + (left ? bt('확인 전', 'to check') : bt('차이 · 문제', 'Differences · issues')) + '</span></div></div>' +
      (x.st === 'review' ? '<div class="alert a-amb">🔎 ' + bt('확인 대기 — 오피스 · 관리자가 코드를 확인하고 등록하면 받을 수 있습니다', 'To review — office or admin checks the codes and registers it first') + '</div>' : '') + (x.src === 'mail' ? '<div class="muted" style="font-size:12px">📧 ' + esc(x.mailFrom || '') + '</div>' : '') +
      (done ? '<div class="alert a-grn">✅ ' + bt('입고 완료', 'Received') + ' — ' + esc(String(x.recvBy || '').split('@')[0]) + ' ' + esc(String(x.recvAt || '').substring(0, 16).replace('T', ' ')) + '</div>' : '') +
      (boxes.length ? '<div class="seg" style="margin-top:6px"><button type="button" class="' + (V.view === 'box' ? 'on' : '') + '" data-ibv="box">📦 ' + bt('박스별', 'By box') + '</button><button type="button" class="' + (V.view === 'item' ? 'on' : '') + '" data-ibv="item">📋 ' + bt('아이템별', 'By item') + '</button></div>' : '') +
      body +
      '<div class="btns" style="flex-wrap:wrap"><button class="b-ghost" id="ibX">' + bt('닫기', 'Close') + '</button>' + (canAdd() && !done ? '<button class="b-ghost" id="ibDel" style="color:#991b1b">🗑 ' + bt('지우기', 'Delete') + '</button>' : '') +
        (rcv ? '<button class="b-ghost" id="ibSave">💾 ' + bt('중간 저장', 'Save progress') + '</button><button class="b-green" id="ibOk"' + (left ? ' disabled' : '') + '>📥 ' + bt('입고 확정 — 재고에 더하기', 'Confirm — add to stock') + '</button>' : '') + '</div>');
    /* 묶기 */
    document.querySelectorAll('[data-ccur]').forEach(b => b.onclick = async () => { try { await S.DB.update('inboundCost', x.id, { cur: b.dataset.ccur, curGuess: false }); cost.cur = b.dataset.ccur; cost.curGuess = false; paintM(); } catch (e) { toast(e.code || e.message, 'bad'); } });   // 💱 관리자: 통화 고치기
    document.querySelectorAll('[data-ibv]').forEach(b => b.onclick = () => { V.view = b.dataset.ibv; V.box = ''; V.iss = -1; V.add = false; paintM(); });
    document.querySelectorAll('[data-box]').forEach(el => el.onclick = () => { V.box = el.dataset.box; V.iss = -1; V.add = false; paintM(); });
    if ($('bxBack')) $('bxBack').onclick = () => { V.box = ''; V.iss = -1; V.add = false; paintM(); };
    if ($('bxAll')) $('bxAll').onclick = () => { L.forEach(l => { if (V.box === '__nobox') { if (!(l.bx && l.bx.length) && l.rq == null) l.rq = l.q; return; } const e = (l.bx || []).find(z => z.b === V.box); if (e && e.rq == null) { e.rq = e.q; l.byItem = false; } }); paintM(); };
    if ($('ibAll')) $('ibAll').onclick = () => { L.forEach(l => { if (lineRq(l) != null) return; if (l.bx && l.bx.length && !l.byItem) l.bx.forEach(z => { if (z.rq == null) z.rq = z.q; }); else l.rq = l.q; }); paintM(); };
    document.querySelectorAll('[data-q]').forEach(inp => inp.onchange = () => {
      const l = L[+inp.dataset.q], v = S_(inp.value), n = v === '' ? null : Math.max(0, Math.round(num(v)));
      if (V.view === 'box' && V.box && V.box !== '__nobox') { const e = l.bx.find(z => z.b === V.box); if (l.byItem) { l.byItem = false; l.rq = null; } e.rq = n; }
      else if (l.bx && l.bx.length) { l.byItem = n != null; l.rq = n; }   // 아이템별로 직접 — 그 아이템의 박스별 확인 대신
      else l.rq = n;
      paintM();
    });
    document.querySelectorAll('[data-isb]').forEach(b => b.onclick = () => { V.iss = V.iss === +b.dataset.isb ? -1 : +b.dataset.isb; paintM(); });
    if (V.iss >= 0) {
      let k = (L[V.iss].issue && L[V.iss].issue.k) || '';
      document.querySelectorAll('[data-iss]').forEach(b => b.onclick = () => { k = b.dataset.iss; document.querySelectorAll('[data-iss]').forEach(z => z.classList.toggle('on', z === b)); });
      $('issOk').onclick = () => { if (!k) return toast(bt('무슨 문제인지 고르세요', 'Pick the kind of problem'), 'bad'); L[V.iss].issue = { k, note: $('issNote').value.trim(), box: V.view === 'box' ? V.box : '', by: (S.user && S.user.email) || '' }; V.iss = -1; paintM(); };
      $('issClr').onclick = () => { delete L[V.iss].issue; V.iss = -1; paintM(); };
    }
    if ($('bxAdd')) $('bxAdd').onclick = () => { V.add = !V.add; paintM(); };
    if ($('adGo')) $('adGo').onclick = () => {
      const raw = $('adC').value.trim(), q = Math.max(0, Math.round(num($('adQ').value))); if (!raw || !q) return toast(bt('코드와 수량을 넣으세요', 'Enter code and qty'), 'bad');
      const it = exactItem(raw), c = it ? it.c : raw.toUpperCase(), b = V.view === 'box' && V.box && V.box !== '__nobox' ? V.box : '';
      L.push({ c, raw, d: it ? it.d : '', q: 0, sec: '', ok: !!it, extra: true, rq: b ? null : q, box: b ? [b] : [], bx: b ? [{ b, q: 0, rq: q }] : [] });
      V.add = false; paintM();
    };
    $('ibX').onclick = closeModal;
    if ($('ibSave')) $('ibSave').onclick = async () => { busy(true); try { await S.DB.update('inbound', x.id, { lines: L, st: 'checking', chkAt: new Date().toISOString(), chkBy: S.user.email }); x.lines = JSON.parse(JSON.stringify(L)); x.st = 'checking'; toast('💾 ' + bt('저장 — 확인 중', 'Saved — checking')); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); } busy(false); };
    if ($('ibDel')) $('ibDel').onclick = async () => { if (!(await confirmBox(x.no + ' ' + bt('입고 예정을 지울까요? (재고는 그대로)', '— delete this inbound? (stock unchanged)'), bt('지우기', 'Delete')))) return; busy(true); try { await S.DB.update('inbound', x.id, { st: 'x', delAt: new Date().toISOString(), delBy: S.user.email }); closeModal(); paint(box); } catch (e) { toast(e.code || e.message, 'bad'); } busy(false); };
    if ($('ibOk')) $('ibOk').onclick = async () => {
      L.forEach(l => { l.rq = lineRq(l); });
      const got2 = L.filter(l => l.rq > 0), diff2 = L.filter(l => l.rq !== l.q || l.issue);
      if (!(await confirmBox('📥 ' + x.no + '\n' + got2.length + bt('종 · ', ' items · ') + got2.reduce((a, l) => a + l.rq, 0).toLocaleString() + bt('개를 재고에 더할까요?', ' pcs — add to stock?') + (diff2.length ? '\n⚠️ ' + bt('차이 · 문제', 'Differences · issues') + ' ' + diff2.length : ''), bt('입고 확정', 'Confirm')))) return paintM();
      busy(true);
      try {
        const rid = newId('R'), now = new Date().toISOString(), d = today();
        const diffL = diff2.map(l => ({ c: l.c, q: l.q, rq: l.rq, extra: !!l.extra, issue: l.issue ? issueLabel(l.issue.k) + (l.issue.note ? ' · ' + l.issue.note : '') : '' }));
        await S.DB.set('receipts', rid, { id: rid, d, from: x.factory, fromCode: x.fromCode || '', file: x.file || '', inbound: x.id, invNo: x.no, n: got2.length, qty: got2.reduce((a, l) => a + l.rq, 0), lines: got2.map(l => ({ c: l.c, q: l.rq, d: l.d || '' })), note: diffL.length ? bt('차이 · 문제', 'Diff · issues') + ': ' + diffL.map(z => z.c + ' ' + z.q + '→' + z.rq + (z.issue ? ' (' + z.issue + ')' : '')).join(', ') : '', by: S.user.email, at: now });
        await Stock.applyMoves(got2.map(l => ({ c: l.c, delta: l.rq })), 'recv', rid, '🚢 ' + x.factory + ' · ' + x.no);
        await S.DB.update('inbound', x.id, { lines: L, st: 'done', recvAt: now, recvBy: S.user.email, receiptId: rid, diff: diffL });
        if (diffL.length) { try { const N = await import('./notify.js'); await N.queue({ kind: 'inboundDiff', pushOnly: true, toStaff: true, subject: '[THE ONE] ⚠️ ' + bt('입고 수량 차이', 'Receiving differences') + ' — ' + x.factory, text: '⚠️ ' + x.factory + ' · ' + x.no + '\n' + diffL.map(z => z.c + ' ' + bt('보냄', 'sent') + ' ' + z.q + ' → ' + bt('받음', 'got') + ' ' + z.rq + (z.extra ? ' (' + bt('인보이스에 없음', 'not on invoice') + ')' : '') + (z.issue ? ' — ' + z.issue : '')).join('\n'), url: N.appUrl('stock/inb') }); } catch (e) {} }
        closeModal(); toast('📥 ' + x.no + ' — ' + bt('재고에 더했습니다', 'added to stock') + (diffL.length ? ' · ⚠️ ' + diffL.length : ''), 'good'); paint(box);
      } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
      busy(false);
    };
  };
  paintM();
}
