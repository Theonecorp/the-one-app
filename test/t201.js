/* v0.8.190 시험 — 🏪 Shipping UPS (카운터): 옛 앱 화면 그대로 — 가게 찾기 → 박스 (Enter 로 다음 칸 · 높이 Enter = 저장 · 크기는 다음 박스로 안 넘어감) → 요금 자동(shipq rate) → COD → 🖨 라벨(shipq wait · adhocId · cod) → 끝나면 adhoc shipped · 저절로 가게 찾기로
 *   ① 세일즈맨: 권한 없음 · 관리자: 홈 타일 · 가게 찾기 칸
 *   ② 계정 번호로 찾기 → 두 칼럼 (박스 | 받는 곳 · 요약) · 받는 곳 카드에 가게 · 계정 · 주소
 *   ③ 박스 입력: 무게 Enter → 길이 … 높이 Enter → 박스 저장 · 칸이 비워짐 · 커서는 무게
 *   ④ 요금: shipq 에 rate 요청 (박스 1개 · 받는 주소) → (UPS.gs 흉내) ratedone → 운임 표시 · 다른 서비스
 *   ⑤ COD: 켜고 금액 없이 인쇄 → 막힘 · 금액 넣고 인쇄 → shipq wait (adhocId · cod 25.50 · 박스 2개) · adhoc 문서
 *   ⑥ (UPS.gs 흉내) done → adhoc shipped · 트래킹 · 화면은 2초 뒤 저절로 가게 찾기 · 칸 안의 Enter 는 인쇄하지 않음 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8897', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 1280, height: 1000 } });
  const mk = async email => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; }, { email }); await pg.goto('http://127.0.0.1:8897/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  const shipq = (pg, f) => pg.evaluate(f => Object.entries(window.__MOCK_STORE__.shipq || {}).filter(([, q]) => new Function('q', 'return ' + f)(q)).map(([id, q]) => Object.assign({ _id: id }, q)), f);
  /* ① */
  let pg = await mk('brandon@x.com'); await pg.evaluate(() => { location.hash = '#/balcao'; }); await pg.waitForSelector('.sb', { timeout: 8000 });
  if (await pg.$('#sbBusca')) errs.push('① salesman must not get the counter'); await pg.close();
  pg = await mk('luke@theonefl.com');
  await pg.evaluate(() => { location.hash = '#/balcao'; }); await pg.waitForSelector('#sbBusca', { timeout: 8000 }).catch(() => errs.push('① staff sees the store search'));
  const font = await pg.evaluate(() => getComputedStyle(document.querySelector('.sb')).fontFamily); log('① font:', font); if (!/Inter/.test(font)) errs.push('① old font stack (Inter …)');
  /* ② */
  await pg.fill('#sbBusca', '3001'); await pg.waitForSelector('[data-sb-cli="3001"]', { timeout: 4000 }).catch(() => errs.push('② account search finds 3001'));
  await pg.press('#sbBusca', 'Enter'); await pg.waitForSelector('#sbP', { timeout: 5000 });
  const card = await pg.evaluate(() => document.querySelector('.sb .ups-cli-sel').textContent); log('② card:', card.replace(/\s+/g, ' ').slice(0, 160));
  if (!/BEAUTY EXCHANGE ORLANDO/.test(card) || !/#3001/.test(card) || !/77 ORANGE AVE/.test(card)) errs.push('② destination card: store, account, address');
  const cols = await pg.evaluate(() => { const a = document.querySelector('.sb .ups-card-cx').getBoundingClientRect(), b = document.querySelector('.sb .su-col3').getBoundingClientRect(); return { a: Math.round(a.left), b: Math.round(b.left), top: Math.abs(a.top - b.top) < 40 }; }); log('② columns:', JSON.stringify(cols));
  if (!(cols.b > cols.a + 200 && cols.top)) errs.push('② two columns side by side on desktop');
  const foc0 = await pg.evaluate(() => document.activeElement && document.activeElement.id); if (foc0 !== 'sbP') errs.push('② cursor starts on weight :: ' + foc0);
  /* ③ */
  await pg.keyboard.type('12.5'); await pg.keyboard.press('Enter'); await pg.keyboard.type('16'); await pg.keyboard.press('Enter'); await pg.keyboard.type('12'); await pg.keyboard.press('Enter'); await pg.keyboard.type('10'); await pg.keyboard.press('Enter');
  await pg.waitForSelector('.sb .su-feita', { timeout: 4000 }).catch(() => errs.push('③ Enter on height saves the box'));
  const after3 = await pg.evaluate(() => ({ n: document.querySelectorAll('.sb .su-feita').length, vals: ['sbP', 'sbC', 'sbL', 'sbA'].map(i => document.getElementById(i).value).join(''), foc: document.activeElement && document.activeElement.id, txt: document.querySelector('.sb .su-feita').textContent }));
  log('③', JSON.stringify(after3)); if (after3.n !== 1 || after3.vals !== '' || after3.foc !== 'sbP' || !/12\.5 lb/.test(after3.txt) || !/16 × 12 × 10/.test(after3.txt)) errs.push('③ one box saved · form cleared · cursor on weight');
  /* ④ */
  await pg.waitForFunction(() => Object.values(window.__MOCK_STORE__.shipq || {}).some(q => q.st === 'rate'), null, { timeout: 6000 }).catch(() => errs.push('④ a rate request goes to shipq'));
  const R = (await shipq(pg, "q.st === 'rate'"))[0] || {}; log('④ rate req:', JSON.stringify({ acct: R.acct, boxes: R.boxes, to: R.to && R.to.addr1 }));
  if (R.acct !== '3001' || (R.boxes || []).length !== 1 || R.boxes[0].w !== 12.5 || R.boxes[0].l !== 16 || !R.to || R.to.zip !== '32801') errs.push('④ rate request: account · 1 box 12.5 lb 16×12×10 · ship-to zip');
  await pg.evaluate(id => Object.assign(window.__MOCK_STORE__.shipq[id], { st: 'ratedone', env: 'live', rates: [{ svc: '03', name: 'UPS Ground', total: 21.6, list: 30, days: '2' }, { svc: '12', name: 'UPS 3 Day Select', total: 40.6, list: 50, days: '3' }] }), R._id);
  await pg.waitForFunction(() => /\$21\.60/.test((document.getElementById('sbPreco') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => errs.push('④ freight shows $21.60'));
  const other = await pg.evaluate(() => (document.getElementById('sbCotacao') || {}).textContent || ''); if (!/3 Day Select/.test(other) || !/\$40\.60/.test(other)) errs.push('④ other services listed');
  /* ⑤ COD */
  await pg.check('#sbCod'); await pg.fill('#sbP', '8'); await pg.keyboard.press('Enter'); await pg.keyboard.type('10'); await pg.keyboard.press('Enter'); await pg.keyboard.type('10'); await pg.keyboard.press('Enter'); await pg.keyboard.type('10'); await pg.keyboard.press('Enter');
  await pg.waitForFunction(() => document.querySelectorAll('.sb .su-feita').length === 2, null, { timeout: 4000 }).catch(() => errs.push('⑤ second box saved'));
  const codOnStill = await pg.evaluate(() => document.getElementById('sbCod').checked); if (!codOnStill) errs.push('⑤ COD stays on after saving a box');
  await pg.click('.sb [data-act="sb-finalizar"]'); await pg.waitForTimeout(300);
  if ((await shipq(pg, "q.st === 'wait'")).length) errs.push('⑤ COD without amount must not create a label');
  await pg.fill('#sbCodValor', '25.5'); await pg.click('.sb [data-act="sb-finalizar"]');
  await pg.waitForFunction(() => Object.values(window.__MOCK_STORE__.shipq || {}).some(q => q.st === 'wait'), null, { timeout: 6000 }).catch(() => errs.push('⑤ label request goes to shipq'));
  const W = (await shipq(pg, "q.st === 'wait'"))[0] || {}; log('⑤ label req:', JSON.stringify({ adhocId: W.adhocId, cod: W.cod, boxes: (W.boxes || []).map(b => b.w), store: W.store, svc: W.svc }));
  if (!W.adhocId || W.adhocId !== W._id || !W.cod || W.cod.valor !== '25.50' || (W.boxes || []).map(b => b.w).join(',') !== '12.5,8' || W.store !== 'BEAUTY EXCHANGE ORLANDO' || W.orderId !== '') errs.push('⑤ label request: adhocId · COD 25.50 · 2 boxes in typed order · no order');
  const A = await pg.evaluate(id => window.__MOCK_STORE__.adhoc[id], W._id); if (!A || A.acct !== '3001' || A.src !== 'balcao' || A.st !== 'open') errs.push('⑤ adhoc doc for the store');
  /* ⑥ */
  await pg.evaluate(id => Object.assign(window.__MOCK_STORE__.shipq[id], { st: 'done', track: '1Z999AA10123456784 1Z999AA10123456793', charge: 33.4, labels: [{ trk: '1Z999AA10123456784', img: '' }, { trk: '1Z999AA10123456793', img: '' }] }), W._id);
  await pg.waitForFunction(id => { const a = window.__MOCK_STORE__.adhoc[id]; return a && a.st === 'shipped'; }, W._id, { timeout: 15000 }).catch(() => errs.push('⑥ adhoc shipped when UPS finishes'));
  const A2 = await pg.evaluate(id => window.__MOCK_STORE__.adhoc[id], W._id); if (!A2 || A2.boxes !== 2 || A2.shipCost !== 33.4 || !/1Z999AA10123456784/.test(A2.track || '')) errs.push('⑥ adhoc: 2 boxes · cost · tracking');
  await pg.waitForSelector('#sbBusca', { timeout: 6000 }).catch(() => errs.push('⑥ screen returns to the store search by itself'));
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
