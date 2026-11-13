/* v0.8.199 시험 — 📦 상품(#/produtos): 옛 WMS 의 Produtos — 숫자 칸 걸러보기 · 검색 · 서랍(재고 · 상자) · 수정(카탈로그) · 빈 상자 · 확인 요청 · 재고 조정 · 창고는 위치만 · 세일즈맨은 보기만 · 삭제는 관리자
 *   ① 관리자: 묶음 메뉴 재고에 📦 상품(produtos) — 옛 items 칸은 없음 (#/items 는 그대로 열림)
 *   ② 숫자 칸 "Estoque baixo" 누르면 상태 baixo 만 (EB103 15 < 기준 20) · 관리자는 원가 열이 보임
 *   ③ 검색 EB103 → 첫 줄 EB103 · ④ AHG100 줄 → 서랍: 재고 40 · 상자 AAAA2222
 *   ⑤ 수정 창에서 설명 · 가격 → 카탈로그 줄이 바뀜 (editCatalog) · 원가 → prodCusto · 배송 무게 → prodExtra
 *   ⑥ 상자 다 씀: 재고 0(AHG101) → stock.vazia true + stockLog 0 줄 · 재고 있는 AHG100 은 거절
 *   ⑦ 확인 요청: EB103 선택 → 선택 막대 → saldo → rechecagem 1 (aberta · origem produtos) · 다시 보내도 1
 *   ⑧ 재고 조정: EB103 +5 (상자 없음 → 새 상자) → stock 20 · stockLog recv +5 · AHG100 −3 → 상자 AAAA2222 37 · stock 37
 *   ⑨ 사용 중지 → 카탈로그 숨김(h) · 삭제: 재고 0 인 GM104 는 카탈로그에서 빠지고, 재고 있는 AHG100 은 거절
 *   ⑩ 등록 + 입고 → 새 상품이 카탈로그에 · #/estoque/entrada/<코드> 로 그 상품이 골라진 입고 화면
 *   ⑪ 창고 매니저(whmgr): 수정 창은 통로만 (가격 · 설명 잠김) → 위치만 바뀜 · 등록 단추 없음
 *   ⑫ 세일즈맨: 보기만 (선택 칸 · 빈 상자 단추 · 등록 · 수정 없음 · 원가 열 없음)
 *   ⑬ 폰(430): 분류 카드 → 상품 카드 (사진 · 통로 · 재고) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8947', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const SEED = `
    const rows = JSON.parse(s.catalog[1].j); const loc = { AHG100: '7A', AHG101: '07A-3', EB103: '12B', GM104: '12B' };
    rows.forEach(r => { if (loc[r[0]]) { while (r.length < 12) r.push(r.length === 10 ? 0 : ''); r[11] = loc[r[0]]; } }); s.catalog[1].j = JSON.stringify(rows);
    s.users.push({ id: 'wm@theonefl.com', email: 'wm@theonefl.com', name: 'WM', role: 'manager', job: 'whmgr', active: true });
    s.stock = [{ id: 'AHG100', code: 'AHG100', qty: 40, at: '2026-11-01T00:00:00Z' }, { id: 'AHG101', code: 'AHG101', qty: 0, at: '2026-11-01T00:00:00Z' }, { id: 'EB103', code: 'EB103', qty: 15, min: 20, at: '2026-11-01T00:00:00Z' }];
    s.etiquetas = [{ id: 'AAAA2222', codigo: 'AAAA2222', code: 'AHG100', nome: 'X', barcode: '', corredor: '07A', qtdInicial: 40, qtdRestante: 40, ativa: true, criadoEm: '2026-11-01T10:00:00Z' }];
    s.prodCusto = [{ id: 'AHG100', custo: 1.2 }];`;
  const ctx = await br.newContext({ viewport: { width: 1280, height: 1000 } });
  const mk = async (email, c) => { const pg = await (c || ctx).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed: SEED }); await pg.goto('http://127.0.0.1:8947/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  const store = (pg, col) => pg.evaluate(c => Object.values(window.__MOCK_STORE__[c] || {}), col);
  const go = (pg, h) => pg.evaluate(x => { location.hash = x; }, h);
  const rows = pg => pg.evaluate(() => { const C = window.__MOCK_STORE__.catalog, m = C.meta, out = []; for (let i = 0; i < (m.chunks || 1); i++) if (C['c' + i]) JSON.parse(C['c' + i].j).forEach(r => out.push(r)); return out; });
  const row = async (pg, c) => (await rows(pg)).find(r => r[0] === c);
  const busca = async (pg, q) => { await pg.fill('#fBusca', q); await pg.waitForTimeout(400); };
  const linhas = pg => pg.$$eval('#pmRes tr.pm-l', L => L.map(r => r.dataset.abrir));
  const sim = async pg => { await pg.waitForSelector('.es-mw #esPergSim', { timeout: 4000 }); await pg.click('.es-mw #esPergSim'); await pg.waitForTimeout(500); };
  const abrir = async (pg, c) => { await busca(pg, c); await pg.click('#pmRes tr.pm-l[data-abrir="' + c + '"] td.principal'); await pg.waitForSelector('.pm-dw .drawer.show', { timeout: 4000 }); };
  const fechar = async pg => { if (await pg.$('.pm-dw')) { await pg.click('.pm-dw [data-act="fechar-drawer"].x'); await pg.waitForTimeout(150); } };
  /* ① */
  let pg = await mk('luke@theonefl.com');
  await go(pg, '#/hub/wh'); await pg.waitForSelector('[data-hub]', { timeout: 8000 });
  const hubs = await pg.$$eval('[data-hub]', b => b.map(x => x.dataset.hub)); log('① hub:', hubs.join(' '));
  if (!hubs.includes('produtos') || hubs.includes('items')) errs.push('① wh hub: produtos instead of items (v0.8.215 중복 정리)');
  /* ② */
  await go(pg, '#/produtos'); await pg.waitForSelector('.sb .pm-tiles', { timeout: 10000 }).catch(() => errs.push('② tiles'));
  await pg.waitForSelector('#pmRes tr.pm-l', { timeout: 6000 });
  if (!(await pg.$('th[data-ord="custo"]'))) errs.push('② admin sees cost column');
  await pg.click('[data-tile-sit="baixo"]'); await pg.waitForTimeout(300);
  let L = await linhas(pg); log('② baixo:', L.join(' ')); if (L.length !== 1 || L[0] !== 'EB103') errs.push('② low-stock tile → only EB103 :: ' + L);
  await pg.click('[data-act="limpar-filtros"]'); await pg.waitForTimeout(200);
  /* ③ */
  await busca(pg, 'EB103'); L = await linhas(pg); log('③ search:', L.slice(0, 3).join(' '), L.length); if (L[0] !== 'EB103') errs.push('③ search EB103 first');
  /* ④ */
  await abrir(pg, 'AHG100');
  const hero = await pg.textContent('.pm-dw .pv-n'); if (!/^40/.test(hero.trim())) errs.push('④ drawer stock 40 :: ' + hero);
  await pg.waitForSelector('.pm-dw .caixa-item[data-caixa="AAAA2222"]', { timeout: 4000 }).catch(() => errs.push('④ drawer shows box AAAA2222'));
  const custoTxt = await pg.textContent('.pm-dw .dr-body'); if (!/\$1\.20/.test(custoTxt)) errs.push('④ admin sees cost $1.20');
  /* ⑤ */
  await pg.click('.pm-dw [data-act="editar-produto"]'); await pg.waitForSelector('.es-mw #pDesc');
  await pg.fill('.es-mw #pDesc', 'NOVA DESCRICAO'); await pg.fill('.es-mw #pPreco', '9.75'); await pg.fill('.es-mw #pCusto', '2.5'); await pg.fill('.es-mw #pEnvP', '1.5');
  await pg.waitForFunction(() => { const x = document.querySelector('.es-mw #pCusto'); return x && x.value === '2.5'; }, null, { timeout: 3000 }).catch(() => errs.push('⑤ cost field keeps 2.5 before saving :: ' + (document.querySelector ? '' : '')));
  await pg.click('.es-mw #pSalvar'); await pg.waitForFunction(() => window.__MOCK_STORE__.prodCusto && window.__MOCK_STORE__.prodCusto.AHG100 && window.__MOCK_STORE__.prodCusto.AHG100.custo === 2.5, null, { timeout: 4000 }).catch(() => {}); await pg.waitForTimeout(600);
  let r5 = await row(pg, 'AHG100'); log('⑤ row:', JSON.stringify(r5 && r5.slice(0, 13)));
  if (!r5 || r5[1] !== 'NOVA DESCRICAO' || r5[2] !== 9.75 || r5[11] !== '7A') errs.push('⑤ catalog row updated (desc · price · loc kept)');
  const cu = await pg.evaluate(() => window.__MOCK_STORE__.prodCusto.AHG100), ex = await pg.evaluate(() => (window.__MOCK_STORE__.prodExtra || {}).AHG100);
  if (!cu || cu.custo !== 2.5) errs.push('⑤ prodCusto 2.5 :: ' + JSON.stringify(cu)); if (!ex || ex.peso !== 1.5) errs.push('⑤ prodExtra peso :: ' + JSON.stringify(ex));
  await fechar(pg);
  /* ⑥ */
  await busca(pg, 'AHG101'); await pg.click('#pmRes tr[data-abrir="AHG101"] [data-act="vazia-linha"]'); await sim(pg);
  const s6 = await pg.evaluate(() => window.__MOCK_STORE__.stock.AHG101); if (!s6 || s6.vazia !== true || s6.qty !== 0) errs.push('⑥ AHG101 vazia :: ' + JSON.stringify(s6));
  const l6 = (await store(pg, 'stockLog')).filter(x => x.code === 'AHG101'); if (l6.length !== 1 || l6[0].delta !== 0) errs.push('⑥ stockLog 0 row');
  if (!(await pg.$('#pmRes tr[data-abrir="AHG101"] .btn-vazia.on'))) errs.push('⑥ row shows empty box');
  await busca(pg, 'AHG100'); await pg.click('#pmRes tr[data-abrir="AHG100"] [data-act="vazia-linha"]'); await sim(pg);
  if ((await pg.evaluate(() => window.__MOCK_STORE__.stock.AHG100.vazia))) errs.push('⑥ AHG100 with stock must be refused');
  /* ⑦ */
  for (let k = 0; k < 2; k++) {
    await busca(pg, 'EB103'); await pg.check('#pmRes tr[data-abrir="EB103"] [data-marcar]'); await pg.waitForSelector('.bulkbar [data-act="conf-lote"]');
    await pg.click('.bulkbar [data-act="conf-lote"]'); await pg.click('.es-mw [data-rc="saldo"]'); await pg.waitForTimeout(500);
  }
  const rc = await store(pg, 'rechecagem'); log('⑦ rechecagem:', JSON.stringify(rc.map(x => [x.code, x.motivo, x.status, x.origem])));
  if (rc.length !== 1 || rc[0].code !== 'EB103' || rc[0].motivo !== 'saldo' || rc[0].status !== 'aberta' || rc[0].origem !== 'produtos' || !rc[0].por) errs.push('⑦ one open rechecagem doc');
  /* ⑧ */
  await abrir(pg, 'EB103'); await pg.click('.pm-dw [data-act="ajustar"]'); await pg.waitForSelector('.es-mw #ajQtd');
  await pg.fill('.es-mw #ajQtd', '5'); await pg.fill('.es-mw #ajMotivo', 'contagem'); await pg.click('.es-mw #ajOk');
  await pg.waitForSelector('.es-mw [data-act="etq-tam-fechar"]', { timeout: 5000 }).catch(() => errs.push('⑧ new box label dialog')); await pg.click('.es-mw [data-act="etq-tam-fechar"]').catch(() => {});
  const s8 = await pg.evaluate(() => window.__MOCK_STORE__.stock.EB103.qty), l8 = (await store(pg, 'stockLog')).filter(x => x.code === 'EB103');
  log('⑧ EB103:', s8, JSON.stringify(l8.map(x => [x.kind, x.delta, x.after]))); if (s8 !== 20 || !l8.some(x => x.delta === 5 && x.after === 20)) errs.push('⑧ EB103 +5 → 20 + stockLog');
  await fechar(pg); await abrir(pg, 'AHG100'); await pg.click('.pm-dw [data-act="ajustar"]'); await pg.waitForSelector('.es-mw #ajQtd');
  await pg.fill('.es-mw #ajQtd', '-3'); await pg.fill('.es-mw #ajMotivo', 'avaria'); await pg.click('.es-mw #ajOk'); await pg.waitForTimeout(800);
  const b8 = await pg.evaluate(() => window.__MOCK_STORE__.etiquetas.AAAA2222.qtdRestante), q8 = await pg.evaluate(() => window.__MOCK_STORE__.stock.AHG100.qty);
  if (b8 !== 37 || q8 !== 37) errs.push('⑧ AHG100 −3 through box :: ' + b8 + ' ' + q8);
  await fechar(pg);
  /* ⑨ */
  await abrir(pg, 'AHG105'); await pg.click('.pm-dw [data-act="toggle-ativo"]'); await pg.waitForTimeout(900);
  if (!(await row(pg, 'AHG105'))[10]) errs.push('⑨ deactivate → hidden');
  await fechar(pg); await abrir(pg, 'GM104'); await pg.click('.pm-dw [data-act="excluir"]'); await sim(pg); await pg.waitForTimeout(600);
  if (await row(pg, 'GM104')) errs.push('⑨ GM104 removed from catalog');
  await fechar(pg); await abrir(pg, 'AHG100'); await pg.click('.pm-dw [data-act="excluir"]'); await sim(pg);
  if (!(await row(pg, 'AHG100'))) errs.push('⑨ AHG100 (stock 37) must not be deleted');
  await fechar(pg);
  /* ⑩ */
  await pg.click('[data-act="novo-qtd"]'); await pg.waitForSelector('.es-mw #pSku');
  await pg.fill('.es-mw #pSku', 'ZZNEW1'); await pg.fill('.es-mw #pDesc', 'NEW ITEM'); await pg.fill('.es-mw #pPreco', '3'); await pg.selectOption('.es-mw #pCorredor', '05A');
  await pg.click('.es-mw #pSalvar'); await pg.waitForFunction(() => decodeURIComponent(location.hash).indexOf('#/estoque/entrada/ZZNEW1') === 0, null, { timeout: 6000 }).catch(() => errs.push('⑩ goes to stock entry'));
  const r10 = await row(pg, 'ZZNEW1'); if (!r10 || r10[11] !== '05A' || r10[2] !== 3) errs.push('⑩ new catalog row :: ' + JSON.stringify(r10));
  await pg.waitForSelector('#esQtd:not([disabled])', { timeout: 6000 }).catch(() => errs.push('⑩ entry screen with product chosen'));
  await pg.close();
  /* ⑪ */
  pg = await mk('wm@theonefl.com');
  await go(pg, '#/produtos'); await pg.waitForSelector('#pmRes tr.pm-l', { timeout: 10000 });
  if (await pg.$('[data-act="novo"]')) errs.push('⑪ whmgr has no register button');
  if (await pg.$('th[data-ord="custo"]')) errs.push('⑪ whmgr sees no cost');
  await abrir(pg, 'EB103'); await pg.click('.pm-dw [data-act="editar-produto"]'); await pg.waitForSelector('.es-mw #pCorredor');
  const dis = await pg.evaluate(() => [document.querySelector('.es-mw #pPreco').disabled, document.querySelector('.es-mw #pDesc').disabled]); if (!dis[0] || !dis[1]) errs.push('⑪ price/description locked');
  await pg.selectOption('.es-mw #pCorredor', '03B'); await pg.click('.es-mw #pSalvar'); await pg.waitForTimeout(1000);
  const r11 = await row(pg, 'EB103'); if (!r11 || r11[11] !== '03B' || r11[2] !== 3.25) errs.push('⑪ only location changed :: ' + JSON.stringify(r11 && r11.slice(0, 12)));
  await pg.close();
  /* ⑫ */
  pg = await mk('brandon@x.com');
  await go(pg, '#/produtos'); await pg.waitForSelector('#pmRes tr.pm-l', { timeout: 10000 }).catch(() => errs.push('⑫ salesman sees the list'));
  if (await pg.$('[data-marcar]') || await pg.$('[data-act="vazia-linha"]') || await pg.$('[data-act="novo"]') || await pg.$('th[data-ord="custo"]')) errs.push('⑫ salesman read-only');
  await abrir(pg, 'AHG100'); if (await pg.$('.pm-dw [data-act="editar-produto"]') || await pg.$('.pm-dw [data-act="ajustar"]')) errs.push('⑫ no edit in drawer');
  await pg.close();
  /* ⑬ */
  const ctx2 = await br.newContext({ viewport: { width: 430, height: 900 }, isMobile: true });
  pg = await mk('luke@theonefl.com', ctx2);
  await go(pg, '#/produtos'); await pg.waitForSelector('.pn-card[data-pn-cat]', { timeout: 10000 }).catch(() => errs.push('⑬ category cards'));
  await pg.click('.pn-card[data-pn-cat="Edge Control"]'); await pg.waitForSelector('.pn-prod', { timeout: 4000 }).catch(() => errs.push('⑬ product cards'));
  const pc = await pg.$$eval('.pn-prod', L => L.map(x => x.dataset.abrir)); log('⑬ cards:', pc.length, pc[0]); if (!pc.includes('EB108')) errs.push('⑬ EB108 card');
  await pg.close();
  log(errs.length ? 'FAIL' : 'PASS'); if (errs.length) console.log(errs);
  await br.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})();
