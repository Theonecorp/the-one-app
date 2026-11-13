/* v0.8.199 시험 — 💵 수금 확인 아래 막대 · 👯 같은 수금 두 번 (2026-11-12 관리자: "체크 수령 막대가 잘림" · "지난번에 마감된 것들이 다시 올라옴 · 이미 한 것들이 다시 생성")
 *   ① 넓은 화면(왼쪽 메뉴 고정): 수금 확인에서 체크하면 나오는 아래 막대가 왼쪽 메뉴에 가려지지 않음 (막대 왼쪽 ≥ 메뉴 오른쪽)
 *   ② 정산: 같은 가게 · 날짜 · 금액 · 방법의 ACH 가 두 기록(ACH-… · D…)으로 있으면 확정 창에 "👯 같은 수금이 두 번" 이 걸리고 확정 단추가 잠김
 *   ③ SALES 파일 COD 입력 가져오기: 이미 있는 ACH 와 같은 줄(ID 없음)은 새로 안 만들고 "👯 … 1건 건너뜀" */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8903', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const d2 = new Date(Date.now() - 2 * 86400000), D = d2.getFullYear() + '-' + String(d2.getMonth() + 1).padStart(2, '0') + '-' + String(d2.getDate()).padStart(2, '0');
  const CH = ['세일즈맨', '날짜', '계정코드', '가게', '결제 방법', '참조', '금액', 'A 인보이스', 'A 금액', 'P 인보이스', 'P 금액', 'CM 인보이스', 'CM 금액', 'W 인보이스', 'W 금액', '디스카운트 %', '메모', 'ID', '정산 확인', '확인 메모'];
  const sheets = { 'COD 입력': [CH, ['BRANDON', D, '1271', 'BEAUTY 4U', 'ACH', '', 777, 'A10077', 777, '', '', '', '', '', '', '', '', '', '', '']] };
  const open = async (w, twins) => { const pg = await (await br.newContext({ viewport: { width: w, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' };
      window.__AFTER_SEED__ = s => { if (!o.twins) return; const c = (id, extra) => Object.assign({ id, d: o.D, ym: o.D.substring(0, 7), sm: 'BRANDON', acct: '1271', store: 'BEAUTY 4U', method: 'ACH', ref: '', amt: 777, invs: [{ no: 'A10077', t: 'A', amt: 777 }], disc: '', note: '', v: true, vn: '', settled: '', void: false }, extra || {}); s.cod.push(c('ACH-T219'), c('D-T219')); };
      window.__SHEETS = o.sheets; window.XLSX = { read: () => { const S = window.__SHEETS; return { SheetNames: Object.keys(S), Sheets: Object.fromEntries(Object.keys(S).map(n => [n, { rows: S[n] }])) }; }, utils: { sheet_to_json: ws => ws.rows.map(r => r.slice()) } }; }, { twins, D, sheets });
    await pg.goto('http://127.0.0.1:8903/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  /* ① */
  const a = await open(1400, false);
  await a.evaluate(() => { location.hash = '#/verify'; }); await a.waitForSelector('[data-vck]', { state: 'attached', timeout: 8000 }); await a.waitForTimeout(400);
  await a.evaluate(() => { const c = document.querySelector('[data-vck]'); c.checked = true; c.onchange(); }); await a.waitForTimeout(300);
  const g = await a.evaluate(() => { const b = document.getElementById('vBulk'), d = document.querySelector('#drawer.dock .dpanel') || document.querySelector('#drawer.dock'); return { bar: b && b.style.display !== 'none' ? b.getBoundingClientRect().left : null, dock: d ? d.getBoundingClientRect().right : 0, docked: document.body.classList.contains('dock') }; });
  log('① bar left / dock right:', JSON.stringify(g));
  if (g.bar == null) errs.push('① bulk bar appears after ticking');
  else if (g.docked && g.bar < g.dock - 1) errs.push('① bulk bar starts right of the docked menu');
  if (!g.docked) log('   (menu not docked at this width — nothing to cover)');
  await a.close();
  /* ② */
  const b = await open(1200, true);
  await b.evaluate(() => { location.hash = '#/pay'; }); await b.waitForSelector('#pOut .card', { timeout: 8000 });
  const from = (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(new Date(Date.now() - 20 * 86400000))), to = (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(new Date()));
  await b.fill('#pFrom', from); await b.dispatchEvent('#pFrom', 'change'); await b.waitForTimeout(300); await b.fill('#pTo', to); await b.dispatchEvent('#pTo', 'change'); await b.waitForTimeout(300);
  await b.selectOption('#pSm', 'BRANDON'); await b.waitForSelector('.pr.pl'); await b.waitForTimeout(600);
  await b.click('#pAll'); await b.waitForTimeout(600); await b.click('#pConfirm'); await b.waitForSelector('#cfGo');
  const m = (await b.textContent('#mbox')).replace(/\s+/g, ' '); const dis = await b.$eval('#cfGo', x => x.disabled);
  log('② confirm box has dup:', /👯/.test(m), 'button locked:', dis);
  if (!/👯 같은 수금이 두 번/.test(m)) errs.push('② confirm shows 👯 same payment twice');
  if (!dis) errs.push('② confirm button locked until acknowledged');
  await b.close();
  /* ③ */
  const c = await open(900, true);
  await c.evaluate(() => { location.hash = '#/admin/imp'; }); await c.waitForSelector('#f2', { state: 'attached', timeout: 8000 }); await c.evaluate(() => { const d = document.getElementById('impOld'); if (d) d.open = true; });
  await c.setInputFiles('#f2', { name: 'SALES.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('fake') });
  await c.waitForFunction(() => document.querySelectorAll('#impOut .alert').length >= 1 && !document.getElementById('busy').classList.contains('on'), null, { timeout: 30000 }).catch(() => errs.push('③ import should finish'));
  const msg = await c.$$eval('#impOut .alert', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')); log('③ msg:', msg.slice(0, 200));
  const n = await c.evaluate(() => Object.values(window.__MOCK_STORE__.cod).filter(x => x.acct === '1271' && Number(x.amt) === 777).length); log('③ ACH 777 records:', n);
  if (!/👯 이미 있는 같은 수금 1건 건너뜀/.test(msg)) errs.push('③ message says 1 twin skipped');
  if (n !== 2) errs.push('③ no third record');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
