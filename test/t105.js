/* v0.8.131 시험 — 🔎 가게 검색 순위(ORLANDO BEAUTY → 이름에 ORLANDO → ORLANDO 에 있는 가게) · 📦 체크 보내기 오래된 것부터 + 🔎 빠진 것 확인(미도착 → ↩ 다시 보내기)
 *   · 기록 탭에서 기간 리포트 뺌 · 숫자만 친 인보이스 번호 찾기 · 관리 설정의 EXCHANGE 칸 숨김 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8854', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 400, height: 800 } });
  const mk = async (email, seed) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.seed) window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed }); await pg.goto('http://127.0.0.1:8854/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  const seed = `const d = new Date(); const day = n => { const x = new Date(d); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
    s.accounts = s.accounts.concat([{ id: '7001', acct: '7001', store: 'ORLANDO BEAUTY', city: 'MIAMI', state: 'FL', sm: 'BRANDON' }, { id: '7002', acct: '7002', store: 'AAA SUPPLY', city: 'ORLANDO', state: 'FL', sm: 'BRANDON' }, { id: '7003', acct: '7003', store: 'BEAUTY ORLANDO INC', city: 'TAMPA', state: 'FL', sm: 'BRANDON' }]);
    if (!s.accounts.some(a => a.acct === '3001')) s.accounts.push({ id: '3001', acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', city: 'ORLANDO', state: 'FL', sm: 'ALEX' });
    const base = s.entries.find(e => e.sm === 'BRANDON' && e.pays && e.pays.length);
    const mkE = (id, n, store, ref, env) => { const e = JSON.parse(JSON.stringify(base)); e.id = id; e.d = day(n); e.ym = e.d.slice(0, 7); e.store = store; e.pays = [{ m: 'CHECK', ref, amt: 50 }]; e.refs = [ref]; e.total = 50; e.invs = []; e.env = env || ''; e.void = false; e.rep = true; e.sb = false; e.rc = false; return e; };
    s.entries.push(mkE('EO1', 20, 'OLD STORE', '9001'), mkE('EO2', 1, 'NEW STORE', '9002'), mkE('EO3', 10, 'MID STORE', '9003'), mkE('EM1', 15, 'MISS STORE', '9100', 'VMISS'));
    s.envelopes = (s.envelopes || []).concat([{ id: 'VMISS', sm: 'BRANDON', n: 1, total: 50, st: 'done', sentAt: day(15) + 'T12:00:00Z', doneAt: day(5) + 'T12:00:00Z', by: 'brandon@x.com', entries: ['EM1'], got: {}, miss: { 'EM1|9100': true }, checks: [{ eid: 'EM1', ref: '9100', amt: 50, store: 'MISS STORE', acct: '1111', d: day(15) }] }]);
    s.invoices = (s.invoices || []).concat([{ id: 'A77002', no: 'A77002', t: 'A', d: day(3), ym: day(3).slice(0, 7), acct: '1271', store: 'BEAUTY 4U', sm: 'BRANDON', total: 123, bal: 123, st: 'open', lines: [] }]);`;
  let pg = await mk('brandon@x.com', seed);
  /* ---------- 🔎 검색 순위 (주문 화면 가게 찾기) ---------- */
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ');
  const hits = async q => { await pg.fill('#eStoreQ', q); await pg.waitForTimeout(300); return pg.$$eval('#eStoreHits [data-ac]', L => L.map(x => x.dataset.ac)); };
  let L = await hits('orlando'); log('orlando →', L.join(','));
  if (L[0] !== '7001') errs.push('ORLANDO BEAUTY should be first for "orlando", got ' + L[0]);
  if (!(L.indexOf('3001') > 0 && L.indexOf('3001') < L.indexOf('7002'))) errs.push('stores with ORLANDO in the name should come before stores in the city of Orlando');
  if (!L.includes('7002')) errs.push('stores in Orlando (city) should still be found');
  L = await hits('orlando beauty'); log('orlando beauty →', L.join(','));
  if (L[0] !== '7001') errs.push('exact name should be first for "orlando beauty"'); if (L.includes('7002')) errs.push('AAA SUPPLY (only city matches) must not show when full matches exist');
  L = await hits('beauty 4u'); log('beauty 4u →', L.join(',')); if (L[0] !== '1271') errs.push('"beauty 4u" should put BEAUTY 4U first');
  /* ---------- 📦 체크 보내기 — 오래된 것부터 · 🔎 빠진 것 확인 ---------- */
  await pg.evaluate(() => { location.hash = '#/send'; }); await pg.waitForSelector('.evck', { timeout: 8000 });
  const order = await pg.$$eval('.evck', L => L.map(c => c.closest('label').textContent.match(/#(\d+)/)[1])); log('send order:', order.join(','));
  const i1 = order.indexOf('9001'), i3 = order.indexOf('9003'), i2 = order.indexOf('9002'); if (!(i1 >= 0 && i1 < i3 && i3 < i2)) errs.push('checks should be oldest first (9001 → 9003 → 9002)');
  const chk = (await pg.textContent('#evChk')).replace(/\s+/g, ' '); log('check card:', chk.slice(0, 160));
  if (!/7일 넘게 안 보낸 체크/.test(chk)) errs.push('old unsent checks should be flagged'); if (!/MISS STORE #9100/.test(chk)) errs.push('check the office marked missing should be listed');
  await pg.click('[data-remiss="EM1"]'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(900);
  const st = await pg.evaluate(() => ({ env: window.__MOCK_STORE__.entries.EM1.env, re: window.__MOCK_STORE__.entries.EM1.envRe, n: document.querySelectorAll('.evck').length })); log('after ↩:', JSON.stringify(st));
  if (st.env !== '' || st.re !== 'VMISS') errs.push('↩ should clear env and remember the old envelope'); if (st.n !== order.length + 1) errs.push('the missing check should be back on the send list');
  /* 기록 탭 — 기간 리포트 없음 */
  await pg.evaluate(() => { location.hash = '#/hist'; }); await pg.waitForSelector('#hQ'); if (await pg.$('#pPrev')) errs.push('period report should be gone from 기록');
  /* ---------- 📄 숫자만 친 인보이스 번호 ---------- */
  await pg.evaluate(() => { location.hash = '#/invs'; }); await pg.waitForSelector('#ivQ', { timeout: 8000 }); await pg.fill('#ivQ', '77002'); await pg.waitForSelector('[data-ivd="A77002"]', { timeout: 6000 }).catch(() => errs.push('typing 77002 should find A77002'));
  if (await pg.$('[data-ivd="A77002"]')) { await pg.click('[data-ivd="A77002"]'); await pg.waitForTimeout(800); const t = (await pg.textContent('#mbox')).replace(/\s+/g, ' '); log('inv detail:', t.slice(0, 60)); if (!/A77002|77002/.test(t)) errs.push('invoice detail should open'); }
  await pg.close();
  /* ---------- ⚙️ 관리 설정 — EXCHANGE 칸 숨김 ---------- */
  pg = await mk('luke@theonefl.com');
  await pg.evaluate(() => { location.hash = '#/admin/set'; }); await pg.waitForSelector('#stDisc', { timeout: 8000 });
  if (await pg.$('#stKw') || await pg.$('#stTitle')) errs.push('EXCHANGE example fields should be hidden'); log('admin settings: stKw', !!(await pg.$('#stKw')));
  await pg.click('#stSave'); await pg.waitForTimeout(600); const kw = await pg.evaluate(() => window.__MOCK_STORE__.settings.app.specialKeywords); log('saved specialKeywords kept:', kw);
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
