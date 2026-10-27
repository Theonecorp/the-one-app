/* v0.8.75 시험 — 밀린 주문: 안 끝난 칸은 오래 기다린 주문이 맨 위 · 줄마다 ⏱ 기다린 시간 · ⚠️ 하루 넘게 밀린 주문 N건 (목록 · 담당자 홈) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8795', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' };
    const ago = h => new Date(Date.now() - h * 3600000).toISOString();
    const mk = (id, store, h) => ({ id, no: id, d: ago(h).substring(0, 10), ym: ago(h).substring(0, 7), sm: 'BRANDON', acct: '1111', store, st: 'sent', n: 1, qty: 1, amt: 10, createdAt: ago(h), updatedAt: ago(h), sentAt: ago(h) });
    window.__AFTER_SEED__ = s => { s.orders = [mk('O-NEW', 'NEWEST SHOP', 0.5), mk('O-OLD', 'OLDEST SHOP', 72), mk('O-MID', 'MIDDLE SHOP', 5)]; s.orderLines = []; }; });
  await pg.goto('http://127.0.0.1:8795/test/demo.html'); await pg.waitForSelector('#nav button');
  /* 담당자 홈 배너 */
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForSelector('#hOldB', { timeout: 8000 }).catch(() => errs.push('home banner missing'));
  if (await pg.$('#hOldB')) { log('home:', (await pg.textContent('#hOldB')).trim()); await pg.click('#hOldB'); await pg.waitForTimeout(1000);
    const shown = await pg.$$eval('[data-oid] .ct b', b => b.map(x => x.textContent));
    log('after banner (old only):', shown); if (shown.length !== 1 || !/OLDEST/.test(shown[0])) errs.push('banner should filter to the 1 old order');
    await pg.click('#oOld'); await pg.waitForTimeout(800); }
  for (const grp of ['sm', 'day']) {
    if (await pg.$('[data-grp="' + grp + '"]')) { await pg.click('[data-grp="' + grp + '"]'); await pg.waitForTimeout(700); }
    const names = await pg.$$eval('[data-oid] .ct b', b => b.map(x => x.textContent.replace(/\s+/g, ' ')));
    log(grp, names);
    if (!/OLDEST/.test(names[0]) || !/NEWEST/.test(names[names.length - 1])) errs.push(grp + ': oldest should be first, newest last');
    if (!/⏱ 3일째/.test(names[0]) || !/⏱ 5시간/.test(names[1]) || !/⏱ 30분/.test(names[2])) errs.push(grp + ': age badges wrong');
  }
  const bar = (await pg.textContent('#oOld')).replace(/\s+/g, ' '); log('list bar:', bar); if (!/1건/.test(bar)) errs.push('list banner should count 1');
  const cls = await pg.$eval('.agetag', e => e.className); if (!/old/.test(cls)) errs.push('oldest badge should be red');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'old_orders.png') });
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
