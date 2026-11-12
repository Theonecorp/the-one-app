/* v0.8.196 시험 — 🗄 단종 폴더 주얼리는 주얼리(A) · 인보이스에 "DISCONTINUE" 대신 Level 2 제품 라인 · 💍/🧴 픽킹 리스트 두 장 (2026-11-12 관리자)
 *   ① 픽킹 리스트: 주얼리(AHG100 · 단종 GRILLZ — 옛 주문 줄에 P 로 잡혀 있어도)와 그 외 제품(EB103 · 단종 EDGE BOOSTER BOX)이 💍 JEWELRY 1/2 · 🧴 OTHER PRODUCTS 2/2 두 장
 *   ② 인보이스 확정: 단종 GRILLZ 는 A 인보이스, 단종 EDGE BOOSTER BOX 는 P 인보이스 · 줄의 제품 라인(g)은 Level 2 이름 (GRILLZ · EDGE BOOSTER BOX)
 *   ③ 인쇄된 인보이스에 "DISCONTINU" 글자가 없음 · 묶음 머리에 GRILLZ
 *   ④ 이미 발행된 옛 인보이스(g 가 <DISCONTINUE ITEM>)도 인쇄 때 GRILLZ 로 찍힘
 *   ⑤ 한 종류만 있는 주문은 한 장 (머리에 💍 JEWELRY) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8883', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const open = async (lines, st) => {
    const pg = await br.newPage({ viewport: { width: 1100, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; window.__AFTER_SEED__ = s => {
      const c0 = s.catalog.find(x => x.id === 'c0'), rows = JSON.parse(c0.j);
      rows.push(['GZGT01', 'GRILLZ GOLD TOP 01', 5, 0, '', 'Other', '<DISCONTINUE ITEM>', 'GRILLZ', 'GRILLZ', '']);
      rows.push(['EBTCSBOX', 'EB EXTRA STRENGTH 0.85OZ (1BOX/48PC)', 119.52, 0, '', 'Other', '<DISCONTINUE ITEM>', 'EDGE BOOSTER BOX', 'UNIT (T&C', '']);
      c0.j = JSON.stringify(rows); s.catalog[0].ver = 'T213'; c0.ver = 'T213';
      Object.assign(s.orders[0], { st: o.st, picker: 'luke@theonefl.com', pickerName: 'L', cfOk: true });
      s.orderLines[0].lines = o.lines;
      (s.invoices = s.invoices || []).push({ id: 'A-043001', no: 'A-043001', t: 'A', acct: s.orders[0].acct, store: s.orders[0].store, sm: s.orders[0].sm, d: '2026-11-01', ym: '2026-11', lines: [{ c: 'GZGT01', d: 'GRILLZ GOLD TOP 01', q: 2, p: 5, lp: 5, g: '<DISCONTINUE ITEM>' }], qty: 2, sub: 10, list: 10, disc: 0, total: 10, bal: 10, st: 'open', terms: 'N30' }); }; }, { lines, st });
    await pg.goto('http://127.0.0.1:8883/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
    return pg;
  };
  const L = (pq) => [{ c: 'AHG100', d: 'ITEM 0', q: 5, p: 2.5, t: 'A' }, { c: 'GZGT01', d: 'GRILLZ GOLD TOP 01', q: 2, p: 5, t: 'P' }, { c: 'EB103', d: 'EDGE BOOSTER', q: 4, p: 3.25, t: 'P' }, { c: 'EBTCSBOX', d: 'EB EXTRA STRENGTH BOX', q: 1, p: 119.52, t: 'P' }].map(l => pq ? Object.assign(l, { pq: l.q, ok: true }) : l);
  /* ① */
  const a = await open(L(false), 'pick');
  await a.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await a.waitForSelector('#mPickPrint', { timeout: 8000 }); await a.waitForTimeout(500);
  await a.click('#mPickPrint'); await a.waitForSelector('#prt.on'); await a.waitForTimeout(300);
  const parts = await a.evaluate(() => [...document.querySelectorAll('#prtbody .pk')].map(p => ({ part: (p.querySelector('.pkpart') || {}).textContent || '', codes: [...p.querySelectorAll('tbody tr:not(.pktype):not(.pkfam):not(.fin) td:nth-child(3)')].map(x => x.textContent.trim()) })));
  log('① picking parts:', JSON.stringify(parts));
  if (parts.length !== 2) errs.push('① two picking pages');
  else {
    if (!/JEWELRY/.test(parts[0].part) || !/1 \/ 2/.test(parts[0].part) || parts[0].codes.sort().join(' ') !== 'AHG100 GZGT01') errs.push('① page 1 💍 JEWELRY 1/2 = AHG100 + discontinued GRILLZ');
    if (!/OTHER PRODUCTS/.test(parts[1].part) || !/2 \/ 2/.test(parts[1].part) || parts[1].codes.sort().join(' ') !== 'EB103 EBTCSBOX') errs.push('① page 2 🧴 OTHER PRODUCTS 2/2 = EB103 + discontinued EDGE BOOSTER BOX');
  }
  await a.close();
  /* ② ③ */
  const b = await open(L(true), 'picked');
  await b.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await b.waitForSelector('#mInv', { timeout: 8000 }); await b.waitForTimeout(400);
  await b.click('#mInv'); await b.waitForSelector('#ivOk'); await b.click('#ivOk'); await b.waitForTimeout(1800);
  const prt = await b.evaluate(() => { const x = document.getElementById('prtbody'); return x ? { txt: x.textContent, heads: [...x.querySelectorAll('.ivgh')].map(h => h.textContent.trim()) } : { txt: '', heads: [] }; });
  log('③ invoice group heads:', JSON.stringify(prt.heads));
  if (/DISCONTINU/i.test(prt.txt)) errs.push('③ printed invoice never says DISCONTINUE');
  if (!prt.heads.some(h => /GRILLZ/.test(h))) errs.push('③ GRILLZ product line head');
  if (await b.$('#prt.on')) await b.click('#prtClose');
  const V = await b.evaluate(() => Object.values(window.__MOCK_STORE__.invoices).filter(v => v.orderId === 'O261014-AAAA').map(v => ({ t: v.t, lines: v.lines.map(l => l.c + ':' + l.g) })));
  log('② invoices:', JSON.stringify(V));
  const A = V.find(v => v.t === 'A'), P = V.find(v => v.t === 'P');
  if (!A || !A.lines.includes('GZGT01:GRILLZ')) errs.push('② discontinued GRILLZ goes on the A (jewelry) invoice with product line GRILLZ');
  if (!P || !P.lines.includes('EBTCSBOX:EDGE BOOSTER BOX')) errs.push('② discontinued EDGE BOOSTER BOX goes on the P invoice with product line EDGE BOOSTER BOX');
  /* ④ */
  await b.evaluate(() => { const x = document.getElementById('prtbody'); if (x) x.innerHTML = ''; location.hash = '#/invs'; }); await b.waitForSelector('#iList', { timeout: 8000 }); await b.waitForTimeout(600);
  const row = await b.$('[data-go="inv:A-043001"]'); if (row) { await row.click(); await b.waitForSelector('#idPrint', { timeout: 6000 }).catch(() => {}); }
  const pbtn = await b.$('#idPrint'); if (pbtn) { await pbtn.click(); await b.waitForTimeout(900); }
  const old = !!row;
  const prt2 = await b.evaluate(() => { const x = document.getElementById('prtbody'); return x ? { txt: x.textContent, heads: [...x.querySelectorAll('.ivgh')].map(h => h.textContent.trim()) } : null; });
  log('④ old invoice print:', JSON.stringify(prt2 && prt2.heads), 'button:', !!pbtn, old);
  if (!prt2 || !prt2.heads.length) errs.push('④ old invoice prints');
  else { if (/DISCONTINU/i.test(prt2.txt)) errs.push('④ old invoice print has no DISCONTINUE'); if (!prt2.heads.some(h => /GRILLZ/.test(h))) errs.push('④ old invoice groups under GRILLZ'); }
  await b.close();
  /* ⑤ */
  const c = await open([{ c: 'AHG100', d: 'ITEM 0', q: 5, p: 2.5, t: 'A' }, { c: 'GZGT01', d: 'GRILLZ', q: 2, p: 5, t: 'A' }], 'pick');
  await c.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await c.waitForSelector('#mPickPrint', { timeout: 8000 }); await c.waitForTimeout(400);
  await c.click('#mPickPrint'); await c.waitForSelector('#prt.on'); await c.waitForTimeout(300);
  const one = await c.evaluate(() => [...document.querySelectorAll('#prtbody .pk')].map(p => (p.querySelector('.pkpart') || {}).textContent || ''));
  log('⑤ one-type order:', JSON.stringify(one)); if (one.length !== 1 || !/JEWELRY/.test(one[0]) || /\//.test(one[0])) errs.push('⑤ single page marked JEWELRY (no 1/2)');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
