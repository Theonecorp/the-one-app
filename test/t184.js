/* v0.8.184 시험 — 📊 일일 요약 메일: 새로 들어온 게 한 건이라도 있으면 보내고, 없으면 안 보냄 (2026-11-11 관리자 — Veterans Day 에 요약이 안 와서)
 *   ① 공휴일(11/11) 아침에도 어제 들어온 게 있으면 보냄 · 토요일 아침도 금요일 것이 있으면 보냄
 *   ② 기간 = 지난번 보낸 요약 다음 날 ~ 어제 — 아무것도 없던 날은 안 보내고 다음 요약에 묶임 (일요일 안 보냄 → 월요일 = 토 · 일)
 *   ③ 특이사항(밀린 주문 등)만 있고 새로 들어온 게 없으면 안 보냄 · 하루 한 번만 확인 · 오래 쉬었어도 최대 7일
 *   ④ testSummary(force)는 없어도 보내고, 보낸 기록은 바꾸지 않음 */
const path = require('path'), fs = require('fs'), vm = require('vm');
const fmtTz = (d, tz, f) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short', timeZoneName: 'longOffset' }).formatToParts(d).map(x => [x.type, x.value]));
  if (f === 'yyyy-MM-dd') return p.year + '-' + p.month + '-' + p.day; if (f === 'H') return String(Number(p.hour)); if (f === 'm') return String(Number(p.minute)); if (f === 'u') return String(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1);
  if (f === 'XXX') return p.timeZoneName.replace('GMT', '') || '+00:00'; throw new Error('fmt ' + f); };
