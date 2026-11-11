/* ============================================================
 *  🚢 공장 인보이스 읽기 — 순수 함수 (브라우저 · Apps Script 둘 다)
 *    앱: src/inbound.js 가 가져다 씀 · Apps Script: tools/gas-inbound.js 가 이 파일로 apps-script/InboundParse.gs 를 만듦 (build.sh)
 *    → 한 곳만 고치면 앱과 메일 자동 등록이 같은 규칙으로 읽음. 여기에는 import · DOM · 앱 상태를 쓰지 않음
 *    err: 'nocode' (코드 칸 없음) · 'nolines' (수량 있는 줄 없음)
 * ============================================================ */
export const S_ = v => String(v == null ? '' : v).trim();
export const num = v => { const n = Number(S_(v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; };
export const norm = s => S_(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

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
  if (ci < 0) { out.err = 'nocode'; return out; }
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
    if (!by[k]) { by[k] = { c: it ? it.c : code.toUpperCase(), raw: code, d: it ? it.d : '', q: 0, p, sec, ok: !!it, rq: null, box: [], bx: [] }; order.push(k); if (!it) by[k].sim = similarCode(code, byCode); }
    by[k].q += q;   // 한 코드가 두 박스에 나뉘면 한 줄로 합치고, 박스마다 수량은 bx 에 (📦 박스별 확인)
    if (box) { if (!by[k].box.includes(box)) by[k].box.push(box); const e = by[k].bx.find(x => x.b === box); if (e) e.q += q; else by[k].bx.push({ b: box, q, rq: null }); }
  });
  out.lines = order.map(k => by[k]); out.boxes = boxes.size;
  const bs = {}; out.lines.forEach(l => { bs[l.sec] = bs[l.sec] || { n: l.sec, q: 0, amt: 0 }; bs[l.sec].q += l.q; bs[l.sec].amt = Math.round((bs[l.sec].amt + l.q * l.p) * 100) / 100; });
  out.secs = Object.values(bs); out.unknown = out.lines.filter(l => !l.ok).map(l => l.c);
  /* 통화 — 머리글에 없으면 카탈로그 판매가와 견줌: 공장 단가가 우리 판매가보다 비싼 줄이 많으면 위안(CNY)일 가능성 */
  if (!out.cur) {   /* 공장 단가 ÷ 우리 판매가 — 달러 원가는 보통 판매가의 1/3 안팎, 0.6 넘으면 위안일 가능성이 큼 */
    const rs = out.lines.filter(l => l.ok && l.p > 0 && byCode[l.c] && Number(byCode[l.c].p) > 0).map(l => l.p / Number(byCode[l.c].p)).sort((a, b) => a - b);
    out.cur = rs.length >= 3 ? (rs[Math.floor(rs.length / 2)] > 0.6 ? 'CNY?' : 'USD?') : '';
  }
  if (!out.lines.length) out.err = 'nolines';
  return out;
}
export function dateOf(v, year) {
  const s = S_(v); if (!s) return '';
  if (/^\d{5}(\.\d+)?$/.test(s)) { const n = Number(s); if (n > 30000 && n < 80000) return new Date(Math.round((n - 25569) * 86400000)).toISOString().substring(0, 10); }   // 엑셀 날짜 숫자 (46326 = 2026-10-31)
  let m = s.match(/(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})/); if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = s.match(/(\d{1,2})\s*月\s*(\d{1,2})/); if (m) return (year || new Date().getFullYear()) + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  return '';
}
/* ---------- 📎 메일 첨부가 무엇인지 (v0.8.184 관리자: "inbound 에 다른 엑셀 · 전체 밸런스 같은 파일이 와도 구별") ----------
 *   읽는 곳: 엑셀 파일 이름 + 각 시트 이름 + 시트 맨 위 6줄(제목) · 메일 제목.  돌려주는 값: { kind, why }
 *   kind: 'invoice'  — 아이템 코드 · 수량이 읽히고 명세서 · 진행표 표시가 없음 (패킹리스트도 여기 — 같은 메일의 인보이스와 합침)
 *         'statement' — 공장 장부(Date · PAID DATE · DEPOSIT MONEY · ACCOUNT · 결재내역서 모양) 이거나 对账单 · BALANCE · STATEMENT · ACCOUNT 같은 제목
 *         'status'    — 생산 · 주문 진행표 (STATUS · 进度 · 生产 · ORDER LIST) — 송금 · 잔액이 있으면 장부와 대조
 *         'other'     — 그 밖 (읽을 수 없음) */
