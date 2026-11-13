/* v0.8.226 시험 — ✕ 취소된 주문은 따로 · 회색으로 (2026-11-13 세일즈맨 요청: "주문 취소한 매장도 주문 넣은 매장과 구분 없이 리스트에 떠서 헷갈림")
 *   ① 세일즈맨 세일 → 내 주문: 기본은 📋 접수된 주문만 (취소된 주문은 안 보임) · 건수 · 금액도 취소 빼고
 *   ② ✕ 취소된 주문 N 탭 → 취소된 것만 · 회색 + 가게 이름 줄긋기 (지우지 않음)
 *   ③ 담당자 목록(전체 주문)에 섞여 나와도 취소된 줄은 회색으로 구분 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8956', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const SEED = () => { window.__AFTER_SEED__ = s => { const now = new Date().toISOString(), d = now.substring(0, 10);
    const mk = (id, store, amt, st) => ({ id, no: id, d, ym: d.substring(0, 7), sm: 'BRANDON', acct: '1111', store, st, n: 1, qty: 3, amt, createdBy: 'brandon@x.com', createdAt: now, updatedAt: now, sentAt: now });
    s.orders = (s.orders || []).filter(o => o.sm !== 'BRANDON').concat([mk('O-T264-A', 'ACTIVE ONE', 100, 'sent'), mk('O-T264-B', 'ACTIVE TWO', 200, 'pick'), mk('O-T264-X', 'CANCELLED SHOP', 300, 'x')]);
    s.users.push({ id: 'off@x.com', email: 'off@x.com', name: 'O', role: 'manager', job: 'office', active: true }); }; };
  const open = async (email, W) => { const pg = await (await br.newContext({ viewport: { width: W, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message));
    await pg.addInitScript(e => { window.__MOCK_USER__ = { email: e, name: 'U' }; }, email); await pg.addInitScript(SEED);
    await pg.goto('http://127.0.0.1:8956/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(600); return pg; };
  for (const W of [1300, 390]) {
    const pg = await open('brandon@x.com', W);
    await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForSelector('[data-sx]', { timeout: 8000 });
    const ids = () => pg.evaluate(() => [...document.querySelectorAll('[data-oid]')].map(r => r.dataset.oid).filter(x => /T264/.test(x)));
    const a = await ids(), head = (await pg.textContent('#page h2:has(+ .chips), #page .card h2')).replace(/\s+/g, ' ');
    log('①', W, JSON.stringify(a), head.slice(0, 60));
    if (a.includes('O-T264-X') || !a.includes('O-T264-A') || !a.includes('O-T264-B')) errs.push('① ' + W + ': default list shows active orders only');
    const chipTxt = await pg.textContent('[data-sx="1"]'); if (!/1/.test(chipTxt)) errs.push('① ' + W + ': cancelled tab shows its count');
    await pg.click('[data-sx="1"]'); await pg.waitForTimeout(500);
    const b = await ids(); const st = await pg.evaluate(() => { const r = document.querySelector('[data-oid="O-T264-X"]'); if (!r) return null; const nm = r.querySelector('td b, .cmain>b'); return { ox: r.classList.contains('ox'), deco: getComputedStyle(nm).textDecorationLine }; });
    log('②', W, JSON.stringify(b), JSON.stringify(st));
    if (b.join() !== 'O-T264-X') errs.push('② ' + W + ': cancelled tab shows only the cancelled order');
    if (!st || !st.ox || st.deco !== 'line-through') errs.push('② ' + W + ': cancelled row is grey with the store struck through');
    await pg.click('[data-sx="0"]'); await pg.waitForTimeout(400); if ((await ids()).includes('O-T264-X')) errs.push('② back to active orders');
  }
  /* ③ */
  const o = await open('off@x.com', 1300);
  await o.evaluate(() => { location.hash = '#/order'; }); await o.waitForTimeout(500); await o.evaluate(() => window.dispatchEvent(new CustomEvent('theone:list', { detail: 'all' }))); await o.waitForSelector('[data-oid="O-T264-X"]', { timeout: 8000 }).catch(() => {});
  const c = await o.evaluate(() => { const r = document.querySelector('[data-oid="O-T264-X"]'), a = document.querySelector('[data-oid="O-T264-A"]'); return { x: r ? r.classList.contains('ox') : null, a: a ? a.classList.contains('ox') : null }; });
  log('③ staff all:', JSON.stringify(c)); if (c.x !== true || c.a !== false) errs.push('③ staff list greys only the cancelled order');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
