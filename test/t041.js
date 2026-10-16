/* v0.5.0 시험 — 사진 카드 담기 · 수량 패드 · 세트(구성 보기 · 세트로/풀어서 담기) · 손님 보기 · 새 인보이스 번호 · 세트 픽킹 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8769', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  fs.mkdirSync(path.resolve(__dirname, 'out'), { recursive: true });
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); const errs = [], log = (...a) => console.log(...a);
  pg.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n')[1])); pg.on('dialog', d => d.accept());
  const shot = n => pg.screenshot({ path: path.resolve(__dirname, 'out', n + '.png'), fullPage: true });
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'Luke' }; window.__AFTER_SEED__ = s => { s.settings[0].ordersOn = true; }; });
  await pg.goto('http://127.0.0.1:8769/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ');
  await pg.fill('#eStoreQ', 'ali'); await pg.waitForTimeout(150); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(200);
  await shot('g0_cats');
  await pg.click('[data-ck="Jewelry"]'); await pg.waitForTimeout(200);
  await pg.click('[data-gc="AHG100"]'); await pg.click('[data-gc="AHG100"]'); await pg.click('[data-gc="AHG101"]'); await pg.waitForTimeout(100);
  log('card qty AHG100:', await pg.textContent('[data-gq="AHG100"]'), 'N:', await pg.textContent('#eN'));
  await pg.click('[data-gm="AHG100"]'); log('after minus:', await pg.textContent('[data-gq="AHG100"]'));
  await pg.click('[data-gq="AHG100"]'); await pg.waitForSelector('#qpV'); await pg.click('[data-qp="24"]'); await pg.click('#qpOk'); await pg.waitForTimeout(100);
  log('after pad:', await pg.textContent('[data-gq="AHG100"]'));
  await shot('g1_grid');
  /* 세트 */
  await pg.click('[data-cp="0"]'); await pg.waitForTimeout(100);
  await pg.fill('#eQ1', 'FI-TEST'); await pg.waitForTimeout(300);
  log('set card kit badge:', await pg.textContent('[data-gc="FI-TEST01"] .gkit'));
  await pg.click('[data-gc="FI-TEST01"] .gkit'); await pg.waitForSelector('#kSet'); await shot('g2_kit'); await pg.click('#kSet'); await pg.waitForTimeout(100);
  await pg.fill('#eQ1', 'AHG115'); await pg.press('#eQ1', 'Enter'); await pg.waitForTimeout(100);
  await pg.waitForTimeout(500); log('old code → new set qty:', await pg.evaluate(() => JSON.parse(localStorage.getItem('theone.order.wip')).lines.find(l => l.c === 'FI-TEST01').q));
  await pg.fill('#eQ1', 'C4-EB01'); await pg.waitForTimeout(300); await pg.click('[data-gc="C4-EB01"] .gkit'); await pg.waitForSelector('#kAll'); await pg.click('#kAll'); await pg.waitForTimeout(100);
  await pg.waitForTimeout(500); log('kit spread EB103:', await pg.evaluate(() => (JSON.parse(localStorage.getItem('theone.order.wip')).lines.find(l => l.c === 'EB103') || {}).q));
  /* 손님 보기 */
  await pg.fill('#eQ1', ''); await pg.click('[data-ck="Jewelry"]').catch(() => {}); await pg.waitForTimeout(200);
  await pg.click('#eShow'); await pg.waitForSelector('#viewer'); await pg.click('#vR'); await pg.click('#vA'); await pg.click('#vP'); await shot('g3_show'); await pg.click('#vX');
  await pg.click('[data-ev="cart"]'); await pg.waitForTimeout(200); await shot('g4_cart');
  log('types:', (await pg.textContent('#eTypes')).replace(/\s+/g, ' '));
  await pg.click('#eSend'); await pg.waitForTimeout(150); await pg.click('#cfOk'); await pg.waitForTimeout(800);
  await pg.click('#mPick'); await pg.waitForTimeout(500); await pg.screenshot({ path: path.resolve(__dirname, 'out', 'g5_pickprint.png'), fullPage: true }); await pg.click('#prtClose'); await pg.waitForTimeout(300);
  await pg.click('#mInv'); await pg.waitForTimeout(200); await pg.click('#ivOk'); await pg.waitForTimeout(900); await pg.screenshot({ path: path.resolve(__dirname, 'out', 'g6_inv.png'), fullPage: true }); await pg.click('#prtClose'); await pg.waitForTimeout(300);
  log('invoices:', (await pg.textContent('#page .sumbox')).replace(/\s+/g, ' '));
  /* 번호 단계 넘김 */
  log('fmtNo:', await pg.evaluate(async () => { const m = await import('/src/invoicing.js').catch(() => null); return m ? [1, 99999, 100000, 199998, 199999].map(n => m.fmtNo({ c: 'G' }, n)).join(' ') : 'skip'; }));
  await pg.evaluate(() => { location.hash = '#/admin/set'; }); await pg.waitForTimeout(600); await shot('g7_invtypes');
  await pg.evaluate(() => { location.hash = '#/admin/cat'; }); await pg.waitForTimeout(600); await pg.fill('#setQ', 'FI'); await pg.waitForTimeout(700); await shot('g8_sets');
  log('errors:', errs); await br.close(); srv.kill();
})();
