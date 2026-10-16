/* ============================================================
 *  THE ONE 앱 — 진입점: 로그인 → 역할 → 메뉴
 * ============================================================ */
import { connect, MOCK, newId } from './db.js';
import { $, esc, toast, busy, Router, openModal, closeModal, printClose, today } from './ui.js';
import { CSS } from './style.js';
import * as Sales from './sales.js';
import * as Mgr from './mgr.js';
import * as Boss from './boss.js';
import * as Admin from './admin.js';
import * as Orders from './orders.js';
import { loadAccounts } from './accounts.js';
import { setInvTypeMap } from './comm.js';
import { invTypes } from './invoicing.js';

export const VER = 'v0.5.1';
export const S = { user: null, me: null, role: '', sms: [], smByCode: {}, accounts: [], settings: {}, DB: null, AUTH: null };
const ADMIN_EMAILS = ['luke@theonefl.com'];

const NAV = {
  salesman: [['entry', '✍️', '수금 입력'], ['order', '🛒', '오더'], ['mine', '📋', '내 기록'], ['ar', '💰', '미수금'], ['mycomm', '🧾', '정산서']],
  manager:  [['verify', '✅', '확인'], ['order', '🛒', '오더'], ['cod', '💳', 'COD·ACH'], ['ach', '🏦', 'ACH'], ['stores', '🏬', '거래처'], ['arup', '📤', 'AR']],
  admin:    [['now', '📈', '현황'], ['order', '🛒', '오더'], ['pay', '🧾', '정산'], ['bossar', '💰', '미수금'], ['mg', '🏭', '경영'], ['admin', '⚙️', '관리']]
};
/* 오더는 관리 → 📦 아이템에서 "오더 켜기" 전까지 관리자에게만 보임 */
function navFor(r) { const on = S.settings.ordersOn || (S.me && S.me.role === 'admin'); return (NAV[r] || []).filter(x => x[0] !== 'order' || on); }

