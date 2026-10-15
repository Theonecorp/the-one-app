/* v0.3.0 오더 화면 시험 — node test/t030.js (스크린샷은 test/out/) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8767', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  fs.mkdirSync(path.resolve(__dirname, 'out'), { recursive: true });
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const page = async (user) => { const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(u => { window.__MOCK_USER__ = u; }, user); await pg.goto('http://127.0.0.1:8767/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  const shot = (pg, n) => pg.screenshot({ path: path.resolve(__dirname, 'out', n + '.png'), fullPage: true });
  /* 세일즈맨: 기본 설정은 오더 꺼짐 → 탭 없음 */
  let pg = await page({ email: 'brandon@x.com', name: 'Brandon' });
  log('salesman order tab (off):', !!(await pg.$('#nav [data-go="order"]')));
  await pg.close();
  /* 관리자: 오더 켜기 */
  pg = await page({ email: 'luke@theonefl.com', name: 'Luke' });
  await pg.evaluate(() => { location.hash = '#/admin/cat'; }); await pg.waitForSelector('#ordOn'); await shot(pg, 'o0_catadmin');
  await pg.click('#ordOn'); await pg.waitForTimeout(400);
  /* 관리자가 오더 만들기 (세일즈맨 대신) */
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ');
  await pg.fill('#eStoreQ', 'ali'); await pg.waitForTimeout(150); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(200);
  log('sm auto:', await pg.$eval('#eSm', e => e.value));
  await pg.fill('#eQ1', '898000000005'); await pg.press('#eQ1', 'Enter'); await pg.waitForTimeout(150);
  await pg.fill('#eQ1', 'AHG100'); await pg.press('#eQ1', 'Enter'); await pg.press('#eQ1', 'Enter'); await pg.waitForTimeout(150);
  log('after scans N/Q:', await pg.textContent('#eN'), await pg.textContent('#eQ'));
  await pg.click('[data-ck="Jewelry"]'); await pg.waitForTimeout(100); await pg.click('[data-ck="Chains"]'); await pg.waitForTimeout(150);
  await pg.fill('[data-qi="AHG102"]', '12'); await pg.dispatchEvent('[data-qi="AHG102"]', 'change'); await pg.click('[data-dq="AHG107"][data-d="1"]'); await pg.waitForTimeout(100);
  await shot(pg, 'o1_add');
  log('N/Q/A:', await pg.textContent('#eN'), await pg.textContent('#eQ'), await pg.textContent('#eA'));
  await pg.click('[data-ev="cart"]'); await pg.waitForTimeout(150);
  await pg.fill('[data-pi="AHG102"]', '2'); await pg.dispatchEvent('[data-pi="AHG102"]', 'change'); await pg.fill('#eMemo', '금요일 배송');
  await shot(pg, 'o2_cart');
  await pg.click('#eSend'); await pg.waitForTimeout(200); await pg.click('#cfOk'); await pg.waitForTimeout(500);
  log('after send hash:', await pg.evaluate(() => location.hash), 'title:', await pg.textContent('#page h2'));
  await shot(pg, 'o3_view');
  await pg.click('#oOk'); await pg.waitForTimeout(400); log('st after ok:', await pg.textContent('#page h2 .tag'));
  await pg.click('#oDone'); await pg.waitForTimeout(150); await pg.fill('#oInv', 'a41592'); await pg.click('#oInvOk'); await pg.waitForTimeout(400);
  log('st after done:', await pg.textContent('#page h2 .tag'), 'edit btn:', !!(await pg.$('#oEdit')));
  await pg.click('#oPrint'); await pg.waitForTimeout(200); await pg.screenshot({ path: path.resolve(__dirname, 'out', 'o4_print.png') }); await pg.click('#prtClose');
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(400); await shot(pg, 'o5_list');
  log('list sent count:', await pg.textContent('#page .card h2'));
  /* 큰 오더: 1,100줄 */
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ');
  await pg.fill('#eStoreQ', '1271'); await pg.waitForTimeout(150); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(200);
  const t0 = Date.now();
  await pg.evaluate(() => { const inp = document.getElementById('eQ1'); for (let i = 0; i < 1100; i++) { inp.value = String(898000000000 + i); inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); } });
  log('1100 scans ms:', Date.now() - t0, 'N:', await pg.textContent('#eN'));
  const t1 = Date.now(); await pg.click('[data-ev="cart"]'); await pg.waitForSelector('#eCart .irow'); log('cart render ms:', Date.now() - t1);
  await pg.click('#eDraft'); await pg.waitForTimeout(600); log('big saved:', await pg.textContent('#page h2'));
  await pg.close();
  /* 세일즈맨: 오더 켜진 뒤 — 메모리 DB 는 페이지마다 새로 시작하므로 seed 를 켜진 상태로 */
  pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'Brandon' }; window.__AFTER_SEED__ = s => { s.settings[0].ordersOn = true; }; });
  await pg.goto('http://127.0.0.1:8767/test/demo.html'); await pg.waitForSelector('#nav button');
  log('salesman order tab (on):', !!(await pg.$('#nav [data-go="order"]')));
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(300); await shot(pg, 'o6_sm_list');
  await pg.click('#oNew'); await pg.waitForSelector('#eStoreQ');
  log('salesman has sm select:', !!(await pg.$('#eSm')));
  await pg.fill('#eStoreQ', 'ali'); await pg.waitForTimeout(150); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(150);
  await pg.fill('#eQ1', 'gummy'); await pg.waitForTimeout(300); await pg.click('[data-dq="GM104"][data-d="1"]'); await pg.click('[data-dq="GM104"][data-d="1"]');
  await pg.reload(); await pg.waitForSelector('#nav button'); await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(400);
  log('wip banner after reload:', !!(await pg.$('#oWip')));
  await pg.click('#oWip'); await pg.waitForTimeout(400); await pg.click('[data-ev="cart"]'); await pg.waitForTimeout(100);
  log('price input for salesman:', !!(await pg.$('[data-pi]')));
  await shot(pg, 'o7_sm_cart');
  await pg.click('#eDraft'); await pg.waitForTimeout(100); log('toast:', await pg.textContent('#toast')); await pg.waitForTimeout(400); log('sm draft:', await pg.textContent('#page h2'), 'send btn:', !!(await pg.$('#oSend')));
  log('errors:', errs); await br.close(); srv.kill();
})();
