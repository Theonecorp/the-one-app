/* v0.8.148 시험 — 📍 통로별 재고: KPI(사용 중인 통로 · 배치된 상품) · 통로 없음 경고 → 아이템 noloc · 지도(통로 카드)/목록 · 상태 · 정렬
 *   통로 카드 → 그 통로 아이템(위치 순 · 상태 칩) · 폰은 카드 줄(.crow) · 컴퓨터는 표 · 아이템 창의 📍 통로 변경 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8865', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const seed = s => {
    const rows = JSON.parse(s.catalog[1].j); const loc = { AHG100: '04B-01', AHG101: '04B-02', AHG102: '04B-03', AHG105: '04B-04', AHG106: '16A-01', AHG107: '16A-02' };
    rows.forEach(r => { if (loc[r[0]]) { while (r.length < 12) r.push(r.length === 10 ? 0 : ''); r[11] = loc[r[0]]; } }); s.catalog[1].j = JSON.stringify(rows);
    s.stock = [['AHG100', 456], ['AHG101', 0], ['AHG102', 5], ['AHG105', 264], ['AHG106', 0], ['AHG107', 30]].map(x => ({ id: x[0], code: x[0], qty: x[1], at: '2026-10-30T00:00:00Z' }));
  };
  const mk = async (w) => { const pg = await br.newPage({ viewport: { width: w, height: 900 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(f => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', f); }, '(' + seed.toString() + ')(s)'); await pg.goto('http://127.0.0.1:8865/test/demo.html'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(500); return pg; };

  /* ---------- 폰 ---------- */
  let pg = await mk(420);
  await pg.evaluate(() => { location.hash = '#/stock/aisle'; }); await pg.waitForSelector('[data-sta]', { timeout: 8000 });
  const kpi = (await pg.textContent('#skBody .kpi')).replace(/\s+/g, ' '); log('kpi:', kpi);
  if (!/2/.test(kpi) || !/6/.test(kpi)) errs.push('KPI should show 2 aisles in use and 6 items placed: ' + kpi);
  const ban = (await pg.textContent('#skNoLoc').catch(() => '')).replace(/\s+/g, ' '); log('banner:', ban); if (!/통로 없음/.test(ban)) errs.push('no-aisle banner missing');
  const cards = await pg.$$eval('[data-sta]', c => c.map(x => x.dataset.sta + ':' + x.textContent.replace(/\s+/g, ' ').trim().slice(0, 60))); log('aisle cards:', cards);
  if (cards.length !== 2 || !cards[0].startsWith('04B') || !/재고 없음 1/.test(cards[0]) || !/725/.test(cards[0])) errs.push('aisle card 04B should show 4 items, 1 out, stock 725');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'aisle_map.png') });
  /* 정렬 · 상태 */
  await pg.selectOption('#skAsort', 'qty'); await pg.waitForTimeout(300); const first = await pg.$eval('[data-sta]', c => c.dataset.sta); if (first !== '04B') errs.push('sort by stock should put 04B first');
  await pg.selectOption('#skAst', 'ok'); await pg.waitForTimeout(300); if (await pg.$('[data-sta]')) errs.push('status OK filter should hide aisles with out-of-stock items'); await pg.selectOption('#skAst', 'all'); await pg.waitForTimeout(300);
  /* 목록 모드 */
  await pg.click('[data-sam="list"]'); await pg.waitForTimeout(300); if (!(await pg.$('#skBody table.dt tr[data-sta]'))) errs.push('list mode should be a table'); await pg.click('[data-sam="map"]'); await pg.waitForTimeout(300);
  /* 통로 안 아이템 — 폰 카드 줄 */
  await pg.click('[data-sta="04B"]'); await pg.waitForSelector('[data-sis]', { timeout: 5000 });
  const rows = await pg.$$eval('.crow[data-sti]', r => r.map(x => x.dataset.sti)); log('04B rows:', rows); if (rows.join(',') !== 'AHG100,AHG101,AHG102,AHG105') errs.push('aisle list should be card rows in location order');
  const badges = await pg.$$eval('.crow .sbadge', b => b.map(x => x.className.replace('sbadge ', ''))); log('badges:', badges); if (badges.join(',') !== 'ok,out,low,ok') errs.push('status badges wrong');
  await pg.click('[data-sis="out"]'); await pg.waitForTimeout(300); const outRows = await pg.$$eval('.crow[data-sti]', r => r.length); if (outRows !== 1) errs.push('out filter should leave 1 row');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'aisle_list.png') });
  /* 📍 통로 변경 */
  await pg.click('.crow[data-sti="AHG101"]'); await pg.waitForSelector('#skLoc', { timeout: 8000 }); await pg.click('#skLoc'); await pg.waitForSelector('#skLocIn');
  await pg.fill('#skLocIn', '16A-05'); await pg.click('#skLocOk'); await pg.waitForTimeout(1500);
  const moved = await pg.evaluate(() => { const C = window.__MOCK_STORE__.catalog; const c0 = C && (C.c0 || Object.values(C).find(x => x.id === 'c0')); const rows = JSON.parse(c0.j); const r = rows.find(x => x[0] === 'AHG101'); return r && r[11]; }); log('moved AHG101 →', moved); if (moved !== '16A-05') errs.push('aisle change should save the new location');
  await pg.click('#skABack'); await pg.waitForSelector('[data-sta]'); const c16 = await pg.$eval('[data-sta="16A"]', c => c.textContent.replace(/\s+/g, ' ')); if (!/상품 3/.test(c16)) errs.push('16A should now have 3 items: ' + c16);
  /* 통로 없음 → 아이템 noloc */
  await pg.click('#skNoLoc'); await pg.waitForTimeout(1200); const h = await pg.evaluate(() => location.hash); log('noloc hash:', h); if (!/items\/noloc/.test(h)) errs.push('banner should open items without location');
  const nl = await pg.$$eval('#itList [data-it]', r => r.map(x => x.dataset.it)); if (nl.includes('AHG100') || !nl.length) errs.push('noloc list should exclude placed items');
  await pg.close();

  /* ---------- 컴퓨터: 통로 안 아이템은 표 ---------- */
  pg = await mk(1100);
  await pg.evaluate(() => { location.hash = '#/stock/aisle:04B'; }); await pg.waitForSelector('[data-sis]', { timeout: 8000 });
  if (!(await pg.$('#skBody table.dt tr[data-sti]'))) errs.push('desktop aisle list should be a table'); if (await pg.$('.crow')) errs.push('desktop should not use card rows');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'aisle_desktop.png') });
  /* 조회 탭도 폰이 아니면 표 · 상태 열 */
  await pg.evaluate(() => { location.hash = '#/stock/find'; }); await pg.waitForSelector('#skQ'); await pg.waitForTimeout(800);
  if (!(await pg.$('#skRes .sbadge'))) errs.push('find tab should show status badges');
  await pg.close();

  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL', errs); process.exit(1); } console.log('PASS');
})().catch(e => { console.error(e); process.exit(1); });
