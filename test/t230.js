/* v0.8.206 시험 — 🏭 오너 · 관리자 홈(own) 새 디자인, 컴퓨터 먼저: 머리(기간 칩) · 숫자 4칸(매출 · 들어온 돈 · 미수금 · 공장 미지급, 누르면 그 화면) · 상세 2열(넓은 화면) · 폰은 한 열 · 숫자 칸 이름이 잘리지 않음 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8987', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const open = async (w, h) => { const pg = await br.newPage({ viewport: { width: w, height: h } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; });
    await pg.goto('http://127.0.0.1:8987/test/demo.html#/own');
    await pg.waitForSelector('.own [data-og="mg/sales"]', { timeout: 15000 }).catch(() => errs.push(w + 'px: owner dashboard did not render')); await pg.waitForTimeout(400); return pg; };
  /* ① 컴퓨터 1440px */
  const pg = await open(1440, 1000);
  const ks = await pg.$$eval('.own .wd-kpi', L => L.map(b => b.dataset.ogk)); log('kpis:', ks);
  if (ks.join(',') !== 'mg/sales,now,bossar,mg/fac') errs.push('4 KPIs should be sales · cash · A/R · factories, got ' + ks);
  const tops = await pg.$$eval('.own .wd-kpi', L => L.map(b => Math.round(b.getBoundingClientRect().top))); if (new Set(tops).size !== 1) errs.push('desktop: 4 KPIs should sit on one row ' + tops);
  const r1 = await pg.$eval('.own [data-og="mg/sales"]', e => e.getBoundingClientRect()), r2 = await pg.$eval('.own [data-og="now"]', e => e.getBoundingClientRect());
  log('sales/cash cards:', Math.round(r1.left), Math.round(r1.top), '·', Math.round(r2.left), Math.round(r2.top)); if (!(Math.abs(r1.top - r2.top) < 2 && r2.left > r1.right - 1)) errs.push('desktop: sales and cash detail cards should be side by side');
  if (!(await pg.$('.own-hd [data-op="month"]')) || !(await pg.$('.own-hd #opCal'))) errs.push('period chips should be in the header card');
  await pg.click('.own .wd-kpi[data-ogk="bossar"]'); await pg.waitForTimeout(600); const h = await pg.evaluate(() => location.hash); log('kpi click →', h); if (!/bossar/.test(h)) errs.push('A/R KPI should open #/bossar');
  /* ② 폰 390px — 한 열 · 숫자 칸 이름 안 잘림 */
  const pm = await open(390, 844);
  const m1 = await pm.$eval('.own [data-og="mg/sales"]', e => e.getBoundingClientRect()), m2 = await pm.$eval('.own [data-og="now"]', e => e.getBoundingClientRect()); if (!(m2.top > m1.bottom - 1)) errs.push('phone: detail cards should stack');
  const cut = await pm.$$eval('.own .wd-kpi .kt > span', L => L.filter(s => s.scrollWidth > s.clientWidth + 1).map(s => s.textContent)); log('cut labels:', cut); if (cut.length) errs.push('phone: KPI labels should not be cut: ' + cut);
  const sw = await pm.evaluate(() => document.documentElement.scrollWidth); if (sw > 392) errs.push('phone: no sideways scroll (' + sw + ')');
  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL'); errs.forEach(e => console.log(' -', e)); process.exit(1); }
  console.log('PASS');
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
