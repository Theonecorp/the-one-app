/* v0.4.0 오더 흐름 시험 — node test/t040.js
 *  세일즈맨: 가격 · 할인 수정, 인터넷 끊긴 상태에서 저장 → 보낼 함 → 다시 연결되면 전송
 *  매니저: 가격 · 할인 변경 표시 → 픽킹 시작 → 픽 수량 → 인보이스 확정 (종류별 번호) → 백오더 → 새 오더 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8768', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  fs.mkdirSync(path.resolve(__dirname, 'out'), { recursive: true });
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await br.newContext({ viewport: { width: 430, height: 1000 } });
  const errs = [], log = (...a) => console.log(...a);
  const shot = (pg, n) => pg.screenshot({ path: path.resolve(__dirname, 'out', n + '.png'), fullPage: true });
  /* 한 페이지에서 메모리 DB 를 유지하며 사용자만 바꿈 */
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n').slice(1, 3).join(' / '))); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => {
    window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'Brandon' };
    window.__AFTER_SEED__ = s => {
      s.settings[0].ordersOn = true; s.settings[0].catStart = 'g';
      s.settings[0].invTypes = [{ c: 'A', n: '일반', start: 41600, pad: 5, match: '' }, { c: 'P', n: 'HAIR', start: 8200, pad: 6, match: 'Hair' }, { c: 'W', n: 'NEW DP', start: 1, pad: 5, match: '코드:ZZ' }];
      s.accounts.find(a => a.acct === '1111').disc = { A: 20 };
    };
  });
  await pg.goto('http://127.0.0.1:8768/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForSelector('#oNew'); await pg.click('#oNew'); await pg.waitForSelector('#eStoreQ');
  await pg.fill('#eStoreQ', 'ali'); await pg.waitForTimeout(150); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(200); await pg.waitForTimeout(700); if (await pg.$('#ssX')) { await pg.click('#ssX'); await pg.waitForTimeout(150); }
  for (const c of ['AHG100', 'AHG101', 'GM104', 'EB103']) { await pg.fill('#eQ1', c); await pg.press('#eQ1', 'Enter'); await pg.waitForTimeout(60); }
  await pg.click('[data-ev="cart"]'); await pg.waitForTimeout(150);
  await pg.fill('[data-qi="AHG100"]', '10'); await pg.dispatchEvent('[data-qi="AHG100"]', 'change');
  await pg.fill('[data-qi="GM104"]', '6'); await pg.dispatchEvent('[data-qi="GM104"]', 'change');
  await pg.fill('[data-pi="AHG100"]', '2'); await pg.dispatchEvent('[data-pi="AHG100"]', 'change'); await pg.waitForTimeout(100);
  log('disc A prefilled:', await pg.$eval('[data-disc="A"]', e => e.value));
  await pg.fill('[data-disc="A"]', '25'); await pg.dispatchEvent('[data-disc="A"]', 'change'); await pg.waitForTimeout(150);
  log('types table:', (await pg.textContent('#eTypes')).replace(/\s+/g, ' '));
  await shot(pg, 'p1_cart');
  /* 인터넷 끊고 보내기 */
  await ctx.setOffline(true);
  await pg.click('#eDraft'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(600);
  log('offline toast:', await pg.textContent('#toast'));
  log('outbox count:', await pg.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('theone.outbox.v1') || '{}')).length));
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(500); await shot(pg, 'p2_outbox');
  log('outbox card:', !!(await pg.$('#oSync')));
  await ctx.setOffline(false); await pg.evaluate(() => window.dispatchEvent(new Event('online'))); await pg.waitForTimeout(800);
  log('outbox after online:', await pg.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('theone.outbox.v1') || '{}')).length));
  /* 세일즈맨: 저장해 둔 오더를 "보낼 오더" 에서 한 번에 보냄 */
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(300); await pg.evaluate(() => { location.hash = '#/home'; }); await pg.waitForTimeout(200); await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForSelector('#oSendAll');
  await pg.click('#oSendAll'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(800); log('sent via send-all:', await pg.textContent('#toast'));
  /* 매니저로 바꿔서 (같은 메모리 DB) */
  await pg.evaluate(async () => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'Luke' }; });
  await pg.click('#hMenu'); await pg.waitForSelector('#mOut'); await pg.click('#mOut'); await pg.waitForSelector('#btnLogin'); await pg.click('#btnLogin'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(300);
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForSelector('[data-hg="sent"]'); await shot(pg, 'p3_staffhome'); await pg.click('[data-hg="sent"]'); await pg.waitForTimeout(600);
  log('mgr list:', (await pg.textContent('#page .card h2')).trim());
  const oid = await pg.$eval('[data-oid]:not([data-oid="O261014-AAAA"])', e => e.dataset.oid).catch(() => '');
  await pg.click('[data-oid="' + oid + '"]'); await pg.waitForTimeout(500);
  const alerts = await pg.$$eval('#page .alert', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  log('mgr alerts:', alerts);
  await shot(pg, 'p3_mgr_sent');
  await pg.click('#mPick'); await pg.waitForTimeout(400); await pg.click('#prtClose'); await pg.waitForTimeout(400);
  log('status after pick:', await pg.textContent('#page h2 .tag'));
  await pg.fill('[data-pq="0"]', '7'); await pg.dispatchEvent('[data-pq="0"]', 'change');
  await pg.fill('#mFind', 'EB103'); await pg.press('#mFind', 'Enter'); await pg.waitForTimeout(100);
  await pg.click('#mPickSave'); await pg.waitForTimeout(400);
  await shot(pg, 'p4_picking');
  log('sum:', (await pg.textContent('#mSum')).replace(/\s+/g, ' '));
  await pg.click('#mInv'); await pg.waitForTimeout(200); await shot(pg, 'p5_confirm'); await pg.click('#ivOk'); await pg.waitForTimeout(800);
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'p6_invoice_print.png') }); await pg.click('#prtClose'); await pg.waitForTimeout(400);
  log('after inv:', (await pg.textContent('#page .sumbox')).replace(/\s+/g, ' '));
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(300);
  await pg.click('[data-lf="bo"]'); await pg.waitForTimeout(600); log('bo list:', (await pg.textContent('#page .card h2')).trim());
  await pg.click('#page [data-go^="bo:"]'); await pg.waitForTimeout(500); await shot(pg, 'p7_bo');
  await pg.click('#bMake'); await pg.waitForTimeout(600); log('new from bo:', (await pg.textContent('#page h2')).trim());
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(300); await pg.click('[data-lf="inv"]'); await pg.waitForTimeout(600);
  log('inv list:', (await pg.textContent('#iList .kpi')).replace(/\s+/g, ' ')); await shot(pg, 'p8_invlist');
  /* 큰 오더: 1,100줄 (매니저가 만들기) */
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ');
  await pg.fill('#eStoreQ', '1271'); await pg.waitForTimeout(150); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(200); await pg.waitForTimeout(700); if (await pg.$('#ssX')) { await pg.click('#ssX'); await pg.waitForTimeout(150); }
  let t0 = Date.now();
  await pg.evaluate(() => { const inp = document.getElementById('eQ1'); for (let i = 0; i < 1100; i++) { inp.value = String(898000000000 + i); inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); } });
  log('1100 scans ms:', Date.now() - t0, 'N:', await pg.textContent('#eN'));
  t0 = Date.now(); await pg.click('[data-ev="cart"]'); await pg.waitForSelector('#eCart .irow'); log('cart render ms:', Date.now() - t0);
  await pg.click('#eSend'); await pg.waitForTimeout(150); await pg.click('#cfOk'); await pg.waitForTimeout(800);
  t0 = Date.now(); await pg.click('#mPick'); await pg.waitForTimeout(300); await pg.click('#prtClose'); await pg.waitForSelector('[data-pq="1099"]'); log('picking render ms:', Date.now() - t0);
  /* 거래처 할인 · 인보이스 종류 설정 화면 */
  await pg.evaluate(() => { location.hash = '#/admin/set'; }); await pg.waitForTimeout(500); await shot(pg, 'p9_invtypes');
  log('errors:', errs); await br.close(); srv.kill();
})();
