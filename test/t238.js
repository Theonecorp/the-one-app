/* v0.8.210 시험 — 📥 상품 받기(#/recebimento): 옛 WMS 의 Produtos recebidos — REC 목록 · 만들기 · 줄 넣기(스캔) · 재고에 넣기(한 번만) · 다른 REC 로 · 닫기/다시 열기 · 확인 요청 · 세일즈맨 보기만
 *   ① 관리자: 묶음 메뉴 재고에 📥 상품 받기(recebimento) · 목록 숫자 칸(열린 REC 1) · 걸러보기(출처 #CHINA2 → REC-000001 만) · 검색(트래킹) → REC-000001
 *   ② 새 REC → REC-000002 (counters/rec) · REC 쪽이 열림 · 보낸 상자 2 저장
 *   ③ 줄 넣기 — 검색 EB103 · 수량 10 (재고 6 + 피킹 4) · 트래킹 FedEx → recebimentos 1 줄 (pickingQtd 4) · 새 라벨로 재고 6 → etiquetas · stock 21 · stockLog recv origem recebimento · estoqueConfirmado
 *   ④ 같은 줄을 다시 재고에 넣기 → 거절 (ja_confirmado) · stock 그대로
 *   ⑤ 바코드 스캔으로 AHG100 · 수량 5 · 재고에 넣기 창은 취소 → 줄은 "sem entrada" · 펼친 카드의 "재고에 넣기" → 기존 상자 AAAA2222 에 더함 (45)
 *   ⑥ 줄 하나를 REC-000001 로 옮기기 → cargaId · cargaNumero 바뀜
 *   ⑦ 확인 요청 → rechecagem { origem: recebimento, origemRef: REC-000002 의 id }
 *   ⑧ 닫기 — 상자 2 중 1 이면 막힘 → 보낸 상자 1 로 고친 뒤 닫힘 (fechada · fechadoPor) → 관리자가 다시 열기 (recebida)
 *   ⑨ 세일즈맨: 목록 · REC 쪽은 보이지만 새 REC · 넣기 칸 · 고르기 · 고치기 없음
 *   ⑩ 폰(430): 목록 카드 (rec-nums) · REC 쪽 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8918', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const SEED = `
    const rows = JSON.parse(s.catalog[1].j); const loc = { AHG100: '7A', EB103: '12B' };
    rows.forEach(r => { if (loc[r[0]]) { while (r.length < 12) r.push(r.length === 10 ? 0 : ''); r[11] = loc[r[0]]; } }); s.catalog[1].j = JSON.stringify(rows);
    s.stock = [{ id: 'AHG100', code: 'AHG100', qty: 40, at: '2026-11-01T00:00:00Z' }, { id: 'EB103', code: 'EB103', qty: 15, at: '2026-11-01T00:00:00Z' }];
    s.etiquetas = [{ id: 'AAAA2222', codigo: 'AAAA2222', code: 'AHG100', nome: 'X', barcode: '', corredor: '07A', qtdInicial: 40, qtdRestante: 40, ativa: true, criadoEm: '2026-11-01T10:00:00Z' }];
    s.counters = (s.counters || []).concat([{ id: 'rec', n: 2 }]);
    const ts = new Date(Date.now() - 864e5).toISOString();
    s.cargas = [{ id: 'CG1', numero: 'REC-000001', fornecedor: '#CHINA2', transportadora: '', status: 'recebida', dataChegada: ts.slice(0, 10), criadoEm: ts, criadoPor: 'x@theonefl.com', criadoPorNome: 'X', caixasEnviadas: null, caixasRecebidas: 0 },
                { id: 'CG0', numero: 'REC-000000', fornecedor: '#CHINA1', status: 'fechada', dataChegada: '2026-10-01', criadoEm: '2026-10-01T10:00:00Z', caixasEnviadas: null, caixasRecebidas: 0 }];
    s.recebimentos = [{ id: 'RB1', cargaId: 'CG1', cargaNumero: 'REC-000001', code: 'GM104', nome: 'GM', qtd: 3, origem: '#CHINA2', corredor: '', transportadora: 'UPS', rastreio: '1Z999AA10123456784', usuario: 'x', usuarioNome: 'X', criadoEm: ts, estoqueConfirmado: false, estoqueQtd: 0, estoqueEtiquetas: [], pickingQtd: null }];`;
  const ctx = await br.newContext({ viewport: { width: 1280, height: 1000 } });
  const mk = async (email, c) => { const pg = await (c || ctx).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed: SEED }); await pg.goto('http://127.0.0.1:8918/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  const store = (pg, col) => pg.evaluate(c => Object.values(window.__MOCK_STORE__[c] || {}), col);
  const doc = (pg, col, id) => pg.evaluate(a => (window.__MOCK_STORE__[a[0]] || {})[a[1]] || null, [col, id]);
  const go = (pg, h) => pg.evaluate(x => { location.hash = x; }, h);
  const sim = async pg => { await pg.waitForSelector('.es-mw #esPergSim', { timeout: 4000 }); await pg.click('.es-mw #esPergSim'); await pg.waitForTimeout(400); };
  const lista = pg => pg.$$eval('.rec-tbl tr.rec-l', L => L.map(r => r.dataset.rec));
  /* ① */
  let pg = await mk('luke@theonefl.com');
  await go(pg, '#/hub/wh'); await pg.waitForSelector('[data-hub]', { timeout: 8000 });
  const hubs = await pg.$$eval('[data-hub]', b => b.map(x => x.dataset.hub)); log('① hub:', hubs.join(' '));
  if (!hubs.includes('recebimento') || hubs.indexOf('recebimento') !== hubs.indexOf('etiquetas') + 2) errs.push('① wh hub: recebimento after produtos');
  await go(pg, '#/recebimento'); await pg.waitForSelector('.sb.rc-raiz .rec-tbl', { timeout: 10000 }).catch(() => errs.push('① list table'));
  const kp = await pg.$$eval('.fin-kpi b', L => L.map(x => x.textContent)); log('① kpis:', kp.join(' ')); if (kp[3] !== '1') errs.push('① open RECs = 1 :: ' + kp);
  let L = await lista(pg); if (L.length !== 2) errs.push('① two RECs listed :: ' + L);
  await pg.selectOption('#rfOrigem', '#CHINA2'); await pg.waitForTimeout(300); L = await lista(pg); log('① origem #CHINA2:', L); if (L.join() !== 'CG1') errs.push('① origem filter → CG1');
  await pg.click('[data-act="limpar-filtros-receb"]'); await pg.waitForTimeout(200);
  await pg.fill('#rConsulta', '1Z999AA1'); await pg.waitForTimeout(600); L = await lista(pg); log('① search tracking:', L); if (L.join() !== 'CG1') errs.push('① tracking search → CG1');
  await pg.fill('#rConsulta', ''); await pg.waitForTimeout(600);
  /* ② */
  await pg.click('.page-head [data-act="cg-nova"]'); await pg.waitForSelector('.rec-cabeca h1', { timeout: 6000 });
  const h1 = await pg.textContent('.rec-cabeca h1'); log('② new:', h1); if (h1.trim() !== 'REC-000002') errs.push('② new REC-000002 :: ' + h1);
  const cg2 = (await store(pg, 'cargas')).find(c => c.numero === 'REC-000002'); if (!cg2 || cg2.status !== 'recebida' || !cg2.criadoPor) errs.push('② cargas doc');
  await pg.fill('#cxEnv', '2'); await pg.click('[data-act="cg-caixas-salvar"]'); await pg.waitForTimeout(400);
  if ((await doc(pg, 'cargas', cg2.id)).caixasEnviadas !== 2) errs.push('② caixasEnviadas 2');
  /* ③ */
  await pg.fill('#rBusca', 'EB103'); await pg.waitForSelector('[data-pick="EB103"]'); await pg.click('[data-pick="EB103"]');
  await pg.waitForSelector('#rQtd'); await pg.fill('#rQtd', '10'); await pg.fill('#rDestPicking', '4'); await pg.fill('#rRastreio', '875713312630');
  await pg.click('[data-act="receb-salvar"]');
  await pg.waitForSelector('.es-mw [data-act="etq-tam-fechar"]', { timeout: 6000 }).catch(() => errs.push('③ label size dialog after stock entry'));
  await pg.click('.es-mw [data-act="etq-tam-fechar"]').catch(() => {}); await pg.waitForTimeout(300);
  let R = (await store(pg, 'recebimentos')).filter(x => x.cargaId === cg2.id); log('③ lines:', JSON.stringify(R.map(x => [x.code, x.qtd, x.pickingQtd, x.estoqueConfirmado, x.estoqueQtd, x.transportadora])));
  const r3 = R.find(x => x.code === 'EB103');
  if (!r3 || r3.qtd !== 10 || r3.pickingQtd !== 4 || !r3.estoqueConfirmado || r3.estoqueQtd !== 6 || r3.transportadora !== 'FEDEX' || (r3.estoqueEtiquetas || []).length !== 1) errs.push('③ EB103 line confirmed 6 + picking 4');
  const s3 = (await doc(pg, 'stock', 'EB103')).qty, l3 = (await store(pg, 'stockLog')).filter(x => x.code === 'EB103'), e3 = r3 && await doc(pg, 'etiquetas', r3.estoqueEtiquetas[0]);
  log('③ stock:', s3, JSON.stringify(l3.map(x => [x.kind, x.delta, x.origem, x.ref]))); if (s3 !== 21) errs.push('③ stock 15 + 6 = 21 :: ' + s3);
  if (!l3.some(x => x.kind === 'recv' && x.delta === 6 && x.origem === 'recebimento' && x.ref === r3.id)) errs.push('③ stockLog recv origem recebimento ref line');
  if (!e3 || e3.qtdRestante !== 6 || e3.code !== 'EB103') errs.push('③ new box label 6');
  /* ④ 펼친 카드: 이미 넣은 줄은 "재고에 넣기" 단추가 없음 */
  await pg.click('tr[data-receb-linha="' + r3.id + '"] td.principal'); await pg.waitForSelector('.receb-expand', { timeout: 4000 });
  if (await pg.$('.receb-expand [data-act="rec-entrada"]')) errs.push('④ confirmed line has no "put into stock" button');
  await pg.click('tr[data-receb-linha="' + r3.id + '"] td.principal'); await pg.waitForTimeout(200);
  /* ⑤ */
  await pg.click('[data-scan="receb"]'); await pg.waitForSelector('#scIn'); await pg.fill('#scIn', '898000000000'); await pg.click('#scUse');
  await pg.waitForSelector('#rQtd', { timeout: 4000 }); const sel5 = await pg.textContent('#rBuscaRes .sel-prod b'); if (sel5.trim() !== 'AHG100') errs.push('⑤ scan barcode → AHG100 :: ' + sel5);
  await pg.fill('#rQtd', '5'); await pg.click('[data-act="receb-salvar"]');
  await pg.waitForSelector('.es-mw [data-act="ent-vincular"]', { timeout: 5000 }).catch(() => errs.push('⑤ choose existing box dialog'));
  await pg.click('.es-mw [data-act="fechar-modal"].btn'); await pg.waitForTimeout(300);
  const r5 = (await store(pg, 'recebimentos')).find(x => x.code === 'AHG100'); if (!r5 || r5.estoqueConfirmado) errs.push('⑤ AHG100 line not yet in stock');
  if (!(await pg.$('tr[data-receb-linha="' + (r5 && r5.id) + '"] .tag-sem-ent'))) errs.push('⑤ "sem entrada" tag');
  await pg.click('tr[data-receb-linha="' + r5.id + '"] td.principal'); await pg.waitForSelector('.receb-expand [data-act="rec-entrada"]', { timeout: 4000 });
  /* ④ 다른 기기에서 이미 넣었으면 (화면은 아직 모름) — 넣기 전에 줄을 다시 읽어 거절 · 재고 그대로 */
  const n4 = (await store(pg, 'stockLog')).length;
  await pg.evaluate(id => Object.assign(window.__MOCK_STORE__.recebimentos[id], { estoqueConfirmado: true, estoqueQtd: 5, estoqueConfirmadoPorNome: 'Outro', estoqueConfirmadoEm: new Date().toISOString() }), r5.id);
  await pg.click('.receb-expand [data-act="rec-entrada"]'); await pg.waitForTimeout(600);
  if (await pg.$('.es-mw [data-act="ent-vincular"]')) { errs.push('④ refused: no box dialog'); await pg.click('.es-mw [data-act="fechar-modal"].btn'); }
  const n4b = (await store(pg, 'stockLog')).length, s4 = (await doc(pg, 'stock', 'AHG100')).qty; log('④ second confirm refused: logs', n4, '→', n4b, 'stock', s4);
  if (n4b !== n4 || s4 !== 40) errs.push('④ second confirm must not touch stock');
  await pg.evaluate(id => Object.assign(window.__MOCK_STORE__.recebimentos[id], { estoqueConfirmado: false, estoqueQtd: 0, estoqueConfirmadoPorNome: '', estoqueConfirmadoEm: '' }), r5.id);
  await go(pg, '#/recebimento'); await pg.waitForSelector('.rec-tbl'); await go(pg, '#/recebimento/' + cg2.id); await pg.waitForSelector('tr[data-receb-linha="' + r5.id + '"]');
  await pg.click('tr[data-receb-linha="' + r5.id + '"] td.principal'); await pg.waitForSelector('.receb-expand [data-act="rec-entrada"]', { timeout: 4000 });
  await pg.click('.receb-expand [data-act="rec-entrada"]'); await pg.waitForSelector('.es-mw [data-cod="AAAA2222"]'); await pg.click('.es-mw [data-cod="AAAA2222"]');
  await pg.waitForSelector('.es-mw [data-act="etq-tam-fechar"]', { timeout: 6000 }).catch(() => errs.push('⑤ label dialog after existing box')); await pg.click('.es-mw [data-act="etq-tam-fechar"]').catch(() => {}); await pg.waitForTimeout(300);
  const e5 = await doc(pg, 'etiquetas', 'AAAA2222'), s5 = (await doc(pg, 'stock', 'AHG100')).qty, r5b = await doc(pg, 'recebimentos', r5.id);
  log('⑤', e5.qtdRestante, s5, r5b.estoqueConfirmado, r5b.estoqueEtiquetas); if (e5.qtdRestante !== 45 || s5 !== 45 || !r5b.estoqueConfirmado || r5b.estoqueEtiquetas[0] !== 'AAAA2222') errs.push('⑤ existing box +5 → 45 · line confirmed');
  /* ④ 넣은 뒤 다시 — 거절 */
  await pg.evaluate(id => { const b = document.createElement('button'); b.dataset.act = 'rec-entrada'; b.dataset.id = id; b.id = 'tst4'; document.querySelector('#page .sb.rc-raiz #conteudo').appendChild(b); }, r5.id);
  const n4c = (await store(pg, 'stockLog')).length; await pg.click('#tst4'); await pg.waitForTimeout(500);
  if ((await store(pg, 'stockLog')).length !== n4c || (await doc(pg, 'stock', 'AHG100')).qty !== 45 || await pg.$('.es-mw [data-act="ent-vincular"]')) errs.push('④ confirm after confirm refused');
  /* ⑥ */
  await pg.check('tr[data-receb-linha="' + r5.id + '"] [data-rmarcar]'); await pg.waitForSelector('.bulkbar [data-act="receb-mover"]');
  await pg.click('.bulkbar [data-act="receb-mover"]'); await pg.waitForSelector('.es-mw [data-mv-destino="CG1"]'); await pg.click('.es-mw [data-mv-destino="CG1"]'); await pg.waitForTimeout(500);
  const r6 = await doc(pg, 'recebimentos', r5.id); log('⑥ moved:', r6.cargaId, r6.cargaNumero); if (r6.cargaId !== 'CG1' || r6.cargaNumero !== 'REC-000001') errs.push('⑥ moved to REC-000001');
  /* ⑦ */
  await pg.check('tr[data-receb-linha="' + r3.id + '"] [data-rmarcar]'); await pg.click('.bulkbar [data-act="receb-conferir"]'); await pg.click('.es-mw [data-rc="saldo"]'); await pg.waitForTimeout(500);
  const rc = await store(pg, 'rechecagem'); log('⑦ rechecagem:', JSON.stringify(rc.map(x => [x.code, x.origem, x.origemRef])));
  if (rc.length !== 1 || rc[0].code !== 'EB103' || rc[0].origem !== 'recebimento' || rc[0].origemRef !== cg2.id || rc[0].status !== 'aberta') errs.push('⑦ rechecagem origem recebimento');
  /* ⑧ */
  const fb = await pg.$('.rec-cab-bts [data-act="cg-fechar"]'); if (!fb || !(await fb.isDisabled())) errs.push('⑧ close blocked while 1 of 2 boxes');
  await pg.click('[data-act="cg-caixas"]'); await pg.fill('#cxEnv', '1'); await pg.click('[data-act="cg-caixas-salvar"]'); await pg.waitForTimeout(300);
  await pg.click('.rec-cab-bts [data-act="cg-fechar"]'); await sim(pg); await pg.waitForSelector('.rec-tbl', { timeout: 5000 }).catch(() => errs.push('⑧ back to list after closing'));
  let c8 = await doc(pg, 'cargas', cg2.id); log('⑧ closed:', c8.status, c8.fechadoPor); if (c8.status !== 'fechada' || !c8.fechadoPor) errs.push('⑧ closed by');
  await pg.click('tr.rec-l[data-rec="' + cg2.id + '"] [data-act="rec-reabrir"]'); await sim(pg);
  c8 = await doc(pg, 'cargas', cg2.id); if (c8.status !== 'recebida' || c8.fechadoPor) errs.push('⑧ reopened');
  await pg.close();
  /* ⑨ */
  pg = await mk('brandon@x.com');
  await go(pg, '#/recebimento'); await pg.waitForSelector('.rec-tbl', { timeout: 10000 }).catch(() => errs.push('⑨ salesman sees the list'));
  if (await pg.$('[data-act="cg-nova"]') || await pg.$('[data-rec-marcar]') || await pg.$('[data-act="cg-fechar"]')) errs.push('⑨ salesman: no new / select / close');
  await go(pg, '#/recebimento/CG1'); await pg.waitForSelector('.rec-cabeca', { timeout: 6000 });
  if (await pg.$('#rBusca') || await pg.$('[data-receb-edit]') || await pg.$('[data-rmarcar]')) errs.push('⑨ salesman: REC page read-only');
  await pg.close();
  /* ⑩ */
  const ctx2 = await br.newContext({ viewport: { width: 430, height: 900 }, isMobile: true });
  pg = await mk('luke@theonefl.com', ctx2);
  await go(pg, '#/recebimento'); await pg.waitForSelector('.rec-tbl td.rec-nums', { timeout: 10000 });
  const vis = await pg.$eval('.rec-tbl tr.rec-l td.rec-nums', x => getComputedStyle(x).display !== 'none'); if (!vis) errs.push('⑩ mobile shows the counts cell');
  await go(pg, '#/recebimento/CG1'); await pg.waitForSelector('.rec-cabeca', { timeout: 6000 }).catch(() => errs.push('⑩ REC page on phone'));
  await pg.close();
  log(errs.length ? 'FAIL' : 'PASS'); if (errs.length) console.log(errs);
  await br.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})();
