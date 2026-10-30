/* v0.8.127 시험 — 🕘 주문 화면: 이 가게에 그 아이템이 언제(수량) 나갔는지 — 목록 줄 "9/16(12) · 9/06(6) · 8/02(3)" · 카드 배지 "9/16·12 +2" · 담은 줄
 *   앱 인보이스 줄 + 인보이스 안 난 주문 줄 · 인보이스가 난 주문은 두 번 안 셈 · 다른 가게 기록은 안 보임 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8853', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  const seed = `const d = new Date(); const day = n => { const x = new Date(d); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
    const A = { acct: '1271', store: 'BEAUTY 4U', sm: 'BRANDON' };
    s.invoices = (s.invoices || []).concat([
      { id: 'A77001', no: 'A77001', t: 'A', d: day(44), ym: day(44).slice(0, 7), acct: '1271', store: 'BEAUTY 4U', sm: 'BRANDON', orderId: 'OX1', order: 'OX1', total: 7.5, bal: 0, st: 'paid', lines: [{ c: 'AHG100', d: 'x', q: 3, p: 2.5 }] },
      { id: 'A77002', no: 'A77002', t: 'A', d: day(10), ym: day(10).slice(0, 7), acct: '1271', store: 'BEAUTY 4U', sm: 'BRANDON', orderId: 'OX0', order: 'OX0', total: 21, bal: 21, st: 'open', lines: [{ c: 'AHG100', d: 'x', q: 6, p: 2.5 }, { c: 'AHG101', d: 'y', q: 2, p: 3 }] },
      { id: 'A77003', no: 'A77003', t: 'A', d: day(5), ym: day(5).slice(0, 7), acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', total: 250, bal: 250, st: 'open', lines: [{ c: 'AHG100', d: 'x', q: 100, p: 2.5 }] }]);
    const o = (id, st, n, extra) => Object.assign({ id, no: id, d: day(n), ym: day(n).slice(0, 7), sm: 'BRANDON', acct: '1271', store: 'BEAUTY 4U', st, n: 1, qty: 3, amt: 7.5, createdBy: 'brandon@x.com', createdAt: day(n) + 'T15:00:00Z', updatedAt: day(n) + 'T15:00:00Z' }, extra || {});
    s.orders = (s.orders || []).concat([o('OX1', 'done', 44, { invs: ['A77001'] }), o('OX2', 'sent', 2, { qty: 12, amt: 30 })]);
    s.orderLines = (s.orderLines || []).concat([{ id: 'OX1', sm: 'BRANDON', lines: [{ c: 'AHG100', d: 'x', q: 3, p: 2.5 }] }, { id: 'OX2', sm: 'BRANDON', lines: [{ c: 'AHG100', d: 'x', q: 12, p: 2.5 }] }]);`;
  await pg.addInitScript(sd => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', sd); }, seed);
  await pg.goto('http://127.0.0.1:8853/test/demo.html#/home'); await pg.waitForSelector('#nav button');
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pg.fill('#eStoreQ', '1271'); await pg.waitForSelector('[data-ac="1271"]'); await pg.tap('[data-ac="1271"]'); await pg.waitForTimeout(1500);
  if (await pg.$('#modal.on')) { await pg.tap('#modal .mclose'); await pg.waitForTimeout(300); }
  const md = n => { const x = new Date(); x.setDate(x.getDate() - n); return String(x.getMonth() + 1).padStart(2, '0') + '/' + String(x.getDate()).padStart(2, '0'); };
  const want = md(2) + '(12) · ' + md(10) + '(6) · ' + md(44) + '(3)';
  /* v0.8.132: 담는 동안 가게 칸은 한 줄 · 검색어가 있으면 분류 타일 숨김 */
  const h0 = await pg.evaluate(() => ({ slim: document.getElementById('eHead').classList.contains('slim'), store: Math.round(document.querySelector('.estore').getBoundingClientRect().height), cats: getComputedStyle(document.querySelector('.ecard .cats')).display }));
  log('head before search:', JSON.stringify(h0)); if (!h0.slim || h0.store > 48) errs.push('store card should be one slim line while adding items (' + h0.store + 'px)'); if (h0.cats === 'none') errs.push('category tiles should show when not searching');
  /* 카드 보기 — 배지 */
  await pg.fill('#eQ1', 'AHG10'); await pg.waitForTimeout(600);
  const h1 = await pg.evaluate(() => getComputedStyle(document.querySelector('.ecard .cats')).display); log('cats while searching:', h1); if (h1 !== 'none') errs.push('category tiles should hide while a search term is typed');
  await pg.fill('#eQ1', ''); await pg.waitForTimeout(400); if ((await pg.evaluate(() => getComputedStyle(document.querySelector('.ecard .cats')).display)) === 'none') errs.push('tiles should come back when the search is cleared');
  await pg.fill('#eQ1', 'AHG10'); await pg.waitForTimeout(600);
  const badge = await pg.$eval('[data-gc="AHG100"] .ghist', e => [e.textContent, e.title]).catch(() => null); log('card badge:', badge, 'want', md(2) + '·12 +2');
  if (!badge || badge[0] !== '🕘 ' + md(2) + '·12 +2') errs.push('card badge should be last date·qty +2');
  if (!badge || badge[1] !== want) errs.push('badge title should list all three: ' + want + ' got ' + (badge && badge[1]));
  const b101 = await pg.$eval('[data-gc="AHG101"] .ghist', e => e.textContent).catch(() => null); log('AHG101 badge:', b101); if (b101 !== '🕘 ' + md(10) + '·2') errs.push('AHG101 badge should be ' + md(10) + '·2');
  if (await pg.$('[data-gc="AHG102"] .ghist')) errs.push('never-ordered item must have no badge');
  /* 목록 보기 — 한 줄 */
  await pg.tap('#eVM'); await pg.waitForTimeout(500);
  const line = await pg.$eval('[data-row="AHG100"] .hist', e => e.textContent).catch(() => null); log('list line:', line);
  if (line !== '🕘 ' + want) errs.push('list row should read "🕘 ' + want + '", got ' + line);
  if (/100/.test(line || '')) errs.push('another store\'s 100 pcs must not show');
  /* 담은 줄에도 */
  await pg.tap('[data-dq="AHG100"][data-d="1"]'); await pg.waitForTimeout(300);
  if (await pg.$('#modal.on')) { await pg.tap('#modal .mclose'); await pg.waitForTimeout(300); } await pg.tap('[data-ev="cart"]'); await pg.waitForTimeout(600);
  const cart = await pg.$eval('#eCart [data-row="AHG100"] .hist', e => e.textContent).catch(() => null); log('cart line:', cart); if (cart !== '🕘 ' + want) errs.push('cart row should show history too, got ' + cart);
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
