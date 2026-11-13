/* v0.8.214 시험 — 📦 Shipping History 옛 앱과 같게: 출고 × 반품 탭 · UPS 반품 라벨(shipq ret · 메일 mail) · 출고 등록(다른 운송사) + 배송 완료 · 운송사 필터 · UPS 청구서 CSV 가져오기 · 영업 담당 변경 · SHP 번호 · 전체 기간 + 개씩 · 세일즈맨 보기만
 *   ① 반품 탭: 반품만 · 카드 없음 · "보내는 곳" 칸 · 출고 탭에는 반품 없음
 *   ② UPS 반품 만들기: 박스 2 운송장으로 찾기 → 가게 · 박스 무게 채움 → shipq st 'ret' (UPS.gs 흉내 retdone + shipments ret) → 반품 탭 · 메일 창 → 틀린 주소 거절 → shipq st 'mail' (흉내 maildone) → 기록에 email
 *   ③ 출고 등록: FedEx · 박스 2 → shipments 2개(carrier FEDEX · manual · SHP) · 배송 완료로 표시 → delivered
 *   ④ 운송사 필터: FedEx 만 · 운송사 칸 FedEx
 *   ⑤ UPS 청구서 CSV: 박스마다 billNet · 이력에 없는 출고 1건 보고 · 다시 가져와도 같은 금액 · 비용 탭에 청구 금액 · 견적과 차이 · 운송비 카드
 *   ⑥ 영업 담당 변경: 박스 전부 · 기록
 *   ⑦ SHP-YYYY-NNNNNN · 검색으로 찾기 · counters/shp
 *   ⑧ 전체 기간 · 개씩(10 → 25)
 *   ⑨ 권한: 창고 직원(pick)은 청구서 가져오기 없음 · 창고 매니저(whmgr)는 있음 · 세일즈맨은 보기만(버튼 · 변경 없음)
 *   ⑩ 휴대폰 430px: 가로 스크롤 없음 · 필터는 버튼 뒤로 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
const GIF = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const PORT = '8957';
/* UPS 청구서 CSV: Full 한 줄 (칸 번호는 옛 rpc_fatura_ups_importar 와 같음) */
function linha(o) { const r = new Array(92).fill(''); r[0] = '2.1'; r[5] = o.inv; r[11] = o.d || '2026-11-01'; r[13] = o.lead; r[20] = o.trk || ''; r[26] = o.peso || ''; r[28] = o.cob || ''; r[34] = o.tipo || 'SHP'; r[43] = o.cls || 'FRT'; r[45] = 'Ground Commercial'; r[51] = o.inc || '0'; r[52] = String(o.net); r[74] = 'JOHN'; r[75] = o.emp || 'BEAUTY EXCHANGE ORLANDO'; r[78] = 'ORLANDO'; r[79] = 'FL'; r[80] = '32801'; return r.map(x => /,/.test(x) ? '"' + x + '"' : x).join(','); }
const CSV_A = [linha({ inv: '0000A1', lead: '1ZAAA0001', trk: '1ZAAA0001', net: 20, inc: 5, peso: 13, cob: 15 }), linha({ inv: '0000A1', lead: '1ZAAA0001', trk: '1ZAAA0001', net: 3, cls: 'FSC' }), linha({ inv: '0000A1', lead: '1ZAAA0001', trk: '1ZAAA0002', net: 10, peso: 10, cob: 11 }),
  linha({ inv: '0000A1', lead: '1ZZZ9999', trk: '1ZZZ9999', net: 7, emp: 'NOT IN APP, STORE' })].join('\r\n') + '\r\n';
