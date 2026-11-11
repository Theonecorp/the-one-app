/* ============================================================
 *  🏭 공장 명세서 읽기 — 공장별 엑셀 (연도 탭: Date · ITEM/Invoice amount · FREIGHT · Amount | PAID DATE · DEPOSIT MONEY)
 *    A1 = 공장 이름 · 위쪽 TOTAL / DEPOSIT / BALANCE 는 검산용 · BALANCE FORWARD 줄 = 이월
 *    같은 파일에 앞 연도 탭이 있으면 그 다음 연도의 BALANCE FORWARD 는 넣지 않음 (앞 연도 줄들로 계산되므로 두 번 잡히지 않게)
 *    순수 함수 — 브라우저(관리 → 가져오기) 와 node 시험에서 같이 씀
 * ============================================================ */
const R2 = n => Math.round((Number(n) || 0) * 100) / 100;
const num = v => { if (v == null || v === '') return 0; if (typeof v === 'number') return v; const n = Number(String(v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; };
const sv = v => String(v == null ? '' : v).trim();
export function dstr(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) { if (isNaN(v)) return ''; return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0'); }
  if (typeof v === 'number') { if (v < 20000 || v > 80000) return ''; const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); return d.toISOString().substring(0, 10); }
  const s = sv(v); let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0'); }
  return '';
}
/** 공장 명세서인지 — 머리글 줄에 Date · PAID DATE · DEPOSIT MONEY 가 있으면 */
export function looksLikeStatement(rows) { return (rows || []).slice(0, 12).some(r => { const h = (r || []).map(x => sv(x).toLowerCase()); return h.includes('date') && h.includes('paid date') && h.includes('deposit money'); }); }
/** sheets = [{ name, rows }] → { name, sheets: [{ year, inv, pay, hdr, sumInv, sumPay, fwd, fwdSkipped, warn }], inv, pay, warn } */
export function parseFactoryStatement(sheets) {
  const out = { name: '', sheets: [], inv: [], pay: [], warn: [] };
  (sheets || []).forEach(sh => {
    const rows = sh.rows || []; if (!looksLikeStatement(rows)) return;
    const yr = (sv(sh.name).match(/20\d\d/) || [])[0] || '';
    if (!out.name) { const r0 = rows[0] || []; out.name = sv(r0.find(c => sv(c) && !/^total|^deposit|^balance/i.test(sv(c))) || ''); }
    const hdr = { total: null, deposit: null, balance: null };
    rows.slice(0, 5).forEach(r => (r || []).forEach((c, j) => { const k = sv(c).toLowerCase(); if (k === 'total' || k === 'deposit' || k === 'balance') { for (let x = j + 1; x < r.length; x++) { if (sv(r[x]) !== '') { hdr[k] = R2(num(r[x])); break; } } } }));
    const hi = rows.findIndex(r => (r || []).some(c => sv(c).toLowerCase() === 'date')); if (hi < 0) return;
    const hd = rows[hi].map(x => sv(x).toLowerCase());
    const ix = { d: hd.indexOf('date'), item: hd.findIndex(h => h === 'item' || h === 'invoice amount' || h === 'invoice'), frt: hd.findIndex(h => h === 'freight'), amt: hd.indexOf('amount'), pd: hd.indexOf('paid date'), dep: hd.indexOf('deposit money') };
    const S = { year: yr, inv: [], pay: [], hdr, warn: [] };
    /* 파일 TOTAL = Amount 열 전체 합. 날짜가 빈 줄은 위 줄의 선적에 이어지는 인보이스 · CREDIT · uniform 같은 조정 줄 → 바로 위 날짜를 이어받음 */
    let lastD = '';
    /* 숫자 · 날짜가 아닌 글자(날짜 칸의 CREDIT · uniform · ANDREW BALANCE FORWARD, avg 칸의 설명 등)는 메모로 */
    const textOf = r => r.map((c, j) => ((j === ix.d && !dstr(c)) || (j !== ix.d && j !== ix.pd && j !== ix.dep)) ? sv(c) : '').filter(c => c && !/^-?[\d,.$\s]+$/.test(c) && !/^\d{4}-\d\d-\d\d/.test(c) && !(c instanceof Date)).join(' · ');
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r || !r.some(c => sv(c) !== '')) continue;
      const dRaw = sv(r[ix.d]), label = ix.item >= 0 ? sv(r[ix.item]) : '', text = textOf(r);
      const fwd = /balance\s*forward/i.test(dRaw) || /balance\s*forward/i.test(label) || /balance\s*forward/i.test(text);
      const amtCell = ix.amt >= 0 ? R2(num(r[ix.amt])) : 0;
      const item = ix.item >= 0 && !/[a-z가-힣]/i.test(label) ? R2(num(r[ix.item])) : 0, frt = ix.frt >= 0 ? R2(num(r[ix.frt])) : 0;
      let d = dstr(r[ix.d]); if (d) lastD = d;
      if (fwd) { const amt = amtCell || item; if (amt) S.inv.push({ d: d || lastD || (yr ? yr + '-01-01' : ''), type: '이월', item: 0, frt: 0, amt, note: text || 'BALANCE FORWARD' }); }
      else if (amtCell || item || frt) {
        const amt = amtCell || R2(item + frt);
        if (!amt) continue;
        if (!d) { d = lastD || (yr ? yr + '-01-01' : ''); if (!lastD) S.warn.push(sh.name + ' ' + (i + 1) + '행: 날짜가 없어 ' + d + ' 로 넣음'); }
        let note = text; if (amtCell && (item || frt) && Math.abs(item + frt - amtCell) > 0.011) note = (note ? note + ' · ' : '') + '⚠️ 물품 ' + item + ' + 운임 ' + frt + ' ≠ 합계 ' + amtCell;
        S.inv.push({ d, type: '인보이스', item: item || (frt ? 0 : amt), frt, amt, note });
      }
      if (ix.pd >= 0 && ix.dep >= 0) { const pd = dstr(r[ix.pd]), dep = R2(num(r[ix.dep])); if (pd && dep) S.pay.push({ d: pd, amt: dep }); else if (dep) S.warn.push(sh.name + ' ' + (i + 1) + '행: 송금 ' + dep + ' 의 날짜를 읽지 못함 (' + sv(r[ix.pd]) + ') — 빠짐'); }
    }
    S.sumInvAll = R2(S.inv.reduce((a, x) => a + x.amt, 0)); S.sumPay = R2(S.pay.reduce((a, x) => a + x.amt, 0));
    S.fwd = R2(S.inv.filter(x => x.type === '이월').reduce((a, x) => a + x.amt, 0));
    S.okTotal = hdr.total == null ? null : Math.abs(S.sumInvAll - hdr.total) < 0.011; S.okDep = hdr.deposit == null ? null : Math.abs(S.sumPay - hdr.deposit) < 0.011;
    out.sheets.push(S);
  });
  out.sheets.sort((a, b) => (a.year || '').localeCompare(b.year || ''));
  const years = new Set(out.sheets.map(s => s.year));
  /* 앞 연도 탭이 같은 파일에 있으면, 그 연도 BALANCE 와 같은 금액의 이월 줄은 넣지 않음 (앞 연도 줄들로 계산됨). 다른 이월 줄(예: 별도 잔액 이월)은 그대로 */
  out.sheets.forEach((s, k) => { s.fwdSkipped = 0; const prev = k > 0 ? out.sheets[k - 1] : null;
    if (prev && s.year && String(Number(s.year) - 1) === prev.year) { const pb = prev.hdr.balance; s.inv = s.inv.filter(x => { if (x.type === '이월' && pb != null && Math.abs(x.amt - pb) < 0.011 && !s.fwdSkipped) { s.fwdSkipped = x.amt; return false; } return true; }); }
    s.sumInv = R2(s.inv.reduce((a, x) => a + x.amt, 0)); out.inv = out.inv.concat(s.inv); out.pay = out.pay.concat(s.pay); out.warn = out.warn.concat(s.warn); });
  return out;
}
/** 공장 이름 → 코드 제안: 두 단어 이상이면 머리글자(최대 4), 한 단어면 앞 4글자 */
export function suggestFactoryCode(name) { const w = sv(name).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(x => x && !/^(CO|LTD|INC|THE|AND|OF)$/.test(x)); if (!w.length) return ''; return w.length >= 2 ? w.map(x => x[0]).join('').substring(0, 4) : w[0].substring(0, 4); }
/** 기존 공장 중 이름이 맞는 것 — 같은 단어가 가장 많은 공장 (QUINGDAO 처럼 겹치는 단어만 같으면 안 고름) */
export function matchFactory(name, facs) {
  const W = s => new Set(sv(s).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(x => x.length >= 3 && !/^(CO|LTD|INC|THE|AND|OF|SUPPLY|CHAIN|STATEMENT)$/.test(x)));
  const a = W(name); let best = null, bn = 0, tie = false;
  (facs || []).forEach(f => { const b = W(f.name + ' ' + f.code); let n = 0; a.forEach(x => { if (b.has(x)) n++; }); if (n > bn) { best = f; bn = n; tie = false; } else if (n && n === bn) tie = true; });
  if (!best || tie) return null;
  const strong = Array.from(a).some(x => x !== 'QUINGDAO' && x !== 'QINGDAO' && x !== 'ZHEJIANG' && W(best.name + ' ' + best.code).has(x));
  return strong ? best : null;
}
/** 📨 공장이 보낸 명세서(Statement · Account) ↔ 경영 → 🏭 공장 장부 대조 (v0.8.184 관리자: "Status 나 Account 같은 파일도 경영 자료와 비교")
 *   P = parseFactoryStatement(...) · app = { inv: [{ d, amt, type }], pay: [{ d, amt }] } (그 공장의 factoryInvoices · factoryPayments)
 *   · 잔액: 파일 마지막 탭의 BALANCE (없으면 파일 줄로 계산) ↔ 앱 잔액 (파일 마지막 날짜까지 · 지금)
 *   · 줄: 파일이 덮는 기간(첫 날짜 ~ 마지막 날짜, 이월 줄 빼고) 안에서 날짜 + 금액이 같은 줄끼리 짝 → 남는 줄 = 한쪽에만 있음
 *         금액은 같은데 날짜만 60일 안으로 다르면 "날짜 다름"으로 따로 · 이월(전년 미수금)이 있으면 그 날 전 앱 잔액과도 대조 */
