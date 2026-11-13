/* v0.8.174 시험 — 🆕 새로 나온: 주문 화면 분류 타일 맨 앞에 "새로 나온" 묶음 — 최근 30일 안에 앱에 등록된 아이템(카탈로그 줄 14번째 칸 at = 등록일)만, 새 순 · 분류 안에 들어가도 보임 · 타일은 1단계(전체)에서만 · ✨ 자주 나가는 타일은 없음
 *   ① 등록일이 5일 전인 아이템 2개 · 60일 전 1개 · 없음(옛 아이템) → 전체 타일에 "새로 나온 · 2", 누르면 그 2개만 새 순으로 · 다시 누르면 꺼짐
 *   ② 분류 타일을 누르면 묶음이 꺼지고, 분류 안에서는 타일이 없음 · 자주 나가는 타일도 없음
 *   ③ 등록일이 없는 카탈로그(옛 데이터)면 타일이 아예 안 보임 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8823', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const d = n => { const x = new Date(); x.setDate(x.getDate() - n); return (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(x)); };
  const seed = "const c0 = s.catalog.find(x => x.id === 'c0'); const rows = JSON.parse(c0.j); const AT = { AHG100: '" + d(5) + "', AHG101: '" + d(2) + "', AHG102: '" + d(60) + "' }; rows.forEach(r => { if (AT[r[0]]) { while (r.length < 14) r.push(''); r[13] = AT[r[0]]; } }); c0.j = JSON.stringify(rows);";
  const mk = async (sd) => { const pg = await (await br.newContext({ viewport: { width: 1000, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', x => x.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'X' }; if (o.sd) window.__AFTER_SEED__ = new Function('s', o.sd); }, { sd }); await pg.goto('http://127.0.0.1:8823/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
    await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pg.fill('#eStoreQ', 'ali'); await pg.waitForTimeout(250); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(900); if (await pg.$('#modal.on')) { await pg.click('#modal .mclose'); await pg.waitForTimeout(200); } return pg; };
  /* ① */
  const pg = await mk(seed);
  const tile = await pg.$eval('[data-new]', e => e.textContent.replace(/\s+/g, ' ')).catch(() => ''); log('① tile:', tile);
  if (!/새로 나온/.test(tile) || !/· 2\s*$/.test(tile.trim())) errs.push('① 새로 나온 tile with count 2 (got "' + tile + '")');
  const first = await pg.$eval('.cats button', e => e.dataset.new === '1'); if (!first) errs.push('① 새로 나온 tile is the first tile'); if (await pg.$('[data-pop]')) errs.push('① no ✨ 자주 나가는 tile');
  await pg.click('[data-new]'); await pg.waitForTimeout(400);
  const codes = await pg.$$eval('#eRes [data-gc]', e => e.map(x => x.dataset.gc)); log('① list:', codes);
  if (codes.join(',') !== 'AHG101,AHG100') errs.push('① list shows only the 2 recent items, newest first (got ' + codes.join(',') + ')');
  const head = await pg.$eval('#eRes', e => e.firstElementChild.textContent); log('① head:', head.slice(0, 80)); if (!/최근 30일/.test(head)) errs.push('① head says 최근 30일');
  if (!(await pg.$eval('[data-new]', e => e.classList.contains('on')))) errs.push('① tile highlighted while on');
  await pg.click('[data-new]'); await pg.waitForTimeout(300); if ((await pg.$$eval('#eRes [data-gc]', e => e.length)) === 2 && !(await pg.$('.cats'))) errs.push('① tapping again turns it off');
  /* ② 분류 안 */
  await pg.click('[data-new]'); await pg.waitForTimeout(200); const cats = await pg.$$eval('[data-ck]', e => e.map(x => x.dataset.ck)); log('② cats:', cats.slice(0, 3));
  await pg.click('[data-ck]'); await pg.waitForTimeout(400);
  if (await pg.$eval('[data-new]', e => e.classList.contains('on')).catch(() => false)) errs.push('② 분류 tap turns the 새로 나온 filter off');
  if (await pg.$('[data-new]')) errs.push('② 새로 나온 tile only at level 1 (none inside a category)');
  await pg.close();
  /* ③ 등록일 없는 카탈로그 */
  const p2 = await mk(''); if (await p2.$('[data-new]')) errs.push('③ no tile when nothing has a registration date'); await p2.close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