function shell() {
  document.head.insertAdjacentHTML('beforeend', '<style>' + CSS + '</style>');
  document.body.innerHTML =
    '<header><h1 id="hTitle">THE ONE</h1><div class="hr"><span id="hNet" title="인터넷 연결"></span><span id="hWho"></span><button class="hb" id="hMenu" title="메뉴">☰</button></div></header>' +
    '<div class="wrap" id="page"><div class="load">불러오는 중…</div></div>' +
    '<nav id="nav"></nav>' +
    '<div id="busy"><div class="spin"></div></div>' +
    '<div id="toast"></div>' +
    '<div id="modal"><div class="box" id="mbox"></div></div>' +
    '<div id="prt"><div id="prtbar"><button onclick="window.print()">🖨 인쇄 / PDF</button><button id="prtClose">닫기</button></div><div id="prtbody"></div></div>';
  $('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  $('prtClose').onclick = printClose;
  $('hMenu').onclick = userMenu;
  const net = () => { const d = $('hNet'); if (d) { d.classList.toggle('off', navigator.onLine === false); d.title = navigator.onLine === false ? '오프라인 — 저장한 것은 폰에 보관됩니다' : '온라인'; } };
  window.addEventListener('online', net); window.addEventListener('offline', net); net();
}

function loginScreen(msg) {
  $('nav').innerHTML = ''; $('hWho').textContent = '';
  $('page').innerHTML = '<div class="card login"><div class="logo">🔑</div><h1>THE ONE</h1><p>회사 구글 계정으로 로그인하세요</p>' +
    '<button class="b-blue" id="btnLogin">Google 로 로그인</button>' + (msg ? '<div class="alert a-red" style="margin-top:12px">' + esc(msg) + '</div>' : '') +
    '<p class="muted" style="margin-top:18px">' + VER + '</p></div>';
  $('btnLogin').onclick = async () => { try { await S.AUTH.signIn(); } catch (e) { loginScreen(e.code + ' — ' + e.message); } };
}
function waitScreen(email) {
  $('nav').innerHTML = '';
  $('page').innerHTML = '<div class="card login"><div class="logo">⏳</div><h1>등록 대기</h1><p>' + esc(email) + ' 계정은 아직 앱에 등록되지 않았습니다.<br>루크에게 등록을 요청해 주세요.</p>' +
    '<button class="b-ghost" id="btnOut">로그아웃</button></div>';
  $('btnOut').onclick = () => S.AUTH.signOut();
}
function userMenu() {
  if (!S.user) return;
  const roles = S.me && S.me.role === 'admin' ? ['admin', 'manager', 'salesman'] : [];
  openMenu('<h2>' + esc(S.user.name || S.user.email) + '</h2><p class="muted">' + esc(S.user.email) + ' · ' + roleLabel(S.role) + ' · ' + VER + '</p>' +
    (roles.length ? '<div class="fg"><label>화면 보기 (관리자)</label><div class="seg">' + roles.map(r => '<button class="' + (S.role === r ? 'on' : '') + '" data-r="' + r + '">' + roleLabel(r) + '</button>').join('') + '</div></div>' : '') +
    '<div class="btns"><button class="b-ghost" id="mOut">로그아웃</button><button class="b-blue" id="mReload">새로고침</button></div>' +
    '<button class="b-ghost b-sm" id="mDiag" style="margin-top:10px">🔎 연결 · 권한 점검</button><div id="diagOut"></div>');
  $('mDiag').onclick = diag;
  document.querySelectorAll('#mbox [data-r]').forEach(b => b.onclick = () => { switchRole(b.dataset.r); closeModal(); });
  $('mOut').onclick = () => { closeModal(); S.AUTH.signOut(); };
  $('mReload').onclick = () => location.reload();
}
/** 어떤 자료를 읽을 수 있는지 하나씩 시험 — 권한 오류 원인 찾기용 */
async function diag() {
  const out = $('diagOut'); out.innerHTML = '<div class="load">점검 중…</div>';
  const me = S.me || {};
  const rows = ['로그인: <b>' + esc(S.user.email) + '</b>', '사용자 기록: 역할 ' + esc(String(me.role)) + ' · 활성 ' + esc(String(me.active)) + ' · 세일즈맨 ' + esc(String(me.sm || '-'))];
  const tests = [['사용자 (내 것)', () => S.DB.get('users', S.user.email)], ['설정', () => S.DB.get('settings', 'app')], ['세일즈맨', () => S.DB.list('salesmen', { limit: 1 })],
    ['거래처', () => S.DB.list('accounts', { limit: 1 })], ['아이템', () => S.DB.get('catalog', 'meta')], ['오더', () => S.DB.list('orders', S.role === 'salesman' ? { where: [['sm', '==', me.sm || '-']], limit: 1 } : { limit: 1 })]];
  for (const [n, f] of tests) { try { await f(); rows.push('✅ ' + n); } catch (e) { rows.push('❌ ' + n + ' — ' + esc(e.code || e.message)); } }
  out.innerHTML = '<div class="sumbox" style="line-height:1.8">' + rows.join('<br>') + '</div>';
}
function openMenu(h) { openModal(h); }
export function roleLabel(r) { return { admin: '관리자', manager: '담당자', salesman: '세일즈맨' }[r] || r; }

function switchRole(r) {
  S.role = r;
  paintNav();
  Router.go(navFor(r)[0][0]);
}
function paintNav() {
  const items = navFor(S.role);
  $('nav').innerHTML = items.map(x => '<button data-go="' + x[0] + '"><span class="i">' + x[1] + '</span>' + x[2] + '</button>').join('');
  document.querySelectorAll('#nav button').forEach(b => b.onclick = () => Router.go(b.dataset.go));
  $('hWho').textContent = (S.me && S.me.sm ? S.me.sm + ' · ' : '') + roleLabel(S.role);
}

async function afterLogin(user) {
  S.user = user;
  const email = user.email;
  let me = null;
  try { me = await S.DB.get('users', email); } catch (e) { loginScreen('데이터베이스를 읽지 못했습니다 (' + (e.code || e.message) + ')'); return; }
  if (!me && ADMIN_EMAILS.includes(email)) {
    me = { id: email, email, name: user.name, role: 'admin', active: true, createdAt: today() };
    try { await S.DB.set('users', email, me); } catch (e) { loginScreen('관리자 기록을 만들지 못했습니다: ' + e.message); return; }
  }
  if (!me || me.active === false) { waitScreen(email); return; }
  /* 옛 버전이 만든 관리자 기록에 active 가 없으면 규칙의 "등록된 사용자" 검사에 걸림 → 채워 둠 */
  if (ADMIN_EMAILS.includes(email) && (me.active !== true || me.role !== 'admin')) {
    try { await S.DB.update('users', email, { active: true, role: 'admin' }); me.active = true; me.role = 'admin'; } catch (e) {}
  }
  S.me = me; S.role = me.role || 'salesman';
  busy(true);
  try {
    S.sms = await S.DB.list('salesmen', { order: ['code', 'asc'] });
    S.smByCode = {}; S.sms.forEach(x => { S.smByCode[x.code] = x; });
    S.settings = (await S.DB.get('settings', 'app')) || {};
    setInvTypeMap(invTypes(S));
    S.accounts = await loadAccounts(S);
  } catch (e) { toast('기본 자료를 읽지 못했습니다: ' + (e.code || e.message), 'bad'); }
  busy(false);
  paintNav();
  const valid = navFor(S.role).some(x => location.hash.indexOf('#/' + x[0]) === 0) || location.hash.indexOf('#/entry') === 0;
  if (!valid) location.hash = '#/' + navFor(S.role)[0][0];
  if (!ROUTER_ON) { ROUTER_ON = true; Router.start(); } else Router.start();
}
let ROUTER_ON = false;

async function boot() {
  shell();
  const { DB, AUTH } = await connect();
  S.DB = DB; S.AUTH = AUTH;
  Sales.register(S); Mgr.register(S); Boss.register(S); Admin.register(S); Orders.register(S);
  Router.on('', () => {});
  AUTH.onChange(u => {
    if (!u) { S.user = null; S.me = null; loginScreen(''); return; }
    afterLogin(u);
  });
}
boot();
