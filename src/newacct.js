/* ============================================================
 *  🆕 새 거래처 — 세일즈맨이 직접 열고, 매니저가 주문을 확인하면서 코드를 부여
 *    · 세일즈맨: 가게 정보 → 임시 번호 N261027-AB12 (accounts/{임시번호}, pending: true) → 바로 그 가게로 주문 · 수금
 *    · 매니저(주문 배정) · 관리자: 🆕 코드 부여 — 들어온 순서대로 6001 부터 이어서 (홀세일은 9000번대),
 *      임시 번호로 들어간 주문 · 수금 · 노트를 새 코드로 바꿈. 코드가 생기기 전에는 인보이스 발행을 막음
 *    · 거래처 코드 바꾸기 (renameAccount) — 기존 코드도 나중에 정리할 수 있게, 그 코드를 적어 둔 기록을 같이 바꿈
 *  번호는 counters/acctCode { app, whole } 를 트랜잭션으로 하나씩 — 두 사람이 동시에 눌러도 겹치지 않음
 *  SmartBee(이전 시스템)는 아직 쓰므로 그쪽 번호와 겹치지 않게 앱은 6001 부터
 * ============================================================ */
import { $, esc, toast, busy, openModal, closeModal, confirmBox, bi, bt, nz } from './ui.js';
import { can } from './main.js';

let S = null;
export function register(state) { S = state; }
export const APP_START = 6001, APP_END = 8999, WHOLE_START = 9001, WHOLE_END = 9999;
export const isTemp = code => /^N\d{6}-[A-Z0-9]{4}$/.test(String(code || ''));
export const isPending = a => !!a && (a.pending === true || isTemp(a.acct || a.id));
export const canAssign = () => !!S && (S.role === 'admin' || S.role === 'owner' || (S.role === 'manager' && can('assign')));
const mySm = () => String((S.me && S.me.sm) || '').toUpperCase();
const tempId = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return 'N' + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0'); };
/** New Account Application 양식 (관리 → 설정에서 바꿀 수 있음). Resale Certificate 는 양식 없이 손님이 준비해 줌 */
export const formLinks = () => Object.assign({ app: 'https://drive.google.com/file/d/1ZU8o3eYrd8adSxaR3aXImttnfeZI4cJ4/view' }, (S.settings && S.settings.newAcctForms) || {});

