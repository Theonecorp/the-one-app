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

let S = null;
export function register(state) { S = state; }
const ST = { f: 'open', draft: null };
/** 등록 · 지우기 — 관리자 · 오너 · 오피스 매니저 / 받기 — + 창고 매니저 · 창고 직원 · 출고 담당 */
export const canAdd = () => isTop() || (S.role === 'manager' && jobOf() === 'office');
export const canRecv = () => canAdd() || (S.role === 'manager' && ['whmgr', 'pick', 'pickinv'].includes(jobOf()));
const seeCost = () => canAdd();
const S_ = v => String(v == null ? '' : v).trim();
const num = v => { const n = Number(S_(v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; };
const norm = s => S_(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

/* ---------- 공장 인보이스 읽기 ---------- */
/** aoa: 시트의 줄들(합친 칸은 왼쪽 위에만 값) · byCode: 카탈로그 코드 → 아이템 · year: 날짜에 연도가 없을 때 */
/** 코드 찾기 — 그대로 · 기호 무시(N-B100S = N_B100S) · 끝 숫자 두 자리(OPCG7 = OPCG07) */
export function codeFinder(byCode) {
  const byNorm = {}; Object.keys(byCode || {}).forEach(c => { byNorm[norm(c)] = byCode[c]; });
  const pad = c => norm(c).replace(/([A-Z])(\d)$/, '$10$2');
  return c => (byCode && byCode[S_(c).toUpperCase()]) || byNorm[norm(c)] || byNorm[pad(c)] || null;
}
/** 비슷한 코드 (글자 하나만 다른 것) — 자동으로 바꾸지는 않고 확인 화면에 제안만 (HG0S01 → HGDS01?) */
export function similarCode(code, byCode) {
  const n = norm(code); if (n.length < 4) return '';
  for (const c of Object.keys(byCode || {})) { const m = norm(c); if (m.length !== n.length) continue; let d = 0; for (let i = 0; i < n.length && d < 2; i++) if (n[i] !== m[i]) d++; if (d === 1) return c; }
  return '';
}
/** aoa: 시트의 줄들(합친 칸은 왼쪽 위에만 값) · byCode: 카탈로그 코드 → 아이템 · year: 날짜에 연도가 없을 때
 *  알아 둔 모양 (2026-11): ① 커머셜 인보이스 — Shipper (회사명) · Date:11月11日 · 묶음 제목 + ITEM NO · PRICE/USD · QTY (Jinruijia · Rumino)
 *    ② 팩킹 리스트 — 제목 "SX ONE#78 装箱单 2026.9.2" · 묶음마다 NO · 箱数(박스 1#…) · ITEM# · PRICE(위안) · QTY · 每箱数量 · CBM · KG, 한 코드가 두 박스에 나뉨
 *    ③ 공급망 인보이스 — Seller: · INVOICE #: · DATE(엑셀 날짜 숫자) · 공장 코드(A+ ITEM #)와 우리 코드(ONE Item No.) 두 칸 · C/T NO.(T666…) · UPS 트래킹 · FREIGHT */
export function parseFactoryInvoice(aoa, byCode, year) {
  const rows = (aoa || []).map(r => (r || []).map(S_)), find = codeFinder(byCode);
  const out = { factory: '', no: '', d: '', cur: '', trk: '', frt: 0, lines: [], secs: [], unknown: [], boxes: 0 };
  const nextBelow = (r, i) => { for (let k = r + 1; k < Math.min(rows.length, r + 3); k++) { const v = S_(rows[k][i]) || S_(rows[k].find(x => x)); if (v) return v; } return ''; };
  /* 머리 — 공장 이름 · 인보이스 번호 · 날짜 · 트래킹 · 운임 */
  rows.forEach((row, r) => row.forEach((v, i) => {
    if (r < 25) {
      if (!out.factory && /\(?회사명\)?|shipper\s*name|company\s*name|exporter\s*name/i.test(v)) out.factory = v.replace(/\(?회사명\)?|shipper\s*name|company\s*name|exporter\s*name|[:：]/gi, '').trim() || S_(row[i + 1]);
      if (!out.factory && /^(shipper|seller|exporter|卖方|发货人)\s*[:：]?$/i.test(v)) { const nx = nextBelow(r, i); if (nx && !/invoice|date|consignee/i.test(nx)) out.factory = nx.replace(/\(?회사명\)?/g, '').trim(); }
      const mNo = v.match(/invoice\s*(no|#|number)\.?\s*[:：]?\s*(.*)$/i); if (mNo && !out.no) out.no = S_(mNo[2]) || S_(row.slice(i + 1).find(x => x));
      const mD = v.match(/^date\s*[:：]?\s*(.*)$/i); if (mD && !out.d) out.d = dateOf(S_(mD[1]) || S_(row.slice(i + 1).find(x => x)), year);
    }
    if (!out.trk) { const t = v.match(/\b1Z[0-9A-Z]{16}\b/); if (t) out.trk = t[0]; }
    if (/^freight$/i.test(v)) out.frt = num(row.slice(i + 1).find(x => num(x)) || 0);
    if (/USD|US\$|美元/i.test(v) && /price|单价|단가|amount|total/i.test(v)) out.cur = out.cur || 'USD';
    if (/RMB|CNY|人民币|元/i.test(v) && /price|单价|단가|amount|total/i.test(v)) out.cur = out.cur || 'CNY';
  }));
  /* 팩킹 리스트 제목 "SX  ONE#78装箱单 2026.9.2" — 앞 글자 = 공장 줄임말, ONE#78 = 보낸 차수 */
  for (const row of rows.slice(0, 3)) { const t = row.find(x => /ONE\s*#\s*\d+/i.test(x)); if (t) { const m = t.match(/^\s*([A-Z][A-Z0-9&.\- ]{0,20}?)\s+ONE\s*#\s*(\d+)/i); if (m && !out.factory) out.factory = m[1].trim(); if (!out.no) out.no = 'ONE#' + t.match(/ONE\s*#\s*(\d+)/i)[1]; break; } }
  if (!out.d) for (const row of rows.slice(0, 5)) { const t = row.find(x => /\d{4}[.\-/年]\d{1,2}[.\-/月]\d{1,2}/.test(x)); if (t) { out.d = dateOf(t, year); break; } }   // 제목 줄의 2026.9.2
  /* 코드 칸 — 카탈로그 코드가 가장 많이 나오는 칸 (없으면 코드 모양) */
  const W = Math.max(0, ...rows.map(r => r.length)); let ci = -1, best = 0;
  const isCode = v => /[A-Z]/i.test(v) && /\d/.test(v) && v.length <= 24 && !/\s{2,}/.test(v);
  for (let c = 0; c < W; c++) { const n = rows.filter(r => r[c] && isCode(r[c]) && (find(r[c]) || /^[A-Z0-9][A-Z0-9_\-]*\d{1,}[A-Z]?$/i.test(r[c]))).length + rows.filter(r => r[c] && find(r[c])).length; if (n > best) { best = n; ci = c; } }
  if (ci < 0) { out.err = bt('아이템 코드 칸을 찾지 못했습니다', 'Could not find the item code column'); return out; }
  /* 머리글 줄(QTY)마다 수량 · 단가 · 박스 칸 · 묶음 이름 */
  let qi = -1, pi = -1, bi_ = -1, sec = '', lastP = 0, box = ''; const nseen = {}, boxes = new Set(), by = {}, order = [];
  rows.forEach((r, ri) => {
    /* 수량 칸 — "QTY" · "QTY/PCS" 를 먼저 (Q'ty/CT 같은 '한 박스당 수량' 칸은 피함) */
    let qh = r.findIndex(x => /^(total\s*)?(qty|quantity|数量|수량|总数)(\s*[/(]\s*(pcs|pc|ea|pairs?|对|件)\)?)?$/i.test(x));
    if (qh < 0) qh = r.findIndex(x => /^(qty|q'ty|quantity|数量|수량)\b/i.test(x) && !/\/\s*c\/?t|per\s*(ctn|carton|box)|每箱/i.test(x));
    if (qh >= 0 && r.filter(x => x).length >= 3) {
      qi = qh; pi = r.findIndex((x, i) => i !== ci && /price|单价|단가/i.test(x)); bi_ = r.findIndex(x => /箱数|箱号|c\/t\s*no|carton\s*(no|#)|ctn\s*no/i.test(x)); lastP = 0; box = '';
      let nm = '';
      for (let k = ri - 1; k >= 0 && k >= ri - 3; k--) { const cells = rows[k].filter(x => x); if (cells.length && cells.length <= 2 && !/[：:]/.test(cells[0]) && !/made in|consignee|shipper|seller/i.test(cells[0]) && !cells.some(x => /^\d+(\.\d+)?$/.test(x))) { nm = cells[0]; break; } }
      nseen[nm] = (nseen[nm] || 0) + 1; sec = nseen[nm] > 1 ? nm + ' (' + nseen[nm] + ')' : nm; return;
    }
    if (bi_ >= 0 && S_(r[bi_])) { box = S_(r[bi_]); boxes.add(box); }   // 박스 번호 — 합친 칸은 위 박스 그대로
    const code = r[ci]; if (!code || qi < 0 || !isCode(code) || /^(sub)?total/i.test(code) || /^(sub)?total/i.test(r[0] || '')) return;
    const q = Math.round(num(r[qi])); if (!q) return;
    const it = find(code); let p = pi >= 0 ? num(r[pi]) : 0; if (pi >= 0 && !S_(r[pi])) p = lastP; else lastP = p;   // 합친 칸 — 같은 단가
    const k = (it ? it.c : code.toUpperCase()) + '\u0001' + sec;
    if (!by[k]) { by[k] = { c: it ? it.c : code.toUpperCase(), raw: code, d: it ? it.d : '', q: 0, p, sec, ok: !!it, rq: null, box: [] }; order.push(k); if (!it) by[k].sim = similarCode(code, byCode); }
    by[k].q += q; if (box && !by[k].box.includes(box)) by[k].box.push(box);   // 한 코드가 두 박스에 나뉘면 합침 (박스 번호는 기록)
  });
  out.lines = order.map(k => by[k]); out.boxes = boxes.size;
  const bs = {}; out.lines.forEach(l => { bs[l.sec] = bs[l.sec] || { n: l.sec, q: 0, amt: 0 }; bs[l.sec].q += l.q; bs[l.sec].amt = Math.round((bs[l.sec].amt + l.q * l.p) * 100) / 100; });
  out.secs = Object.values(bs); out.unknown = out.lines.filter(l => !l.ok).map(l => l.c);
  /* 통화 — 머리글에 없으면 카탈로그 판매가와 견줌: 공장 단가가 우리 판매가보다 비싼 줄이 많으면 위안(CNY)일 가능성 */
  if (!out.cur) {   /* 공장 단가 ÷ 우리 판매가 — 달러 원가는 보통 판매가의 1/3 안팎, 0.6 넘으면 위안일 가능성이 큼 */
    const rs = out.lines.filter(l => l.ok && l.p > 0 && byCode[l.c] && Number(byCode[l.c].p) > 0).map(l => l.p / Number(byCode[l.c].p)).sort((a, b) => a - b);
    out.cur = rs.length >= 3 ? (rs[Math.floor(rs.length / 2)] > 0.6 ? 'CNY?' : 'USD?') : '';
  }
  if (!out.lines.length) out.err = bt('수량이 있는 아이템 줄을 찾지 못했습니다', 'No item lines with a quantity');
  return out;
}
function dateOf(v, year) {
  const s = S_(v); if (!s) return '';
  if (/^\d{5}(\.\d+)?$/.test(s)) { const n = Number(s); if (n > 30000 && n < 80000) return new Date(Math.round((n - 25569) * 86400000)).toISOString().substring(0, 10); }   // 엑셀 날짜 숫자 (46326 = 2026-10-31)
  let m = s.match(/(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})/); if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = s.match(/(\d{1,2})\s*月\s*(\d{1,2})/); if (m) return (year || new Date().getFullYear()) + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  return '';
}
/** 금액 — 위안이면 ¥ */
const amtTxt = (v, cur) => /CNY/.test(cur || '') ? '¥' + (Math.round(v * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : money(v);
const tot = L => ({ n: L.length, qty: L.reduce((a, l) => a + l.q, 0), amt: Math.round(L.reduce((a, l) => a + l.q * (l.p || 0), 0) * 100) / 100 });

/* ---------- 화면 (재고 → 🚢 입고 예정) ---------- */
export async function paint(box) {
  box.innerHTML = '<div class="load">' + bt('읽는 중…', 'Loading…') + '</div>';
  let L = []; try { L = await S.DB.list('inbound'); } catch (e) { box.innerHTML = '<div class="card"><div class="alert a-red">' + esc(e.code || e.message) + '</div></div>'; return; }
  L = L.filter(x => x.st !== 'x');
  const open = L.filter(x => x.st !== 'done'), shown = ST.f === 'open' ? open : ST.f === 'done' ? L.filter(x => x.st === 'done') : L;
  const byF = {}; sortBy(shown, x => x.d || x.at || '', true).forEach(x => { (byF[x.factory || '—'] = byF[x.factory || '—'] || []).push(x); });
  const stTag = x => x.st === 'done' ? '<span class="tag t-k">✅ ' + bt('입고 완료', 'Received') + '</span>' : x.st === 'checking' ? '<span class="tag t-a">📦 ' + bt('도착 · 확인 중', 'Arrived · checking') + '</span>' : '<span class="tag t-b">🚢 ' + bt('오는 중', 'On the way') + '</span>';
  box.innerHTML = '<div class="card"><h2 style="font-size:15px">🚢 ' + bi('입고 예정 — 공장에서 보낸 물건', 'Inbound — shipped from factories') + '</h2><div class="muted">' + bt('공장 인보이스를 등록하면 여기에 오는 중으로 보입니다. 박스가 도착하면 창고에서 받은 수량을 확인하고 📥 입고 확정을 누르면 재고에 더해집니다.', 'Registered factory invoices show here as on the way. When boxes arrive, the warehouse checks the quantities and confirms — then stock goes up.') + '</div>' +
    (canAdd() ? '<div class="fg" style="margin-top:8px"><label>📎 ' + bt('공장 인보이스 등록 (엑셀 · CSV)', 'Register a factory invoice (Excel · CSV)') + '</label><input type="file" id="ibFile" accept=".xlsx,.xls,.csv"></div><div id="ibOut"></div>' : '') +
    '<div class="chips" style="margin-top:8px">' + [['open', bt('진행 중', 'Open') + ' ' + open.length], ['done', bt('입고 완료', 'Received')], ['all', bt('전체', 'All')]].map(c => '<button class="' + (ST.f === c[0] ? 'on' : '') + '" data-ibf="' + c[0] + '">' + c[1] + '</button>').join('') + '</div></div>' +
    (Object.keys(byF).length ? Object.keys(byF).sort().map(f => '<div class="card"><h2 style="font-size:15px">🏭 ' + esc(f) + ' <span class="muted" style="font-weight:400">' + byF[f].length + bt('건', '') + ' · ' + byF[f].reduce((a, x) => a + (x.qty || 0), 0).toLocaleString() + bt('개', ' pcs') + '</span></h2>' +
      byF[f].map(x => '<div class="pr tap" data-ib="' + esc(x.id) + '"><div class="ct"><b>' + esc(x.no || x.id) + ' ' + stTag(x) + '</b><small>' + esc(md(x.d || '')) + ' · ' + (x.n || 0) + bt('종', ' items') + ' · ' + esc((x.secs || []).map(s => s.n).join(' · ')) + (x.diff && x.diff.length ? ' · <span class="warn">⚠️ ' + bt('차이', 'diff') + ' ' + x.diff.length + '</span>' : '') + '</small></div><div class="pa"><b>' + (x.qty || 0).toLocaleString() + '</b><small>' + (seeCost() && x.amt ? amtTxt(x.amt, x.cur) : bt('개', 'pcs')) + '</small></div></div>').join('') + '</div>').join('')
      : '<div class="card"><div class="none">' + bt('입고 예정이 없습니다', 'Nothing inbound') + '</div></div>');
  box.querySelectorAll('[data-ibf]').forEach(b => b.onclick = () => { ST.f = b.dataset.ibf; paint(box); });
  box.querySelectorAll('[data-ib]').forEach(el => el.onclick = () => detail(L.find(x => x.id === el.dataset.ib), box));
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
    if (P.err) { out.innerHTML = '<div class="alert a-red">' + esc(P.err) + '</div>'; return; }
    ST.draft = Object.assign(P, { file: f.name }); preview(box);
  } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.code || e.message) + '</div>'; }
}
/** 등록 전 확인 — 공장 · 번호 · 날짜 고치기 · 목록에 없는 코드는 코드를 고쳐 맞춤 */
function preview(box) {
  const P = ST.draft, t = tot(P.lines), bad = P.lines.filter(l => !l.ok), sups = Stock.suppliers();
  openModal('<h2>🚢 ' + bi('공장 인보이스 확인', 'Check the factory invoice') + '</h2><div class="muted">' + esc(P.file) + '</div>' +
    '<div class="two"><div class="fg"><label>🏭 ' + bt('공장', 'Factory') + '</label><input id="ibF" value="' + esc(P.factory) + '" list="ibFL"><datalist id="ibFL">' + sups.map(s => '<option value="' + esc(s.name || s.alias || s.code) + '">').join('') + '</datalist></div><div class="fg"><label>' + bt('인보이스 번호', 'Invoice no') + '</label><input id="ibNo" value="' + esc(P.no) + '" placeholder="' + esc(bt('비우면 공장 · 날짜로', 'empty = factory · date')) + '"></div></div>' +
    '<div class="two"><div class="fg"><label>' + bt('인보이스 날짜', 'Invoice date') + '</label><input type="date" id="ibD" value="' + esc(P.d || today()) + '"></div><div class="fg"><label>' + bt('도착 예정 (선택)', 'ETA (optional)') + '</label><input type="date" id="ibEta" value="' + esc(P.eta || '') + '"></div></div>' +
    (seeCost() ? '<div class="fg"><label>💱 ' + bt('단가 통화', 'Price currency') + (/\?/.test(P.cur || '?') ? ' <span class="warn">— ' + bt('파일에 안 적혀 있어 추정했습니다. 확인하세요', 'not stated in the file — estimated, please check') + '</span>' : '') + '</label><div class="seg">' + [['USD', '$ USD'], ['CNY', '¥ CNY (위안)']].map(c => '<button type="button" class="' + (String(P.cur || 'USD?').replace('?', '') === c[0] ? 'on' : '') + '" data-ibcur="' + c[0] + '">' + c[1] + '</button>').join('') + '</div></div>' : '') +
    ((P.boxes || P.trk || P.frt) ? '<div class="muted" style="font-size:12.5px">' + [P.boxes ? '📦 ' + bt('박스', 'Boxes') + ' ' + P.boxes : '', P.trk ? '🚚 UPS ' + esc(P.trk) : '', P.frt && seeCost() ? bt('운임', 'Freight') + ' ' + amtTxt(P.frt, P.cur) : ''].filter(Boolean).join(' · ') + '</div>' : '') +
    '<div class="sumbox">' + P.secs.map(s => '<div>' + esc(s.n || '—') + ' — <b>' + s.q.toLocaleString() + '</b>' + bt('개', ' pcs') + (seeCost() ? ' · ' + amtTxt(s.amt, P.cur) : '') + '</div>').join('') + '<div style="margin-top:4px"><b>' + t.n + bt('종 · ', ' items · ') + t.qty.toLocaleString() + bt('개', ' pcs') + (seeCost() ? ' · ' + amtTxt(t.amt, P.cur) : '') + '</b></div></div>' +
    (bad.length ? '<div class="alert a-red">⚠️ ' + bt('앱에 없는 코드', 'Codes not in the app') + ' ' + bad.length + ' — ' + bt('맞는 코드로 고치거나, 새 아이템이면 먼저 등록하세요 (그대로 두면 받을 때 재고 코드로 그대로 들어갑니다)', 'fix them to the right code, or register the new items first (left as is, they go in as these codes)') + '</div>' : '<div class="alert a-grn">✅ ' + bt('모든 코드가 앱 카탈로그와 맞습니다', 'All codes match the catalog') + '</div>') +
    '<div style="max-height:42vh;overflow:auto"><table><tr><th>' + bt('코드', 'Code') + '</th><th>' + bt('이름', 'Name') + '</th><th class="r">' + bt('수량', 'Qty') + '</th>' + (seeCost() ? '<th class="r">' + bt('단가', 'Unit') + '</th>' : '') + '</tr>' +
      P.lines.map((l, i) => '<tr' + (l.ok ? '' : ' style="background:#fef2f2"') + '><td>' + (l.ok ? '<b>' + esc(l.c) + '</b>' : '<input data-ibc="' + i + '" value="' + esc(l.c) + '" style="width:110px;text-transform:uppercase">') + '</td><td><small>' + esc(l.d || (l.ok ? '' : bt('목록에 없음', 'not in catalog'))) + '</small>' + (!l.ok && l.sim ? ' <button type="button" class="b-ghost b-sm" data-ibsim="' + i + '">≈ ' + esc(l.sim) + '?</button>' : '') + (l.box && l.box.length ? '<div class="muted" style="font-size:11px">📦 ' + esc(l.box.join(' · ')) + '</div>' : '') + '</td><td class="r">' + l.q.toLocaleString() + '</td>' + (seeCost() ? '<td class="r">' + amtTxt(l.p, P.cur) + '</td>' : '') + '</tr>').join('') + '</table></div>' +
    '<div class="btns"><button class="b-ghost" id="ibX">' + bt('취소', 'Cancel') + '</button><button class="b-blue" id="ibGo">🚢 ' + bt('입고 예정으로 등록', 'Register as inbound') + '</button></div>');
  document.querySelectorAll('[data-ibc]').forEach(inp => inp.onchange = () => { const l = P.lines[+inp.dataset.ibc], it = exactItem(inp.value); l.c = it ? it.c : inp.value.trim().toUpperCase(); l.d = it ? it.d : ''; l.ok = !!it; keep(); preview(box); });
  const keep = () => { P.factory = $('ibF').value.trim(); P.no = $('ibNo').value.trim(); P.d = $('ibD').value; P.eta = $('ibEta').value; };
  document.querySelectorAll('[data-ibsim]').forEach(b => b.onclick = () => { const l = P.lines[+b.dataset.ibsim], it = exactItem(l.sim); if (it) { l.c = it.c; l.d = it.d; l.ok = true; } keep(); preview(box); });   // ≈ 비슷한 코드 — 눌러야 바뀜
  document.querySelectorAll('[data-ibcur]').forEach(b => b.onclick = () => { keep(); P.cur = b.dataset.ibcur; preview(box); });
  ['ibF', 'ibNo', 'ibD', 'ibEta'].forEach(id => { $(id).onchange = keep; });
  $('ibX').onclick = () => { ST.draft = null; closeModal(); };
  $('ibGo').onclick = async () => {
    keep(); if (!P.factory) return toast(bt('공장 이름을 넣으세요', 'Enter the factory'), 'bad');
    const no = P.no || (P.factory.split(/\s+/)[0].toUpperCase().slice(0, 10) + '-' + (P.d || today()).replace(/-/g, ''));
    busy(true);
    try {
      let dup = null; try { dup = (await S.DB.list('inbound', { where: [['no', '==', no]] })).find(x => x.st !== 'x' && x.factory === P.factory); } catch (e) {}
      if (dup) { busy(false); return toast(bt('이미 등록된 인보이스입니다', 'Already registered') + ': ' + no, 'bad'); }
      const id = newId('IB'), now = new Date().toISOString(), t2 = tot(P.lines), sup = Stock.supFind(P.factory);
      const doc = { id, no, factory: P.factory, fromCode: sup ? sup.code : '', d: P.d || today(), eta: P.eta || '', file: P.file, st: 'coming', cur: String(P.cur || 'USD').replace('?', ''), boxes: P.boxes || 0, trk: P.trk || '', frt: P.frt || 0, secs: P.secs, lines: P.lines.map(l => ({ c: l.c, raw: l.raw, d: l.d, q: l.q, p: l.p, sec: l.sec, ok: l.ok, rq: null, box: l.box || [] })), n: t2.n, qty: t2.qty, amt: t2.amt, by: S.user.email, at: now };
      await S.DB.set('inbound', id, doc);
      try { const N = await import('./notify.js'); await N.queue({ kind: 'inbound', pushOnly: true, toGroup: 'g:wh', toStaff: true, subject: '[THE ONE] 🚢 ' + bt('입고 예정', 'Inbound') + ' — ' + P.factory, text: '🚢 ' + P.factory + ' · ' + no + ' · ' + t2.n + bt('종 ', ' items ') + t2.qty.toLocaleString() + bt('개 — 오는 중', ' pcs — on the way'), url: N.appUrl('stock/inb') }); } catch (e) {}
      ST.draft = null; closeModal(); toast('🚢 ' + no + ' — ' + t2.qty.toLocaleString() + bt('개 입고 예정', ' pcs inbound'), 'good'); paint(box);
    } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}
/** 상세 — 받은 수량 확인 · 중간 저장 · 입고 확정 */
function detail(x, box) {
  if (!x) return;
  const done = x.st === 'done', L = x.lines.map(l => Object.assign({}, l)), rcv = canRecv() && !done;
  const paintM = () => {
    const sent = L.reduce((a, l) => a + l.q, 0), got = L.reduce((a, l) => a + (l.rq == null ? 0 : l.rq), 0), left = L.filter(l => l.rq == null).length, diff = L.filter(l => l.rq != null && l.rq !== l.q);
    openModal('<h2>🚢 ' + esc(x.no) + '</h2><div class="muted">🏭 ' + esc(x.factory) + ' · ' + esc(md(x.d || '')) + (x.eta ? ' · ' + bt('도착 예정', 'ETA') + ' ' + esc(md(x.eta)) : '') + (x.boxes ? ' · 📦 ' + bt('박스', 'Boxes') + ' ' + x.boxes : '') + (x.trk ? ' · 🚚 ' + esc(x.trk) : '') + ' · ' + esc(x.file || '') + '</div>' +
      '<div class="kpi" style="grid-template-columns:repeat(3,1fr);margin-top:8px"><div><b>' + sent.toLocaleString() + '</b><span>' + bt('보낸 수량', 'Shipped') + '</span></div><div><b>' + got.toLocaleString() + '</b><span>' + bt('받은 수량', 'Received') + '</span></div><div' + (diff.length ? ' style="background:#fef3c7"' : '') + '><b>' + (left ? left + bt('줄 남음', ' left') : diff.length ? '⚠️ ' + diff.length : '✓') + '</b><span>' + (left ? bt('확인 전', 'to check') : bt('차이', 'Differences')) + '</span></div></div>' +
      (done ? '<div class="alert a-grn">✅ ' + bt('입고 완료', 'Received') + ' — ' + esc(String(x.recvBy || '').split('@')[0]) + ' ' + esc(String(x.recvAt || '').substring(0, 16).replace('T', ' ')) + '</div>' : '') +
      (rcv ? '<div class="btns" style="justify-content:flex-start;margin:6px 0"><button class="b-ghost b-sm" id="ibAll">✅ ' + bt('남은 줄 모두 맞음', 'All remaining correct') + '</button></div>' : '') +
      '<div style="max-height:46vh;overflow:auto"><table><tr><th>' + bt('코드', 'Code') + '</th><th class="r">' + bt('보낸', 'Sent') + '</th><th class="r">' + bt('받은', 'Got') + '</th></tr>' +
        L.map((l, i) => '<tr' + (!l.ok ? ' style="background:#fef2f2"' : l.rq != null && l.rq !== l.q ? ' style="background:#fef3c7"' : '') + '><td><b>' + esc(l.c) + '</b><div class="muted" style="font-size:11.5px">' + esc(l.d || (l.ok ? '' : bt('목록에 없는 코드', 'not in catalog'))) + (l.sec ? ' · ' + esc(l.sec) : '') + (l.box && l.box.length ? ' · 📦 ' + esc(l.box.join(' · ')) : '') + '</div></td><td class="r">' + l.q.toLocaleString() + '</td><td class="r">' +
          (rcv ? '<input data-ibq="' + i + '" inputmode="numeric" value="' + (l.rq == null ? '' : l.rq) + '" placeholder="—" style="width:76px;text-align:right">' : (l.rq == null ? '—' : l.rq.toLocaleString() + (l.rq !== l.q ? ' <b class="warn">(' + (l.rq - l.q > 0 ? '+' : '') + (l.rq - l.q) + ')</b>' : ''))) + '</td></tr>').join('') + '</table></div>' +
      '<div class="btns" style="flex-wrap:wrap"><button class="b-ghost" id="ibX">' + bt('닫기', 'Close') + '</button>' + (canAdd() && !done ? '<button class="b-ghost" id="ibDel" style="color:#991b1b">🗑 ' + bt('지우기', 'Delete') + '</button>' : '') +
        (rcv ? '<button class="b-ghost" id="ibSave">💾 ' + bt('중간 저장', 'Save progress') + '</button><button class="b-green" id="ibOk"' + (left ? ' disabled' : '') + '>📥 ' + bt('입고 확정 — 재고에 더하기', 'Confirm — add to stock') + '</button>' : '') + '</div>');
    document.querySelectorAll('[data-ibq]').forEach(inp => inp.onchange = () => { const v = S_(inp.value); L[+inp.dataset.ibq].rq = v === '' ? null : Math.max(0, Math.round(num(v))); paintM(); });
    $('ibX').onclick = closeModal;
    if ($('ibAll')) $('ibAll').onclick = () => { L.forEach(l => { if (l.rq == null) l.rq = l.q; }); paintM(); };
    if ($('ibSave')) $('ibSave').onclick = async () => { busy(true); try { await S.DB.update('inbound', x.id, { lines: L, st: 'checking', chkAt: new Date().toISOString(), chkBy: S.user.email }); Object.assign(x, { lines: L, st: 'checking' }); toast('💾 ' + bt('저장 — 확인 중', 'Saved — checking')); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); } busy(false); };
    if ($('ibDel')) $('ibDel').onclick = async () => { if (!(await confirmBox(x.no + ' ' + bt('입고 예정을 지울까요? (재고는 그대로)', '— delete this inbound? (stock unchanged)'), bt('지우기', 'Delete')))) return; busy(true); try { await S.DB.update('inbound', x.id, { st: 'x', delAt: new Date().toISOString(), delBy: S.user.email }); closeModal(); paint(box); } catch (e) { toast(e.code || e.message, 'bad'); } busy(false); };
    if ($('ibOk')) $('ibOk').onclick = async () => {
      const got2 = L.filter(l => l.rq > 0), diff2 = L.filter(l => l.rq !== l.q);
      if (!(await confirmBox('📥 ' + x.no + '\n' + got2.length + bt('종 · ', ' items · ') + got2.reduce((a, l) => a + l.rq, 0).toLocaleString() + bt('개를 재고에 더할까요?', ' pcs — add to stock?') + (diff2.length ? '\n⚠️ ' + bt('보낸 수량과 다른 줄', 'Lines that differ') + ' ' + diff2.length : ''), bt('입고 확정', 'Confirm')))) return;
      busy(true);
      try {
        const rid = newId('R'), now = new Date().toISOString(), d = today();
        await S.DB.set('receipts', rid, { id: rid, d, from: x.factory, fromCode: x.fromCode || '', file: x.file || '', inbound: x.id, invNo: x.no, n: got2.length, qty: got2.reduce((a, l) => a + l.rq, 0), lines: got2.map(l => ({ c: l.c, q: l.rq, d: l.d || '' })), note: diff2.length ? bt('차이', 'Diff') + ' ' + diff2.map(l => l.c + ' ' + l.q + '→' + l.rq).join(', ') : '', by: S.user.email, at: now });
        await Stock.applyMoves(got2.map(l => ({ c: l.c, delta: l.rq })), 'recv', rid, '🚢 ' + x.factory + ' · ' + x.no);
        const diffL = diff2.map(l => ({ c: l.c, q: l.q, rq: l.rq }));
        await S.DB.update('inbound', x.id, { lines: L, st: 'done', recvAt: now, recvBy: S.user.email, receiptId: rid, diff: diffL });
        if (diffL.length) { try { const N = await import('./notify.js'); await N.queue({ kind: 'inboundDiff', pushOnly: true, toStaff: true, subject: '[THE ONE] ⚠️ ' + bt('입고 수량 차이', 'Receiving differences') + ' — ' + x.factory, text: '⚠️ ' + x.factory + ' · ' + x.no + '\n' + diffL.map(l => l.c + ' ' + bt('보냄', 'sent') + ' ' + l.q + ' → ' + bt('받음', 'got') + ' ' + l.rq).join('\n'), url: N.appUrl('stock/inb') }); } catch (e) {} }
        closeModal(); toast('📥 ' + x.no + ' — ' + bt('재고에 더했습니다', 'added to stock') + (diffL.length ? ' · ⚠️ ' + diffL.length : ''), 'good'); paint(box);
      } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
      busy(false);
    };
  };
  paintM();
}
