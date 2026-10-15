const { chromium } = require('/home/claude/node_modules/playwright');
const path = require('path');
const URL = 'http://127.0.0.1:8765/test/demo.html';
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8765', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--disable-background-networking'] });
  const errs = [];
  async function shot(name, w, user, steps) {
    const pg = await br.newPage({ viewport: { width: w, height: 1000 } });
    pg.on('pageerror', e => errs.push(name + ': ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(name + ' console: ' + m.text()); });
    pg.on('dialog', d => d.accept());
    await pg.addInitScript(u => { window.__MOCK_USER__ = u; }, user);
    await pg.goto(URL, { timeout: 15000 }); await pg.waitForTimeout(400);
    await pg.waitForSelector('#nav button', { timeout: 8000 }).catch(e => errs.push(name + ' nav: ' + e.message)); await pg.waitForTimeout(300);
    try { await steps(pg); } catch (e) { errs.push(name + ' step: ' + e.message); }
    await pg.waitForTimeout(400);
    await pg.screenshot({ path: path.resolve(__dirname, 'out', name + '.png'), fullPage: true }); await pg.close();
  }
  const fs = require('fs'); fs.mkdirSync(path.resolve(__dirname, 'out'), { recursive: true });
  const B = { email: 'brandon@x.com', name: 'Brandon' }, M = { email: 'acct@theonefl.com', name: '회계' }, L = { email: 'luke@theonefl.com', name: 'Luke Hur' };
  await shot('s1_entry', 430, B, async pg => { await pg.fill('#storeQ', 'ali'); await pg.waitForTimeout(200); await pg.click('#storeHits div'); await pg.waitForTimeout(500); await pg.fill('[data-pref="0"]', '1050'); await pg.fill('[data-pamt="0"]', '2000'); await pg.waitForTimeout(100); await pg.click('[data-pk="A10055"]'); await pg.waitForTimeout(200); await pg.click('#btnAddInv'); await pg.waitForTimeout(200); await pg.fill('[data-ino="1"]', 'A10099'); await pg.fill('[data-iamt="1"]', '1200'); await pg.evaluate(() => document.querySelector('[data-iamt="1"]').dispatchEvent(new Event('input'))); await pg.waitForTimeout(300); });
  await shot('s2_mine', 430, B, async pg => { await pg.evaluate(() => { location.hash = '#/mine'; }); await pg.waitForTimeout(500); });
  await shot('s3_ar', 430, B, async pg => { await pg.evaluate(() => { location.hash = '#/ar'; }); await pg.waitForTimeout(500); });
  await shot('s4_comm', 430, B, async pg => { await pg.evaluate(() => { location.hash = '#/mycomm'; }); await pg.waitForTimeout(500); });
  await shot('m1_verify', 430, M, async pg => { await pg.waitForTimeout(300); await pg.click('[data-vid="E1"]'); await pg.waitForTimeout(300); });
  await shot('m2_cod', 430, M, async pg => { await pg.evaluate(() => { location.hash = '#/cod'; }); await pg.waitForTimeout(500); });
  await shot('m3_arup', 430, M, async pg => { await pg.evaluate(() => { location.hash = '#/arup'; }); await pg.waitForTimeout(400); });
  await shot('b1_now', 1200, L, async pg => { await pg.waitForTimeout(400); });
  await shot('b2_pay', 1200, L, async pg => { await pg.evaluate(() => { location.hash = '#/pay'; }); await pg.waitForTimeout(600); });
  await shot('b3_ar', 1200, L, async pg => { await pg.evaluate(() => { location.hash = '#/bossar'; }); await pg.waitForTimeout(500); });
  await shot('b4_admin', 1200, L, async pg => { await pg.evaluate(() => { location.hash = '#/admin'; }); await pg.waitForTimeout(500); });
  console.log(errs.length ? errs.join('\n') : 'no page errors');
  await br.close(); srv.kill();
})();
