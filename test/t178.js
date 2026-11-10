/* v0.8.182 시험 — 🆕 새 아이템 등록 → 세일즈맨 팝업 알림 (2026-11-10 관리자)
 *   ① 새 아이템을 등록하면 알림 대기열에 kind newItem (세일즈맨 묶음 · 팝업만 · 코드 · 이름 · 가격 · 링크 #/order/newitems) · 🙈 숨김으로 등록하면 알리지 않음
 *   ② 알림 링크(#/order/newitems)를 열면 새 주문의 🆕 새로 나온 목록
 *   ③ Apps Script: 마지막 등록 뒤 10분 조용하면 한 번에 묶어(같은 코드는 한 번) 활성 세일즈맨에게 팝업 · 영업일 8–19시만 · 일반 알림 처리(notifyRun_)는 건드리지 않음 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs'), vm = require('vm');
const fmtTz = (d, tz, f) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short', timeZoneName: 'longOffset' }).formatToParts(d).map(x => [x.type, x.value]));
  if (f === 'yyyy-MM-dd') return p.year + '-' + p.month + '-' + p.day; if (f === 'H') return String(Number(p.hour)); if (f === 'm') return String(Number(p.minute)); if (f === 'u') return String(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1);
  if (f === 'XXX') return p.timeZoneName.replace('GMT', '') || '+00:00'; throw new Error('fmt ' + f); };
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8844', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const mk = async email => { const pg = await (await br.newContext({ viewport: { width: 430, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(e => { window.__MOCK_USER__ = { email: e, name: 'X' }; window.__AFTER_SEED__ = s => { s.settings[0].ordersOn = true; }; }, email);
    await pg.goto('http://127.0.0.1:8844/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  /* ① 등록 */
  let pg = await mk('luke@theonefl.com');
  const add = async (code, hide) => { await pg.evaluate(() => { location.hash = '#/items'; }); await pg.waitForTimeout(500); await pg.evaluate(() => { location.hash = '#/items/new'; }); await pg.waitForSelector('#fC', { timeout: 8000 });
    await pg.fill('#fC', code); await pg.fill('#fD', 'Test ' + code); await pg.fill('#fP', '3.5'); await pg.fill('#fG', 'Jewelry'); if (hide) await pg.click('#fVis'); await pg.waitForTimeout(300); await pg.click('#fOk'); await pg.waitForTimeout(1800); };
  await add('ZZNEW01');
  let q = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'newItem'));
  log('① queued:', JSON.stringify(q.map(n => ({ codes: n.codes, push: n.pushOnly, g: n.toGroup, url: n.url, st: n.st }))));
  if (q.length !== 1 || q[0].codes.length !== 1 || q[0].codes[0].c !== 'ZZNEW01' || q[0].codes[0].p !== 3.5 || !q[0].pushOnly || q[0].toGroup !== 'g:sales' || !/#\/order\/newitems$/.test(q[0].url) || q[0].st !== 'wait') errs.push('① a new item queues one push-only notice for salesmen');
  await add('ZZHIDE1', true);
  q = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'newItem')); log('① after hidden add:', q.length); if (q.length !== 1) errs.push('① hidden items are not announced');
  const saved = await pg.evaluate(() => Object.keys(window.__MOCK_STORE__.catalog || {}).length); if (!saved) errs.push('① catalog saved');
  await pg.context().close();
  /* ② 링크 */
  pg = await mk('brandon@x.com');
  await pg.evaluate(() => { location.hash = '#/order/newitems'; }); await pg.waitForSelector('#eStoreQ', { timeout: 8000 });
  await pg.fill('#eStoreQ', 'ali'); await pg.waitForTimeout(300); await pg.click('#eStoreHits [data-ac="1111"]'); await pg.waitForTimeout(1200); if (await pg.$('#modal.on')) { await pg.click('#modal .mclose'); await pg.waitForTimeout(400); }
  const txt = await pg.$eval('#page', e => e.textContent); log('② new list shown:', /최근 30일에 등록된 아이템/.test(txt)); if (!/최근 30일에 등록된 아이템/.test(txt)) errs.push('② the link opens the 🆕 new items list in a new order');
  await pg.context().close();
  await br.close(); srv.kill();
  /* ③ Apps Script */
  const code = fs.readFileSync(path.resolve(__dirname, '..', 'apps-script/Code.gs'), 'utf8');
  const run = (nowIso, docs, extra) => {
    const sent = [], patched = [], now = new Date(nowIso).getTime();
    const ctx = { Logger: { log: () => {} }, console, Date: class extends Date { constructor(...a) { if (!a.length) super(now); else super(...a); } static now() { return now; } },
      Utilities: { formatDate: fmtTz }, MailApp: { sendEmail: o => sent.push({ mail: o }) }, PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) } };
    vm.createContext(ctx); vm.runInContext(code, ctx);
    ctx.getDoc_ = () => ({}); ctx.queryVal_ = (col, f, v) => docs.filter(d => d[f] === v.stringValue); ctx.query_ = (col, f, v) => docs.filter(d => d[f] === v);
    ctx.listAll_ = () => [{ email: 'brandon@x.com', role: 'salesman' }, { email: 'soo@x.com', role: 'salesman' }, { email: 'old@x.com', role: 'salesman', active: false }, { email: 'office@x.com', role: 'manager' }];
    ctx.patch_ = (c, id, d) => patched.push([id, d.st]); ctx.pushTo_ = (to, title, body, url, tag) => { sent.push({ to: to.join(), title, body, url, tag }); return to.length; };
    if (extra) extra(ctx);
    return { ctx, sent, patched };
  };
  const ago = (iso, m) => new Date(new Date(iso).getTime() - m * 60000).toISOString();
  const NOW = '2026-11-12T15:00:00Z';   // 목 10시 (뉴욕)
  const docs = () => [{ _id: 'N1', kind: 'newItem', st: 'wait', at: ago(NOW, 25), codes: [{ c: 'A1', d: 'Alpha', p: 2 }] }, { _id: 'N2', kind: 'newItem', st: 'wait', at: ago(NOW, 15), codes: [{ c: 'B2', d: 'Beta', p: 3 }, { c: 'A1', d: 'Alpha', p: 2 }] }];
  let R = run(NOW, docs()); R.ctx.newItemsRun_(); log('③ send:', JSON.stringify(R.sent), JSON.stringify(R.patched));
  if (R.sent.length !== 1 || R.sent[0].to !== 'brandon@x.com,soo@x.com' || !/새 아이템 2개/.test(R.sent[0].title) || !/A1 Alpha \$2\.00/.test(R.sent[0].body) || R.sent[0].url !== './#/order/newitems') errs.push('③ one push to active salesmen with both codes (A1 once)');
  if (R.patched.length !== 2 || R.patched.some(p => p[1] !== 'sent')) errs.push('③ both notices marked sent');
  const d3 = docs(); d3[1].at = ago(NOW, 4); R = run(NOW, d3); R.ctx.newItemsRun_(); if (R.sent.length) errs.push('③ waits while items are still being added (last one 4 min ago)');
  R = run('2026-11-13T01:00:00Z', docs()); R.ctx.newItemsRun_(); if (R.sent.length) errs.push('③ not at 20:00');
  R = run('2026-11-14T15:00:00Z', docs()); R.ctx.newItemsRun_(); if (R.sent.length) errs.push('③ not on Saturday');
  R = run(NOW, docs()); R.ctx.notifyRun_(); log('③ notifyRun_ patched:', JSON.stringify(R.patched)); if (R.patched.length || R.sent.length) errs.push('③ the regular notification run leaves new-item notices alone');
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
