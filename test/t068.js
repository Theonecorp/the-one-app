/* v0.8.79 시험 — 👷 할당 팝업: 신규 주문을 누르면 바로 뜸 · 창고 직원(pick1~4) 먼저 · 체크한 여러 건도 같은 팝업 · 📄 는 주문 열기 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8799', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  fs.mkdirSync(path.resolve(__dirname, 'out'), { recursive: true });
  const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'; const br = await pw.chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } });
  pg.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n')[1])); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => {
    window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'Luke' };
    window.__AFTER_SEED__ = s => {
      s.settings[0].ordersOn = true;
      const u = (email, name, job) => ({ id: email, email, name, role: 'manager', job, active: true });
      s.users.push(u('office@x.com', 'Amy Office', 'office'), u('pick3@x.com', 'Pick 3', 'pick'), u('pick10@x.com', 'Pick 10', 'pick'), u('wh@x.com', 'Warehouse Mgr', 'whmgr'), u('pick1@x.com', 'Pick 1', 'pick'), u('pick2@x.com', 'Pick 2', 'pick'), u('old@x.com', 'Gone', 'pick'));
      s.users.find(x => x.id === 'old@x.com').active = false;
      const o = s.orders[0], now = new Date().toISOString();
      s.orders.push(Object.assign({}, o, { id: 'O261015-BBBB', no: 'O261015-BBBB', store: 'ELEGANT BEAUTY', acct: '1049', sm: 'SOO', amt: 50, sentAt: now }), Object.assign({}, o, { id: 'O261015-CCCC', no: 'O261015-CCCC', amt: 20, sentAt: now }), Object.assign({}, o, { id: 'O261015-DDDD', no: 'O261015-DDDD', amt: 30, sentAt: now }));
      s.orders.push(Object.assign({}, o, { id: 'O261010-PPPP', no: 'O261010-PPPP', st: 'pick', picker: 'pick1@x.com', pickerName: 'Pick 1' }), Object.assign({}, o, { id: 'O261010-QQQQ', no: 'O261010-QQQQ', st: 'pick', picker: 'pick1@x.com', pickerName: 'Pick 1' }));
      s.orderLines.push({ id: 'O261015-BBBB', sm: 'SOO', lines: s.orderLines[0].lines }, { id: 'O261015-CCCC', sm: 'ALEX', lines: s.orderLines[0].lines }, { id: 'O261015-DDDD', sm: 'ALEX', lines: s.orderLines[0].lines });
      o.sentAt = now; s.orders.forEach(x => { if (x.st === 'sent' && x.id !== 'O261015-CCCC') x.cfOk = true; });   // CCCC 만 세일즈맨 확인 전
    };
  });
  await pg.goto('http://127.0.0.1:8799/test/demo.html'); await pg.waitForSelector('#nav button');
  const shot = n => pg.screenshot({ path: path.resolve(__dirname, 'out', n + '.png'), fullPage: true });
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(600); await pg.waitForSelector('.htile'); await pg.click('[data-hg="sent"]'); await pg.waitForSelector('[data-ck]');
  const ids = () => pg.$$eval('#page [data-oid]', e => e.map(x => x.dataset.oid));
  log('new (unconfirmed):', await ids());
  /* 0. v0.8.110: 📥 신규(확인 전) 주문은 누르면 주문이 열림 — 배정은 체크 뒤 👷 작업 배정(확인 없이) 으로, 먼저 묻고 → 팝업 */
  await pg.click('#page [data-oid="O261015-CCCC"] .ct'); await pg.waitForSelector('#mBack', { timeout: 4000 }).catch(() => errs.push('new order tap should open the order'));
  if (await pg.$('#pkOk')) errs.push('new-orders tab should not open the assign popup on tap');
  await pg.goBack(); await pg.waitForSelector('[data-ck]'); await pg.waitForTimeout(300);
  await pg.click('[data-ckw="O261015-CCCC"]'); await pg.click('#bkAssign'); await pg.waitForSelector('#cfOk', { timeout: 3000 }).then(() => pg.click('#cfOk')).catch(() => errs.push('unconfirmed order should ask first'));
  await pg.waitForSelector('#pkOk'); await pg.click('#pkX'); await pg.waitForTimeout(200);
  if (await pg.$('.qasg')) errs.push('old quick-assign bar should be gone');
  /* 1. 👍 확인 완료 목록 — 주문 한 줄을 누르면 → 할당 팝업 (주문 상세로 가지 않음) */
  await pg.click('[data-lf="cfok"]'); await pg.waitForSelector('[data-ck]'); const rows = await ids(); log('confirmed:', rows); if (rows.length !== 3) errs.push('expected 3 confirmed orders');
  await pg.click('#page [data-oid="O261015-BBBB"] .ct'); await pg.waitForSelector('#pkOk', { timeout: 4000 }).catch(() => errs.push('tapping an order should open the assign popup'));
  const opts = await pg.$$eval('[data-pk]', e => e.map(x => (x.classList.contains('on') ? '*' : '') + x.querySelector('b').textContent.trim() + ' / ' + x.querySelector('small').textContent.trim()));
  log('popup options:', opts);
  const names = opts.map(t => t.replace(/^\*/, '').split(' / ')[0].replace(/^[^ ]+ /, '').replace(/ \(.*$/, ''));
  const want = ['Pick 1', 'Pick 2', 'Pick 3', 'Pick 10', 'Amy Office', '회계 담당', 'Warehouse Mgr', 'Luke'];   // 창고 직원(숫자 순) → 오피스 · 인보이스 담당 → 창고 매니저 → 나
  if (names.join('|') !== want.join('|')) errs.push('picker order wrong: ' + names.join('|') + ' (want ' + want.join('|') + ')');
  if (!opts.length || !opts[0].startsWith('*')) errs.push('first picker should be preselected');
  if (!/2건 진행 중|2 in progress/.test(opts[0] || '')) errs.push('Pick 1 should show 2 in progress: ' + opts[0]);
  if (opts.some(t => /Gone/.test(t))) errs.push('inactive user should not be listed');
  const h2 = await pg.textContent('#mbox h2'); log('popup title:', h2.replace(/\s+/g, ' ').trim()); if (!/1건/.test(h2)) errs.push('single-order popup should say 1건');
  await shot('t068_popup');
  /* 📄 주문 열기 → 상세로 */
  await pg.click('#pkOpen'); await pg.waitForSelector('#mAssign'); const hs = await pg.evaluate(() => location.hash); log('open order ->', hs); if (!/O261015-BBBB/.test(hs)) errs.push('pkOpen should open the order');
  await pg.goBack(); await pg.waitForSelector('[data-ck]'); await pg.waitForTimeout(300);
  /* 2. Pick 2 를 골라 할당 */
  await pg.click('#page [data-oid="O261015-BBBB"] .ct'); await pg.waitForSelector('#pkOk');
  await pg.click('[data-pk="1"]'); await pg.evaluate(() => { document.getElementById('pkPrint').checked = false; }); await pg.click('#pkOk'); await pg.waitForTimeout(900);
  const o1 = await pg.evaluate(() => window.__MOCK_STORE__.orders['O261015-BBBB']); log('assigned:', o1.st, o1.picker, o1.pickerName); if (o1.st !== 'pick' || o1.picker !== 'pick2@x.com' || o1.pickerName !== 'Pick 2') errs.push('single assign to Pick 2 failed');
  /* 3. 여러 건 체크 → 아무 줄이나 누르면 체크한 것 전부 같은 팝업 */
  await pg.waitForSelector('[data-ck]'); log('left confirmed:', await ids()); await pg.click('[data-ckall="1"]'); await pg.click('#page [data-oid="O261014-AAAA"] .ct'); await pg.waitForSelector('#pkOk');
  const h2b = (await pg.textContent('#mbox h2')).replace(/\s+/g, ' ').trim(); log('multi title:', h2b); if (!/2건/.test(h2b)) errs.push('multi popup should cover 2 checked orders: ' + h2b);
  if (await pg.$('#pkOpen')) errs.push('multi popup should not offer open-order');
  await shot('t068_multi');
  await pg.evaluate(() => { document.getElementById('pkPrint').checked = false; }); await pg.click('#pkOk'); await pg.waitForTimeout(900);
  const left = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.orders).filter(o => o.st === 'sent').map(o => o.id)); log('sent left:', left); if (left.join() !== 'O261015-CCCC') errs.push('all checked orders should be assigned, left ' + left.join());
  const p1 = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.orders).filter(o => o.picker === 'pick1@x.com' && o.st === 'pick').length); log('Pick 1 now has', p1); if (p1 !== 4) errs.push('multi assign should default to Pick 1');
  /* 4. 출고 작업 목록에서는 줄을 누르면 상세 (할당 모드 아님) */
  await pg.click('[data-lf="pick"]'); await pg.waitForSelector('#page [data-oid]'); await pg.click('#page [data-oid="O261015-BBBB"] .ct'); await pg.waitForSelector('#mPickDone', { timeout: 4000 }).catch(() => errs.push('in-fulfillment row tap should open the order'));
  log(errs.length ? '❌ ' + errs.join('\n❌ ') : '✅ all good');
  await br.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})();
