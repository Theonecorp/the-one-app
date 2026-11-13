/* v0.8.228 시험 — 🖨 프린터 에이전트 (옛 WMS 의 Agente de impressão 그대로): Shipping UPS · Notes UPS 라벨이 출고 PC 의 Zebra 로 바로 (2026-11-13 창고 매니저 요청)
 *   A. 에이전트 (agente-impressao/agente.mjs) — 가짜 Google · Firebase 서버로, Windows · 프린터 없이
 *     ① 구글 로그인 (refresh token → id_token → signInWithIdp providerId google.com) · 모든 Firestore 요청에 그 토큰
 *     ② 자기 방(estacao Expedicao) 의 pendente 만 가져감 · 다른 방(재고 '')은 그대로 · ZPL 은 프린터로 그대로 → st feito + 누가 찍었나
 *     ③ 찍다가 멈춘 일(imprimindo 3분 넘음)은 다시 가져감 · 방금 가져간 것은 건드리지 않음
 *     ④ 실패하면 두 번 더 → 세 번째에 st erro · tentativas 3 · 이유
 *     ⑤ 30초마다 printAgents/{기계} 에 살아 있음 (방 · 버전 · 이메일) · config 가 덜 채워지면 바로 멈추고 무엇이 빠졌는지 말함
 *   B. 화면 (메모리 DB)
 *     ⑥ 바로 인쇄가 꺼져 있으면 지금처럼 브라우저 인쇄 창 · 대기열에 아무것도 안 감 · 관리자에게 켜기 칸이 보임
 *     ⑦ Notes UPS: 켜면 박스마다 일 하나 (estacao Expedicao · grande · 4×6 페이지 · .etq-pag) · 화면 전체 "나오는 중" → 에이전트가 feito 로 바꾸면 ✓
 *     ⑧ 에이전트가 꺼져 있으면 일은 넣어 두고 "꺼져 있음 — 대기열" · 에이전트가 erro 로 바꾸면 빨간 카드
 *     ⑨ Shipping UPS: GIF 라벨은 흑백 그림 페이지로 · ZPL 라벨은 명령 그대로 (내려받기 대신) · 창고 매니저도 켜고 끌 수 있음(설정 printDireta)
 *     ⑩ Notes Display 끝내기 → 그 박스 라벨도 출고 대기열로 · ⑪ Shipping History 다시 인쇄 → 고른 박스 라벨 하나만 대기열로 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs'), os = require('os'), http = require('http');
const { spawn, execFile } = require('child_process');
const errs = [], log = (...a) => console.log(...a);
const ok = (c, n) => { log((c ? '  ✓ ' : '  ✗ ') + n); if (!c) errs.push(n); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- A. 가짜 Google · Firebase ---------- */
const toFs = v => v === null || v === undefined ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'string' ? { stringValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(toFs) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFs(x)])) } };
const deFs = x => 'stringValue' in x ? x.stringValue : 'integerValue' in x ? Number(x.integerValue) : 'booleanValue' in x ? x.booleanValue : 'nullValue' in x ? null : 'arrayValue' in x ? (x.arrayValue.values || []).map(deFs) : 'mapValue' in x ? Object.fromEntries(Object.entries(x.mapValue.fields || {}).map(([k, y]) => [k, deFs(y)])) : x.doubleValue;
async function agente() {
  log('▶ A. 에이전트');
  const ago = ms => new Date(Date.now() - ms).toISOString();
  const DB = { printJobs: {
    J1: { st: 'pendente', estacao: 'Expedicao', impressora: 'grande', tipo: 'etiqueta_ups', copias: 1, tentativas: 0, em: ago(5000), dados: { zpl: '^XA^FDUM^FS^XZ' } },
    J2: { st: 'pendente', estacao: '', impressora: 'pequena', tipo: 'etiqueta_caixa', copias: 1, tentativas: 0, em: ago(6000), dados: { zpl: '^XA^FDESTOQUE^FS^XZ' } },
    J3: { st: 'pendente', estacao: 'Expedicao', impressora: 'grande', tipo: 'etiqueta_ups', copias: 1, tentativas: 0, em: ago(4000), dados: {} },
    J4: { st: 'imprimindo', estacao: 'Expedicao', impressora: 'grande', tipo: 'etiqueta_ups', copias: 1, tentativas: 0, em: ago(700000), pegoEm: ago(600000), dados: { zpl: '^XA^FDPRESO^FS^XZ' } },
    J5: { st: 'imprimindo', estacao: 'Expedicao', impressora: 'grande', tipo: 'etiqueta_ups', copias: 1, tentativas: 0, em: ago(3000), pegoEm: ago(5000), dados: { zpl: '^XA^FDOUTRO^FS^XZ' } } }, printAgents: {} };
  const UT = {}; let tick = 1; const ut = (c, id) => UT[c + '/' + id] || (UT[c + '/' + id] = 'T' + (tick++));
  const calls = [];
  const srv = http.createServer((q, r) => { let b = ''; q.on('data', d => b += d); q.on('end', () => {
    const u = new URL(q.url, 'http://x'), j = (() => { try { return JSON.parse(b); } catch (e) { return null; } })();
    calls.push({ m: q.method, p: u.pathname, auth: q.headers.authorization || '', body: b });
    const send = (code, o) => { r.writeHead(code, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(o)); };
    if (u.pathname === '/google/token') { const f = new URLSearchParams(b); return f.get('refresh_token') === 'RT' && f.get('client_id') === 'CID' ? send(200, { id_token: 'GID', access_token: 'GAT' }) : send(400, { error: 'invalid_grant' }); }
    if (u.pathname === '/idp/accounts:signInWithIdp') return u.searchParams.get('key') === 'K' && /id_token=GID/.test(j.postBody) && /providerId=google\.com/.test(j.postBody) ? send(200, { idToken: 'FBTOK', email: 'impressora@t.com', expiresIn: '3600' }) : send(400, { error: { message: 'INVALID_IDP_RESPONSE' } });
    const base = '/fs/projects/P/databases/(default)/documents';
    if (q.headers.authorization !== 'Bearer FBTOK') return send(401, { error: 'no auth' });
    if (u.pathname === base + ':runQuery') {
      const sq = j.structuredQuery, col = sq.from[0].collectionId, F = sq.where.compositeFilter.filters.map(f => [f.fieldFilter.field.fieldPath, deFs(f.fieldFilter.value)]);
      return send(200, Object.entries(DB[col] || {}).filter(([, d]) => F.every(([k, v]) => d[k] === v)).map(([id, d]) => ({ document: { name: base + '/' + col + '/' + id, updateTime: ut(col, id), fields: toFs(d).mapValue.fields } })));
    }
    if (q.method === 'PATCH' && u.pathname.startsWith(base + '/')) {
      const [col, id] = u.pathname.slice(base.length + 1).split('/').map(decodeURIComponent);
      const pre = u.searchParams.get('currentDocument.updateTime'); if (pre && pre !== ut(col, id)) return send(400, { error: { status: 'FAILED_PRECONDITION' } });
      const mask = u.searchParams.getAll('updateMask.fieldPaths'), F = deFs({ mapValue: j });
      DB[col] = DB[col] || {}; const cur = DB[col][id] || {}; mask.forEach(k => { cur[k] = F[k]; }); DB[col][id] = cur; UT[col + '/' + id] = 'T' + (tick++);
      return send(200, { name: base + '/' + col + '/' + id });
    }
    send(404, {});
  }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port;
  const dir = path.join(os.tmpdir(), 't267-agente-' + process.pid); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.resolve(__dirname, '../agente-impressao/agente.mjs'), path.join(dir, 'agente.mjs'));
  const cfg = Object.assign(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../agente-impressao/config-expedicao.exemplo.json'), 'utf8')),
    { firebase_api_key: 'K', firebase_projeto: 'P', google_client_id: 'CID', google_client_secret: 'CS', firestore_url: B + '/fs', google_token_url: B + '/google/token', identity_url: B + '/idp', intervalo_segundos: 1, linguagem: 'zpl', maquina: 'PC Expedicao' });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(cfg));
  fs.writeFileSync(path.join(dir, 'login-google.json'), JSON.stringify({ refresh_token: 'RT', email: 'impressora@t.com' }));
  const saida = path.join(dir, 'saida.zpl');
  const p = spawn(process.execPath, [path.join(dir, 'agente.mjs')], { cwd: dir, env: Object.assign({}, process.env, { ONECORP_SAIDA: saida }) });
  let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  for (let i = 0; i < 40 && !(DB.printJobs.J1.st === 'feito' && DB.printJobs.J3.st === 'erro' && DB.printJobs.J4.st === 'feito'); i++) await sleep(250);
  p.kill(); await sleep(300);
  const J = DB.printJobs, raw = fs.existsSync(saida) ? fs.readFileSync(saida, 'utf8') : '';
  const fsCalls = calls.filter(c => c.p.startsWith('/fs/'));
  ok(calls[0] && calls[0].p === '/google/token' && calls.some(c => c.p === '/idp/accounts:signInWithIdp'), '① Google 로그인 → Firebase (google.com)');
  ok(fsCalls.length > 3 && fsCalls.every(c => c.auth === 'Bearer FBTOK'), '① Firestore 요청마다 Firebase 토큰 (' + fsCalls.length + ')');
  ok(J.J1.st === 'feito' && /Zebra/.test(J.J1.agente || '') && J.J1.feitoEm, '② 자기 방 일 → feito · 누가 (' + J.J1.st + ' · ' + J.J1.agente + ')');
  ok(J.J2.st === 'pendente' && !J.J2.agente, '② 재고 방(estacao 없음) 일은 그대로 (' + J.J2.st + ')');
  ok(raw.includes('^FDUM^FS') && !raw.includes('ESTOQUE'), '② ZPL 이 프린터로 그대로 (재고 것은 안 나감)');
  ok(J.J4.st === 'feito' && raw.includes('^FDPRESO'), '③ 멈춘 일(10분 전 imprimindo) 다시 가져가 찍음');
  ok(J.J5.st === 'imprimindo' && !raw.includes('OUTRO'), '③ 방금 가져간 일은 건드리지 않음');
  ok(J.J3.st === 'erro' && J.J3.tentativas === 3 && /trabalho antigo/.test(J.J3.erro || ''), '④ 세 번 실패 → erro · 이유 (' + J.J3.st + ' · ' + J.J3.tentativas + ')');
  const A = DB.printAgents['PC_Expedicao'] || {};
  ok(A.estacao === 'Expedicao' && A.imprime === true && /^app-/.test(A.versao || '') && A.email === 'impressora@t.com' && Date.now() - Date.parse(A.em) < 20000, '⑤ printAgents 살아 있음 ' + JSON.stringify(A).slice(0, 140));
  ok(/conectado como impressora@t\.com/.test(out), '⑤ 로그: 누구로 들어갔나');
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(Object.assign({}, cfg, { google_client_id: 'PREENCHER-id-do-cliente-oauth' })));
  const r2 = await new Promise(r => execFile(process.execPath, [path.join(dir, 'agente.mjs')], { cwd: dir, timeout: 15000 }, (e, o, s) => r((o || '') + (s || ''))));
  ok(/falta preencher/.test(r2) && /google_client_id/.test(r2), '⑤ config 가 덜 차면 멈추고 빠진 칸을 말함');
  srv.close(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  if (errs.length) log(out.split('\n').slice(-15).join('\n'));
}

/* ---------- B. 화면 ---------- */
async function tela() {
  const srv = spawn('python3', ['-m', 'http.server', '8993', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await sleep(700);
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const GIF = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', ZPL = Buffer.from('^XA^FO50,50^FDUPS ZPL^FS^XZ').toString('base64');
  const SEED = `const n = new Date().toISOString(); s.upsnotes = [
      { id: 'NU1', acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', w: 12, l: 16, wd: 12, h: 10, st: 'open', src: 'notes', at: n, by: 'luke@theonefl.com', byName: 'LUKE' },
      { id: 'NU2', acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', w: 9, l: 16, wd: 12, h: 10, st: 'open', src: 'notes', at: n, by: 'luke@theonefl.com', byName: 'LUKE' }];
    s.users.push({ id: 'wh@theonefl.com', email: 'wh@theonefl.com', name: 'W', role: 'manager', job: 'whmgr', active: true });`;
  try {
    const mk = async email => { const pg = await (await br.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true })).newPage(); pg.on('pageerror', e => errs.push('pageerror ' + e.message)); pg.on('dialog', d => d.accept());
      await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed: SEED });
      await pg.goto('http://127.0.0.1:8993/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
    const jobs = pg => pg.evaluate(() => Object.values(window.__MOCK_STORE__.printJobs || {}));
    const setJobs = (pg, st) => pg.evaluate(st => Object.values(window.__MOCK_STORE__.printJobs || {}).forEach(j => { if (j.st === 'pendente') j.st = st; }), st);
    const vivo = (pg, on) => pg.evaluate(on => { const S = window.__MOCK_STORE__; S.printAgents = S.printAgents || {}; if (on) S.printAgents.PC = { id: 'PC', maquina: 'PC Expedicao', estacao: 'Expedicao', imprime: true, em: new Date().toISOString() }; else delete S.printAgents.PC; }, on);
    const imprimirFila = async pg => { if ((await pg.$$('input[data-act="nu-marcar"]:checked')).length < 2) { await pg.click('input[data-act="nu-todos"]'); await pg.waitForTimeout(150); } await pg.click('[data-act="nu-imp-sel"]'); };

    log('▶ ⑥ 꺼져 있을 때 — 브라우저 인쇄 그대로');
    let pg = await mk('luke@theonefl.com');
    await pg.evaluate(() => { location.hash = '#/notesups'; }); await pg.waitForSelector('.sb.nu-raiz tr[data-nota]', { timeout: 8000 });
    ok(!!(await pg.$('#prqLigar')) && !(await pg.isChecked('#prqLigar')), '⑥ 관리자에게 켜기 칸 (꺼짐)');
    await imprimirFila(pg); await pg.waitForSelector('#prt.on', { timeout: 6000 }).catch(() => {});
    ok(!!(await pg.$('#prt.on')) && (await pg.$$('#prtbody .nulp')).length === 2, '⑥ 브라우저 인쇄 창에 라벨 2장');
    ok((await jobs(pg)).length === 0, '⑥ 대기열에는 아무것도 안 감'); await pg.click('#prtClose'); await pg.waitForTimeout(200);

    log('▶ ⑦ 켜면 — 출고 PC 대기열 · 나왔다는 확인');
    await vivo(pg, true);
    await pg.click('#prqLigar'); await pg.waitForTimeout(400);
    ok((await pg.evaluate(() => window.__MOCK_STORE__.settings.app.printDireta)) === true, '⑦ settings/app.printDireta = true');
    await pg.waitForSelector('#prqEstado[data-prq-vivo="1"]', { timeout: 5000 }).catch(() => {});
    ok(/Conectada|Connected|연결됨/.test(await pg.textContent('#prqEstado').catch(() => '')), '⑦ 띠: 에이전트 연결됨 · ' + (await pg.textContent('#prqEstado').catch(() => '')));
    await imprimirFila(pg); await pg.waitForSelector('.prq', { timeout: 5000 }).catch(() => {});
    ok(!(await pg.$('#prt.on')), '⑦ 브라우저 인쇄 창은 안 열림');
    let J = await jobs(pg);
    ok(J.length === 2 && J.every(j => j.st === 'pendente' && j.estacao === 'Expedicao' && j.impressora === 'grande' && j.tipo === 'etiqueta_notes_ups' && j.by === 'luke@theonefl.com' && j.tentativas === 0), '⑦ 박스마다 일 하나 (Expedicao · grande · pendente) ' + J.length);
    const H = (J[0] && J[0].dados && J[0].dados.html) || '';
    ok(/@page\{size:4in 6in/.test(H) && (H.match(/class="etq-pag"/g) || []).length === 1 && /etqn-conta">3001</.test(H) && /<!doctype html>/.test(H), '⑦ 4×6 페이지 · .etq-pag 한 장 · 라벨 내용');
    ok(J.map(j => j.titulo).sort().join('|') === 'BEAUTY EXCHANGE ORLANDO 1/2|BEAUTY EXCHANGE ORLANDO 2/2', '⑦ 제목 "가게 1/2" · ' + J.map(j => j.titulo).join('|'));
    ok(!!(await pg.$('.prq[data-prq="esperando"]')), '⑦ 화면 전체 "나오는 중…"');
    await setJobs(pg, 'feito'); await pg.waitForSelector('.prq[data-prq="ok"]', { timeout: 5000 }).catch(() => {});
    ok(/2/.test(await pg.textContent('.prq[data-prq="ok"] .prq-txt').catch(() => '')), '⑦ 에이전트가 feito → ✓ 2장 나옴');
    await pg.click('.prq').catch(() => {}); await pg.waitForTimeout(300);

    log('▶ ⑧ 에이전트 꺼짐 · 실패');
    await vivo(pg, false); await imprimirFila(pg); await pg.waitForSelector('.prq[data-prq="fila"]', { timeout: 5000 }).catch(() => {});
    ok(!!(await pg.$('.prq[data-prq="fila"]')), '⑧ 꺼져 있으면 "대기열에 보관" 카드');
    ok((await jobs(pg)).filter(j => j.st === 'pendente').length === 2, '⑧ 그래도 일은 넣어 둠 (켜지면 나옴)');
    await pg.click('.prq').catch(() => {}); await setJobs(pg, 'feito');
    await vivo(pg, true); await imprimirFila(pg); await pg.waitForSelector('.prq[data-prq="esperando"]', { timeout: 5000 }).catch(() => {});
    await setJobs(pg, 'erro'); await pg.waitForSelector('.prq[data-prq="erro"]', { timeout: 5000 }).catch(() => {});
    ok(!!(await pg.$('.prq[data-prq="erro"]')), '⑧ 에이전트가 erro → 빨간 카드');
    await pg.close();

    log('▶ ⑨ Shipping UPS — 창고 매니저 · GIF 그림 · ZPL 명령');
    pg = await mk('wh@theonefl.com');
    await pg.evaluate(() => { location.hash = '#/balcao'; }); await pg.waitForSelector('#sbBusca', { timeout: 8000 });
    const q = f => pg.evaluate(f => Object.entries(window.__MOCK_STORE__.shipq || {}).filter(([, x]) => new Function('q', 'return ' + f)(x)).map(([id, x]) => Object.assign({ _id: id }, x)), f);
    const E = (await q("q.st === 'env'"))[0]; if (E) await pg.evaluate(id => Object.assign(window.__MOCK_STORE__.shipq[id], { st: 'envdone', env: 'test', cred: true, defined: true }), E._id);
    ok(!!(await pg.$('#prqLigar')), '⑨ 창고 매니저에게도 켜기 칸');
    await pg.click('#prqLigar'); await pg.waitForTimeout(400);
    ok((await pg.evaluate(() => window.__MOCK_STORE__.settings.app.printDireta)) === true, '⑨ 창고 매니저가 켬');
    await vivo(pg, true);
    await pg.fill('#sbBusca', '3001'); await pg.waitForSelector('[data-sb-cli="3001"]', { timeout: 4000 }); await pg.press('#sbBusca', 'Enter');
    await pg.waitForSelector('#sbP', { timeout: 6000 });
    await pg.focus('#sbP'); for (const v of [10, 10, 10, 10]) { await pg.keyboard.type(String(v)); await pg.keyboard.press('Enter'); } await pg.waitForTimeout(150);
    await pg.focus('#sbP'); for (const v of [8, 10, 10, 10]) { await pg.keyboard.type(String(v)); await pg.keyboard.press('Enter'); } await pg.waitForTimeout(150);
    const downs = []; pg.on('download', d => downs.push(d.suggestedFilename()));
    await pg.click('.sb [data-act="sb-finalizar"]');
    await pg.waitForFunction(() => Object.values(window.__MOCK_STORE__.shipq || {}).some(x => x.st === 'wait' && x.acct === '3001'), null, { timeout: 8000 }).catch(() => {});
    const W = (await q("q.st === 'wait' && q.acct === '3001'"))[0];
    if (W) await pg.evaluate(([id, o]) => Object.assign(window.__MOCK_STORE__.shipq[id], o), [W._id, { st: 'done', env: 'test', track: '1ZG1 1ZZ2', charge: 15, labels: [{ trk: '1ZG1', img: GIF, fmt: 'GIF' }, { trk: '1ZZ2', img: ZPL, fmt: 'ZPL' }] }]);
    await pg.waitForFunction(() => Object.values(window.__MOCK_STORE__.printJobs || {}).filter(j => j.tipo === 'etiqueta_ups').length >= 2, null, { timeout: 15000 }).catch(() => {});
    J = (await jobs(pg)).filter(j => j.tipo === 'etiqueta_ups');
    const g = J.find(j => j.titulo === 'UPS 1ZG1'), z = J.find(j => j.titulo === 'UPS 1ZZ2');
    ok(g && /<img src="data:image\/png;base64,/.test(g.dados.html || '') && /image-rendering:pixelated/.test(g.dados.html) && /@page\{size:4in 6in/.test(g.dados.html) && g.estacao === 'Expedicao', '⑨ GIF → 흑백 그림 4×6 페이지 (Expedicao)');
    ok(z && z.dados.zpl === '^XA^FO50,50^FDUPS ZPL^FS^XZ' && !z.dados.html, '⑨ ZPL → 명령 그대로');
    ok(!(await pg.$('#prt.on')) && !downs.some(f => /\.zpl$/.test(f)), '⑨ 브라우저 창 · ZPL 내려받기 없음 ' + downs.join(','));
    await pg.close();

    log('▶ ⑩ Notes Display 끝내기 · ⑪ Shipping History 다시 인쇄 — 같은 대기열로');
    const SEED2 = `const d = new Date(), t = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), n = d.toISOString();
      s.settings[0].printDireta = true; s.printAgents = [{ id: 'PC', maquina: 'PC Expedicao', estacao: 'Expedicao', imprime: true, em: n }];
      const c0 = s.catalog.find(x => x.id === 'c0'); const rows = JSON.parse(c0.j); rows.push(['LD(STACKABLE)', 'LD STACKABLE', 10, 0, '', 'Set Orders & Displays', 'EMPTY DISPLAY', '', '', '']); c0.j = JSON.stringify(rows); c0.n = rows.length;
      s.prodExtra = [{ id: 'LD(STACKABLE)', peso: 16, comp: 26, larg: 16, alt: 16 }];
      s.notasDisplay = [{ id: 'G1-0', grupo: 'G1-0', acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', sm: 'ALEX', code: 'LD(STACKABLE)', nome: 'LD STACKABLE', texto: '', qtd: 2, qtdFeita: 0, paraEm: t, status: 'preparando', peso: 16, comp: 26, larg: 16, alt: 16, criadoEm: n, criadoPor: 'luke@theonefl.com', criadoPorNome: 'LUKE', iniciadaPor: 'luke@theonefl.com', iniciadaPorNome: 'LUKE', iniciadaEm: n, notaIds: [], orderId: '', orderNo: '' }];
      s.shipments = [{ id: '1ZAAA0001', trk: '1ZAAA0001', adhocId: 'XBAL1', no: 'XBAL1', acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', sm: 'ALEX', box: 1, boxes: 2, w: 12.5, dims: '16×12×10', svc: '03', svcName: 'UPS Ground', shipDate: t, cost: 33.4, status: 'Label created', at: t + 'T15:00:00Z', by: 'luke@theonefl.com' },
        { id: '1ZAAA0002', trk: '1ZAAA0002', adhocId: 'XBAL1', no: 'XBAL1', acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', sm: 'ALEX', box: 2, boxes: 2, w: 10, dims: '16×12×10', svc: '03', svcName: 'UPS Ground', shipDate: t, cost: 0, status: 'Label created', at: t + 'T15:00:00Z' }];
      s.shipq = [{ id: 'XBAL1', st: 'done', shipId: '1ZAAA0001', track: '1ZAAA0001 1ZAAA0002', labels: [{ trk: '1ZAAA0001', img: '${GIF}' }, { trk: '1ZAAA0002', img: '${GIF}' }] }];
      s.adhoc = [{ id: 'XBAL1', acct: '3001', st: 'shipped', src: 'balcao' }];`;
    pg = await (await br.newContext({ viewport: { width: 1400, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push('pageerror ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { localStorage.setItem('theone.lang', 'pt'); window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', o); }, SEED2);
    await pg.goto('http://127.0.0.1:8993/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
    await pg.evaluate(() => { location.hash = '#/displays'; }); await pg.waitForSelector('[data-nd-loja="3001"] [data-act="nd-concluir"]', { timeout: 8000 });
    await pg.click('[data-nd-loja="3001"] [data-act="nd-concluir"]'); await pg.waitForSelector('#esPergSim', { timeout: 5000 }); await pg.click('#esPergSim');
    await pg.waitForFunction(() => Object.values(window.__MOCK_STORE__.printJobs || {}).length >= 2, null, { timeout: 8000 }).catch(() => {});
    J = await jobs(pg);
    ok(J.length === 2 && J.every(j => j.tipo === 'etiqueta_notes_ups' && j.estacao === 'Expedicao' && /LD STACKABLE/.test(j.dados.html) && /16 lb/.test(j.dados.html)), '⑩ Notes Display 끝내기 → 박스 2개 라벨이 출고 대기열로 ' + J.length);
    ok(!(await pg.$('#prt.on')), '⑩ 브라우저 인쇄 창은 안 열림');
    await pg.evaluate(() => { window.__MOCK_STORE__.printJobs = {}; document.querySelectorAll('.prq').forEach(x => x.remove()); });
    await pg.evaluate(() => { location.hash = '#/shiphist'; }); await pg.waitForSelector('.sb .sh-l[data-envio^="XBAL1"]', { timeout: 8000 });
    await pg.click('.sb .sh-l[data-envio^="XBAL1"]'); await pg.waitForSelector('.sb [data-aba="etiqueta"]', { timeout: 4000 }); await pg.click('.sb [data-aba="etiqueta"]'); await pg.waitForTimeout(300);
    await pg.click('.sb [data-act="sh-reimp"][data-box="2"]');
    await pg.waitForFunction(() => Object.values(window.__MOCK_STORE__.printJobs || {}).length >= 1, null, { timeout: 8000 }).catch(() => {});
    J = await jobs(pg);
    ok(J.length === 1 && J[0].titulo === 'UPS 1ZAAA0002' && J[0].tipo === 'etiqueta_ups' && J[0].estacao === 'Expedicao' && /data:image\/png/.test(J[0].dados.html), '⑪ Shipping History 다시 인쇄(박스 2) → 그 라벨 하나만 대기열로 ' + J.map(j => j.titulo).join(','));
    ok(!(await pg.$('#prt.on')), '⑪ 브라우저 인쇄 창은 안 열림');
    await pg.close();
  } finally { await br.close(); srv.kill(); }
}

(async () => {
  try { await agente(); } catch (e) { errs.push('A ' + (e.stack || e)); }
  try { await tela(); } catch (e) { errs.push('B ' + (e.stack || e)); }
  if (errs.length) { console.log('\n❌ ' + errs.length + '\n - ' + errs.join('\n - ')); process.exit(1); }
  console.log('\n✅ t267 통과'); process.exit(0);
})();
