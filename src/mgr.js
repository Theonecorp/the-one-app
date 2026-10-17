/* ============================================================
 *  담당자(회계) 화면 — 확인(SmartBee ✓ · 체크 수령 ✓) · COD/카드/ACH 입력 · ACH · 거래처 · AR 올리기
 * ============================================================ */
import { invTypes } from './invoicing.js';
import { $, esc, money, num, R2, today, ym, md, dlabel, toast, busy, openModal, closeModal, confirmBox, Router, inputDate, sel, sum, sortBy, groupBy, pad4, nz, daysBetween, debounce, hasWords } from './ui.js';
import { newId } from './db.js';
import { searchAccounts, dropAccountCache } from './accounts.js';
import { invType } from './comm.js';
import { stageText } from './sales.js';

let S = null;
export function register(state) {
  S = state;
  Router.on('verify', pageVerify); Router.on('cod', pageCod); Router.on('stores', pageStores); Router.on('arup', pageArUp);
}
function recentYms(n) { const out = [], d = new Date(); for (let i = 0; i < n; i++) { out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); d.setMonth(d.getMonth() - 1); } return out; }
function smOptions(v, allowBlank) { return (allowBlank ? [['', '— 세일즈맨 —']] : []).concat(S.sms.filter(x => x.active !== false).map(x => [x.code, x.code])); }
function methodTag(p) { return p.m === 'CHECK' ? '#' + esc(p.ref) : p.m === 'CASH' ? '캐쉬' : 'Zelle'; }

/* ============================================================
 *  ① 확인 — 세일즈맨이 넣은 수금을 보며 SmartBee 입력 ✓, 실물 체크 오면 수령 ✓
 * ============================================================ */
