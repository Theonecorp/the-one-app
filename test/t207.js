/* v0.8.193 시험 — 📦 Shipping History: 옛 WMS 의 출고 기록 화면 — 카드 6개(누르면 필터) · 기간 칩 · 검색 · 목록 · 오른쪽 상세(탭 5개) · 박스마다 다시 인쇄 · 취소(VOID) · 고치기
 *   ① 관리자: #/shiphist → 카드 6개 · 나간 박스 3 (VOID 빼고) · 운임 합계
 *   ② "배달된 박스" 카드 → 목록 1줄 · 다시 누르면 전부 · 검색(운송장)으로 찾기
 *   ③ 상세: 탭 5개 · 라벨 탭에서 박스 2 만 다시 인쇄 → 라벨 1장 · 기록(log)에 reimp box 2
 *   ④ 취소(VOID): 확인 → shipq st void → (UPS.gs 흉내) voided → 박스 전부 voided · adhoc void · 목록 상태 VOID · 기록에 void
 *   ⑤ 주문 출고(orderId 있음)는 취소 버튼 없음
 *   ⑥ 세일즈맨: 자기 가게 출고만 · 운임 카드 없음 · 다시 인쇄 · 취소 없음 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
const GIF = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8907', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const SEED = `const d = new Date(), t = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    s.shipments = [
      { id: '1ZAAA0001', trk: '1ZAAA0001', adhocId: 'XBAL1', no: 'XBAL1', acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', sm: 'ALEX', box: 1, boxes: 2, w: 12.5, dims: '16×12×10', svc: '03', svcName: 'UPS Ground', shipDate: t, cost: 33.4, cod: 25.5, status: 'Label created', at: t + 'T15:00:00Z', by: 'luke@theonefl.com' },
      { id: '1ZAAA0002', trk: '1ZAAA0002', adhocId: 'XBAL1', no: 'XBAL1', acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', sm: 'ALEX', box: 2, boxes: 2, w: 10, dims: '16×12×10', svc: '03', svcName: 'UPS Ground', shipDate: t, cost: 0, status: 'Label created', at: t + 'T15:00:00Z' },
      { id: '1ZBBB0001', trk: '1ZBBB0001', orderId: 'O261014-AAAA', no: 'O261014-AAAA', acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', box: 1, boxes: 1, w: 5, dims: '10×10×10', svc: '03', svcName: 'UPS Ground', shipDate: t, cost: 12, status: 'Delivered', delivered: true, deliveredAt: t + ' 13:00', at: t + 'T12:00:00Z' },
      { id: '1ZCCC0001', trk: '1ZCCC0001', adhocId: 'XOLD', no: 'XOLD', acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', sm: 'ALEX', box: 1, boxes: 1, w: 3, svc: '03', shipDate: t, cost: 9, status: 'Voided', voided: true, at: t + 'T10:00:00Z' }];
    s.shipq = [{ id: 'XBAL1', st: 'done', shipId: '1ZAAA0001', track: '1ZAAA0001 1ZAAA0002', labels: [{ trk: '1ZAAA0001', img: '${GIF}' }, { trk: '1ZAAA0002', img: '${GIF}' }] }];
    s.adhoc = [{ id: 'XBAL1', acct: '3001', st: 'shipped', src: 'balcao' }];`;
  const mk = async email => { const pg = await (await br.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed: SEED });
    await pg.goto('http://127.0.0.1:8907/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  const kpis = pg => pg.$$eval('.sb .sh-kpis .fin-kpi', L => L.map(k => (k.querySelector('.lbl') || {}).textContent + '=' + (k.querySelector('b') || {}).textContent));
  const rows = pg => pg.$$eval('.sb .sh-tbl tbody tr', L => L.map(r => r.querySelector('.sh-num').textContent));
  try {
    /* ① */
    const pg = await mk('luke@theonefl.com');
    await pg.evaluate(() => { location.hash = '#/shiphist'; }); await pg.waitForSelector('.sb .sh-tbl', { timeout: 8000 }).catch(() => errs.push('① list shows'));
    const K = await kpis(pg); log('① cards:', K.join(' | '));
    if (K.length !== 6) errs.push('① six cards');
    if (!/=3$/.test(K[0])) errs.push('① boxes shipped = 3 (void not counted)');
    if (!K[5] || !/45\.40/.test(K[5])) errs.push('① freight total 45.40 (void not counted)');
    log('① rows:', (await rows(pg)).join(','));
    /* ② */
    await pg.click('.sb .sh-kpi-bt[data-st="entregue"]'); await pg.waitForTimeout(300);
    let R = await rows(pg); log('② delivered rows:', R.join(',')); if (R.length !== 1 || R[0] !== 'O261014-AAAA') errs.push('② delivered card filters to 1 row');
    await pg.click('.sb .sh-kpi-bt[data-st="entregue"]'); await pg.waitForTimeout(300);
    if ((await rows(pg)).length !== 3) errs.push('② second click shows all');
    await pg.fill('#shBusca', '1ZAAA0002'); await pg.waitForTimeout(300); R = await rows(pg); if (R.length !== 1 || R[0] !== 'XBAL1') errs.push('② search by tracking of box 2');
    await pg.fill('#shBusca', ''); await pg.dispatchEvent('#shBusca', 'input'); await pg.waitForTimeout(200);
    /* ③ */
    await pg.click('.sb .sh-l[data-envio^="XBAL1"]'); await pg.waitForSelector('.sb .sh-det .sh-abas', { timeout: 4000 }).catch(() => errs.push('③ detail opens'));
    const abas = await pg.$$eval('.sb .sh-aba', L => L.length); if (abas !== 5) errs.push('③ five tabs');
    if (!(await pg.textContent('.sb .sh-det')).includes('25.5')) errs.push('③ COD amount shown');
    await pg.click('.sb [data-aba="etiqueta"]'); await pg.waitForTimeout(300);
    const btns = await pg.$$eval('.sb [data-act="sh-reimp"]', L => L.map(b => b.dataset.box)); log('③ reprint buttons:', btns.join(','));
    if (btns.join() !== '1,2,*') errs.push('③ reprint per box + all');
    await pg.click('.sb [data-act="sh-reimp"][data-box="2"]'); await pg.waitForTimeout(1200);
    const lbls = await pg.$$eval('#prtbody .sblbl', L => L.length); log('③ labels printed:', lbls); if (lbls !== 1) errs.push('③ only box 2 printed');
    const lg = await pg.evaluate(() => window.__MOCK_STORE__.shipments['1ZAAA0001'].log || []); log('③ log:', JSON.stringify(lg));
    if (!lg.some(l => l.t === 'reimp' && l.box === 2)) errs.push('③ reprint logged with box 2');
    await pg.evaluate(() => { const p = document.getElementById('prt'); p && p.classList.remove('on'); });
    /* ④ */
    await pg.click('.sb [data-aba="geral"]'); await pg.waitForTimeout(200);
    await pg.click('.sb [data-act="sh-cancelar"]'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk');
    await pg.waitForFunction(() => window.__MOCK_STORE__.shipq.XBAL1.st === 'void', null, { timeout: 5000 }).catch(() => errs.push('④ void request to shipq'));
    await pg.evaluate(() => { window.__MOCK_STORE__.shipq.XBAL1.st = 'voided'; });
    await pg.waitForFunction(() => window.__MOCK_STORE__.shipments['1ZAAA0002'].voided === true, null, { timeout: 9000 }).catch(() => errs.push('④ boxes marked voided'));
    const ad = await pg.evaluate(() => window.__MOCK_STORE__.adhoc.XBAL1.st); if (ad !== 'void') errs.push('④ adhoc void');
    await pg.waitForTimeout(500);
    const st = await pg.$eval('.sb .sh-l[data-envio^="XBAL1"] .sh-st', e => e.textContent).catch(() => ''); log('④ status:', st); if (st !== 'VOID') errs.push('④ row shows VOID');
    const lg2 = await pg.evaluate(() => window.__MOCK_STORE__.shipments['1ZAAA0001'].log || []); if (!lg2.some(l => l.t === 'void')) errs.push('④ void logged');
    /* ⑤ */
    await pg.click('.sb .sh-l[data-envio^="O261014-AAAA"]'); await pg.waitForTimeout(300);
    if (await pg.$('.sb [data-act="sh-cancelar"]')) errs.push('⑤ no void for order shipments');
    /* ⑥ */
    const sp = await mk('brandon@x.com'); await sp.evaluate(() => { location.hash = '#/shiphist'; }); await sp.waitForSelector('.sb .sh-tbl', { timeout: 8000 }).catch(() => errs.push('⑥ salesman list'));
    const RS = await rows(sp), KS = await kpis(sp); log('⑥ salesman:', RS.join(','), '|', KS.length);
    if (RS.join() !== 'O261014-AAAA') errs.push('⑥ salesman sees only own store');
    if (KS.length !== 5) errs.push('⑥ no freight cost card');
    await sp.click('.sb .sh-l[data-envio^="O261014-AAAA"]'); await sp.waitForTimeout(300);
    if (await sp.$('.sb [data-act="sh-cancelar"], .sb [data-act="sh-ir-etq"]')) errs.push('⑥ salesman has no reprint / void');
  } catch (e) { errs.push('THROW ' + e.message); }
  await br.close(); srv.kill();
  if (errs.length) { console.log('❌', errs.join('\n❌ ')); process.exit(1); } else console.log('✅ t207 Shipping History');
})();
