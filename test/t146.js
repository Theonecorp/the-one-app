/* v0.8.169 시험 — 🏷 아이템 · 재고 관리는 창고 매니저(whmgr)의 일 (2026-11-09: 따로 있던 '아이템 · 재고 관리'(itemmgr) 직무를 없애고 창고 매니저로 합침)
 *   ① 창고 매니저 아래 메뉴에 📦 재고 묶음(재고 · 아이템) · 홈에 ＋ 아이템 등록 타일 · 재고 화면이 열림 · 📋 일괄 등록은 🔒 관리자만
 *   ② 관리 → 사용자의 직무 목록에 '아이템 · 재고 관리' 가 없음 · 창고 매니저는 있음 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8800', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 430, height: 900 } });
  const mk = async (email, seed) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.seed) window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed }); await pg.goto('http://127.0.0.1:8800/test/demo.html'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(300); return pg; };
  const pg = await mk('joao@x.com', "s.users.push({ id: 'joao@x.com', email: 'joao@x.com', name: 'J', role: 'manager', job: 'whmgr', active: true });");
  const nav = await pg.$$eval('#nav button', b => b.map(x => x.dataset.go)); log('① nav:', nav.join(' ')); if (!nav.includes('hub/wh')) errs.push('① warehouse manager has the 📦 재고 묶음');
  await pg.evaluate(() => { location.hash = '#/hub/wh'; }); await pg.waitForSelector('[data-hub]', { timeout: 8000 });
  const tiles = await pg.$$eval('[data-hub]', b => b.map(x => x.dataset.hub)); log('① wh tiles:', tiles.join(' ')); if (!tiles.includes('stock') || !tiles.includes('items')) errs.push('① 재고 묶음 has 재고 · 아이템 (got ' + tiles.join() + ')');
  await pg.evaluate(() => { location.hash = '#/stock'; }); await pg.waitForTimeout(1500); const stockTxt = await pg.evaluate(() => document.getElementById('page').textContent.replace(/\s+/g, ' ').slice(0, 120)); if (/창고 · 오피스 담당자가 봅니다|staff only/.test(stockTxt)) errs.push('① stock page opens for the warehouse manager');
  await pg.evaluate(() => { location.hash = '#/shome'; }); await pg.waitForSelector('[data-hg]', { timeout: 8000, state: 'attached' }); const hg = await pg.$$eval('[data-hg]', b => b.map(x => x.dataset.hg)); log('① home tiles:', hg.filter(k => /items/.test(k)).join(' '));
  if (!hg.includes('items/new')) errs.push('① warehouse manager home has ＋ 아이템 등록'); if (hg.includes('items/bulk')) errs.push('① 📋 일괄 등록 tile is admin only');
  await pg.evaluate(() => { location.hash = '#/items/bulk'; }); await pg.waitForTimeout(800); if (await pg.$('#ibGrid')) errs.push('① bulk grid must not open for the warehouse manager');
  await pg.close();
  const ad = await mk('luke@theonefl.com', '');
  const jobs = await ad.evaluate(async () => { const M = await import('/src/main.js'); return M.JOBS.map(j => j[0]).join('|'); }); log('② jobs:', jobs);
  if (/itemmgr/.test(jobs)) errs.push('② itemmgr job must be gone'); if (!/whmgr/.test(jobs)) errs.push('② whmgr job stays');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
