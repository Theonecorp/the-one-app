/* v0.8.232 시험 — 📷 수금 리포트 갤러리 사진 · ↩ 결제 입력에 CM 도 미결로 (2026-11-13 관리자: "갤러리에서 사진 첨부 시 에러" · "크레딧카드 · COD · ACH 입력 시 미결 인보이스 선택 · 크레딧 CM 도 미결 인보이스처럼 나와야 금액 맞춰서 결제")
 *   ① 세일즈맨 오늘 내역 › 🖼 여러 장 고르기: 세밀한 사진 8장(줄여도 한 장 수백 KB) 한 번에 → 8장 모두 붙음 · 합계가 리포트 한도(820KB) 안 · "용량 한도" 오류 없음
 *      (전에는 한 장 50~300KB 라 3~5장에서 한도에 걸려 나머지가 빠졌음 → 장수에 맞춰 전부 다시 줄임)
 *   ② 리포트 전송 → reports 문서에 사진 8장 그대로
 *   ③ 💳 COD · 카드 입력: 가게를 고르면 미결 인보이스와 ↩ CM 칩이 같이 (CM 은 뒤 · 다른 색) → CM 칩을 누르면 줄 금액 −30 · 인보이스 칩 + → 금액 = 인보이스 − CM
 *   ④ 🏦 ACH 입력도 ↩ CM 칩 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8995', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  /* 큰 사진 8장 만들기 (체크처럼 글씨 + 잡티) */
  const gen = await (await br.newContext()).newPage();
  const pics = await gen.evaluate(() => { const out = []; for (let k = 0; k < 8; k++) { const c = document.createElement('canvas'); c.width = 1400; c.height = 1030; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 1400, 1030); gr.addColorStop(0, '#dbeafe'); gr.addColorStop(1, '#fef3c7'); g.fillStyle = gr; g.fillRect(0, 0, 1400, 1030);
    const im = g.getImageData(0, 0, 1400, 1030), d = im.data; for (let i = 0; i < d.length; i += 4) { d[i] = d[i] * 0.45 + Math.random() * 140; d[i + 1] = d[i + 1] * 0.45 + Math.random() * 140; d[i + 2] = d[i + 2] * 0.45 + Math.random() * 140; }   /* 실제 폰 사진처럼 줄여도 큰 사진 (잡티가 줄일 때 뭉개지지 않게 원본도 작게 → 1100px 에서 한 장 수백 KB) */ g.putImageData(im, 0, 0);
    g.fillStyle = '#111'; g.font = 'bold 56px Arial'; g.fillText('PAY TO THE ORDER OF THE ONE CORP  #' + (1000 + k), 60, 280); g.fillText('$ 1,234.' + k + '0', 840, 520);
    out.push(c.toDataURL('image/jpeg', 0.92).split(',')[1]); } return out; });
  const files = pics.map((b, i) => ({ name: 'IMG_' + (2000 + i) + '.JPG', mimeType: 'image/jpeg', buffer: Buffer.from(b, 'base64') }));
  log('generated:', files.map(f => Math.round(f.buffer.length / 1000) + 'KB').join(' '));
  const open = async (email, seed) => { const pg = await (await br.newContext({ viewport: { width: 430, height: 950 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(e => { window.__MOCK_USER__ = { email: e, name: 'U' }; window.open = () => null; window.__AFTER_SEED__ = s => { const d = new Date().toISOString().slice(0, 10);
      s.invoices = (s.invoices || []).concat([{ id: 'A-050600', no: 'A-050600', t: 'A', acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', d, ym: d.slice(0, 7), total: 100, bal: 100, st: 'open', src: 'app', lines: [] },
        { id: 'CM-000099', no: 'CM-000099', t: 'CM', kind: 'credit', src: 'credit', acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', d, ym: d.slice(0, 7), total: -30, bal: -30, st: 'open', lines: [] }]); }; }, email);
    await pg.goto('http://127.0.0.1:8995/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(600); return pg; };
  /* ① ② */
  const sm = await open('brandon@x.com');
  await sm.evaluate(() => { location.hash = '#/entry/new'; }); await sm.waitForSelector('#fAcct'); await sm.fill('#fAcct', '1111'); await sm.waitForTimeout(500);
  await sm.fill('[data-pref="0"]', '7777'); await sm.fill('[data-pamt="0"]', '10000'); await sm.dispatchEvent('[data-pamt="0"]', 'input'); await sm.dispatchEvent('[data-pamt="0"]', 'change');
  await sm.click('#btnSave'); await sm.waitForSelector('#cfOk'); await sm.click('#cfOk'); await sm.waitForSelector('#rPhotoLib', { state: 'attached', timeout: 8000 });
  const toasts = []; await sm.exposeFunction('__t272', t => toasts.push(t)); await sm.evaluate(() => { const t = document.getElementById('toast'); new MutationObserver(() => window.__t272(t.textContent)).observe(t, { childList: true, characterData: true, subtree: true }); });
  const t0 = Date.now(); await sm.setInputFiles('#rPhotoLib', files);
  await sm.waitForFunction(() => document.querySelectorAll('#phGrid img').length >= 8 && !/준비 중/.test((document.getElementById('phHint') || {}).textContent || ''), null, { timeout: 90000 }).catch(() => {});
  await sm.waitForTimeout(500);
  const ph = await sm.evaluate(() => { const L = [...document.querySelectorAll('#phGrid img')].map(i => i.src.length); return { n: L.length, tot: L.reduce((a, x) => a + x, 0), each: L.map(x => Math.round(x / 1000)) }; });
  log('① photos:', JSON.stringify(ph), (Date.now() - t0) + 'ms', 'toasts:', JSON.stringify(toasts));
  if (ph.n !== 8) errs.push('① all 8 gallery photos attached (got ' + ph.n + ')');
  if (ph.tot > 820000) errs.push('① total fits the report limit (820KB), got ' + ph.tot);
  if (toasts.some(t => /한도|읽지 못/.test(t))) errs.push('① no size-limit / read error');
  await sm.click('#btnSend'); await sm.waitForSelector('#cfOk'); await sm.click('#cfOk'); await sm.waitForTimeout(1200);
  const rep = await sm.evaluate(() => Object.values(window.__MOCK_STORE__.reports || {}).map(r => (r.photos || []).length)); log('② report photos:', JSON.stringify(rep)); if (!rep.includes(8)) errs.push('② report carries all 8 photos');
  /* ③ */
  const of = await open('luke@theonefl.com');
  await of.evaluate(() => { location.hash = '#/cod'; }); await of.waitForSelector('#btnCodNew', { timeout: 8000 }); await of.click('#btnCodNew'); await of.waitForSelector('#cStore');
  await of.fill('#cStore', '1111'); await of.dispatchEvent('#cStore', 'input'); await of.waitForSelector('#cHits [data-a="1111"]'); await of.click('#cHits [data-a="1111"]');
  await of.waitForSelector('#cOpen [data-oi="CM-000099"]', { timeout: 8000 }).catch(() => {});
  const chips = await of.evaluate(() => [...document.querySelectorAll('#cOpen [data-oi]')].map(b => b.dataset.oi + (b.classList.contains('cmchip') ? '(cm)' : ''))); log('③ COD chips:', JSON.stringify(chips));
  if (!chips.includes('CM-000099(cm)') || !chips.includes('A-050600') || chips.indexOf('CM-000099(cm)') < chips.indexOf('A-050600')) errs.push('③ open CM shows as a chip (after the invoices, credit colour)');
  if (chips.includes('CM-000099(cm)')) { await of.click('#cOpen [data-oi="A-050600"]'); await of.waitForTimeout(150); await of.click('#cOpen [data-oi="CM-000099"]'); await of.waitForTimeout(200);
    const v = await of.evaluate(() => ({ rows: [...document.querySelectorAll('[data-cno]')].map(e => e.value + '=' + document.querySelector('[data-camt="' + e.dataset.cno + '"]').value).filter(x => x !== '='), amt: document.getElementById('cAmt').value }));
    log('③ rows:', JSON.stringify(v)); if (!v.rows.includes('A-050600=100') || !v.rows.includes('CM-000099=-30') || Number(v.amt) !== 70) errs.push('③ invoice 100 + CM −30 → payment amount 70'); }
  /* ④ */
  await of.evaluate(() => { location.hash = '#/ach/new'; }); await of.waitForSelector('#aQ', { timeout: 8000 }); await of.fill('#aQ', '1111'); await of.dispatchEvent('#aQ', 'input'); await of.waitForSelector('#aHits [data-a="1111"]'); await of.click('#aHits [data-a="1111"]');
  await of.waitForSelector('#aOpen [data-ao="CM-000099"]', { timeout: 8000 }).catch(() => {});
  const ach = await of.evaluate(() => [...document.querySelectorAll('#aOpen [data-ao]')].map(b => b.dataset.ao + (b.classList.contains('cmchip') ? '(cm)' : ''))); log('④ ACH chips:', JSON.stringify(ach));
  if (!ach.includes('CM-000099(cm)')) errs.push('④ ACH entry shows the open CM chip');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
