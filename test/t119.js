/* v0.8.155 시험 — 📱 폰(≤640px)에서는 모든 목록이 카드 줄(.crow)로 — 거래처 · 주문 · 인보이스 · 아이템 모두 가로 스크롤 없이 화면 폭 안에
 *   넓은 화면(1100px)에서는 그대로 표(table.dt) · 거래처 카드에는 담당 · 상태 배지가 보임 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8874', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const seed = s => { const ago = h => new Date(Date.now() - h * 3600000).toISOString(); const mk = (id, sm, store, h) => ({ id, no: id, d: ago(h).substring(0, 10), ym: ago(h).substring(0, 7), sm, acct: '1111', store, st: 'sent', n: 1, qty: 1, amt: 10, createdAt: ago(h), updatedAt: ago(h), sentAt: ago(h) }); s.orders = [mk('O-A1', 'ALEX', 'A SHOP', 1), mk('O-B1', 'BRANDON', 'B SHOP', 2)]; s.orderLines = [];
    const d = new Date().toISOString().substring(0, 10); s.invoices = (s.invoices || []).concat([{ id: 'A-077001', no: 'A-077001', t: 'A', d, ym: d.substring(0, 7), acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', total: 120, bal: 120, st: 'open', lines: [] }]); };
  const mk = async (w) => { const ctx = await br.newContext({ viewport: { width: w, height: 860 }, hasTouch: w < 700, isMobile: w < 700 }); const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(f => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', f); try { localStorage.setItem('theone.order.view', 'list'); } catch (x) {} }, '(' + seed.toString() + ')(s)');
    await pg.goto('http://127.0.0.1:8874/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(500); return pg; };
  const fits = async (pg, w, what) => { const sw = await pg.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)); log(what, 'scrollWidth', sw, '/', w); if (sw > w) errs.push(what + ' overflows the phone width: ' + sw + ' > ' + w); };
  const go = async (pg, h, sel) => { await pg.evaluate(x => { location.hash = x; }, h); await pg.waitForSelector(sel, { timeout: 8000 }).catch(() => errs.push(sel + ' missing on ' + h)); await pg.waitForTimeout(600); };

  /* ---------- 📱 390px ---------- */
  let pg = await mk(390);
  await go(pg, '#/stores', '#page .crows [data-st]');
  const st = await pg.$$eval('#page .crow[data-st]', r => r.map(x => ({ w: Math.round(x.getBoundingClientRect().width), tags: [...x.querySelectorAll('.tag')].map(t => t.textContent.trim()), txt: x.textContent.replace(/\s+/g, ' ').trim() }))); log('store cards:', st.length, st[0]);
  if (!st.length) errs.push('customers should be card rows on a phone'); if (await pg.$('#page table.dt')) errs.push('no table on a phone'); if (st.length && !st.some(c => c.tags.length)) errs.push('store card should show the salesman / status badge'); if (st.length && st[0].w > 390) errs.push('store card wider than the screen');
  await fits(pg, 390, 'stores'); await pg.screenshot({ path: path.resolve(__dirname, 'out', 'phone_stores.png') });
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(800); await pg.evaluate(() => window.dispatchEvent(new CustomEvent('theone:list', { detail: 'sent' }))); await pg.waitForTimeout(900); if (await pg.$('[data-grp="sm"]')) { await pg.click('[data-grp="sm"]'); await pg.waitForTimeout(500); }
  const od = await pg.evaluate(() => ({ grp: document.querySelectorAll('#page .crows.otbl .cgrp').length, rows: document.querySelectorAll('#page .crows.otbl .crow[data-oid]').length, tbl: !!document.querySelector('#page table.otbl') })); log('orders:', od);
  if (!od.rows || od.tbl) errs.push('orders should be card rows on a phone: ' + JSON.stringify(od)); await fits(pg, 390, 'orders');
  await go(pg, '#/invs', '#iList .crows.itbl');
  const iv = await pg.evaluate(() => ({ rows: document.querySelectorAll('#iList .crow[data-go^="inv:"]').length, grp: document.querySelectorAll('#iList .cgrp').length })); log('invoices:', iv); if (!iv.rows || !iv.grp) errs.push('invoices should be card rows with day groups: ' + JSON.stringify(iv)); await fits(pg, 390, 'invoices');
  await pg.click('#iList .crow[data-go^="inv:"]'); await pg.waitForSelector('#modal.on', { timeout: 5000 }).catch(() => errs.push('tapping an invoice card should open the detail')); if (await pg.$('#modal.on')) { await pg.click('#modal .mclose'); await pg.waitForTimeout(150); }
  await go(pg, '#/items', '#itList .crow[data-it]');
  const it = await pg.$$eval('#itList .crow[data-it]', r => r.length); log('item cards:', it); if (!it) errs.push('items should be card rows on a phone'); await fits(pg, 390, 'items');
  await pg.context().close();

  /* ---------- 🖥 1100px: 표 그대로 ---------- */
  pg = await mk(1100);
  await go(pg, '#/stores', '#page table.dt');
  const wide = await pg.evaluate(() => ({ tbl: !!document.querySelector('#page table.dt'), cards: document.querySelectorAll('#page .crow').length, th: [...document.querySelectorAll('#page table.dt th')].map(t => t.textContent.trim()).filter(Boolean).length })); log('wide stores:', wide);
  if (!wide.tbl || wide.cards) errs.push('wide screens should keep the table'); if (wide.th < 5) errs.push('wide table should have its columns');
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(800); await pg.evaluate(() => window.dispatchEvent(new CustomEvent('theone:list', { detail: 'sent' }))); await pg.waitForTimeout(900); if (!(await pg.$('#page table.otbl tr[data-oid]'))) errs.push('orders should stay a table on wide screens');
  await pg.context().close();

  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL', errs); process.exit(1); } console.log('PASS');
})().catch(e => { console.error(e); process.exit(1); });
