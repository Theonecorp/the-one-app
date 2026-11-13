/* v0.8.125 시험 — 🗂 담당자 메뉴 정리: 아래 메뉴는 큰 묶음(홈 · 세일 · 💵 수금 · 📚 조회 · 📦 재고) → 묶음 안 세부 화면 · 뒤로 = 묶음 → 홈
 *   담당자 홈은 4개 묶음(접수 · 출고/포장 · 수금 · 조회)으로 접힘 + 머리 숫자 · 주문 처리 칩은 단계(접수 · 출고 · 완료 · 기타) → 세부 칸 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8851', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 393, height: 860 } });
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'office@x.com', name: 'X' }; window.__AFTER_SEED__ = s => { s.users.push({ id: 'office@x.com', email: 'office@x.com', name: 'Office', role: 'manager', job: 'office', active: true }); }; });
  await pg.goto('http://127.0.0.1:8851/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  const nav = await pg.$$eval('#nav button', b => b.map(x => x.dataset.go)); log('nav:', nav.join(' '));
  if (nav.join() !== 'shome,order,hub/money,hub/look,hub/wh') errs.push('office nav should be 5 big groups, got ' + nav.join());
  /* 홈 묶음 */
  await pg.waitForSelector('.hgrp', { timeout: 8000 }).catch(() => errs.push('home groups missing'));
  const grps = await pg.$$eval('.hgrp', g => g.map(x => x.dataset.grp + (x.classList.contains('open') ? '*' : ''))); log('home groups:', grps.join(' '));
  if (grps.join() !== 'sale*,ship,money,look') errs.push('home should have 4 groups with 🛒 세일 open (v0.8.166: recv → sale)');
  await pg.waitForTimeout(1500); const sumR = await pg.textContent('#hg-sale'); log('sale summary:', sumR); if (!/신규/.test(sumR)) errs.push('sale header should show counts');
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
  await pg.click('#nav button[data-go="hub/wh"]'); await pg.waitForTimeout(400); const wh = await pg.$$eval('[data-hub]', b => b.map(x => x.dataset.hub)); log('wh hub:', wh.join(' ')); if (!wh.includes('estoque') || !wh.includes('produtos') || !wh.includes('recebimento')) errs.push('inventory hub should have estoque (v0.8.197) · produtos (v0.8.199 — replaced items) · recebimento (v0.8.200)');
  /* 주문 처리 단계 칩 */
  await pg.click('#nav button[data-go="order"]'); await pg.waitForSelector('.omenu [data-og]', { timeout: 8000 }).catch(() => errs.push('stage groups missing'));
  /* v0.8.174: 단계 단추 대신 모든 칸이 묶음(접수 · 출고 · 완료 · 기타)별로 항상 보임 */
  const stg = await pg.$$eval('.omenu [data-og]', b => b.map(x => x.dataset.og + ':' + x.querySelectorAll('[data-lf]').length)); log('groups:', stg.join(' '));
  if (stg.length !== 4) errs.push('4 stage groups expected'); if (await pg.$('[data-lg]')) errs.push('no stage toggle buttons any more');
  const all = await pg.$$eval('.omenu [data-lf]', b => b.map(x => x.dataset.lf)); if (!all.includes('pick') || !all.includes('sent') || !all.includes('inv')) errs.push('chips of every stage visible at once');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
