/* v0.8.214 시험 — 📦 Notes UPS: 옛 WMS 의 Notes UPS 화면 그대로 (숫자 칸 · 새 박스 · 대기 줄 · 합치기 · 기록)
 *   ① 숫자 4개: 오늘 박스(어제 대비 % ↗) · 오늘 무게 · 오늘 출고 · 대기(가게 수) · 머리 경로 · 시계 · Nova caixa
 *   ② 새 박스: 가게 찾기(계정 Enter · 고객 등록 단추) → 가게 카드(주소 · 계정 · 전화 · 담당 + UPS 주소 확인 요청이 저절로) → 몇 박스 → 무게 · 크기 Enter → 지난 박스 크기
 *      → 마지막 박스에서 그 가게 대기 줄 전부 라벨(N/T) · 가게 찾기로 돌아감
 *   ③ 대기 줄: 가게별 · 전부 고르기 · 고른 것 인쇄 · 둘 고르기 → 박스 합치기(무게 합 제안 · 크기 직접) → 새 박스 하나 · 옛 박스 취소(mergedInto) · 새 라벨만
 *   ④ ⋮ 메뉴: 전부 인쇄 · 대기 줄 CSV · 고르기 지우기 / 줄: 보기(창) · 고치기(무게) · 빼기(취소 — 누가 · 언제)
 *   ⑤ 기록: 칩(7일) · 상태 거르기 · 검색 · 직접 기간 · 그래프 · 합계 · 8줄씩 쪽 · CSV
 *   ⑥ 폰(430): FAB · 숫자 칸 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8972', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const SEED = `const n = new Date().toISOString(), y = new Date(Date.now() - 864e5).toISOString(), d3 = new Date(Date.now() - 3 * 864e5).toISOString(); s.upsnotes = [
      { id: 'NU1', acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', w: 12, l: 16, wd: 12, h: 10, st: 'open', src: 'notes', at: n, by: 'luke@theonefl.com', byName: 'LUKE' },
      { id: 'NU2', acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', w: 9.5, l: 16, wd: 12, h: 10, st: 'open', src: 'notes', at: n, by: 'luke@theonefl.com', byName: 'LUKE', prods: [{ c: 'LB2', n: 'BASE - 2FL TIER (LONG)', q: 1 }] },
      { id: 'NU3', acct: '1111', store: 'ALI B/S # 1', w: 5, l: 10, wd: 10, h: 10, st: 'open', src: 'notes', at: y, by: 'ana@x.com', byName: 'ANA' },
      { id: 'NU4', acct: '1111', store: 'ALI B/S # 1', w: 4, l: 10, wd: 10, h: 10, st: 'shipped', shippedAt: n, trk: '1ZTEST', src: 'notes', at: y, by: 'ana@x.com', byName: 'ANA' }]
      .concat(Array.from({ length: 9 }, (_, i) => ({ id: 'H' + i, acct: '1271', store: 'BEAUTY 4U', w: 3, l: 5, wd: 5, h: 5, st: 'x', cancelAt: d3, src: 'notes', at: d3, by: 'ana@x.com', byName: 'ANA' })));`;
  const pg = await (await br.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(o => { localStorage.setItem('theone.lang', 'pt'); window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', o); }, SEED);
  await pg.goto('http://127.0.0.1:8972/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  const store = c => pg.evaluate(c => Object.values(window.__MOCK_STORE__[c] || {}), c);
  const printed = async () => { await pg.waitForSelector('#prt.on', { timeout: 8000 }); const P = await pg.$$eval('#prtbody .nulp', L => L.map(x => ({ cx: x.querySelector('.etqn-cx').textContent, conta: x.querySelector('.etqn-conta').textContent, med: x.querySelector('.etqn-med').textContent }))); await pg.click('#prtClose'); await pg.waitForTimeout(200); return P; };
  const sim = async () => { await pg.waitForSelector('#esPergSim', { timeout: 5000 }); await pg.click('#esPergSim'); };
  const dl = async f => { const [d] = await Promise.all([pg.waitForEvent('download', { timeout: 5000 }), f()]); return d.suggestedFilename(); };
  try {
    /* ① */
    await pg.evaluate(() => { location.hash = '#/notesups'; }); await pg.waitForSelector('.sb.nu-raiz tr[data-nota]', { timeout: 8000 });
    const K = await pg.$$eval('.nu-kpis .fin-kpi', L => L.map(k => k.querySelector('.lbl').textContent + '=' + k.querySelector('b').textContent + ' (' + k.querySelector('.sub').textContent + ')')); log('① kpis:', K.join(' | '));
    if (K.length !== 4 || !/^Caixas hoje=2 \(— 0% vs\. ontem \(2\)\)/.test(K[0]) || !/^Peso hoje=22 lb \(↗ 139% vs\. ontem \(9 lb\)\)/.test(K[1]) || !/^Despachadas hoje=1/.test(K[2]) || !/^Esperando=3 \(em 2 loja/.test(K[3])) errs.push('① 4 KPIs as old (with % vs yesterday)');
    if (!/Painel.*Expedição.*Notes UPS/.test(await pg.textContent('.nu-migalha')) || !(await pg.$('#nuRelogio'))) errs.push('① breadcrumb + clock');
    /* ② */
    await pg.click('[data-act="nu-novo"]'); await pg.waitForSelector('#nuBusca');
    if (!(await pg.$('[data-act="cl-novo"]'))) errs.push('② Cadastrar cliente button');
    if ((await pg.evaluate(() => document.activeElement && document.activeElement.id)) !== 'nuBusca') errs.push('② search is focused');
    await pg.fill('#nuBusca', '3001'); await pg.press('#nuBusca', 'Enter'); await pg.waitForSelector('[data-act="nu-qtd"][data-n="2"]');
    const cz = await pg.textContent('.ups-cli-sel.cartaz'); log('② card:', cz.replace(/\s+/g, ' ').slice(0, 160));
    if (!/77 ORANGE AVE/.test(cz) || !/Código da loja/.test(cz)) errs.push('② store card with address and account');
    await pg.waitForFunction(() => Object.values(window.__MOCK_STORE__.shipq || {}).some(q => q.kind === 'av' && q.to && /ORANGE/.test(q.to.addr1)), null, { timeout: 5000 }).catch(() => errs.push('② UPS address check requested automatically'));
    await pg.click('[data-act="nu-qtd"][data-n="2"]'); await pg.waitForSelector('#nuP');
    if ((await pg.evaluate(() => document.activeElement && document.activeElement.id)) !== 'nuP') errs.push('② weight focused');
    for (const v of ['10', '18', '14', '12']) { await pg.keyboard.type(v); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80); }
    await pg.waitForSelector('.nu-passo.ok', { timeout: 6000 }).catch(() => errs.push('② box 1 saved'));
    await pg.click('[data-act="nu-ultima"]'); await pg.waitForTimeout(150);
    if ((await pg.inputValue('#nuC')) !== '18' || (await pg.inputValue('#nuP')) !== '') errs.push('② last size copied, weight empty');
    await pg.click('#nuP'); await pg.keyboard.type('7'); for (let i = 0; i < 4; i++) { await pg.keyboard.press('Enter'); await pg.waitForTimeout(80); }
    const P = await printed(); log('② labels:', JSON.stringify(P.map(x => x.cx)));
    if (P.length !== 4 || P[3].cx !== '4/4' || P[0].conta !== '3001') errs.push('② the whole store queue printed N/T (4/4)');
    await pg.waitForSelector('#nuBusca', { timeout: 4000 }).catch(() => errs.push('② back to store search after the batch'));
    /* ③ */
    await pg.click('[data-act="nu-fechar-novo"]'); await pg.waitForTimeout(150);
    if ((await pg.$$('tr.nu-grupo')).length !== 2 || (await pg.$$('tr[data-nota]')).length !== 5) errs.push('③ queue grouped by store (5 rows)');
    await pg.click('input[data-act="nu-todos"]'); await pg.waitForTimeout(150); if ((await pg.$$('input[data-act="nu-marcar"]:checked')).length !== 5) errs.push('③ select all');
    await pg.click('[data-act="nu-imp-sel"]'); if ((await printed()).length !== 5) errs.push('③ print selected');
    await pg.click('input[data-act="nu-todos"]'); await pg.waitForTimeout(150);
    await pg.click('input[data-act="nu-marcar"][data-id="NU1"]'); await pg.waitForTimeout(100); await pg.click('input[data-act="nu-marcar"][data-id="NU2"]'); await pg.waitForTimeout(100);
    await pg.click('[data-act="nu-unir"]'); await pg.waitForSelector('#nuUP'); if ((await pg.inputValue('#nuUP')) !== '21.5') errs.push('③ merge suggests summed weight 21.5');
    await pg.fill('#nuUC', '20'); await pg.fill('#nuUL', '16'); await pg.fill('#nuUA', '12'); await sim();
    const PM = await printed(); log('③ merged label:', JSON.stringify(PM));
    const U = await store('upsnotes'), nv = U.find(x => x.unidas); if (PM.length !== 1 || !/^\d+$/.test(PM[0].cx) || !nv || nv.w !== 21.5 || U.find(x => x.id === 'NU1').mergedInto !== nv.id || U.find(x => x.id === 'NU2').st !== 'x' || !(nv.prods || []).find(p => p.c === 'LB2')) errs.push('③ one new box, old ones cancelled, products kept');
    /* ④ */
    await pg.click('[data-act="nu-menu"]'); await pg.waitForSelector('.nu-menu'); await pg.click('[data-act="nu-imp-todas"]'); if ((await printed()).length !== 4) errs.push('④ print all (4 waiting)');
    await pg.click('[data-act="nu-menu"]'); const f1 = await dl(() => pg.click('[data-act="nu-exp-fila"]')); if (f1 !== 'notes-ups-queue.csv') errs.push('④ export queue CSV');
    await pg.click('[data-act="nu-ver"][data-id="NU3"]'); await pg.waitForSelector('.nu-det'); if (!/ALI B\/S # 1/.test(await pg.textContent('.nu-det'))) errs.push('④ view box'); await pg.click('#nuUmOk');
    await pg.click('tr[data-nota="NU3"] [data-act="nu-ed"]'); await pg.waitForSelector('#nuEdP'); await pg.fill('#nuEdP', '6.5'); await pg.click('#nuEdOk'); await pg.waitForTimeout(400);
    if ((await store('upsnotes')).find(x => x.id === 'NU3').w !== 6.5) errs.push('④ edit weight');
    await pg.click('tr[data-nota="NU3"] [data-act="nu-excluir"]'); await sim(); await pg.waitForTimeout(400);
    const x3 = (await store('upsnotes')).find(x => x.id === 'NU3'); if (x3.st !== 'x' || !x3.cancelByName || (await pg.$('tr[data-nota="NU3"]'))) errs.push('④ delete = cancel (who · when), leaves the queue');
    /* ⑤ */
    await pg.click('[data-act="nu-per"][data-p="7"]'); await pg.waitForSelector('#nuHSt');
    const reg = async () => pg.textContent('.nu-hcard h4:last-of-type').catch(() => ''), regs = await pg.$$eval('.nu-hcard h4', L => L.map(x => x.textContent)); log('⑤ 7 days:', regs.join(' | '));
    if (!(await pg.$('.nu-graf rect.g-cri'))) errs.push('⑤ chart');
    if (!(await pg.$('.hist-pag [data-act="nu-hpag"][data-pag="2"]'))) errs.push('⑤ pagination (8 per page)');
    await pg.selectOption('#nuHSt', 'cancelada'); await pg.waitForTimeout(200); const rc = await pg.$$eval('.nu-hcard', L => L[1].querySelector('h4').textContent); log('⑤ cancelled:', rc); if (!/Registros \(12\)/.test(rc)) errs.push('⑤ status filter (12 cancelled)');
    await pg.selectOption('#nuHSt', ''); await pg.fill('#nuHBusca', 'beauty 4u'); await pg.waitForTimeout(200); if (!/Registros \(9\)/.test(await pg.$$eval('.nu-hcard', L => L[1].querySelector('h4').textContent))) errs.push('⑤ search');
    if ((await pg.evaluate(() => document.activeElement && document.activeElement.id)) !== 'nuHBusca') errs.push('⑤ search keeps focus');
    const f2 = await dl(() => pg.click('[data-act="nu-export"]')); if (f2 !== 'notes-ups.csv') errs.push('⑤ export CSV');
    const ont = new Date(Date.now() - 864e5); const oi = ont.getFullYear() + '-' + String(ont.getMonth() + 1).padStart(2, '0') + '-' + String(ont.getDate()).padStart(2, '0');
    await pg.fill('#nuHBusca', ''); await pg.waitForTimeout(100); await pg.fill('#nuDe', oi); await pg.fill('#nuAte', oi); await pg.dispatchEvent('#nuAte', 'change'); await pg.waitForTimeout(400);
    if (!(await pg.$('.nu-chip.on[data-p="pers"]'))) errs.push('⑤ custom period chip');
    /* ⑥ */
    await pg.setViewportSize({ width: 430, height: 900 }); await pg.waitForTimeout(300);
    if (!(await pg.isVisible('.nu-nova.fab-cel'))) errs.push('⑥ phone FAB');
  } catch (e) { errs.push('crash: ' + e.message); }
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
