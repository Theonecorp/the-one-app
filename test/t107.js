/* v0.8.141 시험 — 📥 직원 재고 프로그램 내보내기(CSV: sku · aisle · in_stock) 를 올리면 통로 + 📦 재고 수량이 한 번에 · '00' 은 위치 없음
 *   주문 화면 줄 · 카드에 📦 실재고 · 🏷 아이템 관리에 📦 재고 열 · 재고 있음/부족/없음 걸러보기 · 🏭 공급업체 칸 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs'), os = require('os');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8856', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 420, height: 820 } });
  const mk = async (email, seed) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.seed) window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed }); await pg.goto('http://127.0.0.1:8856/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  /* ---------- 관리자: CSV 올리기 (직원 프로그램 모양 그대로) ---------- */
  const csv = path.join(os.tmpdir(), 'THE_ONE_inventory_test.csv');
  fs.writeFileSync(csv, 'no,sku,product_code,description,category,aisle,in_stock\n1,AHG100,AHG100,"Aluminum Gold ITEM 0",EARRING,6B,37\n2,AHG101,AHG101,"Aluminum Silver ITEM 1",EARRING,00,0\n3,AHG9001,AHG9001,"HIDDEN",EARRING,16A,5\n4,ZZZ-NOPE,ZZZ-NOPE,"not ours",X,2A,9\n');
  let pg = await mk('luke@theonefl.com');
  await pg.evaluate(() => { location.hash = '#/admin/imp'; }); await pg.waitForSelector('#fAny', { state: 'attached', timeout: 8000 });
  await pg.setInputFiles('#fAny', csv); await pg.waitForSelector('[data-ak]', { timeout: 8000 });
  const kind = await pg.$eval('[data-ak]', s => s.value); log('detected kind:', kind); if (kind !== 'loc') errs.push('inventory CSV should be detected as 📍 위치 (loc), got ' + kind);
  { const b = await pg.$('#anyGo'); const en = b && await b.isEnabled(); log('anyGo enabled:', en, 'log started:', !!(await pg.$('#anyLog .sumbox'))); if (en) await b.click(); } await pg.waitForSelector('#locGo', { timeout: 15000 }).catch(() => errs.push('location preview missing'));
  const pv = (await pg.textContent('#anyOut')).replace(/\s+/g, ' '); log('preview:', pv.slice(0, 260));
  if (!(await pg.$('#locQty'))) errs.push('preview should offer 📦 재고 수량도 맞추기'); if (!/ZZZ-NOPE/.test(pv)) errs.push('unknown code should be listed as skipped');
  await pg.click('#locGo'); await pg.waitForSelector('#cfOk', { timeout: 5000 }); await pg.click('#cfOk'); await pg.waitForTimeout(1500);
  const st = await pg.evaluate(() => { const M = window.__MOCK_STORE__; const q = c => (M.stock && M.stock[c] && M.stock[c].qty) || 0; const rows = JSON.parse(Object.values(M.catalog).find(d => d.id === 'c0').j); const loc = c => { const r = rows.find(r => r[0] === c); return r ? (r[11] || '') : null; }; return { q100: q('AHG100'), q9001: q('AHG9001'), q101: q('AHG101'), qNope: q('ZZZ-NOPE'), loc100: loc('AHG100'), loc101: loc('AHG101'), loc9001: loc('AHG9001'), logs: Object.keys(M.stockLog || {}).length }; });
  log('after import:', JSON.stringify(st));
  if (st.q100 !== 37 || st.q9001 !== 5) errs.push('stock quantities should be set from in_stock'); if (st.qNope) errs.push('unknown code must not get stock'); if (st.loc100 !== '6B' || st.loc9001 !== '16A') errs.push('aisles should be saved as locations'); if (st.loc101) errs.push('aisle 00 must mean no location');
  /* 🏷 아이템 관리 — 📦 재고 열 · 걸러보기 · 공급업체 */
  await pg.evaluate(() => { location.hash = '#/items'; }); await pg.waitForSelector('#itQ', { timeout: 8000 }); await pg.waitForTimeout(900);
  await pg.click('[data-im="instk"]'); await pg.waitForTimeout(500); const inL = await pg.evaluate(() => Array.from(document.querySelectorAll('#itList .irow .ct b')).map(b => b.textContent.trim().split(' ')[0])); log('in stock:', inL);
  if (!inL.includes('AHG100') || !inL.includes('AHG9001') || inL.includes('AHG101')) errs.push('📦 재고 있음 filter should list AHG100 and AHG9001 only');
  await pg.click('[data-im="lowstk"]'); await pg.waitForTimeout(400); const lowL = await pg.evaluate(() => Array.from(document.querySelectorAll('#itList .irow .ct b')).map(b => b.textContent.trim().split(' ')[0])); if (!lowL.includes('AHG9001') || lowL.includes('AHG100')) errs.push('⚠️ 재고 부족 should list the 5-pc item only');
  await pg.click('[data-im="all"]'); await pg.waitForTimeout(300); await pg.fill('#itQ', 'AHG100'); await pg.waitForTimeout(400); const rowT = (await pg.textContent('#itList')).replace(/\s+/g, ' '); if (!/📦 37/.test(rowT) || !/📍6B/.test(rowT)) errs.push('item row should show 📦 37 and 📍6B, got ' + rowT.slice(0, 160));
  await pg.click('[data-it="AHG100"]'); await pg.waitForSelector('#fSup', { timeout: 5000 }).catch(() => errs.push('supplier field missing in item form'));
  if (await pg.$('#fSup')) { await pg.fill('#fSup', '#CHINA2'); await pg.click('#fOk'); await pg.waitForTimeout(1200); const sup = await pg.evaluate(() => { const rows = JSON.parse(Object.values(window.__MOCK_STORE__.catalog).find(d => d.id === 'c0').j); const r = rows.find(r => r[0] === 'AHG100'); return r && r[12]; }); log('supplier saved:', sup); if (sup !== '#CHINA2') errs.push('supplier should be saved on the item row'); }
  await pg.close();
  /* ---------- 세일즈맨: 주문 화면에 📦 실재고 ---------- */
  pg = await mk('brandon@x.com', "s.stock = (s.stock || []).concat([{ id: 'AHG100', code: 'AHG100', qty: 37 }, { id: 'AHG101', code: 'AHG101', qty: 0 }, { id: 'AHG102', code: 'AHG102', qty: 4 }]);");
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pg.fill('#eStoreQ', '1271'); await pg.waitForSelector('[data-ac="1271"]'); await pg.click('[data-ac="1271"]'); await pg.waitForTimeout(1200); if (await pg.$('#modal.on')) { await pg.click('#modal .mclose'); await pg.waitForTimeout(300); }
  await pg.fill('#eQ1', 'AHG10'); await pg.waitForTimeout(900);
  const cards = await pg.evaluate(() => ['AHG100', 'AHG101', 'AHG102'].map(c => { const el = document.querySelector('[data-gc="' + c + '"] .gstk'); return el ? el.textContent + '|' + el.className : null; })); log('card stock:', cards);
  if (!cards[0] || !/37/.test(cards[0])) errs.push('card should show 📦37'); if (!cards[1] || !/✕/.test(cards[1]) || !/s0/.test(cards[1])) errs.push('out-of-stock card should show ✕ in red'); if (!cards[2] || !/slow/.test(cards[2])) errs.push('low stock card should be amber');
  if (await pg.$('.grid')) { await pg.click('#eVM'); await pg.waitForTimeout(600); }
  const rows = await pg.evaluate(() => ['AHG100', 'AHG101'].map(c => { const el = document.querySelector('[data-row="' + c + '"] .stk'); return el ? el.textContent : null; })); log('row stock:', rows);
  if (!rows[0] || !/📦 37/.test(rows[0])) errs.push('list row should show 📦 37'); if (!rows[1] || !/없음|out/.test(rows[1])) errs.push('list row should show 없음 for 0');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
