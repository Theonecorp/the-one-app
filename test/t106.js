/* v0.8.138 시험 — 📒 아이템 · 카탈로그: 누구나 검색(숨김 포함) · 아이템 창에 📦 재고 · 📍 위치 · 담당자만 ✏️ 수정
 *   📄 인보이스 묶음: 세일즈맨 📅 최근 · 🏷 종류별 · 🏙 지역별(주 › 도시) · 🏬 가게별 / 담당자 👤 세일즈맨별 · 🏙 지역별 · 🏷 종류별 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8855', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 400, height: 800 } });
  const mk = async (email, seed) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.seed) window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed }); await pg.goto('http://127.0.0.1:8855/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  const seed = `const d = new Date(); const day = n => { const x = new Date(d); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
    s.stock = (s.stock || []).concat([{ id: 'AHG100', code: 'AHG100', qty: 37 }]);
    s.invoices = (s.invoices || []).concat([
      { id: 'A66001', no: 'A66001', t: 'A', d: day(2), ym: day(2).slice(0, 7), acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', total: 100, bal: 100, st: 'open', lines: [] },
      { id: 'P66002', no: 'P66002', t: 'P', d: day(3), ym: day(3).slice(0, 7), acct: '1271', store: 'BEAUTY 4U', sm: 'BRANDON', total: 200, bal: 200, st: 'open', lines: [] },
      { id: 'W66003', no: 'W66003', t: 'W', d: day(4), ym: day(4).slice(0, 7), acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', total: 300, bal: 300, st: 'open', lines: [] },
      { id: 'A66004', no: 'A66004', t: 'A', d: day(1), ym: day(1).slice(0, 7), acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', sm: 'ALEX', total: 400, bal: 400, st: 'open', lines: [] }]);`;
  /* ---------- 세일즈맨: 아이템 조회 ---------- */
  let pg = await mk('brandon@x.com', seed);
  await pg.evaluate(() => { location.hash = '#/cat'; }); await pg.waitForSelector('#cpQ', { timeout: 8000 });
  await pg.fill('#cpQ', 'AHG9001'); await pg.waitForTimeout(500); const hid = await pg.$('[data-cpi="AHG9001"]'); log('hidden item found:', !!hid); if (!hid) errs.push('search should find hidden items too');
  if (hid) { const t = await pg.textContent('#cpList'); if (!/🙈/.test(t)) errs.push('hidden item should be marked 🙈'); }
  await pg.fill('#cpQ', 'AHG100'); await pg.waitForTimeout(500); await pg.click('[data-cpi="AHG100"]'); await pg.waitForSelector('#isStk'); await pg.waitForFunction(() => document.getElementById('isStk').textContent !== '…', null, { timeout: 5000 }).catch(() => {});
  const sheet = await pg.evaluate(() => ({ stk: document.getElementById('isStk').textContent, loc: /📍/.test(document.getElementById('mbox').textContent), bar: /898000000000/.test(document.getElementById('mbox').textContent), ed: !!document.getElementById('isEd'), ord: !!document.getElementById('isOrd') }));
  log('salesman item sheet:', JSON.stringify(sheet)); if (sheet.stk !== '37') errs.push('item sheet should show stock 37, got ' + sheet.stk); if (!sheet.loc || !sheet.bar) errs.push('item sheet should show location and barcode'); if (sheet.ed) errs.push('salesman must not get ✏️ 수정'); if (!sheet.ord) errs.push('salesman should be able to add to order');
  await pg.click('#modal .mclose'); await pg.waitForTimeout(300);
  /* 세일즈맨: 인보이스 묶음 */
  await pg.evaluate(() => { location.hash = '#/invs'; }); await pg.waitForSelector('[data-ivm="type"]', { timeout: 8000 });
  await pg.click('[data-ivm="type"]'); await pg.waitForTimeout(800); let t = (await pg.textContent('#ivOut')).replace(/\s+/g, ' '); log('by type:', t.slice(0, 120));
  if (!/🏷 A/.test(t) || !/🏷 P/.test(t) || !/🏷 W/.test(t)) errs.push('salesman invoices should group by A · P · W'); if (/A66004/.test(t)) errs.push('another salesman\'s invoice must not show');
  await pg.click('[data-ivm="geo"]'); await pg.waitForTimeout(800); t = (await pg.textContent('#ivOut')).replace(/\s+/g, ' '); log('by region:', t.slice(0, 120));
  if (!(await pg.$('[data-ist="FL"]')) || !(await pg.$('[data-ist="IL"]'))) errs.push('region mode should offer FL and IL chips'); if (!/🏙 FL/.test(t)) errs.push('region groups missing');
  await pg.click('[data-ist="IL"]'); await pg.waitForTimeout(700); t = (await pg.textContent('#ivOut')).replace(/\s+/g, ' '); if (!/🏙 CHICAGO HEIGHTS/.test(t) || /A66001/.test(t)) errs.push('picking IL should show city groups with only IL invoices');
  await pg.close();
  /* ---------- 담당자(관리자): 아이템 수정 버튼 · 인보이스 묶음 ---------- */
  pg = await mk('luke@theonefl.com', seed);
  await pg.evaluate(() => { location.hash = '#/cat'; }); await pg.waitForSelector('#cpQ', { timeout: 8000 }); await pg.fill('#cpQ', 'AHG100'); await pg.waitForTimeout(500); await pg.click('[data-cpi="AHG100"]'); await pg.waitForSelector('#isEd', { timeout: 5000 }).catch(() => errs.push('staff should get ✏️ 수정'));
  if (await pg.$('#isStock')) { await pg.click('#isStock'); await pg.waitForSelector('#skQ', { timeout: 6000 }).catch(() => errs.push('📦 재고 기록 should open the stock page')); const v = await pg.$eval('#skQ', e => e.value).catch(() => ''); log('stock page query:', v); if (v !== 'AHG100') errs.push('stock page should open searching AHG100'); }
  /* v0.8.139: 🏷 아이템 관리 — 목록이 바로 보이고, 📍 통로별은 위치가 없으면 안내 */
  await pg.evaluate(() => { location.hash = '#/items'; }); await pg.waitForSelector('#itQ', { timeout: 8000 }); await pg.waitForTimeout(500);
  const it0 = await pg.evaluate(() => document.querySelectorAll('#itList .irow').length); log('items default rows:', it0); if (it0 < 50) errs.push('items page should list items right away, got ' + it0);
  await pg.click('[data-iv="aisle"]'); await pg.waitForTimeout(400); t = (await pg.textContent('#page')).replace(/\s+/g, ' '); if (!/위치가 입력된 아이템이 없습니다|No item has a location/.test(t)) errs.push('aisle view should explain when no item has a location');
  await pg.click('[data-iv="tree"]'); await pg.waitForTimeout(400); if (!(await pg.$('[data-ik]'))) errs.push('category view should show category chips');
  await pg.evaluate(() => { location.hash = '#/invs'; }); await pg.waitForSelector('[data-im="sm"]', { timeout: 8000 });
  await pg.click('[data-im="date"]'); await pg.waitForTimeout(600); if (await pg.$('[data-ip="month"]')) await pg.click('[data-ip="month"]'); await pg.waitForTimeout(800);
  await pg.click('[data-im="sm"]'); await pg.waitForTimeout(900); t = (await pg.textContent('#iList')).replace(/\s+/g, ' '); log('staff by salesman:', t.slice(0, 100)); if (!/👤 BRANDON/.test(t) || !/👤 ALEX/.test(t)) errs.push('staff invoices should group by salesman');
  await pg.click('[data-im="type"]'); await pg.waitForTimeout(900); t = (await pg.textContent('#iList')).replace(/\s+/g, ' '); if (!/🏷 A/.test(t) || !/🏷 W/.test(t)) errs.push('staff invoices should group by type');
  await pg.click('[data-im="geo"]'); await pg.waitForTimeout(900); if (!(await pg.$('#iList [data-ist="FL"]'))) errs.push('staff region mode should offer state chips');
  else { await pg.click('#iList [data-ist="FL"]'); await pg.waitForTimeout(900); t = (await pg.textContent('#iList')).replace(/\s+/g, ' '); if (!/🏙 ORLANDO/.test(t) || !/🏙 LIGHTHOUSE POINT/.test(t) || /P66002/.test(t)) errs.push('FL should split into city groups without IL invoices'); }
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
