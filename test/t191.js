/* v0.8.186 시험 — 💵 주문 저장 뒤 "이 가게에서 받은 수금이 있나요?" → 수금 입력으로 바로 (2026-11-11 관리자: "오더 끝난 뒤 저장하고 나서 그 가게의 수금할 것이 있는지 물어보고 수금으로 바로 연결")
 *   ① 세일즈맨이 미수금 있는 가게(ALI) 주문을 저장 → 창: 가게 · 미수금 금액 · 💵 수금 입력 / 나중에
 *   ② 💵 수금 입력 → 수금 입력 화면에 그 가게(ALI · 1111)가 골라져 있음 (주문은 저장돼 있음)
 *   ③ 나중에 → 묻지 않고 홈으로 · 미수금이 없는 가게는 아예 묻지 않음 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8859', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const open = async () => { const pg = await (await br.newContext({ viewport: { width: 420, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'B' }; window.__AFTER_SEED__ = s => { s.accounts.push({ id: '7777', acct: '7777', store: 'ZERO SHOP', sm: 'BRANDON' }); }; });
    await pg.goto('http://127.0.0.1:8859/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  const order = async (pg, q, acct) => {
    await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pg.fill('#eStoreQ', q); await pg.waitForTimeout(300); await pg.click('#eStoreHits [data-ac="' + acct + '"]'); await pg.waitForTimeout(900);
    if (await pg.$('#modal.on')) { await pg.click('#modal .mclose'); await pg.waitForTimeout(300); }
    await pg.fill('#eQ1', 'AHG100'); await pg.waitForTimeout(500); await pg.click('#eRes [data-gc="AHG100"], #eRes tr[data-frow="AHG100"] td.ct'); await pg.waitForTimeout(300);
    await pg.click('#eDraft'); await pg.waitForSelector('#cfOk', { timeout: 5000 }); await pg.click('#cfOk');
  };
  /* ① ② */
  const pg = await open(); await order(pg, 'ali', '1111');
  const ask = await pg.waitForSelector('#acGo', { timeout: 8000 }).then(() => true).catch(() => false);
  const txt = ask ? (await pg.textContent('#mbox')).replace(/\s+/g, ' ') : ''; log('① ask:', ask, txt.slice(0, 160));
  if (!ask || !/받은 수금이 있나요/.test(txt) || !/ALI B\/S # 1/.test(txt) || !/미수금 \$[\d,]+\.\d\d/.test(txt)) errs.push('① after saving an order for a store with a balance → asks with the store and its balance');
  if (ask) { await pg.click('#acGo'); await pg.waitForTimeout(800); }
  const ent = await pg.evaluate(() => ({ hash: location.hash, nm: (document.querySelector('.info .nm') || {}).textContent || '', orders: Object.values(window.__MOCK_STORE__.orders || {}).filter(o => o.acct === '1111' && o.sm === 'BRANDON' && o.createdBy === 'brandon@x.com').length }));
  log('② entry:', JSON.stringify(ent));
  if (!/entry/.test(ent.hash) || !/ALI B\/S # 1/.test(ent.nm) || !/1111/.test(ent.nm)) errs.push('② 💵 → payment entry with ALI (1111) already picked');
  if (ent.orders < 1) errs.push('② the order itself was saved');
  /* ③ 나중에 */
  await order(pg, 'ali', '1111'); await pg.waitForSelector('#acNo', { timeout: 8000 }); await pg.click('#acNo'); await pg.waitForTimeout(600);
  const h3 = await pg.evaluate(() => location.hash); log('③ later →', h3); if (/entry/.test(h3)) errs.push('③ 나중에 → not the payment screen');
  await order(pg, 'zero', '7777'); await pg.waitForTimeout(1800);
  const asked0 = !!(await pg.$('#acGo')); log('③ zero-balance store asked:', asked0); if (asked0) errs.push('③ a store with no balance is not asked');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
