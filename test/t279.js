/* v0.8.240 시험 — 📥 잔액(Balance) 열이 없는 인보이스 목록 가져오기 (2026-11-13 관리자: "살아있는 인보이스 안 보이는 가게가 너무 많다" — 11/07 · 11/13 가져오기의 새 인보이스가 모두 완납 · 잔액 0)
 *   ① 미리보기에 "잔액 열이 없습니다 — 새 인보이스 중 최근 120일 N장은 미결" 안내
 *   ② 새 인보이스: 최근(3일 전) → 미결 · 잔액 = 합계 · balUnknown 표시 / 오래된 것(200일 전) → 완납 · 잔액 0
 *   ③ 이미 있는 인보이스는 잔액 · 상태 그대로 (덮어쓰지 않음) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const dir = path.resolve(__dirname, 'out'); fs.mkdirSync(dir, { recursive: true });
  const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(d)); };
  const inv = path.join(dir, 't279-inv.csv');
  fs.writeFileSync(inv, 'Invoice #,Trans Date,Customer #,Customer Name,Sales Rep,Total,Memo\n' + ['A9911,' + day(3) + ',1111,ALI B/S # 1,BRANDON,864,OPEN', 'A9912,' + day(200) + ',1271,BEAUTY 4U,BRANDON,50,', 'A9800,' + day(5) + ',1111,ALI B/S # 1,BRANDON,999,'].join('\n') + '\n');
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8964', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await (await br.newContext({ viewport: { width: 1000, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.XLSX = { read: buf => { const t = new TextDecoder().decode(buf); return { SheetNames: ['S1'], Sheets: { S1: t.trim().split(/\r?\n/).map(l => l.split(',').map(x => x !== '' && !isNaN(Number(x)) && !/^\d{4}-/.test(x) ? Number(x) : x)) } }; }, utils: { sheet_to_json: ws => ws.map(r => r.slice()) } }; });
  await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; window.__AFTER_SEED__ = new Function('s', o); },
    "s.invoices = (s.invoices || []).concat([{ id: 'A-009800', no: 'A-009800', t: 'A', src: 'legacy', d: '" + day(5) + "', ym: '" + day(5).slice(0, 7) + "', acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', total: 999, bal: 400, st: 'open', memo: 'keep me' }]);");
  await pg.goto('http://127.0.0.1:8964/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  await pg.evaluate(() => { location.hash = '#/admin/imp'; }); await pg.waitForSelector('#f5', { state: 'attached', timeout: 8000 }); await pg.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
  await pg.fill('#f5From', day(400)); await pg.setInputFiles('#f5', inv); await pg.waitForSelector('#invGo', { timeout: 15000 });
  const pv = (await pg.evaluate(() => (document.querySelector('#invGo').closest('div[id]') || document.body).textContent)).replace(/\s+/g, ' ');
  log('① preview:', (pv.match(/⚠️ 이 파일에는[^.]*\./) || [''])[0]);
  if (!/잔액\(Balance\) 열이 없습니다/.test(pv) || !/최근 120일 것 1장은 미결/.test(pv)) errs.push('① no-balance notice with the count of recent new invoices going in as open');
  await pg.click('#invGo'); await pg.waitForTimeout(2500);
  const r = await pg.evaluate(() => { const I = window.__MOCK_STORE__.invoices, g = k => I[k] ? [I[k].st, I[k].bal, I[k].balUnknown ? 'unk' : '', I[k].memo || ''].join('|') : null; return { recent: g('A-009911'), old: g('A-009912'), ex: g('A-009800') }; });
  log('② ③ saved:', JSON.stringify(r));
  if (r.recent !== 'open|864|unk|OPEN') errs.push('② recent new invoice → open, balance = total, marked balUnknown');
  if (!r.old || !/^paid\|0\|/.test(r.old)) errs.push('② old new invoice (>120 days) → paid');
  if (!r.ex || !/^open\|400\|/.test(r.ex)) errs.push('③ existing invoice keeps its balance and status');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
