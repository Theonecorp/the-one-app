/* v0.8.236 시험 — 🔢 확인 표시가 붙은 임시 저장 주문 보내기 (2026-11-13 Kevin: v0.8.233 뒤에도 "permission-denied" 2건)
 *   원인: 서버의 임시 저장에 "맞습니다" 표시(cfOk · cfAt · cfBy · cfHow)가 붙어 있는데, 폰 주문에는 이 칸이 없어 통째로 덮으면 "칸을 지움" → 세일즈맨은 cfHow 를 못 바꾸는 규칙(L4)에 막힘
 *   ① 서버 임시 저장(확인 표시 있음) + 같은 주문이 폰 보관함에 보낸 상태 → 보내기 → 서버 주문은 sent · SA 번호 · 확인 표시 4칸 그대로 · 보관함 비움
 *   ② 서버에 없던 새 주문은 그대로 (이어 붙일 것 없음)
 *   (규칙 쪽: tools/rules-test.mjs "확인 표시 그대로 두고 보냄" ALLOW) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8997', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const now = new Date().toISOString(), d = now.slice(0, 10);
  const mk = (id, store) => ({ id, no: id, d, ym: d.slice(0, 7), sm: 'BRANDON', acct: '1111', store, st: 'draft', n: 1, qty: 1, amt: 10, createdBy: 'brandon@x.com', createdAt: now, updatedAt: now });
  const A = Object.assign(mk('O-T276-A', 'U BEAUTY'), { cfOk: true, cfAt: now, cfBy: 'brandon@x.com', cfHow: 'day' }), B = mk('O-T276-NEW', 'NEW SHOP');
  const pg = await (await br.newContext({ viewport: { width: 390, height: 844 } })).newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(([a, b]) => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'B' };
    window.__AFTER_SEED__ = s => { s.orders = (s.orders || []).filter(o => o.sm !== 'BRANDON').concat([a]); };
    if (!sessionStorage.getItem('t276')) { sessionStorage.setItem('t276', '1'); const strip = o => { const x = Object.assign({}, o, { st: 'sent', sentAt: o.createdAt }); ['cfOk', 'cfAt', 'cfBy', 'cfHow'].forEach(k => delete x[k]); return x; };
      localStorage.setItem('theone.outbox.v1', JSON.stringify({ [a.id]: { o: strip(a), lines: [{ c: 'X1', d: 'x', q: 1, p: 10, t: 'A' }], at: 1, err: 'permission-denied' }, [b.id]: { o: strip(b), lines: [{ c: 'X1', d: 'x', q: 1, p: 10, t: 'A' }], at: 2 } })); } }, [A, B]);
  await pg.goto('http://127.0.0.1:8997/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(600);
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(2500);
  const r = await pg.evaluate(() => { const g = i => { const o = window.__MOCK_STORE__.orders[i]; return o ? { st: o.st, no: o.no, cf: [o.cfOk, o.cfAt ? 1 : 0, o.cfBy, o.cfHow].join('|') } : null; }; return { a: g('O-T276-A'), b: g('O-T276-NEW'), box: Object.keys(JSON.parse(localStorage.getItem('theone.outbox.v1') || '{}')).length }; });
  log('after send:', JSON.stringify(r));
  if (!r.a || r.a.st !== 'sent' || !/^SA-\d{6}$/.test(r.a.no) || r.a.cf !== 'true|1|brandon@x.com|day') errs.push('① confirmed draft sent with SA number, confirm marks kept');
  if (!r.b || r.b.st !== 'sent' || !/^SA-\d{6}$/.test(r.b.no) || r.b.cf !== '|0||') errs.push('② new order sent as is');
  if (r.box !== 0) errs.push('outbox emptied');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
