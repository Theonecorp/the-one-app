/* v0.8.114 시험 — ✅ 주문 확인에서 수량 0 은 줄이 남음(✕ 로만 빠짐 · 저장 땐 0 줄 제외) · 세일즈맨 메뉴에 정산서 없음 · 📦 재고: 수기 입고 → 재고 · 실사 조정 · 인보이스 발행 시 차감 · 팩킹 리스트 파서 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8830', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 430, height: 1000 } });
  const mk = async (email, seed) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.seed) window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed }); await pg.goto('http://127.0.0.1:8830/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  const txt = async (pg, q) => ((await pg.textContent(q).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  /* ① 세일즈맨 — 주문 확인에서 0 */
  let pg = await mk('brandon@x.com');
  let nav = await pg.$$eval('#nav button', b => b.map(x => x.dataset.go)); log('salesman nav:', nav.join(' ')); if (nav.includes('mycomm')) errs.push('salesman nav should not have 정산서'); if (nav.includes('stock')) errs.push('salesman should not have stock tab');
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pg.fill('#eStoreQ', '1271'); await pg.waitForSelector('[data-ac="1271"]'); await pg.click('[data-ac="1271"]'); await pg.waitForTimeout(1200);
  if (await pg.$('#ssX')) { await pg.click('#ssX'); await pg.waitForTimeout(300); }
  await pg.fill('#eQ1', 'AHG10'); await pg.waitForTimeout(500); await pg.click('[data-gc="AHG100"]'); await pg.waitForTimeout(400); await pg.click('[data-gc="AHG100"]'); await pg.waitForTimeout(400); await pg.click('[data-gc="AHG101"]'); await pg.waitForTimeout(400);
  for (let i = 0; i < 4; i++) { await pg.click('[data-gc="AHG101"]'); await pg.waitForTimeout(400); }
  log('grid qty:', await pg.textContent('[data-gq="AHG100"]'), await pg.textContent('[data-gq="AHG101"]'));
  await pg.click('[data-ev="cart"]'); await pg.waitForSelector('#eCart [data-row="AHG100"]');
  await pg.fill('#eCart [data-qi="AHG100"]', '0'); await pg.dispatchEvent('#eCart [data-qi="AHG100"]', 'change'); await pg.waitForTimeout(300);
  const zero = await pg.evaluate(() => { const r = document.querySelector('#eCart [data-row="AHG100"]'); return r ? { cls: r.className, val: r.querySelector('[data-qi]').value, n: document.querySelectorAll('#eCart [data-row]').length } : null; }); log('zero row:', JSON.stringify(zero));
  if (!zero) errs.push('zero-qty line should stay in the cart'); else if (!/zero/.test(zero.cls) || zero.n !== 2) errs.push('zero row should be marked and both rows kept');
  const cnt = await txt(pg, '#eCnt'); log('cnt:', cnt); if (cnt !== '1') errs.push('line count should count non-zero lines only, got ' + cnt); if (zero && zero.val !== '0') errs.push('zero row input should show 0');
  await pg.click('#eDraft'); await pg.waitForSelector('#cfOk', { timeout: 3000 }).then(() => pg.click('#cfOk')).catch(() => {}); await pg.waitForTimeout(1500);
  const saved = await pg.evaluate(() => { const L = Object.values(window.__MOCK_STORE__.orderLines || {}); const o = L.find(x => x.lines.some(l => l.c === 'AHG101' && l.q === 5)); const ob = JSON.parse(localStorage.getItem('theone.outbox') || localStorage.getItem('theone.order.out') || '{}'); return { fs: o ? o.lines.map(l => l.c + ':' + l.q) : null, outbox: Object.values(ob).map(x => (x.lines || []).map(l => l.c + ':' + l.q)) }; }); log('saved:', JSON.stringify(saved));
  const savedLines = saved.fs || (saved.outbox.find(x => x.some(s => /AHG101:5/.test(s))) || null);
  if (!savedLines) errs.push('order should be saved'); else if (savedLines.some(s => /AHG100/.test(s))) errs.push('zero line should not be saved');
  await pg.close();
  /* ② 관리자 — 📦 재고 수기 입고 · 실사 · 인보이스 차감 */
  pg = await mk('luke@theonefl.com', "s.orders[0].st = 'picked'; s.orders[0].cfOk = true; s.orderLines[0].lines.forEach(l => { l.pq = l.q; l.ok = true; l.t = 'A'; });");
  nav = await pg.$$eval('#nav button', b => b.map(x => x.dataset.go)); if (!nav.includes('hub/wh')) errs.push('admin nav should have the inventory group');   // v0.8.135: 📦 재고 묶음
  await pg.evaluate(() => { location.hash = '#/stock/recv'; }); await pg.waitForSelector('#rvC', { timeout: 8000 }).catch(() => errs.push('receive tab missing'));
  await pg.fill('#rvFrom', 'SHENGXING CNTR'); await pg.fill('#rvC', 'AHG100'); await pg.fill('#rvQ', '50'); await pg.click('#rvAdd'); await pg.waitForTimeout(200); await pg.fill('#rvC', 'AHG101'); await pg.fill('#rvQ', '10'); await pg.press('#rvQ', 'Enter'); await pg.waitForTimeout(200); await pg.fill('#rvC', 'ZZZ999'); await pg.fill('#rvQ', '3'); await pg.click('#rvAdd'); await pg.waitForTimeout(300);
  const rv = await txt(pg, '#skBody'); log('recv:', rv.slice(0, 160)); if (!/3줄/.test(rv) || !/63/.test(rv) || !/목록에 없는 코드/.test(rv)) errs.push('receive list should show 3 lines · 63 pcs · unknown warning');
  await pg.click('[data-rvx="2"]'); await pg.waitForTimeout(200);
  await pg.click('#rvSave'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1500);
  let st = await pg.evaluate(() => { const s = window.__MOCK_STORE__; return { a: s.stock && s.stock.AHG100 && s.stock.AHG100.qty, b: s.stock && s.stock.AHG101 && s.stock.AHG101.qty, rc: Object.values(s.receipts || {}).map(r => [r.from, r.n, r.qty]), lg: Object.values(s.stockLog || {}).length }; }); log('after receipt:', JSON.stringify(st));
  if (st.a !== 50 || st.b !== 10 || st.rc.length !== 1 || st.rc[0][2] !== 60 || st.lg !== 2) errs.push('receipt should add stock and log');
  const lt = await txt(pg, '#skBody'); if (!/SHENGXING CNTR/.test(lt) || !/\+50/.test(lt)) errs.push('history tab should list the receipt and moves');
  /* 실사 */
  await pg.evaluate(() => { location.hash = '#/stock/find'; }); await pg.waitForSelector('#skQ', { timeout: 8000 }); await pg.fill('#skQ', 'AHG100'); await pg.waitForTimeout(600);
  const fr = await txt(pg, '#skRes'); log('find:', fr.slice(0, 100)); if (!/AHG100/.test(fr) || !/50/.test(fr)) errs.push('find should show on-hand 50');
  await pg.click('[data-sti="AHG100"]'); await pg.waitForSelector('#skCnt'); await pg.fill('#skCnt', '45'); await pg.fill('#skWhy', '세어 봄'); await pg.click('#skSave'); await pg.waitForTimeout(1000);
  st = await pg.evaluate(() => window.__MOCK_STORE__.stock.AHG100.qty); if (st !== 45) errs.push('count should set stock to 45, got ' + st);
  /* 인보이스 발행 → 차감 (AHG100 20 · AHG101 10) */
  await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#mInv', { timeout: 8000 }); await pg.click('#mInv'); await pg.waitForSelector('#ivOk'); await pg.click('#ivOk'); await pg.waitForTimeout(2000);
  st = await pg.evaluate(() => { const s = window.__MOCK_STORE__; return { a: s.stock.AHG100.qty, b: s.stock.AHG101.qty, inv: Object.values(s.stockLog).filter(x => x.kind === 'inv').map(x => x.code + ':' + x.delta + '→' + x.after) }; }); log('after invoice:', JSON.stringify(st));
  if (st.a !== 25 || st.b !== 0 || st.inv.length !== 2) errs.push('invoice should deduct stock');
  await pg.evaluate(() => { document.getElementById('prt').classList.remove('on'); location.hash = '#/stock/low'; }); await pg.waitForTimeout(1200); const low = await txt(pg, '#skBody'); if (!/AHG101/.test(low)) errs.push('low tab should list AHG101 at 0');
  /* 파서 */
  const P = await pg.evaluate(async () => { const M = await import('/src/stock.js'); const by = { AHG100: { c: 'AHG100', d: 'a' }, AHG101: { c: 'AHG101', d: 'b' } }; const h = M.parsePacking([['PACKING LIST'], ['Item Code', 'Description', 'CTN', 'QTY'], ['AHG100', 'x', 2, 240], ['ahg101', 'y', 1, '1,200'], ['NEW1', 'z', 1, 5]], by); const n = M.parsePacking([['AHG100', 12], ['AHG101', 3], ['AHG100', 8]], by); return { h: h.lines.map(l => l.c + ':' + l.q + ':' + l.ok), hu: h.unknown, hh: h.hdr, n: n.lines.map(l => l.c + ':' + l.q) }; }); log('parser:', JSON.stringify(P));
  if (P.h.join() !== 'AHG100:240:true,AHG101:1200:true,NEW1:5:false' || P.hu.join() !== 'NEW1' || !P.hh || P.hh.qty !== 'QTY') errs.push('header packing list parse wrong'); if (P.n.join() !== 'AHG100:20,AHG101:3') errs.push('headerless packing list parse wrong');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
