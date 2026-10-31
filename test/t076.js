/* v0.8.89 시험 — 프리셋 여러 번 눌림 색 단계(×2 주황 · ×3 빨강 · ×4 보라 · ×5 검정) · ×N 배지 눌러 수량 입력 · 아이템 등록 창 통로 칩 · 새 아이템 사진 · 담당자 🏠 홈 = 타일, 🛒 세일 = 목록 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8810', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 430, height: 1000 } });
  const mk = async (email) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(e => { window.__MOCK_USER__ = { email: e, name: 'X' }; }, email); await pg.goto('http://127.0.0.1:8810/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  const txt = async (pg, q) => ((await pg.textContent(q).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  /* 세일즈맨: 프리셋 6 → 카드 5번 */
  let pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'X' }; try { localStorage.setItem('theone.vm', 'grid'); localStorage.removeItem('theone.order.pre'); } catch (x) {} });
  await pg.goto('http://127.0.0.1:8810/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ');
  await pg.fill('#eStoreQ', 'ali'); await pg.waitForTimeout(200); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(900); if (await pg.$('#modal.on')) await pg.click('#modal .mclose');
  await pg.click('[data-ck="Earrings · Hoops & Pincatch"]'); await pg.waitForTimeout(200); await pg.click('[data-ck="Aluminum"]'); await pg.waitForTimeout(150); await pg.click('[data-ck="Gold"]'); await pg.waitForTimeout(300);
  await pg.click('[data-qk="6"]'); await pg.waitForTimeout(100);
  const code = 'AHG100';
  const cls = async () => (await pg.$eval('.gcard[data-gc="' + code + '"]', e => e.className + '|' + (e.querySelector('.gq') || {}).textContent + '|' + ((e.querySelector('.gtap') || {}).textContent || '')));
  const sel = '.gcard[data-gc="' + code + '"]';
  await pg.click(sel); await pg.waitForTimeout(350); log('1:', await cls());
  await pg.click(sel); await pg.waitForTimeout(350); const c2 = await cls(); log('2:', c2); if (!/ multi m2/.test(c2) || !/×2/.test(c2)) errs.push('2 taps → m2 orange');
  await pg.click(sel); await pg.waitForTimeout(350); const c3 = await cls(); log('3:', c3); if (!/ m3/.test(c3) || / m2/.test(c3) || !/×3/.test(c3)) errs.push('3 taps → m3 red');
  await pg.click(sel); await pg.waitForTimeout(350); const c4 = await cls(); log('4:', c4); if (!/ m4/.test(c4)) errs.push('4 taps → m4 purple');
  await pg.click(sel); await pg.waitForTimeout(350); const c5 = await cls(); log('5:', c5); if (!/ m5/.test(c5) || !/\|30\|/.test(c5)) errs.push('5 taps → m5 black, qty 30');
  await pg.click(sel); await pg.waitForTimeout(350); const c6 = await cls(); if (!/ m5/.test(c6) || !/×6/.test(c6)) errs.push('6 taps stays m5 but shows ×6');
  /* 수량 숫자 → 수량 입력창 → 전체 수량 바꾸기 (v0.8.120: ×N 배지는 보기만, 탭은 카드로 통과) */
  await pg.click(sel + ' .gq'); await pg.waitForSelector('#qpV', { timeout: 3000 }).catch(() => errs.push('tapping ×N should open the qty pad'));
  await pg.fill('#qpV', '12'); await pg.click('#qpOk'); await pg.waitForTimeout(400);
  const c7 = await cls(); log('after pad:', c7); if (!/\|12\|/.test(c7)) errs.push('qty pad should set qty to 12');
  const cartTag = await pg.evaluate(() => { const t = document.querySelector('.tapx'); return t ? t.className : ''; }); log('cart tag:', cartTag);
  await pg.close();
  /* 관리자: 아이템 등록 창 — 통로 칩 · 새 아이템 사진 */
  pg = await mk('luke@theonefl.com');
  await pg.evaluate(() => { location.hash = '#/items'; }); await pg.waitForSelector('#itQ', { timeout: 8000 });
  await pg.click('#itNew');
  await pg.waitForSelector('#fLoc', { timeout: 4000 }).catch(() => errs.push('item form missing'));
  const form = await txt(pg, '#mbox'); if (!/통로/.test(form)) errs.push('form should mention 통로'); if (!(await pg.$('#fPhNew'))) errs.push('new item form should offer a photo');
  const chips = await pg.$$eval('[data-fa]', b => b.map(x => x.dataset.fa)); log('aisle chips:', chips);
  if (chips.length) { await pg.click('[data-fa]'); const v = await pg.$eval('#fLoc', e => e.value); log('fLoc after chip:', v); if (!v.startsWith(chips[0] + '-')) errs.push('chip should prefill aisle'); }
  await pg.click('#fX');
  /* 담당자: 🏠 홈 = 타일 · 🛒 세일 = 목록 */
  await pg.close(); pg = await mk('acct@theonefl.com');
  await pg.click('#nav button[data-go="shome"]'); await pg.waitForTimeout(1200);
  const home = await txt(pg, '#page'); log('home:', home.slice(0, 120)); if (!(await pg.$('.hgrid, [data-hg]'))) errs.push('staff Home should show tiles');
  await pg.click('#nav button[data-go="order"]'); await pg.waitForTimeout(1500);
  const sale = await txt(pg, '#page'); log('sale:', sale.slice(0, 120)); if (await pg.$('.hgrid')) errs.push('Sale tab should show the work list, not tiles'); if (!(await pg.$('.chips [data-st], .lhead, #ordList, .pr, .dtw'))) errs.push('Sale tab should show a list');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