/* ---------- ① 세일즈맨: 새 거래처 열기 ---------- */
/** 새 거래처 폼 — done(account) 로 만든 임시 거래처를 돌려줌 */
export function newAcctForm(name, done) {
  const F = formLinks(), sms = (S.sms || []).map(s => s.code || s.sm || s).filter(Boolean);
  const staff = S.role !== 'salesman';
  const fld = (id, ko, en, v, ph, type) => '<div class="fg"><label>' + (ko === en ? esc(ko) : bi(ko, en)) + '</label><input id="' + id + '"' + (type ? ' type="' + type + '"' : '') + ' value="' + esc(v || '') + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + ' autocomplete="off"></div>';
  openModal('<h2>🆕 ' + bi('새 거래처 열기', 'Open a new account') + '</h2><div class="muted">' + bt('지금은 임시 번호로 저장되고, 매니저가 주문을 확인하면서 정식 코드(6001~)를 붙입니다. 주문 · 수금은 바로 넣을 수 있습니다.', 'Saved with a temporary number now — a manager assigns the real code (6001+) while reviewing the order. You can enter orders and payments right away.') + '</div>' +
    fld('naStore', '가게 이름 *', 'Store name *', String(name || '').toUpperCase()) +
    fld('naAddr', '주소 *', 'Street address *', '', '1234 MAIN ST') +
    '<div class="two" style="grid-template-columns:2fr 1fr 1fr;gap:6px">' + fld('naCity', '도시 *', 'City *', '') + fld('naState', '주 *', 'State *', 'FL') + fld('naZip', 'ZIP *', 'ZIP *', '', '', 'tel') + '</div>' +
    '<div class="two">' + fld('naTel', '전화', 'Phone', '', '', 'tel') + fld('naWho', '담당자 이름', 'Contact', '') + '</div>' +
    fld('naEm', '이메일', 'Email', '', '', 'email') +
    (staff ? '<div class="fg"><label>' + bi('세일즈맨', 'Salesman') + '</label><select id="naSm"><option value="">—</option>' + sms.map(c => '<option>' + esc(c) + '</option>').join('') + '</select></div>' : '') +
    '<label class="pick" id="naWh" style="margin-top:6px"><span class="ck">✓</span><span class="pm"><b>' + bi('홀세일 어카운트', 'Wholesale account') + '</b><small>' + bt('홀세일이면 9000번대 코드를 붙입니다', 'Wholesale accounts get a 9000-range code') + '</small></span></label>' +
    '<div class="card" style="background:#f8fafc;margin:10px 0 0;padding:10px 12px"><b>📎 ' + bi('받아서 보관할 서류', 'Paperwork to collect') + '</b> <span class="muted" style="font-size:12px">(' + bt('필수 아님', 'optional') + ')</span>' +
      '<label class="pick" id="naApp" style="margin-top:6px"><span class="ck">✓</span><span class="pm"><b>New Account Application</b><small>' + (F.app ? '<a href="' + esc(F.app) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + bt('양식 열기', 'Open form') + ' ↗</a>' : '') + '</small></span></label>' +
      '<label class="pick" id="naRs"><span class="ck">✓</span><span class="pm"><b>Resale Certificate</b><small>' + bt('손님이 준비해 주는 서류 — 받았으면 체크', 'Provided by the customer — check when received') + '</small></span></label>' +
      fld('naMemo', '메모', 'Note', '') + '</div>' +
    '<div class="btns"><button class="b-ghost" id="naX">' + bt('취소', 'Cancel') + '</button><button class="b-blue" id="naGo">🆕 ' + bt('저장', 'Save') + '</button></div>');
  ['naWh', 'naApp', 'naRs'].forEach(id => { $(id).onclick = e => { if (e.target.tagName === 'A') return; $(id).classList.toggle('on'); }; });
  $('naX').onclick = closeModal;
  $('naGo').onclick = async () => {
    const v = id => ($(id) ? $(id).value.trim() : '');
    const store = v('naStore').toUpperCase(), addr = v('naAddr').toUpperCase(), city = v('naCity').toUpperCase(), state = v('naState').toUpperCase(), zip = v('naZip').replace(/\D/g, '').substring(0, 5);
    if (!store || !addr || !city || !state || !zip) return toast(bt('가게 이름 · 주소 · 도시 · 주 · ZIP 을 넣어 주세요', 'Enter store, address, city, state and ZIP'), 'bad');
    const sm = staff ? v('naSm') : mySm();
    if (!sm) return toast(bt('세일즈맨을 고르세요', 'Pick a salesman'), 'bad');
    const dup = similar({ store, addr, zip, tel: v('naTel') });
    if (dup.length && !(await confirmBox(bt('비슷한 거래처가 이미 있습니다', 'Similar accounts already exist') + ':\n' + dup.slice(0, 3).map(a => '· ' + a.acct + ' ' + a.store + ' — ' + [a.addr, a.city].filter(Boolean).join(', ')).join('\n') + '\n\n' + bt('그래도 새로 열까요?', 'Open a new one anyway?'), bt('새로 열기', 'Open new')))) return;
    const id = tempId(), now = new Date().toISOString();
    const doc = { id, acct: id, store, addr, city, state, zip, tel: v('naTel'), contact: v('naWho'), email: v('naEm'), sm, pending: true, wholesale: $('naWh').classList.contains('on'),
      appGot: $('naApp').classList.contains('on'), resaleGot: $('naRs').classList.contains('on'), memo: v('naMemo'), newBy: String(S.user.email || '').toLowerCase(), newByName: (S.me && S.me.name) || S.user.name || '', newAt: now, createdAt: now };
    busy(true);
    try {
      await S.DB.set('accounts', id, doc);
      addLocal(doc);
      if (staff) { try { const { bumpAccountsVer } = await import('./mgr.js'); await bumpAccountsVer(); } catch (e) {} }
      closeModal(); toast('🆕 ' + store + ' — ' + bt('임시 번호로 저장했습니다. 매니저가 코드를 붙입니다', 'saved with a temporary number; a manager will assign the code'), 'good');
      if (done) done(S.accounts.byCode[id] || doc);
    } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}
function addLocal(doc) { const a = Object.assign({}, doc); a._n = nz(a.store); a._all = nz([a.store, a.city, a.state, a.addr, a.acct, a.tel, a.sm].filter(Boolean).join(' ')); S.accounts.push(a); if (S.accounts.byCode) S.accounts.byCode[a.acct] = a; }
/** 같은 가게를 두 번 열지 않게 — 이름 · 주소 · 전화가 비슷한 기존 거래처 */
export function similar(x, skip) {
  const n = nz(x.store), ad = nz(String(x.addr || '').replace(/\b(STE|SUITE|UNIT|#).*$/i, '')), tel = String(x.tel || '').replace(/\D/g, '').slice(-7);
  return (S.accounts || []).filter(a => a.acct !== skip && !isTemp(a.acct)).filter(a => {
    const an = a._n || nz(a.store);
    if (tel.length === 7 && String(a.tel || '').replace(/\D/g, '').slice(-7) === tel) return true;
    if (ad.length > 6 && nz(a.addr || '').indexOf(ad) === 0 && (!x.zip || String(a.zip || '').substring(0, 5) === x.zip)) return true;
    return n.length > 4 && an === n;
  });
}

/* ---------- ② 매니저: 코드 부여 ---------- */
async function pendingList() { try { return (await S.DB.list('accounts', { where: [['pending', '==', true]] })).sort((a, b) => String(a.newAt || '').localeCompare(String(b.newAt || ''))); } catch (e) { return []; } }
/** 범위 안 가장 큰 코드 */
function maxIn(lo, hi) { let m = 0; (S.accounts || []).forEach(a => { const n = Number(a.acct); if (/^\d{4}$/.test(a.acct) && n >= lo && n <= hi && n > m) m = n; }); return m; }
/** 다음에 붙을 코드들 미리 보기 (아직 저장 안 함) */
async function preview(list) {
  let c = {}; try { c = (await S.DB.get('counters', 'acctCode')) || {}; } catch (e) {}
  let app = Math.max(Number(c.app) || 0, maxIn(APP_START, APP_END) + 1, APP_START), wh = Math.max(Number(c.whole) || 0, maxIn(WHOLE_START - 1, WHOLE_END) + 1, WHOLE_START);
  const out = {}; list.forEach(a => { out[a.id] = a.wholesale ? wh++ : app++; }); return out;
}
/** 다음 코드 하나 받기 — 트랜잭션 + 이미 있는 코드면 건너뜀 */
async function takeCode(wholesale) {
  const key = wholesale ? 'whole' : 'app', lo = wholesale ? WHOLE_START : APP_START, hi = wholesale ? WHOLE_END : APP_END;
  for (let k = 0; k < 50; k++) {
    const n = await S.DB.seq('acctCode', key, Math.max(maxIn(lo - (wholesale ? 1 : 0), hi) + 1, lo));
    if (n > hi) throw new Error(bt('코드 범위를 다 썼습니다', 'Code range used up') + ' (' + lo + '~' + hi + ')');
    const code = String(n);
    if (n < Math.max(maxIn(lo - (wholesale ? 1 : 0), hi) + 1, lo)) continue;   // 손으로 만든 코드보다 작으면 건너뜀
    let ex = null; try { ex = await S.DB.get('accounts', code); } catch (e) {}
    if (!ex) return code;
  }
  throw new Error(bt('빈 코드를 찾지 못했습니다', 'No free code found'));
}
/** 🆕 코드 부여 기다리는 신규 거래처 — 매니저 화면 위 띠 (el 안에), 없으면 비움 */
export async function pendingBanner(el) {
  if (!el || !canAssign()) return;
  const L = await pendingList(); if (!L.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<button class="alert a-blu oldbar" id="naBan">🆕 ' + bt('코드 부여 기다리는 신규 거래처', 'New accounts waiting for a code') + ' <b>' + L.length + '</b>' + bt('곳', '') + ' — <u>' + bt('코드 붙이기', 'assign codes') + '</u></button>';
  $('naBan').onclick = () => pendingModal(() => pendingBanner(el));
}
export async function pendingModal(after) {
  if (!canAssign()) return toast(bt('주문 배정 매니저 · 관리자만 코드를 붙입니다', 'Only assigning managers / admins can assign codes'), 'bad');
  openModal('<div class="load">' + bt('읽는 중…', 'Loading…') + '</div>', { wide: true });
  const L = await pendingList(), P = await preview(L);
  const ords = {}; try { (await Promise.all(L.map(a => S.DB.list('orders', { where: [['acct', '==', a.id]] })))).forEach((os, i) => { ords[L[i].id] = os.filter(o => o.st !== 'x').length; }); } catch (e) {}
  const row = a => { const sim = similar(a, a.id);
    return '<div class="card" style="margin:8px 0;padding:10px 12px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div style="min-width:0"><b>' + esc(a.store) + '</b>' + (a.wholesale ? ' <span class="tag t-b">' + bt('홀세일', 'Wholesale') + '</span>' : '') +
      '<div class="muted" style="font-size:12px;overflow-wrap:anywhere">' + esc([a.addr, a.city, a.state, a.zip].filter(Boolean).join(', ')) + (a.tel ? ' · ' + esc(a.tel) : '') + '<br>🧑‍💼 ' + esc(a.sm || '') + ' · ' + esc(a.newByName || a.newBy || '') + ' · ' + esc(String(a.newAt || '').substring(5, 16).replace('T', ' ')) + ' · ' + bt('주문', 'orders') + ' ' + (ords[a.id] || 0) +
      (a.appGot || a.resaleGot ? '<br>📎 ' + [a.appGot ? 'Application ✓' : '', a.resaleGot ? 'Resale ✓' : ''].filter(Boolean).join(' · ') : '') + (a.memo ? '<br>💬 ' + esc(a.memo) : '') + '</div></div>' +
      '<div style="text-align:right;flex:0 0 auto"><div class="muted" style="font-size:11px">' + bt('붙을 코드', 'Code') + '</div><b style="font-size:20px">' + P[a.id] + '</b></div></div>' +
      (sim.length ? '<div class="alert a-amb" style="margin:6px 0 0;font-size:13px">⚠️ ' + bt('비슷한 기존 거래처', 'Similar existing account') + ': ' + sim.slice(0, 3).map(s => '<b>' + esc(s.acct) + '</b> ' + esc(s.store)).join(' · ') + '</div>' : '') +
      '<div class="btns" style="margin-top:6px;flex-wrap:wrap;justify-content:flex-start"><button class="b-green b-sm" data-naok="' + esc(a.id) + '">✅ ' + bt('코드 부여', 'Assign') + ' ' + P[a.id] + '</button><button class="b-ghost b-sm" data-nawh="' + esc(a.id) + '">' + (a.wholesale ? bt('일반으로 (6000번대)', 'Regular (6000s)') : bt('홀세일로 (9000번대)', 'Wholesale (9000s)')) + '</button>' +
      (sim.length ? '<button class="b-ghost b-sm" data-nasame="' + esc(a.id) + '" data-to="' + esc(sim[0].acct) + '">🔗 ' + bt('기존', 'Use') + ' ' + esc(sim[0].acct) + bt(' 로 합치기', '') + '</button>' : '') + '<button class="b-ghost b-sm" data-naed="' + esc(a.id) + '">✏️</button></div></div>'; };
  $('mbox').innerHTML = '<h2>🆕 ' + bi('신규 거래처 코드 부여', 'Assign codes to new accounts') + '</h2><div class="muted">' + bt('들어온 순서대로 6001 부터 이어서 붙습니다 (홀세일은 9000번대). 코드를 붙이면 임시 번호로 들어간 주문 · 수금 · 노트도 새 코드로 바뀝니다. SmartBee 에도 같은 코드로 만들어 주세요.', 'Codes go in arrival order from 6001 (wholesale: 9000s). Orders, payments and notes move to the new code. Create the same code in SmartBee.') + '</div>' +
    (L.length ? L.map(row).join('') + (L.length > 1 ? '<button class="b-green" id="naAll" style="margin-top:6px">✅ ' + bt('모두 순서대로 코드 부여', 'Assign all in order') + ' (' + L.length + ')</button>' : '') : '<div class="none">' + bt('기다리는 신규 거래처가 없습니다', 'No new accounts waiting') + '</div>') +
    '<div class="btns"><button class="b-ghost" id="naClose">' + bt('닫기', 'Close') + '</button></div>';
  $('naClose').onclick = () => { closeModal(); if (after) after(); };
  const done = async msgs => { toast(msgs.join(' · '), 'good'); await pendingModal(after); };
  document.querySelectorAll('[data-naok]').forEach(b => b.onclick = async () => { const a = L.find(x => x.id === b.dataset.naok); busy(true); try { const code = await assign(a); await done(['🆕 ' + a.store + ' = ' + code]); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); } busy(false); });
  if ($('naAll')) $('naAll').onclick = async () => { if (!(await confirmBox(bt(L.length + '곳에 순서대로 코드를 붙일까요?', 'Assign codes to ' + L.length + ' accounts in order?'), bt('부여', 'Assign')))) return; busy(true); const m = []; try { for (const a of L) m.push(a.store + ' = ' + await assign(a)); await done(m); } catch (e) { toast((m.length ? m.join(' · ') + ' — ' : '') + bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); } busy(false); };
  document.querySelectorAll('[data-nawh]').forEach(b => b.onclick = async () => { const a = L.find(x => x.id === b.dataset.nawh); try { await S.DB.update('accounts', a.id, { wholesale: !a.wholesale }); } catch (e) {} pendingModal(after); });
  document.querySelectorAll('[data-nasame]').forEach(b => b.onclick = async () => { const a = L.find(x => x.id === b.dataset.nasame), to = b.dataset.to; if (!(await confirmBox(bt('임시 거래처 ' + a.store + ' 를 기존 ' + to + ' 로 합칠까요? (주문 · 수금이 ' + to + ' 로 옮겨지고 임시 거래처는 지워집니다)', 'Merge into existing ' + to + '?'), bt('합치기', 'Merge')))) return; busy(true); try { await moveRefs(a.id, to); await S.DB.del('accounts', a.id); await bump(); await done(['🔗 ' + a.store + ' → ' + to]); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); } busy(false); });
  document.querySelectorAll('[data-naed]').forEach(b => b.onclick = async () => { closeModal(); const { storeForm } = await import('./mgr.js'); storeForm(S.accounts.byCode[b.dataset.naed] || L.find(x => x.id === b.dataset.naed)); });
}
/** 임시 거래처 하나에 코드 붙이기 */
export async function assign(a) {
  const fresh = await S.DB.get('accounts', a.id); if (!fresh || !fresh.pending) throw new Error(bt('이미 처리된 거래처입니다', 'Already processed'));
  const code = await takeCode(!!fresh.wholesale);
  await renameAccount(a.id, code, { pending: false, codeAt: new Date().toISOString(), codeBy: S.user.email, tempId: a.id });
  return code;
}

/* ---------- ③ 거래처 코드 바꾸기 — 기존 거래처도 ---------- */
const REF_COLS = ['orders', 'entries', 'cod', 'ach', 'invoices', 'shipments', 'shipq', 'pickups', 'backorders', 'acctNotes', 'invReq', 'deductions'];
/** 코드를 적어 둔 기록을 새 코드로 (acct 칸 + 미수금 안의 가게 줄 + 다른 가게 인보이스 줄) */
async function moveRefs(from, to) {
  const a = S.accounts.byCode[to] || (await S.DB.get('accounts', to)) || {};
  for (const c of REF_COLS) {
    let L = []; try { L = await S.DB.list(c, { where: [['acct', '==', from]] }); } catch (e) { continue; }
    for (let i = 0; i < L.length; i += 400) { try { await S.DB.batch(L.slice(i, i + 400).map(x => ({ op: 'update', col: c, id: x.id, data: Object.assign({ acct: to }, c === 'orders' || c === 'invoices' || c === 'entries' ? { store: x.store || a.store } : {}) }))); } catch (e) { console.warn('코드 바꾸기', c, e); } }
  }
  /* 미수금 문서 안의 가게 줄 */
  try { for (const d of await S.DB.list('ar')) { let ch = false; const st = (d.stores || []).map(s => s.acct === from ? (ch = true, Object.assign({}, s, { acct: to })) : s); if (ch) await S.DB.update('ar', d.id, { stores: st }); } } catch (e) {}
  /* 수금의 "다른 가게 인보이스" 줄 */
  try { const E = (await S.DB.list('entries')).filter(e => (e.invs || []).some(v => v.acct === from)); for (const e of E) await S.DB.update('entries', e.id, { invs: e.invs.map(v => v.acct === from ? Object.assign({}, v, { acct: to }) : v) }); } catch (e) {}
  /* ACH 은행 정보 */
  try { const b = await S.DB.get('achBank', from); if (b) { await S.DB.set('achBank', to, Object.assign({}, b, { acct: to })); await S.DB.del('achBank', from); } } catch (e) {}
}
async function bump() { try { const { bumpAccountsVer } = await import('./mgr.js'); await bumpAccountsVer(); } catch (e) {} }
/** 거래처 코드를 from → to 로 (to 가 비어 있어야 함). extra 는 새 거래처 문서에 더함 */
export async function renameAccount(from, to, extra) {
  to = String(to).trim();
  if (!/^\d{4}$/.test(to)) throw new Error(bt('코드는 숫자 4자리입니다', 'Code must be 4 digits'));
  if (await S.DB.get('accounts', to)) throw new Error(bt('이미 있는 코드입니다', 'Code already exists') + ': ' + to);
  const old = await S.DB.get('accounts', from); if (!old) throw new Error(bt('거래처를 찾지 못했습니다', 'Account not found'));
  const doc = Object.assign({}, old, extra || {}, { id: to, acct: to, updatedAt: new Date().toISOString(), oldCodes: (old.oldCodes || []).concat(isTemp(from) ? [] : [from]) });
  await S.DB.set('accounts', to, doc);
  await moveRefs(from, to);
  await S.DB.del('accounts', from);
  await bump();
  return to;
}
/** 🔁 코드 바꾸기 창 (매니저 · 관리자) */
export function renameForm(acct, done) {
  const a = S.accounts.byCode[acct]; if (!a) return;
  openModal('<h2>🔁 ' + bi('거래처 코드 바꾸기', 'Change account code') + '</h2><div class="muted"><b>' + esc(a.store) + '</b> · ' + bt('지금 코드', 'current') + ' <b>' + esc(acct) + '</b><br>' + bt('이 코드를 적어 둔 주문 · 인보이스 · 수금 · COD · ACH · 미수금 · 배송 · 노트가 모두 새 코드로 바뀝니다. SmartBee 에서도 같이 바꿔 주세요.', 'Orders, invoices, payments, COD, ACH, A/R, shipping and notes move to the new code. Change it in SmartBee too.') + '</div>' +
    '<div class="fg" style="margin-top:8px"><label>' + bi('새 코드 (숫자 4자리)', 'New code (4 digits)') + '</label><input id="rnTo" inputmode="numeric" maxlength="4" placeholder="' + (a.wholesale ? WHOLE_START : APP_START) + '"></div>' +
    '<div class="btns"><button class="b-ghost" id="rnX">' + bt('취소', 'Cancel') + '</button><button class="b-blue" id="rnGo">🔁 ' + bt('바꾸기', 'Change') + '</button></div>');
  $('rnX').onclick = closeModal;
  $('rnGo').onclick = async () => {
    const to = $('rnTo').value.trim(); if (!/^\d{4}$/.test(to)) return toast(bt('숫자 4자리로 넣어 주세요', 'Enter 4 digits'), 'bad');
    if (S.accounts.byCode[to]) return toast(bt('이미 있는 코드입니다', 'Code already exists') + ': ' + to + ' ' + S.accounts.byCode[to].store, 'bad');
    if (!(await confirmBox(a.store + ': ' + acct + ' → ' + to + '\n' + bt('바꿀까요?', 'Change?'), bt('바꾸기', 'Change')))) return;
    busy(true);
    try { await renameAccount(acct, to); closeModal(); toast('🔁 ' + a.store + ' = ' + to, 'good'); if (done) done(to); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}
