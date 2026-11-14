/* v0.8.241 시험 — ‹ 뒤로가기 (2026-11-14 관리자: "뒤로가기 버튼 도로 · 누르면 바로 전 화면 · 다만 주문을 보냈다거나 크레딧 확정 · 수금 입력 · COD/ACH/카드 입력 — 값이 저장된 경우에는 확정 전이 아니라 그 메뉴의 첫 화면으로")
 *   ① 세일즈맨: 홈 → 가게 → 카탈로그 — ‹ 단추가 보이고 누르면 바로 전 화면(가게) · 한 번 더 → 홈
 *   ② 수금 입력: 금액을 넣고 저장 → 오늘 내역으로 감 → ‹ 를 누르면 저장 전 입력이 아니라 수금 입력 첫 화면(빈 칸) · 다음 ‹ 는 보통 뒤로
 *   ③ 저장한 뒤 다른 화면으로 옮겨 가면 그 뒤 ‹ 는 보통 뒤로 (저장 표시는 사라짐) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8968', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await (await br.newContext({ viewport: { width: 430, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'B' }; window.open = () => null; });
  await pg.goto('http://127.0.0.1:8968/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(700);
  const hash = () => pg.evaluate(() => location.hash), backVis = () => pg.evaluate(() => getComputedStyle(document.getElementById('hBack')).display !== 'none');
  const back = async () => { await pg.click('#hBack'); await pg.waitForTimeout(500); };
  /* ① */
  const h0 = await hash();
  await pg.evaluate(() => { location.hash = '#/stores'; }); await pg.waitForTimeout(500); await pg.evaluate(() => { location.hash = '#/cat'; }); await pg.waitForTimeout(600);
  const v1 = await backVis(); await back(); const a1 = await hash(); await back(); const a2 = await hash();
  log('① start', h0, '| back visible', v1, '| back →', a1, '→', a2);
  if (!v1 || a1 !== '#/stores' || a2 !== h0) errs.push('① back goes to the screen just before (catalog → stores → home)');
  /* ② */
  await pg.evaluate(() => { location.hash = '#/entry/new'; }); await pg.waitForSelector('#fAcct'); await pg.fill('#fAcct', '1111'); await pg.waitForTimeout(500);
  await pg.fill('[data-pref="0"]', '4242'); await pg.fill('[data-pamt="0"]', '10000'); await pg.dispatchEvent('[data-pamt="0"]', 'input'); await pg.dispatchEvent('[data-pamt="0"]', 'change');
  await pg.click('#btnSave'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1200);
  const s1 = await hash(), v2 = await backVis(); await back(); const s2 = await hash();
  const form = await pg.evaluate(() => ({ acct: (document.getElementById('fAcct') || {}).value, amt: (document.querySelector('[data-pamt="0"]') || {}).value }));
  log('② after save at', s1, '| back visible', v2, '| back →', s2, JSON.stringify(form));
  if (!/#\/mine/.test(s1) || !v2 || !/^#\/entry\/?$/.test(s2) || form.acct || (form.amt && form.amt !== '0.00')) errs.push('② after saving a payment, back opens the empty payment screen (not the filled form)');
  await back(); const s3 = await hash(); log('② next back →', s3); if (/^#\/entry/.test(s3)) errs.push('② the next back leaves the payment screen');
  /* ③ */
  await pg.evaluate(() => { location.hash = '#/entry/new'; }); await pg.waitForSelector('#fAcct'); await pg.fill('#fAcct', '1111'); await pg.waitForTimeout(500);
  await pg.fill('[data-pref="0"]', '4243'); await pg.fill('[data-pamt="0"]', '5000'); await pg.dispatchEvent('[data-pamt="0"]', 'input'); await pg.dispatchEvent('[data-pamt="0"]', 'change');
  await pg.click('#btnSave'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1200);
  await pg.evaluate(() => { location.hash = '#/stores'; }); await pg.waitForTimeout(500); await back(); const t1 = await hash();
  log('③ saved → moved to stores → back →', t1); if (!/#\/mine/.test(t1)) errs.push('③ after moving elsewhere, back is the normal previous screen');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
