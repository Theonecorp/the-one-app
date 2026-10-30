/* v0.8.93 시험 — ↩ 크레딧 · 리턴: 세일즈맨이 가게 · 사유 · 아이템 담아 바로 확정 → CM 인보이스(마이너스) · 가게 기본 할인 · 최근 인보이스 가격 비교(≠ 표시 · 이 가격으로) · 사무실 알림 → 담당자 목록 · ✅ 확인 · VOID */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8812', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 430, height: 1000 } });
  const seed = `s.accounts.forEach(a => { if (a.acct === '1111') a.disc = { A: 10 }; });
    s.invoices = (s.invoices || []).concat([{ id: 'A-000500', no: 'A-000500', t: 'A', d: '2026-10-01', ym: '2026-10', acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', lines: [{ c: 'AHG100', d: 'x', q: 6, p: 2.5, lp: 2.5 }], qty: 6, sub: 15, list: 15, disc: 20, total: 12, bal: 12, st: 'open' }]);`;
  const mk = async (email) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed }); await pg.goto('http://127.0.0.1:8812/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  const txt = async (pg, q) => ((await pg.textContent(q).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  /* 세일즈맨 */
  let pg = await mk('brandon@x.com');
  if (!(await pg.$('[data-hg="credit/new"]'))) errs.push('salesman home should have a credit tile');
  await pg.click('[data-hg="credit/new"]'); await pg.waitForSelector('#crStore', { timeout: 8000 });
  if (!(await pg.evaluate(() => document.getElementById('crGo').disabled))) errs.push('confirm disabled until filled');
  await pg.fill('#crStore', 'ali'); await pg.waitForSelector('#crHits [data-a="1111"]'); await pg.click('#crHits [data-a="1111"]'); await pg.waitForTimeout(800);
  const acc = await txt(pg, '#crAcc'); log('acc:', acc); if (!/A 10%/.test(acc) || !/최근 인보이스 1/.test(acc)) errs.push('store discount and recent invoices should show');
  await pg.click('[data-crw="대미지"]');
  await pg.fill('#crItem', 'AHG100'); await pg.press('#crItem', 'Enter'); await pg.waitForTimeout(400);
  const line = await txt(pg, '[data-crl="AHG100"]'); log('line:', line.slice(0, 220));
  const lp = await pg.evaluate(() => { const it = Object.values(window.__MOCK_STORE__).length && null; return null; });
  const p0 = Number(await pg.$eval('[data-crp="AHG100"]', e => e.value)); const listP = await pg.evaluate(() => (window.__CAT__ && 0) || null);
  log('default price:', p0);
  if (!/🕘 최근 2026-10-01 A-000500: \$2\.00/.test(line)) errs.push('recent invoice price 2.50 × (1−20%) = 2.00 should show');
  if (Math.abs(p0 - 2.0) < 0.009) { if (!/✓/.test(line)) errs.push('equal price should show ✓'); } else { if (!/≠/.test(line) || !(await pg.$('[data-cruse="AHG100"]'))) errs.push('different price should show ≠ and a use button'); }
  await pg.fill('[data-crq="AHG100"]', '3'); await pg.$eval('[data-crq="AHG100"]', e => e.dispatchEvent(new Event('change'))); await pg.waitForTimeout(200);
  if (await pg.$('[data-cruse="AHG100"]')) { await pg.click('[data-cruse="AHG100"]'); await pg.waitForTimeout(200); }
  const p1 = Number(await pg.$eval('[data-crp="AHG100"]', e => e.value)); log('price after use:', p1); if (Math.abs(p1 - 2.0) > 0.009) errs.push('use-recent should set 2.00');
  const tot = await txt(pg, '#crTot'); log('tot:', tot); if (!/크레딧 −\$6\.00/.test(tot)) errs.push('credit total 3 × 2.00 = 6.00');
  await pg.click('#crGo'); await pg.waitForSelector('#cfOk'); const ask = await txt(pg, '#mbox'); if (!/−\$6\.00/.test(ask)) errs.push('confirm shows total'); await pg.click('#cfOk'); await pg.waitForTimeout(1500);
  const cm = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.invoices).find(x => x.src === 'credit')); log('cm:', cm && [cm.no, cm.t, cm.total, cm.bal, cm.qty, cm.sm, cm.acct, cm.why, cm.lines[0].q, cm.lines[0].p, cm.reviewed]);
  if (!cm || !/^CM-\d{6}$/.test(cm.no) || cm.total !== -6 || cm.bal !== -6 || cm.qty !== -3 || cm.sm !== 'BRANDON' || cm.acct !== '1111' || cm.why !== '대미지' || cm.lines[0].q !== -3 || cm.reviewed) errs.push('CM doc wrong');
  const nq = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'credit')); if (!nq.length || !nq[0].toStaff || !/CM-/.test(nq[0].text)) errs.push('staff notice should be queued');
  const det = await txt(pg, '#page'); if (!/CM-/.test(det) || !/확인 대기/.test(det) || !/−\$6\.00|-\$6\.00/.test(det)) errs.push('detail page after confirm');
  if (await pg.$('#crOk')) errs.push('salesman must not see the office confirm button');
  await pg.evaluate(() => { location.hash = '#/credit'; }); await pg.waitForTimeout(1200); const lst = await txt(pg, '#page'); if (!/확인 대기 1/.test(lst)) errs.push('my credit list should show 1 to review');
  await pg.close();
  /* 담당자 — 시험 화면은 페이지마다 자료가 새로 시작하므로 CM 을 미리 넣어 둠 */
  pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'acct@theonefl.com', name: 'A' }; window.__AFTER_SEED__ = s => { s.invoices = (s.invoices || []).concat([{ id: 'CM-000001', no: 'CM-000001', t: 'CM', kind: 'credit', src: 'credit', d: '2026-10-28', ym: '2026-10', acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', why: '대미지', note: '', lines: [{ c: 'AHG100', d: 'x', q: -3, p: 2, lp: 2.5, dc: 10, src: 'manual' }], qty: -3, sub: -6, list: -7.5, disc: 0, total: -6, bal: -6, flags: ['가격을 직접 바꿈 1줄'], st: 'open', reviewed: false, createdBy: 'brandon@x.com' }]); }; });
  await pg.goto('http://127.0.0.1:8812/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.click('#nav button[data-go="shome"]'); await pg.waitForTimeout(1000);
  if (!(await pg.$('[data-hg="credit"]'))) errs.push('staff home should have a credits tile'); else { if (!(await pg.$('.hgrp[data-grp="money"].open'))) await pg.click('[data-ghd="money"]'); await pg.waitForTimeout(200); await pg.click('[data-hg="credit"]'); await pg.waitForTimeout(1200); }   // v0.8.125: 홈 묶음(수금) 안
  const sl = await txt(pg, '#page'); log('staff list:', sl.slice(0, 160)); if (!/확인 대기 1/.test(sl) || !/⚠️ 1/.test(sl)) errs.push('staff list should show 1 waiting with a flag');
  await pg.click('[data-cr="CM-000001"]'); await pg.waitForSelector('#crOk', { timeout: 5000 }).catch(() => errs.push('staff confirm button missing'));
  await pg.click('#crOk'); await pg.waitForTimeout(800);
  const rv = await pg.evaluate(() => window.__MOCK_STORE__.invoices['CM-000001'].reviewed); if (rv !== true) errs.push('confirm should set reviewed');
  await pg.click('#crVoid'); await pg.waitForSelector('#cvGo'); await pg.click('#cvGo'); await pg.waitForTimeout(1100); if (await pg.evaluate(() => window.__MOCK_STORE__.invoices['CM-000001'].st) === 'x') errs.push('void without reason must be blocked');   /* 같은 버튼 연타 방지 때문에 1초 이상 띄움 */
  await pg.fill('#cvWhy', '물건이 안 들어옴'); await pg.click('#cvGo'); await pg.waitForTimeout(1200);
  const v = await pg.evaluate(() => { const x = window.__MOCK_STORE__.invoices['CM-000001']; return [x.st, x.bal, x.voidReason, Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'creditVoid').length]; }); log('void:', v);
  if (v[0] !== 'x' || v[1] !== 0 || v[2] !== '물건이 안 들어옴' || v[3] !== 1) errs.push('void should set st x, bal 0, notify salesman');
  /* 거래처 창에서 크레딧으로 보이는지 (storeInfo: bal < 0 → 크레딧) */
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