export function compareStatement(P, app) {
  const inv = (P && P.inv) || [], pay = (P && P.pay) || [], A = app || {};
  const aInv = (A.inv || []).filter(x => x && x.d), aPay = (A.pay || []).filter(x => x && x.d);
  const last = (P && P.sheets && P.sheets[P.sheets.length - 1]) || { hdr: {} };
  const dates = inv.filter(x => x.type !== '이월').concat(pay).map(x => x.d).filter(Boolean).sort();
  const from = dates[0] || '', to = [dates[dates.length - 1] || '', (last.hdr && last.hdr.asOf) || ''].sort().pop();
  const sumA = L => R2(L.reduce((a, x) => a + (Number(x.amt) || 0), 0));
  const fileBal = last.hdr && last.hdr.balance != null ? R2(last.hdr.balance) : R2(sumA(inv) - sumA(pay));
  const appBal = R2(sumA(aInv) - sumA(aPay)), appBalAt = to ? R2(sumA(aInv.filter(x => x.d <= to)) - sumA(aPay.filter(x => x.d <= to))) : appBal;
  const fw = inv.filter(x => x.type === '이월' && x.d).sort((a, b) => a.d.localeCompare(b.d))[0], appFrom = fw ? fw.d : from;   // 이월이 있으면 앱 줄은 그 날부터
  const inR = x => appFrom && x.d >= appFrom && x.d <= to;
  const days = (a, b) => Math.abs((new Date(a + 'T12:00:00Z') - new Date(b + 'T12:00:00Z')) / 86400000);
  const pair = (F, Ap) => {   // Ap = 앱 줄 전부 — 파일 기간 안 줄만 "앱에만"으로 셈, 기간 밖 60일 안 줄은 "날짜 다름" 짝으로만
    const f = F.map(x => ({ d: x.d, amt: R2(x.amt), note: x.note || '' })), a = Ap.map(x => ({ d: x.d, amt: R2(x.amt), id: x.id || '', note: x.note || '', inR: inR(x) })), used = new Set(), left = [], moved = [];
    f.forEach(x => { const i = a.findIndex((y, k) => !used.has(k) && y.inR && y.d === x.d && Math.abs(y.amt - x.amt) < 0.011); if (i >= 0) used.add(i); else left.push(x); });
    const onlyFile = []; left.forEach(x => { const i = a.findIndex((y, k) => !used.has(k) && Math.abs(y.amt - x.amt) < 0.011 && days(y.d, x.d) <= 60); if (i >= 0) { used.add(i); moved.push({ amt: x.amt, fileD: x.d, appD: a[i].d }); } else onlyFile.push(x); });
    return { onlyFile, onlyApp: a.filter((y, k) => !used.has(k) && y.inR).map(y => ({ d: y.d, amt: y.amt, id: y.id, note: y.note })), moved };
  };
  const I = pair(inv.filter(x => x.type !== '이월'), aInv.filter(x => x.type !== '이월')), Pm = pair(pay, aPay);
  const diff = R2(fileBal - appBalAt);
  /* 이월(전년 미수금 · BALANCE FORWARD)이 있으면 그 날 전 앱 잔액과도 대조 — 지난 기간이 맞았는지 */
  const fwd = fw && fw.d ? (() => { const app0 = R2(sumA(aInv.filter(x => x.d < fw.d)) - sumA(aPay.filter(x => x.d < fw.d))); return { d: fw.d, file: R2(fw.amt), app: app0, diff: R2(fw.amt - app0) }; })() : null;
  return { from, to, fileBal, fwd, open: (P && P.open) || [], fmt: (P && P.fmt) || 'ledger', fileHdr: last.hdr || {}, appBal, appBalAt, diff, fileInv: sumA(inv.filter(x => x.type !== '이월')), filePay: sumA(pay),
    inv: I, pay: Pm, ok: Math.abs(diff) < 0.011 && !I.onlyFile.length && !I.onlyApp.length && !Pm.onlyFile.length && !Pm.onlyApp.length };
}

