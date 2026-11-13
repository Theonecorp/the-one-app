/* v0.8.202 시험 — ✍️ 회계 담당도 수금 입력 · 📋 수금 입력의 AR 미결 인보이스는 가게 기준 (2026-11-12 관리자: "회계 담당도 수금 입력을 할 수 있도록 · 수금 입력에서 AR 미결 인보이스가 제대로 안 뜸")
 *   ① 회계 담당(job acct): 💵 수금 묶음에 ✍️ 수금 입력 칸 → 누르면 수금 입력 화면
 *   ② 회계 담당이 ALI B/S # 1(1111 · BRANDON 가게)을 고르면 AR 미결 인보이스 A10055 가 뜸 · 세일즈맨이 이미 받은 A10021 은 빠짐 (전에는 입력하는 사람 본인 세일즈맨 코드로 찾아서 비었음)
 *   ④ 🚗 세일즈 모드의 관리자(LUKE)가 BRANDON 가게(1111) 수금을 넣으면 '누구 이름으로?' → BRANDON 을 고르면 수금이 BRANDON 으로 저장 (BEAUTY EXCHANGE #13 이 LUKE 로 들어가 ALEX 수령 대기 · 정산에 안 보였던 일)
 *   ③ 세일즈맨 BRANDON 자기 가게: 예전처럼 미결 인보이스가 뜸 (A10021 은 시험 자료에서 이미 받은 것) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8908', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const open = async email => { const pg = await (await br.newContext({ viewport: { width: 1000, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = s => { s.users[0].sm = 'LUKE'; s.users.push({ id: 'acct@x.com', email: 'acct@x.com', name: 'ACC', role: 'manager', job: 'acct', active: true }); }; }, { email });
    await pg.goto('http://127.0.0.1:8908/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  const arFor = async (pg, q, code) => {
    await pg.evaluate(() => { location.hash = '#/entry'; }); await pg.waitForSelector('#fStore', { timeout: 8000 });
    await pg.fill('#fStore', q); await pg.waitForTimeout(400); const hit = await pg.$('[data-ac="' + code + '"]'); if (hit) await hit.click(); else await pg.press('#fStore', 'Enter');
    await pg.waitForTimeout(1500); return (await pg.textContent('#arPick').catch(() => '')).replace(/\s+/g, ' ');
  };
  /* ① */
  const a = await open('acct@x.com');
  await a.evaluate(() => { location.hash = '#/hub/money'; }); await a.waitForTimeout(1200);
  const tile = await a.$('#hubBody [data-hub="entry"], #page [data-go="entry"], #page [data-hk="entry"]');
  const hubTxt = (await a.textContent('#page')).replace(/\s+/g, ' '); log('① money hub has 수금 입력:', /수금 입력/.test(hubTxt), 'tile el:', !!tile);
  if (!/수금 입력/.test(hubTxt)) errs.push('① accounting sees ✍️ 수금 입력 in the money hub');
  /* ② */
  const t2 = await arFor(a, 'ali', '1111'); log('② acct AR list:', t2.slice(0, 160));
  if (!/A10055/.test(t2)) errs.push('② accounting sees the store\'s open AR invoices'); if (/A10021/.test(t2)) errs.push('② A10021 already collected by the salesman is not shown as open');
  /* ③ */
  const b = await open('brandon@x.com');
  const t3 = await arFor(b, 'ali', '1111'); log('③ salesman AR list:', t3.slice(0, 120));
  if (!/A10055/.test(t3)) errs.push('③ salesman still sees their open AR invoices');
  /* ④ */
  const c = await open('luke@theonefl.com');
  await c.evaluate(() => { location.hash = '#/view/salesman'; }); await c.waitForTimeout(700);
  await c.evaluate(() => { location.hash = '#/entry'; }); await c.waitForSelector('#fStore', { timeout: 8000 });
  await c.fill('#fStore', 'ali'); await c.waitForTimeout(400); await c.click('[data-ac="1111"]'); await c.waitForTimeout(500);
  const ask = await c.$('#cfSmOther'); log('④ asked whose payment:', !!ask, ask ? await ask.textContent() : '');
  if (!ask) errs.push('④ admin in sales mode is asked whose payment');
  else { await ask.click(); await c.waitForTimeout(300);
    await c.fill('[data-pref="0"]', '5551'); await c.fill('[data-pamt="0"]', '100'); await c.dispatchEvent('[data-pamt="0"]', 'input'); await c.waitForTimeout(200);
    await c.click('#btnSave'); await c.waitForTimeout(400); if (await c.$('#cfOk')) await c.click('#cfOk'); await c.waitForTimeout(1500);
    const sv = await c.evaluate(() => Object.values(window.__MOCK_STORE__.entries).filter(e => e.createdBy === 'luke@theonefl.com' && e.acct === '1111').map(e => e.sm)); log('④ saved sm:', JSON.stringify(sv));
    if (!sv.includes('BRANDON')) errs.push('④ saved under BRANDON'); }
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
