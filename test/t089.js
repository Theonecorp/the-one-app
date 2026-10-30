/* v0.8.111 시험 — 📄 인보이스가 보여야 한다: 담당자 조회(전체 장수 · 기간에 없으면 최근 200장) · 세일즈맨(sm 코드가 달라도 내 가게 기준) · 주문 입력 화면 가게 기록 한 줄 + 📋 기록 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8826', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 430, height: 1000 } });
  const mk = async (email, seed) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.seed) window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed }); await pg.goto('http://127.0.0.1:8826/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  const txt = async (pg, q) => ((await pg.textContent(q).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  /* 이전 시스템 인보이스 — 세일즈맨 코드가 'BK'(앱 코드 아님) · 지난달 · 작년 */
  const ym = d => d.substring(0, 7), now = new Date(), y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0');
  const seed = "s.invoices = s.invoices || []; s.invoices.push(" +
    JSON.stringify([{ id: 'A43001', no: 'A43001', t: 'A', d: y + '-' + m + '-02', ym: y + '-' + m, acct: '1271', store: 'BEAUTY 4U', sm: 'BK', total: 180, bal: 0, st: 'paid', src: 'legacy', lines: [] },
      { id: 'A42900', no: 'A42900', t: 'A', d: (y - 1) + '-06-10', ym: (y - 1) + '-06', acct: '1271', store: 'BEAUTY 4U', sm: 'BK', total: 95.5, bal: 0, st: 'paid', src: 'legacy', lines: [] },
      { id: 'P08700', no: 'P08700', t: 'P', d: y + '-' + m + '-03', ym: y + '-' + m, acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', sm: 'ALEX', total: 60, bal: 60, st: 'open', src: 'legacy', lines: [] }]).slice(1, -1) + ");" +
    "s.acctNotes = (s.acctNotes || []).concat([{ id: 'NT1', acct: '1271', store: 'BEAUTY 4U', text: '월요일 휴무 · 뒷문 배달', kind: 'info', pin: false, by: 'x', at: '2026-10-01T10:00:00Z' }]);";
  /* ① 담당자 — 📄 인보이스 조회 */
  let pg = await mk('luke@theonefl.com', seed);
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(600);
  await pg.evaluate(() => window.dispatchEvent(new CustomEvent('theone:list', { detail: 'inv' }))); await pg.waitForSelector('[data-im="date"]', { timeout: 8000 }).catch(() => errs.push('invoice browser missing'));
  await pg.click('[data-im="date"]'); await pg.waitForSelector('#iList .kpi', { timeout: 8000 }).catch(() => errs.push('date mode list missing')); await pg.waitForTimeout(400);
  let t = await txt(pg, '#iList'); log('month:', t.slice(0, 160));
  if (!/전체 인보이스 3/.test(t)) errs.push('header should count all 3 invoices'); if (!/A43001/.test(t) || !/P08700/.test(t)) errs.push('this month should list the two current invoices');
  await pg.click('[data-ip="today"]'); await pg.waitForTimeout(800); t = await txt(pg, '#iList'); log('today:', t.slice(0, 200));
  if (!/가장 최근 200장/.test(t) || !/A42900/.test(t)) errs.push('empty period should fall back to the latest invoices');
  await pg.close();
  /* ② 세일즈맨 — 📄 최근 인보이스: sm 'BK' 로는 없지만 내 가게(1271) 기준으로 보임 */
  pg = await mk('brandon@x.com', seed);
  await pg.evaluate(() => { location.hash = '#/invs'; }); await pg.waitForSelector('#ivOut .card', { timeout: 8000 }).catch(() => errs.push('salesman invoice page missing')); await pg.waitForTimeout(800);
  t = await txt(pg, '#ivOut'); log('salesman:', t.slice(0, 200));
  if (!/A43001/.test(t) || !/내 가게 기준/.test(t)) errs.push('salesman should see legacy invoice via store fallback'); if (/P08700/.test(t)) errs.push('other salesman invoice must not show');
  /* ③ 주문 입력 — 가게 고르면 기록 한 줄 + 📋 기록 */
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ', { timeout: 8000 });
  await pg.fill('#eStoreQ', '1271'); await pg.waitForSelector('[data-ac="1271"]', { timeout: 5000 }).catch(() => errs.push('store hit missing')); await pg.click('[data-ac="1271"]'); await pg.waitForTimeout(1500);
  if (await pg.$('#cfOk')) { await pg.click('#cfOk'); await pg.waitForTimeout(300); } if (await pg.$('#ssX')) { await pg.click('#ssX'); await pg.waitForTimeout(300); }
  const hb = await txt(pg, '#eStoreI'), hist = await txt(pg, '#eStoreHist'); log('button:', hb, '| hist:', hist);
  if (!/기록/.test(hb)) errs.push('store history button should be labeled'); if (!/🧾 2장/.test(hist) || !/A43001/.test(hist) || !/\$180\.00/.test(hist)) errs.push('store strip should show invoice count and recent invoices'); if (!/월요일 휴무/.test(hist)) errs.push('store strip should show the last note');
  await pg.click('#eStoreI'); await pg.waitForSelector('#ssX', { timeout: 5000 }).catch(() => errs.push('tapping 📋 should open the store window'));   // v0.8.132: 담는 동안 가게 칸이 한 줄이라 기록 줄은 숨고 📋 버튼으로
  t = await txt(pg, '#mbox'); log('sheet:', t.slice(0, 160)); if (!/A42900/.test(t)) errs.push('store window invoice tab should list the legacy invoice');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
