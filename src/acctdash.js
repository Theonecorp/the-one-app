/* ============================================================
 *  🏠 회계 담당 대시보드 (#/adash · v0.8.243 · 2026-11-14 관리자: "회계 담당도 대시보드 — 할 일 요약 · 수금 접수 확인 요약 · 체크 수령 요약 등을 보여주고
 *     직관적으로 무엇을 해야 하는지 보이게 · 지금의 홈(수금 확인)은 '회계' 항목으로")
 *   조의 대시보드(dash.js)와 같은 모양: 숫자 4칸 → 할 일 · 경고(급한 것부터) + 빠른 작업 → 세일즈맨별 대기
 *   숫자 칸 · 할 일을 누르면 그 화면(💵 회계 = 수금 확인은 그 칸으로 걸러서)
 *   읽기만 함 — 최근 3달 수금(entries) · 최근 2달 COD · 카드(cod) · 진행 중 ACH · 바운스 · 체크 요청
 * ============================================================ */
import { $, esc, money, R2, today, md, Router, sum, groupBy, daysBetween, bt, bi } from './ui.js';
import { icon } from './icons.js';
import { recentYms } from './mgr.js';

let S = null;
export function register(state) { S = state; Router.on('adash', page); }

const kpi = (go, ic, cls, label, id) => '<button type="button" class="wd-kpi ' + cls + '" data-ak="' + go + '"><span class="ki">' + icon(ic, 22) + '</span><span class="kt"><span>' + label + '</span><b id="ak-' + id + '">…</b><small class="aks" id="aks-' + id + '"></small></span></button>';

