/* v0.8.177 시험 — ↩ 크레딧 알림 · 보이는 곳 · 쓰는 곳 (2026-11-09 관리자)
 *   ① 크레딧을 확정하면 알림은 앱 팝업만 (notifyq.pushOnly · 메일 · 구글 챗 단톡방 없음) — VOID 알림도
 *   ② 인보이스 조회에 ↩ CM 크레딧 종류 칩 · 크레딧 메모를 열면 크레딧 화면(#/credit/CM-…)으로 · 크레딧 상세에 남은 크레딧 · 쓰는 법
 *   ③ 수금 입력: 미결 인보이스와 크레딧(↩ 표시)을 같이 고르면 크레딧을 먼저 빼고 인보이스를 채움 — 인보이스 $800 + 크레딧 −$30 에 $770 받으면 800 · −30 (파샬 없음)
 *   ④ 사무실 확인 때 크레딧을 일부만 쓰면 남은 크레딧이 남음 (−30 중 −10 → −20) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8835', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const seed = `const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().substring(0, 10); };
    s.invoices = (s.invoices || []).concat([{ id: 'CM-000009', no: 'CM-000009', t: 'CM', kind: 'credit', src: 'credit', d: day(2), ym: day(2).substring(0, 7), acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', why: '대미지', lines: [{ c: 'AHG100', d: 'x', q: -12, p: 2.5, lp: 2.5 }], qty: -12, sub: -30, list: -30, disc: 0, total: -30, bal: -30, st: 'open', reviewed: false, createdBy: 'brandon@x.com', createdAt: new Date().toISOString() }]);`;
  const mk = async (email, w) => { const pg = await (await br.newContext({ viewport: { width: w || 430, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed }); await pg.goto('http://127.0.0.1:8835/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(300); return pg; };
  /* ① 세일즈맨이 크레딧 확정 → 알림은 앱만 */
  let pg = await mk('brandon@x.com');
  await pg.evaluate(() => { location.hash = '#/credit/new'; }); await pg.waitForSelector('#crStore', { timeout: 8000 });
  await pg.fill('#crStore', 'ali'); await pg.waitForSelector('#crHits [data-a="1111"]'); await pg.click('#crHits [data-a="1111"]'); await pg.waitForTimeout(700);
  await pg.click('[data-crw="대미지"]'); await pg.fill('#crItem', 'AHG105'); await pg.press('#crItem', 'Enter'); await pg.waitForTimeout(300);
  await pg.click('#crGo'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1300);
  const nq = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'credit')); log('① notify:', JSON.stringify(nq.map(n => ({ pushOnly: n.pushOnly, chat: n.chat, toStaff: n.toStaff }))));
  if (nq.length !== 1 || nq[0].pushOnly !== true || nq[0].chat) errs.push('① credit alert is app-only (pushOnly, no chat / email)');
  const left = await pg.$eval('.sumbox', e => e.textContent).catch(() => ''); if (!/남은 크레딧/.test(left) || !/수금 입력/.test(left)) errs.push('② credit detail shows the credit left and how to use it');
  /* ③ 수금 입력: 인보이스 먼저, 크레딧 나중에 골라도 크레딧을 먼저 뺌 */
  await pg.evaluate(() => { location.hash = '#/entry/new'; }); await pg.waitForSelector('#fAcct');
  await pg.fill('#fAcct', '1111'); await pg.waitForTimeout(400); await pg.waitForSelector('.apr', { timeout: 6000 });
  const picks = await pg.$$eval('.apr', e => e.map(x => x.querySelector('b').textContent.replace(/\s+/g, ' ').trim())); log('③ picks:', picks.join(' | '));
  if (!picks.some(p => /^CM-000009 .*↩/.test(p))) errs.push('③ the open credit shows as a pick with the ↩ tag');
  await pg.fill('[data-pref="0"]', '5600'); await pg.fill('[data-pamt="0"]', '77000'); await pg.dispatchEvent('[data-pamt="0"]', 'input'); await pg.dispatchEvent('[data-pamt="0"]', 'change');
  const idx = no => picks.findIndex(p => p.startsWith(no));
  await pg.click('.apr[data-pk="' + idx('A10055') + '"]'); await pg.waitForTimeout(300); await pg.click('.apr[data-pk="' + idx('CM-000009') + '"]'); await pg.waitForTimeout(300);
  const amts = await pg.$$eval('[data-iamt]', e => e.map(x => x.value)); const sum = (await pg.textContent('#invSum')).replace(/\s+/g, ' ').trim(); log('③ alloc:', amts.join(' | '), '·', sum.slice(0, 120));
  if (amts.join('|') !== '800.00|-30.00' || (await pg.$('.part'))) errs.push('③ invoice 800 + credit −30 with $770 received → 800.00 | -30.00, no partial (got ' + amts.join('|') + ')');
  await pg.context().close();
  /* ② 인보이스 조회 · ④ 사무실 일부 사용 */
  const of = await mk('luke@theonefl.com', 1100);   // v0.8.181: 1200px 이상은 주문 칸이 고정 서랍에 (t177)
  await of.evaluate(() => { location.hash = '#/order'; }); await of.waitForSelector('[data-lf="inv"]', { timeout: 8000 }); await of.click('[data-lf="inv"]');
  await of.waitForSelector('[data-im="date"]', { timeout: 8000 }); await of.click('[data-im="date"]'); await of.waitForTimeout(700);
  await of.waitForSelector('[data-it="CM"]', { timeout: 8000 }).catch(() => errs.push('② invoice lookup has the ↩ CM credit chip'));
  if (await of.$('[data-it="CM"]')) { await of.click('[data-it="CM"]'); await of.waitForTimeout(400); if (await of.$('[data-ip="month"]')) { await of.click('[data-ip="month"]'); await of.waitForTimeout(700); } }
  const cmRow = await of.$('[data-go="inv:CM-000009"]'); log('② CM row in lookup:', !!cmRow); if (!cmRow) errs.push('② the credit memo shows in invoice lookup (this month, CM type)'); else { await cmRow.click(); await of.waitForTimeout(1000); }
  const h = await of.evaluate(() => location.hash); log('② open CM →', h); if (h !== '#/credit/CM-000009') errs.push('② opening a credit memo goes to the credit screen');
  const r = await of.evaluate(async () => { const M = await import('/src/mgr.js'); await M.applyToInvoices('E-TEST', [{ no: 'CM-000009', amt: -10 }], true); return window.__MOCK_STORE__.invoices['CM-000009']; }); log('④ after partial:', JSON.stringify({ bal: r.bal, paid: r.paid }));
  if (Math.abs(r.bal + 20) > 0.001) errs.push('④ using −10 of a −30 credit leaves −20 (got ' + r.bal + ')');
  await of.context().close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
