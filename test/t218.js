/* v0.8.198 시험 — ↕ 주문 목록(접수 · 픽킹 · 검수 · 발행 · 출고 …)도 머리글을 눌러 정렬 (2026-11-12 관리자: "인보이스 · 거래처 조회처럼 리스트가 보이는 모든 곳에서 타이틀로")
 *   ① 담당자 📥 신규 목록: 머리글 금액 → 큰 금액부터 (묶음 머리 없이) · 다시 → 작은 금액부터 · 한 번 더 → 원래 날짜 묶음
 *   ② 가게 → 가게 이름 ABC 순 · ⏱ 대기 머리글도 누를 수 있음
 *   ③ 픽킹 목록에서도 같은 머리글
 *   ④ 폰(좁은 화면): 정렬 칩 줄 → 금액 칩 → 큰 금액부터 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8902', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const SEED = () => { const now = new Date().toISOString(), d = now.substring(0, 10);
    const mk = (id, store, amt, st) => ({ id, no: id, d, ym: d.substring(0, 7), sm: 'BRANDON', acct: '1111', store, st, n: 1, qty: 3, amt, createdBy: 'brandon@x.com', createdAt: now, updatedAt: now, sentAt: now, cfOk: st === 'pick', picker: 'luke@theonefl.com', pickerName: 'L', pickAt: now });
    window.__AFTER_SEED__ = s => { s.orders.push(mk('O-T218-A', 'ZEBRA B/S', 50, 'sent'), mk('O-T218-B', 'ALPHA B/S', 900, 'sent'), mk('O-T218-C', 'MIDDLE B/S', 300, 'sent'), mk('O-T218-P1', 'PICK ONE', 20, 'pick'), mk('O-T218-P2', 'PICK TWO', 700, 'pick')); }; };
  const open = async (w) => { const pg = await (await br.newContext({ viewport: { width: w, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; }); await pg.addInitScript(SEED);
    await pg.goto('http://127.0.0.1:8902/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  const list = async (pg, st) => { await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(500); await pg.evaluate(st => window.dispatchEvent(new CustomEvent('theone:list', { detail: st })), st); await pg.waitForSelector('[data-oid]', { timeout: 8000 }); await pg.waitForTimeout(400); };
  const order = pg => pg.evaluate(() => [...document.querySelectorAll('[data-oid]')].map(r => r.dataset.oid).filter(x => /T218/.test(x)));
  const grps = pg => pg.evaluate(() => document.querySelectorAll('.otbl tr.grp, .otbl .cgrp').length);
  const click = async (pg, k) => { await pg.click('[data-isort="' + k + '"]'); await pg.waitForTimeout(700); };
  /* ① ② */
  const pg = await open(1200); await list(pg, 'sent');
  const hd = await pg.$$eval('.otbl th[data-isort]', T => T.map(t => t.dataset.isort)); log('① sortable heads:', hd.join(' '));
  if (hd.join(' ') !== 'store d ono sm amt lines wait') errs.push('① store · date · no · rep · amount · lines · waiting heads are sortable');
  await click(pg, 'amt'); const o1 = await order(pg); log('① amount ▼:', o1.join(' '), 'groups', await grps(pg));
  if (o1.join(' ') !== 'O-T218-B O-T218-C O-T218-A') errs.push('① amount big first');
  if (await grps(pg)) errs.push('① sorted list has no group heads');
  await click(pg, 'amt'); const o2 = await order(pg); if (o2.join(' ') !== 'O-T218-A O-T218-C O-T218-B') errs.push('① second tap → small first');
  await click(pg, 'amt'); const g3 = await grps(pg); log('① third tap groups:', g3); if (!g3) errs.push('① third tap → back to day groups');
  await click(pg, 'store'); const o4 = await order(pg); log('② store ▲:', o4.join(' ')); if (o4.join(' ') !== 'O-T218-B O-T218-C O-T218-A') errs.push('② store A→Z');
  await click(pg, 'wait'); const o5 = await order(pg); log('② waiting:', o5.join(' ')); if (o5.length !== 3) errs.push('② waiting sort shows all');
  /* ③ */
  await click(pg, 'amt'); await list(pg, 'pick'); const o6 = await order(pg); log('③ pick list (amount sort kept):', o6.join(' '));
  if (o6.join(' ') !== 'O-T218-P2 O-T218-P1') errs.push('③ picking list sorted by the same header');
  /* ④ */
  const ph = await open(400); await list(ph, 'sent');
  const chips = await ph.$$eval('.sortchips [data-isort]', B => B.map(b => b.dataset.isort)); log('④ phone chips:', chips.join(' ')); if (!chips.includes('amt') || !chips.includes('wait')) errs.push('④ phone sort chips');
  await click(ph, 'amt'); const o7 = await order(ph); log('④ phone amount:', o7.join(' ')); if (o7.join(' ') !== 'O-T218-B O-T218-C O-T218-A') errs.push('④ phone amount big first');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
