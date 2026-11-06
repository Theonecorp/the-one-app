/* v0.8.169 시험 — 🏷 새 직무 '아이템 · 재고 관리'(itemmgr): 아이템 등록 · 분류 · 사진 · 세트 · 올리기 + 📦 재고 · 위치는 만지고, 주문 흐름 · 수금 · 정산 · 경영 · 사용자 관리는 메뉴에 없음
 *   ① 아래 메뉴 = 홈 · 아이템 · 📦 재고 · 사진 · 카탈로그 (세일 · 수금 · 조회 · 경영 · 관리 없음) · 홈은 아이템 관리 홈(새 아이템 · 일괄 등록 · 올리기 · 분류 탭)
 *   ② 📦 재고 묶음에는 재고 · 아이템 타일만 (배송 조회 · Notes Display 없음) · 재고 화면이 열림 · 📋 일괄 등록 화면이 열림
 *   ③ 관리 → 사용자의 직무 목록에 '아이템 · 재고 관리' 가 있음 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8800', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 430, height: 900 } });
  const mk = async (email, seed) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.seed) window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed }); await pg.goto('http://127.0.0.1:8800/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  const pg = await mk('joao@x.com', "s.users.push({ id: 'joao@x.com', email: 'joao@x.com', name: 'J', role: 'manager', job: 'itemmgr', active: true });");
  /* ① 메뉴 */
  const nav = await pg.$$eval('#nav button', b => b.map(x => x.dataset.go)); log('① nav:', nav.join(' '));
  if (nav.join() !== 'catmg,items,hub/wh,photos,cat') errs.push('① nav must be 홈 · 아이템 · 재고 · 사진 · 카탈로그 (got ' + nav.join() + ')');
  ['order', 'hub/money', 'hub/look', 'hub/biz', 'admin', 'shome', 'own'].forEach(k => { if (nav.includes(k)) errs.push('① must not show ' + k); });
  await pg.waitForSelector('[data-cg="items/bulk"]', { timeout: 8000 }).catch(() => errs.push('① home is the items home with 일괄 등록'));
  const head = await pg.evaluate(() => document.querySelector('#page h2').textContent.replace(/\s+/g, ' ')); log('① home head:', head.slice(0, 40)); if (!/아이템 · 재고 관리/.test(head)) errs.push('① home titled 아이템 · 재고 관리');
  if (!(await pg.$('[data-cg="items/new"]')) || !(await pg.$('[data-ct2="cat"]')) || !(await pg.$('[data-ct2="tree"]'))) errs.push('① home has 새 아이템 · 올리기 탭 · 분류 탭');
  /* ② 재고 묶음 · 재고 화면 · 일괄 등록 */
  await pg.evaluate(() => { location.hash = '#/hub/wh'; }); await pg.waitForSelector('[data-hub]', { timeout: 8000 });
  const tiles = await pg.$$eval('[data-hub]', b => b.map(x => x.dataset.hub)); log('② wh tiles:', tiles.join(' '));
  if (tiles.join() !== 'stock,items') errs.push('② 재고 묶음 = 재고 · 아이템 only (got ' + tiles.join() + ')');
  await pg.evaluate(() => { location.hash = '#/stock'; }); await pg.waitForTimeout(1500); const stockTxt = await pg.evaluate(() => document.getElementById('page').textContent.replace(/\s+/g, ' ').slice(0, 120)); log('② stock:', stockTxt.slice(0, 60));
  if (/창고 · 오피스 담당자가 봅니다|staff only/.test(stockTxt)) errs.push('② stock page must open for itemmgr');
  await pg.evaluate(() => { location.hash = '#/items/bulk'; }); await pg.waitForSelector('#ibGrid', { timeout: 8000 }).catch(() => errs.push('② bulk add screen opens'));
  await pg.close();
  /* ③ 관리자: 직무 목록 */
  const ad = await mk('luke@theonefl.com', '');
  const jobs = await ad.evaluate(async () => { const M = await import('/src/main.js'); return M.JOBS.map(j => j[0] + ':' + j[1]).join('|'); }); log('③ jobs:', jobs);
  if (!/itemmgr:아이템 · 재고 관리/.test(jobs)) errs.push('③ job list offers 아이템 · 재고 관리');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
