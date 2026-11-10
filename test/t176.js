/* v0.8.181 시험 — 🔎 같은 코드 · 같은 가게 이름 중복 막기 (2026-11-10 관리자)
 *   ① 새 아이템: 이미 있는 코드를 치면 바로 그 아이템 정보(이름 · 가격 · 분류) + ✏️ 열기 · 등록 단추 막힘 · 열기를 누르면 그 아이템 수정 화면
 *      · 붙임표만 다른 코드(AHG-100)는 ⚠️ 알려 주되 막지는 않음 · 새 코드면 ✓ 새 코드입니다
 *   ② 새 거래처: 같은 이름(띄어쓰기 · 기호 무시)이면 ⛔ 그 가게 정보 · 저장 막힘 · "이 가게로" 를 누르면 그 가게로 주문
 *      · 임시 번호(승인 전) 가게도 같은 이름이면 막음 · 다른 폰이 방금 연 가게(서버에만 있는 것)도 저장할 때 서버에서 한 번 더 확인 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8841', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const mk = async email => { const pg = await (await br.newContext({ viewport: { width: 430, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(e => { window.__MOCK_USER__ = { email: e, name: 'X' }; window.__AFTER_SEED__ = s => { s.settings[0].ordersOn = true; s.accounts.push({ id: 'N261110-ABCD', acct: 'N261110-ABCD', store: 'NEW TEMP SHOP', addr: '5 OAK ST', city: 'TAMPA', state: 'FL', zip: '33601', sm: 'ALEX', pending: true }); }; }, email);
    await pg.goto('http://127.0.0.1:8841/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  /* ① 아이템 */
  let pg = await mk('luke@theonefl.com');
  await pg.evaluate(() => { location.hash = '#/items/new'; }); await pg.waitForSelector('#fC', { timeout: 8000 });
  const dupTxt = async () => { await pg.waitForTimeout(450); return (await pg.$eval('#fDup', e => e.textContent).catch(() => '')).replace(/\s+/g, ' ').trim(); };
  await pg.fill('#fC', 'ahg100'); let t = await dupTxt(); log('① AHG100:', t.slice(0, 120));
  if (!/이미 있는 코드/.test(t) || !/AHG100/.test(t) || !/\$/.test(t)) errs.push('① existing code shows that item (code · name · price)');
  if (!(await pg.$eval('#fOk', b => b.disabled))) errs.push('① register is blocked for an existing code');
  await pg.fill('#fC', 'AHG-100'); t = await dupTxt(); log('① AHG-100:', t.slice(0, 80)); if (!/비슷한 아이템/.test(t) || await pg.$eval('#fOk', b => b.disabled)) errs.push('① near code (AHG-100) warns but does not block');
  await pg.fill('#fC', 'ZZNEW77'); t = await dupTxt(); log('① ZZNEW77:', t); if (!/새 코드입니다/.test(t) || await pg.$eval('#fOk', b => b.disabled)) errs.push('① a new code says new and allows register');
  await pg.fill('#fC', 'AHG100'); await dupTxt(); await pg.click('#fDupOpen'); await pg.waitForTimeout(500);
  const ro = await pg.$eval('#fC', e => ({ v: e.value, ro: e.readOnly })).catch(() => null); log('① opened:', JSON.stringify(ro)); if (!ro || ro.v !== 'AHG100' || !ro.ro || !(await pg.$('#fDel'))) errs.push('① "open this item" opens AHG100 for editing');
  await pg.context().close();
  /* ② 거래처 */
  pg = await mk('brandon@x.com');
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ');
  await pg.fill('#eStoreQ', 'zz brand new shop'); await pg.waitForTimeout(300); await pg.click('#eNewAcct'); await pg.waitForSelector('#naStore');
  const naTxt = async () => { await pg.waitForTimeout(500); return (await pg.$eval('#naDup', e => e.textContent).catch(() => '')).replace(/\s+/g, ' ').trim(); };
  await pg.fill('#naStore', 'ali b/s #1'); t = await naTxt(); log('② ALI:', t.slice(0, 120));
  if (!/같은 이름의 가게/.test(t) || !/1111/.test(t) || !(await pg.$eval('#naGo', b => b.disabled))) errs.push('② same store name (ignoring spaces · symbols) shows the store and blocks saving');
  await pg.fill('#naStore', 'NEW TEMP SHOP'); t = await naTxt(); log('② temp:', t.slice(0, 100)); if (!/같은 이름의 가게/.test(t) || !/임시/.test(t)) errs.push('② a store still on a temporary number also blocks');
  await pg.fill('#naStore', 'ALI B/S # 1'); await naTxt(); await pg.click('[data-nause="1111"]'); await pg.waitForTimeout(800);
  const picked = await pg.evaluate(() => (document.getElementById('page').textContent.match(/ALI B\/S # 1/) || [''])[0]); log('② use this →', picked); if (!picked || await pg.$('#naStore')) errs.push('② "use this" closes the form and picks that store for the order');
  /* 다른 폰이 방금 연 가게 — 이 폰 목록에는 없고 서버에만 */
  await pg.context().close(); pg = await mk('brandon@x.com');
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pg.fill('#eStoreQ', 'qq other phone'); await pg.waitForTimeout(300); await pg.click('#eNewAcct'); await pg.waitForSelector('#naStore');
  await pg.evaluate(() => { window.__MOCK_STORE__.accounts['N261110-QQQQ'] = { id: 'N261110-QQQQ', acct: 'N261110-QQQQ', store: 'QQ OTHER PHONE', addr: '9 PINE', city: 'MIAMI', state: 'FL', zip: '33101', sm: 'SOO', pending: true }; });
  await pg.fill('#naStore', 'QQ OTHER PHONE'); await pg.fill('#naAddr', '1 test st'); await pg.fill('#naCity', 'miami'); await pg.fill('#naZip', '33101'); await naTxt();
  await pg.click('#naGo'); await pg.waitForTimeout(1200);
  const n = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.accounts).filter(a => a.store === 'QQ OTHER PHONE').length); const toastT = await pg.$eval('#toast', e => e.textContent).catch(() => ''); log('② server dup:', n, toastT.slice(0, 80));
  if (n !== 1) errs.push('② saving re-checks the server — a store just opened on another phone is not opened twice');
  await pg.context().close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
