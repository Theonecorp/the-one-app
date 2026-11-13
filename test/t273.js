/* v0.8.233 시험 — 🔢 임시 저장해 둔 주문 보내기 (2026-11-13 세일즈맨: "오더 두 개를 보내려는데 안 보내짐 · 두 개가 아니고 네 개로 바뀜")
 *   원인 ① v0.8.227 SA 번호: 서버에 임시 저장이 있던 주문을 보낼 때 'no' 를 바꾸는데 규칙(L4)이 막아 permission-denied → firestore.rules soNoOk (tools/rules-test.mjs 4건)
 *   원인 ② 홈 "보낼 주문" 숫자: 서버 임시 저장 + 폰 보관함을 따로 세어 같은 주문이 두 번 (2 → 4)
 *   ① 이 시험: 서버에 임시 저장 2건 + 같은 주문이 폰 보관함에 보낸 상태로 2건 → 홈 보낼 주문 = 2 (4 아님)
 *   ② 보내기 → 두 주문 모두 SA 번호 · 서버 st sent · 보관함 비움 · 보낼 주문 0 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8996', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const now = new Date().toISOString(), d = now.slice(0, 10);
  const mk = (id, store, st) => ({ id, no: id, d, ym: d.slice(0, 7), sm: 'BRANDON', acct: '1111', store, st, n: 1, qty: 1, amt: 10, createdBy: 'brandon@x.com', createdAt: now, updatedAt: now });
  const pg = await (await br.newContext({ viewport: { width: 390, height: 844 } })).newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(([a, b]) => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'B' };
    window.__AFTER_SEED__ = s => { s.orders = (s.orders || []).filter(o => o.sm !== 'BRANDON').concat([a, b]); };
    if (!sessionStorage.getItem('t273')) { sessionStorage.setItem('t273', '1'); localStorage.setItem('theone.outbox.v1', JSON.stringify({ [a.id]: { o: Object.assign({}, a, { st: 'sent', sentAt: a.createdAt }), lines: [{ c: 'X1', d: 'x', q: 1, p: 10, t: 'A' }], at: 1, err: 'permission-denied' }, [b.id]: { o: Object.assign({}, b, { st: 'sent', sentAt: b.createdAt }), lines: [{ c: 'X1', d: 'x', q: 1, p: 10, t: 'A' }], at: 2, err: 'permission-denied' } })); }
    window.addEventListener('offline', () => {}); Object.defineProperty(navigator, 'onLine', { get: () => !window.__T273_OFF__ }); window.__T273_OFF__ = true; }, [mk('O-T273-A', 'U BEAUTY', 'draft'), mk('O-T273-B', 'EMPIRE BEAUTY', 'draft')]);
  await pg.goto('http://127.0.0.1:8996/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(600);
  await pg.evaluate(() => { location.hash = '#/home'; }); await pg.waitForSelector('#dkSend'); await pg.waitForTimeout(1500);
  const n1 = (await pg.textContent('#dkSend')).trim(); log('① to send (offline, 2 drafts also in outbox):', n1); if (n1 !== '2') errs.push('① same order not counted twice (want 2, got ' + n1 + ')');
  await pg.evaluate(() => { window.__T273_OFF__ = false; window.dispatchEvent(new Event('online')); }); await pg.waitForTimeout(1500);
  const r = await pg.evaluate(() => ({ o: ['O-T273-A', 'O-T273-B'].map(i => { const o = window.__MOCK_STORE__.orders[i]; return o ? o.st + ' ' + o.no + ' ' + (o.tmpNo || '') : null; }), box: Object.keys(JSON.parse(localStorage.getItem('theone.outbox.v1') || '{}')).length }));
  log('② after send:', JSON.stringify(r)); if (!r.o.every(x => /^sent SA-\d{6} O-T273-/.test(x || '')) || r.box !== 0) errs.push('② both sent with SA numbers, outbox empty');
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(400); await pg.evaluate(() => { location.hash = '#/home'; }); await pg.waitForSelector('#dkSend'); await pg.waitForTimeout(1200);
  const n2 = (await pg.textContent('#dkSend')).trim(); log('② to send after:', n2); if (n2 !== '0' && n2 !== '…') errs.push('② nothing left to send (got ' + n2 + ')');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
