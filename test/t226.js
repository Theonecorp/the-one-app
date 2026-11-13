/* v0.8.205 시험 — ⚙️ 설정: ☰ 서랍에는 ⚙️ 설정 한 줄만 → 설정 화면(#/settings)에 묶음별(화면 바꾸기 · 입력 · 알림 / 연결 / 이 기기) · 버튼 id 그대로 · 숫자 입력 · 📡 창 · 🔎 점검 · 포르투갈어 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8926', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 390, height: 900 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; });
  await pg.goto('http://127.0.0.1:8926/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(400);
  /* ⓪ 서랍은 가볍게: 설정 버튼들은 없고 ⚙️ 설정 한 줄 */
  await pg.click('#hMenu'); await pg.waitForSelector('#drawer [data-dgo="settings"]', { timeout: 5000 }).catch(() => errs.push('drawer should have one ⚙️ settings row'));
  for (const sel of ['#mPush', '#mNet', '#mDiag', '#mReload', '[data-np]', '[data-r]', '.dseg']) if (await pg.$('#drawer ' + sel)) errs.push('drawer should not hold ' + sel + ' any more');
  await pg.click('#drawer [data-dgo="settings"]'); await pg.waitForSelector('.stpage', { timeout: 5000 }).catch(() => errs.push('settings row should open the settings page'));
  if (!/#\/settings/.test(await pg.evaluate(() => location.hash))) errs.push('settings page should live at #/settings');
  const ht = (await pg.textContent('#hTitle')).trim(); log('header title:', ht); if (!/설정/.test(ht)) errs.push('header title should say 설정');
  /* ① 묶음 머리 · 줄 모양 (예전 b-ghost 버튼 덩어리 아님) */
  const heads = await pg.$$eval('.stpage .sth', L => L.map(x => x.textContent.trim())); log('groups:', heads);
  ['화면 바꾸기', '입력 · 알림', '연결', '이 기기'].forEach(h => { if (!heads.includes(h)) errs.push('settings should have group ' + h); });
  for (const id of ['mPush', 'mNet', 'mDiag', 'mReload']) { const c = await pg.getAttribute('.stpage #' + id, 'class').catch(() => null); if (!c || !/strow/.test(c)) errs.push('#' + id + ' should be a settings row'); }
  const sub = (await pg.textContent('.stpage #mNet small')).trim(); log('mNet sub:', sub); if (!/온라인|오프라인/.test(sub)) errs.push('connection row should show online state');
  /* ② 숫자 입력 바꾸기 */
  await pg.click('.stpage [data-np="1"]'); await pg.waitForTimeout(300);
  const np = await pg.evaluate(() => { try { return localStorage.getItem('theone.numpad'); } catch (e) { return null; } }); log('numpad pref:', np); if (np !== '1') errs.push('choosing the pad should save theone.numpad = 1');
  /* ③ 🔎 점검 결과가 연결 묶음 안에 */
  await pg.click('.stpage #mDiag'); await pg.waitForFunction(() => { const e = document.getElementById('diagOut'); return e && e.textContent.length > 20 && !/점검 중/.test(e.textContent); }, null, { timeout: 15000 }).catch(() => errs.push('check connection should print results'));
  if (!(await pg.$('.stpage .stbox #diagOut'))) errs.push('diag output should sit inside the connection group');
  /* ④ 📡 창 */
  await pg.click('.stpage #mNet'); await pg.waitForSelector('#modal.on #netX', { timeout: 3000 }).catch(() => errs.push('📡 row should open the connection sheet')); await pg.click('#netX').catch(() => {});
  /* ⑤ 포르투갈어 */
  await pg.click('#hMenu'); await pg.waitForSelector('#drawer [data-lang="pt"]'); await pg.click('#drawer [data-lang="pt"]'); await pg.waitForTimeout(800); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(400); log('after lang hash:', await pg.evaluate(() => location.hash));
  await pg.click('#hMenu'); await pg.click('#drawer [data-dgo="settings"]'); await pg.waitForSelector('.stpage .sth', { timeout: 5000 });
  const pt = (await pg.textContent('.stpage')).replace(/\s+/g, ' '); log('pt:', pt.slice(0, 200));
  ['Configurações', 'Trocar tela', 'Entrada · avisos', 'Conexão', 'Este aparelho', 'Teclado popup', 'Teclado do celular'].forEach(w => { if (!pt.includes(w)) errs.push('PT settings should say ' + w); });
  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL'); errs.forEach(e => console.log(' -', e)); process.exit(1); }
  console.log('PASS');
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
