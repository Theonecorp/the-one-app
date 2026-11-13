/* v0.8.177 시험 — 📒 가게 창 "인보이스 · 수금" (SmartBee 의 Invoices and Payment 창처럼): 잔액 있는 가게를 고르면 뜨는 창의 첫 칸
 *   ① 새 주문에서 잔액 있는 가게를 고르면 가게 창이 뜨고 첫 칸이 📒 인보이스 · 수금 — 인보이스 표(번호 · 날짜 · 합계 · 잔액 · 메모, 날짜 최근 순)
 *   ② 컴퓨터(넓은 창): 인보이스를 누르면 오른쪽에 나간 아이템 · 오른쪽 아래 수금 표(체크 · 캐쉬 · ACH · 번호) · 후일 수표 합계 · '잔액 있는 것만' 걸러보기
 *   ③ 폰: 인보이스를 누르면 그 줄 밑에 아이템 · 메모는 번호 밑 작은 글씨 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8834', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const seed = `const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(d)); }; const ymOf = d => d.substring(0, 7);
    s.invoices = (s.invoices || []).concat([
      { id: 'A10021', no: 'A10021', t: 'A', src: 'legacy', d: day(50), ym: ymOf(day(50)), acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', total: 1500, bal: 1500, st: 'open', memo: '10% SHIPPING' },
      { id: 'A10055', no: 'A10055', t: 'A', d: day(10), ym: ymOf(day(10)), acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', total: 800, bal: 800, st: 'open', memo: 'delivery', lines: [{ c: 'AHG100', d: 'Aluminum Gold ITEM 0', q: 120, p: 2.5 }, { c: 'AHG105', d: 'Aluminum Gold ITEM 5', q: 100, p: 3.75 }, { c: 'AHG110', d: 'Aluminum Gold ITEM 10', q: 60, p: 3.25 }] },
      { id: 'A9900', no: 'A9900', t: 'A', src: 'legacy', d: day(120), ym: ymOf(day(120)), acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', total: 695.7, bal: 0, st: 'paid', memo: '10% delivery' }]);
    s.entries.push({ id: 'EPDC', d: day(3), ym: ymOf(day(3)), sm: 'BRANDON', acct: '1111', store: 'ALI B/S # 1', pays: [{ m: 'CHECK', ref: '5501', amt: 700, dep: day(-12), mob: false }], invs: [{ no: 'A10055', amt: 700 }], total: 700, void: false });
    s.cod.push({ id: 'C9', d: day(30), ym: ymOf(day(30)), sm: 'BRANDON', acct: '1111', store: 'ALI B/S # 1', method: 'ACH', ref: 'ACH-77', amt: 1000, invs: [{ no: 'A9900', amt: 695.7 }], void: false });`;
  const open = async (w, h) => { const pg = await (await br.newContext({ viewport: { width: w, height: h } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { seed });
    await pg.goto('http://127.0.0.1:8834/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(300);
    /* ① 새 주문에서 가게 고르기 → 잔액이 있으니 가게 창이 뜸 */
    await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pg.fill('#eStoreQ', 'ali'); await pg.waitForTimeout(250); await pg.click('#eStoreHits [data-ac="1111"]');
    await pg.waitForSelector('[data-ipi]', { timeout: 8000 }).catch(() => errs.push('① picking a store with a balance opens the store window on 📒 인보이스 · 수금 (' + w + 'px)')); return pg; };
  const rows = pg => pg.$$eval('.ipinv tr[data-ipi]', T => T.map(r => [...r.children].map((td, i) => (i === 0 ? td.querySelector('b').textContent : td.textContent).trim())));
  /* ② 컴퓨터 */
  const pc = await open(1500, 950);
  const tabOn = await pc.$eval('[data-ss].on', b => b.dataset.ss).catch(() => ''); if (tabOn !== 'ip') errs.push('① first tab is 📒 (got ' + tabOn + ')');
  let R = await rows(pc); log('② rows:', JSON.stringify(R));
  if (R.map(r => r[0]).join() !== 'A10055,A10021,A9900') errs.push('① invoices newest first (A10055 · A10021 · A9900)');
  const r55 = R[0] || []; if (!/\$800\.00/.test(r55[2]) || !/\$100\.00/.test(r55[3]) || r55[4] !== 'delivery') errs.push('① A10055 row: total 800 · balance 100 (AR − later payment) · remark delivery');
  if ((R[1] || [])[4] !== '10% SHIPPING') errs.push('① legacy invoice remark shows (10% SHIPPING)');
  const wide = await pc.$eval('#modal .bwrap', e => e.getBoundingClientRect().width); if (wide < 1100) errs.push('② store window is wide on desktop (got ' + wide + ')');
  await pc.click('[data-ipi="A10055"]'); await pc.waitForTimeout(300);
  const it = await pc.$$eval('.ipitems .iptbl tr', T => T.slice(1).map(r => r.children[0].textContent.trim())); log('② items:', it.join(' ')); if (it.join() !== 'AHG100,AHG105,AHG110') errs.push('② tapping an invoice shows its items on the right');
  const P = await pc.$$eval('.ippays .iptbl tr', T => T.slice(1).map(r => [...r.children].map(td => td.textContent.trim()).join('|'))); log('② pays:', JSON.stringify(P));
  if (!P.some(p => /^CHECK\|.*\$700\.00\|PAY\|#5501/.test(p) && /후일|PDC/.test(p))) errs.push('② post-dated check row with its ref and the PDC tag');
  if (!P.some(p => /^ACH\|.*\$1,000\.00\|ACH\|ACH-77/.test(p))) errs.push('② ACH from the office shows in the payments table');
  if (!P.some(p => /^CASH\|/.test(p))) errs.push('② cash payment row');
  const sum = await pc.$eval('.sumbox', e => e.textContent.replace(/\s+/g, ' ')); log('② sumbox:', sum); if (!/후일 수표.*\$700\.00/.test(sum)) errs.push('② post-dated check total $700');
  await pc.click('[data-ipf="open"]'); await pc.waitForTimeout(200); R = await rows(pc); if (R.length !== 1 || !/A10055/.test(R[0][0])) errs.push('② "잔액 있는 것만" leaves only A10055');
  await pc.context().close();
  /* ③ 폰 */
  const ph = await open(430, 1000);
  const memo = await ph.$eval('[data-ipi="A10021"] .ipm2', e => getComputedStyle(e).display + '|' + e.textContent).catch(() => ''); if (!/^block\|10% SHIPPING/.test(memo)) errs.push('③ phone shows the remark under the invoice number (got ' + memo + ')');
  await ph.click('[data-ipi="A10055"]'); await ph.waitForTimeout(300);
  const sub = await ph.$$eval('.ipsub .iptbl tr', T => T.slice(1).map(r => r.children[0].textContent.trim())); log('③ inline items:', sub.join(' ')); if (sub.join() !== 'AHG100,AHG105,AHG110') errs.push('③ phone shows items right under the tapped invoice');
  if (await ph.$('.ipitems')) errs.push('③ no side panel on phone');
  await ph.click('[data-ipi="A10055"]'); await ph.waitForTimeout(200); if (await ph.$('.ipsub')) errs.push('③ tapping again folds the items');
  await ph.context().close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
