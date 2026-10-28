/* v0.8.101 시험 — 오너: 홈 = 경영 요약(매출 카드 먼저) · 아래 메뉴 매출 · 미수금 · 수금 현황 · 카탈로그 · 🚗 세일즈 모드(세일즈맨 코드 있으면) ↔ 🏭 경영 모드 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8821', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'own@x.com', name: 'Owner' }; try { localStorage.removeItem('theone.view.own@x.com'); } catch (e) {} window.__AFTER_SEED__ = s => { s.users.push({ id: 'own@x.com', email: 'own@x.com', name: 'Owner', role: 'owner', sm: 'SOO', active: true }); }; });
  await pg.goto('http://127.0.0.1:8821/test/demo.html'); await pg.waitForSelector('#nav button');
  const nav = await pg.$$eval('#nav button', b => b.map(x => x.dataset.go)); log('owner nav:', nav);
  if (nav[0] !== 'own' || !nav.includes('mg/sales') || !nav.includes('bossar') || !nav.includes('now') || !nav.includes('mg/fac') || nav.includes('order') || nav.includes('invs') || !nav.includes('view/salesman')) errs.push('owner nav should be dashboard · sales · A/R · collections · factories · sales-mode, without sale/invoice/store tabs');
  await pg.waitForSelector('[data-og="mg/sales"]', { timeout: 10000 }).catch(() => errs.push('dashboard did not render')); const cards = await pg.$$eval('#page .card h2', h => h.map(x => x.textContent.trim().slice(0, 14))); log('home cards:', cards);
  if (!/매출/.test(cards[1] || '') || !/현금/.test(cards[2] || '') || !/미수금/.test(cards[3] || '') || !/공장/.test(cards[4] || '') || !/비용/.test(cards[5] || '') || !/운영/.test(cards[6] || '')) errs.push('dashboard should show 매출 · 현금 · 미수금 · 공장 · 비용 · 운영 in order');
  const dash = (await pg.textContent('#page')).replace(/\s+/g, ' '); if (!/지난 기간/.test(dash) || !/작년 같은 기간/.test(dash) || !/입금 예정 체크/.test(dash) || !/60일 넘음/.test(dash) || !/커미션 예상/.test(dash) || !/하루 넘은 주문/.test(dash)) errs.push('dashboard key numbers missing');
  await pg.click('[data-op="year"]'); await pg.waitForTimeout(1500); if (!/올해/.test((await pg.textContent('#page')).slice(0, 300))) errs.push('period chip should switch to year');
  await pg.click('#nav button[data-go="mg/sales"]'); await pg.waitForTimeout(1200); if (!/매출/.test((await pg.textContent('#page')).slice(0, 400))) errs.push('sales tab should open the sales screen');
  /* 🚗 세일즈 모드 */
  await pg.click('#nav button[data-go="view/salesman"]'); await pg.waitForTimeout(1500);
  const nav2 = await pg.$$eval('#nav button', b => b.map(x => x.dataset.go)); log('sales-mode nav:', nav2);
  if (nav2[0] !== 'home' || !nav2.includes('entry') || !nav2.includes('view/owner')) errs.push('sales mode should show the salesman nav with a back-to-business tab');
  const home = (await pg.textContent('#page')).replace(/\s+/g, ' '); if (!/SOO/.test(home)) errs.push('salesman home should show the owner\'s SM code');
  await pg.click('#nav button[data-go="view/owner"]'); await pg.waitForTimeout(1500);
  const nav3 = await pg.$$eval('#nav button', b => b.map(x => x.dataset.go)); if (nav3[0] !== 'own') errs.push('business mode should return to the owner nav');
  /* 세일즈맨 코드 없는 오너 → 모드 탭 없음 */
  const pg2 = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg2.on('pageerror', e => errs.push(e.message));
  await pg2.addInitScript(() => { window.__MOCK_USER__ = { email: 'own2@x.com', name: 'O2' }; window.__AFTER_SEED__ = s => { s.users.push({ id: 'own2@x.com', email: 'own2@x.com', name: 'O2', role: 'owner', active: true }); }; });
  await pg2.goto('http://127.0.0.1:8821/test/demo.html'); await pg2.waitForSelector('#nav button'); const nav4 = await pg2.$$eval('#nav button', b => b.map(x => x.dataset.go)); if (nav4.includes('view/salesman')) errs.push('owner without SM code should not get the sales-mode tab');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
