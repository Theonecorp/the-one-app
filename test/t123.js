/* v0.8.160 시험 — 📋 백오더 목록 · 📄 인보이스 조회 목록에서도 위 메뉴의 다른 묶음 칸(📥 접수 · 📦 출고 · ✅ 완료)이 눌린다 (v0.8.174 부터 단계 단추 대신 모든 칸이 항상 보임)
 *   v0.8.125 단계 묶음 도입 때 두 목록의 bind() 가 [data-lg] 를 묶지 않아 그 두 화면에서는 단계 단추가 반응이 없었음 (홈을 거쳐야 했음) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8877', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; });
  await pg.goto('http://127.0.0.1:8877/test/demo.html'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(400);
  /* 홈 묶음 타일로 목록 열기 (접힌 묶음은 펴서) */
  const goList = async k => {
    await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForSelector('[data-lf="home"], [data-hg="sent"]'); await pg.waitForTimeout(300);
    if (await pg.$('[data-lf="home"]')) { await pg.click('[data-lf="home"]'); await pg.waitForSelector('[data-hg="sent"]'); await pg.waitForTimeout(300); }
    await pg.evaluate(k => { const t = document.querySelector('[data-hg="' + k + '"]'), g = t && t.closest('.hgrp'); if (g) g.classList.add('open'); }, k); await pg.click('[data-hg="' + k + '"]');
    await pg.waitForTimeout(600);
  };
  /* v0.8.174: 단계 단추가 없어지고 모든 칸이 항상 보임 — 그 목록에서 다른 묶음의 칸(data-lf)이 바로 눌리는지 */
  const chipOn = () => pg.$eval('.omenu [data-lf].on', b => b.dataset.lf).catch(() => '');
  const check = async (list, toStage, chipInStage) => {
    await goList(list); const before = await chipOn(); log(list, 'list — chip on:', before);
    if (!(await pg.$('.omenu [data-og="' + toStage + '"] [data-lf="' + chipInStage + '"]'))) { errs.push(list + ': chip ' + chipInStage + ' (stage ' + toStage + ') not rendered'); return; }
    await pg.click('.omenu [data-og="' + toStage + '"] [data-lf="' + chipInStage + '"]'); await pg.waitForTimeout(700);
    const after = await chipOn(); log(list, '→ clicked', chipInStage, '— chip on:', after);
    if (after !== chipInStage) errs.push(list + ' list: chip ' + chipInStage + ' should open that list (was ' + before + ', now ' + after + ')');
  };
  await check('bo', 'recv', 'sent');     // 📋 백오더 목록(⏳ 기타) → 📥 접수
  await check('inv', 'ship', 'pick');    // 📄 인보이스 조회(✅ 완료 · 조회) → 📦 출고
  await check('pick', 'fin', 'inv');     // 비교: 원래 되던 목록(출고) → ✅ 완료 · 조회
  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL'); errs.forEach(e => console.log(' -', e)); process.exit(1); }
  console.log('PASS');
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