/* ---------- 📨 공장마다 다른 명세서 모양 (v0.8.184 — 관리자가 보낸 실제 파일 4개로 맞춤) ----------
 *   ledger  : 위 parseFactoryStatement (Date · PAID DATE · DEPOSIT MONEY)
 *   account : "The One Corp ACCOUNT" — DATE · 물품금액 · 운임비 · SHIPPING AMOUNT · SHIP VIA · SHIP NO. · DATE · 입금 AMOUNT · BALANCE (올해 칸 + 옆에 지난 해들 칸)  예: JUDA
 *   kr      : "THE ONE 결재내역서 (YYYY년M월D일현재)" — NO · ITEM · 주문수량 · 주문금액 · TOTAL | 입금일자 · 입금금액 | 비고 "MM/DD Shipping 완료" · "YYYY/MM/DD까지총남은금액"  예: RUMINO · JINRUIJIA
 *   status  : "THE ONE ORDER STATUS" — PO 표(PO NO · ITEM · PO DATE · AMOUNT · REMARK) + PAYMENT · SHIPPING NO(AS38…) · SHIPPING DATE & FEE · BALANCE 줄  예: SHENGXING
 *   모두 parseFactoryStatement 와 같은 모양 { name, fmt, sheets: [{ year, inv, pay, hdr: { balance, asOf } }], inv, pay, warn, open } 으로 돌려줌 → compareStatement 가 그대로 씀 */
