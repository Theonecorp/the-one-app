/* v0.8.162 시험 — 💳 COD · 카드 입력: 가게를 고른 직후(기존 수금을 아직 읽는 중)에 저장해도 🔁 중복 인보이스 경고가 빠지지 않음
 *   느린 연결(읽기마다 1.2초)에서 가게 → 인보이스 번호 A10021(이미 현장 수금 E1 에 있음) → 곧바로 저장 → 경고 창이 떠야 함 (전에는 읽기 전이라 그냥 저장됨 · CI 에서 t074 가 가끔 떨어진 원인) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8880', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'acct@theonefl.com', name: 'X' }; });
  await pg.goto('http://127.0.0.1:8880/test/demo.html'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(300);
  await pg.evaluate(() => { location.hash = '#/cod'; }); await pg.waitForSelector('#btnCodNew', { timeout: 8000 });
  await pg.click('#btnCodNew'); await pg.waitForSelector('#cSave');
  await pg.selectOption('#cSm', 'BRANDON'); await pg.fill('#cStore', 'ALI B'); await pg.waitForSelector('#cHits [data-a="1111"]');
  await pg.evaluate(() => { window.__MOCK_DELAY__ = 1200; });   // 지금부터 읽기가 느림
  await pg.click('#cHits [data-a="1111"]');
  await pg.fill('#cRef', '5511'); await pg.fill('[data-cno="0"]', 'A10021'); await pg.fill('[data-camt="0"]', '100'); await pg.fill('#cAmt', '100');
  const t0 = Date.now(); await pg.click('#cSave');
  const asked = await pg.waitForSelector('#cfOk', { timeout: 8000 }).then(() => true).catch(() => false);
  const q = asked ? (await pg.textContent('.ovr h2').catch(() => '')).replace(/\s+/g, ' ') : ''; log('asked after', Date.now() - t0, 'ms:', asked, q.slice(0, 100));
  if (!asked || !/A10021/.test(q)) errs.push('duplicate invoice warning must appear even when saving before the store data finished loading');
  if (asked) await pg.click('#cfNo');
  await pg.evaluate(() => { window.__MOCK_DELAY__ = 0; }); await pg.waitForTimeout(300);
  const saved = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.cod).filter(x => !x.void && (x.invs || []).some(v => v.no === 'A10021')).length); log('saved with A10021:', saved);
  if (saved) errs.push('answering no to the warning must not save');
  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL'); errs.forEach(e => console.log(' -', e)); process.exit(1); }
  console.log('PASS');
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
