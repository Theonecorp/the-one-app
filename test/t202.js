/* v0.8.191 시험 — ↕ 인보이스 목록 머리글을 눌러 정렬 (옛 프로그램처럼 — 2026-11-12 관리자: "인보이스 번호 제목을 누르면 인보이스 순서로, Customer 를 누르면 커스토머 이름으로, Sales Rep 을 누르면 세일즈맨으로")
 *   ① 📄 인보이스(📅 기간별) 표: 거래처 머리글 → 가게 이름 ABC 순 (묶음 없이 한 줄로) · 한 번 더 → 반대 · 한 번 더 → 원래 날짜 묶음
 *   ② 세일즈맨 머리글 → 세일즈맨 순 (같은 세일즈맨 안은 가게 이름) · 인보이스 머리글 → 번호 순 · 합계 머리글 → 큰 것부터
 *   ③ 폰(좁은 화면): 표 머리글 대신 ↕ 정렬 칩 줄 — 거래처 칩 → 가게 이름 순 · ✕ 묶음으로
 *   ④ 세일즈맨 📄 인보이스 찾기(최근)도 같은 정렬 칩 · 표 머리글
 *   ⑤ (v0.8.191 · 옛 Sales Invoice List 사진) 계정 # · 조건(Terms) · 주문 #(S.O.) · 수량 칸도 머리글 정렬 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8873', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const d0 = new Date(); const ds = n => { const d = new Date(d0); d.setDate(Math.max(1, d0.getDate() - n)); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const INV = [['A-000011', 'ZETA B/S', '3001', 'ALEX', 50, 0], ['A-000009', 'ALPHA BEAUTY', '1111', 'SOO', 300, 1], ['A-000010', 'MIDDLE SHOP', '1271', 'BRANDON', 120, 1], ['A-000012', 'BETA STORE', '2427', 'ALEX', 80, 2]].map(x => ({ id: x[0], no: x[0], t: 'A', d: ds(x[5]), ym: ds(x[5]).substring(0, 7), store: x[1], acct: x[2], sm: x[3], total: x[4], bal: x[4], qty: 1, st: 'open', lines: [{ c: 'AHG100', d: 'x', q: 1, p: x[4] }] }));
  const open = async (email, w) => { const pg = await (await br.newContext({ viewport: { width: w, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message));
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = s => { s.invoices = o.inv; }; }, { email, inv: INV });
    await pg.goto('http://127.0.0.1:8873/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  const order = pg => pg.$$eval('#iList [data-go^="inv:"]', E => E.map(e => e.dataset.go.substring(4)));
  /* ① */
  const pg = await open('luke@theonefl.com', 1100);
  await pg.evaluate(() => { location.hash = '#/invs'; }); await pg.waitForSelector('[data-im="date"]', { timeout: 8000 }); await pg.click('[data-im="date"]'); await pg.waitForSelector('#iList .kpi', { timeout: 8000 }); await pg.waitForTimeout(400);
  log('① grouped:', (await order(pg)).join(' '), '| groups:', (await pg.$$('#iList tr.grp')).length);
  await pg.click('#iList th[data-isort="store"]'); await pg.waitForTimeout(500);
  const o1 = await order(pg); log('① by customer:', o1.join(' ')); if (o1.join() !== 'A-000009,A-000012,A-000010,A-000011' || (await pg.$$('#iList tr.grp')).length) errs.push('① customer header → store name A→Z, no groups');
  if (!/▲/.test(await pg.textContent('#iList th[data-isort="store"]'))) errs.push('① arrow ▲ on the header');
  await pg.click('#iList th[data-isort="store"]'); await pg.waitForTimeout(500); const o1b = await order(pg); log('① again:', o1b.join(' ')); if (o1b.join() !== 'A-000011,A-000010,A-000012,A-000009') errs.push('① second tap → Z→A');
  await pg.click('#iList th[data-isort="store"]'); await pg.waitForTimeout(500); if (!(await pg.$$('#iList tr.grp')).length) errs.push('① third tap → back to date groups');
  /* ② */
  await pg.click('#iList th[data-isort="sm"]'); await pg.waitForTimeout(500); const o2 = await order(pg); log('② by rep:', o2.join(' ')); if (o2.join() !== 'A-000012,A-000011,A-000010,A-000009') errs.push('② rep header → ALEX (BETA, ZETA) · BRANDON · SOO');
  await pg.click('#iList th[data-isort="no"]'); await pg.waitForTimeout(500); const o3 = await order(pg); log('② by invoice #:', o3.join(' ')); if (o3.join() !== 'A-000009,A-000010,A-000011,A-000012') errs.push('② invoice header → number order');
  await pg.click('#iList th[data-isort="total"]'); await pg.waitForTimeout(500); const o4 = await order(pg); log('② by total:', o4.join(' ')); if (o4.join() !== 'A-000009,A-000010,A-000012,A-000011') errs.push('② total header → largest first');
  /* ⑤ (v0.8.191) 옛 Sales Invoice List 처럼 계정 # · 조건 · 주문 # · 수량 머리글도 */
  for (const k of ['acct', 'terms', 'order', 'qty']) if (!(await pg.$('#iList th[data-isort="' + k + '"]'))) errs.push('⑤ sortable header ' + k);
  await pg.click('#iList th[data-isort="acct"]'); await pg.waitForTimeout(500); const o5 = await order(pg); log('⑤ by cust #:', o5.join(' ')); if (o5.join() !== 'A-000009,A-000010,A-000012,A-000011') errs.push('⑤ Cust # header → account number order');
  /* ③ */
  const ph = await open('luke@theonefl.com', 400);
  await ph.evaluate(() => { location.hash = '#/invs'; }); await ph.waitForSelector('[data-im="date"]', { timeout: 8000 }); await ph.click('[data-im="date"]'); await ph.waitForSelector('#iList .kpi', { timeout: 8000 }); await ph.waitForTimeout(400);
  if (!(await ph.$('#iList .sortchips'))) errs.push('③ phone shows the sort chips');
  await ph.click('#iList .sortchips [data-isort="store"]'); await ph.waitForTimeout(500); const p1 = await order(ph); log('③ phone by customer:', p1.join(' ')); if (p1.join() !== 'A-000009,A-000012,A-000010,A-000011') errs.push('③ phone customer chip');
  await ph.click('#iList .sortchips [data-isort=""]'); await ph.waitForTimeout(500); if (await ph.$('#iList .sortchips [data-isort=""]')) errs.push('③ ✕ back to groups');
  /* ④ */
  const sm = await open('brandon@x.com', 1100);
  await sm.evaluate(() => { location.hash = '#/invs'; }); await sm.waitForTimeout(2500);
  const has = await sm.$('th[data-isort="store"], .sortchips [data-isort="store"]'); log('④ salesman lookup has sort:', !!has);
  if (!has) errs.push('④ salesman invoice lookup has sortable headers');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
