/* v0.8.150 시험 — 세일즈맨 🏠 홈 = 오늘 요약(인사 · 숫자 4개 · ✅ 오늘 할 일 · 📝 오늘 플랜 · ⚡ 바로 가기) · 🛒 세일 탭 = 새 주문 + 바로 가기 + 주문 목록
 *   관리자 아래 메뉴 "모드" = 모드만 고르는 작은 창 (서랍 아님) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8868', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 420, height: 900 } });
  const mk = async (email, seed) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'Brandon Kim' }; try { localStorage.removeItem('theone.plan.' + o.email); } catch (x) {}
    if (o.seed) window.__AFTER_SEED__ = s => { const t = new Date(), d = t.toISOString().substring(0, 10), ym = d.substring(0, 7); s.orders = [{ id: 'O-T1', no: 'O-T1', d, ym, sm: 'BRANDON', acct: '1111', store: 'ALI B/S # 1', st: 'draft', n: 1, qty: 2, amt: 20, createdAt: t.toISOString(), updatedAt: t.toISOString() }, { id: 'O-T2', no: 'O-T2', d, ym, sm: 'BRANDON', acct: '1271', store: 'BEAUTY 4U', st: 'sent', cfReq: true, n: 1, qty: 1, amt: 55, createdAt: t.toISOString(), updatedAt: t.toISOString(), sentAt: t.toISOString() }]; s.orderLines = [{ id: 'O-T1', sm: 'BRANDON', lines: [] }, { id: 'O-T2', sm: 'BRANDON', lines: [] }]; s.ar = (s.ar || []).concat([{ id: 'BRANDON', sm: 'BRANDON', asOf: d, total: 1234.5, n: 3, stores: [] }]); }; }, { email, seed }); await pg.goto('http://127.0.0.1:8868/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(600); return pg; };

  /* ---------- 세일즈맨 홈 ---------- */
  let pg = await mk('brandon@x.com', true);
  await pg.evaluate(() => { location.hash = '#/home'; }); await pg.waitForSelector('.dhead', { timeout: 8000 }); await pg.waitForTimeout(1500);
  const head = (await pg.textContent('.dhead')).replace(/\s+/g, ' '); log('head:', head.slice(0, 80)); if (!/Brandon/.test(head) || !/BRANDON/.test(head)) errs.push('home head should greet the user with the salesman code');
  const kpi = await pg.$$eval('.dk', k => k.map(x => x.querySelector('b').textContent + '|' + x.dataset.hg)); log('kpi:', kpi);
  if (kpi.length !== 4) errs.push('4 KPI tiles expected'); if (!/\$1,234\.50\|ar/.test(kpi.join(','))) errs.push('receivables KPI should read the ar doc'); if (!/^1\|order$/.test(kpi[2] || '') && !/^1\|order$/.test(kpi[2] || '')) { if (!kpi.some(x => x === '1|order')) errs.push('to-send KPI should count the draft'); }
  const todo = await pg.$$eval('#dTodo .trow', r => r.map(x => x.dataset.hg + ':' + x.querySelector('b').textContent.replace(/\s+/g, ' '))); log('todo:', todo);
  if (!todo.some(t => /^order:/.test(t) && /1/.test(t))) errs.push('todo should list orders to send'); if (!todo.some(t => /^order\/cf:/.test(t))) errs.push('todo should list the office confirmation request'); if (!todo.some(t => /^ar:/.test(t))) errs.push('todo should list receivables');
  for (const g of ['order/new', 'entry/new', 'order/credit', 'mysales', 'stores', 'cat'])   /* v0.8.187: 세일즈맨 ↩ 크레딧 = 주문처럼 담는 크레딧 (t193) */ if (!(await pg.$('.qgrid [data-hg="' + g + '"]'))) errs.push('quick action missing: ' + g);
  /* 📝 플랜 저장 → 새로 그려도 남음 */
  await pg.fill('#dPlan', '올랜도 3곳 · ALI 수금'); await pg.waitForTimeout(700);
  await pg.evaluate(() => { location.hash = '#/stores'; }); await pg.waitForTimeout(500); await pg.evaluate(() => { location.hash = '#/home'; }); await pg.waitForSelector('#dPlan', { timeout: 8000 });
  const plan = await pg.$eval('#dPlan', e => e.value); log('plan:', plan); if (plan !== '올랜도 3곳 · ALI 수금') errs.push('plan should persist');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'home_sales.png'), fullPage: true });
  /* 🛒 세일 탭 */
  await pg.click('#nav button[data-go="order"]'); await pg.waitForTimeout(1200);
  const sale = (await pg.textContent('#page')).replace(/\s+/g, ' '); log('sale:', sale.slice(0, 120));
  if (!(await pg.$('#oNew'))) errs.push('sales tab should have the new order button'); if (!(await pg.$('.qgrid.sale [data-hg="invs"]'))) errs.push('sales tab should have invoices shortcut'); if (!(await pg.$('.pgh h1'))) errs.push('sales tab should have a title head');
  if (!/확인 요청|Office asks/.test(sale)) errs.push('sales tab should show the confirmation request card'); if (!(await pg.$('#oSendAll'))) errs.push('sales tab should show the review & send card for the draft');
  await pg.click('.qgrid.sale [data-hg="invs"]'); await pg.waitForTimeout(800); if (!/#\/invs/.test(await pg.evaluate(() => location.hash))) errs.push('invoices shortcut should navigate');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'sale_tab.png') });
  await pg.close();

  /* ---------- 관리자: 모드 탭 = 작은 창 ---------- */
  pg = await mk('luke@theonefl.com');
  await pg.click('#nav button[data-go="view/menu"]'); await pg.waitForSelector('#mbox .modes [data-r]', { timeout: 5000 });
  const modes = await pg.$$eval('#mbox .modes [data-r]', b => b.map(x => x.dataset.r)); log('modes:', modes); if (!modes.includes('owner') || !modes.includes('manager') || !modes.includes('salesman')) errs.push('mode picker should list owner, manager, salesman');
  if (await pg.$('#drawer.on')) errs.push('mode tab should not open the drawer'); if (!(await pg.$('#mbox [data-j="catalog"]'))) errs.push('admin should be able to pick the staff job');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'mode_picker.png') });
  await pg.click('#mbox [data-r="salesman"]'); await pg.waitForTimeout(1200); const nav = await pg.$$eval('#nav button', b => b.map(x => x.dataset.go)); log('nav after:', nav); if (nav[0] !== 'home') errs.push('picking salesman should switch to sales mode');
  await pg.close();

  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL', errs); process.exit(1); } console.log('PASS');
})().catch(e => { console.error(e); process.exit(1); });
