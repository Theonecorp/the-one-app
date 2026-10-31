/* v0.8.83 시험 — 🎨 디자인 · 카탈로그 담당: 메뉴 · 홈(catmg) · 📷 사진 없는 아이템 카드 → 아이템 화면 '사진 없음' 걸러보기 → 아이템 열어 사진 올리기 · 안 쓰기 · 원래대로
 *   + 주문 배정 순서는 t068 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8805', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'design@x.com', name: 'Dee' }; window.__AFTER_SEED__ = s => { s.users.push({ id: 'design@x.com', email: 'design@x.com', name: 'Dee', role: 'manager', job: 'catalog', active: true }); }; });
  await pg.goto('http://127.0.0.1:8805/test/demo.html'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(800);
  const nav = await pg.$$eval('#nav button', b => b.map(x => x.dataset.go).join(',')); log('nav:', nav, 'hash:', await pg.evaluate(() => location.hash));
  if (nav !== 'catmg,items,photos,labels,cat') errs.push('catalog job nav wrong: ' + nav);
  await pg.waitForSelector('[data-nop]', { timeout: 8000 }).catch(() => errs.push('photo missing card not shown'));
  const tiles = await pg.$$eval('.cdash button', b => b.map(x => x.dataset.cg + '=' + x.querySelector('b').textContent)); log('tiles:', tiles); if (!tiles.some(t => /^photos\/noph=\d/.test(t))) errs.push('dashboard tiles missing');
  /* 📷 사진 작업대 — 카드에서 바로 올리기 → 사진 없음 목록에서 사라짐 */
  await pg.click('[data-cg="photos/noph"]'); await pg.waitForSelector('.phcard', { timeout: 8000 }); const n0 = await pg.$$eval('.phcard', c => c.length); const c0 = await pg.$eval('.phcard', c => c.dataset.pc);
  await pg.setInputFiles('.phcard [data-pf="' + c0 + '"]', path.resolve(__dirname, 'fixtures', 'check.png')); await pg.waitForTimeout(1800);
  const n1 = await pg.$$eval('.phcard', c => c.length), saved = await pg.evaluate(c => !!(window.__MOCK_STORE__.itemPhotos && window.__MOCK_STORE__.itemPhotos[c]), c0); log('workbench:', c0, n0, '→', n1, 'saved', saved); if (!saved || n1 !== n0 - 1) errs.push('workbench upload should save and drop the card');
  await pg.click('[data-pm="app"]'); await pg.waitForTimeout(500); const appN = await pg.$$eval('.phcard', c => c.length); if (appN !== 1) errs.push('app-photo filter should show 1');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'photo_bench.png') });
  await pg.click('[data-pr="' + c0 + '"]'); await pg.waitForTimeout(800);
  await pg.evaluate(() => { location.hash = '#/catmg'; }); await pg.waitForTimeout(800);
  const card = (await pg.textContent('#adminBody').catch(() => '')).replace(/\s+/g, ' '); log('home:', card.slice(0, 150));
  const miss0 = await pg.evaluate(() => [...document.querySelectorAll('[data-nop]')].map(b => b.textContent.trim()));
  log('missing chips:', miss0);
  /* 전체 → 아이템 화면 사진 없음 */
  await pg.click('[data-nop=""]'); await pg.waitForSelector('#itList .irow', { timeout: 8000 }); await pg.waitForTimeout(400);
  const seg = await pg.$eval('[data-im="noph"]', b => b.className + '|' + b.textContent.trim()); log('seg:', seg); if (!/^on/.test(seg)) errs.push('noph mode not active');
  const rows = await pg.$$eval('#itList .irow', r => r.map(x => (x.dataset.it || x.querySelector('[data-it]').dataset.it) + ':' + (x.querySelector('img') ? 'img' : x.querySelector('.noph') ? 'noph' : '?')));
  log('rows:', rows.slice(0, 5), rows.length); if (!rows.length || rows.some(r => !/noph$/.test(r))) errs.push('noph list should contain only items without photo');
  const code = rows[0].split(':')[0];
  /* 아이템 열어 사진 올리기 */
  await pg.click('[data-it="' + code + '"]'); await pg.waitForSelector('#fPhBox'); log('form photo:', (await pg.textContent('#fPhBox')).replace(/\s+/g, ' ').slice(0, 60));
  await pg.setInputFiles('#fPhFile', path.resolve(__dirname, 'fixtures', 'check.png')); await pg.waitForTimeout(1500);
  const st1 = await pg.evaluate(c => { const M = window.__MOCK_STORE__; const d = M.itemPhotos && M.itemPhotos[c]; return { has: !!d, size: d ? d.data.length : 0, jpeg: d ? d.data.startsWith('data:image/jpeg') : false, ver: !!(M.catalog.meta.photoVer), img: !!document.querySelector('#fPhBox img'), lab: (document.querySelector('#fPhBox .muted') || {}).textContent }; }, code);
  log('after upload:', st1); if (!st1.has || !st1.jpeg || st1.size > 90000 || !st1.ver || !st1.img || !/앱에서 올린/.test(st1.lab)) errs.push('upload failed / too big / not applied');
  /* 안 쓰기 → 원래대로 */
  await pg.click('#fPhNone'); await pg.waitForTimeout(800); const st2 = await pg.evaluate(c => ({ none: window.__MOCK_STORE__.itemPhotos[c].none, img: !!document.querySelector('#fPhBox img') }), code); log('none:', st2); if (!st2.none || st2.img) errs.push('photo off failed');
  await pg.click('#fPhClear'); await pg.waitForTimeout(800); const st3 = await pg.evaluate(c => ({ doc: !!(window.__MOCK_STORE__.itemPhotos[c]), lab: (document.querySelector('#fPhBox .muted') || {}).textContent }), code); log('clear:', st3); if (st3.doc || !/사진 없음/.test(st3.lab)) errs.push('clear failed');
  await pg.click('#fX'); await pg.waitForTimeout(300);
  /* 담당자(오피스)도 같은 사진 도구가 보이는지 · 세일즈맨은 catmg 못 봄 */
  await pg.evaluate(() => { location.hash = '#/items'; }); await pg.waitForTimeout(600);
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'catalog_job.png'), fullPage: true });
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
