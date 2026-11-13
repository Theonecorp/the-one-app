/* v0.8.214 시험 — 🏪 Shipping UPS 완성: 옛 WMS 의 나머지 — 고객 등록 · 누가 팔았나 · 배송지 수정 · Empty Display 박스 · ZPL/PDF 내려받기 · 오류 창 · 시험 서버 띠
 *   ① UPS.gs env 일(shipq st:'env') 에 test 로 답하면 노란 띠(.ups-teste)
 *   ② 가게 찾기에 없음 → 🆕 고객 등록(newacct 창) → 저장하면 그 가게가 바로 골라짐 (박스 칸)
 *   ③ 세일즈맨 없는 가게 5555 → "누가 팔았나" 그리드 (박스 칸 없음) → SOO 고르기(가게 기본값으로 저장 체크) → 거래처 sm=SOO · 라벨 요청 sm=SOO · adhoc sm=SOO
 *      5556 은 저장 체크를 끄고 고르면 거래처는 그대로, 칩에 "변경" 단추
 *   ④ 배송지 수정(3001): 이번 출고만 → 카드 · 라벨 요청의 받는 주소가 바뀜, 거래처는 그대로 · "고객 정보에도 저장" 을 켜면 거래처 주소가 바뀜
 *   ⑤ Empty Display 상품(prodExtra 무게 · 크기)으로 박스: AHG100 × 2 → 박스 2개(2 lb 20×15×10 · 참조 AHG100) → 라벨 요청 fmt ZPL (설정 labelFmt)
 *      UPS.gs 가 ZPL 로 답하면 파일 2개 내려받기 · 덮개에 내려받기 링크 · 재고 AHG100 10 → 8
 *   ⑥ 필요한 정보가 없는 가게(5557) → "발송에 필요한 정보 누락" 창 · shipq 에 라벨 요청 없음
 *   ⑦ 라벨은 나왔는데 기록 실패(orphan) → 트래킹이 보이는 창 · UPS 키 없음(UPS.gs 문구) → 키 창, 다음 누름은 UPS 에 보내지 않고 바로 창 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8960', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const SEED = `s.accounts.push({ id: '5555', acct: '5555', store: 'NO REP BEAUTY', addr: '5 PALM AVE', city: 'TAMPA', state: 'FL', zip: '33601', tel: '8135550000' });
    s.accounts.push({ id: '5556', acct: '5556', store: 'NO REP TWO', addr: '6 PALM AVE', city: 'TAMPA', state: 'FL', zip: '33601' });
    s.accounts.push({ id: '5557', acct: '5557', store: 'HALF ADDRESS SHOP', addr: '', city: '', state: 'FL', zip: '', sm: 'ALEX' });
    s.settings[0].ups = { labelFmt: 'ZPL', svc: '03', defW: 5 };
    s.prodExtra = [{ id: 'AHG100', peso: 2, comp: 20, larg: 15, alt: 10 }];
    s.stock = (s.stock || []).filter(x => x.id !== 'AHG100').concat([{ id: 'AHG100', code: 'AHG100', qty: 10 }]);`;
  const ctx = await br.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  const downs = []; pg.on('download', d => downs.push(d.suggestedFilename()));
  await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', o); }, SEED);
  await pg.goto('http://127.0.0.1:8960/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  const ver = await pg.evaluate(() => fetch('app.js').then(r => r.text()).then(t => /sbVendKeep/.test(t))); if (!ver) errs.push('0 this worktree app.js is served');
  const shipq = f => pg.evaluate(f => Object.entries(window.__MOCK_STORE__.shipq || {}).filter(([, q]) => new Function('q', 'return ' + f)(q)).map(([id, q]) => Object.assign({ _id: id }, q)), f);
  const doc = (c, id) => pg.evaluate(([c, id]) => (window.__MOCK_STORE__[c] || {})[id], [c, id]);
  const answer = (id, o) => pg.evaluate(([id, o]) => Object.assign(window.__MOCK_STORE__.shipq[id], o), [id, o]);
  const waitQ = (f, ms) => pg.waitForFunction(f => Object.values(window.__MOCK_STORE__.shipq || {}).some(q => new Function('q', 'return ' + f)(q)), f, { timeout: ms || 8000 });
  const pick = async acct => { await pg.fill('#sbBusca', acct); await pg.waitForSelector('[data-sb-cli="' + acct + '"]', { timeout: 4000 }); await pg.press('#sbBusca', 'Enter'); };
  const box = async (w, c, l, a) => { await pg.focus('#sbP'); for (const v of [w, c, l, a]) { await pg.keyboard.type(String(v)); await pg.keyboard.press('Enter'); } await pg.waitForTimeout(150); };
  const trocar = async () => { await pg.click('.sb [data-act="sb-trocar"]'); await pg.waitForSelector('#sbBusca'); };
  const fechaMdl = async () => { await pg.click('.sb-mdl [data-mdl="x"] >> nth=0'); await pg.waitForTimeout(150); };
  try {
    await pg.evaluate(() => { location.hash = '#/balcao'; }); await pg.waitForSelector('#sbBusca', { timeout: 8000 });
    /* ① */
    await waitQ("q.st === 'env'").catch(() => errs.push('① env job goes to shipq'));
    const E = (await shipq("q.st === 'env'"))[0]; if (E) await answer(E._id, { st: 'envdone', env: 'test', cred: true, defined: true });
    await pg.waitForSelector('.sb .aviso.ups-teste', { timeout: 6000 }).catch(() => errs.push('① test-server band shows'));
    /* ② */
    await pg.fill('#sbBusca', 'ZETA NEW SHOP'); await pg.waitForSelector('#sbBuscaRes .graf-vazio', { timeout: 3000 }).catch(() => errs.push('② nothing found'));
    await pg.click('.sb [data-act="sb-cad"]').catch(() => errs.push('② add-customer button'));
    await pg.waitForSelector('#naStore', { timeout: 4000 }).catch(() => errs.push('② new-account form opens'));
    if ((await pg.inputValue('#naStore').catch(() => '')) !== 'ZETA NEW SHOP') errs.push('② typed name carried into the form');
    await pg.fill('#naAddr', '9 ZETA RD'); await pg.fill('#naCity', 'ORLANDO'); await pg.fill('#naState', 'FL'); await pg.fill('#naZip', '32801'); await pg.selectOption('#naSm', 'ALEX');
    await pg.click('#naGo'); if (await pg.waitForSelector('#cfOk', { timeout: 800 }).catch(() => null)) await pg.click('#cfOk');
    await pg.waitForSelector('#sbP', { timeout: 5000 }).catch(() => errs.push('② new store is selected right away'));
    const card2 = await pg.textContent('.sb .ups-cli-sel').catch(() => ''); if (!/ZETA NEW SHOP/.test(card2) || !/9 ZETA RD/.test(card2)) errs.push('② card shows the new store :: ' + card2.slice(0, 80));
    const nacc = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.accounts || {}).find(a => a.store === 'ZETA NEW SHOP')); if (!nacc || !nacc.pending) errs.push('② account saved (pending, temp number)');
    await trocar();
    /* ③ */
    await pick('5555'); await pg.waitForSelector('.sb .vend-op', { timeout: 5000 }).catch(() => errs.push('③ seller grid when the store has no salesman'));
    if (await pg.$('#sbP')) errs.push('③ no box fields before the seller is chosen');
    if (!(await pg.isChecked('#sbVendKeep').catch(() => false))) errs.push('③ "save as the store salesman" is on by default');
    await pg.click('.sb [data-vend="SOO"]'); await pg.waitForSelector('#sbP', { timeout: 5000 }).catch(() => errs.push('③ boxes after choosing'));
    const chip = await pg.textContent('.sb .vend-chip').catch(() => ''); if (!/SOO/.test(chip)) errs.push('③ chip shows SOO :: ' + chip);
    if (((await doc('accounts', '5555')) || {}).sm !== 'SOO') errs.push('③ store record gets sm SOO');
    await box(10, 10, 10, 10); await pg.click('.sb [data-act="sb-finalizar"]');
    await waitQ("q.st === 'wait' && q.acct === '5555'").catch(() => errs.push('③ label request'));
    const W3 = (await shipq("q.st === 'wait' && q.acct === '5555'"))[0] || {}; log('③ label req sm:', W3.sm, 'fmt:', W3.fmt);
    if (W3.sm !== 'SOO') errs.push('③ shipment carries the seller SOO');
    if (((await doc('adhoc', W3._id)) || {}).sm !== 'SOO') errs.push('③ adhoc carries the seller SOO');
    await answer(W3._id, { st: 'done', env: 'test', track: '1Z5555', charge: 12, fmt: 'ZPL', labels: [{ trk: '1Z5555', img: '' }] });
    await pg.waitForSelector('#sbBusca', { timeout: 15000 }).catch(() => errs.push('③ back to the store search'));
    await pick('5556'); await pg.waitForSelector('.sb .vend-op', { timeout: 5000 });
    await pg.uncheck('#sbVendKeep'); await pg.click('.sb [data-vend="KAEL"]'); await pg.waitForSelector('#sbP', { timeout: 5000 });
    if (((await doc('accounts', '5556')) || {}).sm) errs.push('③ unticked → store record untouched');
    if (!(await pg.$('.sb [data-act="vend-trocar"]'))) errs.push('③ chosen seller can be changed');
    await trocar();
    /* ④ */
    await pick('3001'); await pg.waitForSelector('#sbP');
    await pg.click('.sb [data-act="sb-editar"]').catch(() => errs.push('④ edit destination button')); await pg.waitForSelector('.sb-mdl #sbDEnd', { timeout: 3000 });
    if ((await pg.inputValue('.sb-mdl #sbDEnd')) !== '77 ORANGE AVE') errs.push('④ form starts with the store address');
    await pg.fill('.sb-mdl #sbDEnd', '100 New St'); await pg.fill('.sb-mdl #sbDEnd2', 'Ste 5'); await pg.fill('.sb-mdl #sbDCep', '32803'); await pg.click('.sb-mdl #sbDOk');
    await pg.waitForSelector('.sb .dest-ed', { timeout: 3000 }).catch(() => errs.push('④ "changed for this shipment" note'));
    const card4 = await pg.textContent('.sb .ups-cli-sel'); if (!/100 NEW ST/.test(card4) || !/STE 5/.test(card4) || !/32803/.test(card4)) errs.push('④ card shows the new address');
    if (((await doc('accounts', '3001')) || {}).addr !== '77 ORANGE AVE') errs.push('④ store record untouched');
    /* ⑤ */
    await pg.waitForSelector('#sbProdBusca', { timeout: 6000 }).catch(() => errs.push('⑤ Empty Display search'));
    await pg.fill('#sbProdBusca', 'AHG100'); await pg.waitForSelector('[data-sb-prod="AHG100"]', { timeout: 4000 }).catch(() => errs.push('⑤ product with shipping size is found'));
    await pg.press('#sbProdBusca', 'Enter'); await pg.waitForSelector('[data-sb-pq="AHG100"]', { timeout: 3000 });
    if ((await pg.evaluate(() => document.activeElement && document.activeElement.dataset.sbPq)) !== 'AHG100') errs.push('⑤ cursor goes to the quantity');
    const med = await pg.textContent('.sb .nu-prod-chip .nu-prod-med'); if (!/2 lb/.test(med) || !/20 × 15 × 10/.test(med)) errs.push('⑤ chip shows prodExtra weight/size :: ' + med);
    await pg.keyboard.type('2'); await pg.click('.sb [data-act="sb-prod-add"]'); await pg.waitForTimeout(300);
    const fe = await pg.$$eval('.sb .su-feita', L => L.map(x => x.textContent)); log('⑤ boxes:', JSON.stringify(fe));
    if (fe.length !== 2 || !fe.every(t => /2 lb/.test(t) && /20 × 15 × 10/.test(t) && /AHG100/.test(t))) errs.push('⑤ one box per unit with the product size');
    await pg.click('.sb [data-act="sb-finalizar"]');
    await waitQ("q.st === 'wait' && q.acct === '3001'").catch(() => errs.push('⑤ label request'));
    const W5 = (await shipq("q.st === 'wait' && q.acct === '3001'"))[0] || {}; log('⑤ req:', JSON.stringify({ to: W5.to && [W5.to.addr1, W5.to.addr2, W5.to.zip], boxes: (W5.boxes || []).map(b => [b.w, b.l, b.wd, b.h, b.ref2]), fmt: W5.fmt }));
    if (!W5.to || W5.to.addr1 !== '100 NEW ST' || W5.to.addr2 !== 'STE 5' || W5.to.zip !== '32803') errs.push('④ label request goes to the edited address');
    if ((W5.boxes || []).length !== 2 || W5.boxes.some(b => b.w !== 2 || b.l !== 20 || b.wd !== 15 || b.h !== 10 || b.ref2 !== 'AHG100')) errs.push('⑤ label request: 2 product boxes');
    if (W5.fmt !== 'ZPL') errs.push('⑤ label format from settings (ZPL)');
    const zpl = Buffer.from('^XA^FO50,50^FDTEST^FS^XZ').toString('base64');
    await answer(W5._id, { st: 'done', env: 'test', track: '1ZAAA1 1ZAAA2', charge: 20, fmt: 'ZPL', labels: [{ trk: '1ZAAA1', img: zpl, fmt: 'ZPL' }, { trk: '1ZAAA2', img: zpl, fmt: 'ZPL' }] });
    await pg.waitForSelector('.sb .sb-dl a[download]', { timeout: 8000 }).catch(() => errs.push('⑤ download links on the success screen'));
    await pg.waitForTimeout(800); log('⑤ downloads:', downs.join(', '));
    if (!downs.includes('ups_1ZAAA1_1.zpl') || !downs.includes('ups_1ZAAA2_2.zpl')) errs.push('⑤ both ZPL labels downloaded');
    if (await pg.$('#prt.on')) errs.push('⑤ ZPL is not sent to the browser printer');
    const st = (await doc('stock', 'AHG100')) || {}; log('⑤ stock AHG100:', st.qty); if (st.qty !== 8) errs.push('⑤ stock out after the label (10 → 8)');
    await pg.waitForSelector('#sbBusca', { timeout: 6000 });
    await pick('3001'); await pg.waitForSelector('#sbP');
    if (await pg.$('.sb .dest-ed')) errs.push('④ edited destination ends with the shipment');
    await pg.click('.sb [data-act="sb-editar"]'); await pg.waitForSelector('.sb-mdl #sbDEnd'); await pg.fill('.sb-mdl #sbDEnd', '200 Saved Rd'); await pg.check('.sb-mdl #sbDGrava'); await pg.click('.sb-mdl #sbDOk'); await pg.waitForTimeout(400);
    if (((await doc('accounts', '3001')) || {}).addr !== '200 SAVED RD') errs.push('④ "also save" updates the store record');
    await trocar();
    /* ⑥ */
    await pick('5557'); await pg.waitForSelector('#sbP'); await box(3, 5, 5, 5); await pg.click('.sb [data-act="sb-finalizar"]');
    await pg.waitForSelector('.sb-mdl.sb-falta .sb-mdl-card', { timeout: 3000 }).catch(() => errs.push('⑥ missing-data window'));
    const li = await pg.$$eval('.sb-mdl.sb-falta .env-falta li', L => L.length).catch(() => 0); log('⑥ missing:', li); if (li < 3) errs.push('⑥ lists address · city · ZIP');
    if ((await shipq("q.st === 'wait' && q.acct === '5557'")).length) errs.push('⑥ nothing sent to UPS');
    await fechaMdl(); await trocar();
    /* ⑦ */
    await pick('1111'); await pg.waitForSelector('#sbP'); await box(4, 6, 6, 6); await pg.click('.sb [data-act="sb-finalizar"]');
    await waitQ("q.st === 'wait' && q.acct === '1111'"); let W7 = (await shipq("q.st === 'wait' && q.acct === '1111'"))[0];
    await answer(W7._id, { st: 'error', err: 'Firestore 쓰기 실패 500', orphan: true, env: 'live', track: '1ZORPHAN1', labels: [{ trk: '1ZORPHAN1', img: '' }] });
    await pg.waitForSelector('.sb-mdl.sb-orfao .sb-mdl-card', { timeout: 8000 }).catch(() => errs.push('⑦ orphan window'));
    if ((await pg.inputValue('.sb-mdl.sb-orfao #sbOrfTrk').catch(() => '')) !== '1ZORPHAN1') errs.push('⑦ orphan window shows the tracking');
    await fechaMdl();
    await pg.click('.sb [data-act="sb-finalizar"]'); await waitQ("q.st === 'wait' && q.acct === '1111'"); W7 = (await shipq("q.st === 'wait' && q.acct === '1111'"))[0];
    await answer(W7._id, { st: 'error', err: 'UPS 로그인 실패: 스크립트 속성에 UPS_CLIENT_ID · UPS_CLIENT_SECRET · UPS_ACCOUNT 를 넣어 주세요' });
    await pg.waitForSelector('.sb-mdl.sb-semcred .sb-mdl-card', { timeout: 8000 }).catch(() => errs.push('⑦ missing-credentials window'));
    const nq = (await shipq("q.acct === '1111' && q.st !== 'rate' && q.st !== 'ratedone'")).length; await fechaMdl();
    await pg.click('.sb [data-act="sb-finalizar"]'); await pg.waitForSelector('.sb-mdl.sb-semcred .sb-mdl-card', { timeout: 3000 }).catch(() => errs.push('⑦ next press shows the window right away'));
    if ((await shipq("q.acct === '1111' && q.st !== 'rate' && q.st !== 'ratedone'")).length !== nq) errs.push('⑦ no new label request without credentials');
  } catch (e) { errs.push('crash: ' + e.message); }
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
