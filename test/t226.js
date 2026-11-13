/* v0.8.204 시험 — ⚙️ 설정(☰ 서랍) 정리: 묶음별(입력 · 알림 / 연결 / 이 기기) 줄 모양 · 버튼 id 그대로 · 숫자 입력 바꾸기 · 📡 창 · 🔎 점검 · 포르투갈어 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8926', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 390, height: 900 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; });
  await pg.goto('http://127.0.0.1:8926/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(400);
  await pg.click('#hMenu'); await pg.waitForSelector('#drawer .dset', { timeout: 5000 });
  /* ① 묶음 머리 · 줄 모양 (예전 b-ghost 버튼 덩어리 아님) */
  const heads = await pg.$$eval('#drawer .dset .dsh', L => L.map(x => x.textContent.trim())); log('groups:', heads);
  ['입력 · 알림', '연결', '이 기기'].forEach(h => { if (!heads.includes(h)) errs.push('settings should have group ' + h); });
  for (const id of ['mPush', 'mNet', 'mDiag', 'mReload']) { const c = await pg.getAttribute('#drawer #' + id, 'class').catch(() => null); if (!c || !/dsrow/.test(c)) errs.push('#' + id + ' should be a settings row'); }
  if (await pg.$('#drawer .dset .b-ghost')) errs.push('settings should not use the old loose ghost buttons');
  const sub = (await pg.textContent('#drawer #mNet small')).trim(); log('mNet sub:', sub); if (!/온라인|오프라인/.test(sub)) errs.push('connection row should show online state');
  /* ② 숫자 입력 바꾸기 */
  await pg.click('#drawer [data-np="1"]'); await pg.waitForTimeout(300);
  const np = await pg.evaluate(() => { try { return localStorage.getItem('theone.numpad'); } catch (e) { return null; } }); log('numpad pref:', np); if (np !== '1') errs.push('choosing the pad should save theone.numpad = 1');
  /* ③ 🔎 점검 결과가 연결 묶음 안에 */
  await pg.click('#drawer #mDiag'); await pg.waitForFunction(() => { const e = document.getElementById('diagOut'); return e && e.textContent.length > 20 && !/점검 중/.test(e.textContent); }, null, { timeout: 15000 }).catch(() => errs.push('check connection should print results'));
  if (!(await pg.$('#drawer .dsgrp #diagOut'))) errs.push('diag output should sit inside the connection group');
  /* ④ 📡 창 */
  await pg.click('#drawer #mNet'); await pg.waitForSelector('#modal.on #netX', { timeout: 3000 }).catch(() => errs.push('📡 row should open the connection sheet')); await pg.click('#netX').catch(() => {});
  /* ⑤ 포르투갈어 */
  await pg.click('#hMenu'); await pg.waitForSelector('#drawer [data-lang="pt"]'); await pg.click('#drawer [data-lang="pt"]'); await pg.waitForTimeout(800);
  await pg.click('#hMenu').catch(() => {}); await pg.waitForSelector('#drawer .dset .dsh', { timeout: 5000 });
  const pt = (await pg.textContent('#drawer .dset')).replace(/\s+/g, ' '); log('pt:', pt.slice(0, 200));
  ['Entrada · avisos', 'Conexão', 'Este aparelho', 'Teclado popup', 'Teclado do celular'].forEach(w => { if (!pt.includes(w)) errs.push('PT settings should say ' + w); });
  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL'); errs.forEach(e => console.log(' -', e)); process.exit(1); }
  console.log('PASS');
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
