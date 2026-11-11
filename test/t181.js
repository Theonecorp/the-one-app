/* v0.8.182 시험 — 🚢 입고 예정: 📦 박스별 확인 · 문제 표시 · 인보이스에 없는 아이템 · 공장 단가는 관리자만 (2026-11-11 관리자)
 *   ① 오피스 매니저가 등록 — 확인 화면에 단가 · 통화가 안 보임 · 단가는 inboundCost 에만 (inbound 에는 없음)
 *   ② 창고 매니저 — 박스 번호가 있으면 📦 박스별이 먼저 · 박스마다 확인 전 / 확인 · 맞음 / 문제 있음
 *      · 1# "이 박스 모두 맞음" · 2# 한 줄 수량을 줄이고 ⚠️ 불량 · 파손 + 메모 · 인보이스에 없는 아이템 넣기
 *      · 📋 아이템별 합계 = 박스 합 · 입고 확정 → 재고(박스 합 · 추가 아이템) · 차이 · 문제 기록
 *   ③ 관리자는 상세에 💰 공장 금액 · 줄마다 단가가 보임 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const dir = path.resolve(__dirname, 'out'); fs.mkdirSync(dir, { recursive: true });
  const csv = path.join(dir, 't181-packing.csv');
  fs.writeFileSync(csv, ['SX  ONE#9装箱单 2026.11.1', 'NO,箱数,ITEM#,PRICE,QTY,TOTAL', '1,1#,AHG100,7,50,350', '2,,AHG105,7,30,210', '3,2#,AHG105,7,20,140', '4,,AHG110,7,10,70'].join('\n') + '\n');
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8850', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const open = async (email, job, store) => { const pg = await (await br.newContext({ viewport: { width: 900, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = s => { if (o.job) { let u = s.users.find(x => x.id === o.email); if (!u) { u = { id: o.email, email: o.email, name: 'X', active: true }; s.users.push(u); } u.role = 'manager'; u.job = o.job; } if (o.store) { const D = JSON.parse(o.store); s.inbound = Object.values(D.inbound); s.inboundCost = Object.values(D.inboundCost); } }; }, { email, job, store });
    await pg.goto('http://127.0.0.1:8850/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
    await pg.evaluate(() => { location.hash = '#/stock/inb'; }); await pg.waitForSelector('#skBody .card', { timeout: 8000 }); await pg.waitForTimeout(300); return pg; };
  /* ① 오피스 등록 */
  const of = await open('acct@theonefl.com', 'office');
  await of.setInputFiles('#ibFile', csv); await of.waitForSelector('#ibGo', { timeout: 8000 });
  const pv = (await of.textContent('#mbox')).replace(/\s+/g, ' '); log('① office preview:', pv.slice(0, 160));
  if (/\$|¥|단가 통화/.test(pv)) errs.push('① office sees no prices or currency');
  await of.click('#ibGo'); await of.waitForTimeout(1200);
  const st = await of.evaluate(() => ({ inbound: window.__MOCK_STORE__.inbound, inboundCost: window.__MOCK_STORE__.inboundCost }));
  const ib = Object.values(st.inbound || {})[0], ic = Object.values(st.inboundCost || {})[0];
  log('① saved:', JSON.stringify({ no: ib && ib.no, f: ib && ib.factory, boxes: ib && ib.boxes, l: ib && ib.lines.map(l => l.c + ':' + l.q + ' ' + JSON.stringify(l.bx)).join(' | '), cost: ic && ic.amt }));
  if (!ib || ib.boxes !== 2 || ib.lines.some(l => 'p' in l) || !ic || ic.amt !== 770 || ic.p.AHG105 !== 7) errs.push('① inbound has boxes but no prices; inboundCost has amt 770 and unit prices');
  const a105 = ib && ib.lines.find(l => l.c === 'AHG105'); if (!a105 || a105.q !== 50 || JSON.stringify(a105.bx.map(b => b.b + ':' + b.q)) !== '["1#:30","2#:20"]') errs.push('① AHG105 is one line of 50 split 1#:30 · 2#:20');
  await of.context().close();
  const store = JSON.stringify(st);
  /* ② 창고 — 박스별 */
  const wh = await open('wh@x.com', 'whmgr', store);
  await wh.click('[data-ib]'); await wh.waitForSelector('[data-box]', { timeout: 8000 });
  const bxs = () => wh.$$eval('[data-box]', E => E.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  log('② boxes:', (await bxs()).join(' | ')); if ((await wh.$eval('#mbox', e => e.textContent)).includes('$')) errs.push('② warehouse sees no prices');
  await wh.click('[data-box="1#"]'); await wh.waitForSelector('#bxAll'); const in1 = await wh.$$eval('[data-q]', E => E.length); await wh.click('#bxAll'); await wh.click('#bxBack'); await wh.waitForTimeout(200);
  let B = await bxs(); log('② after 1#:', B.join(' | ')); if (in1 !== 2 || !/1#.*확인 · 맞음/.test(B[0]) || !/2#.*확인 전/.test(B[1])) errs.push('② box 1# shows its 2 items; "all correct" marks it checked, 2# still to check');
  await wh.click('[data-box="2#"]'); await wh.waitForSelector('[data-q]');
  const i105 = await wh.evaluate(() => Array.from(document.querySelectorAll('[data-q]')).findIndex(e => e.closest('tr').textContent.includes('AHG105')));
  const q105 = await wh.$$eval('[data-q]', (E, i) => E[i].dataset.q, i105);
  await wh.fill('[data-q="' + q105 + '"]', '15'); await wh.dispatchEvent('[data-q="' + q105 + '"]', 'change'); await wh.waitForTimeout(150);
  await wh.click('[data-isb="' + q105 + '"]'); await wh.click('[data-iss="damaged"]'); await wh.fill('#issNote', '5개 파손'); await wh.click('#issOk'); await wh.waitForTimeout(150);
  const i110 = await wh.evaluate(() => Array.from(document.querySelectorAll('[data-q]')).find(e => e.closest('tr').textContent.includes('AHG110')).dataset.q);
  await wh.fill('[data-q="' + i110 + '"]', '10'); await wh.dispatchEvent('[data-q="' + i110 + '"]', 'change'); await wh.waitForTimeout(150);
  await wh.click('#bxAdd'); await wh.fill('#adC', 'ahg101'); await wh.fill('#adQ', '5'); await wh.click('#adGo'); await wh.waitForTimeout(150);
  const t2 = (await wh.textContent('#mbox')).replace(/\s+/g, ' '); if (!/불량 · 파손 · 5개 파손/.test(t2) || !/AHG101 인보이스에 없음/.test(t2)) errs.push('② issue (damaged + note) and the extra item show in box 2#');
  await wh.click('#bxBack'); await wh.waitForTimeout(150); B = await bxs(); log('② after 2#:', B.join(' | ')); if (!/2#.*문제 있음/.test(B[1]) || !/1#.*확인 · 맞음/.test(B[0])) errs.push('② box 2# shows "issue", box 1# stays checked');
  await wh.click('[data-ibv="item"]'); await wh.waitForTimeout(150);
  const tot105 = await wh.evaluate(() => { const r = Array.from(document.querySelectorAll('#mbox tr')).find(t => t.textContent.includes('AHG105')); return r && r.querySelector('[data-q]').value; }); log('② item view AHG105:', tot105); if (tot105 !== '45') errs.push('② by-item total for AHG105 = 30 + 15 = 45');
  const before = await wh.evaluate(() => { const S = window.__MOCK_STORE__.stock || {}; return ['AHG100', 'AHG105', 'AHG110', 'AHG101'].map(c => (S[c] || {}).qty || 0); });
  await wh.click('#ibOk'); await wh.waitForSelector('#cfOk'); await wh.click('#cfOk'); await wh.waitForTimeout(1800);
  const after = await wh.evaluate(() => { const S = window.__MOCK_STORE__.stock || {}, I = Object.values(window.__MOCK_STORE__.inbound)[0]; return { q: ['AHG100', 'AHG105', 'AHG110', 'AHG101'].map(c => (S[c] || {}).qty || 0), st: I.st, diff: I.diff }; });
  log('② after confirm:', JSON.stringify({ before, after }));
  if (after.q.map((v, i) => v - before[i]).join() !== '50,45,10,5' || after.st !== 'done') errs.push('② stock +50 · +45 · +10 · +5 (extra item) and done');
  if (!after.diff || after.diff.length !== 2 || !after.diff.some(d => d.c === 'AHG105' && /불량/.test(d.issue)) || !after.diff.some(d => d.c === 'AHG101' && d.extra)) errs.push('② differences: AHG105 (damaged) and AHG101 (not on invoice)');
  await wh.context().close();
  /* ③ 관리자 */
  const ad = await open('luke@theonefl.com', '', store);
  await ad.click('[data-ib]'); await ad.waitForSelector('#mbox .sumbox', { timeout: 8000 });
  let at = (await ad.textContent('#mbox')).replace(/\s+/g, ' '); log('③ admin:', at.slice(0, 160)); if (!/공장 금액 \(관리자만\): ¥770\.00 \(통화 추정\)/.test(at)) errs.push('③ admin sees the factory amount (currency guessed CNY because unit 7 > sell price)');
  await ad.click('[data-ccur="USD"]'); await ad.waitForTimeout(400); await ad.click('[data-ibv="item"]'); await ad.waitForTimeout(200);
  at = (await ad.textContent('#mbox')).replace(/\s+/g, ' '); const cc = await ad.evaluate(() => Object.values(window.__MOCK_STORE__.inboundCost)[0]);
  log('③ after $:', at.slice(0, 120), JSON.stringify({ cur: cc.cur, guess: cc.curGuess })); if (!/\$770\.00/.test(at) || !/\$7\.00/.test(at) || cc.cur !== 'USD' || cc.curGuess) errs.push('③ admin fixes the currency to USD — amount and unit prices in $');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
