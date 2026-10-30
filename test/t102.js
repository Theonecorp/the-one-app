/* v0.8.125 시험 — 🗂 담당자 메뉴 정리: 아래 메뉴는 큰 묶음(홈 · 세일 · 💵 수금 · 📚 조회 · 📦 재고) → 묶음 안 세부 화면 · 뒤로 = 묶음 → 홈
 *   담당자 홈은 4개 묶음(접수 · 출고/포장 · 수금 · 조회)으로 접힘 + 머리 숫자 · 주문 처리 칩은 단계(접수 · 출고 · 완료 · 기타) → 세부 칸 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8851', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 393, height: 860 } });
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'office@x.com', name: 'X' }; window.__AFTER_SEED__ = s => { s.users.push({ id: 'office@x.com', email: 'office@x.com', name: 'Office', role: 'manager', job: 'office', active: true }); }; });
  await pg.goto('http://127.0.0.1:8851/test/demo.html'); await pg.waitForSelector('#nav button');
  const nav = await pg.$$eval('#nav button', b => b.map(x => x.dataset.go)); log('nav:', nav.join(' '));
  if (nav.join() !== 'shome,order,hub/money,hub/look,hub/wh') errs.push('office nav should be 5 big groups, got ' + nav.join());
  /* 홈 묶음 */
  await pg.waitForSelector('.hgrp', { timeout: 8000 }).catch(() => errs.push('home groups missing'));
  const grps = await pg.$$eval('.hgrp', g => g.map(x => x.dataset.grp + (x.classList.contains('open') ? '*' : ''))); log('home groups:', grps.join(' '));
  if (grps.join() !== 'recv*,ship,money,look') errs.push('home should have 4 groups with intake open');
  await pg.waitForTimeout(1500); const sumR = await pg.textContent('#hg-recv'); log('intake summary:', sumR); if (!/신규/.test(sumR)) errs.push('intake header should show counts');
  const vis = await pg.$$eval('.htile', t => t.filter(x => x.offsetParent).length); log('visible tiles:', vis); if (vis > 8) errs.push('only the open group tiles should be visible');
  await pg.click('[data-ghd="ship"]'); await pg.waitForTimeout(200); if (!(await pg.$('.hgrp[data-grp="ship"].open'))) errs.push('tapping a group header should open it');
  const saved = await pg.evaluate(() => localStorage.getItem('theone.hgrp.office')); log('saved open:', saved); if (!/ship/.test(saved || '')) errs.push('open groups should be remembered');
  /* 묶음 → 세부 → 뒤로 */
  await pg.click('#nav button[data-go="hub/money"]'); await pg.waitForSelector('[data-hub]', { timeout: 5000 });
  const hub = await pg.$$eval('[data-hub]', b => b.map(x => x.dataset.hub)); log('money hub:', hub.join(' ')); if (hub.join() !== 'verify,cod,ach,bounce,credit') errs.push('money hub tiles wrong');
  await pg.click('[data-hub="verify"]'); await pg.waitForTimeout(900);
  const onTab = await pg.$$eval('#nav button.on', b => b.map(x => x.dataset.go)); log('on tab at verify:', onTab); if (!onTab.includes('hub/money')) errs.push('money tab should stay highlighted inside its screens');
  await pg.goBack(); await pg.waitForTimeout(700); let h = await pg.evaluate(() => location.hash); log('back 1:', h); if (h !== '#/hub/money') errs.push('back from a hub screen should return to the hub');
  await pg.goBack(); await pg.waitForTimeout(700); h = await pg.evaluate(() => location.hash); log('back 2:', h); if (h !== '#/shome') errs.push('back from the hub should go home');
  /* 📚 조회 · 📦 재고 */
  await pg.click('#nav button[data-go="hub/look"]'); await pg.waitForSelector('[data-hub]'); const look = await pg.$$eval('[data-hub]', b => b.map(x => x.dataset.hub)); log('look hub:', look.join(' ')); if (!look.includes('invs') || !look.includes('stores')) errs.push('lookup hub should have invoices and customers');
  await pg.click('#nav button[data-go="hub/wh"]'); await pg.waitForTimeout(400); const wh = await pg.$$eval('[data-hub]', b => b.map(x => x.dataset.hub)); log('wh hub:', wh.join(' ')); if (!wh.includes('stock') || !wh.includes('items')) errs.push('inventory hub should have stock and items');
  /* 주문 처리 단계 칩 */
  await pg.click('#nav button[data-go="order"]'); await pg.waitForSelector('[data-lg]', { timeout: 8000 }).catch(() => errs.push('stage chips missing'));
  const stg = await pg.$$eval('[data-lg]', b => b.map(x => x.dataset.lg + (x.classList.contains('on') ? '*' : ''))), sub = await pg.$$eval('.osub [data-lf]', b => b.map(x => x.dataset.lf)); log('stages:', stg.join(' '), '| sub:', sub.join(' '));
  if (stg.length !== 4) errs.push('4 stage buttons expected'); if (sub.length > 6) errs.push('only the current stage chips should show');
  await pg.click('[data-lg="ship"]'); await pg.waitForTimeout(700); const sub2 = await pg.$$eval('.osub [data-lf]', b => b.map(x => x.dataset.lf)); log('ship sub:', sub2.join(' ')); if (!sub2.includes('pick') || sub2.includes('sent')) errs.push('ship stage should show fulfillment chips only');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
