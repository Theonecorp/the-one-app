/* v0.8.237 시험 — 🔗 연결 지도 tools/impact.mjs: 통째 덮어쓰기 위험 · 폰 저장 자료 · 규칙 · 부르는 곳 · 같이 돌릴 시험을 뽑는다 (2026-11-13 관리자: "변경할 때마다 기존 연결을 잃지 않게")
 *   ① 오늘 사고 모양: 보관함 보내기가 orders 를 통째로(set) 쓰는데 규칙은 칸 단위(affectedKeys) · 다른 파일은 칸만(update) 붙임 → ⚠️ 위험 · 폰 키 theone.outbox.v1(한 단계 건너 readOut) · 시험 t9xx 가 맨 위
 *   ② 칸만 바꾸는(update) 변경 → 통째 덮어쓰기 위험 없음 · ③ 규칙 · functions 가 바뀌면 옛 앱 호환 · 배포 할 일이 나옴 · ④ 실제 저장소에서 CLI 가 돈다 (읽기만) */
const path = require('path'), { execFileSync } = require('child_process');
(async () => {
  const errs = [], log = (...a) => console.log(...a);
  const I = await import(require('url').pathToFileURL(path.resolve(__dirname, '../tools/impact.mjs')).href);
  const orders = [
    "const OUT_KEY = 'theone.outbox.v1';",
    'function readOut() { return JSON.parse(localStorage.getItem(OUT_KEY) || "{}"); }',
    'export async function syncOutbox(quiet) {',
    '  const box = readOut();',
    "  await S.DB.batch([{ op: 'set', col: 'orders', id, data: x.o }]);",
    '}',
  ].join('\n');
  const notify = "export async function dayCard(el) { await S.DB.batch(L.map(o => ({ op: 'update', col: 'orders', id: o.id, data: { cfOk: true, cfHow: 'day' } }))); }";
  const other = "export function badge() { return localStorage.getItem('theone.outbox.v1'); }";
  const rules = [
    'service cloud.firestore { match /databases/{database}/documents {',
    "  function smOrderUpdate() { let keys = request.resource.data.diff(resource.data).affectedKeys(); return !keys.hasAny(['cfHow']); }",
    '  match /orders/{id} { allow read: if true; allow update: if ordJob() || smOrderUpdate(); }',
    '  match /notes/{id} { allow read, write: if true; }',
    '} }',
  ].join('\n');
  const files = { 'src/orders.js': orders, 'src/notify.js': notify, 'src/main.js': other };
  const tests = { t901: "localStorage.setItem('theone.outbox.v1', '{}'); syncOutbox", t902: "location.hash = '#/home'; col 'orders'", t903: 'nothing related' };
  const testIndex = { t901: '보관함 보내기', t902: '홈', t903: '다른 것' };
  const diff1 = ['diff --git a/src/orders.js b/src/orders.js', '--- a/src/orders.js', '+++ b/src/orders.js', '@@ -4,0 +5 @@', "+  await S.DB.batch([{ op: 'set', col: 'orders', id, data: x.o }]);"].join('\n');

  /* ① */
  const a = I.analyze({ diff: diff1, files, tests, testIndex, rules });
  const c = a.cols.find(x => x.col === 'orders');
  log('① fns:', a.changedFns.join(','), '· keys:', a.keys.join(','), '· risk:', !!(c && c.risk), '· fieldLevel:', c && c.rules && c.rules.fieldLevel, '· tests:', a.tests.map(t => t.t).join(','));
  if (a.changedFns.join() !== 'syncOutbox') errs.push('① 바뀐 함수 = syncOutbox');
  if (!a.keys.includes('theone.outbox.v1')) errs.push('① 폰 저장 키(readOut → OUT_KEY 한 단계 건너)');
  if (!(a.keyUsers['theone.outbox.v1'] || []).includes('src/main.js')) errs.push('① 같은 키를 쓰는 다른 파일(main.js)');
  if (!c || !c.risk || !/칸 단위/.test(c.risk) || !c.partialWriters.some(w => w.startsWith('src/notify.js'))) errs.push('① orders 통째 덮어쓰기 위험 (규칙 칸 단위 · notify.js 가 칸만 붙임)');
  if (!c || !c.rules || !c.rules.fns.includes('smOrderUpdate') || !c.rules.allow.some(s => /smOrderUpdate/.test(s))) errs.push('① orders 규칙(allow · 규칙 함수)');
  if (!a.tests.length || a.tests[0].t !== 't901' || a.tests.some(t => t.t === 't903')) errs.push('① 같이 돌릴 시험: t901 이 맨 위 · 상관없는 t903 은 빠짐');
  const rep = I.report(a);
  if (!/⚠️ 먼저 볼 것/.test(rep) || !/\*\*orders\*\*: 통째 덮어쓰기/.test(rep) || !/node test\/t901\.js/.test(rep)) errs.push('① 보고서에 위험 · 시험 줄');

  /* ② 칸만 바꾸는 변경 */
  const diff2 = ['+++ b/src/notify.js', '@@ -1,0 +1 @@', '+' + notify].join('\n');
  const b = I.analyze({ diff: diff2, files, tests, testIndex, rules });
  log('② risks:', b.cols.filter(x => x.risk).length);
  if (b.cols.some(x => x.risk)) errs.push('② update 만 하는 변경은 통째 덮어쓰기 위험이 아님');

  /* ③ 규칙 · functions */
  const diff3 = ['+++ b/firestore.rules', '@@ -3,0 +3 @@', '+  match /x/{id} { allow read: if true; }', '+++ b/functions/core.js', '@@ -1,0 +1 @@', '+export const A = 1;'].join('\n');
  const r3 = I.report(I.analyze({ diff: diff3, files, tests, testIndex, rules }));
  if (!/옛 앱의 쓰기도 받아야/.test(r3) || !/deploy-rules/.test(r3) || !/함수 배포/.test(r3)) errs.push('③ 규칙 · 함수 바뀜 → 옛 앱 호환 · 배포 할 일');

  /* 바탕 함수 */
  if (I.enclosingFn(orders, 5) !== 'syncOutbox' || I.enclosingFn(orders, 2) !== 'readOut') errs.push('enclosingFn');
  if (I.parseDiff(diff1).length !== 1 || I.parseDiff(diff1)[0].line !== 5) errs.push('parseDiff 줄 번호');
  if (I.rulesFor(rules, 'nothere') !== null || I.rulesFor(rules, 'notes').fieldLevel) errs.push('rulesFor: 없는 모음 null · notes 는 칸 단위 아님');

  /* ④ 실제 저장소 (읽기만) */
  try { const out = execFileSync('node', [path.resolve(__dirname, '../tools/impact.mjs'), 'HEAD..HEAD'], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 60000 }); log('④ CLI:', out.split('\n')[0]); if (!/^# 🔗 연결 지도/.test(out)) errs.push('④ CLI 보고서 첫 줄'); }
  catch (e) { errs.push('④ CLI 실패: ' + String(e.message).slice(0, 200)); }

  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