const code = fs.readFileSync(path.resolve(__dirname, '..', 'apps-script/Code.gs'), 'utf8');
const gas = (now, data, props) => {
  const sent = [], P = props || {};
  const ctx = { Logger: { log: () => {} }, console, Date: class extends Date { constructor(...a) { if (!a.length) super(now); else super(...a); } static now() { return now; } },
    Utilities: { formatDate: fmtTz }, Session: { getActiveUser: () => ({ getEmail: () => 'me@x.com' }) },
    MailApp: { sendEmail: o => sent.push(o) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => P[k] || null, setProperty: (k, v) => { P[k] = v; }, deleteProperty: k => { delete P[k]; } }) } };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  const D = data || {};
  ctx.getDoc_ = (c) => c === 'settings' ? (D.settings || {}) : null;
  ctx.queryIn_ = col => (D[col] || []).slice(); ctx.queryGe_ = (col, f, v) => (D[col] || []).filter(x => x[f] >= v);
  ctx.listAll_ = col => (D[col] || []).slice(); ctx.query_ = (col, f, v) => (D[col] || []).filter(x => String(x[f]) === String(v));
  return { ctx, sent, P };
};
const at8 = d => new Date(d + 'T08:00:00-05:00').getTime(), iso = (d, h) => new Date(d + 'T' + String(h).padStart(2, '0') + ':00:00-05:00').toISOString();
const ent = (d, sm, amt) => ({ d, ym: d.substring(0, 7), sm, total: amt, pays: [{ m: 'CHECK', amt }], rep: true, createdAt: iso(d, 10) });
const base = () => ({ settings: {}, orders: [], invoices: [], entries: [], cod: [], shipments: [], salesmen: [], bounces: [], envelopes: [], reports: [], notifyq: [] });
const errs = [], log = (...a) => console.log(...a);
/* ① 공휴일 아침 — 11/10 수금이 있으면 보냄 */
let D = base(); D.entries.push(ent('2026-11-10', 'KEVIN', 500));
let G = gas(at8('2026-11-11'), D); G.ctx.dailySummary_();
log('① Veterans Day:', G.sent.length, G.sent[0] && G.sent[0].subject, JSON.stringify(G.P));
if (G.sent.length !== 1 || !/11\/10\(화\)/.test(G.sent[0].subject) || !/수금 \$500\.00/.test(G.sent[0].subject) || G.P.SUMMARY_TO !== '2026-11-10') errs.push('① sends on the holiday morning (covers 11/10) and remembers it');
/* 다음 날 = 휴일 하루치 */
D.entries.push(ent('2026-11-11', 'SOO', 70)); G = gas(at8('2026-11-12'), D, G.P); G.ctx.dailySummary_();
log('① Thu:', G.sent[0] && G.sent[0].subject); if (G.sent.length !== 1 || !/요약 11\/11\(수\) —/.test(G.sent[0].subject) || !/수금 \$70\.00/.test(G.sent[0].subject)) errs.push('① next morning covers only the holiday 11/11');
/* 토요일 아침 — 금요일 것 */
const P = { SUMMARY_TO: '2026-11-12' }; D = base(); D.entries.push(ent('2026-11-13', 'ACE', 300)); D.entries.push(ent('2026-11-15', 'PETER', 40));
G = gas(at8('2026-11-14'), D, P); G.ctx.dailySummary_();
log('① Sat:', G.sent[0] && G.sent[0].subject); if (G.sent.length !== 1 || !/요약 11\/13\(금\) —/.test(G.sent[0].subject)) errs.push('① Saturday morning sends Friday\'s activity');
/* ② 일요일 — 토요일엔 아무것도 없음 → 안 보냄 · 기록 그대로 */
G = gas(at8('2026-11-15'), D, P); G.ctx.dailySummary_(); log('② Sun:', G.sent.length, JSON.stringify(P));
if (G.sent.length || P.SUMMARY_TO !== '2026-11-13' || P.SUMMARY_AT !== '2026-11-15') errs.push('② Sunday: nothing on Saturday → no email, last-sent date unchanged');
G.ctx.dailySummary_(); if (G.sent.length) errs.push('② checked once a day');
/* 월요일 — 토 ~ 일 묶음 */
G = gas(at8('2026-11-16'), D, P); G.ctx.dailySummary_(); log('② Mon:', G.sent[0] && G.sent[0].subject);
if (G.sent.length !== 1 || !/요약 11\/14\(토\) ~ 11\/15\(일\)/.test(G.sent[0].subject) || !/수금 \$40\.00/.test(G.sent[0].subject) || P.SUMMARY_TO !== '2026-11-15') errs.push('② Monday covers Sat ~ Sun (the skipped day is folded in)');
/* ③ 특이사항만 — 밀린 주문 · 확인 대기는 있어도 새로 들어온 게 없으면 안 보냄 */
D = base(); D.orders.push({ id: 'O1', st: 'pick', sm: 'SOO', store: 'OLD', amt: 100, sentAt: iso('2026-11-02', 9), pickAt: iso('2026-11-03', 9), ym: '2026-11' }, { id: 'O2', st: 'sent', sm: 'BRANDON', store: 'WAIT', amt: 50, sentAt: iso('2026-11-04', 9), cfReq: true, cfReqAt: iso('2026-11-04', 9), ym: '2026-11' });
const P3 = { SUMMARY_TO: '2026-11-16' }; G = gas(at8('2026-11-18'), D, P3); const r3 = G.ctx.summaryData_(G.ctx.biz_({}), '2026-11-18', {}, '2026-11-17');
G.ctx.dailySummary_(); log('③ notes only:', r3.data.notes.length, 'notes · any', r3.data.any, '· sent', G.sent.length);
if (!r3.data.notes.length || r3.data.any || G.sent.length) errs.push('③ notes alone (stuck order · waiting confirm) do not send');
/* 오래 쉼 — 최대 7일 */
D = base(); D.entries.push(ent('2026-11-20', 'KEVIN', 9), ent('2026-11-25', 'KEVIN', 11)); G = gas(at8('2026-11-30'), D, { SUMMARY_TO: '2026-10-01' }); G.ctx.dailySummary_();
log('③ long gap:', G.sent[0] && G.sent[0].subject); if (G.sent.length !== 1 || !/요약 11\/23\(월\) ~ 11\/29\(일\)/.test(G.sent[0].subject) || !/수금 \$11\.00/.test(G.sent[0].subject)) errs.push('③ after a long gap the summary covers at most the last 7 days');
/* 시각 전 · 끔 */
D = base(); D.entries.push(ent('2026-11-10', 'KEVIN', 500));
G = gas(new Date('2026-11-11T06:30:00-05:00').getTime(), D); G.ctx.dailySummary_(); if (G.sent.length || G.P.SUMMARY_AT) errs.push('③ not before the set hour (7:00)');
G = gas(at8('2026-11-11'), Object.assign(base(), { settings: { summaryHour: -1 }, entries: D.entries })); G.ctx.dailySummary_(); if (G.sent.length) errs.push('③ summaryHour -1 = off');
/* ④ testSummary */
const P4 = { SUMMARY_TO: '2026-11-16' }; G = gas(at8('2026-11-18'), base(), P4); G.ctx.testSummary();
log('④ test:', G.sent.length, G.sent[0] && G.sent[0].to, JSON.stringify(P4)); if (G.sent.length !== 1 || G.sent[0].to !== 'me@x.com' || P4.SUMMARY_TO !== '2026-11-16' || P4.SUMMARY_AT) errs.push('④ testSummary sends even with nothing new and leaves the records alone');
console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
