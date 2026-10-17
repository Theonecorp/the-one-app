/* ============================================================
 *  커미션 계산 — 세일즈맨 앱 정산서 · 루크 정산 탭이 같은 함수를 씁니다
 *  입력: 방문(entries) + COD/카드/ACH(cod) 문서, 세일즈맨 요율, 설정
 *  구역: REG(A) · P · SPECIAL(EXCHANGE 가게) · DISC(할인 초과) · NEWDP(W)
 * ============================================================ */
import { R2, num } from './ui.js';

export const RATE_DEFAULT = { a: 0.15, disc: 0.10, w: 0.10, p: 0.05, ex: 0.05, dp: 0.04, office: 0.035 };
export const RATE_LABELS = [['a', 'A 인보이스 (기본)'], ['disc', '할인 20% 초과'], ['w', 'W 인보이스'], ['p', 'P 인보이스'], ['ex', 'EXCHANGE'], ['dp', 'DP 공제'], ['office', 'OFFICE 공제']];
export function commSettings(settings) {
  const s = settings || {};
  return {
    DISC_LIMIT: s.discLimit != null ? Number(s.discLimit) : 0.20,
    keywords: String(s.specialKeywords || 'BEAUTY EXCHANGE, BEAUTY EXCAHNGE').split(',').map(x => x.trim().toUpperCase()).filter(Boolean),
    SPECIAL_TITLE: s.specialTitle || 'BEAUTY EXCHANGE'
  };
}
export function ratesOf(sm) { const r = Object.assign({}, RATE_DEFAULT, (sm && sm.rates) || {}); Object.keys(r).forEach(k => { r[k] = Number(r[k]) > 1 ? Number(r[k]) / 100 : Number(r[k]) || 0; }); return r; }

/** 인보이스 종류 → 커미션 칸 (A · P · W · CM)
 *  새 앱 인보이스 (G00001, JA00001 …) 는 관리 → 설정의 인보이스 종류에 적힌 칸으로, 옛 SmartBee 번호 (A4xxxx, P-00xxxx, W…, CM…) 는 앞글자로 */
let NEW_TYPES = [];
export function setInvTypeMap(types) { NEW_TYPES = (types || []).map(t => ({ re: new RegExp('^' + t.c + '[A-Z]?\\d{5}$'), comm: t.comm || 'A' })); }
export function invType(no) {
  const s = String(no || '').toUpperCase().trim();
  for (const t of NEW_TYPES) if (t.re.test(s)) return t.comm === 'CM' ? 'CM' : t.comm;
  if (/^CM/.test(s)) return 'CM'; if (/^P/.test(s)) return 'P'; if (/^W/.test(s)) return 'W'; return 'A';
}

let STORE_OF = null;
/** 다른 가게 코드 → 가게 이름 찾기 (boss.js 가 S.accounts 로 등록) */
export function setStoreLookup(fn) { STORE_OF = fn; }
/**
 * 방문(entry) → 정산 줄 여러 개.
 * 옛 앱(smRowsForPay_)과 같은 규칙: 체크에 🏬 다른 가게 인보이스가 섞여 있으면 그 가게마다 자기 줄(ID@계정코드)로 빼고,
 * 수금한 가게(홈) 줄 금액 = 받은 돈 − 다른 가게 인보이스 합. 체크 총액은 그대로입니다.
 * (EXCHANGE 같은 가게 이름 기준 요율이 가게마다 따로 적용됩니다)
 */
