/* v0.8.67 시험 — 🗺 지도: 좌표 없는 가게도 ZIP 대략 위치로 보임 · 📍 정확한 위치 찾기 (Census JSONP, 시험에선 가짜 응답) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8785', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  fs.mkdirSync(path.resolve(__dirname, 'out'), { recursive: true });
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } });
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  let calls = 0;
  await pg.route(/geocoding\.geo\.census\.gov/, r => { calls++; const cb = new URL(r.request().url()).searchParams.get('callback'); r.fulfill({ contentType: 'application/javascript', body: cb + '({"result":{"addressMatches":[{"coordinates":{"x":-81.38,"y":28.54}}]}})' }); });
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'Luke' };
    window.__AFTER_SEED__ = s => { (s.accounts || []).forEach((a, i) => { delete a.lat; delete a.lng; if (!a.zip) a.zip = i % 2 ? '32801' : '33101'; }); }; });
  await pg.goto('http://127.0.0.1:8785/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.evaluate(() => { location.hash = '#/stores'; }); await pg.waitForSelector('[data-stm="map"]'); await pg.click('[data-stm="map"]');
  await pg.waitForSelector('#mapInfo b', { timeout: 20000 }); await pg.waitForTimeout(800);
  const info = ((await pg.textContent('#mapInfo')) || '').replace(/\s+/g, ' '); log('info:', info.slice(0, 200));
  const [shown, total] = info.match(/(\d+) \/ (\d+)/).slice(1).map(Number);
  if (!shown || shown !== total) errs.push('all stores should be on the map by ZIP: ' + shown + '/' + total);
  const marks = await pg.$$eval('.leaflet-overlay-pane path, .leaflet-overlay-pane canvas', x => x.length); if (!marks) errs.push('no markers drawn');
  const cw = await pg.$eval('.leaflet-overlay-pane canvas', c => c.getBoundingClientRect().width); if (!(cw > 100)) errs.push('marker canvas collapsed (width ' + cw + ') — global canvas{max-width} CSS'); 
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'map_zip.png') });
  if (!(await pg.$('#geoGo'))) errs.push('no geocode button'); else {
    await pg.click('#geoGo'); await pg.waitForFunction(() => !document.querySelector('#geoGo') || /✅/.test(document.getElementById('mapInfo').textContent) && /정확|exact/.test(document.getElementById('mapInfo').textContent) && !/\(\d+곳\)/.test(document.getElementById('geoGo') ? '' : 'x'), null, { timeout: 30000 }).catch(() => {});
    await pg.waitForTimeout(1500);
    const n = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.accounts).filter(a => a.lat).length); log('census calls', calls, 'saved lat', n);
    if (!calls || !n) errs.push('geocode did not save');
    const info2 = ((await pg.textContent('#mapInfo')) || '').replace(/\s+/g, ' '); log('info2:', info2.slice(0, 160));
  }
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
