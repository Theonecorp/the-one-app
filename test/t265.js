/* v0.8.227 시험 — 🔢 세일즈 오더 번호 SA-000001 (2026-11-13 관리자: "연속번호 · 회사로 보내질 때 번호 · 같은 번호로 중복 안 되게 · 999999 다 차면 SB-, SC- …")
 *   ① 세일즈맨 폰 보관함의 보낸 주문 3건 → 올라갈 때 SA-000001 · SA-000002 · SA-000003 (차례대로 · 겹치지 않음) · 옛 임시 번호는 tmpNo · 문서 id 는 그대로
 *   ② 임시(draft) 저장은 번호를 받지 않음 · 예전에 이미 보낸 주문(옛 O 번호)을 고쳐 다시 올려도 번호 그대로
 *   ③ 999999 다음은 SB-000001 (counters/so.n 이어서)
 *   ④ 담당자가 임시 주문을 📤 접수로 보내기 → 다음 번호 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8957', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const SEED = start => { window.__AFTER_SEED__ = s => { const now = new Date().toISOString(), d = now.substring(0, 10);
    s.orders = (s.orders || []).filter(o => o.sm !== 'BRANDON').concat([{ id: 'O-T265-OLD', no: 'O-T265-OLD', d, ym: d.substring(0, 7), sm: 'BRANDON', acct: '1111', store: 'OLD SHOP', st: 'sent', n: 1, qty: 1, amt: 10, createdBy: 'brandon@x.com', createdAt: now, updatedAt: now, sentAt: now },
      { id: 'O-T265-DR', no: 'O-T265-DR', d, ym: d.substring(0, 7), sm: 'BRANDON', acct: '1111', store: 'DRAFT SHOP', st: 'draft', n: 1, qty: 1, amt: 10, createdBy: 'off@x.com', createdAt: now, updatedAt: now }]);
    s.orderLines = Object.assign(s.orderLines || {}, {}); if (Array.isArray(s.orderLines)) s.orderLines.push({ id: 'O-T265-DR', sm: 'BRANDON', lines: [{ c: 'X1', d: 'x', q: 1, p: 10, t: 'A' }] });
    if (start) { s.counters = s.counters || []; if (Array.isArray(s.counters)) s.counters.push({ id: 'so', n: start }); else s.counters.so = { id: 'so', n: start }; }
    s.users.push({ id: 'off@x.com', email: 'off@x.com', name: 'O', role: 'manager', job: 'office', active: true }); }; };
  const OUT = (ids, oldSent) => { const now = new Date().toISOString(), d = now.substring(0, 10), box = {};
    ids.forEach((id, i) => { box[id] = { o: { id, no: id, d, ym: d.substring(0, 7), sm: 'BRANDON', acct: '1111', store: 'SHOP ' + i, st: /DRAFT/.test(id) ? 'draft' : 'sent', n: 1, qty: 1, amt: 10, createdBy: 'brandon@x.com', createdAt: now, updatedAt: now, sentAt: now }, lines: [{ c: 'X1', d: 'x', q: 1, p: 10, t: 'A' }], at: Date.now() + i }; });
    if (oldSent) box['O-T265-OLD'] = { o: { id: 'O-T265-OLD', no: 'O-T265-OLD', d, ym: d.substring(0, 7), sm: 'BRANDON', acct: '1111', store: 'OLD SHOP', st: 'sent', n: 1, qty: 2, amt: 20, memo: 'edited', createdBy: 'brandon@x.com', createdAt: now, updatedAt: now, sentAt: now }, lines: [{ c: 'X1', d: 'x', q: 2, p: 10, t: 'A' }], at: Date.now() + 9 };
    return box; };
  const open = async (email, start, box) => { const pg = await (await br.newContext({ viewport: { width: 1300, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message));
    await pg.addInitScript(e => { window.__MOCK_USER__ = { email: e, name: 'U' }; }, email); await pg.addInitScript(SEED, start);
    if (box) await pg.addInitScript(b => { if (!sessionStorage.getItem('t265')) { localStorage.setItem('theone.outbox.v1', JSON.stringify(b)); sessionStorage.setItem('t265', '1'); } }, box);
    await pg.goto('http://127.0.0.1:8957/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(600); return pg; };
  const ord = (pg, id) => pg.evaluate(i => { const o = (window.__MOCK_STORE__.orders || {})[i]; return o ? { no: o.no, tmp: o.tmpNo || '', st: o.st, memo: o.memo || '' } : null; }, id);
  const ctr = pg => pg.evaluate(() => ((window.__MOCK_STORE__.counters || {}).so || {}).n);
  /* ①② */
  let pg = await open('brandon@x.com', 0, OUT(['O-T265-1', 'O-T265-2', 'O-T265-DRAFT', 'O-T265-3'], true));
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForFunction(() => !JSON.parse(localStorage.getItem('theone.outbox.v1') || '{}')['O-T265-3'], null, { timeout: 10000 }).catch(() => {}); await pg.waitForTimeout(500);
  const a = {}; for (const id of ['O-T265-1', 'O-T265-2', 'O-T265-3', 'O-T265-DRAFT', 'O-T265-OLD']) a[id] = await ord(pg, id);
  log('①②', JSON.stringify(a), 'n=', await ctr(pg));
  const sa = ['O-T265-1', 'O-T265-2', 'O-T265-3'].map(i => a[i] && a[i].no);
  if (sa.join() !== 'SA-000001,SA-000002,SA-000003') errs.push('① sent orders numbered SA-000001.. in order: ' + sa.join());
  if (!a['O-T265-1'] || a['O-T265-1'].tmp !== 'O-T265-1') errs.push('① old temp number kept as tmpNo · doc id unchanged');
  if (!a['O-T265-DRAFT'] || a['O-T265-DRAFT'].no !== 'O-T265-DRAFT') errs.push('② draft gets no number');
  if (!a['O-T265-OLD'] || a['O-T265-OLD'].no !== 'O-T265-OLD' || a['O-T265-OLD'].memo !== 'edited') errs.push('② already-sent old order keeps its number when re-saved');
  if (await ctr(pg) !== 4) errs.push('① counter so.n advanced once per sent order');
  const shown = await pg.evaluate(() => document.querySelector('#page').innerText); if (!/SA-000002/.test(shown)) errs.push('① salesman list shows SA number');
  /* ③ 999999 → SB */
  pg = await open('brandon@x.com', 999999, OUT(['O-T265-Y', 'O-T265-Z']));
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForFunction(() => !JSON.parse(localStorage.getItem('theone.outbox.v1') || '{}')['O-T265-Z'], null, { timeout: 10000 }).catch(() => {}); await pg.waitForTimeout(500);
  const y = await ord(pg, 'O-T265-Y'), z = await ord(pg, 'O-T265-Z'); log('③', JSON.stringify([y, z]));
  if (!y || y.no !== 'SA-999999' || !z || z.no !== 'SB-000001') errs.push('③ SA-999999 then SB-000001');
  /* ④ */
  pg = await open('off@x.com', 41);
  await pg.evaluate(() => { location.hash = '#/order/O-T265-DR'; }); await pg.waitForSelector('#mSend', { timeout: 8000 }).catch(() => {});
  if (await pg.$('#mSend')) { await pg.click('#mSend'); await pg.click('#cfOk'); await pg.waitForTimeout(800); }
  const dr = await ord(pg, 'O-T265-DR'); log('④', JSON.stringify(dr));
  if (!dr || dr.st !== 'sent' || dr.no !== 'SA-000041' || dr.tmp !== 'O-T265-DR') errs.push('④ office submit gives next number');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
