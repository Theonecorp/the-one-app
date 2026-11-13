/* v0.8.203 시험 — 👯 날짜가 며칠 다른 같은 ACH (ACH 시트 ACH-… + SALES 파일 COD 입력 D…) 도 같은 수금 · 할부는 아님 (2026-11-12 관리자: SOO 정산에 MISSHA · EMANI 가 두 번 · 커미션 두 번)
 *   ② 정산: ACH-T224(10/23 쪽) + D261102-T224(4일 뒤) — 같은 가게 · 금액 · 인보이스 → 확정 창에 👯 · 확정 단추 잠김
 *   ③ 같은 기록 길의 할부(ACH-I1 · ACH-I2, 같은 금액 · 같은 인보이스, 한 달 차이)는 👯 아님
 *   ④ SALES 파일 COD 입력: 날짜가 3일 다른 같은 ACH(같은 인보이스) 줄은 건너뜀 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8909', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const d2 = new Date(Date.now() - 6 * 86400000), D = d2.getFullYear() + '-' + String(d2.getMonth() + 1).padStart(2, '0') + '-' + String(d2.getDate()).padStart(2, '0');
  const CH = ['세일즈맨', '날짜', '계정코드', '가게', '결제 방법', '참조', '금액', 'A 인보이스', 'A 금액', 'P 인보이스', 'P 금액', 'CM 인보이스', 'CM 금액', 'W 인보이스', 'W 금액', '디스카운트 %', '메모', 'ID', '정산 확인', '확인 메모'];
  const D3 = (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(new Date(new Date(D + 'T12:00:00').getTime() + 3 * 864e5)));
  const sheets = { 'COD 입력': [CH, ['BRANDON', D3, '1271', 'BEAUTY 4U', 'ACH', '', 777, 'A-010077', 777, '', '', '', '', '', '', '', '', '', '', '']] };
  const open = async (w, twins) => { const pg = await (await br.newContext({ viewport: { width: w, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' };
      window.__AFTER_SEED__ = s => { if (!o.twins) return; const c = (id, extra) => Object.assign({ id, d: o.D, ym: o.D.substring(0, 7), sm: 'BRANDON', acct: '1271', store: 'BEAUTY 4U', method: 'ACH', ref: '', amt: 777, invs: [{ no: 'A10077', t: 'A', amt: 777 }], disc: '', note: '', v: true, vn: '', settled: '', void: false }, extra || {}); const D4 = (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(new Date(new Date(o.D + 'T12:00:00').getTime() + 4 * 864e5))), Dm = (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(new Date(new Date(o.D + 'T12:00:00').getTime() - 30 * 864e5)));
        s.cod.push(c('ACH-T224'), c('D261102-T224', { d: D4, ym: D4.substring(0, 7), method: 'ACH' }), c('ACH-I1', { acct: '1111', store: 'ALI B/S # 1', amt: 300, invs: [{ no: 'W000900', t: 'W', amt: 300 }] }), c('ACH-I2', { acct: '1111', store: 'ALI B/S # 1', amt: 300, d: Dm, ym: Dm.substring(0, 7), invs: [{ no: 'W-000900', t: 'W', amt: 300 }] })); };
      window.__SHEETS = o.sheets; window.XLSX = { read: () => { const S = window.__SHEETS; return { SheetNames: Object.keys(S), Sheets: Object.fromEntries(Object.keys(S).map(n => [n, { rows: S[n] }])) }; }, utils: { sheet_to_json: ws => ws.rows.map(r => r.slice()) } }; }, { twins, D, sheets });
    await pg.goto('http://127.0.0.1:8909/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  /* ② */
  const b = await open(1200, true);
  await b.evaluate(() => { location.hash = '#/pay'; }); await b.waitForSelector('#pOut .card', { timeout: 8000 });
  const from = (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(new Date(Date.now() - 20 * 86400000))), to = (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(new Date()));
  await b.fill('#pFrom', from); await b.dispatchEvent('#pFrom', 'change'); await b.waitForTimeout(300); await b.fill('#pTo', to); await b.dispatchEvent('#pTo', 'change'); await b.waitForTimeout(300);
  await b.selectOption('#pSm', 'BRANDON'); await b.waitForSelector('.pr.pl'); await b.waitForTimeout(600);
  await b.click('#pAll'); await b.waitForTimeout(600); await b.click('#pConfirm'); await b.waitForSelector('#cfGo');
  const m = (await b.textContent('#mbox')).replace(/\s+/g, ' '); const dis = await b.$eval('#cfGo', x => x.disabled);
  const dupTxt = m.slice(m.indexOf('👯')); log('② confirm box has dup:', /👯/.test(m), 'button locked:', dis);
  if (!/👯 같은 수금이 두 번/.test(m)) errs.push('② confirm shows 👯 same payment twice');
  if (!dis) errs.push('② confirm button locked until acknowledged');
  /* ③ 할부 — BRANDON 정산 확정 창의 걸림 목록에 ACH-I1/I2 가 👯 로 나오지 않음 */
  const blk = await b.evaluate(() => [...document.querySelectorAll('#mbox')].map(x => x.innerHTML).join(''));
  log('③ installment flagged?', /ACH-I1|ACH-I2/.test(blk)); if (/ACH-I1|ACH-I2/.test(blk)) errs.push('③ installments of the same source are not twins');
  await b.close();
  /* ④ */
  const c = await open(900, true);
  await c.evaluate(() => { location.hash = '#/admin/imp'; }); await c.waitForSelector('#f2', { state: 'attached', timeout: 8000 }); await c.evaluate(() => { const d = document.getElementById('impOld'); if (d) d.open = true; });
  await c.setInputFiles('#f2', { name: 'SALES.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('fake') });
  await c.waitForFunction(() => document.querySelectorAll('#impOut .alert').length >= 1 && !document.getElementById('busy').classList.contains('on'), null, { timeout: 30000 }).catch(() => errs.push('④ import should finish'));
  const msg = await c.$$eval('#impOut .alert', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')); log('④ msg:', msg.slice(0, 200));
  const n = await c.evaluate(() => Object.values(window.__MOCK_STORE__.cod).filter(x => x.acct === '1271' && Number(x.amt) === 777).length); log('④ ACH 777 records:', n);
  if (!/👯 이미 있는 같은 수금 1건 건너뜀/.test(msg)) errs.push('④ message says 1 twin skipped');
  if (n !== 2) errs.push('④ no third record');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
