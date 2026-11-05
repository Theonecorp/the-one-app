/* v0.8.164 시험 — 인보이스 담당 주문 · 크레딧 · 🖨 피킹 시트 한 장 맞춤
 *   ① 출고 · 인보이스(pickinv) · 인보이스(invoice) 담당: 🛒 새 주문 타일이 있고 주문 화면이 열림 · ↩ 크레딧 목록에 "크레딧 주기" 단추 → 크레딧 저장(CM)
 *   ② 피킹 시트: 첫 장에 머리 + 표가 같이(예전엔 첫 장에 머리만) · 표 머리가 장마다(thead) · 46줄이 Letter 2장 · 설정이 A4 면 A4 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8882', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  fs.mkdirSync(path.resolve(__dirname, 'out'), { recursive: true });
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const mk = async (job, extra) => {
    const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(job + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'acct@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', 's.users.forEach(u => { if (u.email === "acct@theonefl.com") u.job = "' + o.job + '"; });' + (o.extra || '')); }, { job, extra });
    await pg.goto('http://127.0.0.1:8882/test/demo.html'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(300); return pg;
  };
  /* ① 주문 · 크레딧 */
  for (const job of ['pickinv', 'invoice']) {
    const pg = await mk(job);
    await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(800);
    const tile = await pg.$('[data-hg="new"]'); if (!tile) errs.push(job + ': new order tile missing');
    else { await pg.evaluate(() => { const t = document.querySelector('[data-hg="new"]'), g = t && t.closest('.hgrp'); if (g) g.classList.add('open'); }); await pg.click('[data-hg="new"]'); await pg.waitForTimeout(800); const h = await pg.evaluate(() => location.hash); log(job, 'new order →', h); if (!/#\/order\/new/.test(h)) errs.push(job + ': new order should open the order editor'); }
    await pg.evaluate(() => { location.hash = '#/credit'; }); await pg.waitForTimeout(800);
    if (!(await pg.$('#crNew'))) errs.push(job + ': credit list should offer 크레딧 주기');
    else if (job === 'invoice') {
      await pg.click('#crNew'); await pg.waitForTimeout(700);
      const page = (await pg.textContent('#page')).replace(/\s+/g, ' '); if (!/크레딧 주기|Give credit/.test(page)) errs.push('credit form should open');
    }
    await pg.close();
  }
  /* ② 피킹 시트 */
  const seed = 'const o = s.orders[0]; o.st = "pick"; o.picker = "acct@theonefl.com"; o.pickerName = "Pick01"; const L = []; for (let i = 0; i < 46; i++) L.push({ c: "AHG" + (100 + i), d: (i % 3 ? "Aluminum Gold Hoop Earring Style " : "STAINLESS STEEL HUGGIE HOOP EARRING WITH CZ STONES EXTRA LONG DESCRIPTION ") + i, q: 6 + (i % 4) * 6, p: 2.5, t: "A" }); s.orderLines = [{ id: o.id, sm: o.sm, lines: L }];';
  for (const paper of ['letter', 'a4']) {
    const pg = await mk('invoice', seed + (paper === 'a4' ? 's.settings[0].invView = { paper: "a4" };' : ''));
    await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#mPickPrint', { timeout: 8000 }).catch(() => errs.push(paper + ': picking print button missing'));
    if (!(await pg.$('#mPickPrint'))) { await pg.close(); continue; }
    await pg.click('#mPickPrint'); await pg.waitForSelector('#prt.on', { timeout: 5000 });
    const dom = await pg.evaluate(() => { const hd = document.querySelector('#prtbody .pk .pkhd'), t = document.querySelector('#prtbody .pk .pktbl'); return { hd: !!hd, brk: hd ? getComputedStyle(hd).breakAfter + '/' + getComputedStyle(hd).pageBreakAfter : '', thead: !!(t && t.querySelector('thead th')), rows: t ? t.querySelectorAll('tbody tr').length : 0, page: (document.querySelector('#prtbody style') || {}).textContent || '' }; });
    log(paper, 'dom:', JSON.stringify(dom));
    if (!dom.hd || !dom.thead) errs.push(paper + ': picking sheet should have the header block and a table with a repeating thead');
    if (/page|always/.test(dom.brk)) errs.push(paper + ': header must not force a page break (' + dom.brk + ')');
    if (!new RegExp('size:' + (paper === 'a4' ? 'A4' : 'letter')).test(dom.page)) errs.push(paper + ': @page should be ' + paper);
    const pdf = await pg.pdf({ format: paper === 'a4' ? 'A4' : 'Letter', printBackground: true, preferCSSPageSize: true });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length; log(paper, 'pdf pages:', pages);
    if (pages > 2) errs.push(paper + ': 46 lines should fit on 2 pages (got ' + pages + ') — first page must carry the table');
    if (paper === 'letter') fs.writeFileSync(path.resolve(__dirname, 'out', 'picking.pdf'), pdf);
    await pg.close();
  }
  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL'); errs.forEach(e => console.log(' -', e)); process.exit(1); }
  console.log('PASS');
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
