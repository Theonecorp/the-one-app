/* v0.8.164 시험 — 🖼 Notes Display (v0.8.214 부터 옛 WMS 의 Notes Display 흐름: notasDisplay · 가게마다 카드 · 끝내면 Notes UPS 박스)
 *   ① 인보이스 담당: 주문 창 🖼 Notes Display → 새 요청 칸이 주문의 가게로 열림 · 세일즈맨이 요청한 종류는 Outros 줄 → Empty Display BASE ×2 더함 → 보내기
 *      → notasDisplay: 한 그룹 · 대기 · 준비 날짜 오늘 · 주문 연결 / 창고에 🔔 (앱 안 메시지 + 팝업만) · 주문 단추에 (1)
 *   ② 창고 매니저: 대기 숫자(박스) · 두 칸(준비 대기 — 준비 날짜 순 · 늦음 표시 | 끝남 24시간 · 취소됨) · [준비 시작] → [끝내기] → Notes UPS 박스 6개(30 lb ×2 · 16 lb ×4 — 상품의 배송 무게)
 *      → 끝남 칸 · 주문 문서는 안 생김 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8883', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  fs.mkdirSync(path.resolve(__dirname, 'out'), { recursive: true });
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const CAT = "const c0 = s.catalog.find(x => x.id === 'c0'); const rows = JSON.parse(c0.j); rows.push(['LD(STACKABLE)', 'LD STACKABLE', 10, 0, '', 'Set Orders & Displays', 'EMPTY DISPLAY', '', '', '']); rows.push(['LB2', 'BASE - 2FL TIER (LONG)', 10, 0, '', 'Set Orders & Displays', 'EMPTY DISPLAY', '', '', '']); c0.j = JSON.stringify(rows); c0.n = rows.length; s.prodExtra = [{ id: 'LD(STACKABLE)', peso: 16, comp: 26, larg: 16, alt: 16 }, { id: 'LB2', peso: 30, comp: 15, larg: 15, alt: 26 }];";
  const mk = async (job, seed, w) => {
    const pg = await br.newPage({ viewport: { width: w || 430, height: 1000 } }); pg.on('pageerror', e => errs.push(job + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'acct@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', 's.users.forEach(u => { if (u.email === "acct@theonefl.com") u.job = "' + o.job + '"; });' + o.cat + (o.seed || '')); }, { job, seed, cat: CAT });
    await pg.goto('http://127.0.0.1:8883/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(300); return pg;
  };
  const nyDay = n => new Date(Date.now() + n * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  /* ① 인보이스 담당 — 주문 창에서 */
  let pg = await mk('invoice', 's.orders[0].req = { WALL: 1 };');
  await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#mDisp', { timeout: 8000 }).catch(() => errs.push('order screen should have 🖼 Notes Display'));
  if (await pg.$('#mDisp')) {
    await pg.click('#mDisp'); await pg.waitForSelector('.sb.nd-raiz .ups-cli-nome', { timeout: 6000 }).catch(() => errs.push('launch panel opens'));
    const nome = await pg.textContent('.ups-cli-nome').catch(() => ''); log('prefilled store:', nome); if (!/BEAUTY EXCHANGE ORLANDO/.test(nome)) errs.push('store should be prefilled from the order');
    const txt = await pg.$$eval('.nu-prod-txt', L => L.map(x => x.value)); log('requested kinds:', JSON.stringify(txt)); if (txt.length !== 1) errs.push('the requested kind comes in as an Outros line');
    await pg.fill('#nuProdBusca', 'base'); await pg.waitForSelector('[data-act="nu-prod-add"][data-id="LB2"]').catch(() => errs.push('Empty Display products are offered'));
    await pg.click('[data-act="nu-prod-add"][data-id="LB2"]'); await pg.waitForSelector('.nd-esc'); await pg.click('.nd-esc [data-act="nd-q"][data-d="1"]'); await pg.click('[data-act="nd-esc-ok"]'); await pg.waitForTimeout(150);
    await pg.click('[data-act="nu-prod-gravar"]'); await pg.waitForTimeout(900);
    const D = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.notasDisplay || {})); log('saved:', JSON.stringify(D.map(d => [d.status, d.code, d.texto, d.qtd, d.paraEm, d.orderNo, d.peso])));
    const it = D.find(x => x.code === 'LB2') || {};
    if (D.length !== 2 || D.some(x => x.status !== 'pendente' || x.orderId !== 'O261014-AAAA' || x.paraEm !== nyDay(0) || x.grupo !== D[0].grupo) || it.qtd !== 2 || it.peso !== 30) errs.push('one waiting request (group of 2 rows), linked to the order, prepare today by default');
    const wh = await pg.evaluate(() => ({ m: Object.values(window.__MOCK_STORE__.msgs || {}).filter(m => m.to === 'g:wh').length, q: Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.toGroup === 'g:wh' && n.pushOnly).length }));
    if (wh.m !== 1 || wh.q !== 1) errs.push('warehouse should get one in-app message and one pop-up-only notification');
    await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#mDisp', { timeout: 8000 }); await pg.waitForTimeout(600);
    if ((await pg.evaluate(() => (document.getElementById('mDispN') || {}).textContent || '')) !== '(1)') errs.push('order button should show (1)');
  }
  await pg.close();
  /* ② 창고 매니저 — 넓은 화면 */
  const row = (id, acct, store, code, nome, q, para, st, extra) => '{ id: "' + id + '", grupo: "' + id.slice(0, 3) + '", acct: "' + acct + '", store: "' + store + '", code: "' + code + '", nome: "' + nome + '", qtd: ' + q + ', qtdFeita: 0, paraEm: "' + para + '", status: "' + st + '", criadoPor: "x", criadoPorNome: "LINDSEY", criadoEm: "2026-11-04T10:00:00Z", notaIds: []' + (extra || '') + ' }';
  const seed = 's.notasDisplay = [' + row('DS1a', '1111', 'ALI B/S # 1', 'LB2', 'BASE - 2FL TIER (LONG)', 2, nyDay(-1), 'pendente') + ',' + row('DS1b', '1111', 'ALI B/S # 1', 'LD(STACKABLE)', 'LD STACKABLE', 4, nyDay(-1), 'pendente') + ',' +
    row('DS2a', '3001', 'BEAUTY EXCHANGE ORLANDO', 'LB2', 'BASE - 2FL TIER (LONG)', 1, nyDay(2), 'pendente') + ',' + row('DS3a', '2478', 'JIM DANDY MART', 'LD(STACKABLE)', 'LD STACKABLE', 1, nyDay(0), 'cancelado', ', canceladaEm: new Date().toISOString(), fimEm: new Date().toISOString()') + '];';
  pg = await mk('whmgr', seed, 1200);
  await pg.evaluate(() => { location.hash = '#/displays'; }); await pg.waitForSelector('[data-nd-loja]', { timeout: 6000 });
  const kpi = (await pg.textContent('.nu-kpis')).replace(/\s+/g, ' '); log('kpi:', kpi); if (!/대기[^0-9]*2[^0-9]*7/.test(kpi)) errs.push('waiting card should read 2 stores · 7 boxes: ' + kpi);
  const cols = [await pg.$$eval('.rp-ag [data-nd-loja]', L => L.map(x => x.dataset.ndLoja).join(',')), await pg.$$eval('.rp-em [data-nd-loja]', L => L.map(x => x.dataset.ndLoja).join(','))]; log('columns:', JSON.stringify(cols));
  if (cols[0] !== '1111,3001' || cols[1] !== '2478') errs.push('waiting column 1111,3001 by date · done column has the cancelled 2478');
  if (!/취소|Cancel/.test(await pg.textContent('.rp-em [data-nd-loja="2478"]'))) errs.push('cancelled request should be tagged 취소');
  if (!/지연|Late|Atrasado/.test(await pg.textContent('.rp-ag [data-nd-loja="1111"]'))) errs.push('late preparation date is flagged');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'notes_display.png'), fullPage: true });
  await pg.click('[data-nd-loja="1111"] [data-act="nd-iniciar"]'); await pg.waitForTimeout(700);
  let d1 = await pg.evaluate(() => ['DS1a', 'DS1b'].map(k => window.__MOCK_STORE__.notasDisplay[k].status)); if (d1.join() !== 'preparando,preparando') errs.push('준비 시작 → preparando, got ' + d1);
  await pg.click('[data-nd-loja="1111"] [data-act="nd-concluir"]'); await pg.waitForSelector('#esPergSim', { timeout: 5000 }); await pg.click('#esPergSim');
  await pg.waitForSelector('#prt.on', { timeout: 8000 }).catch(() => errs.push('끝내기 prints the 6×4 labels'));
  const W = (await pg.evaluate(() => Object.values(window.__MOCK_STORE__.upsnotes || {}).filter(n => (n.ndIds || []).some(x => /^DS1/.test(x))).map(n => n.w))).sort((a, b) => b - a); log('Notes UPS box weights:', W.join(','));
  if (W.join(',') !== '30,30,16,16,16,16') errs.push('one Notes UPS box per unit with the product shipping weights');
  if (await pg.$('#prtClose')) await pg.click('#prtClose'); await pg.waitForTimeout(400);
  d1 = await pg.evaluate(() => ['DS1a', 'DS1b'].map(k => window.__MOCK_STORE__.notasDisplay[k].status)); if (d1.join() !== 'concluido,concluido') errs.push('끝내기 → concluido');
  if (await pg.evaluate(() => Object.keys(window.__MOCK_STORE__.orders || {}).some(k => /^DS/.test(k)))) errs.push('must not create an order document');
  const c2 = await pg.$$eval('.rp-em [data-nd-loja]', L => L.map(x => x.dataset.ndLoja).join(',')); log('done column after:', c2); if (!/1111/.test(c2)) errs.push('finished request should show in the done (24h) column');
  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL'); errs.forEach(e => console.log(' -', e)); process.exit(1); }
  console.log('PASS');
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
