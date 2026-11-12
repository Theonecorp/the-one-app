/* v0.8.195 시험 — 🧩 인서트: 옛 WMS 의 Criar insert · Inserts prontos — 전체 화면 질문 · 번호 그리드 · 빈 박스 자동 대체 · INS 번호 · 라벨 3가지 · 목록 · 해체 · 삭제(관리자)
 *   ① 세일즈맨: #/insert 는 "재고 담당만" 안내 · 질문 화면 없음
 *   ② 관리자: 상품 EB103 → (틀 없음) 크기 C4 → 훅 4 → 훅당 2 → 그리드 EB103 · EB108 · EB108 · EB113 → 틀 저장(insModelos) → 2개
 *   ③ 구성표 4줄 · EB113 은 빈 박스라 같은 가격 EB148 로 자동 대체(같은 가격) · 합계 $25.50
 *   ④ 만들기 → inserts 2개 INS-0001 · INS-0002 (부품 재고 그대로) · 인쇄 = 훅 라벨 8 + 가격 라벨 2 + 체크리스트 2 · #/inserts 로
 *   ⑤ 완성된 인서트: 재고 있음 2 · 검색 INS-0002 → 1줄 · 펼치면 구성(EB148 대체 표시)
 *   ⑥ 해체 INS-0001 → desmontado · 재고 있음 1 / ⑦ 같은 틀 다시 "제작 및 인쇄" → 질문 없이 구성표 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8913', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const SEED = `s.stock = [{ id: 'EB113', code: 'EB113', qty: 0, vazia: true, at: '2026-11-01T00:00:00Z' }, { id: 'EB103', code: 'EB103', qty: 40, at: '2026-11-01T00:00:00Z' }, { id: 'EB148', code: 'EB148', qty: 30, at: '2026-11-01T00:00:00Z' }];`;
  const ctx = await br.newContext({ viewport: { width: 1280, height: 1000 } });
  const mk = async email => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed: SEED }); await pg.goto('http://127.0.0.1:8913/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  const store = (pg, col) => pg.evaluate(c => Object.values(window.__MOCK_STORE__[c] || {}), col);
  const ok = pg => pg.click('.ins-tcw [data-tc-ok]');
  /* ① */
  let pg = await mk('brandon@x.com'); await pg.evaluate(() => { location.hash = '#/insert'; }); await pg.waitForSelector('.sb', { timeout: 8000 }); await pg.waitForTimeout(800);
  if (!(await pg.$('.im-restrito'))) errs.push('① salesman sees the restricted notice'); if (await pg.$('.ins-tcw')) errs.push('① salesman gets no wizard'); await pg.close();
  /* ② */
  pg = await mk('luke@theonefl.com');
  await pg.evaluate(() => { location.hash = '#/insert'; }); await pg.waitForSelector('.ins-tcw #tcValor', { timeout: 10000 }).catch(() => errs.push('② wizard opens on #/insert'));
  const foc = await pg.evaluate(() => document.activeElement && document.activeElement.id); if (foc !== 'tcValor') errs.push('② cursor on the product field :: ' + foc);
  await pg.keyboard.type('ZZZ999'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(200);
  const er = await pg.textContent('#tcErro'); if (!er.trim()) errs.push('② unknown code shows an error');
  await pg.fill('#tcValor', 'EB103'); await pg.keyboard.press('Enter');
  await pg.waitForSelector('.ins-tcw .tc.roxo [data-tc-texto="C4"]', { timeout: 3000 }).catch(() => errs.push('② no template yet → size question (purple) with C4…'));
  await pg.waitForTimeout(250); await pg.click('.ins-tcw [data-tc-texto="C4"]');
  await pg.waitForSelector('.ins-tcw [data-tc-set="4"]'); await pg.waitForTimeout(250); await pg.click('.ins-tcw [data-tc-set="4"]'); await ok(pg);
  await pg.waitForSelector('.ins-tcw [data-tc-set="2"]'); await pg.waitForTimeout(250); await pg.click('.ins-tcw [data-tc-set="2"]'); await ok(pg);
  await pg.waitForSelector('.ins-tcw .tc-grade .im-grade', { timeout: 3000 }).catch(() => errs.push('② number grid'));
  await pg.waitForTimeout(250);
  const dis0 = await pg.$eval('.ins-tcw [data-tc-ok]', b => b.disabled); if (!dis0) errs.push('② save disabled until 4 numbers');
  for (const n of ['103', '108', '108', '113']) await pg.click('.ins-tcw [data-im-num="' + n + '"]');
  const cont = await pg.textContent('#imCont'); const hk = await pg.$$eval('.ins-tcw .im-hk.on', L => L.map(x => x.textContent));
  log('② grid:', cont, JSON.stringify(hk)); if (hk.length !== 4 || !/EB113/.test(hk[3]) || !/EB108/.test(hk[2])) errs.push('② hooks filled in click order (repeat allowed)');
  if (!(await pg.$('.ins-tcw .im-q.vazia[data-im-num="113"]'))) errs.push('② empty box shown dimmed on the grid');
  await ok(pg);
  await pg.waitForSelector('.ins-tcw [data-tc-set="2"]', { timeout: 3000 }); await pg.waitForTimeout(250);
  const M = await store(pg, 'insModelos'); log('② model:', JSON.stringify(M.map(m => [m.familia, m.tamanho, m.nRooks, m.pecas, m.numeros])));
  if (M.length !== 1 || M[0].familia !== 'EB' || M[0].tamanho !== 'C4' || M[0].nRooks !== 4 || M[0].pecas !== 2 || M[0].numeros.join(',') !== '103,108,108,113') errs.push('② template saved (EB · C4 · 4 hooks × 2 · 103 108 108 113)');
  await pg.click('.ins-tcw [data-tc-set="2"]'); await ok(pg);
  /* ③ */
  await pg.waitForSelector('.ins-comp tbody tr', { timeout: 4000 }).catch(() => errs.push('③ composition table'));
  const rows = await pg.$$eval('.ins-comp tbody tr[data-rook]', L => L.map(r => r.textContent.replace(/\s+/g, ' ')));
  log('③ rows:', rows.length, rows[3]); if (rows.length !== 4) errs.push('③ 4 hooks');
  if (!/EB148/.test(rows[3] || '') || !(await pg.$('.ins-comp tr.ins-sub[data-rook="4"] .pdz-am'))) errs.push('③ hook 4 (EB113 empty) auto-replaced by EB148 (same price)');
  const tot = await pg.textContent('.pdz-total b'); log('③ total:', tot); if (!/25\.50/.test(tot)) errs.push('③ total $25.50');
  const dis = await pg.$eval('[data-act="ins-montar"]', b => b.disabled); if (dis) errs.push('③ build enabled');
  /* ④ */
  await pg.click('[data-act="ins-montar"]');
  await pg.waitForSelector('#prt.on', { timeout: 6000 }).catch(() => errs.push('④ print opens'));
  const prt = await pg.evaluate(() => ({ h: document.querySelectorAll('#prtbody .ietq:not(.ietq-valor)').length, v: document.querySelectorAll('#prtbody .ietq-valor').length, c: document.querySelectorAll('#prtbody .ichk').length, sub: document.querySelector('#prtbody .ichk-l.sub') ? document.querySelector('#prtbody .ichk-l.sub').textContent : '' }));
  log('④ print:', JSON.stringify(prt)); if (prt.h !== 8 || prt.v !== 2 || prt.c !== 2) errs.push('④ 8 hook labels + 2 price labels + 2 checklists');
  if (!/EB148/.test(prt.sub) || !/EB113/.test(prt.sub)) errs.push('④ checklist marks EB148 instead of EB113');
  const hookLbl = await pg.$$eval('#prtbody .ietq:not(.ietq-valor) b', L => L.map(x => x.textContent)); if (hookLbl[3] !== 'EB113') errs.push('④ hook label keeps the template code (EB113) :: ' + hookLbl[3]);
  const INS = (await store(pg, 'inserts')).sort((a, b) => a.codigo.localeCompare(b.codigo));
  log('④ inserts:', JSON.stringify(INS.map(x => [x.codigo, x.preco, x.status, x.emEstoque, x.nSub, x.itens.length])));
  if (INS.length !== 2 || INS[0].codigo !== 'INS-0001' || INS[1].codigo !== 'INS-0002' || INS[0].preco !== 25.5 || INS[0].nSub !== 1 || INS[0].status !== 'montado') errs.push('④ 2 inserts INS-0001/0002 · $25.50 · 1 substitute');
  const st = await pg.evaluate(() => window.__MOCK_STORE__.stock.EB103.qty); if (st !== 40) errs.push('④ pieces stock untouched :: ' + st);
  await pg.click('#prtClose');
  /* ⑤ */
  await pg.waitForFunction(() => location.hash.indexOf('#/inserts') === 0 && document.querySelector('.ins-prontos'), null, { timeout: 5000 }).catch(() => errs.push('⑤ goes to Ready inserts'));
  const tiles = await pg.$$eval('.ins-prontos .tile .val', L => L.map(x => x.textContent)); log('⑤ tiles:', JSON.stringify(tiles)); if (tiles[0] !== '2') errs.push('⑤ 2 available');
  await pg.fill('#insListaBusca', 'INS-0002'); await pg.waitForTimeout(500);
  const n5 = await pg.$$eval('#insListaRes tr[data-ins-abrir]', L => L.length); if (n5 !== 1) errs.push('⑤ search finds 1 :: ' + n5);
  await pg.click('#insListaRes tr[data-ins-abrir] td.principal b'); await pg.waitForSelector('.ins-det', { timeout: 3000 }).catch(() => errs.push('⑤ row opens the detail'));
  const det = await pg.textContent('.ins-det'); if (!/EB148/.test(det) || !(await pg.$('.ins-det-lista span.sub'))) errs.push('⑤ detail shows composition with the substitute');
  /* ⑥ */
  await pg.fill('#insListaBusca', ''); await pg.waitForTimeout(500);
  const id1 = INS[0].id; await pg.click('[data-ins-desmontar="' + id1 + '"]'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(600);
  const d1 = await pg.evaluate(id => window.__MOCK_STORE__.inserts[id], id1); if (d1.status !== 'desmontado' || d1.emEstoque !== 0) errs.push('⑥ taken apart');
  const tiles2 = await pg.$$eval('.ins-prontos .tile .val', L => L.map(x => x.textContent)); if (tiles2[0] !== '1') errs.push('⑥ 1 available after taking apart :: ' + tiles2[0]);
  /* ⑦ */
  await pg.evaluate(() => { location.hash = '#/insert'; }); await pg.waitForSelector('.ins-tcw [data-tc-cancel]', { timeout: 5000 }).catch(() => errs.push('⑦ wizard opens again'));
  await pg.waitForTimeout(250); await pg.click('.ins-tcw [data-tc-cancel]');
  await pg.waitForSelector('[data-im-montar]', { timeout: 5000 }).catch(() => errs.push('⑦ template list on Create insert'));
  await pg.waitForTimeout(300); await pg.click('[data-im-montar]'); await pg.waitForSelector('.ins-comp tbody tr[data-rook]', { timeout: 4000 }).catch(() => errs.push('⑦ build from template goes straight to the composition'));
  if (await pg.$('.ins-tcw .tc.on')) errs.push('⑦ no questions when building from a template');
  await pg.close();
  log(errs.length ? 'FAIL' : 'PASS'); if (errs.length) console.log(errs);
  await br.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})();
