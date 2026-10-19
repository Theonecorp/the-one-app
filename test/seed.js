/* 모의 데이터 — 화면 확인용 */
const T = (() => { const d = new Date(); return d.toISOString().substring(0, 10); })();
const ymOf = d => d.substring(0, 7);
const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().substring(0, 10); };
const rates = { a: 0.15, disc: 0.10, w: 0.10, p: 0.05, ex: 0.05, dp: 0.04, office: 0.035 };
const ent = (id, sm, acct, store, d, pays, invs, extra) => Object.assign({ id, d, ym: ymOf(d), sm, acct, store, addr: '', pays, invs, total: pays.reduce((a, p) => a + p.amt, 0), invTotal: invs.reduce((a, v) => a + v.amt, 0), mismatch: '', memo: '', repl: false, orig: '', disc: '', sb: false, rc: false, v: false, vn: '', settled: '', void: false, createdBy: 'x', createdAt: d + 'T12:00:00Z' }, extra || {});
window.__MOCK__ = true;
window.__MOCK_USER__ = window.__MOCK_USER__ || { email: 'luke@theonefl.com', name: 'Luke Hur' };
window.__MOCK_SEED__ = {
  users: [{ id: 'luke@theonefl.com', email: 'luke@theonefl.com', name: 'Luke Hur', role: 'admin', active: true }, { id: 'brandon@x.com', email: 'brandon@x.com', name: 'Brandon', role: 'salesman', sm: 'BRANDON', active: true }, { id: 'acct@theonefl.com', email: 'acct@theonefl.com', name: '회계 담당', role: 'manager', achAccess: true, active: true }],
  salesmen: [{ id: 'ALEX', code: 'ALEX', name: 'Alex', active: true, rates }, { id: 'BRANDON', code: 'BRANDON', name: 'Brandon', active: true, rates: Object.assign({}, rates, { a: 0.15 }) }, { id: 'SOO', code: 'SOO', name: 'Soo', active: true, rates: Object.assign({}, rates, { a: 0.12 }) }, { id: 'KAEL', code: 'KAEL', name: 'Kael', active: true, rates }],
  settings: [{ id: 'app', accountsVer: '1', arAsOf: day(6), discLimit: 0.2 }],
  accounts: [
    { id: '1111', acct: '1111', store: 'ALI B/S # 1', addr: '5353 N DIXIE HWY', city: 'LIGHTHOUSE POINT', state: 'FL', zip: '33064', sm: 'BRANDON', terms: 'N30' },
    { id: '1271', acct: '1271', store: 'BEAUTY 4U', addr: '177 W JOE ORR RD', city: 'CHICAGO HEIGHTS', state: 'IL', zip: '60411', sm: 'BRANDON' },
    { id: '2427', acct: '2427', store: 'J C NOVELTIES B/S', addr: '1 MAIN ST', city: 'LOUISVILLE', state: 'KY', zip: '40202', sm: 'BRANDON' },
    { id: '2478', acct: '2478', store: 'JIM DANDY MART', addr: '9 OAK AVE', city: 'LEXINGTON', state: 'KY', zip: '40502', sm: 'BRANDON' },
    { id: '3001', acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', addr: '77 ORANGE AVE', city: 'ORLANDO', state: 'FL', zip: '32801', sm: 'ALEX' },
    { id: '4572', acct: '4572', store: 'DIAMOND GIRL B/S', addr: 'B-5 UNITED', city: 'CHRISTIANSTED', state: 'VI', zip: '00820', sm: 'SOO' },
    { id: '9001', acct: '9001', store: 'OLD SHOP (NO PAY)', addr: '1 MAIN', city: 'MIAMI', state: 'FL', zip: '33101', sm: 'ALEX' }
  ],
  entries: [
    ent('E1', 'BRANDON', '1111', 'ALI B/S # 1', T, [{ m: 'CHECK', ref: '1042', amt: 1200, dep: '', mob: false }, { m: 'CASH', ref: '', amt: 300, dep: '', mob: false }], [{ no: 'A10021', t: 'A', amt: 1500, ar: true }]),
    ent('E2', 'BRANDON', '1271', 'BEAUTY 4U', day(1), [{ m: 'CHECK', ref: '2201', amt: 2400, dep: day(-5), mob: true }], [{ no: 'A10030', t: 'A', amt: 2000, ar: true }, { no: 'W10031', t: 'W', amt: 400, ar: true }], { sb: true, sbAt: day(1) }),
    ent('E3', 'BRANDON', '2427', 'J C NOVELTIES B/S', day(3), [{ m: 'CHECK', ref: '555', amt: 980, dep: '', mob: false }], [{ no: 'A10011', t: 'A', amt: 1000 }], { sb: true, rc: true, mismatch: '⚠️ 인보이스 합 $1,000.00 ≠ 받은 돈 $980.00 (차액 −$20.00)' }),
    ent('E4', 'BRANDON', '2478', 'JIM DANDY MART', day(4), [{ m: 'ZELLE', ref: 'Z-88', amt: 650, dep: '', mob: false }], [{ no: 'P10001', t: 'P', amt: 650 }], { sb: true, rc: true, v: true }),
    ent('E5', 'ALEX', '3001', 'BEAUTY EXCHANGE ORLANDO', day(2), [{ m: 'CHECK', ref: '7001', amt: 3100, dep: '', mob: false }], [{ no: 'A20001', t: 'A', amt: 3100 }], { sb: true, rc: true }),
    ent('E6', 'SOO', '4572', 'DIAMOND GIRL B/S', day(9), [{ m: 'CHECK', ref: '31', amt: 5200, dep: '', mob: false }], [{ no: 'A30001', t: 'A', amt: 5200 }], { sb: true, rc: true, v: true }),
    ent('E7', 'BRANDON', '1111', 'ALI B/S # 1', day(40), [{ m: 'CHECK', ref: '1001', amt: 900, dep: '', mob: false }], [{ no: 'A9000', t: 'A', amt: 900 }], { sb: true, rc: true, v: true, settled: 'S0' }),
    ent('E8', 'BRANDON', '1111', 'ALI B/S # 1', day(70), [{ m: 'CHECK', ref: '990', amt: 700, dep: '', mob: false }], [], { sb: true, rc: true, v: true, settled: 'S0' })
  ],
  cod: [
    { id: 'C1', d: day(2), ym: ymOf(day(2)), sm: 'BRANDON', acct: '1271', store: 'BEAUTY 4U', method: 'COD', ref: 'UPS', amt: 450, invs: [{ no: 'A10040', t: 'A', amt: 450 }], disc: '', note: '', v: false, vn: '', settled: '', void: false },
    { id: 'C2', d: day(1), ym: ymOf(day(1)), sm: 'ALEX', acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', method: 'ACH', ref: '', amt: 1875.6, invs: [{ no: 'A20010', t: 'A', amt: 1875.6 }], disc: '', note: 'Cash Pro 10/10', v: true, vn: '', settled: '', void: false }
  ],
  settlements: [{ id: 'S0', sm: 'BRANDON', day: day(20), from: day(35), to: day(21), n: 2, pay: 198.45, net: 240, office: 8.4, dp: 9.6, total: 1600, comm: { lines: [{ d: day(40), store: 'ALI B/S # 1', methods: 'CHECK', e: 900, f: 0, invs: 'A9000', P: 0, W: 0, sec: 'REG' }, { d: day(70), store: 'ALI B/S # 1', methods: 'CHECK', e: 700, f: 0, invs: '', P: 0, W: 0, sec: 'REG' }], totals: { check: 1600, cash: 0, total: 1600 }, buckets: [{ label: 'COMMISSION (A 인보이스)', base: 1600, rate: 0.15, amt: 240 }], net: 240, dp: { rate: 0.04, amt: 9.6 }, office: { rate: 0.035, amt: 8.4 }, pay: 198.45 } }],
  ar: [
    { id: 'BRANDON', sm: 'BRANDON', asOf: day(6), total: 4100, n: 3, stores: [
      { acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', total: 2300, b: [800, 0, 1500, 0, 0], invs: [{ inv: 'A10021', d: day(50), amt: 1500, bal: 1500, pdd: 20, bk: 2 }, { inv: 'A10055', d: day(10), amt: 800, bal: 800, pdd: -20, bk: 0 }], lastPaid: day(40), dormant: false, moved: '' },
      { acct: '1271', store: 'BEAUTY 4U', sm: 'BRANDON', total: 1200, b: [0, 1200, 0, 0, 0], invs: [{ inv: 'A10030', d: day(45), amt: 2000, bal: 1200, pdd: 15, bk: 1 }], lastPaid: '', dormant: false, moved: '' },
      { acct: '2478', store: 'JIM DANDY MART', sm: 'BRANDON', total: 600, b: [0, 0, 0, 0, 600], invs: [{ inv: 'A8800', d: day(200), amt: 600, bal: 600, pdd: 170, bk: 4 }], lastPaid: day(4), dormant: false, moved: 'PETER' }] },
    { id: '_all', sm: '_all', asOf: day(6), total: 9100, n: 5, noSmAmt: 0, stores: [
      { acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', total: 2300, b: [800, 0, 1500, 0, 0], invs: [{ inv: 'A10021', d: day(50), amt: 1500, bal: 1500, pdd: 20, bk: 2 }, { inv: 'A10055', d: day(10), amt: 800, bal: 800, pdd: -20, bk: 0 }], lastPaid: day(40) },
      { acct: '1271', store: 'BEAUTY 4U', sm: 'BRANDON', total: 1200, b: [0, 1200, 0, 0, 0], invs: [{ inv: 'A10030', d: day(45), amt: 2000, bal: 1200, pdd: 15, bk: 1 }], lastPaid: '' },
      { acct: '2478', store: 'JIM DANDY MART', sm: 'BRANDON', total: 600, b: [0, 0, 0, 0, 600], invs: [{ inv: 'A8800', d: day(200), amt: 600, bal: 600, pdd: 170, bk: 4 }], lastPaid: day(4) },
      { acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', sm: 'ALEX', total: 2500, b: [2500, 0, 0, 0, 0], invs: [{ inv: 'A20020', d: day(5), amt: 2500, bal: 2500, pdd: -25, bk: 0 }], lastPaid: day(2) },
      { acct: '9001', store: 'OLD SHOP (NO PAY)', sm: 'ALEX', total: 2500, b: [0, 0, 0, 0, 2500], invs: [{ inv: 'A100', d: day(500), amt: 2500, bal: 2500, pdd: 470, bk: 4 }], lastPaid: '', dormant: true }] }
  ],
  payees: [{ id: 'BRANDON', who: 'BRANDON', co: 'SNJ', kind: '커미션' }]
};
/* 아이템 목록 (오더 시험용) — 실제 Item Master 와 같은 모양으로 1,200개 */
(function () {
  const G = [['Jewelry', 'Earrings · Hoops & Pincatch', 'Aluminum', 'Gold'], ['Jewelry', 'Earrings · Hoops & Pincatch', 'Aluminum', 'Silver'], ['Jewelry', 'Chains', '14K', 'Gold'], ['Hair', 'Edge Control', 'EDGE BOOSTER', ''], ['Hair', 'Wax', 'GUMMY', '']];
  const rows = [];
  for (let i = 0; i < 1200; i++) { const g = G[i % G.length]; const code = (i % 5 === 3 ? 'EB' : i % 5 === 4 ? 'GM' : 'AHG') + String(100 + i); rows.push([code, (g[2] + ' ' + g[3] + ' ITEM ' + i).trim(), 2.5 + (i % 7) * 0.25, 4.99, String(898000000000 + i), g[0], g[1], g[2], g[3], '']); }
  /* 🙈 숨김 아이템 3개 — 목록엔 있고 세일즈맨 주문 화면에선 빠져야 함 (FLSIDE52 는 이전 시스템 숨김 기록에도 있는 코드) */
  rows.push(['AHG9001', 'ALUMINUM GOLD HIDDEN ITEM', 3, 4.99, '', 'Jewelry', 'Earrings · Hoops & Pincatch', 'Aluminum', 'Gold', '', 1]);
  rows.push(['AHG9002', 'ALUMINUM GOLD HIDDEN ITEM 2', 3, 4.99, '', 'Jewelry', 'Earrings · Hoops & Pincatch', 'Aluminum', 'Gold', '', 1]);
  rows.push(['FLSIDE52', 'FL INT #52 - BODY J - CHIN (66PC)', 198, 0, '', 'Set Orders & Displays', 'Floor Inserts', 'FL Side Insert', 'Body Jewelry', '', 0]);
  window.__MOCK_SEED__.catalog = [{ id: 'meta', ver: 'T1', count: rows.length, chunks: 1, cats: G.map(g => g.join('\u0001')), updatedAt: '2026-10-15T10:00:00Z', by: 'luke@theonefl.com' }, { id: 'c0', j: JSON.stringify(rows), n: rows.length, ver: 'T1' }];
  window.__MOCK_SEED__.catalog[0].setsVer = 'S1';
  window.__MOCK_SEED__.catalog.push({ id: 'sets', ver: 'S1', j: JSON.stringify({ 'FI-TEST01': { n: 'FLOOR INSERT TEST CZ SET', k: [['AHG100', 6], ['AHG105', 6], ['AHG110', 12]], p: 216, old: 'AHG115', st: '확정' }, 'C4-EB01': { n: 'C4 EDGE BOOSTER INSERT', k: [['EB103', 12], ['EB108', 12]] } }) });
  window.__MOCK_SEED__.orders = [{ id: 'O261014-AAAA', no: 'O261014-AAAA', d: '2026-10-14', ym: '2026-10', sm: 'ALEX', acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', st: 'sent', n: 2, qty: 30, amt: 80, memo: 'UPS 로', createdBy: 'alex@x.com', createdAt: '2026-10-14T15:00:00Z', updatedAt: '2026-10-14T15:00:00Z', sentAt: '2026-10-14T15:00:00Z' }];
  window.__MOCK_SEED__.orderLines = [{ id: 'O261014-AAAA', sm: 'ALEX', lines: [{ c: 'AHG100', d: 'Aluminum Gold ITEM 0', q: 20, p: 2.5 }, { c: 'AHG101', d: 'Aluminum Silver ITEM 1', q: 10, p: 3 }] }];
})();

if (window.__AFTER_SEED__) window.__AFTER_SEED__(window.__MOCK_SEED__);
