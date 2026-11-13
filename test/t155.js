/* v0.8.174 시험 — 📅 담당자 주문 목록은 기본 날짜별 · 줄 맨 앞에 날짜 · 📤 보낼 때 주문 날짜 = 보낸 날 (처음 시작한 날은 d0)
 *   ① 세일즈맨이 10/31 에 시작한 임시 주문을 오늘 보내면 orders.d · ym 이 오늘, d0 = 10/31 (같은 날 시작한 주문은 d0 없음)
 *   ② 담당자 📥 신규 주문 목록: 처음 열면 📅 날짜별 묶음(날짜 머리줄)이고 줄의 첫 글자가 날짜 · 표(컴퓨터)에서는 날짜 열이 번호 열 앞 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8820', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const today = (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(new Date()));
  const mk = async (email, W, seed) => { const pg = await (await br.newContext({ viewport: { width: W, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.seed) window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed }); await pg.goto('http://127.0.0.1:8820/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  /* ① 10/31 임시 주문 둘 (하나는 오늘 시작) → 보내기 */
  const seed = "s.orders = (s.orders || []).concat([{ id: 'O-OLD', no: 'O261031-OLD1', d: '2026-10-31', ym: '2026-10', sm: 'BRANDON', acct: '1111', store: 'ALI B/S # 1', st: 'draft', n: 1, qty: 2, amt: 5, createdBy: 'brandon@x.com', createdAt: '2026-10-31T15:00:00Z', updatedAt: '2026-10-31T15:00:00Z' }, { id: 'O-NEW', no: 'O-NEW1', d: '" + today + "', ym: '" + today.substring(0, 7) + "', sm: 'BRANDON', acct: '1271', store: 'BEAUTY 4U', st: 'draft', n: 1, qty: 1, amt: 2.5, createdBy: 'brandon@x.com', createdAt: '" + today + "T10:00:00Z', updatedAt: '" + today + "T10:00:00Z' }]); s.orderLines = (s.orderLines || []).concat([{ id: 'O-OLD', sm: 'BRANDON', lines: [{ c: 'AHG100', d: 'x', q: 2, p: 2.5 }] }, { id: 'O-NEW', sm: 'BRANDON', lines: [{ c: 'AHG100', d: 'x', q: 1, p: 2.5 }] }]);";
  const sp = await mk('brandon@x.com', 430, seed);
  await sp.evaluate(() => { location.hash = '#/order'; }); await sp.waitForSelector('#nav button', { state: 'attached' }); await sp.waitForTimeout(1200);
  const sendBtn = await sp.$('#oSendAll, [data-sd]'); log('① drafts to send:', await sp.$$eval('[data-sd]', e => e.length));
  if (!(await sp.$('[data-sd]'))) errs.push('① draft list shows the two drafts');
  else { const btn = await sp.$('#oSendAll'); if (btn) { await btn.click(); } else { const b2 = await sp.$('button:has-text("보내기")'); if (b2) await b2.click(); } await sp.waitForTimeout(400); if (await sp.$('#cfOk')) await sp.click('#cfOk'); await sp.waitForTimeout(1500); }
  const O = await sp.evaluate(() => { const M = window.__MOCK_STORE__.orders || {}; return ['O-OLD', 'O-NEW'].map(id => M[id] ? { id, st: M[id].st, d: M[id].d, ym: M[id].ym, d0: M[id].d0 || null } : null); }); log('① after send:', JSON.stringify(O));
  const old = O[0], nw = O[1];
  if (!old || old.st !== 'sent' || old.d !== today || old.ym !== today.substring(0, 7) || old.d0 !== '2026-10-31') errs.push('① old draft gets today as order date and keeps 10/31 as d0');
  if (!nw || nw.st !== 'sent' || nw.d !== today || nw.d0) errs.push('① same-day draft: date today, no d0');
  await sp.close();
  /* ② 담당자 목록 — 폰: 날짜별 묶음 · 줄 앞 날짜 */
  const st = await mk('luke@theonefl.com', 430, seed.replace("st: 'draft'", "st: 'sent', sentAt: '2026-10-31T16:00:00Z'").replace("st: 'draft'", "st: 'sent', sentAt: '" + today + "T11:00:00Z'"));
  await st.evaluate(() => { location.hash = '#/view/manager'; }); await st.waitForTimeout(600);
  await st.evaluate(() => { window.dispatchEvent(new CustomEvent('theone:list', { detail: 'sent' })); }); await st.waitForTimeout(1500);
  const grpOn = await st.$eval('[data-grp="day"]', b => b.classList.contains('on')).catch(() => null); log('② day chip on:', grpOn);
  if (grpOn !== true) errs.push('② staff list opens grouped by day');
  const heads = await st.$$eval('.cgrp, tr.grp', e => e.map(x => x.textContent.replace(/\s+/g, ' ').slice(0, 30))); log('② group heads:', heads.slice(0, 3));
  if (!heads.length) errs.push('② day group headers present');
  const firstSub = await st.$eval('.crow .sub, .crow small', e => e.textContent.trim()).catch(() => ''); log('② first row sub:', firstSub.slice(0, 40));
  if (!/^\d{1,2}\/\d{1,2}/.test(firstSub)) errs.push('② phone row starts with the date (got "' + firstSub.slice(0, 20) + '")');
  await st.close();
  /* ② 컴퓨터 표: 날짜 열이 번호 열 앞 */
  const pc = await mk('luke@theonefl.com', 1200, seed.replace("st: 'draft'", "st: 'sent', sentAt: '" + today + "T11:00:00Z'"));
  await pc.evaluate(() => { location.hash = '#/view/manager'; }); await pc.waitForTimeout(600);
  await pc.evaluate(() => { window.dispatchEvent(new CustomEvent('theone:list', { detail: 'sent' })); }); await pc.waitForTimeout(1500);
  const ths = await pc.$$eval('table.otbl thead th', t => t.map(x => x.textContent.replace(/\s+/g, ' ').trim())); log('② table heads:', ths.join(' | '));
  const iD = ths.findIndex(t => /날짜/.test(t)), iN = ths.findIndex(t => /번호/.test(t)); if (!(iD >= 0 && iN >= 0 && iD < iN)) errs.push('② table: date column before number column');
  await pc.close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
