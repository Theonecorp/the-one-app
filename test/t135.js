/* v0.8.166 시험 — ⤵ 긴 화면의 주 단추가 맨 아래에도: 주문 · 픽킹 시트(💾 작업 저장 · ✅ 작업 완료)와 세일즈맨 주문 화면(✅ 확인)의 단추가 줄 목록 아래에 한 번 더 있고, 누르면 위 단추와 똑같이 동작
 *   ① 사무실: 작업 시작 → 아래 단추(data-dup)가 줄 목록보다 밑에 있음 · 아래 💾 저장 = 위 💾 저장 · 아래 ✅ 작업 완료 → 확인 → 🧾 발행 단추로 바뀜
 *   ② 세일즈맨: 확인 요청 온 주문의 ✅ 확인이 아래에도 있고, 아래 것을 누르면 주문에 cfOk 가 저장됨 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8887', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 430, height: 800 } });
  const mk = async (email, seed) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.seed) window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed }); await pg.goto('http://127.0.0.1:8887/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  const below = (pg, a, b) => pg.evaluate(([a, b]) => { const x = document.querySelector(a), y = document.querySelector(b); return x && y ? x.getBoundingClientRect().top > y.getBoundingClientRect().bottom - 1 : null; }, [a, b]);
  /* ---------- ① 사무실: 주문 시트 → 작업 시작 ---------- */
  let pg = await mk('luke@theonefl.com', '');
  await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#mPick', { timeout: 8000 });
  const s0 = await pg.evaluate(() => ({ top: !!document.getElementById('mAssign'), dup: !!document.querySelector('[data-dup="mAssign"]'), dups: document.querySelectorAll('[data-dup]').length, ids: document.querySelectorAll('#mAssign').length }));
  log('① sent state:', JSON.stringify(s0)); if (!s0.top || !s0.dup) errs.push('① main buttons must be mirrored at the bottom (sent state)'); if (s0.ids !== 1) errs.push('① the id must stay unique (only the top button carries it)');
  await pg.click('#mPick'); await pg.waitForTimeout(400); if (await pg.$('#prtClose')) { await pg.click('#prtClose'); await pg.waitForTimeout(300); }
  await pg.waitForSelector('#mPickDone', { timeout: 8000 });
  const s1 = await pg.evaluate(() => ({ dupSave: !!document.querySelector('[data-dup="mPickSave"]'), dupDone: !!document.querySelector('[data-dup="mPickDone"]'), foot: document.querySelectorAll('.btns.foot').length }));
  log('① pick state:', JSON.stringify(s1)); if (!s1.dupSave || !s1.dupDone || s1.foot !== 1) errs.push('① 💾 작업 저장 · ✅ 작업 완료 must appear once more at the bottom');
  const isBelow = await below(pg, '[data-dup="mPickDone"]', '#mFind'); log('① bottom bar below the line list:', isBelow); if (!isBelow) errs.push('① the bottom bar must sit below the item list');
  /* 아래 💾 = 위 💾 (원래 단추가 눌림) */
  await pg.evaluate(() => { window.__hit = 0; document.getElementById('mPickSave').addEventListener('click', () => { window.__hit++; }); });
  await pg.click('[data-dup="mPickSave"]'); await pg.waitForTimeout(500);
  const hit = await pg.evaluate(() => window.__hit); log('① bottom save → top save clicked:', hit); if (hit !== 1) errs.push('① tapping the bottom 💾 must trigger the top 💾 exactly once');
  /* 아래 ✅ 작업 완료 → 확인 → 🧾 인보이스 발행 */
  await pg.click('[data-dup="mPickDone"]'); await pg.waitForSelector('#cfOk', { timeout: 5000 }).catch(() => errs.push('① bottom ✅ 작업 완료 should ask to confirm'));
  if (await pg.$('#cfOk')) { await pg.click('#cfOk'); await pg.waitForSelector('#mInv', { timeout: 8000 }).catch(() => errs.push('① after completing, the 🧾 issue button should show')); }
  const s2 = await pg.evaluate(() => ({ st: window.__MOCK_STORE__.orders['O261014-AAAA'].st, dupInv: !!document.querySelector('[data-dup="mInv"]') }));
  log('① after done:', JSON.stringify(s2)); if (s2.st !== 'picked') errs.push('① order should be picked after the bottom ✅'); if (!s2.dupInv) errs.push('① 🧾 issue button mirrored at the bottom too');
  await pg.close();
  /* ---------- ② 세일즈맨: 확인 요청 온 주문 ---------- */
  pg = await mk('brandon@x.com', "const o = s.orders.find(x => x.id === 'O261014-AAAA'); o.sm = 'BRANDON'; o.st = 'sent'; o.cfReq = true; o.cfOk = false; (s.orderLines || []).forEach(l => { if (l.id === 'O261014-AAAA') l.sm = 'BRANDON'; });");
  await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#oCfOk', { timeout: 8000 });
  const s3 = await pg.evaluate(() => ({ dup: !!document.querySelector('[data-dup="oCfOk"]'), ids: document.querySelectorAll('#oCfOk').length }));
  const isBelow2 = await below(pg, '[data-dup="oCfOk"]', '#oFind'); log('② salesman:', JSON.stringify(s3), 'below list:', isBelow2);
  if (!s3.dup || s3.ids !== 1 || !isBelow2) errs.push('② ✅ 확인 must be mirrored below the item list (id unique)');
  await pg.click('[data-dup="oCfOk"]'); await pg.waitForTimeout(800);
  const s4 = await pg.evaluate(() => { const o = window.__MOCK_STORE__.orders['O261014-AAAA']; return { cfOk: !!o.cfOk, by: o.cfBy }; }); log('② after bottom ✅:', JSON.stringify(s4));
  if (!s4.cfOk || s4.by !== 'brandon@x.com') errs.push('② tapping the bottom ✅ must confirm the order like the top one');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
