/* v0.8.198 시험 — 📦 재고(#/estoque) · 🏷 라벨 출력(#/etiquetas): 옛 WMS 의 Estoque · Etiquetas — 통로 지도 · 입고(상자 라벨) · 출고(상자 고르기) · 상자 나누기 · 피킹 라벨 · 세일즈맨은 조회만
 *   ① 관리자: 묶음 메뉴 재고에 📦 재고(estoque) · 🏷 라벨 출력(etiquetas) — 옛 stock 칸은 없음
 *   ② 통로 지도: 위치 7A · 07A-3 → 통로 07A 카드(2 SKUs) · 12B 카드 · 빈 통로 카드 · 숫자 칸 · 07A 를 누르면 그 통로 표 2줄
 *   ③ 창고 직원(pick): 입고 EB103 12개 → etiquetas 문서 1 (qtdRestante 12) · stock 15 → 27 · stockLog(recv · etq · before/after) · 초록 영수증 → 3×1.5 상자 라벨 인쇄(코드)
 *   ④ 같은 상품 다시 입고 → "이미 있는 상자에?" 창 → 새 상자 → 24시간 안 중복 경고 → 그래도 입고 → 라벨 2장
 *   ⑤ 출고 AHG100 30개 → 상자 고르기(제안 배분) · 25 + 5 → AAAA2222 0 (닫힘) · BBBB3333 10 · stock 40 → 10 · stockLog out 2줄
 *   ⑥ 라벨 출력: AHG100 → 상자 1 (BBBB3333 10) → 나누기(새 상자로 4) → 상자 2 · 재고 그대로 → 피킹 · 3×1.5 → 인쇄 2장(.etq3.pick)
 *   ⑦ 상자 QR 링크 #/etiquetas/BBBB3333 → 그 상자만 선택
 *   ⑧ 세일즈맨: 조회만 (입고 · 출고 단추 없음 · 선택 칸 없음 · #/estoque/entrada 도 조회) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8946', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const SEED = `
    const rows = JSON.parse(s.catalog[1].j); const loc = { AHG100: '7A', AHG101: '07A-3', EB103: '12B', GM104: '12B' };
    rows.forEach(r => { if (loc[r[0]]) { while (r.length < 12) r.push(r.length === 10 ? 0 : ''); r[11] = loc[r[0]]; } }); s.catalog[1].j = JSON.stringify(rows);
    s.users.push({ id: 'pick@theonefl.com', email: 'pick@theonefl.com', name: 'Pick', role: 'manager', job: 'pick', active: true });
    s.stock = [{ id: 'AHG100', code: 'AHG100', qty: 40, at: '2026-11-01T00:00:00Z' }, { id: 'AHG101', code: 'AHG101', qty: 0, at: '2026-11-01T00:00:00Z' }, { id: 'EB103', code: 'EB103', qty: 15, at: '2026-11-01T00:00:00Z' }];
    s.etiquetas = [{ id: 'AAAA2222', codigo: 'AAAA2222', code: 'AHG100', nome: 'X', barcode: '', corredor: '07A', qtdInicial: 25, qtdRestante: 25, ativa: true, criadoEm: '2026-11-01T10:00:00Z' }, { id: 'BBBB3333', codigo: 'BBBB3333', code: 'AHG100', nome: 'X', barcode: '', corredor: '07A', qtdInicial: 15, qtdRestante: 15, ativa: true, criadoEm: '2026-11-02T10:00:00Z' }];`;
  const ctx = await br.newContext({ viewport: { width: 1280, height: 1000 } });
  const mk = async email => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed: SEED }); await pg.goto('http://127.0.0.1:8946/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  const store = (pg, col) => pg.evaluate(c => Object.values(window.__MOCK_STORE__[c] || {}), col);
  const go = (pg, h) => pg.evaluate(x => { location.hash = x; }, h);
  /* ① */
  let pg = await mk('luke@theonefl.com');
  await go(pg, '#/hub/wh'); await pg.waitForSelector('[data-hub]', { timeout: 8000 });
  const hubs = await pg.$$eval('[data-hub]', b => b.map(x => x.dataset.hub)); log('① hub:', hubs.join(' '));
  if (!hubs.includes('estoque') || !hubs.includes('etiquetas') || hubs.includes('stock')) errs.push('① wh hub: estoque + etiquetas, no stock');
  /* ② */
  await go(pg, '#/estoque'); await pg.waitForSelector('.sb .corr-mapa', { timeout: 10000 }).catch(() => errs.push('② corridor map'));
  const c07 = await pg.$eval('[data-corr-abrir="07A"]', b => b.textContent).catch(() => ''); log('② 07A:', c07.replace(/\s+/g, ' '));
  if (!/2/.test(c07)) errs.push('② 07A card shows 2 products');
  if (!(await pg.$('[data-corr-abrir="12B"] .corr-pt.a'))) errs.push('② 12B card: part zeroed (amber) — GM104 has no stock');
  if (!(await pg.$('.corr-cel.vazio'))) errs.push('② empty corridors shown');
  const tl = await pg.$$eval('.tiles .tile .val', L => L.map(x => x.textContent)); log('② tiles:', JSON.stringify(tl)); if (!/^2 \//.test(tl[0])) errs.push('② 2 corridors used (07A · 12B)');
  if (!(await pg.$('[data-modo="entrada"]'))) errs.push('② admin sees stock in/out');
  await pg.click('[data-corr-abrir="07A"]'); await pg.waitForSelector('.es-tab tbody tr.tr-toggle', { timeout: 4000 }).catch(() => errs.push('② corridor table'));
  const n07 = await pg.$$eval('.es-tab tbody tr.tr-toggle', L => L.map(r => r.querySelector('.principal b').textContent)); log('② 07A rows:', n07.join(' '));
  if (n07.length !== 2 || n07.indexOf('AHG100') < 0 || n07.indexOf('AHG101') < 0) errs.push('② 07A has AHG100 + AHG101');
  await pg.close();
  /* ③ */
  pg = await mk('pick@theonefl.com');
  await go(pg, '#/estoque'); await pg.waitForSelector('[data-modo="entrada"]', { timeout: 10000 });
  await pg.click('[data-modo="entrada"]'); await pg.waitForSelector('#esBusca');
  await pg.fill('#esBusca', 'EB103'); await pg.keyboard.press('Enter');
  await pg.waitForSelector('#esQtd:not([disabled])', { timeout: 4000 }).catch(() => errs.push('③ product chosen'));
  await pg.fill('#esQtd', '12'); await pg.click('[data-act="es-entrada"]');
  await pg.waitForSelector('.es-mw .aviso.gravado', { timeout: 5000 }).catch(() => errs.push('③ green receipt in the size dialog'));
  const rec = await pg.textContent('.es-mw .aviso.gravado').catch(() => ''); log('③ receipt:', rec); if (!/27/.test(rec)) errs.push('③ receipt shows new balance 27');
  let E = (await store(pg, 'etiquetas')).filter(x => x.code === 'EB103'); log('③ etiquetas:', JSON.stringify(E.map(x => [x.codigo, x.qtdRestante, x.corredor])));
  if (E.length !== 1 || E[0].qtdRestante !== 12 || !/^[2-9A-HJ-NP-Z]{8}$/.test(E[0].codigo) || E[0].corredor !== '12B') errs.push('③ one etiquetas doc (8 chars, 12, corridor 12B)');
  const st3 = await pg.evaluate(() => window.__MOCK_STORE__.stock.EB103); if (st3.qty !== 27 || st3.vazia !== false) errs.push('③ stock 15 → 27 :: ' + JSON.stringify(st3));
  const lg3 = (await store(pg, 'stockLog')).filter(x => x.code === 'EB103'); log('③ log:', JSON.stringify(lg3.map(x => [x.kind, x.delta, x.before, x.after, x.etq])));
  if (lg3.length !== 1 || lg3[0].kind !== 'recv' || lg3[0].before !== 15 || lg3[0].after !== 27 || lg3[0].etq !== E[0].codigo) errs.push('③ stockLog recv 15 → 27 with etq');
  await pg.click('.es-mw [data-act="etq-tam-est-3"]');
  await pg.waitForSelector('#prt.on #prtbody .etq3', { timeout: 5000 }).catch(() => errs.push('③ box label printed (3×1.5)'));
  const lb = await pg.textContent('#prtbody .etq3').catch(() => ''); log('③ label:', lb.replace(/\s+/g, ' ')); if (lb.indexOf(E[0].codigo) < 0 || !/EB 103/.test(lb)) errs.push('③ label has box code + product code');
  await pg.click('#prtClose');
  /* ④ */
  await pg.waitForSelector('#esBusca:not([disabled])'); await pg.fill('#esBusca', 'EB103'); await pg.keyboard.press('Enter');
  await pg.waitForSelector('#esQtd:not([disabled])'); await pg.fill('#esQtd', '5'); await pg.fill('#esEtqN', '2'); await pg.click('[data-act="es-entrada"]');
  await pg.waitForSelector('.es-mw [data-act="ent-dup-sim"]', { timeout: 5000 }).catch(() => errs.push('④ recent duplicate warning (24h)'));
  await pg.click('.es-mw [data-act="ent-dup-sim"]');
  await pg.waitForSelector('.es-mw .aviso.gravado', { timeout: 5000 }).catch(() => errs.push('④ receipt after confirming'));
  E = (await store(pg, 'etiquetas')).filter(x => x.code === 'EB103'); if (E.length !== 3 || E.filter(x => x.qtdRestante === 5).length !== 2) errs.push('④ 2 equal labels of 5 :: ' + E.length);
  await pg.click('.es-mw [data-act="etq-tam-fechar"]'); await pg.waitForTimeout(200);
  /* 1 상자 + 이미 있는 상자 → 묻기 */
  await pg.fill('#esBusca', 'EB103'); await pg.keyboard.press('Enter'); await pg.waitForSelector('#esQtd:not([disabled])'); await pg.fill('#esQtd', '3'); await pg.click('[data-act="es-entrada"]');
  await pg.waitForSelector('.es-mw [data-act="ent-vincular"]', { timeout: 5000 }).catch(() => errs.push('④ asks which existing box'));
  const alvo = E.find(x => x.qtdRestante === 12).codigo; await pg.click('.es-mw [data-act="ent-vincular"][data-cod="' + alvo + '"]');
  await pg.waitForSelector('.es-mw [data-act="ent-dup-sim"]', { timeout: 5000 }); await pg.click('.es-mw [data-act="ent-dup-sim"]');
  await pg.waitForSelector('.es-mw .aviso.gravado', { timeout: 5000 }); await pg.click('.es-mw [data-act="etq-tam-fechar"]');
  const v4 = await pg.evaluate(c => window.__MOCK_STORE__.etiquetas[c], alvo); if (v4.qtdRestante !== 15 || v4.qtdInicial !== 15) errs.push('④ added to the existing box 12 → 15');
  const st4 = await pg.evaluate(() => window.__MOCK_STORE__.stock.EB103.qty); if (st4 !== 40) errs.push('④ stock 27 + 10 + 3 = 40 :: ' + st4);
  const mm = await pg.$$eval('#mmPainel tr.mm-l', L => L.length).catch(() => 0); log('④ my moves:', mm); if (mm < 4) errs.push('④ my recent movements listed');
  /* ⑤ */
  await pg.click('[data-modo="saida"]'); await pg.waitForSelector('#esBusca'); await pg.fill('#esBusca', 'AHG100'); await pg.keyboard.press('Enter');
  await pg.waitForSelector('#esQtd:not([disabled])'); await pg.fill('#esQtd', '30'); await pg.click('[data-act="es-saida"]');
  await pg.waitForSelector('.es-mw .es-etq', { timeout: 5000 }).catch(() => errs.push('⑤ box picker'));
  const sug = await pg.$$eval('.es-mw .es-etq-in', L => L.map(i => [i.dataset.rep, i.value])); log('⑤ suggestion:', JSON.stringify(sug));
  if (sug.length !== 2 || sug[0][0] !== 'BBBB3333' || sug[0][1] !== '15' || sug[1][1] !== '15') errs.push('⑤ suggestion newest box first (15 + 15)');
  await pg.fill('.es-mw .es-etq-in[data-rep="AAAA2222"]', '25'); await pg.fill('.es-mw .es-etq-in[data-rep="BBBB3333"]', '0');
  const dis = await pg.$eval('#esRepOk', b => b.disabled); if (!dis) errs.push('⑤ confirm disabled when sum ≠ 30');
  await pg.fill('.es-mw .es-etq-in[data-rep="BBBB3333"]', '5'); await pg.click('#esRepOk'); await pg.waitForTimeout(600);
  const a5 = await pg.evaluate(() => window.__MOCK_STORE__.etiquetas.AAAA2222), b5 = await pg.evaluate(() => window.__MOCK_STORE__.etiquetas.BBBB3333);
  if (a5.qtdRestante !== 0 || a5.ativa !== false || !a5.encerradoEm || b5.qtdRestante !== 10 || !b5.ativa) errs.push('⑤ AAAA2222 closed at 0 · BBBB3333 10 :: ' + JSON.stringify([a5.qtdRestante, a5.ativa, b5.qtdRestante]));
  const st5 = await pg.evaluate(() => window.__MOCK_STORE__.stock.AHG100.qty); if (st5 !== 10) errs.push('⑤ stock 40 → 10 :: ' + st5);
  const lg5 = (await store(pg, 'stockLog')).filter(x => x.code === 'AHG100').sort((a, b) => a.before - b.before); log('⑤ log:', JSON.stringify(lg5.map(x => [x.kind, x.delta, x.before, x.after, x.etq])));
  if (lg5.length !== 2 || lg5.some(x => x.kind !== 'out') || lg5[1].before !== 40 || lg5[0].after !== 10) errs.push('⑤ stockLog: 2 out rows chained 40 → 10');
  /* ⑥ */
  await go(pg, '#/etiquetas'); await pg.waitForSelector('#etqTabBusca', { timeout: 8000 });
  await pg.fill('#etqTabBusca', 'AHG100'); await pg.keyboard.press('Enter');
  await pg.waitForSelector('#etqwArea tr.etqw-cx', { timeout: 5000 }).catch(() => errs.push('⑥ boxes table'));
  let cx = await pg.$$eval('#etqwArea tr.etqw-cx', L => L.map(r => r.dataset.cx)); log('⑥ boxes:', cx.join(' ')); if (cx.length !== 1 || cx[0] !== 'BBBB3333') errs.push('⑥ only the live box BBBB3333');
  await pg.click('[data-etqw-acao="dividir"]'); await pg.waitForSelector('#etqwDivValor'); await pg.type('#etqwDivValor', '4');
  await pg.waitForSelector('[data-act="etqw-dividir-ok"]'); await pg.click('[data-act="etqw-dividir-ok"]'); await pg.waitForTimeout(700);
  cx = await pg.$$eval('#etqwArea tr.etqw-cx', L => L.map(r => [r.dataset.cx, r.querySelector('.etqw-td-saldo').textContent])); log('⑥ after divide:', JSON.stringify(cx));
  if (cx.length !== 2 || cx[0][0] !== 'BBBB3333' || cx[0][1] !== '6' || cx[1][1] !== '4') errs.push('⑥ divided: BBBB3333 6 + new 4');
  const st6 = await pg.evaluate(() => window.__MOCK_STORE__.stock.AHG100.qty); if (st6 !== 10) errs.push('⑥ stock unchanged by divide');
  const ev = (await store(pg, 'etqEventos')).filter(x => x.tipo === 'dividida'); if (ev.length !== 1) errs.push('⑥ divide event logged');
  await pg.click('[data-etqw-tipo="picking"]'); await pg.click('[data-etqw-tam="3"]');
  if (!(await pg.$('.etqw-previa .etq3.pick'))) errs.push('⑥ live preview of the picking label');
  await pg.click('.etqw-lado-resumo [data-act="etqw-imprimir"]');
  await pg.waitForSelector('#prt.on #prtbody .etq3.pick', { timeout: 5000 }).catch(() => errs.push('⑥ picking labels printed'));
  const np = await pg.$$eval('#prtbody .etq3.pick', L => L.length); if (np !== 2) errs.push('⑥ 2 picking labels :: ' + np);
  const pt = await pg.textContent('#prtbody .etq3.pick'); if (!/AHG 100/.test(pt)) errs.push('⑥ picking label shows product code');
  await pg.click('#prtClose');
  /* ⑦ */
  await go(pg, '#/hub/wh'); await pg.waitForTimeout(300); await go(pg, '#/etiquetas/BBBB3333');
  await pg.waitForSelector('#etqwArea tr.etqw-cx', { timeout: 5000 }).catch(() => errs.push('⑦ box link opens the product'));
  const on7 = await pg.$$eval('#etqwArea tr.etqw-cx.on', L => L.map(r => r.dataset.cx)); if (on7.length !== 1 || on7[0] !== 'BBBB3333') errs.push('⑦ only that box selected :: ' + on7);
  await pg.close();
  /* ⑧ */
  pg = await mk('brandon@x.com');
  await go(pg, '#/estoque/entrada'); await pg.waitForSelector('.sb .corr-mapa', { timeout: 10000 }).catch(() => errs.push('⑧ salesman sees the map (consulta)'));
  if (await pg.$('[data-modo="entrada"]')) errs.push('⑧ no stock in for salesman');
  await pg.click('[data-corr-abrir="07A"]'); await pg.waitForSelector('.es-tab tbody tr.tr-toggle', { timeout: 4000 });
  if (await pg.$('[data-corr-sel]')) errs.push('⑧ no selection checkboxes');
  await pg.click('.es-tab tbody tr.tr-toggle'); await pg.waitForSelector('.caixas-painel .caixa-item', { timeout: 4000 }).catch(() => errs.push('⑧ boxes shown read-only'));
  if (await pg.$('[data-act="cx-salvar"]')) errs.push('⑧ no box editing for salesman');
  await pg.close();
  log(errs.length ? 'FAIL' : 'PASS'); if (errs.length) console.log(errs);
  await br.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})();
