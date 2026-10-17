/* v0.6.4 시험 — 분류 순서 (📌 위 → ABC → 📌 아래) · ✨ 자주 나가는 · 코드 순 · 📄 인보이스 찾기 (기간 · 날짜별 · 가게로) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8770', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  fs.mkdirSync(path.resolve(__dirname, 'out'), { recursive: true });
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); const errs = [], log = (...a) => console.log(...a);
  pg.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n')[1])); pg.on('dialog', d => d.accept());
  const shot = n => pg.screenshot({ path: path.resolve(__dirname, 'out', n + '.png'), fullPage: true });
  const T = new Date(), d0 = T.toISOString().substring(0, 10), d1 = new Date(T - 86400000).toISOString().substring(0, 10), d40 = new Date(T - 40 * 86400000).toISOString().substring(0, 10);
  await pg.addInitScript(([d0, d1, d40]) => {
    window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'Luke' };
    window.__AFTER_SEED__ = s => {
      s.settings[0].ordersOn = true;
      s.settings[0].catPins = { top: ['Wax'], bottom: ['Chains'] };
      /* 사진 규칙: AHG100(gold) 과 AHG101(silver) 이 같은 사진 → 둘 다 뺌, AHG102 는 URL 에 코드 → 유지, 세트는 구성품 사진 안 빌림 */
      const rows = JSON.parse(s.catalog[1].j); rows[0][9] = 'https://cdn.x/files/shared.jpg'; rows[1][9] = 'https://cdn.x/files/shared.jpg'; rows[2][9] = 'https://cdn.x/files/AHG102.jpg'; rows[3][9] = 'https://cdn.x/files/AHG103-1.jpg'; rows[4][9] = 'https://cdn.x/files/only.jpg';
      rows[0][1] = 'ALUMINUM HOOP GOLD 100'; rows[1][1] = 'ALUMINUM HOOP SILVER 101'; rows[9][7] = 'GUMMY"'; rows[14][7] = 'GUMM'; s.catalog[1].j = JSON.stringify(rows);
      s.catalog.push({ id: 'pop', j: JSON.stringify([['GM104', 500], ['EB103', 300], ['AHG100', 200], ['AHG101', 150]]), n: 4 });
      const mk = (no, t, d, acct, store, sm, total, st) => ({ id: no, no, t, d, ym: d.substring(0, 7), acct, store, sm, order: 'O261014-AAAA', orderId: 'O261014-AAAA', qty: 10, sub: total, disc: 0, total, bal: total, terms: 'N30', st: st || 'open', lines: [{ c: 'AHG100', d: 'x', q: 10, p: total / 10 }], createdAt: d + 'T10:00:00Z' });
      s.invoices = [mk('G00001', 'G', d0, '3001', 'BEAUTY EXCHANGE ORLANDO', 'ALEX', 100), mk('P00001', 'P', d0, '3001', 'BEAUTY EXCHANGE ORLANDO', 'ALEX', 50), mk('G00002', 'G', d1, '1049', 'ELEGANT BEAUTY', 'SOO', 80), mk('G00003', 'G', d40, '3001', 'BEAUTY EXCHANGE ORLANDO', 'ALEX', 70), mk('H00001', 'H', d1, '1049', 'ELEGANT BEAUTY', 'SOO', 30, 'x')];
    };
  }, [d0, d1, d40]);
  await pg.goto('http://127.0.0.1:8770/test/demo.html'); await pg.waitForSelector('#nav button');
  /* 1. 오더 화면 분류 순서 */
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ');
  await pg.fill('#eStoreQ', 'beauty ex'); await pg.waitForTimeout(150); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(400); await pg.waitForTimeout(700); if (await pg.$('#ssX')) { await pg.click('#ssX'); await pg.waitForTimeout(150); }
  await shot('h0_cats');
  const tiles = await pg.$$eval('.cats button', els => els.map(e => e.querySelector('b').textContent.trim()));
  log('L1 tiles:', tiles.join(' | '));
  if (!tiles[0].startsWith('✨ 자주 나가는') || tiles[1] !== 'Wax' || tiles[tiles.length - 1] !== 'Chains') errs.push('tile order wrong: ' + tiles.join('|'));
  const mid = tiles.slice(2, -1); if (mid.join() !== mid.slice().sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })).join()) errs.push('not ABC: ' + mid.join('|'));
  /* ✨ 자주 나가는: 이 가게(3001) 가 최근 산 AHG100 · AHG101 먼저, 그 다음 GM104 EB103 */
  await pg.click('[data-pop]'); await pg.waitForTimeout(300); await shot('h1_pop');
  const pop = await pg.$$eval('#eRes .gcard b, #eRes .irow .ct > b', els => els.map(e => e.textContent.trim().split(' ')[0]));
  log('pop:', pop.slice(0, 6).join(' '), '|', (await pg.textContent('#eRes .muted')).trim());
  if (pop[0] !== 'AHG100' || pop[1] !== 'AHG101' || pop[2] !== 'GM104') errs.push('pop order wrong: ' + pop.slice(0, 4).join(','));
  await pg.click('[data-pop]'); await pg.waitForTimeout(200);
  /* 분류 안은 코드 순 */
  await pg.click('[data-ck="Wax"]'); await pg.waitForTimeout(300);
  const codes = await pg.$$eval('#eRes .gcard b, #eRes .irow .ct > b', els => els.map(e => e.textContent.trim().split(' ')[0]).slice(0, 5));
  log('Wax codes:', codes.join(' '));
  if (codes.join() !== codes.slice().sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).join()) errs.push('codes not sorted');
  /* 2. 관리 → 분류 📌 */
  await pg.evaluate(() => { location.hash = '#/admin/tree'; }); await pg.waitForSelector('[data-tren]'); await shot('h2_tree');
  await pg.click('[data-tin="Jewelry"]'); await pg.waitForTimeout(200);
  log('Jewelry kids:', await pg.$$eval('[data-tin]', els => els.map(e => e.querySelector('b').textContent).join(' | ')));
  await pg.click('[data-tup="Chains"]'); await pg.waitForTimeout(600);
  const after = await pg.$$eval('[data-tin]', els => els.map(e => e.querySelector('b').textContent));
  log('after pin top:', after.join(' | '));
  if (!/Chains/.test(after[0])) errs.push('pin top failed: ' + after.join('|'));
  await pg.click('[data-tup="Chains"]'); await pg.waitForTimeout(600);
  log('after unpin:', await pg.$$eval('[data-tin]', els => els.map(e => e.querySelector('b').textContent).join(' | ')));
  /* 🧹 비슷한 이름 합치기: GUMMY" → GUMMY */
  await pg.click('[data-tp="0"]'); await pg.waitForTimeout(200);
  log('dupes:', await pg.$$eval('[data-dupe]', els => els.length), (await pg.textContent('#adminBody')).includes('GUMMY"') ? 'found GUMMY"' : 'no GUMMY"');
  if (await pg.$('#dupeAll')) { await pg.click('#dupeAll'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(900); }
  else if (await pg.$('[data-dupe]')) { await pg.click('[data-dupe]'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(900); }
  log('dupes after:', await pg.$$eval('[data-dupe]', els => els.length));
  if (await pg.$$eval('[data-dupe]', els => els.length)) errs.push('dupe merge left items');
  await pg.click('[data-tin="Jewelry"]'); await pg.waitForTimeout(300);
  /* ➡️ 분류 옮기기: Jewelry › Chains → Hair 아래로 */
  await pg.click('[data-tmv="Chains"]'); await pg.waitForSelector('#tmvTo'); await pg.selectOption('#tmvTo', 'Hair'); await pg.click('#tmvOk'); await pg.waitForTimeout(900);
  log('after move (Hair kids):', await pg.$$eval('[data-tin]', els => els.map(e => e.querySelector('b').textContent).join(' | ')));
  if (!(await pg.$$eval('[data-tin]', els => els.some(e => /Chains/.test(e.textContent))))) errs.push('moveCatTo failed');
  /* 🔎 코드로 아이템 분류 바꾸기: GM104 → Level 1 "Wax Premium" */
  await pg.fill('#tCode', 'GM104'); await pg.waitForTimeout(150); await pg.click('#tCodeGo'); await pg.waitForSelector('#tf_l1'); await pg.fill('#tf_l1', 'Wax Premium'); await pg.click('#tfOk'); await pg.waitForTimeout(900);
  await pg.fill('#tCode', 'GM104'); await pg.waitForTimeout(150); const fixed = await pg.textContent('#tCodeOut'); log('item fix:', fixed.replace(/\s+/g, ' ').trim());
  if (!/Wax Premium/.test(fixed)) errs.push('itemFix failed: ' + fixed);
  /* 사진 규칙 — 오더 담기 화면에서 코드별 사진 확인 */
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eQ1');
  const phs = [];
  for (const c of ['AHG100', 'AHG101', 'AHG102', 'EB103', 'GM104', 'FI-TEST01']) {
    await pg.fill('#eQ1', c); await pg.waitForTimeout(350);
    phs.push(c + '=' + (await pg.$$eval('#eRes .gcard', (els, c) => { const e = els.find(x => x.dataset.gc === c); return e && e.dataset.ph ? e.dataset.ph : '-'; }, c)));
  }
  log('photos:', phs.join(' '));
  if (!/AHG100=-/.test(phs[0]) || !/AHG101=-/.test(phs[1]) || !/AHG102=.*AHG102/.test(phs[2]) || !/EB103=.*AHG103-1/.test(phs[3]) || !/GM104=.*only/.test(phs[4]) || !/FI-TEST01=-/.test(phs[5])) errs.push('photo rule: ' + phs.join(' '));
  await pg.fill('#eQ1', '');
  /* 2a. 🐝 SmartBee 분류로 한 번에 */
  await pg.evaluate(() => { location.hash = '#/admin/tree'; }); await pg.waitForSelector('#sbmGo'); await pg.waitForTimeout(200);
  await pg.click('#sbmGo'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(2500);
  const sbmRoot = await pg.$$eval('[data-tin]', els => els.map(e => e.querySelector('b').textContent));
  log('after sbm:', sbmRoot.join(' | '));
  if (!sbmRoot.some(x => /Jewelry/.test(x))) errs.push('sbm apply failed: ' + sbmRoot.join('|'));
  await pg.click('[data-tin="Jewelry"]'); await pg.waitForTimeout(300);
  log('sbm L1:', (await pg.$$eval('[data-tin]', els => els.map(e => e.querySelector('b').textContent))).slice(0, 8).join(' | '));
  await shot('h2a_sbm');
  /* 2b. 담당자 오더 목록 — 현황 띠 · 날짜별 묶음 */
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForSelector('[data-hg="sent"]'); await pg.waitForTimeout(500); await shot('h2b_staff_home');
  log('staff home tiles:', await pg.$$eval('[data-hg]', els => els.map(e => e.dataset.hg + '(' + e.querySelector('small').textContent + ')').join(' ')));
  await pg.click('[data-hg="sent"]'); await pg.waitForSelector('#oStrip'); await pg.waitForTimeout(600); await shot('h2b_staff_list');
  log('strip:', (await pg.textContent('#oStrip')).replace(/\s+/g, ' '));
  /* 3. 📄 인보이스 찾기 */
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForSelector('[data-lf="inv"]'); await pg.click('[data-lf="inv"]'); await pg.waitForSelector('#iqQ'); await pg.waitForSelector('.iday'); await shot('h3_inv_month');
  const dayHeads = () => pg.$$eval('.iday b', els => els.map(e => e.textContent));
  log('month days:', (await dayHeads()).join(' | '), '| kpi:', (await pg.textContent('#iList .kpi')).replace(/\s+/g, ' '));
  const rowsN = () => pg.$$eval('#iList [data-go]', els => els.length);
  const nMonth = await rowsN();
  await pg.click('[data-ip="today"]'); await pg.waitForTimeout(300); const nToday = await rowsN(); log('today rows:', nToday);
  if (nToday !== 2) errs.push('today should be 2, got ' + nToday);
  await pg.click('[data-ip="2m"]'); await pg.waitForTimeout(300); const n2m = await rowsN(); log('2m rows:', n2m);
  if (n2m !== 4) errs.push('2m should be 4 (void hidden), got ' + n2m);
  await pg.click('[data-ivoid]'); await pg.waitForTimeout(300); log('with void:', await rowsN());
  await pg.click('[data-ivoid]'); await pg.waitForTimeout(300);
  await pg.click('[data-it="P"]'); await pg.waitForTimeout(300); log('type P:', await rowsN()); if (await rowsN() !== 1) errs.push('type filter');
  await pg.click('[data-it=""]'); await pg.waitForTimeout(300);
  await pg.fill('#iqQ', 'elegant'); await pg.waitForTimeout(700); await shot('h4_inv_store');
  log('store search:', await rowsN(), '|', (await pg.textContent('#iList')).includes('이 가게 인보이스 전부') ? 'account mode' : 'text mode');
  await pg.fill('#iqQ', '3001'); await pg.waitForTimeout(700); const nAcc = await rowsN(); log('acct 3001 (all time):', nAcc);
  if (nAcc !== 3) errs.push('acct mode should be 3, got ' + nAcc);
  await pg.fill('#iqQ', 'G00002'); await pg.waitForTimeout(700); log('by no:', await rowsN());
  await pg.click('#iqX'); await pg.waitForTimeout(300);
  await pg.click('[data-ip="custom"]'); await pg.waitForTimeout(300); log('custom inputs:', !!(await pg.$('#iFrom')));
  await pg.click('#iList [data-go]'); await pg.waitForSelector('#iBack'); await pg.click('#iBack'); await pg.waitForSelector('#iqQ'); log('back to browser ok');
  await shot('h5_inv_back');
  log('ERRORS:', errs.length ? errs : 'none');
  await br.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})();
