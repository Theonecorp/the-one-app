/* v0.8.190 시험 — 📍 세일즈맨이 보낸 주문의 단계 보기 · 📣 사무실에 요청 (홀드 · 수정 · 디스플레이 추가 · 기타) (2026-11-12 관리자: "오더를 보낸 뒤 오피스에서 작업 중이면 어느 단계인지 보고, 수정 · 홀드 · 디스플레이 추가 등이 생기면 메시지 · 노티스")
 *   ① 픽킹 중 주문을 세일즈맨이 열면 단계 막대 — 접수 ✓ · 확인 ✓ · 👷 픽킹(지금) · 뒤 단계는 회색 · "창고에서 작업 중" 안내
 *   ② 📣 사무실에 요청 → 🖼 디스플레이 추가 · 내용 → 보내기 → 주문 cfIssue "🖼 디스플레이 추가 요청: …" · cfIssueOpen · 사무실 알림(notifyq smReq) · 화면은 ⏳ 확인 중 · 📣 단추 숨김
 *   ③ 사무실: 주문 화면 빨간 띠에 요청 · ✅ 처리 → 세일즈맨 화면에 ✅ 사무실이 처리함
 *   ④ 인보이스 발행된 주문은 🧾 인보이스가 지금 단계 · 안내 "인보이스 발행됨" */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8871', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const BASE = "Object.assign(s.orders[0], { sm: 'BRANDON', st: 'pick', cfOk: true, cfAt: '2026-11-12T09:00:00Z', pickAt: '2026-11-12T10:00:00Z', picker: 'luke@theonefl.com', pickerName: 'L' }); s.orderLines[0].sm = 'BRANDON';";
  const open = async (email, seed, w) => { const pg = await (await br.newContext({ viewport: { width: w || 420, height: 950 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed });
    await pg.goto('http://127.0.0.1:8871/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  const dump = pg => pg.evaluate(() => { const M = window.__MOCK_STORE__; const o = {}; ['orders', 'orderLines'].forEach(k => { o[k] = {}; Object.entries(M[k] || {}).forEach(([i, d]) => { o[k][i] = Object.assign({ id: i }, d); }); }); return JSON.stringify(o); });
  const seedFrom = j => "const D = " + j + "; Object.keys(D).forEach(k => { s[k] = Object.values(D[k]); });";
  /* ① */
  let sm = await open('brandon@x.com', BASE);
  await sm.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await sm.waitForSelector('#oStage', { timeout: 8000 }).catch(() => errs.push('① salesman sees the stage bar'));
  const st = await sm.$$eval('#oStage .stg', E => E.map(e => (e.classList.contains('cur') ? '*' : e.classList.contains('done') ? '✓' : '·') + e.querySelector('b').textContent.trim().split(' ')[0])); log('① stages:', st.join(' '));
  if (st.join(' ') !== '✓접수 ✓확인 *픽킹 ·검수 ·인보이스 ·포장 ·출고') errs.push('① received ✓ · confirmed ✓ · picking now · rest grey');
  if (!/창고에서 작업 중/.test(await sm.textContent('#page'))) errs.push('① hint: being picked');
  /* ② */
  await sm.click('#oReq'); await sm.waitForSelector('#rqGo');
  await sm.click('[data-rqk="disp"]'); await sm.fill('#rqT', 'C4 디스플레이 1개 같이'); await sm.click('#rqGo'); await sm.waitForTimeout(1500);
  const o2 = await sm.evaluate(() => { const M = window.__MOCK_STORE__, o = M.orders['O261014-AAAA']; return { issue: o.cfIssue, open: o.cfIssueOpen, q: Object.values(M.notifyq || {}).filter(n => n.kind === 'smReq').map(n => n.subject) }; }); log('② saved:', JSON.stringify(o2));
  if (o2.issue !== '🖼 디스플레이 추가 요청: C4 디스플레이 1개 같이' || o2.open !== true) errs.push('② request saved on the order');
  if (!o2.q.length || !/디스플레이 추가 요청/.test(o2.q[0])) errs.push('② office notified');
  const pv = (await sm.textContent('#page')).replace(/\s+/g, ' '); if (!/확인 중/.test(pv) || await sm.$('#oReq')) errs.push('② shows ⏳ reviewing and hides 📣');
  /* ③ */
  const of = await open('luke@theonefl.com', seedFrom(await dump(sm)), 900);
  await of.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await of.waitForSelector('#mIssueOk', { timeout: 8000 }).catch(() => errs.push('③ office sees the request with ✅ handled'));
  const ov = (await of.textContent('#page')).replace(/\s+/g, ' '); if (!/C4 디스플레이 1개 같이/.test(ov)) errs.push('③ office sees the request text');
  if (await of.$('#mIssueOk')) { await of.click('#mIssueOk'); await of.waitForTimeout(1200); }
  const sm2 = await open('brandon@x.com', seedFrom(await dump(of)));
  await sm2.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await sm2.waitForSelector('#oStage', { timeout: 8000 });
  const pv3 = (await sm2.textContent('#page')).replace(/\s+/g, ' '); log('③ salesman after office handled:', /사무실이 처리함/.test(pv3)); if (!/사무실이 처리함/.test(pv3) || !(await sm2.$('#oReq'))) errs.push('③ salesman sees ✅ handled and can ask again');
  /* ④ */
  const sm3 = await open('brandon@x.com', BASE + " Object.assign(s.orders[0], { st: 'done', pickDoneAt: '2026-11-12T11:00:00Z', doneAt: '2026-11-12T12:00:00Z', invs: ['A-000001'] });");
  await sm3.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await sm3.waitForSelector('#oStage', { timeout: 8000 });
  const cur = await sm3.$eval('#oStage .stg.cur b', e => e.textContent); log('④ current:', cur); if (!/인보이스/.test(cur) || !/인보이스 발행됨/.test(await sm3.textContent('#page'))) errs.push('④ invoiced stage and hint');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