const CSV_B = [linha({ inv: '0000B2', lead: '1ZAAA0001', trk: '1ZAAA0002', net: 2.5, tipo: 'ADJ', cls: 'ACC' })].join('\n');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', PORT, '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const SEED = `const d = new Date(), t = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const dd = n => { const x = new Date(); x.setDate(x.getDate() - n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    s.users.push({ id: 'wm@x.com', email: 'wm@x.com', name: 'WM', role: 'manager', job: 'whmgr', active: true }, { id: 'pk@x.com', email: 'pk@x.com', name: 'PK', role: 'manager', job: 'pick', active: true });
    s.accounts.find(a => a.acct === '3001').email = 'store@beauty.com';
    s.shipments = [
      { id: '1ZAAA0001', trk: '1ZAAA0001', adhocId: 'XBAL1', no: 'XBAL1', acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', sm: 'ALEX', box: 1, boxes: 2, w: 12.5, dims: '16×12×10', svc: '03', svcName: 'UPS Ground', shipDate: t, cost: 33.4, list: 51.2, status: 'Label created', at: t + 'T15:00:00Z', by: 'luke@theonefl.com' },
      { id: '1ZAAA0002', trk: '1ZAAA0002', adhocId: 'XBAL1', no: 'XBAL1', acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', sm: 'ALEX', box: 2, boxes: 2, w: 10, dims: '14×10×8', svc: '03', svcName: 'UPS Ground', shipDate: t, cost: 0, status: 'Label created', at: t + 'T15:00:00Z' },
      { id: '1ZBBB0001', trk: '1ZBBB0001', orderId: 'O261014-AAAA', no: 'O261014-AAAA', acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', box: 1, boxes: 1, w: 5, dims: '10×10×10', svc: '03', svcName: 'UPS Ground', shipDate: t, cost: 12, status: 'Delivered', delivered: true, deliveredAt: t + ' 13:00', at: t + 'T12:00:00Z' },
      { id: '1ZRET0001', trk: '1ZRET0001', retJob: 'RET-OLD', ret: true, retDe: 'XOLDX', retDeShp: 'SHP-2026-000077', retDesc: 'Jewelry', shp: 'SHP-2026-000078', acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', box: 1, boxes: 1, w: 4, dims: '8×8×8', svc: '03', svcName: 'UPS Ground', shipDate: t, cost: 9.9, status: 'Label created', at: t + 'T09:00:00Z', carrier: 'UPS' },
      { id: '1ZOLD2024', trk: '1ZOLD2024', adhocId: 'XANTIGO', no: 'XANTIGO', acct: '1271', store: 'BEAUTY 4U', sm: 'BRANDON', box: 1, boxes: 1, w: 3, svc: '03', shipDate: '2024-01-05', cost: 8, status: 'Delivered', delivered: true, deliveredAt: '2024-01-08', at: '2024-01-05T10:00:00Z' }];
    for (let i = 0; i < 11; i++) s.shipments.push({ id: '1ZPAG' + String(i).padStart(4, '0'), trk: '1ZPAG' + String(i).padStart(4, '0'), adhocId: 'XPAG' + i, no: 'XPAG' + i, acct: '2427', store: 'J C NOVELTIES B/S', sm: 'BRANDON', box: 1, boxes: 1, w: 2, svc: '03', shipDate: dd(3), cost: 7, status: 'Label created', at: dd(3) + 'T08:00:00Z' });
    s.shipq = [{ id: 'XBAL1', st: 'done', shipId: '1ZAAA0001', track: '1ZAAA0001 1ZAAA0002', labels: [{ trk: '1ZAAA0001', img: '${GIF}' }, { trk: '1ZAAA0002', img: '${GIF}' }] }, { id: 'RET-OLD', kind: 'ret', st: 'retdone', shipId: '1ZRET0001', track: '1ZRET0001', labels: [{ trk: '1ZRET0001', img: '${GIF}' }] }];
    s.adhoc = [{ id: 'XBAL1', acct: '3001', st: 'shipped', src: 'balcao' }];`;
  const mk = async (email, w, h) => { const pg = await (await br.newContext({ viewport: { width: w || 1440, height: h || 1000 } })).newPage(); pg.on('pageerror', e => errs.push('pageerror ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed: SEED });
    await pg.goto('http://127.0.0.1:' + PORT + '/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
    await pg.evaluate(() => { location.hash = '#/shiphist'; }); await pg.waitForSelector('.sb .sh-tbl, .sb .sh-lista .graf-vazio', { timeout: 8000 }); await pg.waitForTimeout(400); return pg; };
  const rows = pg => pg.$$eval('.sb .sh-tbl tbody tr', L => L.map(r => r.dataset.envio.split('|')[0]));
  const st = pg => pg.evaluate(() => window.__MOCK_STORE__);
  try {
    const pg = await mk('luke@theonefl.com');
    /* ⑦ SHP */
    await pg.waitForFunction(() => document.querySelectorAll('.sb .sh-tbl .sh-num').length && [...document.querySelectorAll('.sb .sh-tbl .sh-num')].every(b => /^SHP-/.test(b.textContent)), null, { timeout: 6000 }).catch(() => errs.push('⑦ visible rows get SHP numbers'));
    const nums = await pg.$$eval('.sb .sh-tbl .sh-num', L => L.map(b => b.textContent)); log('⑦ numbers:', nums.slice(0, 4).join(','));
    if (!nums.every(n => /^SHP-\d{4}-\d{6}$/.test(n))) errs.push('⑦ SHP-YYYY-NNNNNN format');
    const shpX = await pg.evaluate(() => window.__MOCK_STORE__.shipments['1ZAAA0001'].shp), shpX2 = await pg.evaluate(() => window.__MOCK_STORE__.shipments['1ZAAA0002'].shp);
    if (!shpX || shpX !== shpX2) errs.push('⑦ SHP written on every box of the shipment');
    const cnt = await pg.evaluate(() => (window.__MOCK_STORE__.counters.shp || {}).n); log('⑦ counters/shp.n =', cnt); if (!(cnt > 1)) errs.push('⑦ counters/shp used');
    await pg.fill('#shBusca', shpX); await pg.waitForTimeout(250);
    if ((await rows(pg)).join() !== 'XBAL1') errs.push('⑦ search by SHP');
    await pg.fill('#shBusca', ''); await pg.dispatchEvent('#shBusca', 'input'); await pg.waitForTimeout(150);
    /* ⑧ 개씩 · 전체 */
    const pagTxt = await pg.textContent('.sb .sh-pag'); log('⑧ pag:', pagTxt.replace(/\s+/g, ' ').slice(0, 60));
    if ((await rows(pg)).length !== 10 || !/1 \/ 2/.test(pagTxt)) errs.push('⑧ 10 per page by default (old) · 2 pages');
    await pg.selectOption('#shPor', '25'); await pg.waitForTimeout(200);
    if ((await rows(pg)).length !== 13 || !/1 \/ 1/.test(await pg.textContent('.sb .sh-pag'))) errs.push('⑧ 25 per page shows all 13 shipments');
    if ((await rows(pg)).includes('XANTIGO')) errs.push('⑧ 2024 shipment not in 30 days');
    await pg.click('.sb [data-act="sh-per"][data-p="tudo"]'); await pg.waitForTimeout(500);
    if (!(await rows(pg)).includes('XANTIGO')) errs.push('⑧ "Tudo/All" shows the 2024 shipment');
    if (!/전체|All|Tudo/.test(await pg.textContent('.sb .sh-per-txt'))) errs.push('⑧ period text says All');
    await pg.click('.sb [data-act="sh-per"][data-p="30"]'); await pg.waitForTimeout(400);
    /* ① 반품 탭 */
    if ((await rows(pg)).includes('RET-OLD') || (await pg.$$eval('.sb .sh-tbl tbody tr', L => L.filter(r => r.dataset.envio.indexOf('1ZRET0001') >= 0).length))) errs.push('① return not listed in shipments tab');
    await pg.click('.sb [data-act="sh-tipo"][data-tipo="retornos"]'); await pg.waitForTimeout(400);
    const RR = await pg.$$eval('.sb .sh-tbl tbody tr .sh-num', L => L.map(b => b.textContent)); log('① returns:', RR.join(','));
    if (RR.join() !== 'SHP-2026-000078') errs.push('① returns tab lists only the return');
    if (await pg.$('.sb .sh-kpis')) errs.push('① no cards on the returns tab (old)');
    if (!/보내는 곳|From|Sai de/.test(await pg.textContent('.sb .sh-tbl thead'))) errs.push('① origin column header');
    await pg.click('.sb .sh-l'); await pg.waitForSelector('.sb .sh-det .sh-abas');
    const dt = await pg.textContent('.sb .sh-det'); if (!/SHP-2026-000077/.test(dt) || !/THE ONE CORP/.test(dt)) errs.push('① return detail: original shipment + to our warehouse');
    if (!(await pg.$('.sb #shDet [data-act="ret-email"]'))) errs.push('① email button on a return');
    await pg.click('.sb [data-act="sh-tipo"][data-tipo="envios"]'); await pg.waitForTimeout(300);
    /* ② UPS 반품 만들기 */
    await pg.click('.sb [data-act="sh-retorno"]'); await pg.waitForSelector('#retEnvQ');
    if (!(await pg.evaluate(() => document.activeElement && document.activeElement.id === 'retEnvQ'))) errs.push('② focus on shipment search at once');
    await pg.fill('#retEnvQ', '1ZAAA0002'); await pg.waitForSelector('[data-ret-env]', { timeout: 4000 }).catch(() => errs.push('② shipment found by box tracking'));
    await pg.click('[data-ret-env]'); await pg.waitForTimeout(200);
    if (!/BEAUTY EXCHANGE ORLANDO/.test(await pg.textContent('#retCliSel'))) errs.push('② store filled from the shipment');
    const pv = await pg.inputValue('#retP'), cv = await pg.inputValue('#retC'); log('② box 2 weight/len:', pv, cv); if (pv !== '10' || cv !== '14') errs.push('② box 2 measures filled (tracking of box 2)');
    await pg.fill('#retDesc', 'Damaged chains');
    await pg.click('#retCriarBt');
    await pg.waitForFunction(() => Object.values(window.__MOCK_STORE__.shipq).some(q => q.st === 'ret'), null, { timeout: 5000 }).catch(() => errs.push('② shipq ret request'));
    const rq = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.shipq).find(q => q.kind === 'ret' && q.st === 'ret')); log('② request:', rq && JSON.stringify({ id: rq.id, box: rq.box, desc: rq.desc, retDe: rq.retDe, shp: rq.shp, to: rq.to && rq.to.city }));
    if (!rq || rq.box.w !== 10 || rq.box.l !== 14 || rq.desc !== 'Damaged chains' || !/^XBAL1/.test(rq.retDe) || !/^SHP-\d{4}-\d{6}$/.test(rq.shp) || rq.to.zip !== '32801') errs.push('② request payload (box · desc · original · SHP · address)');
    /* UPS.gs 흉내: 라벨 + shipments/{트래킹} (saveReturn_) */
    await pg.evaluate(o => { const S = window.__MOCK_STORE__, q = S.shipq[o.id]; Object.assign(q, { st: 'retdone', shipId: '1ZRET0002', track: '1ZRET0002', charge: 11.25, labels: [{ trk: '1ZRET0002', img: o.gif }] });
      S.shipments['1ZRET0002'] = { id: '1ZRET0002', trk: '1ZRET0002', shipId: '1ZRET0002', lead: '1ZRET0002', retJob: o.id, ret: true, retDe: q.retDe, retDeShp: q.retDeShp, retDesc: q.desc, shp: q.shp, carrier: 'UPS', acct: q.acct, store: q.store, sm: q.sm, box: 1, boxes: 1, w: 10, dims: '14×10×8', svc: '03', svcName: 'UPS Ground', shipDate: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 10), cost: 11.25, status: 'Label created', trkSt: 'open', at: new Date().toISOString(), by: q.by }; }, { id: rq.id, gif: GIF });
    await pg.waitForSelector('.ret-em-in', { timeout: 9000 }).catch(() => errs.push('② email window opens after the label'));
    const em0 = await pg.inputValue('.ret-em-in'); if (em0 !== 'store@beauty.com') errs.push('② store email suggested');
    if (!(await pg.$eval('.sb [data-act="sh-tipo"][data-tipo="retornos"]', b => b.classList.contains('on')))) errs.push('② returns tab selected');
    await pg.click('#retEmMais'); await pg.fill('.ret-em-l:nth-child(3) .ret-em-in, .ret-em-in >> nth=1', 'bad-mail'); await pg.click('#retEmailGo'); await pg.waitForTimeout(300);
    if (!/bad-mail/.test(await pg.textContent('#toast'))) errs.push('② invalid email refused');
    if (await pg.evaluate(() => Object.values(window.__MOCK_STORE__.shipq).some(q => q.st === 'mail'))) errs.push('② nothing sent with a bad email');
    await pg.fill('.ret-em-in >> nth=1', 'owner@beauty.com'); await pg.click('#retEmailGo');
    await pg.waitForFunction(() => Object.values(window.__MOCK_STORE__.shipq).some(q => q.st === 'mail'), null, { timeout: 5000 }).catch(() => errs.push('② shipq mail request'));
    const mq = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.shipq).find(q => q.st === 'mail')); log('② mail:', mq && JSON.stringify({ job: mq.job, emails: mq.emails, kind: mq.kind }));
    if (!mq || mq.job !== rq.id || mq.emails.join() !== 'store@beauty.com,owner@beauty.com' || mq.kind !== 'retmail') errs.push('② mail request (job · 2 emails)');
    await pg.evaluate(id => { window.__MOCK_STORE__.shipq[id].st = 'maildone'; }, mq.id);
    await pg.waitForFunction(() => (window.__MOCK_STORE__.shipments['1ZRET0002'].log || []).some(l => l.t === 'email'), null, { timeout: 8000 }).catch(() => errs.push('② email logged in history'));
    await pg.waitForTimeout(300);
    await pg.click('.sb [data-act="sh-aba"][data-aba="hist"]'); await pg.waitForTimeout(200);
    if (!/owner@beauty.com/.test(await pg.textContent('.sb .sh-aud'))) errs.push('② history shows the email');
    /* ③ 출고 등록 */
    await pg.click('.sb [data-act="sh-tipo"][data-tipo="envios"]'); await pg.waitForTimeout(300);
    await pg.click('.sb [data-act="sh-manual"]'); await pg.waitForSelector('#shmCliQ');
    if (!(await pg.evaluate(() => document.activeElement && document.activeElement.id === 'shmCliQ'))) errs.push('③ focus on customer search');
    await pg.fill('#shmCliQ', '3001'); await pg.waitForSelector('[data-cli="3001"]'); await pg.click('[data-cli="3001"]');
    if ((await pg.inputValue('#shmSm')) !== 'ALEX') errs.push('③ salesman follows the store');
    await pg.selectOption('#shmTransp', 'FEDEX'); await pg.fill('#shmServ', 'FedEx Ground'); await pg.fill('#shmRast', '7777 0000 1111'); await pg.fill('#shmCusto', '18.5'); await pg.fill('#shmN', '2'); await pg.fill('#shmPeso', '10');
    await pg.click('#shmSalvar'); await pg.waitForTimeout(700);
    const md = await pg.evaluate(() => [window.__MOCK_STORE__.shipments['777700001111'], window.__MOCK_STORE__.shipments['777700001111-2']]); log('③ manual docs:', JSON.stringify(md.map(x => x && { carrier: x.carrier, manual: x.manual, shp: x.shp, w: x.w, cost: x.cost, box: x.box, sm: x.sm })));
    if (!md[0] || !md[1] || md[0].carrier !== 'FEDEX' || !md[0].manual || md[0].shp !== md[1].shp || md[0].cost !== 18.5 || md[1].w !== 5 || md[0].trkSt !== 'done') errs.push('③ one doc per box (FEDEX · manual · same SHP · cost on box 1 · weight split · not UPS-tracked)');
    if (!(await pg.$('.sb #shDet')) || !(await pg.textContent('.sb .sh-det-num')).startsWith('SHP-')) errs.push('③ new shipment opens in detail');
    if (await pg.$('.sb #shDet [data-act="sh-rastrear"]')) errs.push('③ no UPS tracking for FedEx');
    await pg.click('.sb #shDet [data-act="sh-entregue"]'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk');
    await pg.waitForFunction(() => window.__MOCK_STORE__.shipments['777700001111-2'].delivered === true, null, { timeout: 4000 }).catch(() => errs.push('③ marked delivered'));
    await pg.waitForTimeout(400);
    if (!/배송 완료|Delivered|Entregue/.test(await pg.textContent('.sb .sh-det-head'))) errs.push('③ status delivered');
    /* 같은 운송장은 두 번 안 됨 */
    await pg.click('.sb [data-act="sh-manual"]'); await pg.waitForSelector('#shmCliQ'); await pg.fill('#shmCliQ', '3001'); await pg.click('[data-cli="3001"]'); await pg.fill('#shmRast', '777700001111'); await pg.click('#shmSalvar'); await pg.waitForTimeout(400);
    if (!/SHP-/.test(await pg.textContent('#toast'))) errs.push('③ duplicate tracking refused');
    await pg.click('.es-mw [data-act="fechar-modal"]');
    /* ④ 운송사 필터 */
    await pg.click('.sb [data-act="sh-fechar"]').catch(() => {}); await pg.waitForTimeout(200);
    await pg.selectOption('#shTransp', 'FEDEX'); await pg.waitForTimeout(300);
    const fr = await pg.$$eval('.sb .sh-tbl tbody tr', L => L.map(r => r.querySelector('.sh-transp').textContent)); log('④ carrier rows:', fr.join(','));
    if (fr.length !== 1 || fr[0] !== 'FedEx') errs.push('④ carrier filter + column');
    await pg.click('.sb [data-act="sh-limpar"]'); await pg.waitForTimeout(300);
    /* ⑥ 영업 담당 변경 */
    await pg.click('.sb .sh-l[data-envio^="XBAL1"]'); await pg.waitForSelector('.sb [data-act="sh-vend-editar"]');
    await pg.click('.sb [data-act="sh-vend-editar"]'); await pg.selectOption('#shVendSel', 'SOO'); await pg.click('.sb [data-act="sh-vend-salvar"]'); await pg.waitForTimeout(400);
    const sms = await pg.evaluate(() => [window.__MOCK_STORE__.shipments['1ZAAA0001'].sm, window.__MOCK_STORE__.shipments['1ZAAA0002'].sm]);
    if (sms.join() !== 'SOO,SOO') errs.push('⑥ salesman changed on every box');
    if (!(await pg.evaluate(() => (window.__MOCK_STORE__.shipments['1ZAAA0001'].log || []).some(l => l.t === 'vend' && l.de === 'ALEX' && l.para === 'SOO')))) errs.push('⑥ change logged');
    /* ⑤ 청구서 가져오기 */
    await pg.click('.sb [data-act="sh-importar"]'); await pg.waitForSelector('#shImpArq');
    await pg.setInputFiles('#shImpArq', [{ name: 'inv-a.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV_A) }, { name: 'inv-b.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV_B) }]);
    await pg.waitForFunction(() => !document.querySelector('#shImpGo').disabled, null, { timeout: 4000 }).catch(() => errs.push('⑤ files read'));
    log('⑤ preview:', (await pg.textContent('#shImpResumo')).replace(/\s+/g, ' '));
    await pg.click('#shImpGo'); await pg.waitForSelector('#shImpResumo .aviso.gravado', { timeout: 6000 }).catch(() => errs.push('⑤ summary'));
    const sumTxt = (await pg.textContent('#shImpResumo')).replace(/\s+/g, ' '); log('⑤ summary:', sumTxt);
    if (!/1ZZZ9999/.test(sumTxt) || !/NOT IN APP, STORE/.test(sumTxt)) errs.push('⑤ unmatched shipment reported');
    let b = await pg.evaluate(() => [window.__MOCK_STORE__.shipments['1ZAAA0001'], window.__MOCK_STORE__.shipments['1ZAAA0002']]); log('⑤ billNet:', b[0].billNet, b[1].billNet, JSON.stringify(b[1].billInv));
    if (b[0].billNet !== 23 || b[1].billNet !== 12.5 || b[1].billAdj !== 2.5 || b[0].billW !== 15 || b[0].trk !== '1ZAAA0001' || b[0].sm !== 'SOO') errs.push('⑤ billed amounts merged onto the boxes (doc not replaced)');
    if (await pg.evaluate(() => !!window.__MOCK_STORE__.shipments['1ZZZ9999'])) errs.push('⑤ unmatched not created');
    /* 다시 가져와도 같은 금액 */
    await pg.click('.es-mw [data-act="fechar-modal"]'); await pg.click('.sb [data-act="sh-importar"]'); await pg.waitForSelector('#shImpArq');
    await pg.setInputFiles('#shImpArq', [{ name: 'inv-a.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV_A) }]); await pg.waitForFunction(() => !document.querySelector('#shImpGo').disabled);
    await pg.click('#shImpGo'); await pg.waitForSelector('#shImpResumo .aviso.gravado', { timeout: 6000 });
    b = await pg.evaluate(() => [window.__MOCK_STORE__.shipments['1ZAAA0001'].billNet, window.__MOCK_STORE__.shipments['1ZAAA0002'].billNet]); if (b.join() !== '23,12.5') errs.push('⑤ re-import is idempotent (' + b.join() + ')');
    await pg.click('.es-mw [data-act="fechar-modal"]'); await pg.waitForTimeout(300);
    await pg.click('.sb .sh-l[data-envio^="XBAL1"]'); await pg.waitForSelector('.sb .sh-abas'); await pg.click('.sb [data-act="sh-aba"][data-aba="custos"]'); await pg.waitForTimeout(200);
    const ct = (await pg.textContent('.sb #shDetCorpo')).replace(/\s+/g, ' '); log('⑤ costs:', ct.slice(0, 260));
    if (!/\$35\.50/.test(ct) || !/\+\$2\.10/.test(ct) || !/\$33\.40/.test(ct) || !/A1/.test(ct)) errs.push('⑤ costs tab: billed 35.50 vs quoted 33.40 (+2.10) · invoice');
    const kc = await pg.$eval('.sb .sh-kpis .fin-kpi:last-child b', x => x.textContent); log('⑤ freight card:', kc);
    /* ⑨ 권한 */
    const pk = await mk('pk@x.com'); if (await pk.$('.sb [data-act="sh-importar"]')) errs.push('⑨ pick: no invoice import'); if (!(await pk.$('.sb [data-act="sh-retorno"]')) || !(await pk.$('.sb [data-act="sh-manual"]'))) errs.push('⑨ pick: return + log shipment');
    const wm = await mk('wm@x.com'); if (!(await wm.$('.sb [data-act="sh-importar"]'))) errs.push('⑨ warehouse manager: invoice import');
    const sp = await mk('brandon@x.com');
    if (await sp.$('.sb [data-act="sh-manual"], .sb [data-act="sh-retorno"], .sb [data-act="sh-importar"], .sb [data-act="sh-rastrear-todos"]')) errs.push('⑨ salesman: no header actions');
    await sp.click('.sb .sh-l[data-envio^="O261014-AAAA"]'); await sp.waitForSelector('.sb .sh-abas');
    if (await sp.$('.sb [data-act="sh-vend-editar"], .sb [data-act="sh-entregue"], .sb [data-act="sh-cancelar"]')) errs.push('⑨ salesman: read-only detail');
    if (await sp.evaluate(() => Object.values(window.__MOCK_STORE__.shipments).some(x => x.shp && x.sm === 'BRANDON' && !/7[78]$/.test(x.shp)))) errs.push('⑨ salesman view does not write SHP numbers');
    /* ⑩ 휴대폰 */
    const mo = await mk('luke@theonefl.com', 430, 900);
    const ov = await mo.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); log('⑩ mobile overflow:', ov); if (ov > 2) errs.push('⑩ no horizontal scroll at 430px');
    if (await mo.$eval('.sb .sh-filtros', e => getComputedStyle(e).display !== 'none')) errs.push('⑩ filters behind the button on the phone');
    if (!(await mo.$eval('.sb .sh-filtro-bt', e => getComputedStyle(e).display !== 'none'))) errs.push('⑩ filter button visible on the phone');
    if (await pg.$eval('.sb .sh-filtro-bt', e => getComputedStyle(e).display !== 'none')) errs.push('⑩ filter button hidden on desktop');
  } catch (e) { errs.push('THROW ' + e.message); }
  await br.close(); srv.kill();
  if (errs.length) { console.log('❌', errs.join('\n❌ ')); process.exit(1); } else console.log('✅ t250 Shipping History parity');
})();