export function linesOfEntry(e) {
  const others = (e.invs || []).filter(i => i.acct && i.acct !== e.acct);
  if (!others.length) return [lineOfEntry(e)];
  const groups = {}; others.forEach(i => { (groups[i.acct] = groups[i.acct] || []).push(i); });
  const otherTot = R2(others.reduce((a, i) => a + num(i.amt), 0));
  const home = lineOfEntry(Object.assign({}, e, { invs: (e.invs || []).filter(i => !i.acct || i.acct === e.acct) }));
  /* 홈 줄의 받은 돈을 줄임 — 캐쉬 먼저 남기고 체크에서 뺌 (옛 앱: 금액 한 덩어리) */
  let cut = otherTot; const ce = Math.min(home.e, cut); home.e = R2(home.e - ce); cut = R2(cut - ce); home.f = R2(Math.max(0, home.f - cut));
  home.multi = true;
  const out = [home];
  Object.keys(groups).forEach(acct => {
    const L = lineOfEntry(Object.assign({}, e, { id: e.id + '@' + acct, acct, store: (groups[acct][0].store) || (STORE_OF && STORE_OF(acct)) || ('계정 ' + acct), invs: groups[acct], disc: '' }));
    const amt = R2(groups[acct].reduce((a, i) => a + num(i.amt), 0));
    L.e = amt; L.f = 0; L.key = e.id; L.ids = [e.id]; L.other = true; L.memo = '↳ ' + (e.store || '') + ' 에서 수금 · collected at ' + (e.store || '');
    out.push(L);
  });
  return out;
}
/** 방문(entry) → 정산 줄 (한 줄) */
export function lineOfEntry(e) {
  const pays = e.pays || [], invs = e.invs || [];
  const L = { key: e.id, ids: [e.id], src: 'FIELD', d: e.d, store: e.store, acct: e.acct, disc: e.disc == null || e.disc === '' ? '' : Number(e.disc),
    e: 0, f: 0, methods: [], invs: [], A: 0, P: 0, W: 0, CM: 0, no: {}, blank: {}, hasAlloc: false, memo: e.memo || '', v: e.v, rc: e.rc, sb: e.sb, repl: !!e.repl };
  pays.forEach(p => { const a = num(p.amt); if (p.m === 'CASH') L.f += a; else L.e += a; if (p.m && !L.methods.includes(p.m)) L.methods.push(p.m); });
  invs.forEach(i => { const t = i.t || invType(i.no), a = num(i.amt); if (i.no) { L.invs.push(i.no); L.no[t] = true; if (!a) L.blank[t] = true; } if (a) { L[t] += a; L.hasAlloc = true; } });
  L.e = R2(L.e); L.f = R2(L.f);
  return L;
}
/** COD · 카드 · ACH → 정산 줄 */
export function lineOfOther(o) {
  const L = { key: o.id, ids: [o.id], src: o.method === 'ACH' ? 'ACH' : o.method === 'CREDIT CARD' ? 'CARD' : 'COD', d: o.d, store: o.store, acct: o.acct, disc: o.disc == null || o.disc === '' ? '' : Number(o.disc),
    e: R2(num(o.amt)), f: 0, methods: [o.method], invs: [], A: 0, P: 0, W: 0, CM: 0, no: {}, blank: {}, hasAlloc: false, memo: o.note || '', v: o.v, rc: true, sb: true, repl: false };
  (o.invs || []).forEach(i => { const t = i.t || invType(i.no), a = num(i.amt); if (i.no) { L.invs.push(i.no); L.no[t] = true; if (!a) L.blank[t] = true; } if (a) { L[t] += a; L.hasAlloc = true; } });
  return L;
}
export function checkLine(L) {
  const got = R2(L.e + L.f);
  const out = { got, alloc: 0, wFix: R2(L.W), mismatch: false, derived: false, blocked: false, why: '' };
  if (!L.hasAlloc) { out.wFix = Math.max(0, Math.min(R2(got - (L.A + L.P + L.CM)), got)); return out; }
  const alloc = R2(L.A + L.P + L.W + L.CM); out.alloc = alloc;
  if (Math.abs(alloc - got) <= 0.01) { out.wFix = Math.max(0, Math.min(R2(got - (L.A + L.P + L.CM)), got)); return out; }
  out.mismatch = true;
  const blankOther = !!(L.blank.A || L.blank.P || L.blank.CM), rest = R2(got - (L.A + L.P + L.CM));
  if (L.no.W && !blankOther && rest >= -0.005 && rest <= got + 0.005) { out.derived = true; out.wFix = Math.max(0, Math.min(rest, got)); out.why = 'A·P·CM 은 적혀 있어 W 를 계산해 넣었습니다'; }
  else { out.blocked = true; out.wFix = 0; out.why = blankOther ? '인보이스 번호는 있는데 금액이 비어 있어 계산할 수 없습니다' : '받은 돈과 인보이스 합이 달라 어느 숫자가 맞는지 알 수 없습니다'; }
  return out;
}
export function secOf(L, cs) {
  const up = String(L.store || '').toUpperCase();
  const hasW = L.hasAlloc ? L.W > 0 : L.invs.some(x => /^W/i.test(x));
  const noA = L.hasAlloc ? L.A === 0 : !L.invs.some(x => /^A/i.test(x));
  if (cs.keywords.some(k => k && up.includes(k))) return 'SPECIAL';
  if (L.disc !== '' && Number(L.disc) > cs.DISC_LIMIT + 1e-9) return 'DISC';
  if (hasW && noA) return 'NEWDP';
  return 'REG';
}
/**
 * 정산서 계산. lines = 줄 목록(이미 조건 필터된 것), rate = ratesOf(sm), cs = commSettings()
 * 반환: { lines(표시용, W 분리), totals, buckets, net, dp, office, pay, bad, skipped }
 */
/**
 * 공제(디덕션) · 캐쉬 보관 적용 — 옛 대시보드와 같은 순서: NET − 공제 = NET PAYMENT → DP · OFFICE 는 NET PAYMENT 기준 → TOTAL → − CASH(보관) = FINAL PAY
 *  ded = [{ id, acct, store, why, total, used, per, remaining, apply, start, invs }], cashKeep = true/false
 */
