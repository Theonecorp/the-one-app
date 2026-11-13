/* v0.8.214 시험 — 🖼 Notes Display: 옛 WMS 의 Notes Display 흐름 그대로 (notasDisplay · 가게마다 카드 · 맡기 · 끝내면 Notes UPS 박스 + 6×4 라벨)
 *   ① 예전 displays 문서(열린 것)는 화면을 열면 notasDisplay 줄로 옮겨짐 (원래 문서 st 'migr') · 숫자 3개
 *   ② 새 요청: 가게 3001 → Empty Display 찾기 → − N + → 요청에 넣기 (LD ×2 · BASE ×1) · Outros(글) · 준비 날짜 → 보내기 = 한 그룹 3줄
 *      · 배송 무게가 없는 상품은 거절 · 같은 가게의 두 번째 요청은 같은 카드 · 준비 대기는 준비 날짜 순
 *   ③ 준비 시작 = 맡기: 다른 사람이 먼저 맡았으면 "Já foi iniciado por <이름>" · 놓기(Liberar) · 취소 → 끝남 칸에 Cancelado
 *   ④ 끝내기 → 단위마다 Notes UPS 박스(상품의 prodExtra 무게 · 크기) · 6×4 라벨 인쇄(전체 수 없이) · Outros 는 "무게로 끝내기"(무게 · 크기 직접)
 *   ⑤ Notes UPS 대기 줄에 그 박스들 · 줄 두 개 고르기 → 한 박스로 합치기 · 끝남 카드 고르기 → Notes UPS 박스 합치기(옛 박스는 취소 · mergedInto)
 *   ⑥ 주문 창 🖼 Notes Display → 이 화면의 새 요청 칸이 그 가게로 열리고 요청한 종류가 Outros 줄로
 *   ⑦ 권한: 세일즈맨은 화면을 못 씀 · 피킹 담당은 남이 시작한 카드를 끝내지 못함 · 창고 매니저(옛 GERENTE)는 끝낼 수 있음 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8971', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const dia = n => { const d = new Date(Date.now() + n * 864e5); return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); };
  const SEED = `const c0 = s.catalog.find(x => x.id === 'c0'); const rows = JSON.parse(c0.j);
    rows.push(['LD(STACKABLE)', 'LD STACKABLE', 10, 0, '', 'Set Orders & Displays', 'EMPTY DISPLAY', '', '', '']); rows.push(['LB2', 'BASE - 2FL TIER (LONG)', 10, 0, '', 'Set Orders & Displays', 'EMPTY DISPLAY', '', '', '']); rows.push(['EMC13INT', 'C13 INSERT', 1, 0, '', 'Set Orders & Displays', 'EMPTY DISPLAY', '', '', '']);
    c0.j = JSON.stringify(rows); c0.n = rows.length;
    s.prodExtra = [{ id: 'LD(STACKABLE)', peso: 16, comp: 26, larg: 16, alt: 16 }, { id: 'LB2', peso: 30, comp: 15, larg: 15, alt: 26 }];
    s.orders[0].req = { C13: 1, LD: 2 };`;
  const mk = async (email, job, extra, w, h) => {
    const pg = await (await br.newContext({ viewport: { width: w || 1440, height: h || 1000 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message + ' ' + (e.stack||'').split('\n').slice(0,3).join(' | '))); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { localStorage.setItem('theone.lang', 'pt'); window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', (o.job ? 'let u = s.users.find(x => x.id === "' + o.email + '"); if (!u) { u = { id: "' + o.email + '", email: "' + o.email + '", name: "' + o.email.split('@')[0].toUpperCase() + '", active: true }; s.users.push(u); } u.role = "manager"; u.job = "' + o.job + '";' : '') + o.seed); }, { email, job, seed: SEED + (extra || '') });
    await pg.goto('http://127.0.0.1:8971/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(200); return pg;
  };
  const store = (pg, c) => pg.evaluate(c => Object.values(window.__MOCK_STORE__[c] || {}), c);
  const printed = async pg => { await pg.waitForSelector('#prt.on', { timeout: 8000 }); const P = await pg.$$eval('#prtbody .nulp', L => L.map(x => ({ cx: x.querySelector('.etqn-cx').textContent, conta: x.querySelector('.etqn-conta').textContent, prod: (x.querySelector('.etqn-prod') || {}).textContent || '', med: x.querySelector('.etqn-med').textContent }))); await pg.click('#prtClose'); await pg.waitForTimeout(200); return P; };
  const sim = async pg => { await pg.waitForSelector('#esPergSim', { timeout: 5000 }); await pg.click('#esPergSim'); };
  const card = (pg, acct) => pg.$eval('.rp-ag [data-nd-loja="' + acct + '"]', e => e.textContent).catch(() => '');
  const addProd = async (pg, q, id, n) => { await pg.fill('#nuProdBusca', q); await pg.waitForSelector('[data-act="nu-prod-add"][data-id="' + id + '"]'); await pg.click('[data-act="nu-prod-add"][data-id="' + id + '"]'); await pg.waitForSelector('.nd-esc .nd-step-in'); for (let i = 1; i < n; i++) await pg.click('.nd-esc [data-act="nd-q"][data-d="1"]'); await pg.click('[data-act="nd-esc-ok"]'); await pg.waitForTimeout(100); };
  try {
    /* ① */
    const pg = await mk('luke@theonefl.com', '', 's.displays = [{ id: "DS1", acct: "1111", store: "ALI B/S # 1", st: "open", items: [{ n: "LD STACKABLE", c: "LD(STACKABLE)", q: 2, w: 15, l: 22, wd: 15, h: 15 }], due: "' + dia(1) + '", createdBy: "office@theonefl.com", createdByName: "OFFICE", createdAt: new Date().toISOString() }, { id: "DS2", acct: "1111", store: "ALI B/S # 1", st: "shipped", items: [] }];');
    await pg.evaluate(() => { location.hash = '#/displays'; }); await pg.waitForSelector('.sb.nd-raiz .rp-grade', { timeout: 8000 });
    const D1 = await store(pg, 'displays'), N1 = await store(pg, 'notasDisplay'); log('① migrated:', JSON.stringify(N1.map(x => [x.id, x.status, x.qtd, x.code])), D1.map(d => d.st).join(','));
    if (N1.length !== 1 || N1[0].status !== 'pendente' || N1[0].code !== 'LD(STACKABLE)' || D1.find(d => d.id === 'DS1').st !== 'migr' || D1.find(d => d.id === 'DS2').st !== 'shipped') errs.push('① open legacy display migrated to notasDisplay, shipped one untouched');
    const K = await pg.$$eval('.nu-kpis .fin-kpi', L => L.map(k => k.querySelector('.lbl').textContent + '=' + k.querySelector('b').textContent)); log('① kpis:', K.join(' | '));
    if (K.length !== 3 || K[0] !== 'Aguardando=1') errs.push('① 3 KPIs, waiting 1');
    /* ② */
    await pg.click('[data-act="nu-novo"]'); await pg.waitForSelector('#nuBusca'); await pg.fill('#nuBusca', '3001'); await pg.press('#nuBusca', 'Enter');
    await pg.waitForSelector('.ups-cli-sel.cartaz'); if (!/BEAUTY EXCHANGE ORLANDO/.test(await pg.textContent('.ups-cli-nome'))) errs.push('② store card');
    await addProd(pg, 'stack', 'LD(STACKABLE)', 2); await addProd(pg, 'base', 'LB2', 1);
    await pg.fill('#nuProdBusca', 'outros'); await pg.press('#nuProdBusca', 'Enter'); await pg.waitForSelector('.nu-prod-txt'); await pg.fill('.nu-prod-txt', 'PLACA AZUL');
    const lin = await pg.$$eval('.nd-lin', L => L.map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 40))); log('② lines:', JSON.stringify(lin));
    if (lin.length !== 3 || (await pg.$eval('.nd-lin .nd-step-in', e => e.value)) !== '2') errs.push('② request has 3 lines, LD ×2');
    await pg.fill('#ndPara', dia(3)); await pg.dispatchEvent('#ndPara', 'change');
    if (!/4 caixa/.test(await pg.textContent('[data-act="nu-prod-gravar"]'))) errs.push('② send button counts 4 boxes');
    await pg.click('[data-act="nu-prod-gravar"]'); await pg.waitForSelector('#nuBusca', { timeout: 5000 }).catch(() => errs.push('② after sending, back to store search'));
    let ND = (await store(pg, 'notasDisplay')).filter(x => x.acct === '3001'); log('② rows:', JSON.stringify(ND.map(x => [x.code, x.nome, x.texto, x.qtd, x.paraEm, x.grupo === ND[0].grupo])));
    if (ND.length !== 3 || ND.some(x => x.grupo !== ND[0].grupo || x.paraEm !== dia(3) || x.status !== 'pendente') || !ND.find(x => x.texto === 'PLACA AZUL' && !x.code)) errs.push('② one group of 3 pending rows with the date and the Outros text');
    /* 무게 없는 상품은 거절 · 두 번째 요청은 같은 카드 */
    await pg.fill('#nuBusca', '3001'); await pg.press('#nuBusca', 'Enter'); await pg.waitForSelector('#nuProdBusca');
    await addProd(pg, 'c13', 'EMC13INT', 1); await pg.click('[data-act="nu-prod-gravar"]'); await pg.waitForTimeout(400);
    if ((await store(pg, 'notasDisplay')).length !== 4) errs.push('② product without shipping weight is refused');
    await pg.click('[data-act="nu-prod-tirar"]'); await addProd(pg, 'base', 'LB2', 1); await pg.fill('#ndPara', dia(3)); await pg.dispatchEvent('#ndPara', 'change'); await pg.click('[data-act="nu-prod-gravar"]'); await pg.waitForTimeout(500);
    ND = (await store(pg, 'notasDisplay')).filter(x => x.acct === '3001'); if (ND.length !== 4 || new Set(ND.map(x => x.grupo)).size !== 2) errs.push('② second request = second group');
    const ord = await pg.$$eval('.rp-ag [data-nd-loja]', L => L.map(e => e.dataset.ndLoja)); log('② waiting order:', ord.join(','));
    if (ord.join(',') !== '1111,3001') errs.push('② one card per store, sorted by preparation date');
    if (!/4 produto/.test(await card(pg, '3001'))) errs.push('② 3001 card holds both requests');
    /* ③ 맡기 — 다른 사람이 먼저 */
    await pg.evaluate(() => { const r = Object.values(window.__MOCK_STORE__.notasDisplay).find(x => x.acct === '1111'); Object.assign(r, { status: 'preparando', iniciadaPor: 'pick@theonefl.com', iniciadaPorNome: 'PEDRO', iniciadaEm: new Date().toISOString() }); });
    await pg.click('[data-nd-loja="1111"] [data-act="nd-iniciar"]'); await pg.waitForSelector('#ndAvisoTxt', { timeout: 5000 }).catch(() => {});
    const av = await pg.textContent('#ndAvisoTxt').catch(() => ''); log('③ refused:', av); if (!/Já foi iniciado por PEDRO/.test(av)) errs.push('③ second user is refused with the owner name');
    if (await pg.$('#ndAvisoOk')) await pg.click('#ndAvisoOk'); await pg.waitForTimeout(200);
    if (!/Preparando: PEDRO/.test(await card(pg, '1111'))) errs.push('③ card shows who is preparing');
    await pg.click('[data-nd-loja="3001"] [data-act="nd-iniciar"]'); await pg.waitForTimeout(500);
    ND = (await store(pg, 'notasDisplay')).filter(x => x.acct === '3001'); if (ND.some(x => x.status !== 'preparando' || x.iniciadaPor !== 'luke@theonefl.com')) errs.push('③ start claims every open row of the store');
    if (!/Preparando: .*\(você\)/.test(await card(pg, '3001'))) errs.push('③ started card says (você)');
    await pg.click('[data-nd-loja="3001"] [data-act="nd-liberar"]'); await sim(pg); await pg.waitForTimeout(500);
    if ((await store(pg, 'notasDisplay')).filter(x => x.acct === '3001').some(x => x.status !== 'pendente' || x.iniciadaPor)) errs.push('③ release → back to waiting');
    await pg.click('[data-nd-loja="3001"] [data-act="nd-iniciar"]'); await pg.waitForTimeout(500);
    await pg.evaluate(() => { const r = Object.values(window.__MOCK_STORE__.notasDisplay).find(x => x.acct === '1111'); Object.assign(r, { status: 'pendente', iniciadaPor: '', iniciadaPorNome: '' }); });
    await pg.evaluate(() => { location.hash = '#/notesups'; }); await pg.waitForTimeout(300); await pg.evaluate(() => { location.hash = '#/displays'; }); await pg.waitForSelector('[data-nd-loja="1111"] [data-act="nd-cancelar"]');
    await pg.click('[data-nd-loja="1111"] [data-act="nd-cancelar"]'); await sim(pg); await pg.waitForTimeout(500);
    if ((await store(pg, 'notasDisplay')).find(x => x.acct === '1111').status !== 'cancelado' || !/Cancelado/.test(await pg.textContent('.rp-em'))) errs.push('③ cancel → Concluídos with Cancelado');
    /* ④ 끝내기 */
    await pg.click('[data-nd-loja="3001"] [data-act="nd-concluir"]'); await sim(pg);
    const P = await printed(pg); log('④ labels:', JSON.stringify(P.map(x => x.cx + ' ' + x.prod + ' ' + x.med)));
    if (P.length !== 4 || P.some(x => x.cx !== '1' && !/^\d+$/.test(x.cx)) || P.filter(x => /LD STACKABLE/.test(x.prod) && /16 lb/.test(x.med)).length !== 2 || P.filter(x => /BASE/.test(x.prod) && /30 lb/.test(x.med)).length !== 2) errs.push('④ 4 labels (LD 16 lb ×2, BASE 30 lb ×2), no total');
    await pg.waitForSelector('#ndAvisoTxt', { timeout: 4000 }).catch(() => errs.push('④ warns that Outros is still open')); if (await pg.$('#ndAvisoOk')) await pg.click('#ndAvisoOk');
    let NB = (await store(pg, 'upsnotes')).filter(x => x.acct === '3001' && x.src === 'display'); log('④ boxes:', JSON.stringify(NB.map(x => [x.w, x.l, x.wd, x.h, x.prod])));
    if (NB.length !== 4 || NB.some(x => x.st !== 'open' || !(x.ndIds || []).length)) errs.push('④ 4 open Notes UPS boxes linked to the rows');
    const fe = (await store(pg, 'notasDisplay')).filter(x => x.acct === '3001' && x.code); if (fe.some(x => x.status !== 'concluido' || x.qtdFeita !== x.qtd || !(x.notaIds || []).length)) errs.push('④ product rows concluded with their box ids');
    await pg.click('[data-act="nd-concluir-outro"]'); await pg.waitForSelector('#ndUP');
    if (await pg.inputValue('#ndUP')) errs.push('④ Outros weight starts empty');
    await pg.fill('#ndUP', '5'); await pg.fill('#ndUC', '10'); await pg.fill('#ndUL', '8'); await pg.fill('#ndUA', '6'); await sim(pg);
    const P2 = await printed(pg); log('④ outros label:', JSON.stringify(P2)); if (P2.length !== 1 || !/PLACA AZUL ×1/.test(P2[0].prod) || !/5 lb/.test(P2[0].med)) errs.push('④ Outros box with typed weight');
    /* ⑤ Notes UPS 대기 줄 · 합치기 */
    await pg.evaluate(() => { location.hash = '#/notesups'; }); await pg.waitForSelector('tr[data-nota]');
    const nq = (await pg.$$('tr[data-nota]')).length; log('⑤ queue rows:', nq); if (nq !== 5) errs.push('⑤ 5 boxes in the Notes UPS queue');
    await pg.evaluate(() => { location.hash = '#/displays'; }); await pg.waitForSelector('#nuBusca, [data-act="nu-novo"]');
    if (!(await pg.$('#nuBusca'))) await pg.click('[data-act="nu-novo"]');
    await pg.fill('#nuBusca', '3001'); await pg.press('#nuBusca', 'Enter'); await pg.waitForSelector('#nuProdBusca'); await addProd(pg, 'stack', 'LD(STACKABLE)', 1); await addProd(pg, 'base', 'LB2', 1); await pg.click('[data-act="nu-prod-gravar"]'); await pg.waitForTimeout(500);
    const novos = (await store(pg, 'notasDisplay')).filter(x => x.status === 'pendente' && x.acct === '3001'); for (const x of novos) { await pg.click('[data-act="nd-marcar"][data-id="' + x.id + '"]'); await pg.waitForTimeout(150); }
    await pg.waitForSelector('[data-act="nd-unir"]'); await pg.click('[data-act="nd-unir"]'); await pg.waitForSelector('#ndUP');
    if ((await pg.inputValue('#ndUP')) !== '46') errs.push('⑤ combine dialog suggests the summed weight 46');
    await pg.fill('#ndUC', '30'); await pg.fill('#ndUL', '20'); await pg.fill('#ndUA', '20'); await sim(pg);
    const P3 = await printed(pg); log('⑤ combined label:', JSON.stringify(P3)); if (P3.length !== 1 || !/LD STACKABLE ×1/.test(P3[0].prod) || !/BASE.*×1/.test(P3[0].prod)) errs.push('⑤ two tasks of the same store → one box');
    const cb = (await store(pg, 'notasDisplay')).filter(x => novos.find(y => y.id === x.id)); if (cb.some(x => x.status !== 'concluido') || cb[0].notaIds[0] !== cb[1].notaIds[0]) errs.push('⑤ both tasks concluded into the same box');
    await pg.waitForSelector('.rp-em [data-act="nd-cx-marcar"]'); await (await pg.$$('.rp-em [data-act="nd-cx-marcar"]'))[0].click(); await pg.waitForTimeout(200); await (await pg.$$('.rp-em [data-act="nd-cx-marcar"]'))[1].click(); await pg.waitForTimeout(200);
    await pg.click('[data-act="nd-cx-unir"]'); await pg.waitForSelector('#nuUP'); await pg.fill('#nuUC', '40'); await pg.fill('#nuUL', '30'); await pg.fill('#nuUA', '30'); await sim(pg); const P4 = await printed(pg); log('⑤ merged boxes label:', JSON.stringify(P4));
    const ux = await store(pg, 'upsnotes'), merged = ux.filter(x => x.mergedInto); log('⑤ merged:', merged.length);
    if (P4.length !== 1 || !merged.length || merged.some(x => x.st !== 'x' || !ux.find(y => y.id === x.mergedInto && y.st === 'open'))) errs.push('⑤ finished cards → Notes UPS boxes merged, old ones cancelled');
    /* ⑥ 주문 창 */
    await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#mDisp', { timeout: 8000 }).catch(() => errs.push('⑥ order screen has 🖼 Notes Display'));
    if (await pg.$('#mDisp')) { await pg.click('#mDisp'); await pg.waitForSelector('.sb.nd-raiz .ups-cli-nome', { timeout: 6000 }).catch(() => {});
      const nome = await pg.textContent('.ups-cli-nome').catch(() => ''), txt = await pg.$$eval('.nu-prod-txt', L => L.map(x => x.value)); log('⑥ prefilled:', nome, JSON.stringify(txt));
      if (!/#\/displays/.test(await pg.evaluate(() => location.hash)) || !/BEAUTY EXCHANGE ORLANDO/.test(nome) || txt.length !== 2) errs.push('⑥ order entry opens the launch panel with the store and the requested kinds');
      await pg.fill('#ndPara', dia(2)); await pg.dispatchEvent('#ndPara', 'change'); await pg.click('[data-act="nu-prod-gravar"]'); await pg.waitForTimeout(500);
      if ((await store(pg, 'notasDisplay')).filter(x => x.orderId === 'O261014-AAAA').length !== 2) errs.push('⑥ rows keep the order id'); }
    await pg.context().close();
    /* ⑦ 권한 */
    const sm = await mk('brandon@x.com', ''); await sm.evaluate(() => { location.hash = '#/displays'; }); await sm.waitForTimeout(1200);
    if (await sm.$('[data-act="nu-novo"], [data-act="nd-iniciar"]')) errs.push('⑦ salesman cannot use the screen'); await sm.context().close();
    const PREP = 's.notasDisplay = [{ id: "ND1", grupo: "ND1", acct: "3001", store: "BEAUTY EXCHANGE ORLANDO", code: "LB2", nome: "BASE - 2FL TIER (LONG)", qtd: 1, qtdFeita: 0, paraEm: "' + dia(0) + '", status: "preparando", iniciadaPor: "luke@theonefl.com", iniciadaPorNome: "LUKE", criadoPor: "luke@theonefl.com", criadoEm: new Date().toISOString(), notaIds: [] }];';
    const pk = await mk('pick@theonefl.com', 'pick', PREP); await pk.evaluate(() => { location.hash = '#/displays'; }); await pk.waitForSelector('[data-nd-loja="3001"]', { timeout: 8000 });
    if (await pk.$('[data-act="nd-concluir"], [data-act="nd-liberar"]')) errs.push('⑦ picker cannot finish/release a card someone else started');
    if (!/Hoje/.test(await card(pk, '3001'))) errs.push('⑦ preparation date of today is flagged Hoje'); await pk.context().close();
    const wm = await mk('wh@theonefl.com', 'whmgr', PREP); await wm.evaluate(() => { location.hash = '#/displays'; }); await wm.waitForSelector('[data-nd-loja="3001"]', { timeout: 8000 });
    if (!(await wm.$('[data-act="nd-concluir"]'))) errs.push('⑦ warehouse manager (old GERENTE) can finish it'); await wm.context().close();
  } catch (e) { errs.push('crash: ' + e.message); }
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
