/* v0.8.225 시험 — 🔢 목록 맨 왼쪽 줄 번호 (엑셀처럼 · 2026-11-13 관리자: "신규 주문 · 거래처 · 인보이스 화면 왼쪽에 고정 카운트 숫자 — 몇 개인지 바로")
 *   ① 데스크탑: 거래처 표 · 인보이스 표 · 주문 목록(신규 주문) 표의 머리 맨 왼쪽 '#' · 줄마다 1, 2, 3 … (묶음 줄 · '없음' 줄은 번호 없음) · 마지막 번호 = 줄 수
 *   ② 옆으로 밀어도 번호 칸은 왼쪽에 붙어 있음 (sticky)
 *   ①-2 인보이스 → 거래처별 가게 목록도 번호
 *   ③ 폰 카드도 왼쪽에 1, 2, 3 … */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8955', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const open = async W => { const pg = await (await br.newContext({ viewport: { width: W, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(W + ': ' + e.message));
    await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'off@x.com', name: 'O' }; window.__AFTER_SEED__ = s => { s.users.push({ id: 'off@x.com', email: 'off@x.com', name: 'O', role: 'manager', job: 'office', active: true });
      const now = new Date().toISOString(), d = now.substring(0, 10); ['ZEBRA', 'ALPHA', 'MIDDLE'].forEach((n, i) => s.orders.push({ id: 'O-T263-' + i, no: 'O-T263-' + i, d, ym: d.substring(0, 7), sm: 'BRANDON', acct: '1111', store: n + ' B/S', st: 'sent', n: 1, qty: 3, amt: 100 + i, createdBy: 'brandon@x.com', createdAt: now, updatedAt: now, sentAt: now }));
      for (let i = 1; i <= 4; i++) s.invoices = (s.invoices || []).concat([{ id: 'A-06000' + i, no: 'A-06000' + i, t: 'A', d, ym: d.slice(0, 7), acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', total: 100 * i, bal: 0, st: 'paid', src: 'app', lines: [] }]); }; });
    await pg.goto('http://127.0.0.1:8955/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(800); return pg; };
  /* 표에서 번호 읽기 — ::before 의 content (counter 는 계산된 값 대신 직접 셈) */
  const nums = (pg, sel) => pg.evaluate(sel => { const t = document.querySelector(sel); if (!t) return null; const head = getComputedStyle(t.querySelector('thead tr'), '::before').content;
    const rows = [...t.querySelectorAll('tbody tr')].map(r => ({ grp: r.classList.contains('grp') || !!r.querySelector(':scope>td.none'), c: getComputedStyle(r, '::before').content, pos: getComputedStyle(r, '::before').position }));
    return { head, n: rows.filter(r => !r.grp).length, counted: rows.filter(r => !r.grp && /counter\(rn\)/.test(r.c)).length, grpBlank: rows.filter(r => r.grp).every(r => r.c === '""'), sticky: rows.filter(r => !r.grp).every(r => r.pos === 'sticky') }; }, sel);
  const d = await open(1300);
  await d.evaluate(() => { location.hash = '#/stores'; }); await d.waitForSelector('table[data-dt="stores"] tbody tr', { timeout: 8000 });
  const st = await nums(d, 'table[data-dt="stores"]'); log('① stores:', JSON.stringify(st));
  await d.evaluate(() => { location.hash = '#/invs'; }); await d.click('[data-im="acct"]'); await d.waitForSelector('#iaList .pr', { timeout: 8000 });
  const ia = await d.evaluate(() => { const r = [...document.querySelectorAll('#iaList > .pr')]; return { n: r.length, ok: r.every(x => /counter\(rn\)/.test(getComputedStyle(x, '::before').content)) }; }); log('① invoices by customer:', JSON.stringify(ia)); if (!ia.n || !ia.ok) errs.push('① invoices → customers list numbered');
  await d.click('[data-im="date"]'); await d.waitForTimeout(500); await d.click('[data-ip="today"]').catch(() => {}); await d.waitForSelector('table.itbl tbody tr', { timeout: 8000 }).catch(() => {});
  const iv = await nums(d, 'table.itbl'); log('① invoices:', JSON.stringify(iv));
  await d.evaluate(() => { location.hash = '#/order'; }); await d.waitForTimeout(800); await d.evaluate(() => window.dispatchEvent(new CustomEvent('theone:list', { detail: 'sent' }))); await d.waitForSelector('table.otbl [data-oid]', { timeout: 8000 }).catch(() => {});
  if (process.env.SHOT) await d.screenshot({ path: process.env.SHOT + '-inv.png', clip: { x: 0, y: 0, width: 1300, height: 700 } });
  const od = await nums(d, 'table.otbl'); log('① orders:', JSON.stringify(od));
  if (process.env.SHOT) await d.screenshot({ path: process.env.SHOT + '-ord.png', clip: { x: 0, y: 0, width: 1300, height: 700 } });
  for (const [nm, x] of [['stores', st], ['invoices', iv], ['orders', od]]) {
    if (!x) { errs.push('① ' + nm + ' table not found'); continue; }
    if (x.head !== '"#"') errs.push('① ' + nm + ': # header');
    if (!x.n || x.counted !== x.n) errs.push('① ' + nm + ': every row numbered (' + x.counted + '/' + x.n + ')');
    if (!x.grpBlank) errs.push('① ' + nm + ': group / empty rows have no number');
    if (!x.sticky) errs.push('② ' + nm + ': number column sticks to the left');
  }
  /* ③ */
  const p = await open(390);
  await p.evaluate(() => { location.hash = '#/stores'; }); await p.waitForSelector('.crows[data-dt="stores"] .crow', { timeout: 8000 }).catch(() => {});
  const pc = await p.evaluate(() => { const c = [...document.querySelectorAll('.crows[data-dt="stores"] > .crow')]; return { n: c.length, ok: c.every(x => /counter\(rn\)/.test(getComputedStyle(x, '::before').content)) }; });
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT + '-phone.png' });
  log('③ phone stores cards:', JSON.stringify(pc)); if (!pc.n || !pc.ok) errs.push('③ phone cards numbered');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
