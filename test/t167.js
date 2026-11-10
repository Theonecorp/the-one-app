/* v0.8.175 시험 — 🧭 데스크탑(1200px+) 고정 서랍 · 🗂 관리자 분류 순서(▲ ▼) · [DISPLAYS, GIFT & SUPPLY] 타일 색 · 자리
 *   ① 1200px 이상: ☰ 서랍이 왼쪽에 고정(#drawer.dock · 너비 260 · body.dock) · 본문 · 머리띠가 그만큼 오른쪽 · 서랍 줄을 누르면 이동하고 켜진 줄이 바뀜 · ☰ 를 누르면 고정 끔(팝업) → 다시 누르면 고정
 *      430px: 고정 없음 · ☰ 는 팝업(배경 #dBack)
 *   ② 관리자 🗂 분류 탭(#/catmg/tree): 1단계 줄마다 ▲ ▼ · ▼ 를 누르면 settings.app.catOrder['L1'] 에 순서가 저장되고 주문 화면 분류 타일이 그 순서 · 디자인 담당에게는 🗂 탭 없음
 *   ③ 주문 화면 타일: [DISPLAYS, GIFT & SUPPLY] 는 k-disp 색 · <DISCONTINUE ITEM> 바로 앞(끝에서 두 번째) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8832', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const seed = "const c0 = s.catalog.find(x => x.id === 'c0'); const rows = JSON.parse(c0.j); rows.push(['GIFTBAG1', 'GIFT BAG SMALL', 0.5, 0, '', 'Other', '[DISPLAYS, GIFT & SUPPLY]', 'BAG', 'SMALL', '', 0, ''], ['CHEM1', 'EDGE CONTROL 4oz', 4, 0, '', 'Other', '[CHEMICAL]', 'EDGE', 'EDGE', '', 0, ''], ['OLD1', 'OLD STYLE RING', 1, 0, '', 'Jewelry', '<DISCONTINUE ITEM>', 'RING', 'OLD', '', 0, '']); c0.j = JSON.stringify(rows); c0.n = rows.length; const meta = s.catalog.find(x => x.id === 'meta'); meta.count = rows.length; meta.cats = meta.cats.concat(['Other\\u0001[DISPLAYS, GIFT & SUPPLY]\\u0001BAG\\u0001SMALL', 'Other\\u0001[CHEMICAL]\\u0001EDGE\\u0001EDGE', 'Jewelry\\u0001<DISCONTINUE ITEM>\\u0001RING\\u0001OLD']);";
  const open = async (email, w, h, job) => { const pg = await (await br.newContext({ viewport: { width: w, height: h } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', (o.job ? 'let u = s.users.find(x => x.id === "' + o.email + '"); if (!u) { u = { id: "' + o.email + '", email: "' + o.email + '", name: "X", active: true }; s.users.push(u); } u.role = "manager"; u.job = "' + o.job + '";' : '') + o.seed); }, { email, job, seed });
    await pg.goto('http://127.0.0.1:8832/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(400); return pg; };
  const dinfo = pg => pg.evaluate(() => { const d = document.getElementById('drawer'); const r = d ? d.getBoundingClientRect() : {}; return { dock: !!(d && d.classList.contains('dock')), on: !!(d && d.classList.contains('on')), w: Math.round(r.width || 0), bodyDock: document.body.classList.contains('dock'), pageLeft: Math.round(document.getElementById('page').getBoundingClientRect().left), hdrLeft: Math.round(document.querySelector('header').getBoundingClientRect().left), onItem: [...document.querySelectorAll('#drawer [data-dgo].on')].map(b => b.dataset.dgo), back: !!document.getElementById('dBack') && getComputedStyle(document.getElementById('dBack')).display !== 'none' }; });
  /* ① 데스크탑 */
  const pc = await open('luke@theonefl.com', 1600, 900);
  let d = await dinfo(pc); log('① desktop:', JSON.stringify(d));
  if (!d.dock || !d.on || d.w !== 260 || !d.bodyDock || d.pageLeft !== 260 || d.hdrLeft !== 260) errs.push('① drawer docked at the left, 260px, page and header shifted (got ' + JSON.stringify(d) + ')');
  await pc.click('#drawer [data-dgo="admin"]'); await pc.waitForTimeout(500); d = await dinfo(pc);
  if (!/#\/admin/.test(await pc.evaluate(() => location.hash)) || d.onItem.join() !== 'admin' || !d.dock) errs.push('① a docked row navigates and gets highlighted, dock stays (got ' + JSON.stringify(d) + ')');
  await pc.click('#hMenu'); await pc.waitForTimeout(400); d = await dinfo(pc); if (d.dock || !d.on || !d.back || d.pageLeft !== 0) errs.push('① ☰ on desktop undocks and opens the popup once (got ' + JSON.stringify(d) + ')');
  await pc.click('#dBack'); await pc.waitForTimeout(300); d = await dinfo(pc); if (d.on || d.pageLeft !== 0) errs.push('① popup closes, no dock');
  await pc.click('#hMenu'); await pc.waitForTimeout(400); d = await dinfo(pc); if (!d.dock || d.pageLeft !== 260) errs.push('① ☰ again re-docks');
  /* ② 관리자 분류 순서 */
  await pc.evaluate(() => { location.hash = '#/catmg/tree'; }); await pc.waitForSelector('[data-tmd]', { timeout: 8000 }).catch(() => errs.push('② tree tab has ▲ ▼ buttons'));
  if (await pc.$('[data-tmd]')) {
    await pc.waitForSelector('[data-tin="Jewelry"], [data-tin]'); const groups = await pc.$$eval('[data-tin]', e => e.map(x => x.dataset.tin)); log('② groups:', groups.join(' '));
    await pc.click('[data-tin="Jewelry"]'); await pc.waitForTimeout(600);
    const before = await pc.$$eval('[data-tin]', e => e.map(x => x.dataset.tin)); log('② L1 before:', before.join(' '));
    await pc.click('[data-tmd="' + before[0] + '"]'); await pc.waitForTimeout(900);
    const after = await pc.$$eval('[data-tin]', e => e.map(x => x.dataset.tin)); log('② L1 after ▼:', after.join(' '));
    if (after[1] !== before[0] || after[0] !== before[1]) errs.push('② ▼ moves the first level-1 folder down one place');
    const saved = await pc.evaluate(() => (window.__MOCK_STORE__.settings.app || {}).catOrder); log('② saved catOrder:', JSON.stringify(saved));
    if (!saved || !saved.L1 || saved.L1.indexOf(before[0]) < saved.L1.indexOf(before[1])) errs.push('② order saved in settings.app.catOrder.L1 (global level-1 order, moved name after its neighbour)');
    /* 주문 화면 타일이 그 순서 */
    await pc.evaluate(() => { location.hash = '#/order/new'; }); await pc.waitForSelector('#eStoreQ'); await pc.fill('#eStoreQ', 'ali'); await pc.waitForTimeout(250); await pc.click('#eStoreHits [data-ac]'); await pc.waitForTimeout(900); if (await pc.$('#modal.on')) { await pc.click('#modal .mclose'); await pc.waitForTimeout(200); }
    const tiles = await pc.$$eval('.cats button[data-ck]', e => e.map(x => [x.dataset.ck, x.className])); const names = tiles.map(t => t[0]); log('③ tiles:', names.join(' | '));
    const jew = names.filter(n => after.includes(n)); if (jew.length >= 2 && (jew[0] !== after[0] || jew[1] !== after[1])) errs.push('② order-screen tiles follow the saved order (got ' + jew.slice(0, 3).join(' | ') + ')');
    /* ③ DISPLAYS 타일 */
    const disp = tiles.find(t => t[0] === '[DISPLAYS, GIFT & SUPPLY]'); if (!disp || !/k-disp/.test(disp[1])) errs.push('③ [DISPLAYS, GIFT & SUPPLY] tile has the k-disp color');
    if (names[names.length - 1] !== '<DISCONTINUE ITEM>' || names[names.length - 2] !== '[DISPLAYS, GIFT & SUPPLY]') errs.push('③ DISPLAYS tile is second to last, before <DISCONTINUE ITEM> (got … ' + names.slice(-3).join(' | ') + ')');
    const chem = names.indexOf('[CHEMICAL]'); if (chem < 0 || chem > names.indexOf('[DISPLAYS, GIFT & SUPPLY]')) errs.push('③ other [ ] folders stay before DISPLAYS');
  }
  await pc.context().close();
  /* ② 디자인 담당: 🗂 탭 없음 */
  const jn = await open('jenny@theonefl.com', 1600, 900, 'catalog'); await jn.evaluate(() => { location.hash = '#/catmg/tree'; }); await jn.waitForTimeout(800);
  if (await jn.$('[data-ct2="tree"]') || await jn.$('[data-tmd]')) errs.push('② catalog job must not get the 🗂 분류 tab'); await jn.context().close();
  /* ① 폰 */
  const ph = await open('luke@theonefl.com', 430, 900); d = await dinfo(ph); if (d.dock || d.bodyDock) errs.push('① phone: no dock');
  await ph.click('#hMenu'); await ph.waitForTimeout(400); d = await dinfo(ph); if (!d.on || !d.back || d.dock) errs.push('① phone ☰ opens the popup drawer'); await ph.context().close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
