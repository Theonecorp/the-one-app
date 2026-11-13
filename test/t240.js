/* v0.8.201 시험 — 🔁 보충이 필요한 상품(#/repor) · 🔎 재확인할 상품(#/recheca): 옛 WMS 의 Produtos para repor · Produtos para conferir — 요청 목록 · 맡기(한 사람만) · 놓기 · 취소 · 출고/입고가 요청을 닫음 · 요청 만들기 · 세어서 맞추기 · 세일즈맨 보기만
 *   ① 관리자: 묶음 메뉴 재고 = 재고 · 보충 · 재확인 · 라벨 … (옛 메뉴 순서) · 칸 숫자(열린 요청 3 · 3)
 *   ② 보충 목록: 오래된 요청 먼저 (EB103 · AHG100 · GM104) · 맡은 줄은 "Iniciado por Maria Costa" + 제안 수량(지난달 판매 — 인보이스 줄)
 *   ③ 시작 → reposicao iniciada · iniciadaPor 나 · 제안 창(지난달 판매 3 · 취소된 인보이스는 빼고)
 *   ④ 다른 직원: 화면은 아직 "시작" 인데 그 사이 다른 사람이 맡음 → 거절 창(누가 맡았는지) · 문서 그대로 · 다시 그리면 "Iniciado por" · 남의 것은 놓기 단추 없음
 *   ⑤ 놓기 → aberta (맡은 사람 비움) · 취소(이유) → cancelada
 *   ⑥ 📦 재고 출고(AHG100) → 그 요청 resolvida (baixa) · 입고(EB103) → resolvida (entrada) — 같은 batch
 *   ⑦ 요청 만들기: 📦 재고 줄을 열어 "Pedir reposição" (GM104) · 📦 상품 서랍(AHG100) → reposicao aberta · 확인 화면 · 서랍은 "já pedida"
 *   ⑧ 재확인 목록: 출처 REC 이면 REC-000001 링크 → #/recebimento/CG1
 *   ⑨ 라벨 없는 상품(GM104): 수량 10 · 통로 05A → 미리 보기(+2) · stockLog count +2 · 카탈로그 통로 05A · 요청 resolvida · (+ 실사 = 들어온 것 → 열린 보충 요청도 닫힘)
 *   ⑩ 라벨 상품(AHG100): 상자마다 (AAAA2222 35 → 30 · 상자 밖 4 → 새 상자) → 상자 30 · 새 라벨 4 · 재고 34 (count −1) · 창을 연 사이 다른 기기가 처리한 요청은 거절 (재고 그대로)
 *   ⑪ 세일즈맨: 두 화면 보기만 (시작 · 확인 단추 없음)
 *   ⑫ 폰(430): 보충 카드 · 걸러보기 칩(진행 중 → 1 장) · 제안 수량 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8949', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const SEED = `
    const rows = JSON.parse(s.catalog[1].j); const loc = { AHG100: '7A', EB103: '12B', GM104: '' };
    rows.forEach(r => { if (loc[r[0]] != null) { while (r.length < 12) r.push(r.length === 10 ? 0 : ''); r[11] = loc[r[0]]; } }); s.catalog[1].j = JSON.stringify(rows);
    s.users.push({ id: 'pick@theonefl.com', email: 'pick@theonefl.com', name: 'Maria Costa', role: 'manager', job: 'pick', active: true });
    s.stock = [{ id: 'AHG100', code: 'AHG100', qty: 40, at: '2026-11-01T00:00:00Z' }, { id: 'EB103', code: 'EB103', qty: 15, at: '2026-11-01T00:00:00Z' }, { id: 'GM104', code: 'GM104', qty: 8, at: '2026-11-01T00:00:00Z' }];
    s.etiquetas = [{ id: 'AAAA2222', codigo: 'AAAA2222', code: 'AHG100', nome: 'X', barcode: '', corredor: '07A', qtdInicial: 40, qtdRestante: 40, ativa: true, criadoEm: '2026-11-01T10:00:00Z' }];
    const ago = d => new Date(Date.now() - d * 864e5).toISOString(), lm = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 15), ym = lm.getFullYear() + '-' + String(lm.getMonth() + 1).padStart(2, '0');
    s.invoices = [{ id: 'IV1', no: 'A70001', d: ym + '-15', st: '', sm: 'BRANDON', acct: '1111', lines: [{ c: 'EB103', q: 3 }, { c: 'AHG100', q: 7 }] }, { id: 'IV2', no: 'A70002', d: ym + '-16', st: 'x', sm: 'BRANDON', acct: '1111', lines: [{ c: 'EB103', q: 50 }] }];
    s.reposicao = [
      { id: 'R1', code: 'AHG100', tipo: 'acabando', qtd: 40, por: 'pick@theonefl.com', porNome: 'Maria Costa', em: ago(2), status: 'aberta', iniciadaPor: '', iniciadaPorNome: '', iniciadaEm: '' },
      { id: 'R2', code: 'EB103', tipo: 'acabando', qtd: 15, por: 'pick@theonefl.com', porNome: 'Maria Costa', em: ago(3), status: 'aberta', iniciadaPor: '', iniciadaPorNome: '', iniciadaEm: '' },
      { id: 'R3', code: 'GM104', tipo: 'acabando', qtd: 8, por: 'pick@theonefl.com', porNome: 'Maria Costa', em: ago(1), status: 'iniciada', iniciadaPor: 'pick@theonefl.com', iniciadaPorNome: 'Maria Costa', iniciadaEm: ago(0.5) },
      { id: 'R0', code: 'EB103', tipo: 'acabando', qtd: 1, por: 'x', porNome: 'X', em: ago(30), status: 'resolvida' }];
    s.cargas = [{ id: 'CG1', numero: 'REC-000001', fornecedor: '#CHINA2', status: 'recebida', dataChegada: ago(1).slice(0, 10), criadoEm: ago(1) }];
    s.rechecagem = [
      { id: 'K1', code: 'GM104', motivo: 'saldo', origem: 'produtos', origemRef: '', por: 'pick@theonefl.com', porNome: 'Maria Costa', em: ago(2), status: 'aberta' },
      { id: 'K2', code: 'AHG100', motivo: 'nao_encontrado', origem: 'recebimento', origemRef: 'CG1', por: 'luke@theonefl.com', porNome: 'Luke', em: ago(1), status: 'aberta' },
      { id: 'K3', code: 'AHG105', motivo: 'misturado', origem: 'estoque', origemRef: '', por: 'luke@theonefl.com', porNome: 'Luke', em: ago(0.5), status: 'aberta' },
      { id: 'K0', code: 'EB103', motivo: 'saldo', origem: 'produtos', por: 'x', porNome: 'X', em: ago(9), status: 'resolvida' }];`;
  const ctx = await br.newContext({ viewport: { width: 1280, height: 1000 } });
  const mk = async (email, c) => { const pg = await (c || ctx).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: o.name }; window.__AFTER_SEED__ = new Function('s', o.seed); try { localStorage.setItem('theone.lang', 'pt'); } catch (e) {} }, { email, name: email === 'pick@theonefl.com' ? 'Maria Costa' : 'Luke', seed: SEED }); await pg.goto('http://127.0.0.1:8949/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  const store = (pg, col) => pg.evaluate(c => Object.values(window.__MOCK_STORE__[c] || {}), col);
  const doc = (pg, col, id) => pg.evaluate(a => (window.__MOCK_STORE__[a[0]] || {})[a[1]] || null, [col, id]);
  const go = (pg, h) => pg.evaluate(x => { location.hash = x; }, h);
  const sim = async pg => { await pg.waitForSelector('.es-mw #esPergSim', { timeout: 4000 }); await pg.click('.es-mw #esPergSim'); await pg.waitForTimeout(500); };
  const lista = pg => pg.$$eval('.rp-ag .rp-item', L => L.map(r => r.dataset.rp));
  /* ① */
  let pg = await mk('luke@theonefl.com');
  await go(pg, '#/hub/wh'); await pg.waitForSelector('[data-hub]', { timeout: 8000 });
  const hubs = await pg.$$eval('[data-hub]', b => b.map(x => x.dataset.hub)); log('① hub:', hubs.join(' '));
  const ie = hubs.indexOf('estoque'); if (hubs[ie + 1] !== 'repor' || hubs[ie + 2] !== 'recheca') errs.push('① wh hub: estoque · repor · recheca (old sidebar order)');
  await pg.waitForSelector('[data-hub="repor"] .hbadge', { timeout: 4000 }).catch(() => errs.push('① repor tile badge'));
  const bd = await pg.$$eval('.hbadge', L => L.map(x => x.parentElement.dataset.hub + '=' + x.textContent)); log('① badges:', bd.join(' ')); if (bd.join() !== 'repor=3,recheca=3') errs.push('① badges repor 3 · recheca 3 :: ' + bd);
  /* ② */
  await go(pg, '#/repor'); await pg.waitForSelector('.sb.rp-raiz .rp-ag .rp-item', { timeout: 10000 }).catch(() => errs.push('② repor list'));
  let L = await lista(pg); log('② order:', L.join(' ')); if (L.join() !== 'R2,R1,R3') errs.push('② oldest first R2 · R1 · R3 :: ' + L);
  const ini3 = await pg.textContent('[data-rp="R3"] .rp-iniciado').catch(() => ''); log('② R3:', ini3); if (!/Iniciado por Maria Costa/.test(ini3)) errs.push('② R3 "Iniciado por Maria Costa"');
  if (await pg.$('[data-rp="R3"] [data-act="rp-iniciar"]')) errs.push('② started row has no Iniciar');
  await pg.waitForSelector('[data-rp="R3"] .rp-sug-linha', { timeout: 6000 }).catch(() => errs.push('② suggested qty on the started row'));
  const sg3 = await pg.textContent('[data-rp="R3"] .rp-sug-linha').catch(() => ''); log('② R3 sug:', sg3); if (!/Sugerido: 0/.test(sg3)) errs.push('② GM104 sold 0 last month :: ' + sg3);
  if (!/vazio|acabando/i.test(await pg.textContent('[data-rp="R2"] .badge'))) errs.push('② type badge');
  /* ③ */
  await pg.click('[data-rp="R2"] [data-act="rp-iniciar"]'); await pg.waitForSelector('.es-mw .rp-sug-n', { timeout: 6000 }).catch(() => errs.push('③ suggestion dialog'));
  const sn = await pg.textContent('.es-mw .rp-sug-n').catch(() => ''); log('③ suggestion:', sn.trim()); if (!/^3\b/.test(sn.trim())) errs.push('③ EB103 sold 3 last month (voided invoice ignored) :: ' + sn);
  await pg.click('#rpEntendi'); await pg.waitForTimeout(300);
  let r2 = await doc(pg, 'reposicao', 'R2'); if (r2.status !== 'iniciada' || r2.iniciadaPor !== 'luke@theonefl.com' || !r2.iniciadaEm) errs.push('③ R2 started by me :: ' + JSON.stringify(r2));
  if (!/Iniciado por Luke/.test(await pg.textContent('[data-rp="R2"] .rp-acao'))) errs.push('③ R2 shows Iniciado por');
  /* ⑤ */
  await pg.click('[data-rp="R2"] [data-act="rp-liberar"]'); await sim(pg);
  r2 = await doc(pg, 'reposicao', 'R2'); log('⑤ released:', r2.status, JSON.stringify(r2.iniciadaPor)); if (r2.status !== 'aberta' || r2.iniciadaPor) errs.push('⑤ released → aberta');
  await pg.click('[data-rp="R3"] [data-act="rp-cancelar"]'); await pg.waitForSelector('.es-mw #esPergCampo'); await pg.fill('.es-mw #esPergCampo', 'não precisava'); await sim(pg);
  const r3 = await doc(pg, 'reposicao', 'R3'); log('⑤ cancelled:', r3.status, r3.canceladaMotivo); if (r3.status !== 'cancelada' || r3.canceladaMotivo !== 'não precisava' || !r3.canceladaPor) errs.push('⑤ cancelled with reason');
  L = await lista(pg); if (L.join() !== 'R2,R1') errs.push('⑤ list without cancelled :: ' + L);
  /* ⑥ 출고 → 닫힘 */
  await go(pg, '#/estoque'); await pg.waitForSelector('[data-modo="saida"]', { timeout: 10000 });
  await pg.click('[data-modo="saida"]'); await pg.waitForSelector('#esBusca'); await pg.fill('#esBusca', 'AHG100'); await pg.keyboard.press('Enter');
  await pg.waitForSelector('#esQtd:not([disabled])'); await pg.fill('#esQtd', '5'); await pg.click('[data-act="es-saida"]');
  await pg.waitForSelector('.es-mw #esRepOk', { timeout: 4000 }).then(() => pg.click('.es-mw #esRepOk')).catch(() => {}); await pg.waitForTimeout(700);
  const r1 = await doc(pg, 'reposicao', 'R1'); log('⑥ exit:', (await doc(pg, 'stock', 'AHG100')).qty, r1.status, r1.resolvidaComo); if (r1.status !== 'resolvida' || r1.resolvidaComo !== 'baixa' || !r1.resolvidaEm) errs.push('⑥ exit resolves R1');
  if ((await doc(pg, 'reposicao', 'R0')).resolvidaComo) errs.push('⑥ old resolved request untouched');
  await pg.click('[data-modo="entrada"]'); await pg.waitForSelector('#esBusca'); await pg.fill('#esBusca', 'EB103'); await pg.keyboard.press('Enter');
  await pg.waitForSelector('#esQtd:not([disabled])'); await pg.fill('#esQtd', '3'); await pg.click('[data-act="es-entrada"]');
  await pg.waitForSelector('.es-mw [data-act="etq-tam-fechar"]', { timeout: 5000 }).then(() => pg.click('.es-mw [data-act="etq-tam-fechar"]')).catch(() => errs.push('⑥ entry receipt')); await pg.waitForTimeout(300);
  r2 = await doc(pg, 'reposicao', 'R2'); log('⑥ entry:', r2.status, r2.resolvidaComo); if (r2.status !== 'resolvida' || r2.resolvidaComo !== 'entrada') errs.push('⑥ entry resolves R2');
  /* ⑦ 요청 만들기 — 재고 줄 */
  await go(pg, '#/estoque/' + encodeURIComponent('p/GM104')); await pg.waitForSelector('[data-toggle-caixas="GM104"]', { timeout: 8000 });
  await pg.click('[data-toggle-caixas="GM104"] td.principal'); await pg.waitForSelector('.rp-cs [data-act="cs-repor"]', { timeout: 5000 }).catch(() => errs.push('⑦ Estoque row: Pedir reposição card'));
  await pg.click('.rp-cs [data-act="cs-repor"]'); await pg.waitForSelector('.es-mw [data-rep-tipo="acabando"]');
  if (await pg.$('.es-mw [data-rep-tipo="vazio"]')) errs.push('⑦ "vazio" only with zero stock');
  await pg.click('.es-mw [data-rep-tipo="acabando"]'); await pg.waitForSelector('#reporOk.show', { timeout: 4000 }).catch(() => errs.push('⑦ confirmation overlay'));
  let novos = (await store(pg, 'reposicao')).filter(x => x.code === 'GM104' && x.status === 'aberta'); log('⑦ estoque request:', JSON.stringify(novos.map(x => [x.id, x.tipo, x.por])));
  if (novos.length !== 1 || novos[0].tipo !== 'acabando' || novos[0].por !== 'luke@theonefl.com') errs.push('⑦ new reposicao from Estoque');
  await pg.waitForTimeout(2600);
  await pg.waitForSelector('.rp-cs .cs2-acao.ja', { timeout: 4000 }).catch(() => errs.push('⑦ Estoque row shows "já pedida"'));
  /* 상품 서랍 */
  await go(pg, '#/produtos'); await pg.waitForSelector('#fBusca', { timeout: 10000 }); await pg.fill('#fBusca', 'AHG100'); await pg.waitForTimeout(400);
  await pg.click('#pmRes tr.pm-l[data-abrir="AHG100"] td.principal'); await pg.waitForSelector('.pm-dw .rp-cs [data-act="cs-repor"]', { timeout: 5000 }).catch(() => errs.push('⑦ Produtos drawer: Pedir reposição'));
  await pg.click('.pm-dw .rp-cs [data-act="cs-repor"]'); await pg.waitForSelector('.es-mw [data-rep-tipo="acabando"]'); await pg.click('.es-mw [data-rep-tipo="acabando"]'); await pg.waitForTimeout(600);
  novos = (await store(pg, 'reposicao')).filter(x => x.code === 'AHG100' && x.status === 'aberta'); if (novos.length !== 1) errs.push('⑦ new reposicao from Produtos');
  await pg.waitForSelector('.pm-dw .rp-cs .cs2-acao.ja', { timeout: 4000 }).catch(() => errs.push('⑦ drawer shows "já pedida"'));
  await pg.evaluate(() => { const o = document.getElementById('reporOk'); if (o) o.remove(); document.querySelectorAll('.pm-dw').forEach(x => x.remove()); });
  /* ⑧ */
  await go(pg, '#/recheca'); await pg.waitForSelector('.sb.rp-raiz .tbl-recheca tr[data-recheca-linha]', { timeout: 10000 }).catch(() => errs.push('⑧ recheca list'));
  const rl = await pg.$$eval('tr[data-recheca-linha]', L => L.map(r => r.dataset.rechecaLinha)); log('⑧ rows:', rl.join(' ')); if (rl.join() !== 'K1,K2,K3') errs.push('⑧ open rows K1 · K2 · K3 (oldest first) :: ' + rl);
  const lk = await pg.$eval('tr[data-recheca-linha="K2"] .rc-de a', a => [a.textContent, a.getAttribute('href')]).catch(() => []); log('⑧ REC link:', lk.join(' ')); if (lk[0] !== 'REC-000001' || lk[1] !== '#/recebimento/CG1') errs.push('⑧ REC origin link');
  if (!/Produtos recebidos/.test(await pg.textContent('tr[data-recheca-linha="K2"] .rc-de'))) errs.push('⑧ origin label');
  await pg.click('tr[data-recheca-linha="K2"] .rc-de a'); await pg.waitForSelector('.sb.rc-raiz .rec-cabeca h1', { timeout: 8000 }).catch(() => errs.push('⑧ link opens the REC'));
  /* ⑨ */
  await go(pg, '#/recheca'); await pg.waitForSelector('tr[data-recheca-linha="K1"] [data-act="rc-conferir-linha"]', { timeout: 8000 });
  await pg.click('tr[data-recheca-linha="K1"] [data-act="rc-conferir-linha"]'); await pg.waitForSelector('.es-mw #rcCfQtd', { timeout: 5000 });
  if (await pg.$('.es-mw [data-rc-cx]')) errs.push('⑨ GM104 has no boxes → simple dialog');
  await pg.fill('.es-mw #rcCfQtd', '10'); await pg.selectOption('.es-mw #rcCfCorr', '05A');
  const pv9 = await pg.textContent('.es-mw #rcCfPrev'); log('⑨ preview:', pv9); if (!/\+2/.test(pv9) || !/05A/.test(pv9)) errs.push('⑨ preview shows +2 and the aisle');
  await pg.click('.es-mw #esPergSim'); await pg.waitForTimeout(900);
  const k1 = await doc(pg, 'rechecagem', 'K1'), s9 = (await doc(pg, 'stock', 'GM104')).qty, l9 = (await store(pg, 'stockLog')).filter(x => x.code === 'GM104');
  log('⑨', s9, JSON.stringify(l9.map(x => [x.kind, x.delta, x.ref])), k1.status, k1.contado, k1.ajuste, k1.resultado);
  if (s9 !== 10 || !l9.some(x => x.kind === 'count' && x.delta === 2 && x.ref === 'K1')) errs.push('⑨ stock count +2');
  if (k1.status !== 'resolvida' || k1.contado !== 10 || k1.ajuste !== 2 || k1.resultado !== 'ajustado' || k1.corredorDepois !== '05A') errs.push('⑨ request resolved');
  const loc9 = await pg.evaluate(() => { const C = window.__MOCK_STORE__.catalog, m = C.meta, out = []; for (let i = 0; i < (m.chunks || 1); i++) if (C['c' + i]) JSON.parse(C['c' + i].j).forEach(r => out.push(r)); return (out.find(r => r[0] === 'GM104') || [])[11]; });
  log('⑨ loc:', loc9); if (!/^0?5A/.test(String(loc9 || ''))) errs.push('⑨ catalog aisle 05A :: ' + loc9);
  if ((await store(pg, 'reposicao')).some(x => x.code === 'GM104' && x.status === 'aberta')) errs.push('⑨ +count closes the open restock request');
  /* ⑩ */
  await pg.click('tr[data-recheca-linha="K2"] [data-act="rc-conferir-linha"]'); await pg.waitForSelector('.es-mw [data-rc-cx="AAAA2222"]', { timeout: 5000 }).catch(() => errs.push('⑩ box-by-box dialog'));
  await pg.fill('.es-mw [data-rc-cx="AAAA2222"]', '30'); await pg.fill('.es-mw #rcCfNova', '4');
  const pv10 = await pg.textContent('.es-mw #rcCfPrev'); log('⑩ preview:', pv10); if (!/AAAA2222/.test(pv10) || !/35/.test(pv10) || !/34/.test(pv10)) errs.push('⑩ preview box 35 → 30 · stock 35 → 34');
  await pg.click('.es-mw #esPergSim'); await pg.waitForTimeout(900);
  await pg.waitForSelector('.es-mw .etq-tam-ops', { timeout: 4000 }).then(() => pg.click('.es-mw [data-act="fechar-modal"].btn')).catch(() => errs.push('⑩ new label print dialog'));
  const a10 = await doc(pg, 'etiquetas', 'AAAA2222'), e10 = (await store(pg, 'etiquetas')).filter(x => x.code === 'AHG100' && x.id !== 'AAAA2222'), s10 = (await doc(pg, 'stock', 'AHG100')).qty, k2 = await doc(pg, 'rechecagem', 'K2');
  const l10 = (await store(pg, 'stockLog')).filter(x => x.code === 'AHG100' && x.kind === 'count');
  log('⑩', a10.qtdRestante, JSON.stringify(e10.map(x => [x.id, x.qtdRestante])), s10, JSON.stringify(l10.map(x => x.delta)), k2.status, k2.caixasAlteradas, k2.novaEtiqueta);
  if (a10.qtdRestante !== 30 || e10.length !== 1 || e10[0].qtdRestante !== 4 || s10 !== 34 || l10.length !== 1 || l10[0].delta !== -1) errs.push('⑩ boxes 30 + new 4 · stock 34 · count −1');
  if (k2.status !== 'resolvida' || k2.caixasAlteradas !== 1 || k2.novaEtiqueta !== (e10[0] || {}).id) errs.push('⑩ request resolved with box info');
  /* ⑩ 창을 연 사이 다른 기기에서 이미 처리됨 → 거절 · 재고 그대로 */
  await pg.click('tr[data-recheca-linha="K3"] [data-act="rc-conferir-linha"]'); await pg.waitForSelector('.es-mw #rcCfQtd', { timeout: 5000 });
  await pg.fill('.es-mw #rcCfQtd', '5'); await pg.evaluate(() => Object.assign(window.__MOCK_STORE__.rechecagem.K3, { status: 'resolvida', resolvidaPor: 'outro@x.com' }));
  const n10 = (await store(pg, 'stockLog')).length; await pg.click('.es-mw #esPergSim'); await pg.waitForTimeout(800);
  if ((await store(pg, 'stockLog')).length !== n10 || (await doc(pg, 'stock', 'AHG105')) || (await doc(pg, 'rechecagem', 'K3')).resolvidaPor !== 'outro@x.com') errs.push('⑩ already resolved elsewhere → refused, stock untouched');
  if ((await pg.$$('tr[data-recheca-linha]')).length) errs.push('⑩ list empty after all');
  await pg.close();
  /* ④ 다른 직원 — 한 사람만 맡음 */
  pg = await mk('pick@theonefl.com');
  await go(pg, '#/repor'); await pg.waitForSelector('[data-rp="R1"] [data-act="rp-iniciar"]', { timeout: 10000 });
  if (await pg.$('[data-rp="R3"] [data-act="rp-liberar"]') === null) errs.push('④ owner (Maria) can release R3');
  await pg.evaluate(() => { Object.assign(window.__MOCK_STORE__.reposicao.R1, { status: 'iniciada', iniciadaPor: 'pedro@theonefl.com', iniciadaPorNome: 'Pedro Lima', iniciadaEm: new Date().toISOString() }); document.querySelector('[data-rp="R1"] [data-act="rp-iniciar"]').click(); });
  await pg.waitForSelector('.es-mw #rpEntendi', { timeout: 5000 }).catch(() => errs.push('④ refusal dialog'));
  const rf = await pg.textContent('.es-mw .modal-body').catch(() => ''); log('④ refused:', rf); if (!/Pedro Lima/.test(rf)) errs.push('④ tells who got it');
  const r1b = await doc(pg, 'reposicao', 'R1'); if (r1b.iniciadaPor !== 'pedro@theonefl.com') errs.push('④ doc keeps the first owner');
  await pg.click('.es-mw #rpEntendi'); await pg.waitForSelector('[data-rp="R1"] .rp-iniciado', { timeout: 4000 }).catch(() => errs.push('④ row now shows Iniciado por'));
  if (!/Pedro Lima/.test(await pg.textContent('[data-rp="R1"] .rp-iniciado').catch(() => ''))) errs.push('④ Iniciado por Pedro Lima');
  if (await pg.$('[data-rp="R1"] [data-act="rp-liberar"]')) errs.push('④ cannot release someone else\'s (not manager)');
  await pg.close();
  /* ⑪ */
  pg = await mk('brandon@x.com');
  await go(pg, '#/repor'); await pg.waitForSelector('.rp-ag .rp-item', { timeout: 10000 }).catch(() => errs.push('⑪ salesman sees the list'));
  if (await pg.$('[data-act="rp-iniciar"]') || await pg.$('[data-act="rp-cancelar"]') || await pg.$('[data-act="rp-liberar"]')) errs.push('⑪ salesman: no Iniciar / Cancelar / Liberar');
  await go(pg, '#/recheca'); await pg.waitForSelector('tr[data-recheca-linha]', { timeout: 10000 }).catch(() => errs.push('⑪ salesman sees recheca'));
  if (await pg.$('[data-act="rc-conferir-linha"]')) errs.push('⑪ salesman: no Conferido');
  await pg.close();
  /* ⑫ */
  const ctx2 = await br.newContext({ viewport: { width: 430, height: 900 }, isMobile: true });
  pg = await mk('luke@theonefl.com', ctx2);
  await go(pg, '#/repor'); await pg.waitForSelector('.rpm-card', { timeout: 10000 }).catch(() => errs.push('⑫ phone cards'));
  if ((await pg.$$('.rpm-card')).length !== 3) errs.push('⑫ 3 cards');
  await pg.waitForFunction(() => !Array.from(document.querySelectorAll('.rpm-qtd b')).some(b => b.textContent.trim() === '…'), null, { timeout: 6000 }).catch(() => errs.push('⑫ suggested qty filled'));
  const q12 = await pg.textContent('.rpm-card[data-rp="R1"] .rpm-qtd b'); log('⑫ AHG100 sug:', q12); if (!/^7/.test(q12.trim())) errs.push('⑫ AHG100 suggested 7');
  await pg.click('[data-act="rpm-filtro-bt"]'); await pg.click('[data-rpm-f="em"]'); await pg.waitForTimeout(200);
  const c12 = await pg.$$eval('.rpm-card', L => L.map(x => x.dataset.rp)); if (c12.join() !== 'R3') errs.push('⑫ chip "em andamento" → R3 :: ' + c12);
  await pg.click('[data-rpm-f=""]'); await pg.click('[data-act="rpm-busca-bt"]'); await pg.fill('#rpmBusca', 'eb10'); await pg.waitForTimeout(200);
  const b12 = await pg.$$eval('.rpm-card', L => L.map(x => x.dataset.rp)); if (b12.join() !== 'R2') errs.push('⑫ search eb10 → R2 :: ' + b12);
  await go(pg, '#/recheca'); await pg.waitForSelector('tr[data-recheca-linha]', { timeout: 8000 });
  const lbl = await pg.$eval('tr[data-recheca-linha="K1"] td[data-l]', td => getComputedStyle(td, '::before').content).catch(() => ''); if (!/Corredor/.test(lbl)) errs.push('⑫ mobile card labels (data-l)');
  await pg.close();
  log(errs.length ? 'FAIL' : 'PASS'); if (errs.length) console.log(errs);
  await br.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})();