export const STMT_RE = /对账|對賬|对帐|對帳|余额|餘額|欠款|往来|往來|应付|應付|STATEMENT|BALANCE|ACCOUNT|\bSOA\b|LEDGER|잔액|명세/i;
export const STATUS_RE = /STATUS|进度|進度|生产|生產|PRODUCTION|ORDER\s*LIST|PROGRESS|订单|訂單|생산|진행/i;
/* 시트 제목은 订单 · ORDER 를 빼고 봄 — 중국 인보이스 머리에 흔한 "订单号 · PO" 때문에 진행표로 잘못 보지 않게 (파일 이름은 STATUS_RE 전부) */
export const STATUS_TITLE_RE = /STATUS|进度|進度|生产计划|生產計劃|PRODUCTION\s*(PLAN|SCHEDULE|STATUS)|PROGRESS|생산|진행/i;
export const INV_RE = /INVOICE|发票|發票|PACKING|装箱|裝箱|인보이스|패킹/i;
export const PACK_RE = /PACKING|装箱|裝箱|패킹/i;
export function classifyFile(o) {
  const name = S_(o.name), sheets = o.sheets || [], inv = o.inv || { err: 'nocode' };
  const title = name + ' ' + sheets.slice(0, 4).map(s => S_(s.name) + ' ' + (s.rows || []).slice(0, 6).map(r => (r || []).map(S_).join(' ')).join(' ')).join(' ');
  if (o.ledger) return STATUS_RE.test(name) || STATUS_TITLE_RE.test(title) ? { kind: 'status', why: '진행표 + 송금 · 잔액 (장부와 대조)' } : { kind: 'statement', why: '공장 장부 (인보이스 · 송금 · 잔액)' };
  const invOk = !inv.err && inv.lines && inv.lines.length;
  if (invOk && INV_RE.test(title) && !STMT_RE.test(name)) return { kind: 'invoice', why: '아이템 코드 · 수량 + 인보이스/패킹 제목' };
  if (STMT_RE.test(name) || (!invOk && (STMT_RE.test(title) || /^\s*(STATEMENT|ACCOUNT|BALANCE|对账)/i.test(S_(o.subject))))) return { kind: 'statement', why: '파일 이름 · 제목에 명세서 · 잔액 표시 (' + ((name + ' ' + title).match(STMT_RE) || [''])[0] + ')' };
  if (STATUS_RE.test(name) || STATUS_TITLE_RE.test(title)) return { kind: 'status', why: '파일 이름 · 제목에 진행표 표시 (' + (name.match(STATUS_RE) || title.match(STATUS_TITLE_RE) || [''])[0] + ')' };
  if (invOk) return { kind: 'invoice', why: '아이템 코드 · 수량' };
  return { kind: 'other', why: inv.err === 'nocode' ? '아이템 코드 칸 없음' : '수량 있는 줄 없음' };
}
/** 같은 출고인지 — 코드:수량 묶음 (인보이스 + 패킹리스트가 한 메일에 같이 올 때) */
export function invSig(lines) { return (lines || []).map(l => l.c + ':' + l.q).sort().join('|'); }
/** 인보이스인지 확실하지 않음 — 인보이스 번호 · 단가가 없고 메일 제목 · 파일 이름에도 INVOICE 가 없으면 바로 등록하지 않고 🔎 확인 대기 */
export function unsureInvoice(R, body, subject, name) { const priced = (R.lines || []).some(l => (l.p || 0) > 0); return !R.no && !(body && body.no) && !priced && !INV_RE.test(S_(subject)) && !INV_RE.test(S_(name)); }
