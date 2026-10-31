/* v0.8.147 시험 — ☰ 서랍 메뉴(묶음별 화면 · 설정 · 사용자 · 언어) · 🔍 어디서나 검색(거래처 · 아이템 · 인보이스 #) · 📷 공용 스캐너(코드 직접 입력) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8863', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 420, height: 860 } });
  const mk = async email => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'Luke Hur' }; }, { email }); await pg.goto('http://127.0.0.1:8863/test/demo.html'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(600); return pg; };

  /* ---------- 관리자: 서랍 ---------- */
  let pg = await mk('luke@theonefl.com');
  for (const id of ['hSearch', 'hScan', 'hMenu']) if (!(await pg.$('#' + id))) errs.push('header button missing: ' + id);
  await pg.click('#hMenu'); await pg.waitForSelector('#drawer.on', { timeout: 5000 });
  const secs = await pg.$$eval('#drawer .dsec > small', e => e.map(x => x.textContent.trim())); log('sections:', secs);
  if (secs.length < 3) errs.push('drawer should have grouped sections');
  const goes = await pg.$$eval('#drawer [data-dgo]', b => b.map(x => x.dataset.dgo)); log('entries:', goes.length, goes.slice(0, 8));
  if (!goes.includes('stores') || !goes.includes('invs')) errs.push('drawer should list hub screens like stores and invs');
  const foot = (await pg.textContent('#drawer .dfoot')).replace(/\s+/g, ' '); log('foot:', foot); if (!/Luke Hur/.test(foot) || !/관리자|Admin/.test(foot)) errs.push('drawer footer should show user and role');
  const langs = await pg.$$eval('#drawer .dlang button', b => b.map(x => x.textContent.trim()).join(',')); if (langs !== 'KR,EN,PT') errs.push('language switch wrong: ' + langs);
  if (!(await pg.$('#drawer #mOut'))) errs.push('sign out missing in drawer');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'drawer.png') });
  await pg.click('#drawer [data-dgo="stores"]'); await pg.waitForTimeout(700);
  if (await pg.$('#drawer.on')) errs.push('drawer should close after picking a screen'); if (!/#\/stores/.test(await pg.evaluate(() => location.hash))) errs.push('drawer entry should navigate');
  await pg.click('#hMenu'); await pg.waitForSelector('#drawer.on'); await pg.click('#dBack', { position: { x: 405, y: 300 } }); await pg.waitForTimeout(150); if (await pg.$('#drawer.on')) errs.push('backdrop should close the drawer');

  /* ---------- 🔍 어디서나 검색 ---------- */
  await pg.click('#hSearch'); await pg.waitForSelector('#gsQ', { timeout: 5000 });
  await pg.fill('#gsQ', 'ali'); await pg.waitForTimeout(500);
  const sa = await pg.$$eval('[data-gsa]', b => b.map(x => x.dataset.gsa)); log('store hits:', sa); if (!sa.length) errs.push('global search should find stores');
  await pg.fill('#gsQ', 'AHG10'); await pg.waitForTimeout(600);
  const si = await pg.$$eval('[data-gsi]', b => b.map(x => x.dataset.gsi)); log('item hits:', si); if (!si.includes('AHG100')) errs.push('global search should find items');
  await pg.fill('#gsQ', 'A-043001'); await pg.waitForTimeout(500); if (!(await pg.$('[data-gsn]'))) errs.push('invoice number should offer open');
  await pg.fill('#gsQ', 'AHG100'); await pg.waitForTimeout(600); await pg.click('[data-gsi="AHG100"]'); await pg.waitForSelector('#modal.on', { timeout: 5000 }); await pg.waitForTimeout(500);
  const sheet = (await pg.textContent('#mbox')).replace(/\s+/g, ' '); if (!/AHG100/.test(sheet) || !/#\/cat/.test(await pg.evaluate(() => location.hash))) errs.push('item hit should open the item sheet: ' + sheet.slice(0, 80));
  await pg.click('#modal .mclose'); await pg.waitForTimeout(150);

  /* ---------- 📷 스캐너 (헤드리스: 카메라 없음 → 직접 입력) ---------- */
  await pg.click('#hScan'); await pg.waitForSelector('#scanov.on', { timeout: 5000 }); await pg.waitForTimeout(800);
  for (const id of ['scFlip', 'scTorch', 'scIn', 'scUse', 'scX']) if (!(await pg.$('#' + id))) errs.push('scanner control missing: ' + id);
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'scanner.png') });
  await pg.fill('#scIn', 'ahg101'); await pg.press('#scIn', 'Enter'); await pg.waitForTimeout(800);
  if (await pg.$('#scanov.on')) errs.push('scanner should close after a code');
  const sh2 = (await pg.textContent('#mbox').catch(() => '')).replace(/\s+/g, ' '); if (!(await pg.$('#modal.on')) || !/AHG101/.test(sh2)) errs.push('scanned code should open the item sheet');
  await pg.click('#modal .mclose'); await pg.waitForTimeout(150);
  /* 재고 조회의 📷 */
  await pg.evaluate(() => { location.hash = '#/stock'; }); await pg.waitForSelector('#skScan', { timeout: 8000 });
  await pg.click('#skScan'); await pg.waitForSelector('#scanov.on'); await pg.fill('#scIn', 'AHG102'); await pg.click('#scUse'); await pg.waitForTimeout(600);
  const skq = await pg.$eval('#skQ', e => e.value); log('stock q after scan:', skq); if (skq !== 'AHG102') errs.push('stock scan should fill the search box');
  await pg.close();

  /* ---------- 세일즈맨: 서랍에는 세일즈 묶음만 · 로그아웃 ---------- */
  pg = await mk('brandon@x.com');
  await pg.click('#hMenu'); await pg.waitForSelector('#drawer.on');
  const g2 = await pg.$$eval('#drawer [data-dgo]', b => b.map(x => x.dataset.dgo)); log('salesman entries:', g2);
  if (g2.includes('admin') || g2.includes('verify')) errs.push('salesman drawer should not show staff screens'); if (!g2.includes('mysales') || !g2.includes('entry')) errs.push('salesman drawer should show sales hub screens');
  await pg.click('#drawer #mOut'); await pg.waitForSelector('#btnLogin', { timeout: 8000 }).catch(() => errs.push('sign out from drawer should reach login'));
  await pg.close();

  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL', errs); process.exit(1); } console.log('PASS');
})().catch(e => { console.error(e); process.exit(1); });
