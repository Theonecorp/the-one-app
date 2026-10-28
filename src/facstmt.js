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
