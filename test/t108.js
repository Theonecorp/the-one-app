/* v0.8.144 시험 — 🏷 라벨 인쇄는 디자인 · 카탈로그 담당만 (#/labels 표 → 체크 → 4×6" 미리보기) · 세일즈맨 아이템 창엔 라벨 단추 없음
 *   📁 사진 일괄 등록: 파일 이름 = 아이템 코드 (AHG100.png · "AHG101 (1).png") → 맞는 것만 저장, 못 찾은 것은 표시 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs'), os = require('os');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8857', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 420, height: 820 } });
  const mk = async (email, job) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.job) window.__AFTER_SEED__ = s => { s.users.push({ id: o.email, email: o.email, name: 'Dee', role: 'manager', job: o.job, active: true }); }; }, { email, job }); await pg.goto('http://127.0.0.1:8857/test/demo.html'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(500); return pg; };

  /* ---------- 디자이너: 아래 메뉴에 🖨 라벨 · #/labels 표 ---------- */
  let pg = await mk('design@x.com', 'catalog');
  const nav = await pg.$$eval('#nav button', b => b.map(x => x.dataset.go).join(',')); log('nav:', nav); if (!/labels/.test(nav)) errs.push('designer nav should have labels');
  await pg.evaluate(() => { location.hash = '#/labels'; }); await pg.waitForSelector('[data-lr]', { timeout: 8000 });
  const codes = await pg.$$eval('[data-lr]', r => r.map(x => x.dataset.lr)); log('rows:', codes.length, codes.slice(0, 3));
  if (codes.length < 3) errs.push('labels table should list items');
  if (!(await pg.$('.pgh h1'))) errs.push('labels page should have a title head');
  await pg.fill('#lbQ', codes[0]); await pg.waitForTimeout(400);
  const after = await pg.$$eval('[data-lr]', r => r.length); log('search →', after); if (after < 1 || after > 50) errs.push('search should narrow the table');
  await pg.click('[data-lr="' + codes[0] + '"]'); await pg.waitForTimeout(200);
  const barTxt = (await pg.textContent('#lbBar')).replace(/\s+/g, ' '); log('bar:', barTxt); if (!/1 /.test(barTxt)) errs.push('savebar should show 1 selected');
  await pg.click('#lbGo'); await pg.waitForSelector('[data-lz]', { timeout: 5000 });
  const sizes = await pg.$$eval('[data-lz]', b => b.map(x => x.dataset.lz)); log('sizes:', sizes); if (!sizes.includes('4x6') || !sizes.includes('3x15') || !sizes.includes('small')) errs.push('label sizes missing');
  await pg.click('[data-lz="4x6"]'); await pg.waitForTimeout(150); await pg.click('#lGo'); await pg.waitForSelector('#prt.on', { timeout: 10000 });
  const lb = await pg.$$eval('.lbls.s4x6 .lb', l => l.map(x => ({ loc: !!x.querySelector('.lloc'), svg: !!x.querySelector('svg'), code: x.querySelector('.lt b').textContent })));
  log('4x6 labels:', lb); if (lb.length !== 1 || !lb[0].svg || !lb[0].loc || lb[0].code !== codes[0]) errs.push('4x6 label should have code, aisle box and barcode');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'label_4x6.png') });
  await pg.evaluate(() => { document.getElementById('prt').classList.remove('on'); });
  /* 디자이너의 아이템 창에는 🏷 라벨 단추 */
  await pg.evaluate(c => { location.hash = '#/cat/' + c; }, codes[1]); await pg.waitForSelector('#modal.on', { timeout: 8000 }); await pg.waitForTimeout(300);
  if (!(await pg.$('#isLbl'))) errs.push('designer item sheet should have label button');
  await pg.close();

  /* ---------- 세일즈맨: 아이템 창에 라벨 단추 없음 · #/labels 막힘 ---------- */
  pg = await mk('brandon@x.com');
  await pg.evaluate(c => { location.hash = '#/cat/' + c; }, codes[1]); await pg.waitForSelector('#modal.on', { timeout: 8000 }); await pg.waitForTimeout(300);
  if (await pg.$('#isLbl')) errs.push('salesman should not see label button');
  await pg.evaluate(() => { location.hash = '#/labels'; }); await pg.waitForTimeout(600);
  const t = await pg.textContent('#page'); if (await pg.$('[data-lr]')) errs.push('salesman should not get the labels table'); log('salesman labels:', t.slice(0, 60));
  await pg.close();

  /* ---------- 디자이너: 📁 사진 일괄 등록 ---------- */
  pg = await mk('design@x.com', 'catalog');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulkph-')), src = path.resolve(__dirname, 'fixtures', 'check.png');
  const f1 = path.join(dir, codes[0] + '.png'), f2 = path.join(dir, codes[1] + ' (1).png'), f3 = path.join(dir, 'NOPE-ZZZ.png');
  [f1, f2, f3].forEach(f => fs.copyFileSync(src, f));
  await pg.evaluate(() => { location.hash = '#/photos/bulk'; }); await pg.waitForSelector('#bkF', { state: 'attached', timeout: 8000 });
  await pg.setInputFiles('#bkF', [f1, f2, f3]); await pg.waitForSelector('[data-bkr]', { timeout: 5000 });
  const matched = await pg.$$eval('[data-bkr]', r => r.map(x => x.dataset.bkr)), bad = await pg.$$eval('#bkBody tr.hid', r => r.length);
  log('matched:', matched, 'bad:', bad); if (matched.length !== 2 || !matched.includes(codes[0]) || !matched.includes(codes[1]) || bad !== 1) errs.push('bulk scan should match 2 and flag 1');
  await pg.click('#bkGo'); await pg.waitForSelector('#modal.on', { state: 'detached', timeout: 20000 }).catch(() => errs.push('bulk upload did not finish'));
  const saved = await pg.evaluate(cs => cs.map(c => !!(window.__MOCK_STORE__.itemPhotos && window.__MOCK_STORE__.itemPhotos[c] && window.__MOCK_STORE__.itemPhotos[c].data)), [codes[0], codes[1], 'NOPE-ZZZ']);
  log('saved:', saved); if (!saved[0] || !saved[1] || saved[2]) errs.push('bulk upload should save the 2 matched photos only');
  await pg.close();

  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL', errs); process.exit(1); } console.log('PASS');
})().catch(e => { console.error(e); process.exit(1); });
