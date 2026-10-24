/* v0.8.71 시험 — 📵 오프라인 주문: 인터넷 없이 가게 고르고 담고 저장 → 폰의 보낼 함 → 인터넷 돌아오면 자동 전송
 *   + 앱 화면 파일(index.html · app.js · Firebase SDK)이 sw.js 보관본으로 인터넷 없이 열리는지 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8792', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  /* 1. 오프라인 주문 */
  let ctx = await br.newContext({ viewport: { width: 430, height: 900 } }), pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'Brandon' }; });
  await pg.goto('http://127.0.0.1:8792/test/demo.html'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(500);
  await ctx.setOffline(true); log('offline:', await pg.evaluate(() => navigator.onLine));
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ');
  await pg.fill('#eStoreQ', 'beauty 4u'); await pg.waitForTimeout(200); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(900); if (await pg.$('#ssX')) await pg.click('#ssX');
  await pg.fill('#eQ1', 'AHG100'); await pg.press('#eQ1', 'Enter'); await pg.waitForTimeout(300);
  await pg.click('#eDraft'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1200);
  const toastTxt = await pg.evaluate(() => (document.querySelector('.toast') || {}).textContent || ''); log('toast:', toastTxt);
  const out = await pg.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('theone.outbox.v1') || '{}')));
  const inDb = await pg.evaluate(ids => ids.filter(id => window.__MOCK_STORE__.orders && window.__MOCK_STORE__.orders[id]).length, out);
  log('outbox:', out, 'in server:', inDb); if (out.length !== 1 || inDb) errs.push('offline save should stay in phone outbox only');
  await ctx.setOffline(false); await pg.waitForTimeout(2500);
  const out2 = await pg.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('theone.outbox.v1') || '{}')).length);
  const inDb2 = await pg.evaluate(ids => ids.filter(id => window.__MOCK_STORE__.orders && window.__MOCK_STORE__.orders[id]).length, out);
  log('after online — outbox:', out2, 'in server:', inDb2); if (out2 || inDb2 !== 1) errs.push('should auto-send when back online');
  await ctx.close();
  /* 2. 화면 파일이 인터넷 없이 열리나 (sw.js) */
  ctx = await br.newContext({ viewport: { width: 430, height: 900 } }); pg = await ctx.newPage();
  await pg.goto('http://127.0.0.1:8792/index.html'); await pg.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => pg.reload());
  await pg.waitForTimeout(4000);
  await ctx.setOffline(true); await pg.reload({ waitUntil: 'domcontentloaded' }).catch(e => errs.push('offline reload failed: ' + e.message)); await pg.waitForTimeout(5000);
  const body = await pg.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 120)); log('offline cold open:', body);
  if (!/THE ONE/i.test(body)) errs.push('app shell did not open offline');
  await ctx.close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
