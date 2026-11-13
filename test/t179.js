/* v0.8.182 시험 — 🐝 SmartBee 업데이트: AR 과 새 인보이스만 (2026-11-11 관리자: "아직 SmartBee 를 쓰는 세일즈맨이 있어서 AR 이랑 새로 만들어지는 인보이스만")
 *   ① 관리 → 가져오기 맨 위에 🐝 카드 (AR 파일 · 기준일 · 인보이스 목록 파일 · 확인 시작일)
 *   ② 인보이스 목록: 앱에 없는 번호만 넣음 — 이미 있는 인보이스(이전 시스템 · 앱 발행)는 그대로 · 세일즈맨별 새 장수
 *   ③ 파일의 인보이스가 모두 있으면 "새 인보이스가 없습니다" (아무것도 안 씀)
 *   ④ AR 파일: 그 기준일의 미수금으로 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const dir = path.resolve(__dirname, 'out'); fs.mkdirSync(dir, { recursive: true });
  const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(d)); };
  const inv1 = path.join(dir, 't179-inv.csv'), inv2 = path.join(dir, 't179-inv-old.csv'), ar = path.join(dir, 't179-ar.csv');
  const H = 'Invoice #,Trans Date,Customer #,Customer Name,Sales Rep,Total,Balance\n';
  fs.writeFileSync(inv1, H + ['A9901,' + day(3) + ',1111,ALI B/S # 1,BRANDON,120,120', 'A9902,' + day(2) + ',1271,BEAUTY 4U,BRANDON,80,80', 'A9903,' + day(1) + ',2478,JIM DANDY MART,SOO,55.5,55.5', 'A9800,' + day(5) + ',1111,ALI B/S # 1,BRANDON,999,0'].join('\n') + '\n');
  fs.writeFileSync(inv2, H + 'A9800,' + day(5) + ',1111,ALI B/S # 1,BRANDON,999,0\n');
  fs.writeFileSync(ar, 'Sales Rep,Customer #,Customer Name,Invoice #,Invoice Date,Invoice Total,Balance\nBRANDON,1111,ALI B/S # 1,A9901,' + day(3) + ',120,120\nBRANDON,1271,BEAUTY 4U,A9902,' + day(2) + ',80,80\n');
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8845', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await (await br.newContext({ viewport: { width: 1000, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  /* 시험 컨테이너는 CDN(SheetJS)에 못 나가므로 CSV 만 읽는 작은 대역 — 앱 코드는 그대로 (XLSX.read · utils.sheet_to_json(header:1) 만 씀) */
  await pg.addInitScript(() => { window.XLSX = { read: buf => { const t = new TextDecoder().decode(buf); return { SheetNames: ['S1'], Sheets: { S1: t.trim().split(/\r?\n/).map(l => l.split(',').map(x => x !== '' && !isNaN(Number(x)) && !/^\d{4}-/.test(x) ? Number(x) : x)) } }; }, utils: { sheet_to_json: ws => ws.map(r => r.slice()) } }; });
  await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; window.__AFTER_SEED__ = new Function('s', o); },
    "s.invoices = (s.invoices || []).concat([{ id: 'A-009800', no: 'A-009800', t: 'A', src: 'legacy', d: '" + day(5) + "', ym: '" + day(5).slice(0, 7) + "', acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', total: 999, bal: 0, st: 'paid', memo: 'keep me' }]); s.ar.push({ id: 'SOO', sm: 'SOO', asOf: '" + day(9) + "', total: 300, n: 1, stores: [{ acct: '4444', store: 'SOO SHOP', sm: 'SOO', total: 300, invs: [{ inv: 'A7000', d: '" + day(40) + "', amt: 300, bal: 300 }] }] });");
  await pg.goto('http://127.0.0.1:8845/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  await pg.evaluate(() => { location.hash = '#/admin/imp'; }); await pg.waitForSelector('#sbInvF', { timeout: 8000 });
  /* ① 카드가 맨 위 */
  const first = await pg.$eval('#adminBody .card', e => e.textContent); if (!/SmartBee 업데이트/.test(first)) errs.push('① the SmartBee card is first on the import page');
  /* ② 새 인보이스만 */
  await pg.fill('#sbInvFrom', day(30)); await pg.setInputFiles('#sbInvF', inv1); await pg.waitForSelector('#sbInvOut #invGo', { timeout: 10000 });
  const pv = (await pg.textContent('#sbInvOut')).replace(/\s+/g, ' '); log('② preview:', pv.slice(0, 200));
  if (!/새 인보이스 — 세일즈맨별: BRANDON 2 · SOO 1/.test(pv) || !/인보이스 3장 \(새로 3 · 이미 있음 0\)/.test(pv)) errs.push('② preview shows only the 3 new invoices (BRANDON 2 · SOO 1)');
  await pg.click('#sbInvOut #invGo'); await pg.waitForSelector('#sbInvOut .a-grn', { timeout: 15000 });
  const st = await pg.evaluate(() => { const I = window.__MOCK_STORE__.invoices; return { n: ['A-009901', 'A-009902', 'A-009903'].filter(k => I[k] && I[k].src === 'legacy').length, old: I['A-009800'] && { total: I['A-009800'].total, memo: I['A-009800'].memo, importedAt: I['A-009800'].importedAt || '' } }; });
  log('② saved:', JSON.stringify(st)); if (st.n !== 3) errs.push('② the 3 new invoices are saved'); if (!st.old || st.old.memo !== 'keep me' || st.old.importedAt) errs.push('② the existing invoice is left untouched');
  /* ③ 모두 있음 */
  await pg.setInputFiles('#sbInvF', inv2); await pg.waitForTimeout(1500); const none = (await pg.textContent('#sbInvOut')).replace(/\s+/g, ' '); log('③', none.slice(0, 90));
  if (!/새 인보이스가 없습니다/.test(none) || await pg.$('#sbInvOut #invGo')) errs.push('③ nothing new → says so, no save button');
  /* ④ AR — 미리보기 · 파일에 없는 세일즈맨 경고 · 저장 */
  await pg.fill('#sbArD', day(1)); await pg.setInputFiles('#sbArF', ar); await pg.waitForSelector('#sbArOut #sbArGo', { timeout: 15000 });
  const pre = (await pg.textContent('#sbArOut')).replace(/\s+/g, ' '); log('④ preview:', pre.slice(0, 260));
  if (!/AR 파일: 2장 · \$200\.00 · 가게 2 · 기준일/.test(pre)) errs.push('④ preview shows the A/R file totals before saving');
  if (!/미수금이 \$0 이 됩니다: SOO \$300\.00/.test(pre) || !/빠지는 가게: BRANDON 1곳 \$600\.00/.test(pre)) errs.push('④ warns that SOO (no stores in the file) would drop to $0, lists BRANDON stores treated as paid');
  const before = await pg.evaluate(() => (window.__MOCK_STORE__.ar.SOO || {}).total); if (before !== 300) errs.push('④ nothing saved before the button (SOO ' + before + ')');
  await pg.click('#sbArOut #sbArGo'); await pg.waitForSelector('#sbArOut .a-grn, #sbArOut .a-red', { timeout: 15000 });
  const arDoc = await pg.evaluate(() => { const A = window.__MOCK_STORE__.ar || {}; return Object.values(A).map(d => d.id + ':' + d.asOf + ':' + (d.stores || []).length).join(' '); });
  log('④ saved:', arDoc); if (!arDoc.includes('BRANDON:' + day(1) + ':2')) errs.push('④ A/R saved with the chosen as-of date');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
