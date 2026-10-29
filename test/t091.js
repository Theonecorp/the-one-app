/* v0.8.113 시험 — 🖨 인보이스 인쇄: Letter 한 장 맞춤(.iv 7.7in · 마지막 장 뒤 빈 장 없음) · 용지 Letter/A4 전환(@page · .pa4) · 꼬리말(.ivterms) + 수령 서명 줄(.ivsig) · 관리 → 설정의 꼬리말 저장 반영 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8828', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 1100, height: 1000 } });
  const now = new Date(), y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0');
  const seed = "s.invoices = (s.invoices || []).concat(" + JSON.stringify([{ id: 'A-043200', no: 'A-043200', t: 'A', d: y + '-' + m + '-05', ym: y + '-' + m, acct: '1271', store: 'BEAUTY 4U', sm: 'BRANDON', sub: 80, disc: 0, total: 80, bal: 80, st: 'open', orderId: 'O261014-AAAA', lines: [{ c: 'AHG100', d: 'Aluminum Gold ITEM 0', q: 2, p: 25 }, { c: 'AHG101', d: 'Aluminum Silver ITEM 1', q: 10, p: 3 }] }]) + ");";
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { seed });
  await pg.goto('http://127.0.0.1:8828/test/demo.html'); await pg.waitForSelector('#nav button');
  const txt = async q => ((await pg.textContent(q).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  await pg.evaluate(() => { location.hash = '#/invs'; }); await pg.waitForSelector('[data-go="inv:A-043200"]', { timeout: 8000 }); await pg.click('[data-go="inv:A-043200"]'); await pg.waitForSelector('#idPrint', { timeout: 6000 });
  await pg.click('#idPrint'); await pg.waitForSelector('#prtbody .iv', { timeout: 6000 }).catch(() => errs.push('print view missing'));
  const terms = await txt('#prtbody .ivterms'), sig = await txt('#prtbody .ivsig'); log('terms:', terms.slice(0, 140)); log('sig:', sig);
  if (!/NSF/.test(terms) || !/payable to THE ONE CORP/.test(terms)) errs.push('default footer terms expected'); if (!/Received by/.test(sig)) errs.push('signature line expected');
  const dim = await pg.evaluate(() => { const iv = document.querySelector('#prtbody .iv'); const cs = getComputedStyle(iv); return { w: iv.getBoundingClientRect().width, minH: cs.minHeight, brk: cs.breakAfter || cs.pageBreakAfter, a4: iv.classList.contains('pa4') }; }); log('dims:', JSON.stringify(dim));
  if (Math.abs(dim.w - 7.7 * 96) > 2) errs.push('Letter page should be 7.7in wide, got ' + dim.w); if (dim.a4) errs.push('default paper should be letter'); if (!/auto/.test(dim.brk)) errs.push('last (only) page should not force a page break');
  const pageCss = await pg.evaluate(() => Array.from(document.querySelectorAll('#prtbody style')).map(s => s.textContent).join(' ')); if (!/size:letter/.test(pageCss)) errs.push('@page letter expected: ' + pageCss);
  await pg.click('[data-ivpp="a4"]'); await pg.waitForTimeout(300);
  const a4 = await pg.evaluate(() => ({ cls: document.querySelector('#prtbody .iv').classList.contains('pa4'), css: Array.from(document.querySelectorAll('#prtbody style')).map(s => s.textContent).join(' ') })); log('a4:', JSON.stringify(a4));
  if (!a4.cls || !/size:A4/.test(a4.css)) errs.push('A4 switch should set .pa4 and @page A4');
  await pg.click('[data-ivpp="letter"]'); await pg.waitForTimeout(200);
  /* 설정에서 꼬리말 고치기 */
  await pg.evaluate(() => { document.getElementById('prt').classList.remove('on'); document.getElementById('modal').classList.remove('on'); location.hash = '#/admin/set'; }); await pg.waitForSelector('#coFoot', { timeout: 8000 }).catch(() => errs.push('footer textarea missing'));
  await pg.fill('#coFoot', 'Thank you!\nNo returns after 30 days.'); await pg.selectOption('#coSig', '0'); await pg.click('#stSave'); await pg.waitForTimeout(1200);
  const co = await pg.evaluate(() => window.__MOCK_STORE__.settings.app.co); log('saved co:', JSON.stringify(co));
  if (!co || co.footer !== 'Thank you!\nNo returns after 30 days.' || co.sig !== false || co.paper !== 'letter') errs.push('footer/sig/paper should be saved');
  await pg.evaluate(() => { location.hash = '#/invs'; }); await pg.waitForSelector('[data-go="inv:A-043200"]', { timeout: 8000 }); await pg.click('[data-go="inv:A-043200"]'); await pg.waitForSelector('#idPrint', { timeout: 6000 }); await pg.click('#idPrint'); await pg.waitForSelector('#prtbody .iv', { timeout: 6000 });
  const terms2 = await txt('#prtbody .ivterms'); log('terms2:', terms2); if (!/No returns after 30 days/.test(terms2) || /NSF/.test(terms2)) errs.push('reprint should use the saved footer'); if (await pg.$('#prtbody .ivsig')) errs.push('signature line should be off');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