let VF = { f: 'todo', sm: '', q: '' };
async function pageVerify() {
  $('page').innerHTML = '<div class="load">읽는 중…</div>';
  let rows = await S.DB.list('entries', { where: [['ym', 'in', recentYms(3)]] });
  rows = rows.filter(r => !r.void && !r.settled);
  const todo = rows.filter(r => !r.sb), wait = rows.filter(r => r.sb && !r.rc), bad = rows.filter(r => r.mismatch && !r.v);
  let list = VF.f === 'todo' ? todo : VF.f === 'wait' ? wait : VF.f === 'bad' ? bad : rows;
  if (VF.sm) list = list.filter(r => r.sm === VF.sm);
  if (VF.q) { list = list.filter(r => hasWords(r.store + ' ' + r.acct + ' ' + (r.sm || ''), VF.q) || (r.pays || []).some(p => String(p.ref).includes(VF.q.trim()))); }
  list = sortBy(list, r => r.d + (r.createdAt || ''), true);
  const by = groupBy(list, r => r.d), days = Object.keys(by).sort().reverse();
  const tdy = rows.filter(r => r.d === today());
  let h = '<div class="kpi" style="margin:0 0 10px">' + [['todo', '① SmartBee 미입력', todo.length, 'To enter'], ['wait', '② 체크 수령 대기', wait.length, 'Awaiting check'], ['bad', '⚠️ 차액', bad.length, 'Mismatch'], ['all', '오늘 수금', money(sum(tdy, r => r.total)), 'Today ' + tdy.length]].map(c => '<div class="tap' + (VF.f === c[0] ? ' on' : '') + '" data-vf="' + c[0] + '" style="' + (VF.f === c[0] ? 'background:var(--blue2);outline:2px solid var(--blue)' : '') + '"><b>' + c[2] + '</b><span>' + c[1] + '<br><i class="en">' + c[3] + '</i></span></div>').join('') + '</div>' +
    '<div class="card"><h2>✅ 수금 확인 <span class="en">Verify payments</span></h2>' +
    '<div class="two">' + sel('vfSm', [['', '전체 세일즈맨 · all']].concat(smOptions()), VF.sm) + '<input id="vfQ" placeholder="가게 · 체크번호 / store · check #" value="' + esc(VF.q) + '"></div>' +
    '<div class="muted" style="margin-top:6px">줄을 누르면 ✓ 처리 · 금액 수정 · 메모. 체크 없는 COD · 카드 · ACH 는 💳 탭에서 직접 입력합니다. <span class="en">Tap a row to mark entered / received.</span></div></div>';
  if (!days.length) h += '<div class="card"><div class="none">없음</div></div>';
  days.forEach(d => {
    const L = by[d];
    h += '<div class="card"><div class="dayhd"><span>' + dlabel(d) + '</span><span>' + money(sum(L, r => r.total)) + ' · ' + L.length + '건</span></div>' +
      L.map(r => '<div class="pr tap ' + (r.v ? 'v' : r.rc ? 'rc' : r.sb ? 'sb' : '') + (r.mismatch && !r.v ? ' bad' : '') + '" data-vid="' + r.id + '"><div class="mk">' + (r.sb ? '✓' : '·') + '</div><div class="ct"><b>' + esc(r.sm) + ' · ' + esc(r.store) + (r.repl ? ' <span class="tag t-r">대체</span>' : '') + (r.newStore ? ' <span class="tag t-c">신규</span>' : '') + '</b><small>' + (r.pays || []).map(p => methodTag(p) + ' ' + money(p.amt)).join(' · ') + (r.invs && r.invs.length ? ' · ' + r.invs.map(v => v.no).join(',') : '') + (r.mismatch ? ' · ⚠️' : '') + '</small></div><div class="pa"><b>' + money(r.total) + '</b><small>' + stageText(r) + '</small></div></div>').join('') + '</div>';
  });
  $('page').innerHTML = h;
  document.querySelectorAll('[data-vf]').forEach(b => b.onclick = () => { VF.f = b.dataset.vf; pageVerify(); });
  $('vfSm').onchange = () => { VF.sm = $('vfSm').value; pageVerify(); };
  $('vfQ').oninput = debounce(() => { VF.q = $('vfQ').value.trim(); pageVerify(); }, 400);
  document.querySelectorAll('[data-vid]').forEach(el => el.onclick = () => verifyDetail(rows.find(x => x.id === el.dataset.vid)));
}
function verifyDetail(r) {
  if (!r) return;
  const hasPhysical = (r.pays || []).some(p => p.m === 'CHECK' || p.m === 'CASH' || p.m === 'ZELLE');
  openModal('<h2>' + esc(r.sm) + ' · ' + esc(r.store) + '</h2><div class="muted">' + dlabel(r.d) + ' · ' + esc(r.acct || '계정 없음') + (r.addr ? ' · ' + esc(r.addr) : '') + '</div>' +
    '<table style="margin-top:8px">' + (r.pays || []).map(p => '<tr><td>' + ({ CHECK: '체크 #' + esc(p.ref), CASH: '캐쉬', ZELLE: 'Zelle ' + esc(p.ref) })[p.m] + (p.dep ? ' <span class="muted">' + md(p.dep) + '</span>' : '') + (p.mob ? ' 📱' : '') + '</td><td class="r"><b>' + money(p.amt) + '</b></td></tr>').join('') + '</table>' +
    ((r.invs || []).length ? '<table style="margin-top:6px">' + r.invs.map(v => '<tr><td>' + esc(v.no) + (v.store ? ' <span class="muted">🏬 ' + esc(v.store) + '</span>' : '') + '</td><td class="r">' + money(v.amt) + '</td></tr>').join('') + '</table>' : '<div class="muted">인보이스 없음</div>') +
    (r.mismatch ? '<div class="alert a-red">' + esc(r.mismatch) + '</div>' : '') + (r.memo ? '<div class="muted" style="margin-top:6px">세일즈맨 메모: ' + esc(r.memo) + '</div>' : '') +
    (r.repId ? '<div class="muted" style="margin-top:6px">📧 Daily Report ' + esc(md(String(r.repAt || '').substring(0, 10))) + ' 전송됨 <button type="button" class="b-ghost b-sm" id="vRep">📷 체크 사진 보기</button></div><div id="vRepBox"></div>' : r.rep === false ? '<div class="muted" style="margin-top:6px">⏳ 세일즈맨이 아직 Daily Report 를 보내지 않았습니다</div>' : '') +
    '<div style="margin-top:12px"><label class="pick ' + (r.sb ? 'on' : '') + '" id="pkSb"><div class="ck">✓</div><div class="pm"><b>① SmartBee 입력했음</b><small>이메일/앱 보고 SmartBee 에 넣은 뒤 ✓</small></div></label>' +
    (hasPhysical ? '<label class="pick ' + (r.rc ? 'on' : '') + '" id="pkRc"><div class="ck">✓</div><div class="pm"><b>② 체크 수령 / 입금 확인</b><small>실물 체크가 도착했거나 캐쉬·Zelle 입금 확인</small></div></label>' : '') + '</div>' +
    '<div class="two"><div class="fg"><label>디스카운트 %</label><input id="vDisc" inputmode="decimal" value="' + esc(r.disc == null ? '' : r.disc) + '" placeholder="예: 25"></div><div class="fg"><label>담당자 메모</label><input id="vNote" value="' + esc(r.vn || '') + '"></div></div>' +
    '<div class="btns"><button class="b-ghost" id="vEdit">금액·인보이스 수정</button><button class="b-ghost" id="vVoid">취소</button><button class="b-blue" id="vSave">저장</button></div>');
  let sb = !!r.sb, rc = !!r.rc;
  $('pkSb').onclick = () => { sb = !sb; $('pkSb').classList.toggle('on', sb); };
  if ($('pkRc')) $('pkRc').onclick = () => { rc = !rc; $('pkRc').classList.toggle('on', rc); };
  $('vSave').onclick = async () => {
    const patch = { sb, rc: hasPhysical ? rc : sb, vn: $('vNote').value.trim(), disc: $('vDisc').value.trim() === '' ? '' : num($('vDisc').value), updatedAt: new Date().toISOString() };
    if (sb && !r.sbAt) patch.sbAt = today(); if (patch.rc && !r.rcAt) patch.rcAt = today();
    busy(true); try { await S.DB.update('entries', r.id, patch); closeModal(); toast('저장'); pageVerify(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false);
  };
  $('vEdit').onclick = () => { closeModal(); Router.go('entry', r.id); };
  if ($('vRep')) $('vRep').onclick = async () => { const b = $('vRepBox'); b.innerHTML = '<div class="load">읽는 중…</div>'; try { const rp = await S.DB.get('reports', r.repId); const ph = (rp && rp.photos) || []; b.innerHTML = ph.length ? '<div class="phgrid">' + ph.map(d => '<a class="ph" href="' + d + '" target="_blank"><img src="' + d + '"></a>').join('') + '</div><div class="muted">' + (rp.n || '') + '건 · ' + money(rp.total || 0) + ' · ' + esc(rp.sentAt || '') + '</div>' : '<div class="muted">이 리포트에는 사진이 없습니다</div>'; } catch (e) { b.innerHTML = '<div class="muted">리포트를 읽지 못했습니다: ' + esc(e.code || e.message) + '</div>'; } };
  $('vVoid').onclick = async () => { if (!(await confirmBox('이 수금을 취소(VOID)할까요?', '취소하기'))) return; busy(true); try { await S.DB.update('entries', r.id, { void: true, updatedAt: new Date().toISOString() }); closeModal(); toast('취소했습니다'); pageVerify(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); };
}

/* ============================================================
 *  ② COD · 카드 · ACH 입력  (cod/{id})
 * ============================================================ */
const METHODS = ['COD', 'CREDIT CARD'];   /* ACH 는 🏦 ACH 에서 인출 완료하면 자동으로 들어옴 — 여기서 직접 입력하지 않음 */
let CF = { q: '', m: 'all' };
async function pageCod() {
  $('page').innerHTML = '<div class="load">읽는 중…</div>';
  let rows = (await S.DB.list('cod', { where: [['ym', 'in', recentYms(2)]] })).filter(r => !r.void);
  rows = sortBy(rows, r => r.d + (r.createdAt || ''), true);
  if (CF.m !== 'all') rows = rows.filter(r => r.method === CF.m);
  const by = groupBy(rows, r => r.d), days = Object.keys(by).sort().reverse();
  let h = '<div class="card"><h2>💳 COD · 카드 입력</h2><div class="muted">우편 체크 · COD · 카드로 들어온 돈. 세일즈맨을 골라 넣으면 루크 정산에 바로 뜹니다.<br><span style="color:#1e40af">🏦 ACH 는 여기서 입력하지 않습니다 — <u data-goach>ACH 메뉴</u>에서 인출 완료하면 자동으로 이 목록에 들어옵니다.</span></div>' +
    '<div class="chips">' + [['all', '전체'], ['COD', 'COD'], ['CREDIT CARD', '카드'], ['ACH', 'ACH']].map(c => '<button class="' + (CF.m === c[0] ? 'on' : '') + '" data-cm="' + c[0] + '">' + c[1] + '</button>').join('') + '</div>' +
    '<button class="b-blue" id="btnCodNew" style="margin-top:8px">＋ 입력</button></div>';
  if (!days.length) h += '<div class="card"><div class="none">최근 2개월 기록 없음</div></div>';
  days.forEach(d => { const L = by[d]; h += '<div class="card"><div class="dayhd"><span>' + dlabel(d) + '</span><span>' + money(sum(L, r => r.amt)) + '</span></div>' +
    L.map(r => '<div class="pr tap ' + (r.v ? 'v' : '') + '" data-cid="' + r.id + '"><div class="mk">' + (r.v ? '✓' : '·') + '</div><div class="ct"><b>' + esc(r.sm) + ' · ' + esc(r.store) + ' <span class="tag ' + (r.method === 'ACH' ? 't-a' : r.method === 'COD' ? 't-c' : 't-k') + '">' + esc(r.method) + '</span></b><small>' + esc(r.ref || '') + (r.invs && r.invs.length ? ' · ' + r.invs.map(v => v.no).join(',') : '') + (r.note ? ' · ' + esc(r.note) : '') + '</small></div><div class="pa"><b>' + money(r.amt) + '</b><small>' + (r.settled ? '정산 완료' : r.v ? '정산 확인' : '입력됨') + '</small></div></div>').join('') + '</div>'; });
  $('page').innerHTML = h;
  document.querySelectorAll('[data-cm]').forEach(b => b.onclick = () => { CF.m = b.dataset.cm; pageCod(); });
  $('btnCodNew').onclick = () => codForm(null);
  document.querySelectorAll('[data-goach]').forEach(u => { u.style.cursor = 'pointer'; u.onclick = () => Router.go('ach'); });
  document.querySelectorAll('[data-cid]').forEach(el => el.onclick = () => codForm(rows.find(x => x.id === el.dataset.cid)));
}
function codForm(r) {
  r = r || {};
  const invs = (r.invs || []).concat([{ no: '', amt: '' }]);
  openModal('<h2>' + (r.id ? '수정' + (r.method === 'ACH' ? ' (ACH · 🏦 ACH 에서 들어옴)' : '') : '＋ COD · 카드') + '</h2>' +
    '<div class="two"><div class="fg"><label>세일즈맨</label>' + sel('cSm', smOptions(null, true), r.sm || '') + '</div><div class="fg"><label>날짜</label>' + inputDate('cD', r.d) + '</div></div>' +
    '<div class="fg"><label>가게</label><input id="cStore" value="' + esc(r.store || '') + '" placeholder="가게 이름 · 계정코드" autocomplete="off"><div class="hits" id="cHits" style="display:none"></div><input type="hidden" id="cAcct" value="' + esc(r.acct || '') + '"></div>' +
    '<div class="seg" id="cM">' + (r.method === 'ACH' ? ['ACH'] : METHODS).map(m => '<button class="' + ((r.method || 'COD') === m ? 'on' : '') + '" data-m="' + m + '">' + (m === 'CREDIT CARD' ? '카드' : m) + '</button>').join('') + '</div>' +
    '<div class="two"><div class="fg"><label>참조 # (선택)</label><input id="cRef" value="' + esc(r.ref || '') + '"></div><div class="fg"><label>금액 $</label><input id="cAmt" inputmode="decimal" value="' + esc(r.amt || '') + '" style="font-weight:800;text-align:right"></div></div>' +
    '<div class="fg"><label>인보이스 (번호 · 금액)</label><div id="cInvs">' + invs.map((v, i) => '<div class="invrow"><input data-cno="' + i + '" value="' + esc(v.no) + '" placeholder="A12345" style="text-transform:uppercase"><input data-camt="' + i + '" value="' + esc(v.amt) + '" inputmode="decimal" style="text-align:right"><span></span></div>').join('') + '</div><button class="b-ghost b-sm" id="cMore">＋ 줄</button></div>' +
    '<div class="two"><div class="fg"><label>디스카운트 %</label><input id="cDisc" inputmode="decimal" value="' + esc(r.disc == null ? '' : r.disc) + '"></div><div class="fg"><label>메모</label><input id="cNote" value="' + esc(r.note || '') + '"></div></div>' +
    '<div class="btns">' + (r.id ? '<button class="b-ghost" id="cDel">삭제</button>' : '') + '<button class="b-blue" id="cSave">저장</button></div>');
  let method = r.method || 'COD';
  document.querySelectorAll('#cM [data-m]').forEach(b => b.onclick = () => { method = b.dataset.m; document.querySelectorAll('#cM button').forEach(x => x.classList.toggle('on', x.dataset.m === method)); });
  $('cStore').oninput = () => { const hits = searchAccounts(S.accounts, $('cStore').value, 8), box = $('cHits'); $('cAcct').value = ''; box.style.display = hits.length ? '' : 'none';
    box.innerHTML = hits.map(a => '<div data-a="' + esc(a.acct) + '"><b>' + esc(a.store) + '</b> <span class="muted">' + esc(a.acct) + (a.sm ? ' · ' + esc(a.sm) : '') + '</span></div>').join('');
    box.querySelectorAll('[data-a]').forEach(d => d.onclick = () => { const a = S.accounts.byCode[d.dataset.a]; $('cStore').value = a.store; $('cAcct').value = a.acct; box.style.display = 'none'; if (!$('cSm').value && a.sm) $('cSm').value = a.sm; }); };
  $('cMore').onclick = () => { const n = document.querySelectorAll('[data-cno]').length; $('cInvs').insertAdjacentHTML('beforeend', '<div class="invrow"><input data-cno="' + n + '" placeholder="A12345" style="text-transform:uppercase"><input data-camt="' + n + '" inputmode="decimal" style="text-align:right"><span></span></div>'); };
  $('cSave').onclick = async () => {
    const sm = $('cSm').value, store = $('cStore').value.trim(), amt = R2(num($('cAmt').value)), d = $('cD').value;
    if (!sm) return toast('세일즈맨을 고르세요', 'bad'); if (!store) return toast('가게를 넣으세요', 'bad'); if (!amt) return toast('금액을 넣으세요', 'bad');
    const invList = []; document.querySelectorAll('[data-cno]').forEach(el => { const i = el.dataset.cno, a = document.querySelector('[data-camt="' + i + '"]'); const no = el.value.trim().toUpperCase(); if (no || num(a.value)) invList.push({ no, t: no ? invType(no) : '', amt: R2(num(a.value)) }); });
    if (invList.some(v => !v.no)) return toast('인보이스 번호가 빈 줄이 있습니다', 'bad');
    if (method === 'ACH' && !r.id && !r.achId) {
      /* 옛 규칙(ACH_COMM_SOURCE): ACH 커미션은 한쪽에서만. 🏦 ACH 허브에 같은 가게·금액 건이 있으면 겹치니 막습니다 */
      try { const achs = (await S.DB.list('ach', { where: [['acct', '==', $('cAcct').value || r.acct || '']] })).filter(a => !a.void && Math.abs(num(a.amt) - amt) < 0.01); if (achs.length) { const a = achs[0]; if (a.codId) return toast('이 ACH 는 🏦 ACH 에서 이미 인출 완료 처리되어 COD·ACH 목록에 들어와 있습니다 (' + a.drawOn + '). 중복 입력입니다.', 'bad'); if (!(await confirmBox('🏦 ACH 에 같은 가게 · 같은 금액 건이 있습니다 (인출 예정 ' + a.drawOn + ', ' + (a.setup ? '예약됨' : '셋업 전') + ').\n인출 완료는 ACH 탭에서 처리하면 자동으로 여기 들어옵니다. 그래도 직접 넣을까요?', '그래도 저장'))) return; } } catch (e) {}
    }
    const id = r.id || newId('C');
    const doc = { id, d, ym: ym(d), sm, acct: $('cAcct').value || r.acct || '', store, method, ref: $('cRef').value.trim(), amt, invs: invList, disc: $('cDisc').value.trim() === '' ? '' : num($('cDisc').value), note: $('cNote').value.trim(), updatedAt: new Date().toISOString() };
    busy(true);
    try { if (r.id) await S.DB.update('cod', id, doc); else await S.DB.set('cod', id, Object.assign(doc, { v: false, vn: '', settled: '', void: false, createdBy: S.user.email, createdAt: new Date().toISOString() })); closeModal(); toast('저장'); pageCod(); }
    catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false);
  };
  if ($('cDel')) $('cDel').onclick = async () => { if (!(await confirmBox('지울까요?', '삭제'))) return; busy(true); try { await S.DB.update('cod', r.id, { void: true }); closeModal(); pageCod(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); };
}

/* ③ ACH 는 ach.js (ACH 허브) 가 맡음 */

/* ============================================================
 *  ④ 거래처
 * ============================================================ */
let STQ = '';
async function pageStores() {
  const hits = STQ ? searchAccounts(S.accounts, STQ, 40) : [];
  $('page').innerHTML = '<div class="card"><h2>🏬 거래처 ' + S.accounts.length + '곳</h2><input id="stQ" placeholder="가게 이름 · 계정코드 · 도시" value="' + esc(STQ) + '" autocomplete="off"><div class="btns"><button class="b-ghost b-sm" id="stNew">＋ 새 거래처</button></div></div>' +
    '<div class="card">' + (hits.length ? hits.map(a => '<div class="pr tap" data-st="' + esc(a.acct) + '"><div class="ct"><b>' + esc(a.store) + '</b><small>' + esc(a.acct) + ' · ' + esc([a.addr, a.city, a.state, a.zip].filter(Boolean).join(', ')) + (a.sm ? ' · ' + esc(a.sm) : '') + (a.terms ? ' · ' + esc(a.terms) : '') + '</small></div></div>').join('') : '<div class="none">' + (STQ ? '없음' : '찾을 가게 이름을 치세요') + '</div>') + '</div>';
  $('stQ').oninput = debounce(() => { STQ = $('stQ').value; pageStores(); setTimeout(() => { const q = $('stQ'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 0); }, 300);
  $('stNew').onclick = () => storeForm(null);
  document.querySelectorAll('[data-st]').forEach(el => el.onclick = () => storeForm(S.accounts.byCode[el.dataset.st]));
}
function storeForm(a) {
  a = a || {};
  openModal('<h2>' + (a.acct ? esc(a.store) : '＋ 새 거래처') + '</h2>' +
    '<div class="two"><div class="fg"><label>계정코드</label><input id="sAcct" value="' + esc(a.acct || '') + '" ' + (a.acct ? 'readonly' : '') + '></div><div class="fg"><label>담당 세일즈맨</label>' + sel('sSm', smOptions(null, true), a.sm || '') + '</div></div>' +
    '<div class="fg"><label>가게 이름</label><input id="sStore" value="' + esc(a.store || '') + '" style="text-transform:uppercase"></div>' +
    '<div class="fg"><label>주소</label><input id="sAddr" value="' + esc(a.addr || '') + '"></div>' +
    '<div class="three"><div class="fg"><label>City</label><input id="sCity" value="' + esc(a.city || '') + '"></div><div class="fg"><label>State</label><input id="sState" value="' + esc(a.state || '') + '" maxlength="2" style="text-transform:uppercase"></div><div class="fg"><label>Zip</label><input id="sZip" value="' + esc(a.zip || '') + '"></div></div>' +
    '<div class="two"><div class="fg"><label>전화</label><input id="sTel" value="' + esc(a.tel || '') + '"></div><div class="fg"><label>조건 (N30 · ACH60 …)</label><input id="sTerms" value="' + esc(a.terms || '') + '"></div></div>' +
    '<div class="fg"><label>메모 (오더 화면에 보임)</label><input id="sNote" value="' + esc(a.note || '') + '"></div>' +
    '<div class="fg"><label>기본 할인 % (인보이스 종류별 — 오더에 자동으로 들어감)</label><div class="three">' + invTypes(S).map(t => '<div><small class="muted">' + esc(t.c) + ' ' + esc(t.n) + '</small><input type="number" inputmode="decimal" min="0" max="100" data-sd="' + esc(t.c) + '" value="' + esc((a.disc || {})[t.c] || '') + '" placeholder="0"></div>').join('') + '</div></div>' +
    '<div class="btns"><button class="b-blue" id="sSave">저장</button></div>');
  $('sSave').onclick = async () => {
    const acct = pad4($('sAcct').value.trim()), store = $('sStore').value.trim().toUpperCase();
    if (!acct || !store) return toast('계정코드와 이름을 넣으세요', 'bad');
    const doc = { acct, store, sm: $('sSm').value, addr: $('sAddr').value.trim(), city: $('sCity').value.trim().toUpperCase(), state: $('sState').value.trim().toUpperCase(), zip: $('sZip').value.trim(), tel: $('sTel').value.trim(), terms: $('sTerms').value.trim().toUpperCase(), note: $('sNote').value.trim(), updatedAt: new Date().toISOString() };
    const disc = {}; document.querySelectorAll('[data-sd]').forEach(inp => { const v = Math.max(0, Math.min(100, Number(inp.value) || 0)); if (v) disc[inp.dataset.sd] = v; }); doc.disc = disc;
    Object.keys(a).forEach(k => { if (doc[k] === undefined && k !== 'id' && k[0] !== '_') doc[k] = a[k]; });
    busy(true);
    try { await S.DB.set('accounts', acct, doc); await bumpAccountsVer(); closeModal(); toast('저장'); pageStores(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false);
  };
}
export async function bumpAccountsVer() {
  const ver = String(Date.now());
  await S.DB.set('settings', 'app', Object.assign({}, S.settings, { accountsVer: ver }));
  S.settings.accountsVer = ver; dropAccountCache();
  const { loadAccounts } = await import('./accounts.js'); S.accounts = await loadAccounts(S);
}

/* ============================================================
 *  ⑤ AR 올리기 — SmartBee AR 엑셀을 그대로 올리면 세일즈맨별로 나눠 저장
 *  ar/{SM} = { sm, asOf, total, stores:[{acct, store, total, b[5], invs:[{inv,d,amt,bal,pdd,bk}], lastPaid, dormant, moved}] }
 *  ar/_all = 전체 (루크 미수금 탭)
 * ============================================================ */
async function pageArUp() {
  const asOf = S.settings.arAsOf || '';
  $('page').innerHTML = '<div class="card"><h2>📤 미수금(AR) 올리기</h2><div class="muted">SmartBee 에서 받은 AR 엑셀(.xlsx)을 그대로 고르세요. 기준일은 파일 안 인보이스 날짜로 잡고, 세일즈맨별로 나눠 저장합니다.<br>지금 기준일: <b>' + esc(asOf || '없음') + '</b>' + (asOf ? ' (' + daysBetween(asOf, today()) + '일 전)' : '') + '</div>' +
    '<div class="fg" style="margin-top:10px"><label>기준일 (SmartBee 에서 뽑은 날)</label>' + inputDate('arD', today()) + '</div>' +
    '<input type="file" id="arFile" accept=".xlsx,.xls,.csv" style="padding:8px"><div id="arOut" style="margin-top:10px"></div></div>';
  $('arFile').onchange = () => arParse($('arFile').files[0]);
}
async function loadXlsx() {
  if (window.XLSX) return window.XLSX;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  return window.XLSX;
}
const AR_COLS = { rep: /sales\s*rep/i, acct: /customer\s*#|acct|account/i, store: /customer\s*name|store/i, inv: /^invoice$|invoice\s*#|invoice\s*no/i, d: /invoice\s*date/i, total: /invoice\s*total/i, pdd: /past\s*due/i, bal: /^balance/i, cur: /^current/i, b1: /1\s*-\s*30/i, b2: /31\s*-\s*60/i, b3: /61\s*-\s*90/i, b4: /over\s*90|90\+/i, term: /^term/i };
export function parseArRows(aoa) {
  let hi = -1, idx = {};
  for (let r = 0; r < Math.min(aoa.length, 10) && hi < 0; r++) {
    const row = aoa[r].map(x => String(x == null ? '' : x).trim());
    const m = {}; Object.keys(AR_COLS).forEach(k => { const c = row.findIndex(h => h && AR_COLS[k].test(h)); if (c >= 0) m[k] = c; });
    if (m.inv != null && m.bal != null && m.acct != null) { hi = r; idx = m; }
  }
  if (hi < 0) throw new Error('머리글(Invoice · balance · Customer #)을 못 찾았습니다');
  const out = [], subtotals = [];
  const dateOf = v => { if (v instanceof Date) return v.toISOString().substring(0, 10); const s = String(v || '').trim(); const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0'); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10); if (typeof v === 'number' && v > 30000) { const d = new Date(Math.round((v - 25569) * 86400000)); return d.toISOString().substring(0, 10); } return ''; };
  for (let r = hi + 1; r < aoa.length; r++) {
    const row = aoa[r]; if (!row || !row.length) continue;
    const inv = String(row[idx.inv] == null ? '' : row[idx.inv]).trim(), acct = String(row[idx.acct] == null ? '' : row[idx.acct]).trim();
    const bal = num(row[idx.bal]);
    if (!inv) { const lab = String(row[idx.rep] == null ? '' : row[idx.rep]).trim() || String(row[idx.store] == null ? '' : row[idx.store]).trim(); if (lab && bal) subtotals.push({ label: lab, bal }); continue; }
    if (!acct || Math.abs(bal) < 0.005) continue;
    const bk = [num(row[idx.cur]), num(row[idx.b1]), num(row[idx.b2]), num(row[idx.b3]), num(row[idx.b4])];
    let bkIdx = bk.findIndex(x => Math.abs(x) > 0.005); if (bkIdx < 0) { const p = num(row[idx.pdd]); bkIdx = p <= 0 ? 0 : p <= 30 ? 1 : p <= 60 ? 2 : p <= 90 ? 3 : 4; }
    out.push({ rep: String(row[idx.rep] || '').trim().toUpperCase(), acct: pad4(acct), store: String(row[idx.store] || '').trim(), inv, d: dateOf(row[idx.d]), amt: R2(num(row[idx.total])), bal: R2(bal), pdd: Math.round(num(row[idx.pdd])), bk: bkIdx, term: String(row[idx.term] || '').trim() });
  }
  return { rows: out, subtotals };
}
async function arParse(file) {
  if (!file) return;
  const out = $('arOut'); out.innerHTML = '<div class="muted">읽는 중…</div>';
  try {
    const XLSX = await loadXlsx();
    const buf = await file.arrayBuffer(); const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]]; const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
    const { rows, subtotals } = parseArRows(aoa);
    const allRow = subtotals.find(s => /^ALL$/i.test(s.label));
    const total = sum(rows, r => r.bal);
    out.innerHTML = '<div class="alert a-blu">인보이스 ' + rows.length + '건 · 잔액 합계 <b>' + money(total) + '</b>' + (allRow ? ' · 파일 ALL 행 ' + money(allRow.bal) + (Math.abs(allRow.bal - total) < 0.02 ? ' ✓' : ' <span class="warn">✗ 다름</span>') : '') + '</div><button class="b-blue" id="arGo" style="margin-top:8px">세일즈맨별로 나눠 저장</button>';
    $('arGo').onclick = () => arBuild(rows, $('arD').value);
  } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
}
async function arBuild(rows, asOf) {
  busy(true);
  try {
    /* 최근 1년 수금 → 가게별 마지막 수금자 */
    const ents = (await S.DB.list('entries', { where: [['ym', 'in', recentYms(13)]] })).filter(e => !e.void && !e.repl);
    const last = {};
    ents.forEach(e => { const touch = (acct) => { if (!acct) return; if (!last[acct] || e.d > last[acct].d) last[acct] = { d: e.d, sm: e.sm }; }; touch(e.acct); (e.invs || []).forEach(v => { if (v.acct) touch(v.acct); }); });
    const byAcct = groupBy(rows, r => r.acct), unmatched = [], noSm = [];
    const stores = Object.keys(byAcct).map(acct => {
      const L = byAcct[acct], a = S.accounts.byCode[acct];
      if (!a) unmatched.push(acct + ' ' + L[0].store);
      const rep = L[0].rep, lp = last[acct];
      const sm = (lp && lp.sm) || (a && a.sm) || rep || '';
      if (!sm) noSm.push(acct);
      const b = [0, 0, 0, 0, 0]; L.forEach(r => { b[r.bk] += r.bal; });
      const newest = L.map(r => r.d).sort().reverse()[0] || '';
      const dormant = !!(newest && daysBetween(newest, asOf) > 365 && (!lp || daysBetween(lp.d, asOf) > 365));
      return { acct, store: a ? a.store : L[0].store, sm, rep, total: sum(L, r => r.bal), b: b.map(R2), invs: L.map(r => ({ inv: r.inv, d: r.d, amt: r.amt, bal: r.bal, pdd: r.pdd, bk: r.bk })), lastPaid: lp ? lp.d : '', dormant, moved: rep && rep !== sm ? rep : '', term: L[0].term };
    });
    const bySm = groupBy(stores, s => s.sm || '_none');
    const ops = [];
    S.sms.forEach(x => { const list = bySm[x.code] || []; ops.push({ op: 'set', col: 'ar', id: x.code, data: { sm: x.code, asOf, total: sum(list, s => s.total), n: list.length, stores: list } }); });
    Object.keys(bySm).forEach(code => { if (code !== '_none' && !S.smByCode[code]) ops.push({ op: 'set', col: 'ar', id: code, data: { sm: code, asOf, total: sum(bySm[code], s => s.total), n: bySm[code].length, stores: bySm[code] } }); });
    ops.push({ op: 'set', col: 'ar', id: '_all', data: { sm: '_all', asOf, total: sum(stores, s => s.total), n: stores.length, stores: stores.map(s => Object.assign({}, s)), unmatched, noSmAmt: sum(bySm['_none'] || [], s => s.total), uploadedAt: new Date().toISOString(), by: S.user.email } });
    await S.DB.batch(ops);
    await S.DB.set('settings', 'app', Object.assign({}, S.settings, { arAsOf: asOf })); S.settings.arAsOf = asOf;
    $('arOut').innerHTML = '<div class="alert a-grn">저장했습니다 — 기준일 ' + esc(asOf) + ' · 가게 ' + stores.length + '곳 · ' + money(sum(stores, s => s.total)) + '<br>담당 없는 금액 ' + money(sum(bySm['_none'] || [], s => s.total)) + ' · 거래처 목록에 없는 가게 ' + unmatched.length + '곳</div>' + (unmatched.length ? '<div class="muted">' + unmatched.slice(0, 30).map(esc).join('<br>') + (unmatched.length > 30 ? '<br>…' : '') + '</div>' : '');
    toast('AR 저장 완료', 'good');
  } catch (e) { $('arOut').innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
  busy(false);
}