async function page() {
  const t = today();
  $('page').innerHTML = '<div class="wd" id="adash">' +
    '<div class="wd-hd"><div><h1>' + bt('대시보드', 'Dashboard') + '</h1><div class="sub">' + bi('회계', 'Accounting') + ' — ' + bt('오늘', 'Today') + ' ' + esc(md(t)) + '</div></div></div>' +
    '<div class="wd-kpis">' +
      kpi('verify/todo', 'inbox', 'k-blue', bt('① 접수 확인 대기', '① To review'), 'todo') +
      kpi('verify/wait', 'receipt', 'k-amber', bt('② 체크 수령 대기', '② Checks to receive'), 'wait') +
      kpi('verify/bad', 'alert', 'k-red', bt('금액 다름', 'Amount mismatch'), 'bad') +
      kpi('verify/all', 'wallet', '', bt('오늘 들어온 수금', 'Payments today'), 'today') +
    '</div>' +
    '<div class="wd-g2">' +
      '<section class="wd-card"><h3>' + icon('alert', 20).replace('class="ic"', 'class="ic" style="color:var(--red)"') + bt('할 일 · 경고', 'To do · Alerts') + '</h3><div class="wd-al" id="adAl"><div class="load" style="padding:8px 0">…</div></div></section>' +
      '<section class="wd-card"><h3>' + icon('zap', 20) + bt('빠른 작업', 'Quick actions') + '</h3><div class="wd-qa">' +
        [['verify', 'wallet', bt('수금 확인', 'Review payments'), bt('① 접수 · ② 체크 수령', '① review · ② receive')], ['entry/new', 'pen', bt('수금 입력', 'Record payment'), bt('우편 체크 · 캐쉬 · Zelle', 'mail check · cash · Zelle')],
         ['cod', 'card', bt('COD · 카드', 'COD · Card'), bt('입력 · 승인번호', 'entry · approval')], ['ach', 'bank', 'ACH', bt('셋업 · 인출 · NSF', 'setup · draw · NSF')],
         ['bounce', 'undo', bt('체크 관리', 'Checks'), bt('바운스 · 홀드 · 요청', 'bounce · hold · requests')], ['invs', 'file', bt('인보이스 조회', 'Invoices'), bt('가게 · 날짜 · 번호', 'store · date · number')]]
          .map(q => '<button type="button" data-ag="' + q[0] + '">' + icon(q[1], 26) + '<b>' + q[2] + '</b><small>' + q[3] + '</small></button>').join('') +
      '</div></section>' +
    '</div>' +
    '<section class="wd-card"><h3>' + icon('users', 20) + bt('세일즈맨별 대기', 'Waiting by salesman') + '</h3><div id="adSm"><div class="load" style="padding:8px 0">…</div></div></section>' +
  '</div>';
  const go = k => { const [r, f] = k.split('/'); if (r === 'verify' && f) { import('./mgr.js').then(M => { M.verifyFilter(f === 'all' ? 'all' : f); Router.go('verify'); }); } else if (f) Router.go(r, f); else Router.go(r); };
  document.querySelectorAll('#adash [data-ak], #adash [data-ag]').forEach(b => b.onclick = () => go(b.dataset.ak || b.dataset.ag));

  /* 읽기 — 하나가 막혀도 나머지는 보임 */
  const safe = p => p.then(x => x, () => null);
  const [E, C, A, B, Q] = await Promise.all([
    safe(S.DB.list('entries', { where: [['ym', 'in', recentYms(3)]] })), safe(S.DB.list('cod', { where: [['ym', 'in', recentYms(2)]] })),
    safe(S.DB.list('ach', { where: [['open', '==', true]] })), safe(S.DB.list('bounces')), safe(S.DB.list('checkReq'))]);
  if (!$('adash')) return;
  const ent = (E || []).filter(r => !r.void), open = ent.filter(r => !r.settled);
  const todo = open.filter(r => !r.sb), wait = open.filter(r => r.sb && !r.rc), bad = open.filter(r => r.mismatch && !r.v), tdy = ent.filter(r => r.d === today());
  const amt = L => money(R2(sum(L, r => Number(r.total != null ? r.total : r.amt) || 0)));   // 수금(entries)은 total · COD · ACH · 바운스는 amt
  const put = (id, v, s) => { const b = $('ak-' + id), m = $('aks-' + id); if (b) b.textContent = v; if (m) m.textContent = s || ''; };
  if (E) { put('todo', todo.length, amt(todo)); put('wait', wait.length, amt(wait)); put('bad', bad.length, bad.length ? bt('확인 필요', 'check') : ''); put('today', tdy.length, amt(tdy)); }
  else ['todo', 'wait', 'bad', 'today'].forEach(id => put(id, '—'));

  /* 할 일 · 경고 — r 빨강(오래됨 · 문제) → a 노랑(오늘 할 일) → b 파랑(진행 중) */
  const age = L => L.length ? Math.max(...L.map(r => daysBetween(r.d || today(), today()))) : 0;
  const A2 = [];
  const oldTodo = todo.filter(r => daysBetween(r.d || today(), today()) >= 2), oldWait = wait.filter(r => daysBetween(r.d || today(), today()) >= 5);
  if (bad.length) A2.push(['verify/bad', 'r', 'alert', bt('금액이 인보이스와 다른 수금', 'Payments not matching the invoice'), bad.length, bt('세일즈맨 · 가게에 확인', 'check with the salesman / store')]);
  if (oldTodo.length) A2.push(['verify/todo', 'r', 'clock', bt('2일 넘게 접수 확인 안 된 수금', 'Not reviewed for 2+ days'), oldTodo.length, bt('가장 오래된 것', 'oldest') + ' ' + age(oldTodo) + bt('일째', ' days')]);
  if (oldWait.length) A2.push(['verify/wait', 'r', 'receipt', bt('5일 넘게 실물 체크가 안 온 수금', 'Check not received for 5+ days'), oldWait.length, bt('세일즈맨에게 체크 보냈는지 확인', 'ask the salesman to send the check')]);
  const bOpen = (B || []).filter(r => r.st === 'open' || r.st === 'repl'); if (bOpen.length) A2.push(['bounce', 'r', 'undo', bt('바운스 체크 미해결', 'Bounced checks open'), bOpen.length, amt(bOpen)]);
  const achBad = (A || []).filter(o => !o.void && (o.st === 'NSF' || o.st === 'HOLD')); if (achBad.length) A2.push(['ach', 'r', 'bank', bt('ACH NSF · 홀드', 'ACH NSF · hold'), achBad.length, amt(achBad)]);
  if (todo.length) A2.push(['verify/todo', 'a', 'inbox', bt('① 접수 확인할 수금', '① Payments to review'), todo.length, bt('내용 확인 → 앱 인보이스에 입금 반영', 'check → apply to invoices')]);
  if (wait.length) A2.push(['verify/wait', 'a', 'receipt', bt('② 실물 체크 받으면 수령 표시', '② Mark checks received'), wait.length, bt('체크 맞추기로 번호만 쳐도 됨', 'type the check # to match')]);
  const cNo = (C || []).filter(r => !r.void && !r.v); if (cNo.length) A2.push(['cod', 'a', 'card', bt('확인 안 한 COD · 카드', 'COD · card not verified'), cNo.length, amt(cNo)]);
  const reqs = (Q || []).filter(r => r.st === 'open'); if (reqs.length) A2.push(['bounce', 'a', 'help', bt('세일즈맨 체크 요청', 'Salesman check requests'), reqs.length, bt('체크 관리에서 답하기', 'answer in Checks')]);
  const achRun = (A || []).filter(o => !o.void && o.st !== 'NSF' && o.st !== 'HOLD'); if (achRun.length) A2.push(['ach', 'b', 'bank', bt('진행 중 ACH', 'ACH in progress'), achRun.length, amt(achRun)]);
  const al = $('adAl');
  if (al) {
    al.innerHTML = A2.length ? A2.map(a => '<button class="a-' + a[1] + '" data-aa="' + a[0] + '">' + icon(a[2], 18) + '<span>' + a[3] + '<small>' + esc(a[5] || '') + '</small></span><em>' + a[4] + '</em><span class="chev" style="flex:none">' + icon('chevRight', 16) + '</span></button>').join('')
      : '<button class="a-ok" disabled>' + icon('check', 18) + '<span>' + bt('밀린 일 없음 — 모두 정상', 'Nothing pending — all clear') + '</span></button>';
    al.querySelectorAll('[data-aa]').forEach(b => b.onclick = () => go(b.dataset.aa));
  }
  /* 세일즈맨별 — ① · ② 대기 건수 · 금액 (많은 순) */
  const sm = $('adSm');
  if (sm) {
    const by = groupBy(todo.concat(wait), r => r.sm || '—'), rows = Object.keys(by).map(k => ({ k, t: by[k].filter(r => !r.sb), w: by[k].filter(r => r.sb) })).sort((a, b) => (b.t.length + b.w.length) - (a.t.length + a.w.length));
    sm.innerHTML = rows.length ? '<table class="adsm"><thead><tr><th>' + bt('세일즈맨', 'Salesman') + '</th><th>① ' + bt('접수', 'Review') + '</th><th>② ' + bt('체크', 'Check') + '</th><th>' + bt('금액', 'Amount') + '</th></tr></thead><tbody>' +
      rows.map(r => '<tr data-asm="' + esc(r.k) + '"><td><b>' + esc(r.k) + '</b></td><td>' + (r.t.length || '') + '</td><td>' + (r.w.length || '') + '</td><td>' + amt(r.t.concat(r.w)) + '</td></tr>').join('') + '</tbody></table>'
      : '<div class="none">' + bt('기다리는 수금이 없습니다', 'Nothing waiting') + '</div>';
    sm.querySelectorAll('[data-asm]').forEach(tr => tr.onclick = () => import('./mgr.js').then(M => { M.verifyFilter('', tr.dataset.asm); Router.go('verify'); }));
  }
}
