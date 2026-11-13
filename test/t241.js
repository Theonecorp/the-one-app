/* v0.8.213 시험 — 📷 사진으로 라벨 읽기 (📥 상품 받기 · 옛 WMS 의 "Ler etiqueta por foto") — Cloud Function 은 window.__MOCK_IA__ 로 대신 (네트워크 없음)
 *   ① 관리자 · 열린 REC: 넣기 칸의 검색 바로 아래에 단추 둘(카메라 capture=environment · 갤러리) — 화면에서 검색 칸 아래 · 같은 카드 안
 *   ② HEIC 파일 → 옛 문구 · 서버를 부르지 않음
 *   ③ 2000×1000 사진 → 파란 "LENDO A ETIQUETA" 덮개 → 서버에 JPEG(긴 변 1568) base64 · mime image/jpeg
 *   ④ 결과 창 3줄: EB103(선명함 · 체크 · 수량칸) · 바코드를 O 로 잘못 읽은 898OOOOOOOOO → AHG100 "(lido como …)" · 빈 상자 칩 · 등록 안 된 ZZQ999(불확실 · 체크 없음 · 수량칸 없음 · "não existe no cadastro") · 관찰 띠 · "Continuar com 2"
 *        EB103 수량 12 로 고침 · 하나 해제하면 "Continuar com 1" · 다시 체크
 *   ⑤ 트래킹 창: 앞의 트래킹이 미리 들어 있고 커서가 거기 · "2 produtos · 42 peças no total" · 스캔 단추 · 뒤로 → 결과 창(고친 수량 그대로) → 다시 계속
 *   ⑥ 확인 → 빈 상자 경고(AHG100) → 계속 → 초록 화면 → 열린 REC(CG1) 에 받은 줄 2개 (EB103 12 · AHG100 30 · 트래킹 · UPS · 아직 재고 안 들어감) · ZZQ999 없음
 *   ⑦ 초록 화면을 누르면 "Registrar no estoque também?" (2 produtos) → 예 → 줄마다 새 상자 라벨 · stock 15+12 · 40+30 · 줄 estoqueConfirmado → 초록 화면 → 라벨 크기 창
 *   ⑧ 오류: 서버가 limite_diario → "Limite de leituras de hoje atingido." · 키 없음(__MOCK_IA__ 없음) → sem_chave 문구 · 아무것도 못 읽음 → ia_nada_lido
 *   ⑨ 세일즈맨: 단추 없음 · ⑩ 폰(430): 단추 · 결과 창이 화면 안에 (가로 넘침 없음) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8920', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const SEED = `
    s.stock = [{ id: 'AHG100', code: 'AHG100', qty: 40, vazia: true, at: '2026-11-01T00:00:00Z' }, { id: 'EB103', code: 'EB103', qty: 15, at: '2026-11-01T00:00:00Z' }];
    s.etiquetas = [];
    const ts = new Date(Date.now() - 864e5).toISOString();
    s.cargas = [{ id: 'CG1', numero: 'REC-000001', fornecedor: '#CHINA2', transportadora: '', status: 'recebida', dataChegada: ts.slice(0, 10), criadoEm: ts, criadoPor: 'x@theonefl.com', criadoPorNome: 'X', caixasEnviadas: null, caixasRecebidas: 0 }];
    s.recebimentos = [];`;
  const LEU = { ok: true, itens: [{ codigo: 'EB103', quantidade: 10, confianca: 'alta' }, { codigo: '898OOOOOOOOO', quantidade: 30, confianca: 'media' }, { codigo: 'ZZQ999', quantidade: 5, confianca: 'baixa' }], observacao: 'etiqueta amassada', custo_usd: 0.0002, restante_hoje: 299 };
  const mk = async (email, c) => {
    const pg = await (c || ctx).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { try { localStorage.setItem('theone.lang', 'pt'); localStorage.setItem('ultimoRastreio', '1Z999AA10123456784'); } catch (e) {} window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed: SEED });
    await pg.goto('http://127.0.0.1:8920/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg;
  };
  const ctx = await br.newContext({ viewport: { width: 1280, height: 1000 } });
  const store = (pg, col) => pg.evaluate(c => Object.values(window.__MOCK_STORE__[c] || {}), col);
  const doc = (pg, col, id) => pg.evaluate(a => (window.__MOCK_STORE__[a[0]] || {})[a[1]] || null, [col, id]);
  const go = (pg, h) => pg.evaluate(x => { location.hash = x; }, h);
  const mockIa = (pg, how) => pg.evaluate(o => {
    window.__IA_CALLS__ = [];
    if (o.how === 'none') { delete window.__MOCK_IA__; return; }
    window.__MOCK_IA__ = async d => { window.__IA_CALLS__.push(d); await new Promise(r => setTimeout(r, 400)); if (o.how === 'limite') throw { code: 'functions/resource-exhausted', details: { erro: 'limite_diario', limite: 300 } }; if (o.how === 'nada') return { ok: true, itens: [], observacao: '' }; return JSON.parse(JSON.stringify(o.leu)); };
  }, { how, leu: LEU });
  const foto = (pg, nome, tipo, w, h) => pg.evaluate(async o => {
    const cv = document.createElement('canvas'); cv.width = o.w; cv.height = o.h; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, o.w, o.h); g.fillStyle = '#000'; g.fillRect(40, 40, 400, 80);
    const b = await new Promise(r => cv.toBlob(r, 'image/png')); const f = new File([b], o.nome, { type: o.tipo }); const dt = new DataTransfer(); dt.items.add(f);
    const inp = document.getElementById('iaFoto'); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
  }, { nome, tipo, w: w || 600, h: h || 400 });
  const toastTxt = pg => pg.waitForFunction(() => { const t = document.getElementById('toast'); return t && /\bon\b/.test(t.className) && t.textContent; }, null, { timeout: 6000 }).then(h => h.jsonValue()).catch(() => '');
  const clicarTela = async pg => { await pg.waitForSelector('.sb.rc-fb .fb-tela.on:not(.carregando)', { timeout: 8000 }); await pg.click('.sb.rc-fb .fb-tela:not(.carregando)'); await pg.waitForTimeout(350); };

  /* ① */
  let pg = await mk('luke@theonefl.com');
  await go(pg, '#/recebimento/CG1'); await pg.waitForSelector('.sb.rc-raiz #rBusca', { timeout: 10000 });
  const bt = await pg.evaluate(() => { const a = document.querySelector('.sb.rc-raiz [data-ia-foto]'), g = document.querySelector('.sb.rc-raiz [data-ia-galeria]'), i = document.getElementById('iaFoto'), q = document.getElementById('iaGaleria'), b = document.getElementById('rBusca'), card = b && b.closest('.card-rec');
    if (!a || !g) return null; const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(), rc = card.getBoundingClientRect();
    return { foto: a.textContent.trim(), gal: g.textContent.trim(), cap: i && i.getAttribute('capture'), galCap: q && q.getAttribute('capture'), abaixo: ra.top >= rb.bottom - 1, dentro: ra.left >= rc.left && ra.right <= rc.right && ra.bottom <= rc.bottom, mesmo: card.contains(a), flex: getComputedStyle(a.closest('.ia-campo')).display, vis: ra.width > 0 && ra.height > 0 }; });
  log('① buttons:', JSON.stringify(bt));
  if (!bt || bt.foto !== 'Ler etiqueta por foto' || bt.gal !== 'Galeria' || bt.cap !== 'environment' || bt.galCap !== null) errs.push('① two buttons (camera capture=environment · gallery) :: ' + JSON.stringify(bt));
  if (bt && !(bt.abaixo && bt.dentro && bt.mesmo && bt.vis && bt.flex === 'flex')) errs.push('① buttons below the search field, inside the launch card (old .ia-campo flex) :: ' + JSON.stringify(bt));
  const clicouCam = await pg.evaluate(() => new Promise(res => { const i = document.getElementById('iaFoto'); i.addEventListener('click', e => { e.preventDefault(); res(true); }, { once: true }); document.querySelector('[data-ia-foto]').click(); setTimeout(() => res(false), 500); }));
  if (!clicouCam) errs.push('① camera button opens the file input');
  /* ② */
  await mockIa(pg, 'ok'); await foto(pg, 'IMG_0001.HEIC', 'image/heic');
  let tt = await toastTxt(pg); log('② heic:', tt);
  if (!/HEIC/.test(tt) || !/Mais compatível/.test(tt)) errs.push('② HEIC message :: ' + tt);
  if ((await pg.evaluate(() => window.__IA_CALLS__.length)) !== 0) errs.push('② HEIC never reaches the server');
  await pg.waitForTimeout(2500);
  /* ③ */
  await foto(pg, 'etiqueta.png', 'image/png', 2000, 1000);
  await pg.waitForSelector('.sb.rc-fb .fb-tela.carregando', { timeout: 3000 }).catch(() => errs.push('③ loading overlay'));
  const ov = await pg.evaluate(() => { const x = document.querySelector('.sb.rc-fb .fb-tela.carregando'); return x ? { msg: x.querySelector('.fb-tela-msg').textContent, pos: getComputedStyle(x).position, z: getComputedStyle(x).zIndex, spin: !!x.querySelector('.fb-spin.grande') } : null; });
  log('③ overlay:', JSON.stringify(ov)); if (!ov || ov.msg !== 'LENDO A ETIQUETA' || ov.pos !== 'fixed' || !ov.spin) errs.push('③ blue "LENDO A ETIQUETA" overlay :: ' + JSON.stringify(ov));
  await pg.waitForSelector('.es-mw .ia-m .ia-lista', { timeout: 6000 }).catch(() => errs.push('④ result modal'));
  const env = await pg.evaluate(async () => { const d = window.__IA_CALLS__[0]; if (!d) return null; const im = new Image(); await new Promise(r => { im.onload = r; im.onerror = r; im.src = 'data:image/jpeg;base64,' + d.imagem; }); return { mime: d.mime, w: im.naturalWidth, h: im.naturalHeight, jpeg: d.imagem.slice(0, 4) }; });
  log('③ sent:', JSON.stringify(env)); if (!env || env.mime !== 'image/jpeg' || env.w !== 1568 || env.h !== 784 || env.jpeg !== '/9j/') errs.push('③ JPEG base64, long side 1568 :: ' + JSON.stringify(env));
  if (await pg.$('.sb.rc-fb .fb-tela.carregando')) { await pg.waitForTimeout(400); if (await pg.$('.sb.rc-fb .fb-tela.carregando')) errs.push('③ overlay closes after reading'); }
  /* ④ */
  const rows = await pg.$$eval('.es-mw .ia-m .ia-lin', L => L.map(r => ({ txt: r.querySelector('.ia-txt b').textContent, sub: r.querySelector('.ia-txt > span').textContent, chk: !!r.querySelector('[data-ia-chk]'), on: !!(r.querySelector('[data-ia-chk]') || {}).checked, qtd: (r.querySelector('[data-ia-qtd]') || {}).value || null, badge: r.querySelector('.badge').textContent, bcls: r.querySelector('.badge').className, sem: r.classList.contains('sem-prod'), chip: !!r.querySelector('.pdz-chip.pdz-vm') })));
  log('④ rows:', JSON.stringify(rows));
  if (rows.length !== 3) errs.push('④ three rows');
  else {
    if (rows[0].txt !== 'EB103' || !rows[0].chk || !rows[0].on || rows[0].qtd !== '10' || rows[0].badge !== 'Leitura nítida' || !/\bok\b/.test(rows[0].bcls) || !/Em estoque agora: 15/.test(rows[0].sub)) errs.push('④ EB103 row :: ' + JSON.stringify(rows[0]));
    if (rows[1].txt !== 'AHG100 (lido como 898OOOOOOOOO)' || !rows[1].chk || !rows[1].on || rows[1].qtd !== '30' || rows[1].badge !== 'Confira' || !/\blow\b/.test(rows[1].bcls) || !rows[1].chip || !/caixa vazia/.test(rows[1].sub)) errs.push('④ AHG100 by barcode read with O → "lido como" + empty-box chip :: ' + JSON.stringify(rows[1]));
    if (rows[2].txt !== 'ZZQ999' || rows[2].chk || rows[2].qtd !== null || !rows[2].sem || rows[2].badge !== 'Duvidoso' || !/\bout\b/.test(rows[2].bcls) || !/Este código não existe no cadastro/.test(rows[2].sub)) errs.push('④ unknown ZZQ999: no checkbox · no qty :: ' + JSON.stringify(rows[2]));
  }
  const obs = await pg.$eval('.es-mw .ia-m', m => ({ tit: m.querySelector('.modal-head h2').textContent, obs: (m.querySelector('.ia-obs') || {}).textContent || '', conf: m.querySelector('.aviso').textContent, cont: m.querySelector('#iaContinuar').textContent }));
  log('④ modal:', JSON.stringify(obs)); if (obs.tit !== 'O que a foto mostrou' || !/etiqueta amassada/.test(obs.obs) || !/Marque o que quer receber/.test(obs.conf) || obs.cont !== 'Continuar com 2') errs.push('④ title · observação · "Continuar com 2" :: ' + JSON.stringify(obs));
  await pg.fill('.es-mw [data-ia-qtd="0"]', '12');
  await pg.uncheck('.es-mw [data-ia-chk="1"]'); let cont = await pg.textContent('#iaContinuar'); if (cont !== 'Continuar com 1') errs.push('④ unticking → Continuar com 1 :: ' + cont);
  await pg.check('.es-mw [data-ia-chk="1"]'); cont = await pg.textContent('#iaContinuar'); if (cont !== 'Continuar com 2') errs.push('④ ticking back → 2');
  /* ⑤ */
  await pg.click('#iaContinuar'); await pg.waitForSelector('.es-mw #iaRastreio', { timeout: 4000 }).catch(() => errs.push('⑤ tracking modal'));
  let rm = await pg.evaluate(() => { const m = document.querySelector('.es-mw .ia-m'); return { tit: m.querySelector('h2').textContent, resumo: m.querySelector('.aviso').textContent, val: document.getElementById('iaRastreio').value, foco: document.activeElement && document.activeElement.id, scan: !!m.querySelector('[data-ia-scan]'), hint: m.querySelector('.hint').textContent, bt: m.querySelector('[data-ia-confirmar]').textContent }; });
  log('⑤ tracking:', JSON.stringify(rm));
  if (rm.tit !== 'Código de rastreamento' || rm.resumo !== '2 produtos · 42 peças no total' || rm.val !== '1Z999AA10123456784' || rm.foco !== 'iaRastreio' || !rm.scan || rm.bt !== 'Confirmar recebimento' || !/Vale para todos/.test(rm.hint)) errs.push('⑤ tracking modal: summary · prefilled last tracking · focused · scan :: ' + JSON.stringify(rm));
  await pg.click('.es-mw [data-ia-voltar]'); await pg.waitForSelector('.es-mw .ia-lista');
  if ((await pg.inputValue('.es-mw [data-ia-qtd="0"]')) !== '12') errs.push('⑤ back keeps the edited quantity');
  await pg.click('#iaContinuar'); await pg.waitForSelector('.es-mw #iaRastreio');
  /* ⑥ */
  await pg.click('.es-mw [data-ia-confirmar]');
  await pg.waitForSelector('.es-mw #esPergSim', { timeout: 4000 }).catch(() => errs.push('⑥ empty-box warning'));
  const pv = await pg.evaluate(() => { const m = document.querySelector('.es-mw'); return m ? m.textContent : ''; }); log('⑥ warning:', pv.slice(0, 160));
  if (!/caixa vazia/.test(pv) || !/AHG100/.test(pv)) errs.push('⑥ empty-box warning names AHG100 :: ' + pv.slice(0, 200));
  await pg.click('.es-mw #esPergSim');
  await pg.waitForSelector('.sb.rc-fb .fb-tela.on:not(.carregando)', { timeout: 8000 }).catch(() => errs.push('⑥ success overlay'));
  const okTela = await pg.evaluate(() => { const x = document.querySelector('.sb.rc-fb .fb-tela:not(.carregando)'); return x ? x.textContent : ''; }); log('⑥ overlay:', okTela);
  if (!/RECEBIMENTO REGISTRADO/.test(okTela) || !/2 produtos entraram em Produtos recebidos/.test(okTela) || !/Toque na tela para continuar/.test(okTela)) errs.push('⑥ green overlay text :: ' + okTela);
  let R = (await store(pg, 'recebimentos')).filter(x => x.cargaId === 'CG1');
  log('⑥ lines:', JSON.stringify(R.map(x => [x.code, x.qtd, x.rastreio, x.transportadora, x.cargaNumero, x.estoqueConfirmado, x.pickingQtd, x.usuario])));
  const l1 = R.find(x => x.code === 'EB103'), l2 = R.find(x => x.code === 'AHG100');
  if (R.length !== 2 || !l1 || !l2) errs.push('⑥ two lines in CG1 :: ' + R.length);
  else {
    if (l1.qtd !== 12 || l2.qtd !== 30) errs.push('⑥ qty 12 · 30');
    if ([l1, l2].some(x => x.rastreio !== '1Z999AA10123456784' || x.transportadora !== 'UPS' || x.cargaNumero !== 'REC-000001' || x.estoqueConfirmado || x.pickingQtd !== null || x.usuario !== 'luke@theonefl.com')) errs.push('⑥ line fields (tracking · UPS · REC · not in stock yet)');
  }
  if (R.some(x => x.code === 'ZZQ999')) errs.push('⑥ unknown code is never received');
  const cg = await doc(pg, 'cargas', 'CG1'); if (cg.caixasRecebidas !== 1) errs.push('⑥ cargas caixasRecebidas 1 (one tracking) :: ' + cg.caixasRecebidas);
  /* ⑦ */
  await clicarTela(pg);
  await pg.waitForSelector('.es-mw #esPergSim', { timeout: 4000 }).catch(() => errs.push('⑦ offer stock entry'));
  const of = await pg.evaluate(() => { const m = document.querySelector('.es-mw'); return m ? { tit: m.querySelector('h2').textContent, txt: m.querySelector('.modal-body').textContent, sim: m.querySelector('#esPergSim').textContent, nao: m.querySelector('#esPergNao').textContent } : null; });
  log('⑦ offer:', JSON.stringify(of));
  if (!of || of.tit !== 'Registrar no estoque também?' || !/Dar entrada no estoque dos 2 produtos/.test(of.txt) || of.sim !== 'Sim, somar ao estoque' || of.nao !== 'Não, só o recebimento') errs.push('⑦ offer text :: ' + JSON.stringify(of));
  await pg.click('.es-mw #esPergSim');
  await clicarTela(pg);
  await pg.waitForSelector('.es-mw [data-act="etq-tam-est-64"]', { timeout: 5000 }).catch(() => errs.push('⑦ label size dialog'));
  const s1 = (await doc(pg, 'stock', 'EB103')).qty, s2 = (await doc(pg, 'stock', 'AHG100')).qty; R = (await store(pg, 'recebimentos')).filter(x => x.cargaId === 'CG1');
  log('⑦ stock:', s1, s2, JSON.stringify(R.map(x => [x.code, x.estoqueConfirmado, x.estoqueQtd, (x.estoqueEtiquetas || []).length])));
  if (s1 !== 27 || s2 !== 70) errs.push('⑦ stock 15+12=27 · 40+30=70 :: ' + s1 + ' ' + s2);
  if (R.some(x => !x.estoqueConfirmado || (x.estoqueEtiquetas || []).length !== 1 || x.estoqueQtd !== x.qtd)) errs.push('⑦ each line confirmed with one new box label');
  const etq = await store(pg, 'etiquetas'); if (etq.length !== 2) errs.push('⑦ two new box labels :: ' + etq.length);
  const logs = (await store(pg, 'stockLog')).filter(x => x.origem === 'recebimento'); if (logs.length !== 2) errs.push('⑦ stockLog recv origem recebimento × 2 :: ' + logs.length);
  await pg.click('.es-mw [data-act="fechar-modal"]').catch(() => {}); await pg.waitForTimeout(300);
  const rowsNow = await pg.$$eval('tr[data-receb-linha]', L => L.length); if (rowsNow !== 2) errs.push('⑦ REC table shows 2 lines :: ' + rowsNow);
  /* ⑧ */
  await mockIa(pg, 'limite'); await foto(pg, 'b.png', 'image/png');
  tt = await toastTxt(pg); log('⑧ limit:', tt); if (tt !== 'Limite de leituras de hoje atingido.') errs.push('⑧ limite_diario message :: ' + tt);
  await pg.waitForTimeout(400);   // 덮개는 0.24초 동안 흐려지며 사라짐
  if (await pg.$('.es-mw .ia-m') || await pg.$('.sb.rc-fb')) errs.push('⑧ no modal / overlay left after an error');
  await pg.waitForTimeout(2600);
  await mockIa(pg, 'none'); await foto(pg, 'c.png', 'image/png');
  tt = await toastTxt(pg); log('⑧ no key:', tt); if (tt !== 'A leitura por foto ainda não foi ativada. Falta a chave da Anthropic nos secrets.') errs.push('⑧ sem_chave message :: ' + tt);
  await pg.waitForTimeout(2600);
  await mockIa(pg, 'nada'); await foto(pg, 'd.png', 'image/png');
  tt = await toastTxt(pg); log('⑧ nothing read:', tt); if (tt !== 'Não consegui ler nada nesta foto. Tente mais perto e com mais luz.') errs.push('⑧ ia_nada_lido :: ' + tt);
  await pg.close();
  /* ⑨ */
  pg = await mk('brandon@x.com');
  await go(pg, '#/recebimento/CG1'); await pg.waitForSelector('.rec-cabeca', { timeout: 8000 });
  if (await pg.$('[data-ia-foto]') || await pg.$('#iaFoto')) errs.push('⑨ salesman has no photo-reading button');
  await pg.close();
  /* ⑩ */
  const ctx2 = await br.newContext({ viewport: { width: 430, height: 900 }, isMobile: true });
  pg = await mk('luke@theonefl.com', ctx2);
  await go(pg, '#/recebimento/CG1'); await pg.waitForSelector('.sb.rc-raiz [data-ia-foto]', { timeout: 10000 }).catch(() => errs.push('⑩ button on phone'));
  await mockIa(pg, 'ok'); await foto(pg, 'e.png', 'image/png');
  await pg.waitForSelector('.es-mw .ia-m .ia-lista', { timeout: 6000 }).catch(() => errs.push('⑩ result modal on phone'));
  const mob = await pg.evaluate(() => { const L = Array.from(document.querySelectorAll('.es-mw .ia-lin')); return { over: document.documentElement.scrollWidth > window.innerWidth + 1, fora: L.some(r => { const b = r.getBoundingClientRect(); return b.left < 0 || b.right > window.innerWidth + 1; }), wrap: L[0] ? getComputedStyle(L[0]).flexWrap : '' }; });
  log('⑩ phone:', JSON.stringify(mob)); if (mob.over || mob.fora || mob.wrap !== 'wrap') errs.push('⑩ rows fit the phone (wrap) :: ' + JSON.stringify(mob));
  await pg.close();
  log(errs.length ? 'FAIL' : 'PASS'); if (errs.length) console.log(errs);
  await br.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})();
