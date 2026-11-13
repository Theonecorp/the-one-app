/* v0.8.174 시험 — 🖼 Notes Display 손질 · 🧩 인서트 요청에 "어떤 것" 설명 (v0.8.214: Notes Display 가 옛 WMS 흐름이 되어 ②③④ 를 그 흐름으로)
 *   ① 세일즈맨 메모 탭: C13 Insert 를 올리면 설명 칸(data-rqn) + 🧩 세트 고르기 → SET ORDER 분류의 아이템을 고르면 "코드 이름" 이 들어감 · 주문에 reqNote 로 저장 · 받침(LD 등)은 설명 칸 없음
 *   ② 사무실 주문 창: 요청 줄에 설명이 같이 보임 · 🖼 Notes Display 를 열면 종류 · 개수 · 설명이 Outros 줄로 미리 채워짐 · 보내면 notasDisplay 줄의 texto · qtd
 *   ③ 새 요청 칸: 가게 찾기 칸 옆 "고객 등록" (옛 Cadastrar cliente) · 상품 찾기는 Empty Display 만 (일반 아이템은 안 나옴)
 *   ④ 창고: 예전 displays(열린 것)가 옮겨진 카드 → 준비 시작 → 놓기(Liberar) → 대기 · 다시 시작 → 취소 (옛 WMS 에 없는 보류 · 문제 기록 · 다시 준비는 v0.8.214 에서 빠짐) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8828', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const SEED = "const c0 = s.catalog.find(x => x.id === 'c0'); const rows = JSON.parse(c0.j); rows.forEach(r => { if (r[0] === 'FLSIDE52') { r[5] = 'Set & Display'; r[6] = 'SET ORDER\"\"'; r[7] = 'FLOOR'; r[8] = 'BODY J'; } }); rows.push(['LD(STACKABLE)', 'LD STACKABLE', 10, 0, '', 'Set Orders & Displays', 'EMPTY DISPLAY', '', '', '']); c0.j = JSON.stringify(rows); c0.n = rows.length; const meta = s.catalog.find(x => x.id === 'meta'); meta.cats = meta.cats.concat(['Set & Display\\u0001SET ORDER\"\"\\u0001FLOOR\\u0001BODY J']);";
  const mk = async (email, job, seed, w) => {
    const pg = await (await br.newContext({ viewport: { width: w || 430, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', (o.job ? 'let u = s.users.find(x => x.id === "' + o.email + '"); if (!u) { u = { id: "' + o.email + '", email: "' + o.email + '", name: "X", active: true }; s.users.push(u); } u.role = "manager"; u.job = "' + o.job + '";' : '') + o.seed); }, { email, job, seed: SEED + (seed || '') });
    await pg.goto('http://127.0.0.1:8828/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(300); return pg;
  };
  /* ① 세일즈맨 */
  const sm = await mk('brandon@x.com', '');
  await sm.evaluate(() => { location.hash = '#/order/new'; }); await sm.waitForSelector('#eStoreQ'); await sm.fill('#eStoreQ', 'ali'); await sm.waitForTimeout(250); await sm.click('#eStoreHits [data-ac]'); await sm.waitForTimeout(900); if (await sm.$('#modal.on')) { await sm.click('#modal .mclose'); await sm.waitForTimeout(200); }
  await sm.fill('#eQ1', 'AHG100'); await sm.waitForTimeout(500); await sm.click('#eRes [data-gc="AHG100"], #eRes tr[data-frow="AHG100"] td.ct'); await sm.waitForTimeout(300);
  await sm.click('[data-ev="memo"]'); await sm.waitForTimeout(400);
  if (await sm.$('[data-rqn="C13"]')) errs.push('① no note box before the count is raised');
  await sm.click('[data-rqp="C13"]'); await sm.waitForTimeout(300); await sm.click('[data-rqp="LD"]'); await sm.waitForTimeout(300);
  if (!(await sm.$('[data-rqn="C13"]'))) errs.push('① C13 Insert ×1 shows a "which one" note box'); if (await sm.$('[data-rqn="LD"]')) errs.push('① LD (a display base) needs no note box');
  await sm.fill('[data-rqn="C13"]', 'ANKLET 13'); await sm.waitForTimeout(200);
  await sm.click('[data-rqset="C13"]'); await sm.waitForSelector('#rsQ'); await sm.fill('#rsQ', 'FLSIDE'); await sm.waitForTimeout(200); const hits = await sm.$$eval('#rsHits [data-rsc]', e => e.map(x => x.dataset.rsc)); log('① set hits:', hits.join(' '));
  if (!hits.includes('FLSIDE52')) errs.push('① set picker lists SET ORDER items'); else { await sm.click('#rsHits [data-rsc="FLSIDE52"]'); await sm.waitForTimeout(400); }
  const note = await sm.$eval('[data-rqn="C13"]', e => e.value).catch(() => ''); log('① note:', note);
  if (!/ANKLET 13 \/ FLSIDE52 FL INT #52/.test(note)) errs.push('① picking a set appends "code name" to the note (got ' + note + ')');
  const sum = await sm.$eval('#eBody .alert.a-amb', e => e.textContent).catch(() => ''); if (!/C13 Insert ×1 \(ANKLET 13 \/ FLSIDE52/.test(sum)) errs.push('① request summary shows the note (got ' + sum.slice(0, 80) + ')');
  await sm.click('#eDraft'); await sm.waitForTimeout(300); if (await sm.$('#cfOk')) await sm.click('#cfOk'); await sm.waitForTimeout(1200);
  const saved = await sm.evaluate(() => { const O = window.__MOCK_STORE__.orders || {}; const k = Object.keys(O).pop(); return k ? { id: k, req: O[k].req, reqNote: O[k].reqNote } : null; }); log('① saved:', JSON.stringify(saved));
  if (!saved || !saved.req || saved.req.C13 !== 1 || !saved.reqNote || !/ANKLET 13 \/ FLSIDE52/.test(saved.reqNote.C13 || '')) errs.push('① order saves req + reqNote');
  if (saved && saved.reqNote && saved.reqNote.LD) errs.push('① empty notes are dropped');
  await sm.context().close();
  /* ② 사무실 — 주문 창 · Notes Display 미리 채움 (주문은 시드로: 보낸 주문 + 요청 + 설명) */
  const OSEED = "s.orders[0].req = { C13: 1, LD: 2 }; s.orders[0].reqNote = { C13: 'ANKLET 13 / FLSIDE52 FL INT #52 - BODY J - CHIN (66PC)' };";
  const of = await mk('office@theonefl.com', 'invoice', OSEED, 1600);
  await of.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await of.waitForSelector('#mDisp', { timeout: 8000 }).catch(() => errs.push('② order screen should have 🖼 Notes Display'));
  const alert = await of.$$eval('#page .alert', e => e.map(x => x.textContent).join(' | ')); if (!/C13 Insert ×1 \(ANKLET 13 \/ FLSIDE52/.test(alert)) errs.push('② office order screen shows the insert note (got ' + alert.slice(0, 120) + ')');
  if (await of.$('#mDisp')) {
    await of.click('#mDisp'); await of.waitForSelector('.sb.nd-raiz .nu-prod-txt', { timeout: 6000 }).catch(() => errs.push('② launch panel with the requested kinds'));
    const pre = await of.$$eval('.nd-lin', L => L.map(x => ({ t: (x.querySelector('.nu-prod-txt') || {}).value || '', q: (x.querySelector('.nd-step-in') || {}).value }))); log('② prefilled:', JSON.stringify(pre));
    const c13 = pre.find(x => /^C13 Insert/.test(x.t)), ld = pre.find(x => /^LD/.test(x.t));
    if (!c13 || !/ANKLET 13/.test(c13.t) || c13.q !== '1' || !ld || ld.q !== '2') errs.push('② Notes Display is prefilled with the requested kinds, counts and notes');
    /* ③ */
    if (!(await of.$('.ups-cli-sel.cartaz'))) errs.push('③ store card');
    await of.fill('#nuProdBusca', 'AHG100'); await of.waitForTimeout(200); if (await of.$('[data-act="nu-prod-add"][data-id="AHG100"]')) errs.push('③ only Empty Display items are offered');
    await of.fill('#nuProdBusca', 'LD STACK'); await of.waitForSelector('[data-act="nu-prod-add"][data-id="LD(STACKABLE)"]', { timeout: 3000 }).catch(() => errs.push('③ Empty Display item found'));
    await of.fill('#nuProdBusca', ''); await of.click('[data-act="nu-prod-gravar"]'); await of.waitForTimeout(900);
    const D = await of.evaluate(() => Object.values(window.__MOCK_STORE__.notasDisplay || {})); log('② saved:', JSON.stringify(D.map(d => [d.status, d.texto, d.qtd])));
    const i0 = D.find(x => /^C13 Insert/.test(x.texto || '')) || {};
    if (D.length !== 2 || !/ANKLET 13/.test(i0.texto || '') || i0.qtd !== 1 || i0.code) errs.push('② saved rows keep the insert note as Outros text');
    await of.evaluate(() => { location.hash = '#/notesups'; }); await of.waitForTimeout(300); await of.evaluate(() => { location.hash = '#/displays'; }); await of.waitForSelector('[data-act="nu-novo"]');
    await of.click('[data-act="nu-novo"]'); await of.waitForSelector('#nuBusca'); if (!(await of.$('[data-act="cl-novo"]'))) errs.push('③ Cadastrar cliente next to the store search');
  }
  await of.context().close();
  /* ④ 창고 매니저 */
  const DSEED = 's.displays = [{ id: "DS1", acct: "1111", store: "ALI B/S # 1", sm: "BRANDON", items: [{ n: "C13 Insert", q: 1, custom: true, note: "ANKLET 13" }], qty: 1, due: "2026-11-10", st: "open", createdBy: "office@theonefl.com", createdByName: "EunJi", createdAt: "2026-11-09T10:00:00Z" }];';
  const wh = await mk('joao@theonefl.com', 'whmgr', DSEED, 1200);
  await wh.evaluate(() => { location.hash = '#/displays'; }); await wh.waitForSelector('[data-nd-loja="1111"]', { timeout: 8000 }); await wh.waitForTimeout(200);
  const st = () => wh.evaluate(() => (window.__MOCK_STORE__.notasDisplay['NDL-DS1-0'] || {}).status);
  const txt = await wh.textContent('[data-nd-loja="1111"]'); log('④ card:', txt.replace(/\s+/g, ' ').slice(0, 120)); if (!/Atrasado|Late|지연/.test(txt) || !/C13 Insert — ANKLET 13/.test(txt)) errs.push('④ migrated card: Outros text + late date');
  if ((await wh.evaluate(() => window.__MOCK_STORE__.displays.DS1.st)) !== 'migr') errs.push('④ legacy display marked migr');
  await wh.click('[data-nd-loja="1111"] [data-act="nd-iniciar"]'); await wh.waitForTimeout(600); if ((await st()) !== 'preparando') errs.push('④ start → preparando');
  await wh.click('[data-nd-loja="1111"] [data-act="nd-liberar"]'); await wh.waitForSelector('#esPergSim'); await wh.click('#esPergSim'); await wh.waitForTimeout(600); if ((await st()) !== 'pendente') errs.push('④ release → pendente');
  await wh.click('[data-nd-loja="1111"] [data-act="nd-iniciar"]'); await wh.waitForTimeout(600);
  await wh.click('[data-nd-loja="1111"] [data-act="nd-cancelar"]'); await wh.waitForSelector('#esPergSim'); await wh.click('#esPergSim'); await wh.waitForTimeout(600); if ((await st()) !== 'cancelado') errs.push('④ cancel → cancelado');
  await wh.context().close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
