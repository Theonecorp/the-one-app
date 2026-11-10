/* v0.8.180 시험 — 📅 영업일 기준 · 📊 일일 요약 메일 (2026-11-10 관리자)
 *   ① src/bizday.js: 주말 · 연방 공휴일(대체일) 빼고 셈 · 추가 휴일 · 회사가 일하는 공휴일(workHolidays) · 금 16시 → 월 10시 = 18시간
 *   ② apps-script biz_ 가 앱과 같은 날을 영업일로 봄 (2026-2027 매일)
 *   ③ 요약 메일: 기간 = 지난 영업일 ~ 어제 (월요일 = 금 · 토 · 일) · 새 주문 · 인보이스 · 크레딧 · 수금(방법별) · 📦 UPS 박스 · 특이사항(밀린 주문 · 안 보낸 주문/수금 · 확인 대기 · UPS 기록 끊김)
 *      · 영업일 아침 정한 시각 뒤 하루 한 번 · 주말 · 휴일 · 시각 전에는 안 보냄
 *   ④ 관리 → 설정: 휴일 체크 끄기 → workHolidays · 추가 휴일 · 요약 받는 사람 · 시각 저장 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs'), vm = require('vm');
const fmtTz = (d, tz, f) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short', timeZoneName: 'longOffset' }).formatToParts(d).map(x => [x.type, x.value]));
  if (f === 'yyyy-MM-dd') return p.year + '-' + p.month + '-' + p.day; if (f === 'H') return String(Number(p.hour)); if (f === 'm') return String(Number(p.minute)); if (f === 'u') return String(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1);
  if (f === 'XXX') return p.timeZoneName.replace('GMT', '') || '+00:00'; throw new Error('fmt ' + f); };
(async () => {
  const errs = [], log = (...a) => console.log(...a);
  /* ① 앱 */
  process.env.TZ = 'America/New_York';
  const BD = await import(path.resolve(__dirname, '..', 'src', 'bizday.js'));
  BD.register({ settings: {} });
  const chk = (lab, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) errs.push('① ' + lab + ': got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); };
  chk('Sat not biz', BD.isBiz('2026-11-14'), false); chk('Veterans Day (Wed 11/11) holiday', BD.isBiz('2026-11-11'), false); chk('Thanksgiving holiday', BD.isBiz('2026-11-26'), false); chk('Black Friday is biz', BD.isBiz('2026-11-27'), true);
  chk('July 4 2026 Sat → observed Fri 7/3', BD.isBiz('2026-07-03'), false); chk('Fri → Mon = 1', BD.bizDaysBetween('2026-11-06', '2026-11-09'), 1); chk('Mon → Mon = 4 (11/11 holiday)', BD.bizDaysBetween('2026-11-09', '2026-11-16'), 4);
  chk('backwards negative', BD.bizDaysBetween('2026-11-16', '2026-11-09'), -4); chk('Fri 16:00 → Mon 10:00 = 18h', BD.bizMs('2026-11-06T16:00:00-05:00', '2026-11-09T10:00:00-05:00') / 3600000, 18);
  chk('addBizDays Fri + 1 = Mon', BD.addBizDays('2026-11-06', 1), '2026-11-09');
  BD.register({ settings: { holidays: ['2026-11-27'], workHolidays: ['2026-11-11'] } });
  chk('extra holiday', BD.isBiz('2026-11-27'), false); chk('company works 11/11', BD.isBiz('2026-11-11'), true); chk('bank still closed 11/11', !!BD.bankHolidays()['2026-11-11'], true);
  BD.register({ settings: {} });
  /* ② Apps Script 같은 규칙 */
  const code = fs.readFileSync(path.resolve(__dirname, '..', 'apps-script/Code.gs'), 'utf8');
  const gas = (now, data, props) => {
    const sent = [], P = props || {};
    const ctx = { Logger: { log: () => {} }, console, Date: class extends Date { constructor(...a) { if (!a.length) super(now); else super(...a); } static now() { return now; } },
      Utilities: { formatDate: fmtTz }, Session: { getActiveUser: () => ({ getEmail: () => 'me@x.com' }) },
      MailApp: { sendEmail: o => sent.push(o) },
      PropertiesService: { getScriptProperties: () => ({ getProperty: k => P[k] || null, setProperty: (k, v) => { P[k] = v; }, deleteProperty: k => { delete P[k]; } }) } };
    vm.createContext(ctx); vm.runInContext(code, ctx);
    const D = data || {};
    ctx.getDoc_ = (c, id) => c === 'settings' ? (D.settings || {}) : null;
    ctx.queryIn_ = col => (D[col] || []).slice(); ctx.queryGe_ = (col, f, v) => (D[col] || []).filter(x => x[f] >= v);
    ctx.listAll_ = col => (D[col] || []).slice(); ctx.query_ = (col, f, v) => (D[col] || []).filter(x => String(x[f]) === String(v));
    return { ctx, sent, P };
  };
  const { ctx: g0 } = gas(Date.now()); const GB = g0.biz_({});
  let diff = []; for (let t = new Date('2026-01-01T12:00:00Z'); t < new Date('2027-12-31T12:00:00Z'); t.setUTCDate(t.getUTCDate() + 1)) { const s = t.toISOString().substring(0, 10); if (GB.isBiz(s) !== BD.isBiz(s)) diff.push(s); }
  log('② app vs script differ:', diff.length, diff.slice(0, 5).join(' ')); if (diff.length) errs.push('② Apps Script biz days match the app (' + diff.slice(0, 5).join(' ') + ')');
  if (Math.round(GB.ms('2026-11-06T21:00:00Z', new Date('2026-11-09T15:00:00Z').getTime()) / 3600000) !== 18) errs.push('② script business hours Fri 16:00 → Mon 10:00 = 18h');
  /* ③ 요약 — 월요일 2026-11-16 아침 8시(뉴욕) · 기간 금 11/13 ~ 일 11/15 */
  const MON8 = new Date('2026-11-16T13:00:00Z').getTime(), iso = (d, h) => new Date(d + 'T' + String(h).padStart(2, '0') + ':00:00-05:00').toISOString();
  const data = { settings: {},
    orders: [{ id: 'O1', st: 'sent', sm: 'BRANDON', store: 'ALI', amt: 1200, sentAt: iso('2026-11-13', 10), ym: '2026-11' }, { id: 'O2', st: 'pick', sm: 'SOO', store: 'BIG SHOP', amt: 6000, sentAt: iso('2026-11-14', 9), pickAt: iso('2026-11-12', 9), ym: '2026-11' },
      { id: 'O3', st: 'draft', sm: 'SOO', store: 'DRAFTY', amt: 80, updatedAt: iso('2026-11-15', 9), ym: '2026-11' }, { id: 'O4', st: 'sent', sm: 'BRANDON', store: 'OLDER', amt: 50, sentAt: iso('2026-11-12', 9), cfReq: true, cfReqAt: iso('2026-11-12', 9), ym: '2026-11' },
      { id: 'O5', st: 'shipped', sm: 'SOO', store: 'GONE', amt: 300, sentAt: iso('2026-11-10', 9), shipAt: iso('2026-11-13', 15), ym: '2026-11' }],
    invoices: [{ t: 'A', st: 'open', d: '2026-11-13', total: 1000, sm: 'BRANDON' }, { t: 'A', st: 'x', d: '2026-11-13', total: 999 }, { t: 'CM', src: 'credit', st: 'open', d: '2026-11-14', total: -40, sm: 'SOO', store: 'ALI', reviewed: false }, { t: 'A', st: 'paid', src: 'legacy', d: '2026-11-03', total: 500 }],
    entries: [{ d: '2026-11-13', sm: 'BRANDON', total: 700, pays: [{ m: 'CHECK', amt: 500 }, { m: 'CASH', amt: 200 }], rep: true }, { d: '2026-11-14', sm: 'SOO', total: 90, pays: [{ m: 'ZELLE', amt: 90 }], rep: false, createdAt: iso('2026-11-14', 9) }, { d: '2026-11-12', sm: 'SOO', total: 33, pays: [{ m: 'CHECK', amt: 33 }], rep: true }],
    cod: [{ d: '2026-11-13', method: 'ACH', amt: 400 }],
    shipments: [{ shipDate: '2026-11-13', store: 'ALI', shipId: 'S1', trk: '1', w: 10, cost: 12, svcName: 'UPS Ground' }, { shipDate: '2026-11-13', store: 'ALI', shipId: 'S1', trk: '2', w: 12, cost: 12, svcName: 'UPS Ground' }, { shipDate: '2026-11-13', store: 'GONE', shipId: 'S2', trk: '3', w: 5, cost: 9, svcName: 'UPS Ground' }, { shipDate: '2026-11-12', store: 'X', shipId: 'S3', trk: '4', w: 1 }, { shipDate: '2026-11-13', store: 'V', shipId: 'S4', trk: '5', voided: true }],
    salesmen: [], bounces: [], envelopes: [], reports: [], notifyq: [] };
  let G = gas(MON8, data); const B = G.ctx.biz_({}); const r = G.ctx.summaryData_(B, '2026-11-16', {});
  log('③ subject:', r.subject); log('③ data:', JSON.stringify(Object.assign({}, r.data, { notes: r.data.notes.length })));
  r.data.notes.forEach(n => log('   ·', n));
  if (r.data.from !== '2026-11-13' || r.data.to !== '2026-11-15') errs.push('③ Monday covers Fri 11/13 – Sun 11/15');
  if (r.data.newO !== 2 || r.data.newAmt !== 7200) errs.push('③ new orders in period: 2 · $7,200 (draft · earlier not counted)');
  if (r.data.invN !== 1 || r.data.invAmt !== 1000) errs.push('③ invoices: 1 · $1,000 (void · credit not counted)');
  if (r.data.col !== 1190) errs.push('③ collections 700 + 90 + ACH 400 = 1,190 (got ' + r.data.col + ')');
  if (r.data.boxes !== 3) errs.push('③ UPS boxes in period: 3 (voided · other days not counted)');
  const N = r.data.notes.join('\n');
  [/안 보낸 주문 1건/, /안 보낸 수금 1건/, /BIG SHOP \(📦 출고 작업/, /세일즈맨 확인 대기 1건/, /\$5,000 넘는 주문.*BIG SHOP/, /새 크레딧 1건/].forEach(re => { if (!re.test(N)) errs.push('③ note ' + re); });
  if (!/📦 출고 · UPS/.test(r.html) || !/3박스/.test(r.html) || !/2건 · 2곳/.test(r.html) || !/ACH \$400\.00/.test(r.html)) errs.push('③ html has UPS section (3 boxes · 2 shipments · 2 stores) and ACH by method');
  /* 보내는 때 */
  G = gas(MON8, data); G.ctx.dailySummary_(); log('③ Mon 8:00 sent:', G.sent.length, G.sent[0] && G.sent[0].to); if (G.sent.length !== 1 || !/luke@theonefl\.com/.test(G.sent[0].to)) errs.push('③ sends at 8:00 on a business day to the admin by default');
  G.ctx.dailySummary_(); if (G.sent.length !== 1) errs.push('③ once a day');
  G = gas(new Date('2026-11-16T11:00:00Z').getTime(), data); G.ctx.dailySummary_(); if (G.sent.length) errs.push('③ not before 7:00');
  G = gas(new Date('2026-11-14T13:00:00Z').getTime(), data); G.ctx.dailySummary_(); if (G.sent.length) errs.push('③ not on Saturday');
  G = gas(new Date('2026-11-11T13:00:00Z').getTime(), data); G.ctx.dailySummary_(); if (G.sent.length) errs.push('③ not on a holiday (Veterans Day)');
  G = gas(MON8, Object.assign({}, data, { settings: { summaryHour: -1 } })); G.ctx.dailySummary_(); if (G.sent.length) errs.push('③ summaryHour -1 = off');
  G = gas(MON8, Object.assign({}, data, { settings: { summaryTo: 'a@x.com, b@x.com', summaryHour: 6 } })); G.ctx.dailySummary_(); if (!G.sent.length || G.sent[0].to !== 'a@x.com,b@x.com') errs.push('③ summaryTo setting');
  /* ④ 관리 설정 */
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8839', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r2 => setTimeout(r2, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const pg = await (await br.newContext({ viewport: { width: 1200, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.clock.setFixedTime(new Date('2026-11-02T15:00:00Z'));
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; });
  await pg.goto('http://127.0.0.1:8839/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.evaluate(() => { location.hash = '#/admin/set'; }); await pg.waitForSelector('#stSumTo', { timeout: 8000 });
  const hols = await pg.$$eval('[data-hol]', B2 => B2.map(b => b.dataset.hol + (b.checked ? '+' : '-'))); log('④ holidays:', hols.join(' '));
  if (!hols.includes('2026-11-11+') || !hols.includes('2026-11-26+')) errs.push('④ upcoming federal holidays listed and checked');
  await pg.uncheck('[data-hol="2026-11-11"]'); await pg.fill('#stHol', '2026-11-27, bad, 2026-12-24'); await pg.fill('#stSumTo', 'a@x.com; nope'); await pg.fill('#stSumH', '6');
  await pg.click('#stSave'); await pg.waitForTimeout(700);
  const st = await pg.evaluate(() => { const a = window.__MOCK_STORE__.settings.app; return { h: a.holidays, w: a.workHolidays, to: a.summaryTo, hr: a.summaryHour }; }); log('④ saved:', JSON.stringify(st));
  if (JSON.stringify(st) !== JSON.stringify({ h: ['2026-11-27', '2026-12-24'], w: ['2026-11-11'], to: 'a@x.com', hr: 6 })) errs.push('④ settings saved (holidays · workHolidays · summaryTo · summaryHour)');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
