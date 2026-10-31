/* v0.8.17 시험 — 📊 리포트 (아이템별 · 손님별 · 세일즈맨별 · CSV · 인쇄) · 손님용 스테이트먼트 (세일즈맨 가게 창에서 인쇄) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8784', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  fs.mkdirSync(path.resolve(__dirname, 'out'), { recursive: true });
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const T = new Date(), d0 = T.toISOString().substring(0, 10), d1 = new Date(T - 86400000).toISOString().substring(0, 10);
  const mk = async (email) => {
    const pg = await br.newPage({ viewport: { width: 430, height: 1000 } });
    pg.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n')[1])); pg.on('dialog', d => d.accept());
    await pg.addInitScript(([email, d0, d1]) => {
      window.__MOCK_USER__ = { email, name: 'X' };
      window.__AFTER_SEED__ = s => { s.settings[0].ordersOn = true;
        const mk = (no, t, d, acct, store, sm, total, lines) => ({ id: no, no, t, d, ym: d.substring(0, 7), acct, store, sm, order: 'O1', orderId: 'O1', qty: lines.reduce((a, l) => a + l.q, 0), sub: total, disc: 0, total, bal: total, terms: 'N30', st: 'open', lines, createdAt: d + 'T12:00:00Z' });
        s.invoices = [mk('A00001', 'A', d0, '3001', 'BEAUTY EXCHANGE ORLANDO', 'ALEX', 100, [{ c: 'AHG100', d: 'ITEM 0', q: 20, p: 2.5, lp: 2.5, g: 'EARRING' }, { c: 'AHG101', d: 'ITEM 1', q: 10, p: 5, lp: 5, g: 'EARRING' }]), mk('P00001', 'P', d0, '3001', 'BEAUTY EXCHANGE ORLANDO', 'ALEX', 50, [{ c: 'EB103', d: 'EDGE', q: 10, p: 5, lp: 5, g: 'HAIR' }]), mk('A00002', 'A', d1, '1111', 'ALI B/S # 1', 'BRANDON', 80, [{ c: 'AHG100', d: 'ITEM 0', q: 32, p: 2.5, lp: 2.5, g: 'EARRING' }])]; };
    }, [email, d0, d1]);
    await pg.goto('http://127.0.0.1:8784/test/demo.html'); await pg.waitForSelector('#nav button'); return pg;
  };
  const txt = async (pg, sel) => ((await pg.textContent(sel)) || '').replace(/\s+/g, ' ').trim();
  const shot = (pg, n) => pg.screenshot({ path: path.resolve(__dirname, 'out', n + '.png'), fullPage: true });
  /* 1. 루크: 리포트 */
  let pg = await mk('luke@theonefl.com');
  await pg.evaluate(() => { location.hash = '#/mg'; }); await pg.waitForSelector('#mgRep'); await pg.click('#mgRep'); await pg.waitForSelector('#rBody table'); await pg.waitForTimeout(400);
  log('item tab:', (await txt(pg, '#rBody')).slice(0, 220)); await shot(pg, 'f0_rep_item');
  const items = await pg.$$eval('#rBody table tr', r => r.length - 1); if (items !== 3) errs.push('item rows expected 3, got ' + items);
  const first = await txt(pg, '#rBody table tr:nth-child(2)'); if (!/AHG100/.test(first) || !/130\.00/.test(first)) errs.push('top item should be AHG100 $130: ' + first);
  await pg.click('[data-rt="cust"]'); await pg.waitForTimeout(300); log('cust tab:', (await txt(pg, '#rBody table')).slice(0, 220));
  const c1 = await txt(pg, '#rBody table tr:nth-child(2)'); if (!/BEAUTY EXCHANGE/.test(c1) || !/150\.00/.test(c1)) errs.push('top customer wrong: ' + c1);
  await pg.click('[data-rt="sm"]'); await pg.waitForTimeout(300); log('sm tab:', (await txt(pg, '#rBody table')).slice(0, 260));
  const s1 = await txt(pg, '#rBody table tr:nth-child(2)'); if (!/ALEX/.test(s1) || !/100\.00/.test(s1) || !/50\.00/.test(s1)) errs.push('salesman row wrong: ' + s1);
  await pg.click('[data-rp="today"]'); await pg.waitForSelector('#rBody table'); await pg.waitForTimeout(400); log('today sm:', (await txt(pg, '#rBody .kpi')).slice(0, 120));
  if (!/\$150\.00/.test(await txt(pg, '#rBody .kpi'))) errs.push('today total should be 150');
  await pg.click('#rPrint'); await pg.waitForSelector('#prt.on'); log('print:', (await txt(pg, '#prtbody')).slice(0, 100)); await pg.click('#prtClose');
  await pg.close();
  /* 2. 세일즈맨: 가게 창 → 스테이트먼트 */
  pg = await mk('brandon@x.com');
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pg.fill('#eStoreQ', 'ali b/s'); await pg.waitForTimeout(250); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(1200);
  if (!(await pg.$('#ssStmt'))) { if (await pg.$('#modal.on')) await pg.click('#modal .mclose'); await pg.click('#eStoreI'); await pg.waitForSelector('#ssStmt'); }
  await pg.click('#ssStmt'); await pg.waitForSelector('#prt.on'); await pg.waitForTimeout(300);
  const st = await txt(pg, '#prtbody'); log('statement:', st.slice(0, 300)); await shot(pg, 'f1_statement');
  if (!/STATEMENT/.test(st) || !/TOTAL DUE/.test(st) || !/A00002/.test(st)) errs.push('statement missing parts');
  await pg.close();
  log('errors:', errs.length ? errs : 'none'); await br.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})();
