/* v0.8.217 시험 — 👥 담당자 일 5가지 · 역할별 대시보드 · 🔒 경영 자료는 오너만 (2026-11-13 관리자)
 *   "오피스 매니저 · 회계 · 창고 매니저 · 출고 · 인보이스 담당 · 디자인 — 예전 출고 · 인보이스 · 인보이스 · 창고 직원은 하나로"
 *   "대시보드는 창고 매니저 · 출고 · 인보이스 담당만 · 오피스는 접수 · 주문 · 인보이스 위주(매출은 괜찮음) · 디자이너는 아이템 흐름 · 사진 · 카탈로그"
 *   "경영 · 세일즈맨 페이 · 현금 흐름 · 미수금은 관리자 · 오너만 · 나도 관리자이면서 오너"
 *   ① 일 목록 = 5가지 · 예전 창고 직원(pick) · 인보이스 담당(invoice) 은 출고 · 인보이스 담당으로 보임
 *   ② 오피스 매니저 홈: 접수 · 주문 · 인보이스 숫자 · 매출 칸 있음 / 창고 매니저 · 출고 담당(예전 창고 직원): 창고 대시보드 · 매출 없음
 *   ③ 디자인 홈: 📥 아이템 흐름(최근 들어온 상품 · 사진 없는 것 먼저 · 카탈로그에 없는 코드) · 경영 · 매출 · 미수 없음
 *   ④ 경영 화면(경영 현황 · 정산 · 미수금 현황 · 수금 현황 · 오너 홈)은 주소로 열어도 담당자에게 🔒 · 관리자(오너 겸)는 열림 · 판매 리포트는 오피스도
 *   ⑥ 왼쪽 메뉴(v0.8.218): 경영 현황 · 세일즈맨 정산 · 수금 현황 · 미수금 현황은 관리자 · 오너 메뉴에만 — 오피스 · 회계 · 창고 · 출고 · 디자인 메뉴에는 없음 · 오너에게도 정산
 *   ⑦ 역할별 왼쪽 메뉴(v0.8.219): 오피스 · 창고 · 출고 = 영업 · 피킹 · 출고 · 인서트 · 조회 · 인보이스 · 회계 = 재무 · 거래처 · 인보이스 · 디자인 = 아이템 · 거래처 · 카탈로그 · 오너 = 거래처 · 조회 · 재무 · 재고 · 관리(관리자 화면 없음)
 *   ⑤ firestore.rules: 정산 · 공제 · 은행 · 공장 송금 · 1099 · 보너스 · 원가는 isOwner() · 미수금은 오피스 · 회계 · 자기 것 · 월 매출은 인보이스 일만 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8952', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const open = async (email, job) => { const pg = await (await br.newContext({ viewport: { width: 1300, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message));
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'U' }; window.__AFTER_SEED__ = s => { if (o.job) s.users.push({ id: o.email, email: o.email, name: 'U', role: 'manager', job: o.job, active: true });
      const d = new Date(Date.now() - 2 * 864e5).toISOString(); s.stockLog = (s.stockLog || []).concat([{ id: 'SL1', code: 'AHG100', delta: 12, kind: 'recv', at: d }, { id: 'SL2', code: 'NEWCODE9', delta: 5, kind: 'recv', at: d }]); }; }, { email, job });
    await pg.goto('http://127.0.0.1:8952/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(1800); return pg; };
  /* ① */
  const o = await open('office@x.com', 'office');
  const jobs = await o.evaluate(async () => { const M = await import('/src/main.js'); return M.JOBS.map(j => j[0]).join(','); }); log('① jobs:', jobs);
  if (jobs !== 'office,acct,whmgr,pickinv,catalog') errs.push('① five jobs');
  /* ② */
  const D = await o.evaluate(() => ({ h: location.hash, k: ['in', 'cf', 'rv', 'iv'].map(k => !!document.getElementById('wk-' + k)), sales: !!document.getElementById('wdSales') }));
  log('② office:', JSON.stringify(D)); if (D.h !== '#/shome' || D.k.includes(false) || !D.sales) errs.push('② office dashboard: intake · orders · invoices + sales');
  for (const job of ['whmgr', 'pick']) {
    const p = await open(job + '@x.com', job);
    const W = await p.evaluate(() => ({ h: location.hash, k: ['in', 'pick', 'pack', 'ship'].map(k => !!document.getElementById('wk-' + k)), sales: !!document.getElementById('wdSales'), hs: !!document.getElementById('hSales'), lbl: (document.querySelector('.dwho small') || {}).textContent || '' }));
    log('②', job, JSON.stringify(W));
    if (W.k.includes(false) || W.sales || W.hs) errs.push('② ' + job + ': warehouse dashboard without sales');
    if (job === 'pick' && !/출고 · 인보이스/.test(W.lbl)) errs.push('② old 창고 직원 shows as 출고 · 인보이스 담당: ' + W.lbl);
  }
  /* ③ */
  const c = await open('design@x.com', 'catalog'); await c.waitForSelector('#cfFlow .kpi', { timeout: 8000 }).catch(() => errs.push('③ item flow card'));
  const T = (await c.textContent('#page')).replace(/\s+/g, ' '); log('③ design:', T.slice(0, 200));
  if (!/아이템 흐름/.test(T) || !/AHG100/.test(T) || !/NEWCODE9/.test(T) || !/등록 필요/.test(T)) errs.push('③ item flow lists received codes · new code needs registering');
  if (/매출|미수|정산|Sales \(invoiced\)/.test(T)) errs.push('③ no business info on the design home');
  /* ④ */
  for (const r of ['mg', 'pay', 'bossar', 'now', 'own']) { await o.evaluate(r => { location.hash = '#/' + r; }, r); await o.waitForTimeout(700); if (!/🔒/.test(await o.textContent('#page'))) errs.push('④ office locked out of #/' + r); }
  await o.evaluate(() => { location.hash = '#/reports'; }); await o.waitForTimeout(800); if (/🔒/.test(await o.textContent('#page'))) errs.push('④ office can open 판매 리포트');
  const a = await open('luke@theonefl.com', '');
  await a.evaluate(() => { location.hash = '#/pay'; }); await a.waitForTimeout(1200); if (/🔒/.test(await a.textContent('#page'))) errs.push('④ admin (owner) opens 정산');
  /* ⑥ */
  const TOPR = ['mg', 'pay', 'now', 'bossar', 'own'];
  for (const [pg, who] of [[o, 'office'], [c, 'design']]) { const d = await pg.$$eval('#drawer [data-dgo]', B => B.map(b => b.dataset.dgo)).catch(() => []); if (d.some(x => TOPR.includes(x))) errs.push('⑥ ' + who + ' menu has no business screens: ' + d.join(' ')); }
  const ow = await (async () => { const pg = await (await br.newContext({ viewport: { width: 1300, height: 900 } })).newPage(); await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'own@x.com', name: 'O' }; window.__AFTER_SEED__ = s => { s.users.push({ id: 'own@x.com', email: 'own@x.com', name: 'O', role: 'owner', active: true }); }; }); await pg.goto('http://127.0.0.1:8952/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(1500); return pg; })();
  const od = await ow.$$eval('#drawer [data-dgo]', B => B.map(b => b.dataset.dgo)).catch(() => []); log('⑥ owner menu:', od.join(' '));
  if (!od.includes('mg') || !od.includes('pay')) errs.push('⑥ owner menu has 경영 현황 · 세일즈맨 정산');
  /* ⑦ */
  const dg = async pg => pg.$$eval('#drawer .dgrp', D => D.map(d => d.dataset.dg)).catch(() => []), dgo = async pg => pg.$$eval('#drawer [data-dgo]', B => B.map(b => b.dataset.dgo)).catch(() => []);
  const ac = await open('acc@x.com', 'acct');
  const G = { office: await dg(o), acct: await dg(ac), design: await dg(c), owner: await dg(ow) }; log('⑦ groups:', JSON.stringify(G));
  if (G.office.join() !== 'ov,sales,sep,ship,ins,look,fin') errs.push('⑦ office groups: main · sales · picking · shipping · inserts · lookup · invoices');
  if ((await dgo(o)).some(x => ['verify', 'estoque', 'admin', 'mg'].includes(x))) errs.push('⑦ office menu has no finance · inventory · admin');
  if (G.acct.some(g => !['ov', 'sales', 'fin'].includes(g)) || !(await dgo(ac)).includes('invs') || !(await dgo(ac)).includes('stores')) errs.push('⑦ accounting: finance · customers · invoices only');
  const cd = await dgo(c); if (cd.some(x => !['catmg', 'items', 'photos', 'labels', 'stores', 'cat', 'settings'].includes(x))) errs.push('⑦ design: items · customers · catalog only: ' + cd.join(' '));
  const od2 = await dgo(ow); if (od2.includes('admin') || !od2.includes('stores') || !od2.includes('estoque') || !od2.includes('reports')) errs.push('⑦ owner: customers · lookup · finance · inventory · management, no admin: ' + od2.join(' '));
  /* ⑤ */
  const R = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
  for (const col of ['bank', 'bankM', 'payees', 'pay1099', 'factoryPayments', 'bonusAcc', 'prodCusto', 'sales']) if (!new RegExp('match /' + col + '/\\{id\\} \\{ allow read, write: if isOwner\\(\\); \\}').test(R)) errs.push('⑤ ' + col + ' is owner-only');
  if (!/match \/settlements\/\{id\} \{\s*allow read: if isOwner\(\) \|\|/.test(R) || !/match \/deductions\/\{id\} \{ allow read: if isOwner\(\) \|\|/.test(R)) errs.push('⑤ settlements · deductions owner (+ own salesman)');
  if (!/match \/ar\/\{sm\} \{\s*allow read: if money\(\) \|\|/.test(R)) errs.push('⑤ AR: office · accounting · own only');
  if (!/match \/salesM\/\{id\} \{ allow read: if invJob\(\);/.test(R)) errs.push('⑤ monthly sales: invoicing jobs only');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
