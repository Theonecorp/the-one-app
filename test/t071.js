/* v0.8.82 시험 — 주문 확인 다시 짜기: 세일즈맨은 보낸 주문을 한 번에 ✅ (몇 건 · 어디 · 금액), ⚠️ 문제 알리기 → 매니저 띠 · 해결,
 *   매니저 ❓ 확인 요청(질문) → 세일즈맨 앱에 위 띠 · 소리 · 숫자, notifyq 로 이메일 · 구글 챗 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8804', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const seed = `const now = Date.now(), mk = (id, store, h, amt, ex) => { const t = new Date(now - h * 3600000).toISOString(); return Object.assign({ id, no: id, d: t.substring(0, 10), ym: t.substring(0, 7), sm: 'BRANDON', acct: '1111', store, st: 'sent', n: 3, qty: 12, amt, createdAt: t, updatedAt: t, sentAt: t }, ex || {}); };
    s.orders.push(mk('OD1', 'DAY SHOP A', 1, 120), mk('OD2', 'DAY SHOP B', 2, 80), mk('OD3', 'ASKED SHOP', 3, 50, { cfReq: true, cfNote: 'AHG100 24개 맞나요?' }), mk('OD4', 'OLD OK', 30, 10, { cfOk: true }));`;
  const mk = async (email) => { const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(([e, sd]) => { window.__MOCK_USER__ = { email: e, name: 'X' }; window.__AFTER_SEED__ = s => { s.settings[0].ordersOn = true; new Function('s', sd)(s); }; }, [email, seed]);
    await pg.goto('http://127.0.0.1:8804/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  /* 세일즈맨 */
  let pg = await mk('brandon@x.com');
  await pg.evaluate(() => { location.hash = '#/home'; }); await pg.waitForSelector('#dayCf .card', { timeout: 8000 }).catch(() => errs.push('day confirm card missing'));
  const card = (await pg.textContent('#dayCf')).replace(/\s+/g, ' '); log('day card:', card.slice(0, 160));
  if (!/2건/.test(card) || !/DAY SHOP A/.test(card) || /ASKED SHOP|OLD OK/.test(card)) errs.push('day card should list the 2 unconfirmed sent orders only');
  await pg.waitForSelector('#cfBarS', { timeout: 5000 }).catch(() => errs.push('office request bar missing'));
  log('bar:', await pg.textContent('#cfBarS').catch(() => ''), 'badge:', await pg.textContent('#nav [data-go="order"] .nbadge').catch(() => ''), 'title:', await pg.title());
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'daycf.png') });
  /* ⚠️ B 문제 알리기 → A 만 ✅ */
  await pg.click('[data-dci="OD2"]'); await pg.waitForSelector('#isTx'); await pg.fill('#isTx', '내 주문 아님'); await pg.click('#isGo'); await pg.waitForTimeout(800);
  await pg.waitForSelector('#dcAll'); log('after issue:', (await pg.textContent('#dayCf')).replace(/\s+/g, ' ').slice(0, 80));
  await pg.click('#dcAll'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1000);
  const st = await pg.evaluate(() => { const M = window.__MOCK_STORE__; return { a: [M.orders.OD1.cfOk, M.orders.OD1.cfHow], b: [M.orders.OD2.cfOk, M.orders.OD2.cfIssueOpen, M.orders.OD2.cfIssue], q: Object.values(M.notifyq || {}).map(n => n.kind + ':' + n.toStaff + ':' + n.chat) }; });
  log(st); if (st.a.join() !== 'true,day' || st.b[0] || !st.b[1] || st.q.join() !== 'issue:true:true') errs.push('batch confirm / issue state wrong');
  if ((await pg.textContent('#dayCf')).trim()) errs.push('day card should disappear when all handled');
  /* 확인 요청 주문에 질문이 보임 */
  await pg.evaluate(() => { location.hash = '#/order/OD3'; }); await pg.waitForTimeout(1000); if (!/AHG100 24개 맞나요/.test(await pg.textContent('#page'))) errs.push('salesman should see the office question');
  await pg.close();
  /* 매니저 */
  const seed2 = seed + " s.orders.find(o => o.id === 'OD2').cfIssueOpen = true; s.orders.find(o => o.id === 'OD2').cfIssue = '내 주문 아님';";
  pg = await (async () => { const p = await br.newPage({ viewport: { width: 430, height: 1000 } }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); await p.addInitScript(([e, sd]) => { window.__MOCK_USER__ = { email: e, name: 'L' }; window.__AFTER_SEED__ = s => { new Function('s', sd)(s); }; }, ['luke@theonefl.com', seed2]); await p.goto('http://127.0.0.1:8804/test/demo.html'); await p.waitForSelector('#nav button'); return p; })();
  await pg.waitForSelector('#cfBarM', { timeout: 5000 }).catch(() => errs.push('manager issue bar missing')); log('mgr bar:', await pg.textContent('#cfBarM').catch(() => ''));
  await pg.click('#cfBarM'); await pg.waitForTimeout(1200); const pt = (await pg.textContent('#page')).replace(/\s+/g, ' '); if (!/내 주문 아님/.test(pt)) errs.push('order should show the issue');
  await pg.click('#mIssueOk'); await pg.waitForTimeout(1000); if (await pg.evaluate(() => window.__MOCK_STORE__.orders.OD2.cfIssueOpen)) errs.push('resolve failed');
  await pg.waitForTimeout(1800); if (await pg.$('#cfBarM')) errs.push('bar should go away after resolve');
  /* ❓ 확인 요청 + 질문 · 💬 챗 묻기 */
  await pg.evaluate(() => { location.hash = '#/order/OD1x'; }); await pg.evaluate(() => { location.hash = '#/order/OD2'; }); await pg.waitForTimeout(1000);
  await pg.evaluate(() => { window.__MOCK_STORE__.orders.OD2.cfOk = false; }); await pg.evaluate(() => { location.hash = '#/order/OD3'; }); await pg.waitForTimeout(1000);
  if (await pg.$('#mCfReq')) { await pg.click('#mCfReq'); await pg.waitForSelector('#akTx'); await pg.fill('#akTx', '배송 주소 확인'); await pg.click('#akGo'); await pg.waitForTimeout(800); } else errs.push('no ask button');
  if (await pg.$('#mAsk')) { await pg.click('#mAsk'); await pg.waitForSelector('#akTx'); await pg.fill('#akTx', '픽킹 질문'); await pg.click('#akGo'); await pg.waitForTimeout(800); } else errs.push('no chat ask button');
  const q2 = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.notifyq || {}).map(n => n.kind + ':' + n.toSm + ':' + /배송|픽킹/.test(n.text)));
  const o3 = await pg.evaluate(() => window.__MOCK_STORE__.orders.OD3.cfNote); log('queue:', q2, 'note:', o3);
  if (q2.join() !== 'cfreq:BRANDON:true,ask:BRANDON:true' || o3 !== '배송 주소 확인') errs.push('manager ask / chat queue wrong');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
