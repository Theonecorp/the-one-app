/* v0.8.171 시험 — 🔐 보안 2차: H3 직무별 규칙 · M2 크레딧 한도 · L4 세일즈맨 주문 칸 제한 (firestore.rules 불변식 + 크레딧 화면)
 *   ① firestore.rules: 직무 helper(staffJob · money · invJob · ordJob · opsJob · itemJob) 가 있고 수금 · COD · ACH · 리포트 · 체크 · 정산은 money() 만, 아이템 · 재고 · 사진은 itemJob(), 주문 · 출고 · UPS 는 ordJob(), 인보이스는 invJob()
 *      — isStaff() 로 쓰기가 열린 컬렉션이 돈 · 아이템 · 주문 묶음에 하나도 남지 않음. 세일즈맨 크레딧은 creditMax() 안 · reviewed 못 붙임. 세일즈맨 주문 수정은 번호 · 피킹 · 출고 · 인보이스 칸을 못 건드림
 *   ② 크레딧 화면: settings/app.creditMax 를 넘는 크레딧은 세일즈맨이 확정 못 함 (⛔ 표시 · 확정 누르면 안내) · 한도 안은 확정됨 · 사무실(인보이스 권한)은 한도 없음 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const errs = [], log = (...a) => console.log(...a);
  /* ① 규칙 */
  const R = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
  const block = c => { const m = R.match(new RegExp('match /' + c + '/\\{[a-z]+\\} \\{[^]*?\\n    \\}|match /' + c + '/\\{[a-z]+\\} \\{[^\\n]*\\}')); return m ? m[0] : ''; };
  ['staffJob', 'money()', 'invJob()', 'ordJob()', 'opsJob()', 'itemJob()', 'creditMax()'].forEach(f => { if (R.indexOf('function ' + f.replace('()', '')) < 0) errs.push('① rules must define ' + f); });
  const want = { money: ['entries', 'bounces', 'checkReq', 'envelopes', 'reports', 'cod', 'ach', 'ar', 'settlements', 'deductions'], itemJob: ['catalog', 'stock', 'stockLog', 'receipts', 'itemPhotos', 'photoUploads'], ordJob: ['orders', 'orderLines', 'backorders', 'shipq', 'pickups', 'displays', 'adhoc', 'shipments', 'upsLog'], invJob: ['invoices', 'salesM'], opsJob: ['accounts', 'counters'] };
  Object.entries(want).forEach(([fn, cols]) => cols.forEach(c => { const b = block(c); if (!b) return errs.push('① no rule block for ' + c); if (b.indexOf(fn + '()') < 0) errs.push('① ' + c + ' must be gated by ' + fn + '()'); if (/allow (write|create|update|delete|create, delete|update, delete|create, update|read, write)[^\n]*: if isStaff\(\)/.test(b) && c !== 'ar') errs.push('① ' + c + ' still allows a staff write by isStaff()'); }));
  if (!/function money\(\) \{ return staffJob\(\['office', 'acct'\]\); \}/.test(R)) errs.push('① money() = office · acct only');
  if (/function itemJob[^\n]*'acct'/.test(R)) errs.push('① itemJob() must exclude acct');
  if (/function ordJob[^\n]*'(acct|catalog|itemmgr)'/.test(R)) errs.push('① ordJob() must exclude acct · catalog · itemmgr');
  if (!/function staffJob\(jobs\) \{ let r = role\(\); return isAdminEmail\(\) \|\| r == 'admin' \|\| r == 'owner' \|\| \(r == 'manager' && userDoc\(\)\.get\('job', 'office'\) in jobs\); \}/.test(R)) errs.push('① staffJob: admin · owner all, manager by users.job (default office)');
  /* M2 */
  const inv = block('invoices');
  if (!/request\.resource\.data\.total >= -creditMax\(\)/.test(inv)) errs.push('① salesman credit must be capped by creditMax()');
  if (!/request\.resource\.data\.get\('reviewed', false\) == false/.test(inv)) errs.push('① salesman credit must not be reviewed');
  if (!/settings\/app\)\.data\.get\('creditMax', 10000\)/.test(R)) errs.push('① creditMax() reads settings/app.creditMax (default 10000 · v0.8.179)');
  if (!/staffJob\(\['whmgr', 'pick'\]\) && request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(\['shipTo', 'store', 'updatedAt'\]\)/.test(inv)) errs.push('① warehouse may only change shipTo · store on invoices');
  /* L4 */
  const smu = (R.match(/function smOrderUpdate\(\) \{[^]*?\n    \}/) || [''])[0];
  ['no', 'createdBy', 'picker', 'pickAt', 'packAt', 'track', 'shipAt', 'pickupId', 'invs', 'cfReq', 'cfHow'].forEach(k => { if (smu.indexOf("'" + k + "'") < 0) errs.push('① smOrderUpdate must block field ' + k); });
  if (!/okSt\(request\.resource\.data\.st\)\n\s+&& !keys\.hasAny\(\[/.test(smu)) errs.push('① content edit branch must use !keys.hasAny([...])');
  if (/isStaff\(\)/.test(smu)) errs.push('① smOrderUpdate is salesman-only');
  log('① rules checks done · errs so far', errs.length);

  /* ② 크레딧 화면 */
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8849', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const ctx = await br.newContext({ viewport: { width: 430, height: 1000 } });
  const seed = `s.settings[0].creditMax = 5; s.invoices = (s.invoices || []).concat([{ id: 'A-000500', no: 'A-000500', t: 'A', d: '2026-10-01', ym: '2026-10', acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', lines: [{ c: 'AHG100', d: 'x', q: 6, p: 2.5, lp: 2.5 }], qty: 6, sub: 15, list: 15, disc: 0, total: 15, bal: 15, st: 'open' }]);`;
  const mk = async (email) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed }); await pg.goto('http://127.0.0.1:8849/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  const txt = async (pg, q) => ((await pg.textContent(q).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const fill = async (pg, qty) => { await pg.evaluate(() => { location.hash = '#/credit/new'; }); await pg.waitForSelector('#crStore', { timeout: 8000 });
    await pg.fill('#crStore', 'ali'); await pg.waitForSelector('#crHits [data-a="1111"]'); await pg.click('#crHits [data-a="1111"]'); await pg.waitForTimeout(600);
    await pg.click('[data-crw="대미지"]'); await pg.fill('#crItem', 'AHG100'); await pg.press('#crItem', 'Enter'); await pg.waitForTimeout(400);
    await pg.fill('[data-crp="AHG100"]', '2.5'); await pg.$eval('[data-crp="AHG100"]', e => e.dispatchEvent(new Event('change')));
    await pg.fill('[data-crq="AHG100"]', String(qty)); await pg.$eval('[data-crq="AHG100"]', e => e.dispatchEvent(new Event('change'))); await pg.waitForTimeout(300); };
  const cms = pg => pg.evaluate(() => Object.values(window.__MOCK_STORE__.invoices).filter(x => x.src === 'credit').length);
  /* 세일즈맨 · 한도 5 · 4 × 2.5 = 10 → 막힘 */
  let pg = await mk('brandon@x.com'); await fill(pg, 4);
  let tot = await txt(pg, '#crTot'); log('② over:', tot.slice(0, 160));
  if (!/⛔/.test(tot) || !/\$5\.00/.test(tot)) errs.push('② over-limit credit shows ⛔ with the limit');
  await pg.click('#crGo'); await pg.waitForTimeout(600);
  if (await pg.$('#cfOk')) errs.push('② over-limit must not reach the confirm box');
  const t1 = await txt(pg, '#toast'); log('② toast:', t1); if (!/한도|limit/i.test(t1)) errs.push('② toast tells the limit');
  if (await cms(pg)) errs.push('② no CM saved over the limit');
  /* 2 × 2.5 = 5 → 한도 안 */
  await pg.fill('[data-crq="AHG100"]', '2'); await pg.$eval('[data-crq="AHG100"]', e => e.dispatchEvent(new Event('change'))); await pg.waitForTimeout(300);
  tot = await txt(pg, '#crTot'); if (/⛔/.test(tot)) errs.push('② within limit: no ⛔');
  await pg.click('#crGo'); await pg.waitForSelector('#cfOk', { timeout: 5000 }).catch(() => errs.push('② within limit reaches confirm')); if (await pg.$('#cfOk')) { await pg.click('#cfOk'); await pg.waitForTimeout(1200); }
  log('② CMs after within-limit confirm:', await cms(pg)); if ((await cms(pg)) !== 1) errs.push('② within-limit CM saved');
  await pg.close();
  /* 사무실 (관리자) — 한도 없음 */
  pg = await mk('luke@theonefl.com'); await fill(pg, 4);
  tot = await txt(pg, '#crTot'); if (/⛔/.test(tot)) errs.push('② office has no limit');
  await pg.click('#crGo'); await pg.waitForSelector('#cfOk', { timeout: 5000 }).catch(() => errs.push('② office over-limit reaches confirm'));
  await pg.close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
