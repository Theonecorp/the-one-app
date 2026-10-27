/* v0.8.80 시험 — 주문 목록 스크롤 때 위 메뉴(상태 아이콘) 높이가 바뀌지 않음 (아이폰은 높이가 바뀌면 목록이 튕김) · 작게/크게 버튼 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8802', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [];
  for (const W of [390, 820]) {
    const pg = await br.newPage({ viewport: { width: W, height: 800 } }); pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' };
      window.__AFTER_SEED__ = s => { const now = Date.now(); for (let i = 0; i < 40; i++) { const t = new Date(now - i * 3600000).toISOString(); s.orders.push({ id: 'OX' + i, no: 'OX' + i, d: t.substring(0, 10), ym: t.substring(0, 7), sm: 'BRANDON', acct: '1111', store: 'SHOP ' + i, st: 'sent', n: 1, qty: 1, amt: 10, createdAt: t, updatedAt: t, sentAt: t }); } }; });
    await pg.goto('http://127.0.0.1:8802/test/demo.html'); await pg.waitForSelector('#nav button');
    await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(800);
    await pg.click('[data-hg="sent"]').catch(() => {}); await pg.waitForTimeout(1200);
    await pg.evaluate(() => window.scrollTo(0, 900)); await pg.waitForTimeout(400);
    /* 손가락으로 천천히 올리듯 — 휠 조금씩, 매번 위치 기록 */
    const ys = [], hs = new Set();
    await pg.evaluate(() => window.scrollTo(0, 0)); await pg.waitForTimeout(200); hs.add(await pg.evaluate(() => document.querySelector('.ohead').offsetHeight));
    await pg.evaluate(() => window.scrollTo(0, 900)); await pg.waitForTimeout(300);
    for (let i = 0; i < 70; i++) { await pg.mouse.move(W / 2, 500); await pg.mouse.wheel(0, -15); await pg.waitForTimeout(40); const r = await pg.evaluate(() => [Math.round(window.scrollY), document.querySelector('.ohead').offsetHeight]); ys.push(r[0]); hs.add(r[1]); }
    if (hs.size !== 1) errs.push(W + 'px: menu height changed while scrolling ' + [...hs].join('/'));
    /* 작게 · 크게 버튼 */
    const h0 = [...hs][0]; await pg.evaluate(() => window.scrollTo(0, 0)); await pg.click('[data-ocmp]'); await pg.waitForTimeout(300);
    const h1 = await pg.evaluate(() => document.querySelector('.ohead').offsetHeight), saved = await pg.evaluate(() => localStorage.getItem('theone.ocompact'));
    console.log(W, 'menu height', h0, '→ compact', h1, 'saved', saved); if (!(h1 < h0) || saved !== '1') errs.push(W + 'px: compact toggle failed');
    await pg.click('[data-ocmp]'); await pg.waitForTimeout(200); if ((await pg.evaluate(() => document.querySelector('.ohead').offsetHeight)) !== h0) errs.push('toggle back failed');
    /* 위로만 올렸으니 scrollY 가 커지는(튕겨 내려가는) 때가 있으면 안 됨 */
    let back = 0, flips = 0, prev = null; ys.forEach((y, i) => { if (i && y > ys[i - 1] + 2) back++; });
    const cls = []; for (let i = 0; i < 0; i++) cls.push(0);
    console.log(W, 'scrollY:', ys.join(' '), '| jumps down:', back);
    if (back) errs.push(W + 'px: scroll bounced down ' + back + ' times while scrolling up');
    await pg.close();
  }
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
