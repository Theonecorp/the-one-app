/* v0.8.76 시험 — 🆕 새 거래처: 세일즈맨이 임시 번호로 열고 주문 · 수금 → 매니저가 6001 부터 (홀세일 9000번대) 코드 부여 → 주문 · 수금이 새 코드로
 *   · 코드 전에는 인보이스 발행 막음 · 거래처 코드 바꾸기 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8798', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const mk = async (email, seed) => { const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(([e, sd]) => { window.__MOCK_USER__ = { email: e, name: 'X' }; window.__AFTER_SEED__ = s => { s.settings[0].ordersOn = true; if (sd) new Function('s', sd)(s); }; }, [email, seed || '']);
    await pg.goto('http://127.0.0.1:8798/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  /* 1. 세일즈맨: 새 주문에서 새 거래처 열기 → 주문 저장 */
  let pg = await mk('brandon@x.com');
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ');
  await pg.fill('#eStoreQ', 'zz brand new shop'); await pg.waitForTimeout(300);
  await pg.click('#eNewAcct'); await pg.waitForSelector('#naStore'); await pg.screenshot({ path: path.resolve(__dirname, 'out', 'newacct_form.png') });
  await pg.click('#naGo'); await pg.waitForTimeout(300); if (!(await pg.$('#naStore'))) errs.push('form should require address');
  await pg.fill('#naAddr', '1 test st'); await pg.fill('#naCity', 'miami'); await pg.fill('#naZip', '33101'); await pg.fill('#naTel', '305-555-0000'); await pg.click('#naApp');
  await pg.click('#naGo'); await pg.waitForTimeout(1200); if (await pg.$('#ssX')) await pg.click('#ssX');
  const acc = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.accounts).find(a => a.pending));
  log('temp account:', acc && [acc.id, acc.store, acc.sm, acc.appGot]); if (!acc || !/^N\d{6}-[A-Z0-9]{4}$/.test(acc.id) || acc.sm !== 'BRANDON' || acc.store !== 'ZZ BRAND NEW SHOP') errs.push('temp account wrong');
  await pg.fill('#eQ1', 'AHG100'); await pg.press('#eQ1', 'Enter'); await pg.waitForTimeout(300);
  await pg.click('#eDraft'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1200);
  const ord = await pg.evaluate(id => Object.values(window.__MOCK_STORE__.orders).find(o => o.acct === id), acc && acc.id); log('order acct:', ord && ord.acct); if (!ord) errs.push('order with temp acct not saved');
  /* 1-2. 수금 입력에서 목록에 없는 가게 → 새 거래처 */
  await pg.evaluate(() => { location.hash = '#/entry'; }); await pg.waitForSelector('#fStore'); await pg.fill('#fStore', 'qq unknown beauty'); await pg.waitForTimeout(500);
  await pg.click('#btnNewStore'); await pg.waitForSelector('#naStore'); await pg.fill('#naAddr', '9 elm st'); await pg.fill('#naCity', 'tampa'); await pg.fill('#naZip', '33601'); await pg.click('#naGo'); await pg.waitForTimeout(1200);
  const card = (await pg.textContent('.info .nm').catch(() => '')) || ''; log('entry store:', card.trim()); if (!/QQ UNKNOWN BEAUTY/.test(card) || !/N\d{6}-/.test(card)) errs.push('collect entry should pick the new temp account');
  await pg.close();
  /* 2. 매니저(관리자): 🆕 띠 → 코드 부여 (일반 2곳 6001 · 6002, 홀세일 9000번대) · 인보이스 막기 */
  const seed = `const T = (id, store, wh, at) => ({ id, acct: id, store, addr: '1 MAIN', city: 'MIAMI', state: 'FL', zip: '33101', sm: 'BRANDON', pending: true, wholesale: wh, newBy: 'brandon@x.com', newAt: at });
    s.accounts.push(T('N261027-AAAA', 'FIRST NEW', false, '2026-10-27T10:00:00Z'), T('N261027-BBBB', 'BIG WHOLESALE', true, '2026-10-27T11:00:00Z'), T('N261027-CCCC', 'SECOND NEW', false, '2026-10-27T12:00:00Z'));
    s.orders.push({ id: 'O261027-NEW1', no: 'O261027-NEW1', d: '2026-10-27', ym: '2026-10', sm: 'BRANDON', acct: 'N261027-AAAA', store: 'FIRST NEW', st: 'picked', n: 1, qty: 1, amt: 2.5, createdAt: '2026-10-27T10:05:00Z', updatedAt: '2026-10-27T10:05:00Z', sentAt: '2026-10-27T10:05:00Z' });
    s.orderLines = (s.orderLines || []).concat([{ id: 'O261027-NEW1', sm: 'BRANDON', lines: [{ c: 'AHG100', d: 'ITEM', q: 1, p: 2.5, lp: 2.5, pq: 1 }] }]);
    s.entries.push({ id: 'ENEW1', d: '2026-10-27', ym: '2026-10', sm: 'BRANDON', acct: 'N261027-CCCC', store: 'SECOND NEW', pays: [{ m: 'CASH', amt: 50 }], invs: [], total: 50 });`;
  pg = await mk('luke@theonefl.com', seed);
  await pg.evaluate(() => { location.hash = '#/order/O261027-NEW1'; }); await pg.waitForTimeout(1200);
  if (await pg.$('#mInv')) { await pg.click('#mInv'); await pg.waitForTimeout(1200); const mb = await pg.textContent('#mbox').catch(() => ''); log('invoice block → modal:', mb.replace(/\s+/g, ' ').slice(0, 60)); if (!/코드 부여/.test(mb)) errs.push('invoice should be blocked → code modal'); await pg.evaluate(() => { const b = document.getElementById('naClose'); if (b) b.click(); }); }
  else errs.push('no issue-invoice button on picked order');
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForSelector('#naBanH button', { timeout: 8000 }).catch(() => errs.push('home banner missing'));
  log('banner:', (await pg.textContent('#naBanH')).trim()); await pg.click('#naBan'); await pg.waitForSelector('[data-naok]');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'newacct_assign.png') });
  const sug = await pg.$$eval('[data-naok]', b => b.map(x => x.textContent.replace(/\D/g, ''))); log('suggested:', sug); if (sug.join() !== '6001,9002,6002') errs.push('suggested codes wrong (want 6001, 9002, 6002 in arrival order)');
  await pg.click('#naAll'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(2500);
  const st = await pg.evaluate(() => { const M = window.__MOCK_STORE__; return { acc: ['6001', '6002', '9002'].map(k => M.accounts[k] && M.accounts[k].store + '|' + M.accounts[k].pending), temps: Object.keys(M.accounts).filter(k => /^N/.test(k)), ord: M.orders['O261027-NEW1'].acct, ent: M.entries.ENEW1.acct, ctr: M.counters && M.counters.acctCode }; });
  log(st); if (st.acc.join() !== 'FIRST NEW|false,SECOND NEW|false,BIG WHOLESALE|false') errs.push('accounts not created with codes'); if (st.temps.length) errs.push('temp accounts left'); if (st.ord !== '6001' || st.ent !== '6002') errs.push('refs not moved');
  /* 3. 코드 바꾸기 — 1271 → 6100 */
  if (await pg.$('#naClose')) await pg.click('#naClose');
  await pg.evaluate(() => { location.hash = '#/stores'; }); await pg.waitForTimeout(600);
  const ent2 = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.entries).filter(e => e.acct === '1271').length);
  await pg.waitForSelector('[data-ste="1271"]').catch(() => {}); if (await pg.$('[data-ste="1271"]')) { await pg.click('[data-ste="1271"]'); await pg.waitForTimeout(600); }
  if (await pg.$('#sRen')) { await pg.click('#sRen'); await pg.waitForSelector('#rnTo'); await pg.fill('#rnTo', '6100'); await pg.click('#rnGo'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(2000);
    const r = await pg.evaluate(() => { const M = window.__MOCK_STORE__; return { has: !!M.accounts['6100'], old: !!M.accounts['1271'], ents: Object.values(M.entries).filter(e => e.acct === '6100').length, oldCodes: M.accounts['6100'] && M.accounts['6100'].oldCodes }; });
    log('rename:', r, 'entries before', ent2); if (!r.has || r.old || r.ents !== ent2 || String(r.oldCodes) !== '1271') errs.push('rename failed');
  } else errs.push('no 🔁 code change button in store form');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
