/* v0.8.188 시험 — 👤 기본 세일즈맨 없는 가게에 한 번 고른 세일즈맨을 가게 기본값으로 저장 → 다음 주문부터 묻지 않음 (2026-11-12 관리자: "오더 넣을 때 가게 선택하면 또 세일즈맨 넣으라고 계속 나오네")
 *   ① 오피스 담당자 · 기본 세일즈맨 없는 가게 → 💾 저장 → 고르는 창에 "이 가게의 기본 세일즈맨으로 저장" (기본 체크) → ALEX → 주문 sm ALEX · accounts.sm ALEX (sm 칸만 · 다른 칸 그대로)
 *   ② 같은 가게로 새 주문 → 가게를 고르자마자 세일즈맨 ALEX · 저장 때 창 없음
 *   ③ 체크를 끄고 고르면 그 주문만 (가게 기본값 그대로 빈칸)
 *   ④ 기본 세일즈맨이 있는 가게는 창에서 다른 사람을 골라도 가게 기본값은 바뀌지 않음 · 체크 칸도 없음
 *   ⑤ 가게를 바꾸면 세일즈맨도 새 가게 것으로 (앞 가게 세일즈맨이 남지 않음) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8865', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const SEED = "s.users.push({ id: 'office@x.com', email: 'office@x.com', name: 'O', role: 'manager', job: 'office', active: true }); s.accounts.push({ id: '9777', acct: '9777', store: 'NO SM STORE', addr: '1 ST', city: 'MIAMI', state: 'FL', zip: '33101', tel: '305' }, { id: '9778', acct: '9778', store: 'OTHER NOSM SHOP', addr: '2 ST', city: 'MIAMI', state: 'FL', zip: '33101' });";
  const pg = await (await br.newContext({ viewport: { width: 430, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { email: 'office@x.com', seed: SEED });
  await pg.goto('http://127.0.0.1:8865/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  const chg = async () => { await pg.click('#eStoreX'); await pg.waitForTimeout(300); if (await pg.$('#cfOk')) await pg.click('#cfOk'); await pg.waitForSelector('#eStoreQ'); };
  const pick = async q => { await pg.fill('#eStoreQ', q); await pg.waitForTimeout(250); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(900); if (await pg.$('#modal.on')) { await pg.click('#modal .mclose'); await pg.waitForTimeout(200); } };
  const newOrder = async q => { await pg.evaluate(() => { localStorage.removeItem('theone.order.wip.office@x.com'); location.hash = '#/order'; }); await pg.waitForTimeout(300); await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pick(q);
    await pg.fill('#eQ1', 'AHG100'); await pg.press('#eQ1', 'Enter'); await pg.waitForTimeout(400); };
  const acc = id => pg.evaluate(id => Object.assign({}, window.__MOCK_STORE__.accounts[id]), id);
  const orders = st => pg.evaluate(st => Object.values(window.__MOCK_STORE__.orders || {}).filter(o => o.store === st).map(o => o.sm), st);
  const save = async () => { await pg.waitForTimeout(600); await pg.click('#eDraft'); await pg.waitForTimeout(500); };
  const finish = async () => { if (await pg.$('#cfOk')) await pg.click('#cfOk'); await pg.waitForTimeout(1200); if (await pg.$('#acNo')) { await pg.click('#acNo'); await pg.waitForTimeout(300); } };
  /* ① */
  await newOrder('NO SM'); await save();
  await pg.waitForSelector('#smPick', { timeout: 5000 }).catch(() => errs.push('① picker opens'));
  const keep = await pg.$('#smKeep'); log('① keep box:', !!keep, keep && await keep.isChecked()); if (!keep || !(await keep.isChecked())) errs.push('① "save as this store\'s salesman" is shown and checked');
  await pg.click('[data-smp="ALEX"]'); await pg.waitForTimeout(400); await finish();
  const a1 = await acc('9777'); log('① account:', a1.sm, a1.tel, a1.store, '| orders:', JSON.stringify(await orders('NO SM STORE')));
  if (a1.sm !== 'ALEX' || a1.tel !== '305' || a1.store !== 'NO SM STORE' || a1.smBy !== 'office@x.com') errs.push('① account sm = ALEX (only the sm field changes)');
  if ((await orders('NO SM STORE')).join() !== 'ALEX') errs.push('① order saved with ALEX');
  /* ② */
  await newOrder('NO SM'); const top = await pg.$eval('#eSm', e => e.value); log('② salesman after picking the store:', top); if (top !== 'ALEX') errs.push('② picking the store fills ALEX');
  await save(); if (await pg.$('#smPick')) errs.push('② no picker the second time'); await finish();
  if ((await orders('NO SM STORE')).join() !== 'ALEX,ALEX') errs.push('② second order saved with ALEX');
  /* ③ */
  await newOrder('OTHER NOSM'); await save(); await pg.waitForSelector('#smPick', { timeout: 5000 }).catch(() => errs.push('③ picker opens'));
  if (await pg.$('#smKeep')) await pg.uncheck('#smKeep'); await pg.click('[data-smp="BRANDON"]'); await pg.waitForTimeout(400); await finish();
  const a3 = await acc('9778'); log('③ account sm:', JSON.stringify(a3.sm), '| orders:', JSON.stringify(await orders('OTHER NOSM SHOP')));
  if (a3.sm) errs.push('③ unchecked → the store keeps no default'); if ((await orders('OTHER NOSM SHOP')).join() !== 'BRANDON') errs.push('③ order saved with BRANDON');
  /* ④ */
  await newOrder('ali'); await pg.click('[data-ev="memo"]'); await pg.waitForSelector('[data-smk]'); await pg.$eval('[data-smk]', e => e.click()); await pg.waitForSelector('#smPick');
  if (await pg.$('#smKeep')) errs.push('④ no keep box for a store that already has a salesman');
  await pg.click('[data-smp="ALEX"]'); await pg.waitForTimeout(500); const a4 = await acc('1111'); log('④ ALI default stays:', a4.sm); if (a4.sm !== 'BRANDON') errs.push('④ store default unchanged');
  /* ⑤ */
  await chg(); await pick('OTHER NOSM'); const t5 = await pg.$eval('#eSm', e => e.value); log('⑤ after switching to a store with no salesman:', JSON.stringify(t5)); if (t5 !== '') errs.push('⑤ switching stores clears the previous store\'s salesman');
  await chg(); await pick('NO SM'); const t6 = await pg.$eval('#eSm', e => e.value); log('⑤ after switching to NO SM STORE:', t6); if (t6 !== 'ALEX') errs.push('⑤ switching stores takes the new store\'s salesman');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
