/* v0.8.172 시험 — 👤 담당자 주문: 가게에 기본 세일즈맨이 없으면 저장할 때 세일즈맨 고르는 창이 뜨고, 요약의 세일즈맨 칸을 눌러도 고름 (위 고정 머리 아래 선택 칸은 내리면 안 보여 "세일즈맨을 고르세요" 만 뜨던 문제)
 *   ① 오피스 담당자가 기본 세일즈맨 없는 가게로 주문 → 💾 저장 → #smPick 창(세일즈맨 목록) → 고르면 저장됨 (orders 문서 sm) · 닫으면 저장 안 됨
 *   ② 📝 메모 탭 요약의 세일즈맨 칸([data-smk]) 누르면 같은 창 · 고르면 칸에 코드 · 위 선택 칸(#eSm)도 같이 바뀜
 *   ③ 기본 세일즈맨 있는 가게는 창 없이 바로 저장 · 세일즈맨 모드에는 [data-smk] 없음
 *   ④ (v0.8.173) 관리자가 🚗 세일즈 모드로 주문: 자기 세일즈맨 코드가 없어 비던 세일즈맨 — 가게 기본 세일즈맨이 있으면 자동, 없으면 저장 때 고르는 창 (위 선택 칸도 보임) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8813', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const SEED = "s.users.push({ id: 'office@x.com', email: 'office@x.com', name: 'O', role: 'manager', job: 'office', active: true }); s.accounts.push({ id: '9777', acct: '9777', store: 'NO SM STORE', addr: '1 ST', city: 'MIAMI', state: 'FL', zip: '33101' });";
  const mk = async email => { const pg = await (await br.newContext({ viewport: { width: 430, height: 900 } })).newPage();   /* 페이지마다 새 컨텍스트 — 작성 중 주문(localStorage)이 섞이지 않게 */ pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed: SEED }); await pg.goto('http://127.0.0.1:8813/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  const newOrder = async (pg, q) => { await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pg.fill('#eStoreQ', q); await pg.waitForTimeout(250); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(900); if (await pg.$('#modal.on')) { await pg.click('#modal .mclose'); await pg.waitForTimeout(200); }
    await pg.fill('#eQ1', 'AHG100'); await pg.press('#eQ1', 'Enter'); await pg.waitForTimeout(400); };
  const orders = pg => pg.evaluate(() => Object.values(window.__MOCK_STORE__.orders || {}).map(o => ({ store: o.store, sm: o.sm, st: o.st })));
  /* ① 저장 → 고르는 창 */
  const pg = await mk('office@x.com');
  await newOrder(pg, 'NO SM');
  log('① sm select at top:', await pg.$eval('#eSm', e => e.value || '(empty)'));
  await pg.click('#eDraft'); await pg.waitForTimeout(500);
  if (await pg.$('#cfOk')) errs.push('① must not go straight to the confirm box without a salesman');
  await pg.waitForSelector('#smPick', { timeout: 5000 }).catch(() => errs.push('① save without salesman opens the picker'));
  const names = await pg.$$eval('[data-smp]', b => b.map(x => x.dataset.smp)); log('① picker:', names.join(' ')); if (!names.includes('ALEX') || !names.includes('BRANDON')) errs.push('① picker lists the salesmen');
  await pg.click('#smPickX'); await pg.waitForTimeout(300); if ((await orders(pg)).some(o => o.store === 'NO SM STORE')) errs.push('① closing the picker must not save');
  await pg.click('#eDraft'); await pg.waitForSelector('#smPick', { timeout: 5000 }); await pg.click('[data-smp="ALEX"]'); await pg.waitForTimeout(400);
  if (await pg.$('#cfOk')) { await pg.click('#cfOk'); } await pg.waitForTimeout(1200);
  const o1 = (await orders(pg)).filter(o => o.store === 'NO SM STORE'); log('① saved:', JSON.stringify(o1));
  if (o1.length !== 1 || o1[0].sm !== 'ALEX') errs.push('① order saved with the chosen salesman');
  /* ② 요약 칸 */
  await newOrder(pg, 'NO SM');
  await pg.click('[data-ev="memo"]'); await pg.waitForSelector('[data-smk]', { timeout: 5000 }).catch(() => errs.push('② memo summary has a salesman cell to tap'));
  if (await pg.$('[data-smk]')) {
    await pg.$eval('[data-smk]', e => e.click()); await pg.waitForSelector('#smPick', { timeout: 5000 }).catch(() => errs.push('② tapping the summary cell opens the picker'));
    await pg.click('[data-smp="BRANDON"]'); await pg.waitForTimeout(400);
    const k = await pg.$eval('#eSmK', e => e.textContent), top = await pg.$eval('#eSm', e => e.value); log('② after pick:', k, top);
    if (k !== 'BRANDON' || top !== 'BRANDON') errs.push('② summary cell and top select both show the chosen salesman');
  }
  await pg.close();
  /* ③ 기본 세일즈맨 있는 가게 · 세일즈맨 모드 */
  const p2 = await mk('office@x.com'); await newOrder(p2, 'ali'); await p2.click('#eDraft'); await p2.waitForTimeout(500);
  if (await p2.$('#smPick')) errs.push('③ store with a default salesman saves without the picker');
  if (await p2.$('#cfOk')) await p2.click('#cfOk'); await p2.waitForTimeout(1000);
  const o3 = (await orders(p2)).filter(o => o.store === 'ALI B/S # 1'); log('③ ali order sm:', o3.map(o => o.sm).join(',')); if (!o3.some(o => o.sm === 'BRANDON')) errs.push('③ default salesman kept');
  await p2.close();
  const sp = await mk('brandon@x.com'); await newOrder(sp, 'ali'); await sp.click('[data-ev="memo"]'); await sp.waitForTimeout(300);
  if (await sp.$('[data-smk]')) errs.push('③ salesman mode has no salesman picker cell'); await sp.close();
  /* ④ 관리자 · 세일즈 모드 (자기 세일즈맨 코드 없음) */
  const ad = await mk('luke@theonefl.com'); await ad.evaluate(() => { location.hash = '#/view/salesman'; }); await ad.waitForTimeout(600);
  const nav = await ad.$$eval('#nav button', b => b.map(x => x.dataset.go).join(' ')); log('④ sales-mode nav:', nav); if (!/hub\/smoney/.test(nav)) errs.push('④ admin switched to sales mode');
  await newOrder(ad, 'NO SM');
  if (!(await ad.$('#eSm'))) errs.push('④ sales mode without own code shows the salesman select');
  await ad.click('#eDraft'); await ad.waitForTimeout(500);
  if (await ad.$('#cfOk')) errs.push('④ must not go straight to the confirm box');
  await ad.waitForSelector('#smPick', { timeout: 5000 }).catch(() => errs.push('④ save opens the picker in sales mode (was: toast 세일즈맨을 고르세요 only)'));
  if (await ad.$('#smPick')) { await ad.click('[data-smp="ALEX"]'); await ad.waitForTimeout(400); if (await ad.$('#cfOk')) await ad.click('#cfOk'); await ad.waitForTimeout(1200); }
  const o4 = (await orders(ad)).filter(o => o.store === 'NO SM STORE'); log('④ saved:', JSON.stringify(o4)); if (o4.length !== 1 || o4[0].sm !== 'ALEX') errs.push('④ order saved with the chosen salesman');
  await newOrder(ad, 'ali'); const smAli = await ad.$eval('#eSm', e => e.value); log('④ ali default sm:', smAli); if (smAli !== 'BRANDON') errs.push('④ store default salesman fills in automatically in sales mode');
  await ad.close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
