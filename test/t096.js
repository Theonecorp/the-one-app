/* v0.8.119 시험 — ☁️ 사진 작업대에서 사진을 올리면 앱 썸네일(itemPhotos) + 드라이브용 큰 사진 큐(photoUploads, drive: wait)가 함께 저장되고, 머리에 대기 장수가 보임 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8838', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 430, height: 900 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; });
  await pg.goto('http://127.0.0.1:8838/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.evaluate(() => { location.hash = '#/photos'; }); await pg.waitForSelector('#phGrid .phcard', { timeout: 10000 }).catch(() => errs.push('photo workbench missing'));
  await pg.fill('#phQ', 'AHG100'); await pg.waitForTimeout(500); await pg.waitForSelector('[data-pf="AHG100"]', { timeout: 6000, state: 'attached' }).catch(() => errs.push('photo input for AHG100 missing'));
  /* 1200×900 JPEG 만들기 */
  const b64 = await pg.evaluate(() => { const c = document.createElement('canvas'); c.width = 1200; c.height = 900; const x = c.getContext('2d'); for (let i = 0; i < 40; i++) { x.fillStyle = 'hsl(' + (i * 9) + ',70%,50%)'; x.fillRect((i % 8) * 150, Math.floor(i / 8) * 180, 150, 180); } x.fillStyle = '#000'; x.font = '80px sans-serif'; x.fillText('AHG100', 100, 500); return c.toDataURL('image/jpeg', 0.9).split(',')[1]; });
  await pg.setInputFiles('[data-pf="AHG100"]', { name: 'AHG100.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') }); await pg.waitForTimeout(2500);
  const st = await pg.evaluate(() => { const S = window.__MOCK_STORE__; const th = S.itemPhotos && S.itemPhotos.AHG100; const ups = Object.values(S.photoUploads || {}); return { thumb: th ? th.data.length : 0, ups: ups.map(u => ({ code: u.code, drive: u.drive, len: (u.data || '').length, mime: u.mime, head: (u.data || '').slice(0, 22) })) }; }); log('saved:', JSON.stringify(st));
  if (!st.thumb) errs.push('app thumbnail should be saved'); if (st.ups.length !== 1 || st.ups[0].code !== 'AHG100' || st.ups[0].drive !== 'wait' || !/^data:image\/jpeg/.test(st.ups[0].head)) errs.push('one Drive upload queued for AHG100 expected'); if (st.ups.length && st.ups[0].len <= st.thumb) errs.push('Drive copy should be larger than the thumbnail');
  await pg.evaluate(() => { location.hash = '#/items'; }); await pg.waitForTimeout(600); await pg.evaluate(() => { location.hash = '#/photos'; }); await pg.waitForSelector('#phDrive', { timeout: 8000 }); await pg.waitForTimeout(800);
  const line = await pg.textContent('#phDrive'); log('drive line:', line); if (!/대기/.test(line) || !/1/.test(line)) errs.push('header should show 1 waiting for Drive');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