const low = v => sv(v).toLowerCase().replace(/\s+/g, ' ');
const ymd8 = v => { const s = sv(v), m = s.match(/^(20\d\d)(\d\d)(\d\d)$/); if (m) return m[1] + '-' + m[2] + '-' + m[3]; if (v instanceof Date) return dstr(v); return typeof v === 'string' && /\d[-/.]\d/.test(s) ? dstr(v) : ''; };   // 20260108 · 2026-01-08 (금액 숫자는 날짜로 보지 않음)
const moneyIn = v => { const s = sv(v); if (!s) return 0; if (typeof v === 'number') return R2(v); const m = s.split('=').pop().match(/-?[\d,]+(\.\d+)?/); return m ? R2(num(m[0].replace(/,/g, ''))) : 0; };
const finish = (o, fmt) => { const S = o.sheets[0]; S.sumInv = R2(S.inv.reduce((a, x) => a + x.amt, 0)); S.sumPay = R2(S.pay.reduce((a, x) => a + x.amt, 0)); o.inv = S.inv; o.pay = S.pay; o.warn = S.warn || []; o.fmt = fmt; return o; };
/** account — 머리글 줄에 DATE · 물품금액(또는 SHIPPING AMOUNT) · BALANCE. 칸 묶음이 여럿이면 가장 최근 날짜가 있는 묶음 */
export function parseAccountSheet(rows, name) {
  const hi = (rows || []).slice(0, 12).findIndex(r => (r || []).some(c => /물품금액|shipping amount/i.test(low(c))) && (r || []).some(c => low(c) === 'balance')); if (hi < 0) return null;
  const H = rows[hi].map(low), blocks = [];
  H.forEach((h, i) => { if (h === 'date' && /물품금액|shipping amount/.test(H[i + 1] || '') ) { const j = k => { for (let x = i; x < Math.min(H.length, i + 10); x++) if (k.test(H[x])) return x; return -1; };
    const pd = (() => { for (let x = i + 1; x < Math.min(H.length, i + 10); x++) if (H[x] === 'date') return x; return -1; })();
    blocks.push({ d: i, item: j(/물품금액/), frt: j(/운임/), amt: j(/shipping amount/), via: j(/ship via/), no: j(/ship no/), pd, pamt: j(/입금|deposit|paid amount/), bal: j(/^balance$/) }); } });
  if (!blocks.length) return null;
  const read = b => { const S = { year: '', inv: [], pay: [], hdr: { balance: null, asOf: '' }, warn: [] }; let maxD = '';
    for (let r = hi + 1; r < rows.length; r++) { const R = rows[r] || [], d = dstr(R[b.d]), t = low(R[b.d]);
      if (/^total/.test(t)) { if (b.bal >= 0 && sv(R[b.bal]) !== '') S.hdr.balance = R2(num(R[b.bal])); continue; }
      const amt = b.amt >= 0 ? R2(num(R[b.amt])) : R2(num(R[b.item]) + num(R[b.frt])), note = [b.via, b.no].filter(x => x >= 0).map(x => sv(R[x])).filter(Boolean).join(' ');
      if (d && amt) { const fwd = /미수금|이월|forward|balance/i.test(note) && !num(R[b.item]); S.inv.push(fwd ? { d, type: '이월', item: 0, frt: 0, amt, note } : { d, type: '인보이스', item: R2(num(R[b.item])) || amt, frt: R2(num(R[b.frt])), amt, note }); if (d > maxD) maxD = d; }
      const pd = b.pd >= 0 ? dstr(R[b.pd]) : '', pa = b.pamt >= 0 ? R2(num(R[b.pamt])) : 0; if (pd && pa) { S.pay.push({ d: pd, amt: pa }); if (pd > maxD) maxD = pd; }
    }
    S.maxD = maxD; S.year = maxD.substring(0, 4); S.hdr.asOf = maxD; return S; };
  const all = blocks.map(read).filter(S => S.inv.length || S.pay.length).sort((a, b) => (b.maxD || '').localeCompare(a.maxD || ''));
  if (!all.length) return null;
  return finish({ name: sv((rows[0] || []).find(c => sv(c))) || name || '', sheets: [all[0]] }, 'account');
}
/** kr — 결재내역서: 머리글 NO · TOTAL · 입금일자 · 입금금액 (구간마다 다시 나옴). 선적 = NO 가 숫자이고 TOTAL 이 있는 줄, 날짜는 그 줄의 "MM/DD Shipping", 운임은 "shipping fee … $1472.5" */
export function parseKrStatement(rows, name) {
  const isHdr = r => { const h = (r || []).map(low); return h.includes('no') && h.includes('total') && h.some(x => /입금일자|입금 일자/.test(x)); };
  if (!(rows || []).some(isHdr)) return null;
  const S = { year: '', inv: [], pay: [], hdr: { balance: null, asOf: '' }, warn: [] }; let C = null, year = '', cur = null, lastD = '';
  const yearOf = t => { const m = sv(t).match(/(20\d\d)\s*년/); return m ? m[1] : ''; };
  rows.forEach((R, r) => { R = R || []; const cells = R.map(sv), line = cells.join(' ');
    const y = yearOf(line); if (y && /현재|결재/.test(line)) year = y;
    const mB = line.match(/(20\d\d)[/.-](\d{1,2})[/.-](\d{1,2})\s*까지\s*총\s*남은\s*금액/); if (mB) { const v = cells.filter((c, i) => i > cells.findIndex(x => /까지/.test(x)) && c).map(moneyIn).filter(Boolean).pop(); if (v) { S.hdr.balance = v; S.hdr.asOf = mB[1] + '-' + mB[2].padStart(2, '0') + '-' + mB[3].padStart(2, '0'); } return; }
    if (isHdr(R)) { const h = R.map(low); C = { no: h.indexOf('no'), tot: h.indexOf('total'), pd: h.findIndex(x => /입금일자/.test(x)), pa: h.findIndex(x => /입금금액/.test(x)) }; cur = null; return; }
    if (!C) return;
    const no = sv(R[C.no]), tot = C.tot >= 0 ? R2(num(R[C.tot])) : 0;
    if (/^\d+$/.test(no) && tot) { const m = line.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*shipping/i); const d = m ? (year || S.year || '2026') + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0') : lastD; if (d) lastD = d;
      cur = { d, type: '인보이스', item: tot, frt: 0, amt: tot, note: 'NO ' + no }; S.inv.push(cur); }
    else if (cur && /shipping\s*fee/i.test(line)) { const m = line.match(/\$\s*([\d,]+(\.\d+)?)/); if (m) { cur.frt = R2(cur.frt + num(m[1].replace(/,/g, ''))); cur.item = R2(cur.amt - cur.frt); } }
    const pd = C.pd >= 0 ? dstr(R[C.pd]) : '', pa = C.pa >= 0 ? R2(num(R[C.pa])) : 0; if (pd && pa) S.pay.push({ d: pd, amt: pa });
  });
  if (!S.inv.length && !S.pay.length) return null;
  const ds = S.inv.concat(S.pay).map(x => x.d).filter(Boolean).sort(); S.year = (S.hdr.asOf || ds[ds.length - 1] || '').substring(0, 4);
  return finish({ name: sv((rows[0] || []).find(c => sv(c))) || name || '', sheets: [S] }, 'kr');
}
/** status — ORDER STATUS: PO 표 + PAYMENT / SHIPPING NO / SHIPPING DATE & FEE / BALANCE 줄. 진행 중(IN PROGRESS) PO 는 open 으로 */
export function parseStatusSheet(rows, name) {
  const R0 = rows || []; if (!R0.some(r => (r || []).some(c => /^shipping\s*no/i.test(low(c)))) || !R0.some(r => (r || []).some(c => low(c) === 'balance'))) return null;
  const S = { year: '', inv: [], pay: [], hdr: { balance: null, asOf: '' }, warn: [] }, open = []; let po = null, sh = null, tc = -1, firstBal = null, lastD = '';
  R0.forEach(R => { R = R || []; const h = R.map(low), cells = R.map(sv);
    if (h.some(x => /^po\s*\/?\s*no/.test(x)) && h.includes('remark')) { po = { no: h.findIndex(x => /^po/.test(x)), item: h.indexOf('item'), d: h.findIndex(x => /po date/.test(x)), amt: h.indexOf('amount'), rm: h.indexOf('remark') }; return; }
    if (h.some(x => /^shipping\s*no/.test(x))) { tc = h.indexOf('total'); po = null; sh = null; return; }
    if (po && cells[po.no] && /^#?\d+/.test(cells[po.no])) { const rm = cells[po.rm] || ''; if (/progress|진행|生产|未/i.test(rm)) open.push({ po: cells[po.no], item: cells[po.item] || '', d: ymd8(R[po.d]), amt: R2(num(R[po.amt])), rm }); return; }
    if (low(R[0]) === 'payment') { const d = ymd8(R.find((c, i) => i > 0 && ymd8(c))), a = R2(num(R.slice().reverse().find(c => num(c) && !ymd8(c)))); if (d && a) { S.pay.push({ d, amt: a }); lastD = d > lastD ? d : lastD; } return; }
    const bi = h.indexOf('balance'); if (bi >= 0) { const v = R.slice(bi + 1).map(num).find(x => x); if (v) { if (firstBal == null && !S.inv.length && !S.pay.length) firstBal = R2(v); S.hdr.balance = R2(v); } return; }
    if (/^[ao]s\s*\d+/i.test(cells[0])) { sh = { d: '', type: '인보이스', item: 0, frt: 0, amt: tc >= 0 ? R2(num(R[tc])) : 0, note: cells[0].replace(/\s+/g, '') }; if (sh.amt) S.inv.push(sh); return; }
    if (sh && /shipping date/i.test(cells.join(' '))) { const di = R.findIndex(c => ymd8(c)); sh.d = di >= 0 ? ymd8(R[di]) : lastD; const fee = R2(num(R[di + 1])); sh.frt = fee; sh.item = R2(sh.amt - fee); const trk = cells.find(c => /^(1Z|\d{12})/.test(c)); if (trk) sh.note += ' ' + trk; if (sh.d > lastD) lastD = sh.d; }
  });
  S.inv = S.inv.filter(x => x.d);
  const ds = S.inv.concat(S.pay).map(x => x.d).sort(); if (firstBal) S.inv.unshift({ d: ds[0] || '', type: '이월', item: 0, frt: 0, amt: firstBal, note: '처음 BALANCE' });
  if (!S.inv.length && !S.pay.length) return null;
  S.hdr.asOf = ds[ds.length - 1] || ''; S.year = S.hdr.asOf.substring(0, 4);
  const o = finish({ name: sv(cells0(R0)) || name || '', sheets: [S] }, 'status'); o.open = open; return o;
}
const cells0 = R0 => (R0.find(r => (r || []).some(c => sv(c))) || []).find(c => sv(c)) || '';
/** 아무 모양이나 — 시트마다 차례로 시도, 처음 읽힌 것 */
export function parseAnyStatement(sheets) {
  const L = parseFactoryStatement(sheets); if (L.sheets.length) { L.fmt = 'ledger'; return L; }
  for (const sh of sheets || []) for (const fn of [parseAccountSheet, parseKrStatement, parseStatusSheet]) { const o = fn(sh.rows || [], sh.name); if (o) return o; }
  return { name: '', sheets: [], inv: [], pay: [], warn: [], fmt: '' };
}
export function looksLikeAnyStatement(sheets) { return parseAnyStatement(sheets).sheets.length > 0; }
/** 이름 · 보낸 사람 · 파일 이름으로 공장 찾기 — matchFactory 가 못 찾으면 공장 이름의 특이한 단어(5자 이상)가 글 안에 들어 있는지 (THE_ONErumino 처럼 붙어 있어도) */
export function guessFactory(text, facs) {
  const hit = matchFactory(text, facs); if (hit) return hit;
  const T = sv(text).toUpperCase().replace(/[^A-Z0-9]/g, ''), GEN = /^(QINGDAO|QUINGDAO|ZHEJIANG|SUPPLY|CHAIN|CRAFT|CRAFTS|YIWU|TRADING|JEWELRY|COMPANY|LIMITED)$/;
  const L = (facs || []).filter(f => sv(f.name).toUpperCase().split(/[^A-Z0-9]+/).some(w => w.length >= 5 && !GEN.test(w) && T.includes(w)));
  return L.length === 1 ? L[0] : null;
}