export function applyDed(c, ded, cashKeep) {
  const list = (ded || []).map(d => Object.assign({}, d, { apply: R2(Math.max(0, Math.min(Number(d.apply) || 0, d.remaining))) }));
  let amt = R2(list.reduce((a, d) => a + d.apply, 0));
  if (amt > c.net) { /* NET 을 넘지 않게 — 앞에서부터 줄임 */ let over = R2(amt - Math.max(0, c.net)); for (let i = list.length - 1; i >= 0 && over > 0; i--) { const cut = Math.min(list[i].apply, over); list[i].apply = R2(list[i].apply - cut); over = R2(over - cut); } amt = R2(list.reduce((a, d) => a + d.apply, 0)); }
  c.ded = { list, amt };
  c.netPay = R2(c.net - amt);
  c.dp.amt = R2(c.netPay * c.dp.rate); c.office.amt = R2(c.netPay * c.office.rate);
  c.pay = R2(c.netPay - c.dp.amt - c.office.amt);
  c.cashKeep = cashKeep ? R2(c.totals.cash) : 0;
  c.finalPay = R2(c.pay - c.cashKeep);
  return c;
}
export function computeComm(linesIn, rate, cs) {
  const disp = [], bad = [], skipped = [];
  linesIn.forEach(L0 => {
    const L = Object.assign({}, L0);
    L.sec = secOf(L, cs);
    const ck = checkLine(L);
    const got = ck.got; let wFix = R2(ck.wFix);
    if (ck.mismatch) {
      L.mismatch = true; L.allocWas = ck.alloc; L.wWas = R2(L.W); L.derived = ck.derived; L.blocked = ck.blocked;
      bad.push({ key: L.key, d: L.d, store: L.store, got, alloc: ck.alloc, A: R2(L.A), P: R2(L.P), W: R2(L.W), CM: R2(L.CM), derived: ck.derived, blocked: ck.blocked, fixed: wFix, why: ck.why, src: L.src });
      if (ck.blocked) { skipped.push({ key: L.key, d: L.d, store: L.store, acct: L.acct, methods: L.methods.join(', '), got, alloc: ck.alloc, invs: L.invs.join(','), why: ck.why, src: L.src }); return; }
    }
    const splitable = L.sec === 'REG' && !L.blocked;
    if (splitable && wFix > 0.005 && wFix < got - 0.005) {
      const a1 = Object.assign({}, L), a2 = Object.assign({}, L);
      a1.e = R2(Math.max(0, L.e - wFix)); a1.f = L.f;
      if (L.e < wFix) { a1.e = 0; a1.f = R2(Math.max(0, L.e + L.f - wFix)); }
      a1.W = 0; a1.sec = 'REG'; a1.part = 'A'; a1.invs = L.invs.filter(x => !/^W/i.test(x));
      a2.e = R2(got - (a1.e + a1.f)); a2.f = 0; a2.P = 0; a2.CM = 0; a2.W = wFix; a2.sec = 'NEWDP'; a2.part = 'W'; a2.invs = L.invs.filter(x => /^W/i.test(x));
      disp.push(a1); disp.push(a2);
    } else { if (splitable && wFix >= got - 0.005 && wFix > 0.005) L.sec = 'NEWDP'; L.W = wFix; disp.push(L); }
  });
  const tot = { e: 0, f: 0, P: 0 }, sec = { SPECIAL: 0, DISC: 0, NEWDP: 0 };
  disp.forEach(L => { tot.e += L.e; tot.f += L.f; tot.P += L.P; if (sec[L.sec] !== undefined) sec[L.sec] += L.e + L.f - L.P; });
  const gTotal = R2(tot.e + tot.f), gP = R2(tot.P), gEx = R2(sec.SPECIAL), gDisc = R2(sec.DISC), gW = R2(sec.NEWDP);
  const gA = R2(gTotal - gP - gEx - gDisc - gW);
  const buckets = [
    { k: 'p', label: 'EDGE & KEY (P 인보이스)', base: gP, rate: rate.p },
    { k: 'ex', label: cs.SPECIAL_TITLE, base: gEx, rate: rate.ex },
    { k: 'disc', label: 'DISCOUNT ' + Math.round(cs.DISC_LIMIT * 100) + '% 초과', base: gDisc, rate: rate.disc },
    { k: 'w', label: 'NEW DP (W 인보이스)', base: gW, rate: rate.w },
    { k: 'a', label: 'COMMISSION (A 인보이스)', base: gA, rate: rate.a }
  ];
  let net = 0; buckets.forEach(b => { b.amt = R2(b.base * b.rate); net += b.amt; }); net = R2(net);
  const dp = R2(net * rate.dp), office = R2(net * rate.office);
  disp.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
  return { lines: disp, totals: { check: R2(tot.e), cash: R2(tot.f), total: gTotal }, buckets, net, netPay: net, ded: { list: [], amt: 0 }, dp: { rate: rate.dp, amt: dp }, office: { rate: rate.office, amt: office },
           pay: R2(net - dp - office), cashKeep: 0, finalPay: R2(net - dp - office), bad, skipped, skippedAmt: R2(skipped.reduce((a, s) => a + s.got, 0)) };
}
export const SEC_LABEL = { REG: 'A', SPECIAL: 'EX', DISC: 'DISC', NEWDP: 'NEW DP' };
