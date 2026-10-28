/* ============================================================
 *  관리 — 사용자 · 세일즈맨(요율) · 설정 · 옛 시트에서 가져오기
 * ============================================================ */
import { $, esc, money, num, R2, today, ym, toast, busy, openModal, closeModal, confirmBox, Router, sel, sum, sortBy, pad4, nz, addDays as addDaysA, bt, invNo, bi } from './ui.js';
import { newId } from './db.js';
import { RATE_LABELS, RATE_DEFAULT, invType, setInvTypeMap } from './comm.js';
import { bumpAccountsVer, parseArRows, saveAr } from './mgr.js';
import { roleLabel, JOBS, jobLabel, can } from './main.js';
import { seedImport, dropMgCache } from './mg.js';
import { parseFactoryStatement, looksLikeStatement, suggestFactoryCode, matchFactory } from './facstmt.js';
import { dropBossCache } from './boss.js';
import { levelTool } from './lvtool.js';
import { acctImportCard, bindAcctImport, acctFile, parseAcctList } from './acctimp.js';
import { parseItemMaster, publishCatalog, loadCatalog, catalog, parseSetBook, publishSets, exactItem, editCatalog, renameCat, ensureCats, moveCatTo, parseBulkSheet, applyBulk, catalogCsv, catStart, pins, setPins, popularCodes, photoIndex, driveUrl, cleanName, sbmLevelRows, sbmGroupRows, catLocs, setLocs, locKey, parseLocSheet, suggestCatLocs, parseSmartBeeItems, smartbeeDiff, applySmartBee, codeFamily, photoStats } from './catalog.js';
import { invTypes, fmtNo, company, dropInvCache, rebuildSalesM, getInvoice } from './invoicing.js';

let S = null, TAB = 'users';
export function register(state) { S = state; Router.on('admin', pageAdmin); Router.on('catmg', pageCatMg); }
/** 📷 사진 없는 아이템 — Level 1 별 숫자, 누르면 아이템 화면에서 그 분류의 사진 없는 것만 (카탈로그 담당의 작업 목록) */
function photoMissingCard() {
  const C = catalog(); if (!C || !C.items.length || !$('adminBody')) return;
  const st = photoStats(C), vis = C.items.filter(x => !x.h).length;
  $('adminBody').insertAdjacentHTML('afterbegin', '<div class="card" style="border:2px solid ' + (st.miss.length ? '#fcd34d' : '#bbf7d0') + '"><h2>📷 ' + bt('사진 없는 아이템', 'Items without a photo') + ' <span class="tag ' + (st.miss.length ? 't-c' : 't-k') + '">' + st.miss.length.toLocaleString() + ' / ' + vis.toLocaleString() + '</span></h2>' +
    '<div class="muted">' + bt('보이는 아이템 기준 · 앱에서 올린 사진', 'Visible items · uploaded in app') + ' ' + st.app + ' · ' + bt('드라이브', 'Drive') + ' ' + st.drive + ' · ' + bt('시트', 'Sheet') + ' ' + st.sheet + '. ' + bt('분류를 누르면 그 분류의 사진 없는 아이템만 나옵니다 — 아이템을 열어 📷 사진 올리기.', 'Tap a category to list its items without a photo — open an item and upload.') + '</div>' +
    (st.miss.length ? '<div class="chips" style="margin-top:8px"><button data-nop="">' + bt('전체', 'All') + ' <span class="en">' + st.miss.length + '</span></button>' + st.by.map(([k, n]) => '<button data-nop="' + esc(k) + '">' + esc(cleanName(k)) + ' <span class="en">' + n + '</span></button>').join('') + '</div>' : '<div class="none">✅ ' + bt('모든 아이템에 사진이 있습니다', 'Every item has a photo') + '</div>') + '</div>');
  document.querySelectorAll('[data-nop]').forEach(b => b.onclick = () => { const k = b.dataset.nop; const x = k ? C.items.find(i => (i.lv1 || i.l1) === k) : null; Router.go('items', 'noph' + (x ? ':' + encodeURIComponent([x.g, k].filter(Boolean).join('/')) : '')); });
}
/* 🎨 디자인 · 카탈로그 담당 홈 — 할 일이 한눈에: 사진 없음 · 분류 없음 · 가격 없음 · 숨김 · 세트, 바로가기. 올리기 · 세트 · 분류는 아래 탭 (관리 화면과 같은 것) */
let CTAB = '';
async function pageCatMg(arg) {
  if (!(S.role === 'admin' || S.role === 'owner' || can('catalog'))) { $('page').innerHTML = '<div class="card"><div class="none">' + bt('디자인 · 카탈로그 담당 · 관리자만 쓰는 화면입니다', 'Design & Catalog staff / admins only') + '</div></div>'; return; }
  CTAB = arg || '';
  $('page').innerHTML = '<div class="load">' + bt('아이템 읽는 중…', 'Loading items…') + '</div>';
  try { await loadCatalog(S); } catch (e) {}
  const C = catalog() || { items: [] }, vis = C.items.filter(x => !x.h), st = photoStats(C);
  const noLv = vis.filter(x => !x.l1 && !x.virt).length, noPr = vis.filter(x => !(x.p > 0)).length, hid = C.items.filter(x => x.h).length, sets = C.items.filter(x => x.k).length, noBar = vis.filter(x => !x.b && !x.virt).length;
  const tile = (go, n, label, warn) => '<button data-cg="' + go + '" class="' + (warn && n ? 'warn' : '') + '"><b>' + n.toLocaleString() + '</b><small>' + label + '</small></button>';
  const tabs = [['', '🏠 ' + bt('할 일', 'To do')], ['cat', '📥 ' + bt('올리기 · 세트 · 사진 설정', 'Upload · Sets · Photo settings')], ['tree', '🗂 ' + bt('분류', 'Categories')]];
  $('page').innerHTML = '<div class="card" style="padding:12px 14px"><h2 style="margin:0 0 6px">🎨 ' + bi('디자인 · 카탈로그', 'Design & Catalog') + ' <span class="muted" style="font-weight:400;font-size:12px">' + bt('아이템', 'items') + ' ' + vis.length.toLocaleString() + (C.updatedAt ? ' · ' + esc(String(C.updatedAt).substring(0, 10)) : '') + '</span></h2>' +
    '<div class="seg">' + tabs.map(t => '<button class="' + (CTAB === t[0] ? 'on' : '') + '" data-ct2="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' +
    (CTAB ? '' : '<div class="cdash">' + tile('photos/noph', st.miss.length, '📷✕ ' + bt('사진 없음', 'No photo'), true) + tile('items/nolv', noLv, '🗂 ' + bt('분류 없음', 'No category'), true) + tile('items/nopr', noPr, '💲 ' + bt('가격 없음', 'No price'), true) + tile('items/nobar', noBar, '🏷 ' + bt('바코드 없음', 'No barcode'), false) + tile('items/hid', hid, '🙈 ' + bt('숨김', 'Hidden'), false) + tile('catmg/cat', sets, '🧩 ' + bt('세트', 'Sets'), false) + '</div>' +
    '<div class="btns" style="justify-content:flex-start;margin:10px 0 0;flex-wrap:wrap"><button class="b-blue b-sm" data-cg="items/new">＋ ' + bt('새 아이템', 'New item') + '</button><button class="b-ghost b-sm" data-cg="photos">📷 ' + bt('사진 작업대', 'Photo workbench') + '</button><button class="b-ghost b-sm" data-cg="items">🏷 ' + bt('아이템 전체', 'All items') + '</button><button class="b-ghost b-sm" data-cg="cat">📒 ' + bt('카탈로그 · 바코드 라벨', 'Catalog · labels') + '</button></div>') + '</div>' +
    (CTAB ? '<div id="adminBody"><div class="load">읽는 중…</div></div>' : '<div id="adminBody"></div>');
  document.querySelectorAll('[data-ct2]').forEach(b => b.onclick = () => pageCatMg(b.dataset.ct2));
  document.querySelectorAll('[data-cg]').forEach(b => b.onclick = () => { const [r, a] = b.dataset.cg.split('/'); if (a) Router.go(r, a); else Router.go(r); });
  if (!CTAB) { photoMissingCard(); return; }
  try { if (CTAB === 'tree') await treeAdmin(); else await catalogAdmin(); }
  catch (e) { $('adminBody').innerHTML = '<div class="card"><div class="alert a-red">' + esc(e.code || e.message) + '</div></div>'; }
}
/* 💾 드라이브 자동 백업 상태 — apps-script/Backup.gs 가 settings/app.backup 에 적음 */
function bkLine() {
  const b = S.settings && S.settings.backup, dt = b && new Date(b.at), at = dt && !isNaN(dt) ? dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0') + ' ' + String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0') : '';
  const old = !b || !b.ok || Date.now() - new Date(b.at).getTime() > 2 * 86400000;
  return '<div class="' + (old ? 'alert a-amb' : 'muted') + '" style="margin:6px 0">💾 ' + (!b ? bt('드라이브 자동 백업이 아직 설정되지 않았습니다 — apps-script/Backup.gs 를 설치해 주세요', 'Drive backup not set up yet — install apps-script/Backup.gs') :
    bt('마지막 백업', 'Last backup') + ' ' + esc(at) + (b.ok ? ' · ' + Number(b.docs || 0).toLocaleString() + bt('개 기록', ' records') + (b.url ? ' · <a href="' + esc(b.url) + '" target="_blank" rel="noopener">' + bt('드라이브 폴더 열기', 'Open Drive folder') + '</a>' : '') : ' · <b class="warn">' + bt('실패', 'failed') + ': ' + esc(b.err || '') + '</b>') + (old && b.ok ? ' · <b class="warn">' + bt('이틀 넘게 백업이 없습니다', 'No backup for 2+ days') + '</b>' : '')) + '</div>';
}
async function pageAdmin(arg) {
  if (arg) TAB = arg;
  let h = '<div class="seg">' + [['users', '👤 사용자'], ['sms', '🧑‍💼 세일즈맨'], ['set', '⚙️ 설정'], ['cat', '📦 아이템'], ['tree', '🗂 분류'], ['imp', '📥 가져오기']].map(t => '<button class="' + (TAB === t[0] ? 'on' : '') + '" data-at="' + t[0] + '">' + t[1] + '</button>').join('') + '</div><div class="btns" style="justify-content:flex-start;margin:0 0 4px;flex-wrap:wrap"><button class="b-ghost b-sm" onclick="location.hash=\'#/stores\'">🏬 거래처 전체 보기 (세일즈맨 · 주 · 도시별)</button><button class="b-ghost b-sm" onclick="location.hash=\'#/items\'">🏷 아이템 전체 보기 · 숨기기</button></div><div id="adminBody"><div class="load">읽는 중…</div></div>';
  h = h.replace('<div class="btns"', bkLine() + '<div class="btns"');
  $('page').innerHTML = h;
  document.querySelectorAll('[data-at]').forEach(b => b.onclick = () => { TAB = b.dataset.at; pageAdmin(); });
  try { if (TAB === 'users') await users(); else if (TAB === 'sms') await salesmen(); else if (TAB === 'set') { await settings(); if ($('adminBody')) await formsCard($('adminBody')); } else if (TAB === 'cat') await catalogAdmin(); else if (TAB === 'tree') await treeAdmin(); else await importer(); }
  catch (e) {
    const perm = /permission/i.test(String(e.code || e.message));
    $('adminBody').innerHTML = '<div class="card"><div class="alert a-red">읽지 못했습니다: ' + esc(e.code || e.message) + '</div>' +
      (perm ? '<div class="alert a-amb">권한 오류입니다. Firebase 콘솔 → Firestore → 규칙에 저장소의 firestore.rules 가 <b>게시</b>됐는지 확인하세요.</div>' : '') + '</div>';
  }
}

/* ---- 사용자 ---- */
/* ---- 👤 사용자 — 이메일 · 이름 · 역할, 역할을 고르면 그 역할에 맞는 추가 설정 (일 · 세일즈맨 코드 · 추가 화면 · ACH) ---- */
const ROLES = [
  ['owner', '👑', '오너', 'Owner', '현황 · 경영 · 미수금 · 주문 흐름 · 거래처 · 카탈로그 (관리자급 — 자료는 전부 봄, 사용자 등록 · ACH 은행은 빼고)'],
  ['admin', '⚙️', '관리자', 'Admin', '모든 화면 + 관리(사용자 · 설정 · 가져오기). 오너 · 담당자 · 세일즈맨 화면으로 바꿔 볼 수 있음'],
  ['manager', '🧑‍💼', '담당자', 'Staff', '고른 "일"에 따라 화면이 달라짐 — 주문 · 출고 · 인보이스 · 수금 확인 · 창고'],
  ['salesman', '🚗', '세일즈맨', 'Salesman', '내 가게 · 주문 · 수금 입력 · 미수금 · 정산서 (자기 것만)']];
const JOB_TXT = { office: '주문 · 인보이스 · 출고 · 재고 · 수금 · COD · ACH 거의 전부', acct: '수금 확인 · COD · 카드 · ACH · 인보이스 조회', pickinv: '작업 배정 · 피킹 · 인보이스 발행 · 포장 · UPS · 재고', invoice: '주문 · 인보이스 발행 · 수금 확인', whmgr: '작업 배정 · 피킹 · 포장 · UPS · 재고 위치', pick: '내 배정 작업 · 피킹 · 포장 · 재고 위치' };
const roleTag = r => '<span class="tag ' + ({ owner: 't-c', admin: 't-a', manager: 't-b', salesman: 't-k' }[r] || 't-g') + '">' + (ROLES.find(x => x[0] === r) || ['', '', r])[1] + ' ' + (ROLES.find(x => x[0] === r) || ['', '', r])[2] + '</span>';
async function users() {
  const all = await S.DB.list('users'), ord = { owner: 0, admin: 1, manager: 2, salesman: 3 };
  const list = sortBy(all, u => (ord[u.role] == null ? 9 : ord[u.role]) + (u.active === false ? 'z' : 'a') + (u.name || u.email).toUpperCase());
  const grp = ROLES.map(r => [r, list.filter(u => (u.role || 'salesman') === r[0])]).filter(x => x[1].length);
  $('adminBody').innerHTML = '<div class="card"><h2>👤 사용자 ' + list.length + '명</h2><div class="muted">구글 계정 이메일로 등록합니다. <b>역할</b>을 고르면 그 역할에 맞는 설정이 나옵니다 — 담당자는 "일", 세일즈맨은 "세일즈맨 코드", 오너 · 담당자는 <b>추가 화면</b>(세일즈맨 · 담당자 화면도 보기)을 줄 수 있습니다. 여러 화면을 가진 사람은 위쪽 이름을 눌러 화면을 바꿉니다.</div><button class="b-blue" id="uNew" style="margin-top:8px">＋ 사용자 추가</button></div>' +
    grp.map(([r, L]) => '<div class="card"><h2 style="font-size:15px">' + r[1] + ' ' + r[2] + ' <span class="en">' + r[3] + '</span> <span class="muted" style="font-weight:400">' + L.length + '명</span></h2>' +
      L.map(u => { const ex = (u.extra || []).filter(x => x !== u.role);
        return '<div class="pr tap" data-u="' + esc(u.email) + '"><div class="ct"><b>' + esc(u.name || u.email) + (u.active === false ? ' <span class="tag t-g">비활성</span>' : '') + '</b>' +
          '<small>' + esc(u.email) + '</small><small>' + [u.role === 'manager' ? '일: ' + esc(jobLabel(u.job || 'office').split(' ')[0]) : '', u.sm ? '세일즈맨 코드 ' + esc(u.sm) : '', ex.length ? '추가 화면: ' + ex.map(x => (ROLES.find(y => y[0] === x) || ['', '', x])[2]).join(' · ') : '', u.achAccess ? 'ACH 은행' : ''].filter(Boolean).join(' · ') + '</small></div></div>'; }).join('') + '</div>').join('');
  $('uNew').onclick = () => userForm(null);
  document.querySelectorAll('[data-u]').forEach(el => el.onclick = () => userForm(list.find(u => u.email === el.dataset.u)));
}
function userForm(u) {
  u = u || {};
  const F = { role: u.role || 'salesman', job: u.job || 'office', extra: (u.extra || []).slice(), ach: !!u.achAccess, active: u.active !== false };
  const isMe = u.email && u.email === S.user.email;
  openModal('<h2>' + (u.email ? '👤 ' + esc(u.name || u.email) : '＋ 사용자 추가') + '</h2>' +
    '<div class="fg"><label>① 구글 이메일 <span class="en">Google email</span></label><input id="uEmail" value="' + esc(u.email || '') + '" ' + (u.email ? 'readonly style="background:#f1f5f9"' : '') + ' placeholder="name@gmail.com" autocapitalize="off"></div>' +
    '<div class="fg"><label>② 이름 <span class="en">Name</span></label><input id="uName" value="' + esc(u.name || '') + '"></div>' +
    '<div class="fg"><label>③ 역할 <span class="en">Role</span></label><div class="rolepick">' + ROLES.map(r => '<button type="button" class="' + (F.role === r[0] ? 'on' : '') + '" data-ur="' + r[0] + '"' + (isMe && r[0] !== 'admin' ? ' disabled' : '') + '><b>' + r[1] + ' ' + r[2] + ' <span class="en">' + r[3] + '</span></b><small>' + r[4] + '</small></button>').join('') + '</div></div>' +
    '<div id="uMore"></div>' +
    '<label class="pick ' + (F.active ? 'on' : '') + '" id="uActP"><span class="ck">✓</span><span class="pm"><b>활성 <span class="en">Active</span></b><small>끄면 로그인이 막힙니다 (기록은 남음)</small></span></label>' +
    '<div class="btns">' + (u.email && !isMe ? '<button class="b-ghost" id="uDel">삭제</button>' : '') + '<button class="b-ghost" id="uX">취소</button><button class="b-blue" id="uSave">저장</button></div>', { wide: true });
  const smInput = (req, why) => '<div class="fg"><label>세일즈맨 코드 ' + (req ? '<b style="color:#b91c1c">*</b>' : '<span class="muted">(선택)</span>') + '</label><input id="uSm" list="uSmList" value="' + esc(u.sm || '') + '" placeholder="예: BRANDON" style="text-transform:uppercase" autocomplete="off"><datalist id="uSmList">' + S.sms.map(x => '<option value="' + esc(x.code) + '">').join('') + '</datalist><small class="muted">' + why + ' 목록에 없으면 그대로 입력 — 저장할 때 세일즈맨도 만듭니다.</small></div>';
  const chk = (id, on, t, sub) => '<label class="pick ' + (on ? 'on' : '') + '" id="' + id + '"><span class="ck">✓</span><span class="pm"><b>' + t + '</b><small>' + sub + '</small></span></label>';
  const paintMore = () => {
    const r = F.role; let h = '<div class="sumbox" style="margin:4px 0 10px"><b>④ ' + (ROLES.find(x => x[0] === r) || [])[2] + ' 설정</b>';
    if (r === 'admin') h += '<div class="muted" style="margin:4px 0 8px">관리자는 모든 화면을 보고, 위쪽 이름을 눌러 👑 오너 · 🧑‍💼 담당자 · 🚗 세일즈맨 화면으로 바꿔 볼 수 있습니다.</div>' + smInput(false, '세일즈맨 화면에서 "내 가게"로 볼 코드 (예: LUKE).');
    if (r === 'owner') h += chk('uExS', F.extra.includes('salesman'), '🚗 세일즈맨 화면도', '자기 세일즈맨 코드로 내 가게 · 주문 · 수금 입력 · 정산서') + '<div id="uSmBox"></div>' +
      chk('uExM', F.extra.includes('manager'), '🧑‍💼 담당자 화면도', '아래에서 고른 일의 화면 (주문 처리 · 수금 확인 …)') + '<div id="uJobBox"></div>' + chk('uAchP', F.ach, '🏦 ACH 은행 정보 보기', '고객 은행 계좌 · 라우팅 번호 — 꼭 필요한 사람만');
    if (r === 'manager') h += '<div class="fg"><label>일 <span class="en">Job</span> — 화면이 달라집니다</label><div class="rolepick sm">' + JOBS.map(j => '<button type="button" class="' + (F.job === j[0] ? 'on' : '') + '" data-uj="' + j[0] + '"><b>' + j[1] + ' <span class="en">' + j[2] + '</span></b><small>' + (JOB_TXT[j[0]] || '') + '</small></button>').join('') + '</div></div>' +
      chk('uExS', F.extra.includes('salesman'), '🚗 세일즈맨 화면도', '직접 가게를 맡는 담당자 — 자기 세일즈맨 코드로') + '<div id="uSmBox"></div>' +
      chk('uAchP', F.ach, '🏦 ACH 은행 정보 보기', '고객 은행 계좌 · 라우팅 번호 — 꼭 필요한 사람만');
    if (r === 'salesman') h += smInput(true, '수금 · 주문 · 미수금이 이 코드로 묶입니다.');
    $('uMore').innerHTML = h + '</div>';
    const subSm = () => { const b = $('uSmBox'); if (b) b.innerHTML = F.extra.includes('salesman') ? smInput(true, '') : ''; };
    const subJob = () => { const b = $('uJobBox'); if (b) b.innerHTML = F.extra.includes('manager') ? '<div class="rolepick sm">' + JOBS.map(j => '<button type="button" class="' + (F.job === j[0] ? 'on' : '') + '" data-uj="' + j[0] + '"><b>' + j[1] + '</b><small>' + (JOB_TXT[j[0]] || '') + '</small></button>').join('') + '</div>' : ''; bindJob(); };
    const bindJob = () => document.querySelectorAll('[data-uj]').forEach(b => b.onclick = () => { F.job = b.dataset.uj; document.querySelectorAll('[data-uj]').forEach(x => x.classList.toggle('on', x === b)); });
    const tog = (id, key) => { const el = $(id); if (!el) return; el.onclick = () => { const on = !F.extra.includes(key); F.extra = F.extra.filter(x => x !== key); if (on) F.extra.push(key); el.classList.toggle('on', on); if (key === 'salesman') subSm(); if (key === 'manager') subJob(); }; };
    tog('uExS', 'salesman'); tog('uExM', 'manager');
    if ($('uAchP')) $('uAchP').onclick = () => { F.ach = !F.ach; $('uAchP').classList.toggle('on', F.ach); };
    subSm(); subJob(); bindJob();
  };
  document.querySelectorAll('[data-ur]').forEach(b => b.onclick = () => { F.role = b.dataset.ur; document.querySelectorAll('[data-ur]').forEach(x => x.classList.toggle('on', x === b)); paintMore(); });
  $('uActP').onclick = () => { F.active = !F.active; $('uActP').classList.toggle('on', F.active); };
  $('uX').onclick = closeModal;
  paintMore();
  $('uSave').onclick = async () => {
    const email = $('uEmail').value.trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('이메일을 확인하세요', 'bad');
    const name = $('uName').value.trim(); if (!name) return toast('이름을 넣으세요', 'bad');
    let smv = $('uSm') ? $('uSm').value.trim().toUpperCase().replace(/\s+/g, ' ') : '';
    const r = F.role, extra = r === 'admin' || r === 'salesman' ? [] : F.extra.filter(x => x !== r && x !== 'owner');   // 오너 화면은 관리자급 자료가 필요해 오너 · 관리자만
    if (r === 'salesman' && !smv) smv = name.toUpperCase().split(/\s+/)[0];
    if (extra.includes('salesman') && !smv) return toast('세일즈맨 화면을 주려면 세일즈맨 코드를 넣으세요', 'bad');
    if (r !== 'salesman' && r !== 'admin' && !extra.includes('salesman')) smv = '';
    const doc = { email, name, role: r, job: r === 'manager' || extra.includes('manager') ? F.job : '', sm: smv, extra, achAccess: r === 'admin' ? true : (r === 'salesman' ? false : F.ach), active: F.active, updatedAt: new Date().toISOString() };
    if (isMe && r !== 'admin') return toast('내 계정은 관리자로 둡니다', 'bad');
    busy(true); try {
      let made = '';
      if (doc.sm && !S.smByCode[doc.sm]) { await S.DB.set('salesmen', doc.sm, { code: doc.sm, name: doc.name || doc.sm, email: r === 'salesman' ? email : '', rates: Object.assign({}, RATE_DEFAULT), active: true, updatedAt: new Date().toISOString() }); await reloadSms(); made = ' · 세일즈맨 ' + doc.sm + ' 새로 만듦 (요율은 세일즈맨 탭에서 확인)'; }
      await S.DB.set('users', email, Object.assign({ createdAt: today() }, u, doc)); closeModal(); toast('저장' + made, 'good');
      if (isMe) { S.me = Object.assign({}, S.me, doc); }
      users();
    } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false);
  };
  if ($('uDel')) $('uDel').onclick = async () => { if (!(await confirmBox('이 사용자를 지울까요? 로그인이 막힙니다.', '삭제'))) return; busy(true); try { await S.DB.del('users', u.email); closeModal(); users(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); };
}

/* ---- 세일즈맨 · 요율 ---- */
async function reloadSms() { S.sms = await S.DB.list('salesmen', { order: ['code', 'asc'] }); S.smByCode = {}; S.sms.forEach(x => { S.smByCode[x.code] = x; }); }
/* 현재 세일즈맨 명단 (2026-10) — ERIC 은 퇴사라 뺌. 요율은 기본값이니 정산 전에 확인 */
const SM_BASE = ['ACE', 'ALEX', 'ANDREW', 'BRANDON', 'DANIEL', 'KAEL', 'KAY', 'KEVIN', 'LUKE', 'PETER', 'ROKY', 'SOO'];
async function smBaseCreate() {
  const miss = SM_BASE.filter(c => !S.smByCode[c]);
  if (!miss.length) return toast('이미 다 있습니다');
  if (!(await confirmBox(miss.length + '명 만들기: ' + miss.join(', '), '만들기'))) return;
  busy(true); try {
    for (const c of miss) await S.DB.set('salesmen', c, { code: c, name: c, email: '', rates: Object.assign({}, RATE_DEFAULT), active: true, updatedAt: new Date().toISOString() });
    await reloadSms(); toast(miss.length + '명 만들었습니다'); salesmen();
  } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false);
}
async function salesmen() {
  const list = await S.DB.list('salesmen', { order: ['code', 'asc'] });
  const miss = SM_BASE.filter(c => !list.some(s => s.code === c));
  $('adminBody').innerHTML = '<div class="card"><h2>세일즈맨 ' + list.length + '명</h2><div class="muted">코드는 수금 기록·AR·정산의 기준입니다 (대문자). 요율은 정산서 계산에 씁니다. 💼 급여제로 표시한 사람은 정산에서 커미션을 계산하지 않습니다.</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="b-blue" id="sNew">＋ 세일즈맨 추가</button>' + (miss.length ? '<button class="b-ghost" id="sBase">👥 기본 명단 ' + miss.length + '명 한 번에</button>' : '') + '</div></div>' +
    '<div class="card"><table><tr><th>코드</th><th>이름</th><th class="r">A</th><th class="r">W</th><th class="r">P</th><th class="r">DP</th><th class="r">OFF</th></tr>' + list.map(s => { const r = Object.assign({}, RATE_DEFAULT, s.rates || {}); return '<tr class="tap" data-s="' + esc(s.code) + '"><td><b>' + esc(s.code) + '</b>' + (s.active === false ? ' <span class="tag t-g">비활성</span>' : '') + (s.salaried ? ' <span class="tag" style="background:#ede9fe;color:#4c1d95">💼 급여제</span>' : '') + '</td><td>' + esc(s.name || '') + '</td><td class="r">' + pr(r.a) + '</td><td class="r">' + pr(r.w) + '</td><td class="r">' + pr(r.p) + '</td><td class="r">' + pr(r.dp) + '</td><td class="r">' + pr(r.office) + '</td></tr>'; }).join('') + '</table></div>';
  $('sNew').onclick = () => smForm(null);
  if ($('sBase')) $('sBase').onclick = smBaseCreate;
  document.querySelectorAll('[data-s]').forEach(el => el.onclick = () => smForm(list.find(s => s.code === el.dataset.s)));
}
const pr = v => (Number(v) * 100).toFixed(1) + '%';
function smForm(s) {
  s = s || {}; const r = Object.assign({}, RATE_DEFAULT, s.rates || {});
  openModal('<h2>' + (s.code ? esc(s.code) : '＋ 세일즈맨') + '</h2>' +
    '<div class="two"><div class="fg"><label>코드</label><input id="smCode" value="' + esc(s.code || '') + '" ' + (s.code ? 'readonly' : '') + ' style="text-transform:uppercase"></div><div class="fg"><label>이름</label><input id="smName" value="' + esc(s.name || '') + '"></div></div>' +
    '<div class="fg"><label>이메일 (리포트 참조)</label><input id="smEmail" value="' + esc(s.email || '') + '"></div>' +
    '<div class="fg"><label>요율 (%)</label><div class="three">' + RATE_LABELS.map(x => '<div><small class="muted">' + esc(x[1]) + '</small><input class="sm" id="r_' + x[0] + '" value="' + (Number(r[x[0]]) * 100).toFixed(1) + '" inputmode="decimal" style="text-align:right"></div>').join('') + '</div></div>' +
    '<label class="muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="smAct" style="width:18px;height:18px" ' + (s.active !== false ? 'checked' : '') + '> 활성</label>' +
    '<label class="muted" style="display:flex;gap:6px;align-items:center;margin-top:8px"><input type="checkbox" id="smSal" style="width:18px;height:18px" ' + (s.salaried ? 'checked' : '') + '> 💼 급여제 — 정산에서 커미션을 계산하지 않고 수금 기록만 맞춰 마감</label><div class="hint">커미션 세일즈맨(예: BRANDON · ALEX · SOO)은 체크를 끄세요. 급여제는 정산서에 지급액이 0 으로 나오고 1099 에 올라가지 않습니다.</div>' +
    '<div class="btns"><button class="b-blue" id="smSave">저장</button></div>');
  $('smSave').onclick = async () => {
    const code = $('smCode').value.trim().toUpperCase(); if (!code) return toast('코드를 넣으세요', 'bad');
    const rates = {}; RATE_LABELS.forEach(x => { rates[x[0]] = R2(num($('r_' + x[0]).value) / 100 * 10000) / 10000; });
    const doc = { code, name: $('smName').value.trim(), email: $('smEmail').value.trim().toLowerCase(), rates, active: $('smAct').checked, salaried: $('smSal').checked, updatedAt: new Date().toISOString() };
    busy(true); try { await S.DB.set('salesmen', code, doc); await reloadSms(); closeModal(); toast('저장'); salesmen(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false);
  };
}

/* ---- 설정 ---- */
/* 🆕 새 거래처 서류 양식 링크 (세일즈맨 새 거래처 창에 보임) */
async function formsCard(el) {
  const { formLinks } = await import('./newacct.js'), f = formLinks();
  el.insertAdjacentHTML('afterbegin', '<div class="card"><h2>🆕 ' + bt('새 거래처 서류 양식', 'New account forms') + '</h2><div class="muted">' + bt('세일즈맨이 새 거래처를 열 때 보이는 양식 링크 (구글 드라이브 · 공유 링크)', 'Links shown when a salesman opens a new account (Google Drive share links)') + '</div>' +
    '<div class="fg"><label>New Account Application</label><input id="nfApp" value="' + esc(f.app || '') + '"></div><div class="fg"><label>💬 ' + bt('구글 챗 스페이스 링크 (주문 문의 — "챗 열기" 버튼)', 'Google Chat space link (order questions)') + '</label><input id="nfChat" value="' + esc((S.settings && S.settings.chatUrl) || '') + '" placeholder="https://chat.google.com/room/…"></div><div class="muted" style="font-size:12px">' + bt('챗으로 메시지를 보내려면 그 스페이스의 웹훅 주소를 Apps Script(THE ONE Mail) 스크립트 속성 CHAT_WEBHOOK 에 넣으세요 — 앱에는 저장하지 않습니다.', 'To post messages, put the space webhook URL in the Apps Script (THE ONE Mail) script property CHAT_WEBHOOK — not stored in the app.') + '</div><button class="b-blue b-sm" id="nfSave">' + bt('저장', 'Save') + '</button></div>');
  $('nfSave').onclick = async () => { const v = { app: $('nfApp').value.trim() }, ch = $('nfChat').value.trim(); busy(true); try { await S.DB.update('settings', 'app', { newAcctForms: v, chatUrl: ch }); S.settings.newAcctForms = v; S.settings.chatUrl = ch; toast(bt('저장', 'Saved'), 'good'); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); } busy(false); };
}
async function settings() {
  const s = S.settings || {};
  $('adminBody').innerHTML = '<div class="card"><h2>정산 설정</h2>' +
    '<div class="fg"><label>할인 초과 기준 (이 값을 넘으면 할인 요율) %</label><input id="stDisc" value="' + ((s.discLimit != null ? s.discLimit : 0.2) * 100).toFixed(0) + '" inputmode="decimal"></div>' +
    '<div class="fg"><label>EXCHANGE 가게 키워드 (쉼표로)</label><input id="stKw" value="' + esc(s.specialKeywords || 'BEAUTY EXCHANGE, BEAUTY EXCAHNGE') + '"></div>' +
    '<div class="fg"><label>EXCHANGE 칸 제목</label><input id="stTitle" value="' + esc(s.specialTitle || 'BEAUTY EXCHANGE') + '"></div>' +
    '<div class="fg"><label>담당자 알림 이메일 (옵션)</label><input id="stMail" value="' + esc(s.reportTo || 'check@theonefl.com') + '"></div>' +
    '<div class="fg"><label>🔒 자동 로그아웃 (분 · 아무 조작 없이 이 시간이 지나면 로그아웃, 0 = 끔)</label><input id="stIdle" inputmode="numeric" value="' + esc(s.idleMin == null ? '' : s.idleMin) + '" placeholder="예: 480 (8시간)"></div>' +
    '<h2 style="margin-top:14px">인보이스에 찍히는 회사 정보</h2>' + (() => { const c = company(S); return '<div class="fg"><label>회사 이름</label><input id="coName" value="' + esc(c.name) + '"></div><div class="two"><div class="fg"><label>주소 1</label><input id="coA1" value="' + esc(c.addr1) + '"></div><div class="fg"><label>주소 2 (City, ST Zip)</label><input id="coA2" value="' + esc(c.addr2) + '"></div></div><div class="two"><div class="fg"><label>전화</label><input id="coTel" value="' + esc(c.tel) + '"></div><div class="fg"><label>하단 인사말</label><input id="coThx" value="' + esc(c.thanks) + '"></div></div>'; })() +
    '<div class="muted">AR 기준일: ' + esc(s.arAsOf || '없음') + ' · 거래처 버전: ' + esc(s.accountsVer || '0') + '</div>' +
    '<div class="btns"><button class="b-blue" id="stSave">저장</button></div></div>' + invTypeCard() +
    '<div class="card"><h2>📊 월별 매출 요약</h2><div class="muted">현황 · 주문 대시보드의 분기 · 올해 보기는 인보이스 수천 장 대신 월별 요약을 읽습니다. 발행 · 취소 · 가져오기 때 자동으로 갱신되지만, 숫자가 이상하면 여기서 다시 만듭니다 (최근 36개월 인보이스를 한 번 읽음).</div><div class="btns" style="justify-content:flex-start"><button class="b-ghost" id="smRebuild">다시 만들기</button></div><div id="smOut"></div></div>';
  $('smRebuild').onclick = async () => { busy(true); try { const ms = []; const d = new Date(); for (let i = 0; i < 36; i++) { ms.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); d.setMonth(d.getMonth() - 1); } const n = await rebuildSalesM(S, ms); $('smOut').innerHTML = '<div class="alert a-grn">' + n + '개월 요약을 다시 만들었습니다</div>'; } catch (e) { $('smOut').innerHTML = '<div class="alert a-red">' + esc(e.code || e.message) + '</div>'; } busy(false); };
  bindInvTypes();
  /* 🚚 UPS 출고 — 보내는 곳 · 기본 서비스 · 기본 박스 무게 (apps-script/UPS.gs 가 settings/app.ups 를 읽음) */
  const U = Object.assign({ svc: '03', defW: 5 }, s.ups || {}), F = Object.assign({ name: 'THE ONE CORP', attn: 'SHIPPING', phone: '4078787274', addr1: '4265 CHURCH STREET', addr2: 'UNIT 1009', city: 'SANFORD', state: 'FL', zip: '32771' }, U.from || {});
  const upsCard = document.createElement('div'); upsCard.className = 'card';
  const uf = (id, lab, v, w) => '<div class="fg"' + (w ? ' style="flex:' + w + '"' : '') + '><label>' + lab + '</label><input id="' + id + '" value="' + esc(v || '') + '"></div>';
  upsCard.innerHTML = '<h2>🚚 UPS 출고 <span class="en">UPS shipping</span></h2><div class="muted">주문 → 🚚 포장 · 출고 → <b>📦 UPS 라벨 만들기</b> 를 누르면 1~2분 안에 라벨 · 트래킹이 나옵니다. 라벨은 구글 Apps Script(<b>apps-script/UPS.gs</b>, luke@ 계정)가 UPS 에서 받아 옵니다 — UPS 키는 그 스크립트의 스크립트 속성에만 있습니다.</div>' +
    '<div class="two" style="margin-top:8px">' + uf('upFName', '보내는 곳 이름', F.name) + uf('upFAttn', '담당 (Attention)', F.attn) + '</div>' +
    '<div class="two">' + uf('upFA1', '주소', F.addr1) + uf('upFA2', '주소 2 (Unit 등)', F.addr2) + '</div>' +
    '<div class="two">' + uf('upFCity', 'City', F.city) + '<div class="two">' + uf('upFSt', 'State', F.state) + uf('upFZip', 'ZIP', F.zip) + '</div></div>' +
    '<div class="two">' + uf('upFPh', '전화', F.phone) + '<div class="two"><div class="fg"><label>기본 서비스</label>' + sel('upSvcD', [['03', 'UPS Ground'], ['12', '3 Day Select'], ['02', '2nd Day Air'], ['01', 'Next Day Air']], U.svc) + '</div>' + uf('upDefW', '기본 박스 무게 lb', U.defW) + '</div></div>' +
    '<div class="two">' + uf('upAcct', 'UPS 계정 번호 (픽업 요약 인쇄용, 6자리)', U.acct) + uf('upPickT', '매일 UPS 픽업 시간 (예: 4:30 PM)', U.pickT) + '</div>' +
    '<div class="btns"><button class="b-blue" id="upSave">저장</button></div>';
  upsCard.insertAdjacentHTML('beforeend', '<div id="qvBox" style="margin-top:10px"></div>');
  $('adminBody').appendChild(upsCard);
  /* 📡 Quantum View — 다른 프로그램(직원 앱 등)에서 찍은 UPS 출고 중 앱 주문을 못 찾은 것 */
  (async () => { const box = $('qvBox'); if (!box) return; let sync = null, logs = [];
    try { sync = await S.DB.get('settings', 'upsSync'); logs = (await S.DB.list('upsLog', { where: [['orderId', '==', '']], limit: 40 })).sort((a, b) => (b.d || '') < (a.d || '') ? -1 : 1); } catch (e) { box.innerHTML = '<div class="muted">📡 UPS 출고 기록: 아직 없음 (' + esc(e.code || e.message) + ')</div>'; return; }
    box.innerHTML = '<div class="sumbox"><b>📡 UPS 계정 출고 기록 (Quantum View)</b><div class="muted">' + (sync ? '마지막 ' + esc(String(sync.at || '').substring(0, 16).replace('T', ' ')) + ' · 출고 ' + (sync.ship || 0) + ' · 주문에 붙음 ' + (sync.matched || 0) + ' · 배달 ' + (sync.deliv || 0) : '아직 받아온 적 없음 — UPS 스크립트에 UPS_QV_NAME 을 넣고 setup 을 다시 실행하세요') + '</div>' +
      (logs.length ? '<div style="margin-top:6px"><b>주문을 못 찾은 출고 ' + logs.length + '건</b> — 인보이스 · 주문 번호를 넣어 연결</div>' + logs.map(l => '<div class="pr"><div class="ct"><b>' + esc(l.store || '?') + '</b><small>' + esc(l.d || '') + ' · ' + esc(l.trk) + (l.refs ? ' · 참조 ' + esc(l.refs) : '') + '</small></div><button class="b-ghost b-sm" data-qvl="' + esc(String(l.trk).split(' ')[0]) + '">연결</button></div>').join('') : '') + '</div>';
    box.querySelectorAll('[data-qvl]').forEach(b => b.onclick = async () => { const l = logs.find(x => String(x.trk).split(' ')[0] === b.dataset.qvl); const no = (prompt('이 출고를 붙일 인보이스 번호 또는 주문 번호', '') || '').trim().toUpperCase(); if (!no) return;
      busy(true); try { let oid = ''; const inv = await getInvoice(S, no).catch(() => null); if (inv && inv.orderId) oid = inv.orderId; else if (await S.DB.get('orders', no).catch(() => null)) oid = no; if (!oid) throw new Error(no + ' 를 찾지 못했습니다');
        const o = await S.DB.get('orders', oid); const have = String(o.track || '').split(/\s+/).filter(Boolean), trks = String(l.trk).split(/\s+/).filter(t => !have.includes(t)); const patch = { track: have.concat(trks).join(' '), shipVia: 'UPS', updatedAt: new Date().toISOString() }; if (o.st === 'done') { patch.st = 'shipped'; patch.shipAt = new Date().toISOString(); patch.shipBy = S.user.email; } if (l.delivered) patch.deliveredAt = l.delivered;
        await S.DB.update('orders', oid, patch); for (const t of String(l.trk).split(/\s+/)) await S.DB.update('upsLog', t, { orderId: oid }); toast('연결 — ' + (o.store || oid), 'good'); settings(); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); });
  })();
  $('upSave').onclick = async () => { const v = id => $(id).value.trim(); const ups = { svc: $('upSvcD').value, defW: Math.max(1, num(v('upDefW')) || 5), acct: v('upAcct').toUpperCase(), pickT: v('upPickT'), from: { name: v('upFName').toUpperCase(), attn: v('upFAttn').toUpperCase(), addr1: v('upFA1').toUpperCase(), addr2: v('upFA2').toUpperCase(), city: v('upFCity').toUpperCase(), state: v('upFSt').toUpperCase(), zip: v('upFZip'), phone: v('upFPh') } };
    busy(true); try { const cur = (await S.DB.get('settings', 'app')) || {}; cur.ups = ups; await S.DB.set('settings', 'app', cur); S.settings.ups = ups; toast('🚚 UPS 설정 저장', 'good'); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  /* 📧 Daily Report 메일 상태 — apps-script/Code.gs 가 1분마다 mail:'wait' 을 보내고 'sent' / 'error' 로 바꿈 */
  const mailCard = document.createElement('div'); mailCard.className = 'card'; mailCard.innerHTML = '<h2>📧 Daily Report 메일</h2><div class="load">읽는 중…</div>'; $('adminBody').appendChild(mailCard);
  (async () => {
    let reps = []; try { reps = sortBy(await S.DB.list('reports', { where: [['d', '>=', addDaysA(today(), -10)]] }), r => r.sentAt || '', true).slice(0, 25); } catch (e) { mailCard.innerHTML = '<h2>📧 Daily Report 메일</h2><div class="alert a-red">' + esc(e.code || e.message) + '</div>'; return; }
    const st = r => r.mail === 'sent' ? '<span class="tag t-k">✓ 보냄 ' + esc(String(r.mailAt || '').substring(5, 16).replace('T', ' ')) + '</span>' : r.mail === 'error' ? '<span class="tag" style="background:#fee2e2;color:#991b1b">✕ 실패</span>' : r.mail === 'wait' ? '<span class="tag t-c">⏳ 대기</span>' : '<span class="tag t-x">— (이전 방식)</span>';
    const waitOld = reps.filter(r => r.mail === 'wait' && r.sentAt && Date.now() - Date.parse(r.sentAt) > 5 * 60000).length;
    mailCard.innerHTML = '<h2>📧 Daily Report 메일 — 최근 10일</h2><div class="muted">세일즈맨이 Daily Report 를 전송하면 1~2분 안에 예전 모양의 메일이 <b>보낸 사람</b> + <b>' + esc(s.reportTo || 'check@theonefl.com') + '</b>(위 담당자 알림 이메일, 쉼표로 여러 명)로 갑니다. 메일은 구글 Apps Script(luke@ 계정)가 보냅니다 — 설치 방법은 저장소 <b>apps-script/Code.gs</b> 맨 위.</div>' +
      (waitOld ? '<div class="alert a-amb" style="margin-top:8px">⏳ 5분 넘게 대기 중인 리포트 ' + waitOld + '건 — 메일 스크립트가 아직 설치되지 않았거나 멈췄습니다. script.google.com → THE ONE Mail → setup 실행</div>' : '') +
      (reps.length ? reps.map(r => '<div class="pr"><div class="ct"><b>' + esc(r.sm) + ' · ' + esc(r.d) + ' ' + st(r) + '</b><small>' + (r.n || 0) + '건 · ' + money(r.total || 0) + ' · ' + esc(r.mailTo || r.by || '') + (r.mailErr ? ' · <span class="warn">' + esc(r.mailErr) + '</span>' : '') + '</small></div>' + (r.rows ? '<button class="b-ghost b-sm" data-remail="' + esc(r.id) + '">↻ 다시 보내기</button>' : '') + '</div>').join('') : '<div class="none">최근 리포트가 없습니다</div>');
    mailCard.querySelectorAll('[data-remail]').forEach(b => b.onclick = async () => { busy(true); try { await S.DB.update('reports', b.dataset.remail, { mail: 'wait', mailErr: '' }); toast('1~2분 안에 다시 보냅니다', 'good'); settings(); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); });
  })();
  $('stSave').onclick = async () => { const doc = Object.assign({}, s, { discLimit: num($('stDisc').value) / 100, specialKeywords: $('stKw').value.trim(), specialTitle: $('stTitle').value.trim(), reportTo: $('stMail').value.trim(), idleMin: Math.max(0, Math.floor(num($('stIdle').value))), co: { name: $('coName').value.trim(), addr1: $('coA1').value.trim(), addr2: $('coA2').value.trim(), tel: $('coTel').value.trim(), thanks: $('coThx').value.trim() } }); busy(true); try { await S.DB.set('settings', 'app', doc); S.settings = doc; toast('저장'); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); };
}

/* ============================================================
 *  📥 가져오기 — 옛 구글 시트를 엑셀로 내려받은 파일을 그대로 올립니다
 *   · The One 수금 입력 (2026).xlsx → _ACCOUNTS → accounts · _SALESMEN → salesmen/users · _ENTRIES → entries
 *   · THE ONE 수금 (SALES).xlsx → COD 입력 → cod · 세일즈맨 탭 → entries 의 sb/rc/v/disc/note/인보이스 금액
 *   · THE ONE 커미션.xlsx → 세일즈맨 요율 · 정산 기록(settled)
 * ============================================================ */
/* ---------- 🔢 인보이스 번호 형식 통일 — A43350 · P007803 → A-043350 · P-007803 (글자 + 하이픈 + 6자리)
 *  invoices 문서 이름을 새 번호로 옮기고, 번호를 적어 둔 곳(미수금 · 수금 · COD · ACH · 주문 · 배송 · 정산 …)도 같이 바꿈.
 *  여러 번 눌러도 됨 (이미 바뀐 것은 건너뜀) ---------- */
const FMT_COLS = ['ar', 'entries', 'cod', 'ach', 'orders', 'shipments', 'shipq', 'pickups', 'invReq', 'backorders', 'settlements', 'deductions', 'reports'];
function invFmtCard() {
  const f = S.settings && S.settings.invFmt;
  return '<div class="card" style="border:2px solid ' + (f ? '#bbf7d0' : '#fcd34d') + '"><h2>🔢 ' + bt('인보이스 번호 형식 통일', 'Unify invoice number format') + '</h2><div class="muted">' +
    bt('모든 인보이스 번호를 <b>글자 + 하이픈 + 6자리</b>로 맞춥니다 — A43350 → <b>A-043350</b>, P007803 → <b>P-007803</b>, CM161 → <b>CM-000161</b>. 인보이스와, 번호를 적어 둔 미수금 · 수금 · COD · ACH · 주문 · 배송 · 정산 기록을 함께 바꿉니다. 새로 만드는 인보이스 · 새로 넣는 번호는 이미 이 형식입니다.', 'Make every invoice number letter + hyphen + 6 digits (A43350 → A-043350) — invoices and every record that mentions them.') + '</div>' +
    (f ? '<div class="alert a-grn" style="margin-top:8px">✅ ' + bt('통일했습니다', 'Done') + ' — ' + esc(String(f.at || '').substring(0, 16).replace('T', ' ')) + ' · ' + bt('인보이스', 'invoices') + ' ' + (f.inv || 0) + ' · ' + bt('기록', 'records') + ' ' + (f.rec || 0) + '</div>' : '<div class="alert a-amb" style="margin-top:8px">' + bt('아직 안 했습니다 — 한 번 눌러 주세요 (몇 분 걸릴 수 있습니다)', 'Not done yet — run once (may take a few minutes)') + '</div>') +
    '<button class="' + (f ? 'b-ghost' : 'b-blue') + '" id="fmtScan" style="margin-top:8px">🔎 ' + bt('바꿀 것 찾기', 'Scan') + (f ? ' (' + bt('다시', 'again') + ')' : '') + '</button><div id="fmtOut" class="muted" style="margin-top:6px"></div></div>';
}
async function invFmtScan() {
  const out = $('fmtOut'), say = t => { if (out) out.innerHTML = t; };
  const T = invTypes(S).map(t => t.c).concat(['CM']).filter((x, i, a) => x && a.indexOf(x) === i);
  const re = new RegExp('^(' + T.join('|') + ')[A-HJ-NP-Z]?-?\\d{1,6}$');
  const fixTok = t => re.test(t.toUpperCase()) ? invNo(t) : t;
  const fixStr = v => v.split(/([\s,;\/]+)/).map((p, i) => i % 2 ? p : fixTok(p)).join('');
  const KEY = /^(no|inv|invs|invNo|invoice|inv[A-Z]{1,2})$/;
  const walk = (v, key, top, col) => {
    if (typeof v === 'string') return key && KEY.test(key) && !(top && key === 'no' && /^(orders|shipments|shipq|pickups|backorders)$/.test(col)) ? fixStr(v) : v;
    if (Array.isArray(v)) return v.map(x => walk(x, key, false, col));
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { o[k] = walk(v[k], k, false, col); }); return o; }
    return v;
  };
  const ops = [], cnt = {};
  say(bt('인보이스 읽는 중…', 'Reading invoices…'));
  const invs = await S.DB.list('invoices'), ids = new Set(invs.map(x => x.id));
  let nInv = 0;
  for (const x of invs) {
    const id = x.id, nid = re.test(String(id).toUpperCase()) ? invNo(id) : id;
    const d = Object.assign(walk(x, '', true, 'invoices'), { id: nid, no: nid });
    if (nid !== id) { if (!ids.has(nid)) ops.push({ op: 'set', col: 'invoices', id: nid, data: d }); ops.push({ op: 'del', col: 'invoices', id }); nInv++; }
    else if (JSON.stringify(d) !== JSON.stringify(x)) { ops.push({ op: 'set', col: 'invoices', id, data: d }); nInv++; }
  }
  cnt.invoices = nInv;
  for (const c of FMT_COLS) {
    say(bt('읽는 중', 'Reading') + ' ' + c + '…');
    let L = []; try { L = await S.DB.list(c); } catch (e) { continue; }
    let n = 0; L.forEach(x => { const d = walk(x, '', true, c); if (JSON.stringify(d) !== JSON.stringify(x)) { ops.push({ op: 'set', col: c, id: x.id, data: d }); n++; } });
    if (n) cnt[c] = n;
  }
  const rec = Object.keys(cnt).filter(k => k !== 'invoices').reduce((a, k) => a + cnt[k], 0);
  if (!ops.length) { say('✅ ' + bt('바꿀 것이 없습니다 — 모두 새 형식입니다', 'Nothing to change — all in the new format')); await S.DB.update('settings', 'app', { invFmt: { at: new Date().toISOString(), inv: 0, rec: 0 } }).catch(() => {}); return; }
  say(Object.keys(cnt).map(k => '<b>' + esc(k) + '</b> ' + cnt[k]).join(' · ') + '<br><button class="b-blue" id="fmtGo" style="margin-top:6px">🔢 ' + bt('바꾸기', 'Convert') + ' (' + ops.length.toLocaleString() + ' ' + bt('번 저장', 'writes') + ')</button>');
  $('fmtGo').onclick = async () => {
    if (!(await confirmBox(bt('인보이스 ' + cnt.invoices + '장 · 기록 ' + rec + '개의 번호를 새 형식으로 바꿀까요?', 'Convert ' + cnt.invoices + ' invoices and ' + rec + ' records?'), bt('바꾸기', 'Convert')))) return;
    busy(true); let done = 0;
    try {
      for (let i = 0; i < ops.length; i += 400) { await S.DB.batch(ops.slice(i, i + 400)); done = Math.min(ops.length, i + 400); say('🔢 ' + done.toLocaleString() + ' / ' + ops.length.toLocaleString() + '…'); }
      const f = { at: new Date().toISOString(), inv: cnt.invoices, rec };
      await S.DB.update('settings', 'app', { invFmt: f }); S.settings.invFmt = f;
      dropInvCache(); dropBossCache();
      toast('🔢 ' + bt('번호 형식을 통일했습니다', 'Invoice numbers unified'), 'good'); importer();
    } catch (e) { say('<span class="warn">' + done + bt('번까지 저장하고 멈춤', ' saved, then stopped') + ': ' + esc(e.code || e.message) + ' — ' + bt('다시 누르면 남은 것만 이어서 합니다', 'run again to continue') + '</span>'); }
    busy(false);
  };
}

async function importer() {
  $('adminBody').innerHTML = anyImportCard() + '<details class="card" id="impOld"><summary><b>📥 종류별로 따로 올리기</b> <span class="muted">— 위 "파일 올리기" 하나로 다 되지만, 예전처럼 하나씩 올리려면 여기</span></summary><div id="impOldBody" style="margin-top:10px"></div></details>' + invFmtCard() + exportCard();
  $('impOldBody').innerHTML = acctImportCard() +
    '<div class="card"><h2>📥 옛 시트에서 가져오기 (하나씩)</h2><div class="muted">구글 시트를 <b>파일 → 다운로드 → Microsoft Excel</b> 로 받은 파일을 올립니다. 같은 ID 는 덮어쓰므로 여러 번 올려도 됩니다. 순서: ① 수금 입력 파일 → ② SALES 파일 → ③ 커미션 파일.</div>' +
    '<div class="fg" style="margin-top:10px"><label>① The One 수금 입력 (2026).xlsx — 거래처 · 세일즈맨 · 수금 · <b>미수금(AR 탭)</b></label><input type="file" id="f1" accept=".xlsx"></div>' +
    '<div class="fg"><label>AR 기준일 (AR 탭을 마지막으로 새로고친 날 — 비우면 오늘)</label><input type="date" id="impArD"></div>' +
    '<div class="fg"><label>② THE ONE 수금 (SALES).xlsx — COD 입력 · 세일즈맨 탭의 확인 표시</label><input type="file" id="f2" accept=".xlsx"></div>' +
    '<div class="fg"><label>③ THE ONE 커미션.xlsx — 요율 · 정산 기록</label><input type="file" id="f3" accept=".xlsx"></div>' +
    '<div id="impOut"></div></div>' +
    '<div class="card"><h2>📤 미수금(AR) 파일만 올리기</h2><div class="muted">AR 엑셀만 따로 받았을 때. ① 파일에 AR 탭이 있으면 이건 필요 없습니다.</div><div class="two" style="margin-top:8px"><input type="date" id="arD2" value="' + today() + '"><input type="file" id="arF2" accept=".xlsx,.xls,.csv"></div><div id="arOut2"></div></div>' +
    '<div class="card"><h2>⑤ sales_invoice.xlsx — 이전 시스템 인보이스 목록 (매출 · 가게별 인보이스 기록)</h2><div class="muted">이전 시스템에서 내보낸 Sales Invoice 목록(invoice · trans date · customer# · sales rep · Total · balance …). 번호가 문서 ID 라 다시 올려도 중복 없음. <b>무료 요금제는 하루 쓰기 2만 건 한도</b>가 있어 처음엔 올해만 넣고, 전년은 다음 날 넣거나 Blaze 로 올린 뒤 넣으세요.</div>' +
    '<div id="invStat" class="sumbox" style="margin-top:8px"><button class="b-ghost b-sm" id="invStatGo">📊 지금 앱에 들어 있는 인보이스 — 월별로 보기</button></div>' +
    '<div class="two" style="margin-top:8px"><div class="fg"><label>이 날짜부터 <span class="muted">(비우면 파일 전체)</span></label><input type="date" id="f5From" value=""></div><div class="fg"><label>파일</label><input type="file" id="f5" accept=".xlsx,.csv"></div></div><div id="invOut"></div></div>' +
    '<div class="card"><h2>④ THE ONE 수금 대시보드.xlsx — 공장 장부 · 1099 · 오피스 보너스 · 배분표 · 1099 대상 · 커미션 공제 · 정산 옵션</h2><div class="muted">경영 파일을 그대로 올리세요. 탭 이름(🏭 공장 이름 · 1099 2026 · 오피스 보너스 …)으로 찾고, 시트 안의 ID 를 그대로 써서 다시 올려도 두 번 쌓이지 않습니다.</div>' +
    '<div class="fg" style="margin-top:10px"><input type="file" id="f4" accept=".xlsx"></div><div id="bossOut"></div>' +
    '<details style="margin-top:6px"><summary class="muted">변환해 둔 SEED_DATA(.js) 파일로 넣기</summary><div class="btns" style="justify-content:flex-start"><button class="b-ghost" id="seedPick">📂 파일 고르기</button><button class="b-ghost" id="seedPaste">📋 붙여넣기</button><input type="file" id="seedFile" accept=".js,.json,.txt" style="display:none"></div></details></div>';
  bindExport(); bindAcctImport(S, readBook, aoa); bindAnyImport();
  if ($('invStatGo')) $('invStatGo').onclick = invStat;
  $('arF2').onchange = () => { const f = $('arF2').files[0]; if (f) arFileImport(f, $('arOut2'), $('arD2').value || today()); };
  $('seedPick').onclick = () => $('seedFile').click();
  $('seedFile').onchange = () => { const f = $('seedFile').files[0]; if (!f) return; const r = new FileReader(); r.onload = () => seedImport(r.result); r.readAsText(f); };
  $('seedPaste').onclick = () => { openModal('<h2>📋 SEED_DATA 붙여넣기</h2><textarea id="seedTxt" style="width:100%;height:200px;font-size:11px"></textarea><div class="btns"><button class="b-ghost" id="sX">취소</button><button class="b-blue" id="sOk">읽기</button></div>'); $('sX').onclick = closeModal; $('sOk').onclick = () => { const t = $('seedTxt').value; seedImport(t); }; };
  if ($('fmtScan')) $('fmtScan').onclick = () => invFmtScan().catch(e => { $('fmtOut').innerHTML = '<span class="warn">' + esc(e.code || e.message) + '</span>'; });
  $('f1').onchange = () => importMain($('f1').files[0]); $('f2').onchange = () => importSales($('f2').files[0]); $('f3').onchange = () => importComm($('f3').files[0]); $('f4').onchange = () => importBoss($('f4').files[0]); $('f5').onchange = () => importInvoices($('f5').files[0]);
}
/** 📤 AR 에이징 파일 하나 — 바로 저장 (세일즈맨별로 나눔) */
async function arFileImport(f, out, asOf) {
  out.innerHTML = '<div class="muted">읽는 중…</div>';
  try { const { XLSX, wb } = await readBook(f); const rows0 = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true }); const { rows, tail } = parseArRows(rows0); busy(true); const r = await saveAr(rows, asOf || today()); busy(false); out.innerHTML = '<div class="alert a-grn">저장 — 인보이스 ' + rows.length + '건 · ' + money(sum(rows, x => x.bal)) + ' · 가게 ' + r.stores.length + '곳 · 기준일 ' + esc(asOf || today()) + (tail ? ' · 지난번 붙여넣기 꼬리 ' + tail + '줄 뺌' : '') + (r.unmatched.length ? '<br>거래처 목록에 없는 가게: ' + r.unmatched.slice(0, 20).map(esc).join(', ') : '') + '</div>'; }
  catch (e) { busy(false); out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
}

/* ============================================================
 *  📥 파일 올리기 — 종류 자동 인식 (하나의 버튼으로 모든 가져오기)
 *    탭 이름 → 머리글 → 자리(머리글 없는 AR · 거래처 목록) 순으로 알아보고, 맞는 가져오기에 넘김
 *    여러 파일은 ① 수금 입력 → ② SALES → ③ 커미션 → ④ 대시보드 → ⑤ 인보이스 → AR → 거래처 → 아이템 … 순서로
 * ============================================================ */
const KINDS = [
  ['main', '① 수금 입력 (거래처 · 세일즈맨 · 수금 · AR 탭)'], ['sales', '② SALES (COD · 카드 · ACH · 확인 표시)'], ['comm', '③ 커미션 (요율 · 정산 기록)'], ['boss', '④ 수금 대시보드 (공장 · 1099 · 보너스)'], ['inv', '⑤ 인보이스 목록 (sales_invoice)'],
  ['facstmt', '🏭 공장 명세서 (공장별 엑셀 — Date · ITEM · FREIGHT · Amount | PAID DATE · DEPOSIT MONEY)'], ['ar', '📤 미수금(AR) 에이징'], ['acct', '📇 거래처 목록 (account list)'], ['master', '📦 Item Master 엑셀 (아이템 전체 바꾸기)'], ['sbitems', '🐝 SmartBee ALL ITEMS (새 아이템 · 가격 · 바코드 맞추기)'],
  ['sets', '🧩 세트 구성 (SET_MASTER)'], ['bulk', '📄 아이템 일괄 변경 (LEVEL_1_AND_2 · GROUP_NAME_CHANGE · TreeUpdate …)'], ['loc', '📍 창고 위치 (재고 사이트 통로)'], ['pop', '✨ 자주 나가는 아이템 (Item · Qty)'], ['seed', '🧪 SEED_DATA (.js · .json)']];
const kindName = k => (KINDS.find(x => x[0] === k) || ['', '❓ 모르는 파일 — 종류를 골라 주세요'])[1];
function anyImportCard() {
  return '<div class="card" style="border:2px solid #2563eb"><h2>📥 파일 올리기 <span class="en">Upload any file</span> <span class="muted" style="font-weight:400;font-size:12px">— 종류는 앱이 알아봅니다</span></h2>' +
    '<div class="muted">어떤 파일이든 여기 하나로 올리세요. 탭 이름 · 머리글을 보고 종류를 알아낸 뒤 맞는 자리에 넣습니다: 수금 입력 · SALES · 커미션 · 대시보드 · 인보이스 목록 · AR · 거래처 목록 · Item Master · <b>SmartBee ALL ITEMS</b> · 세트 구성 · 일괄 변경 · 창고 위치 · 자주 나가는 아이템. 여러 개를 한꺼번에 골라도 됩니다 (순서는 알아서). 바로 저장되는 종류(수금 · SALES · 커미션 · AR)는 바로 들어가고, 나머지는 미리보기 뒤 <b>적용</b>을 누릅니다.</div>' +
    '<div class="two" style="margin-top:8px"><div class="fg"><label>인보이스 목록은 이 날짜부터 <span class="muted">(비우면 파일 전체)</span></label><input type="date" id="allFrom" value=""></div><div class="fg"><label>AR 기준일 <span class="muted">(비우면 오늘)</span></label><input type="date" id="allArD"></div></div>' +
    '<label class="drop" id="anyDrop"><input type="file" id="fAny" multiple accept=".xlsx,.xls,.xlsm,.csv,.txt,.js,.json"><span>📂 <b>파일을 여기 끌어다 놓거나</b> 눌러서 고르세요</span><small>.xlsx · .csv · .js — 여러 개 가능</small></label>' +
    '<div id="anyOut"></div></div>';
}
function bindAnyImport() {
  const inp = $('fAny'), dz = $('anyDrop'); if (!inp) return;
  inp.onchange = () => { const fs = Array.from(inp.files || []); inp.value = ''; if (fs.length) importAny(fs); };
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('on'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('on'); }));
  dz.addEventListener('drop', e => { const fs = Array.from(e.dataTransfer && e.dataTransfer.files || []); if (fs.length) importAny(fs); });
}
const csvDelim = first => (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t' : ',';
/** 파일을 읽어 종류를 알아냄 → { k, why } */
export async function sniffFile(file) {
  const lower = String(file.name || '').toLowerCase();
  if (/\.(js|json)$/.test(lower)) return { k: 'seed', why: '.js / .json 파일' };
  let XLSX = null, wb, sheets = {};
  if (/\.(csv|txt)$/.test(lower)) { const text = (await file.text()).replace(/^﻿/, ''); const t = parseCsv(text, csvDelim(text.split(/\r?\n/)[0] || '')); sheets = { Sheet1: t }; wb = { SheetNames: ['Sheet1'] }; }
  else ({ XLSX, wb } = await readBook(file));
  const names = wb.SheetNames, get = n => (n in sheets ? sheets[n] : (sheets[n] = aoa(XLSX, wb, n)));
  const has = re => names.find(n => re.test(String(n).trim()));
  if (has(/^_(ENTRIES|ACCOUNTS)$/)) return { k: 'main', why: '탭 _ENTRIES · _ACCOUNTS' };
  if (names.includes('COD 입력')) return { k: 'sales', why: '탭 COD 입력' };
  if (has(/^(세일즈맨 요율|정산 기록)$/)) return { k: 'comm', why: '탭 세일즈맨 요율 · 정산 기록' };
  if (names.includes('공장') || has(/^🏭/)) return { k: 'boss', why: '탭 공장 · 🏭' };
  if (has(/세트\s*구성/)) return { k: 'sets', why: '탭 세트 구성' };
  const hdrs = n => (get(n) || []).slice(0, 10).map(r => (r || []).map(v => String(v == null ? '' : v).trim().toLowerCase()));
  const hasAll = (row, res) => res.every(re => row.some(h => h && re.test(h)));
  const hit = (n, res) => hdrs(n).some(r => hasAll(r, res));
  for (const n of names) {
    if (looksLikeStatement(get(n))) return { k: 'facstmt', why: '머리글 Date · PAID DATE · DEPOSIT MONEY — 공장 명세서 (' + (sv((get(n)[0] || [])[0]) || n) + ')' };
    if (/^(items)$/i.test(n.trim()) && hit(n, [/^code$/, /^description$/, /^price$/])) return { k: 'master', why: '탭 Items — Code · Description · Price' };
    if (hit(n, [/^category$/, /^item\s*(3|#|no\.?|code)?$|^code$|^sku$/, /^description$/, /^price$/])) return { k: 'sbitems', why: '머리글 CATEGORY · ITEM 3 · DESCRIPTION · PRICE' };
    if (hit(n, [/^(invoice|trans)\s*(#|no|3)?$/, /trans\s*date|invoice\s*date/, /^total$/])) return { k: 'inv', why: '머리글 invoice · trans date · Total' };
    if (hit(n, [/^invoice$|invoice\s*#|invoice\s*no/, /^balance/, /customer\s*#|acct|account/])) return { k: 'ar', why: '머리글 Invoice · Balance · Customer #' };
    if (hit(n, [/^set|^세트/, /^(item|code|아이템)/, /^(qty|quantity|수량)/])) return { k: 'sets', why: '머리글 SET · CODE · QTY' };
    if (hit(n, [/^(code|item ?code|item|sku|c[oó]digo|c[oó]d\.?|product ?code|상품 ?코드|아이템 ?코드|코드)$/, /^(corredor|aisle|location|loc|bin|통로|위치|창고 ?위치)$/])) return { k: 'loc', why: '머리글 코드 + 통로(Corredor · Aisle)' };
    if (hit(n, [/^(item ?code|code|코드|아이템 ?코드|sku)$/, /^(level ?1|l1|new ?code|새 ?코드|description|desc|price|group|current group ?name|new group ?name|group ?name|hide|hidden|delete|level ?2|level ?3|barcode|photo|location|loc)$/])) return { k: 'bulk', why: '머리글 ITEM CODE + LEVEL · GROUP · Description …' };
    if (hit(n, [/^(item|item ?code|item ?#|item ?no|code|코드)$/, /^(total ?qty|qty|quantity|수량|sold|판매수량)$/])) return { k: 'pop', why: '머리글 Item · Qty' };
  }
  for (const n of names) {
    const t = get(n); if (!t || t.length < 3) continue;
    try { const { rows } = parseArRows(t); if (rows.length >= 3) return { k: 'ar', why: '머리글 없는 AR (SmartBee 붙여넣기 — 자리로 읽음)' }; } catch (e) {}
    try { const r = parseAcctList(t); if (r.rows.length >= Math.max(5, Math.floor(t.length * 0.5))) return { k: 'acct', why: '거래처 목록 (계정코드 · 가게 · 주소 …)' }; } catch (e) {}
  }
  return { k: '', why: '탭 이름 · 머리글로 알 수 없음' };
}
const ORDER = KINDS.map(x => x[0]);
async function importAny(files) {
  const out = $('anyOut'); out.innerHTML = '<div class="load">파일 종류 알아보는 중… (' + files.length + '개)</div>';
  const list = [];
  for (const f of files) { let r; try { r = await sniffFile(f); } catch (e) { r = { k: '', why: '읽지 못함: ' + (e.message || e) }; } list.push({ f, k: r.k, why: r.why }); }
  const paint = () => {
    const unknown = list.filter(x => !x.k).length;
    out.innerHTML = '<div class="sumbox" style="margin-top:8px">' + list.map((x, i) => '<div class="pr" style="padding:6px 0"><div class="ct"><b>' + (x.k ? '✅ ' : '❓ ') + esc(x.f.name) + '</b><small>' + esc(x.why) + '</small></div><select data-ak="' + i + '" style="width:auto;max-width:58%;font-size:13px;padding:6px 8px">' + [['', '— 종류 고르기 —']].concat(KINDS).map(k => '<option value="' + k[0] + '"' + (x.k === k[0] ? ' selected' : '') + '>' + esc(k[1]) + '</option>').join('') + '</select></div>').join('') + '</div>' +
      (unknown ? '<div class="alert a-amb">종류를 모르는 파일 ' + unknown + '개 — 목록에서 골라 주세요. 그래도 모르는 파일이면 건너뜁니다.</div>' : '') +
      '<div class="btns" style="justify-content:flex-start"><button class="b-blue" id="anyGo" style="width:auto">▶ ' + (list.length > 1 ? '순서대로 ' : '') + '넣기</button><button class="b-ghost" id="anyX" style="width:auto">취소</button></div><div id="anyLog"></div>';
    out.querySelectorAll('[data-ak]').forEach(s => s.onchange = () => { list[+s.dataset.ak].k = s.value; });
    $('anyX').onclick = () => { out.innerHTML = ''; };
    $('anyGo').onclick = run;
  };
  const run = async () => {
    out.querySelectorAll('select,button').forEach(el => el.disabled = true);
    const log = $('anyLog');
    if ($('impArD') && $('allArD').value) $('impArD').value = $('allArD').value; if ($('f5From')) $('f5From').value = $('allFrom').value;
    const todo = list.filter(x => x.k).sort((a, b) => ORDER.indexOf(a.k) - ORDER.indexOf(b.k));
    for (const x of todo) {
      const sec = document.createElement('div'); sec.className = 'sumbox'; sec.style.marginTop = '8px';
      sec.innerHTML = '<div style="margin-bottom:4px"><b>▶ ' + esc(x.f.name) + '</b> <span class="muted">→ ' + esc(kindName(x.k)) + '</span></div><div class="anyBody"></div>';
      log.appendChild(sec); const body = sec.querySelector('.anyBody');
      try { await runKind(x.k, x.f, body); }
      catch (e) { body.innerHTML = '<div class="alert a-red">실패: ' + esc(e.code || e.message || String(e)) + '</div>'; }
    }
    const skipped = list.length - todo.length;
    log.insertAdjacentHTML('beforeend', '<div class="alert a-grn">끝. ' + todo.length + '개 처리' + (skipped ? ' · 종류 모름 ' + skipped + '개 건너뜀' : '') + ' — 미리보기가 있는 것은 각각 <b>적용</b>을 눌러야 저장됩니다. 메뉴 → 🔎 연결 · 권한 점검의 📊 서버 자료 건수로 확인하세요.</div>');
  };
  paint();
  if (list.length && list.every(x => x.k)) run();   // 다 알아봤으면 바로 시작
}
/** 종류별로 맞는 가져오기 — out 안에 결과 · 미리보기를 그림 */
async function runKind(k, f, out) {
  const stay = () => {};   // 미리보기 적용 뒤 화면을 바꾸지 않음 (📥 가져오기 탭에 그대로)
  const asOf = ($('allArD') && $('allArD').value) || today(), fromD = ($('allFrom') && $('allFrom').value) || '';
  if (k === 'main') { OUT = out; try { await importMain(f); } finally { OUT = null; } }
  else if (k === 'sales') { OUT = out; try { await importSales(f); } finally { OUT = null; } }
  else if (k === 'comm') { OUT = out; try { await importComm(f); } finally { OUT = null; } }
  else if (k === 'boss') await importBoss(f, out);
  else if (k === 'facstmt') await factoryStatementFile(f, out);
  else if (k === 'inv') await importInvoices(f, false, out, fromD);
  else if (k === 'ar') await arFileImport(f, out, asOf);
  else if (k === 'acct') await acctFile(S, f, out, readBook, aoa);
  else if (k === 'master') await itemMasterFile(f, out, stay);
  else if (k === 'sbitems') await smartbeeFile(f, out, stay);
  else if (k === 'sets') await setBookFile(f, out, 'new', stay);
  else if (k === 'bulk') await bulkFile(f, out, stay);
  else if (k === 'loc') await locFileImport(f, out, stay);
  else if (k === 'pop') await popFileImport(f, out, stay);
  else if (k === 'seed') { const t = await f.text(); out.innerHTML = '<div class="muted">SEED_DATA 읽는 중…</div>'; seedImport(t); }
  else throw new Error('모르는 종류');
}
async function loadXlsx() { if (window.XLSX) return window.XLSX; await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); return window.XLSX; }
async function readBook(file) { const XLSX = await loadXlsx(); const buf = await file.arrayBuffer(); return { XLSX, wb: XLSX.read(buf, { type: 'array', cellDates: true }) }; }
function aoa(XLSX, wb, name) { const ws = wb.Sheets[name]; if (!ws) return null; return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }); }
function dstr(v) { if (v instanceof Date) { const d = new Date(v.getTime() - v.getTimezoneOffset() * 60000); return d.toISOString().substring(0, 10); } const s = String(v || '').trim(); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10); if (typeof v === 'number' && v > 30000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return d.toISOString().substring(0, 10); }   /* 엑셀 날짜 숫자 */
  const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/); if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0'); return ''; }
function hdrIdx(row, names) { const idx = {}; row = row.map(x => String(x || '').trim()); Object.keys(names).forEach(k => { const j = row.findIndex(h => names[k].test(h)); idx[k] = j; }); return idx; }
let OUT = null;   // 📥 파일 올리기(자동 인식)에서 부를 때는 그 파일의 칸에 적음
const outEl = () => OUT || $('impOut');
const say = (h) => { outEl().insertAdjacentHTML('beforeend', '<div class="alert a-blu">' + h + '</div>'); };

export function parseEntriesSheet(rows) {
  /* _ENTRIES 22칸 (ID, 입력시각, 세일즈맨, 이메일, 가게, 계정, 주소, Pay Type, Check#, 금액, 메모, Deposit, 신규, 리포트, 상태, Post, Invoices, 받은날짜, 모바일, 보관, 대체, 원래체크) */
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || !r[0]) continue;
    const st = String(r[14] || '').toUpperCase(); if (st === 'VOID') continue;
    const d = dstr(r[17]) || dstr(r[1]); if (!d) continue;
    const pay = String(r[7] || '').toUpperCase(), amt = R2(num(r[9]));
    const m = /CASH/.test(pay) ? 'CASH' : /ZELLE/.test(pay) ? 'ZELLE' : 'CHECK';
    const invs = [];
    String(r[16] || '').split('|').forEach(tok => { tok = tok.trim(); if (!tok) return; const mm = tok.match(/^([^:]+):(.+)$/); if (!mm) return; const nos = mm[1].split(/[\s,]+/).filter(Boolean), a = R2(num(mm[2])); nos.forEach((no, j) => invs.push({ no: invNo(no), t: invType(no), amt: j === 0 ? a : 0 })); });
    out.push({ id: String(r[0]).trim(), d, ym: ym(d), sm: String(r[2] || '').trim().toUpperCase(), acct: pad4(r[5]), store: String(r[4] || '').trim(), addr: String(r[6] || '').trim(), newStore: /^Y/i.test(String(r[12] || '')),
      pays: [{ m, ref: String(r[8] || '').trim(), amt, dep: dstr(r[11]), mob: /^Y/i.test(String(r[18] || '')) }], invs, total: amt, invTotal: sum(invs, v => v.amt), mismatch: '', memo: String(r[10] || '').trim(),
      repl: /^Y/i.test(String(r[20] || '')), orig: String(r[21] || '').trim(), disc: '', sb: false, rc: false, v: false, vn: '', settled: '', void: false, createdBy: String(r[3] || '').trim().toLowerCase(), createdAt: dstr(r[1]), imported: true });
  }
  return out;
}
async function importMain(file) {
  if (!file) return; busy(true); outEl().innerHTML = '';
  try {
    const { XLSX, wb } = await readBook(file);
    const acc = aoa(XLSX, wb, '_ACCOUNTS'), smv = aoa(XLSX, wb, '_SALESMEN'), ent = aoa(XLSX, wb, '_ENTRIES');
    const arName = wb.SheetNames.find(n => /^_?AR\b/i.test(n.trim())), ar = arName ? aoa(XLSX, wb, arName) : null;
    const ops = [];
    if (acc) { for (let i = 1; i < acc.length; i++) { const r = acc[i]; const code = pad4(r[0]); if (!code || !r[1]) continue; ops.push({ op: 'set', col: 'accounts', id: code, data: { acct: code, store: String(r[1]).trim(), addr: String(r[2] || '').trim(), city: String(r[3] || '').trim(), state: String(r[4] || '').trim(), zip: String(r[5] || '').trim(), tel: String(r[6] || '').trim(), sm: String(r[7] || '').trim().toUpperCase(), note: String(r[8] || '').trim() } }); } say('거래처 ' + ops.length + '곳'); }
    let nS = 0;
    if (smv) { for (let i = 1; i < smv.length; i++) { const r = smv[i]; const name = String(r[1] || '').trim().toUpperCase(), email = String(r[0] || '').trim().toLowerCase(); if (!name) continue; const active = !/^N/i.test(String(r[2] || 'Y')); ops.push({ op: 'set', col: 'salesmen', id: name, data: Object.assign({ code: name, name, email, active, rates: RATE_DEFAULT }, S.smByCode[name] || {}, { active }) }); if (email) ops.push({ op: 'set', col: 'users', id: email, data: Object.assign({ email, name, role: 'salesman', sm: name, active, createdAt: today() }, {}) }); nS++; } say('세일즈맨 ' + nS + '명 (이메일 있는 사람은 사용자에도 등록)'); }
    let nE = 0;
    if (ent) { const list = parseEntriesSheet(ent); list.forEach(e => ops.push({ op: 'set', col: 'entries', id: e.id, data: e })); nE = list.length; say('수금 ' + nE + '건 (VOID 제외) · 합계 ' + money(sum(list, e => e.total))); }
    await S.DB.batch(ops);
    if (acc) await bumpAccountsVer();
    dropBossCache();
    if (ar) { try { const { rows } = parseArRows(ar); const asOf = $('impArD') && $('impArD').value ? $('impArD').value : today(); const r = await saveAr(rows, asOf); say('미수금(AR) 탭 "' + esc(arName) + '": 인보이스 ' + rows.length + '건 · ' + money(sum(rows, x => x.bal)) + ' · 가게 ' + r.stores.length + '곳 · 기준일 ' + asOf + (r.unmatched.length ? ' · 거래처 목록에 없는 가게 ' + r.unmatched.length : '')); } catch (e) { say('<span class="warn">AR 탭을 읽지 못했습니다: ' + esc(e.message) + '</span>'); } }
    S.sms = await S.DB.list('salesmen', { order: ['code', 'asc'] }); S.smByCode = {}; S.sms.forEach(x => { S.smByCode[x.code] = x; });
    say('<b>저장 완료</b> — 다음은 ② SALES 파일');
  } catch (e) { outEl().insertAdjacentHTML('beforeend', '<div class="alert a-red">' + esc(e.message) + '</div>'); }
  busy(false);
}
/** SALES 파일: COD 입력 탭 + 세일즈맨 탭들(머리글 이름으로 찾음) */
async function importSales(file) {
  if (!file) return; busy(true); outEl().innerHTML = '';
  try {
    const { XLSX, wb } = await readBook(file);
    const ops = []; let nC = 0, nF = 0, missing = 0, nShift = 0;
    const cod = aoa(XLSX, wb, 'COD 입력');
    if (cod) {
      const H = hdrIdx(cod[0], { sm: /세일즈맨/, d: /날짜/, acct: /계정코드/, store: /가게/, method: /결제 방법/, ref: /참조/, amt: /^금액/, invA: /^A 인보이스/, amtA: /^A 금액/, invP: /^P 인보이스/, amtP: /^P 금액/, invCM: /^CM 인보이스/, amtCM: /^CM 금액/, invW: /^W 인보이스/, amtW: /^W 금액/, disc: /디스카운트/, note: /^메모/, id: /^ID$/, v: /정산 확인/, vn: /확인 메모/ });

      for (let i = 1; i < cod.length; i++) { const r0 = cod[i] || [];
        /* 칸 밀린 옛 줄 (대시보드 b21 과 같은 규칙): ID 칸이 비고 "디스카운트 %" 칸에 D######-… → 그게 ID, "W 인보이스" 칸의 10% 가 디스카운트 */
        const shifted = !String(r0[H.id] || '').trim() && H.disc >= 0 && /^D\d{6}-/.test(String(r0[H.disc] || '').trim());
        const r = shifted ? Object.assign([], r0, { [H.id]: r0[H.disc], [H.disc]: r0[H.invW], [H.invW]: '' }) : r0; if (shifted) nShift++;
        const d = dstr(r[H.d]); if (!d || !r[H.sm]) continue; const invs = []; ['A', 'P', 'CM', 'W'].forEach(t => { const no = invNo(r[H['inv' + t]]), a = R2(num(r[H['amt' + t]])); if (no) no.split(/[\s,]+/).filter(Boolean).forEach((x, j) => invs.push({ no: x, t, amt: j === 0 ? a : 0 })); });
        const id = String(r[H.id] || '').trim() || newId('C'); const method = String(r[H.method] || 'COD').trim().toUpperCase();
        ops.push({ op: 'set', col: 'cod', id, data: { id, d, ym: ym(d), sm: String(r[H.sm]).trim().toUpperCase(), acct: pad4(r[H.acct]), store: String(r[H.store] || '').trim(), method: /CARD|CREDIT/.test(method) ? 'CREDIT CARD' : /ACH/.test(method) ? 'ACH' : 'COD', ref: String(r[H.ref] || '').trim(), amt: R2(num(r[H.amt])), invs, disc: r[H.disc] === '' ? '' : num(r[H.disc]) * (num(r[H.disc]) <= 1 ? 100 : 1), note: String(r[H.note] || '').trim(), v: r[H.v] === true || /TRUE/i.test(String(r[H.v])), vn: String(r[H.vn] || '').trim(), settled: '', void: false, imported: true } }); nC++; }
    }
    const ents = {}; (await S.DB.list('entries', { where: [['imported', '==', true]] })).forEach(e => { ents[e.id] = e; });
    wb.SheetNames.forEach(name => {
      if (/^(COD 입력|설정|_)/.test(name) || !/^[A-Z][A-Z ]*$/.test(name)) return;
      const t = aoa(XLSX, wb, name); if (!t || t.length < 2) return;
      const H = hdrIdx(t[0], { sb: /SmartBee/, rc: /체크 수령/, disc: /디스카운트/, note: /담당자 메모/, id: /^ID$/, v: /정산 확인/, vn: /확인 메모/, comm: /커미션 정산/, amtA: /^A 금액/, amtP: /^P 금액/, amtW: /^W 금액/, amtCM: /^CM 금액/, invA: /^A 인보이스/, invP: /^P 인보이스/, invW: /^W 인보이스/, invCM: /^CM 인보이스/ });
      if (H.id < 0) return;
      for (let i = 1; i < t.length; i++) { const r = t[i]; const id = String(r[H.id] || '').trim().split('@')[0]; if (!id) continue; const e = ents[id]; if (!e) { missing++; continue; }
        const tv = v => v === true || /TRUE/i.test(String(v));
        const patch = { sb: tv(r[H.sb]), rc: tv(r[H.rc]), v: tv(r[H.v]), vn: String(r[H.vn] || '').trim(), disc: H.disc >= 0 && r[H.disc] !== '' ? num(r[H.disc]) * (num(r[H.disc]) <= 1 ? 100 : 1) : '', settled: H.comm >= 0 && r[H.comm] ? 'sheet:' + dstr(r[H.comm]) : '' };
        if (!(e.invs || []).length) { const invs = []; ['A', 'P', 'CM', 'W'].forEach(tt => { const no = invNo(r[H['inv' + tt]]), a = R2(num(r[H['amt' + tt]])); if (no) no.split(/[\s,]+/).filter(Boolean).forEach((x, j) => invs.push({ no: x, t: tt, amt: j === 0 ? a : 0 })); }); if (invs.length) { patch.invs = invs; patch.invTotal = sum(invs, v => v.amt); } }
        if (!e._p) { e._p = patch; nF++; } else Object.assign(e._p, patch); }
    });
    Object.values(ents).forEach(e => { if (e._p) ops.push({ op: 'update', col: 'entries', id: e.id, data: e._p }); });
    await S.DB.batch(ops);
    dropBossCache();
    say('COD·카드·ACH ' + nC + '건' + (nShift ? ' (칸 밀린 옛 줄 ' + nShift + '건 바로잡음)' : '') + ' · 세일즈맨 탭 확인 표시 ' + nF + '건 반영' + (missing ? ' · 수금 파일에 없는 ID ' + missing + '건 건너뜀' : '') + '<br><b>저장 완료</b> — 다음은 ③ 커미션 파일');
  } catch (e) { outEl().insertAdjacentHTML('beforeend', '<div class="alert a-red">' + esc(e.message) + '</div>'); }
  busy(false);
}
/** 📊 앱에 들어 있는 인보이스 — 2024-01 부터 달마다 몇 장인지 (개수만 세서 빠름). 빈 달 = 아직 안 올라간 달 */
async function invStat() {
  const box = $('invStat'); box.innerHTML = '<div class="load">세는 중…</div>';
  const yms = []; for (let y = 2024, m = 1; y * 100 + m <= Number(today().substring(0, 4)) * 100 + Number(today().substring(5, 7)); m === 12 ? (y++, m = 1) : m++) yms.push(y + '-' + String(m).padStart(2, '0'));
  try {
    const n = await Promise.all(yms.map(k => S.DB.count('invoices', { where: [['ym', '==', k]] })));
    const tot = n.reduce((a, b) => a + b, 0), empty = yms.filter((k, i) => !n[i]);
    box.innerHTML = '<button class="b-ghost b-sm" id="invStatGo" style="float:right">↻</button><b>📊 지금 앱에 있는 인보이스 ' + tot.toLocaleString() + '장</b>' + (empty.length ? ' · <span class="warn">비어 있는 달 ' + empty.length + '개: ' + esc(empty.join(', ')) + '</span>' : ' · 빈 달 없음 ✓') +
      '<div class="invstat">' + yms.map((k, i) => '<span class="' + (n[i] ? '' : 'z') + '"><small>' + k + '</small><b>' + n[i].toLocaleString() + '</b></span>').join('') + '</div>' +
      '<div class="muted">이전 시스템 sales_invoice 는 보통 한 달에 900 ~ 1,300장입니다. 빈 달 · 적은 달이 있으면 아래에 sales_invoice 파일을 (날짜 칸은 비워 두고) 다시 올리세요 — 같은 번호는 덮어써서 두 번 쌓이지 않습니다.</div>';
    $('invStatGo').onclick = invStat;
  } catch (e) { box.innerHTML = '<div class="alert a-red">' + esc(e.code || e.message) + '</div>'; }
}
/* ⑤ 이전 시스템 인보이스 목록 — 머리글 이름으로 열을 찾음 */
export function parseInvoiceList(aoa, fromD) {
  let hi = -1, ix = {};
  /* 이전 시스템 내보내기마다 머리글이 조금씩 다름 — sales_invoice(invoice · customer# · customer name) · invoice_list(trans # → "trans 3", cusomer # → "cusomer 3", name, slaes order) */
  const want = { no: /^(invoice|trans)\s*(#|no|3)?$/i, d: /trans\s*date|invoice\s*date|^date$/i, type: /^type$/i, acct: /^cus\w*mer\s*(#|3|no)?$|acct|account/i, store: /customer\s*name|store|^name$/i, sm: /sales?\s*rep|rep/i, terms: /^terms?$/i, via: /ship\s*via/i, frt: /freight|s\s*&\s*h/i, disc: /^discount/i, total: /^total$/i, bal: /^balance/i, so: /s[a-z]*\s*order|^s\.?o\.?$/i };
  for (let r = 0; r < Math.min(aoa.length, 8) && hi < 0; r++) { const row = aoa[r].map(x => String(x == null ? '' : x).trim()); const m = {}; Object.keys(want).forEach(k => { const c = row.findIndex(h => h && want[k].test(h)); if (c >= 0) m[k] = c; }); if (m.no != null && m.d != null && m.total != null) { hi = r; ix = m; } }
  if (hi < 0) throw new Error('머리글(invoice · trans date · Total)을 못 찾았습니다');
  const out = [], seen = {}; let skipped = 0, old = 0;
  for (let r = hi + 1; r < aoa.length; r++) {
    const row = aoa[r]; if (!row) continue;
    const no = invNo(row[ix.no]); if (!no) continue;
    const d = dstr(row[ix.d]); if (!d) { skipped++; continue; }
    if (fromD && d < fromD) { old++; continue; }
    if (seen[no]) { skipped++; continue; } seen[no] = 1;
    const total = R2(num(row[ix.total])), frt = ix.frt != null ? R2(num(row[ix.frt])) : 0, discAmt = ix.disc != null ? R2(num(row[ix.disc])) : 0, bal = ix.bal != null ? R2(num(row[ix.bal])) : 0;
    const t = (no.match(/^[A-Z]+/) || ['A'])[0].replace(/^CM$/, 'CM');
    out.push({ id: no, no, t: t.length > 2 ? t.charAt(0) : t, d, ym: d.substring(0, 7), acct: ix.acct != null ? pad4(row[ix.acct]) : '', store: String(row[ix.store] || '').trim(), sm: String(row[ix.sm] || '').trim().toUpperCase(), terms: String(row[ix.terms] || '').trim(), shipVia: String(row[ix.via] || '').trim(),
      ship: frt, discAmt, sub: R2(total - frt + discAmt), disc: 0, total: R2(total - frt), bal, st: bal > 0.005 ? 'open' : 'paid', order: ix.so != null ? String(row[ix.so] || '').trim() : '', qty: 0, lines: [], src: 'legacy' });
  }
  return { rows: out, skipped, old, hasBal: ix.bal != null };
}
async function importInvoices(file, auto, outBox, fromD) {
  if (!file) return; const out = outBox || $('invOut'); out.innerHTML = '<div class="muted">읽는 중…</div>';
  try {
    const { XLSX, wb } = await readBook(file);
    const sheet = aoa(XLSX, wb, wb.SheetNames[0]);
    const P = parseInvoiceList(sheet, fromD != null ? fromD : (($('f5From') && $('f5From').value) || '')), { skipped, old } = P;
    /* 이미 있는 인보이스 — 앱에서 만든 것(줄 · 픽킹 기록 있음)은 건드리지 않음. 잔액 열이 없는 파일이면 있던 잔액 · 상태는 그대로 */
    const ds = P.rows.map(r => r.d).sort(), ex = {};
    if (ds.length) (await S.DB.list('invoices', { where: [['d', '>=', ds[0]], ['d', '<=', ds[ds.length - 1]]] })).forEach(v => { ex[invNo(v.id || v.no)] = v; });   // 옛 번호 모양(A43350)도 같은 인보이스로
    const appMade = P.rows.filter(r => ex[r.id] && ex[r.id].src !== 'legacy'), rows = P.rows.filter(r => !(ex[r.id] && ex[r.id].src !== 'legacy'));
    const nNew = rows.filter(r => !ex[r.id]).length;
    if (!P.hasBal) rows.forEach(r => { if (ex[r.id]) { delete r.bal; delete r.st; } else { r.bal = 0; r.st = 'paid'; } });
    const byY = {}; rows.forEach(r => { const y = r.d.substring(0, 4); byY[y] = byY[y] || { n: 0, amt: 0 }; byY[y].n++; byY[y].amt = R2(byY[y].amt + r.total); });
    out.innerHTML = '<div class="alert a-blu">인보이스 <b>' + rows.length.toLocaleString() + '</b>장 (새로 ' + nNew.toLocaleString() + ' · 이미 있음 ' + (rows.length - nNew).toLocaleString() + ') · 매출 ' + money(sum(rows, r => r.total)) + (P.hasBal ? ' · 잔액 ' + money(sum(rows, r => r.bal || 0)) : ' · 잔액 열 없음 (미수금은 AR 파일 기준)') + (appMade.length ? '<br>앱에서 발행한 인보이스 ' + appMade.length + '장은 그대로 둠: ' + esc(appMade.slice(0, 8).map(r => r.no).join(', ')) : '') + (old ? ' · 시작일 전 ' + old.toLocaleString() + '장 제외' : '') + (skipped ? ' · 건너뜀 ' + skipped : '') + '<br>' + Object.keys(byY).sort().map(y => y + ': ' + byY[y].n.toLocaleString() + '장 ' + money(byY[y].amt)).join(' · ') + '</div>' +
      (rows.length > 18000 ? '<div class="alert a-amb">1만 8천 장이 넘습니다 — 무료 요금제면 하루 한도에 걸릴 수 있습니다. 시작일을 올리거나 Blaze 로 바꾼 뒤 넣으세요.</div>' : '') +
      '<button class="b-blue" id="invGo">넣기</button><div id="invProg" class="muted" style="margin-top:6px"></div>';
    const run = async () => {
      busy(true); const prog = $('invProg'); let done = 0;
      try {
        const now = new Date().toISOString();
        for (let i = 0; i < rows.length; i += 400) { const part = rows.slice(i, i + 400); await S.DB.batch([].concat(...part.map(r => ex[r.id] && (ex[r.id].id || ex[r.id].no) !== r.id ? [{ op: 'set', col: 'invoices', id: r.id, data: Object.assign({}, ex[r.id], r, { id: r.id, no: r.id, importedAt: now }) }, { op: 'del', col: 'invoices', id: ex[r.id].id || ex[r.id].no }] : [ex[r.id] ? { op: 'update', col: 'invoices', id: r.id, data: Object.assign({}, r, { importedAt: now }) } : { op: 'set', col: 'invoices', id: r.id, data: Object.assign({}, r, { createdAt: now, importedAt: now }) }]))); done += part.length; prog.textContent = done.toLocaleString() + ' / ' + rows.length.toLocaleString() + ' 저장 중…'; }
        dropInvCache(); dropBossCache();
        prog.textContent = '월별 매출 요약 계산 중…'; try { await rebuildSalesM(S, rows.map(r => r.ym)); } catch (e) {}
        out.insertAdjacentHTML('beforeend', '<div class="alert a-grn">넣었습니다 — ' + done.toLocaleString() + '장. 현황 · 리포트 · 가게 창에 바로 보입니다.</div>'); toast('인보이스 ' + done.toLocaleString() + '장', 'good');
      } catch (e) { out.insertAdjacentHTML('beforeend', '<div class="alert a-red">' + done.toLocaleString() + '장까지 넣고 멈춤: ' + esc(e.code || e.message) + (/resource-exhausted|quota/i.test(e.code || e.message) ? ' — 하루 쓰기 한도입니다. 내일 같은 파일을 다시 올리면 이어서 들어갑니다(중복 없음).' : '') + '</div>'); }
      busy(false);
    };
    $('invGo').onclick = run; if (auto) await run();
  } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
}
/* ④ 수금 대시보드 파일 — 경영 자료 전부 */
const dcell = v => dstr(v) || '';
const sv = v => String(v == null ? '' : v).trim();
export function parseBossBook(XLSX, wb) {
  const out = { fac: [], inv: [], pay: [], acc: [], dist: [], split: [], payees: [], ded: [], dedHist: [], opts: [], years: [], warn: [] };
  const get = n => aoa(XLSX, wb, n);
  /* 공장 */
  const fac = get('공장'); if (fac) for (let i = 1; i < fac.length; i++) { const code = sv(fac[i][0]).toUpperCase(); if (code) out.fac.push({ code, name: sv(fac[i][1]) || code, note: sv(fac[i][2]) }); }
  const codeOfName = nm => { const f = out.fac.find(x => x.name.toUpperCase() === nm.toUpperCase()); return f ? f.code : ''; };
  /* 🏭 장부 — 5행 머리글: 날짜 구분 물품 운임 운임% 합계 메모 ID | 송금일 금액 메모 ID */
  wb.SheetNames.filter(n => n.indexOf('🏭') === 0).forEach(n => {
    const nm = n.replace('🏭', '').trim(), code = codeOfName(nm) || nm.split(' ')[0].substring(0, 4).toUpperCase(), r = get(n);
    if (!codeOfName(nm)) out.fac.push({ code, name: nm, note: '' });
    let hi = r.findIndex(row => sv(row[0]) === '날짜'); if (hi < 0) { out.warn.push(n + ': 머리글 없음'); return; }
    const hd = r[hi].map(sv), ci = hd.indexOf('ID'), pj = hd.indexOf('송금일'), pid = hd.lastIndexOf('ID');
    for (let i = hi + 1; i < r.length; i++) {
      const row = r[i]; if (!row) continue;
      const d = dcell(row[0]), id = sv(row[ci]);
      if (d && id) out.inv.push({ id, f: code, d, type: sv(row[1]) || '인보이스', item: R2(num(row[2])), frt: R2(num(row[3])), amt: R2(num(row[5])), note: sv(row[6]) });
      if (pj >= 0) { const pd = dcell(row[pj]), pi2 = sv(row[pid]); if (pd && pi2 && pid !== ci) out.pay.push({ id: pi2, f: code, d: pd, amt: R2(num(row[pj + 1])), note: sv(row[pj + 2]) }); }
    }
  });
  /* 오피스 보너스 — 적립 | 지급 */
  const ob = get('오피스 보너스'); if (ob) { const hi = ob.findIndex(row => sv(row[0]) === '날짜'); if (hi >= 0) { const hd = ob[hi].map(sv), pj = hd.indexOf('지급일'), rounds = {};
    for (let i = hi + 1; i < ob.length; i++) { const row = ob[i]; if (!row) continue; const d = dcell(row[0]), id = sv(row[5]); if (d && id) out.acc.push({ id, d, sm: sv(row[1]).toUpperCase(), amt: R2(num(row[2])), src: sv(row[3]) || '엑셀', note: sv(row[4]) });
      if (pj >= 0) { const pd = dcell(row[pj]); if (pd) { const k = pd + '|' + sv(row[pj + 4]); (rounds[k] = rounds[k] || { d: pd, round: sv(row[pj + 4]), rows: [], id: sv(row[pj + 5]) }).rows.push({ who: sv(row[pj + 1]).toUpperCase(), amt: R2(num(row[pj + 2])), pct: num(row[pj + 3]) }); } } }
    Object.values(rounds).forEach(r => { out.dist.push({ id: r.id || ('BDX' + r.d.replace(/-/g, '') + (r.round || '').replace(/\W/g, '')), d: r.d, round: r.round, rows: r.rows, n: r.rows.length, sum: R2(r.rows.reduce((a, x) => a + x.amt, 0)) }); }); } }
  /* 배분표 */
  const sp = get('보너스 배분표'); if (sp) for (let i = 1; i < sp.length; i++) { const who = sv(sp[i][2]).toUpperCase(); if (who) out.split.push({ grp: sv(sp[i][0]) || 'A', share: num(sp[i][1]) || 100, who, pct: num(sp[i][3]) }); }
  /* 1099 대상 */
  const pz = get('1099 대상'); if (pz) for (let i = 1; i < pz.length; i++) { const who = sv(pz[i][0]).toUpperCase(); if (who) out.payees.push({ who, co: sv(pz[i][1]), kind: sv(pz[i][2]) || '고정', cycle: sv(pz[i][3]), officePct: num(pz[i][4]), active: !/^N/i.test(sv(pz[i][5]) || 'Y'), note: sv(pz[i][6]) }); }
  /* 1099 YYYY — 2행 이름(짝수 열), 3행 회사, 6행부터 (왼쪽 칸 날짜 · 그 칸 금액) */
  wb.SheetNames.filter(n => /^1099\s+\d{4}$/.test(n.trim())).forEach(n => {
    const y = n.trim().split(/\s+/)[1], r = get(n); if (!r || r.length < 3) return; out.years.push(y);
    const names = r[1].map(sv), cos = (r[2] || []).map(sv), seq = {};
    for (let j = 2; j < names.length; j++) { const who = names[j].toUpperCase(); if (!who || who === 'DATE') continue;
      for (let i = 5; i < r.length; i++) { const row = r[i]; if (!row) continue; const d = dcell(row[j - 1]), amt = num(row[j]); if (!d || !amt) continue; const k = who + d; seq[k] = (seq[k] || 0) + 1; out.payees.find(p => p.who === who) || out.payees.push({ who, co: cos[j] || '', kind: '고정', cycle: '', officePct: 0, active: true, note: '' });
        out.inv99 = out.inv99 || []; out.inv99.push({ id: 'X99-' + y + '-' + who.replace(/\W/g, '') + '-' + d.replace(/-/g, '') + (seq[k] > 1 ? '-' + seq[k] : ''), d, who, co: cos[j] || '', amt: R2(amt), note: '엑셀 ' + y }); } }
  });
  /* 커미션 공제 · 공제 기록 */
  const dd = get('커미션 공제'); if (dd) for (let i = 1; i < dd.length; i++) { const id = sv(dd[i][0]); if (!id) continue; out.ded.push({ id, sm: sv(dd[i][1]).toUpperCase(), acct: sv(dd[i][2]), store: sv(dd[i][3]), why: sv(dd[i][4]) || '기타', total: R2(num(dd[i][5])), per: R2(num(dd[i][6])) || R2(num(dd[i][5])), start: dcell(dd[i][7]) || today(), st: sv(dd[i][8]), note: sv(dd[i][9]), invs: sv(dd[i][10]) }); }
  const dh = get('공제 기록'); if (dh) for (let i = 1; i < dh.length; i++) { const id = sv(dh[i][2]); if (!id) continue; out.dedHist.push({ id, d: dcell(dh[i][0]), amt: R2(num(dh[i][4])), ref: sv(dh[i][5]) }); }
  /* b21: 정산 미룸(다음 정산으로 넘긴 줄) · 정산 제외(종이 정산 등 이미 지급 — 정산 화면에서 뺌): 1칸 ID · 6칸 날짜 */
  out.defer = []; out.excl = [];
  [['정산 미룸', 'defer'], ['정산 제외', 'excl']].forEach(([n, k]) => { const t = get(n); if (t) for (let i = 1; i < t.length; i++) { const r = t[i] || []; const id = sv(r[0]); if (id) out[k].push({ id, d: dcell(r[5]) || today() }); } });
  /* 세일즈맨 정산 옵션 */
  const so = get('세일즈맨 정산 옵션'); if (so) for (let i = 1; i < so.length; i++) { const sm = sv(so[i][0]).toUpperCase(); if (sm) out.opts.push({ sm, cashKeep: /^Y/i.test(sv(so[i][1])), defaultPer: R2(num(so[i][2])) }); }
  return out;
}
async function importBoss(file, outBox) {
  if (!file) return; const out = outBox || $('bossOut'); out.innerHTML = '<div class="muted">읽는 중…</div>';
  try {
    const { XLSX, wb } = await readBook(file);
    const P = parseBossBook(XLSX, wb), n99 = (P.inv99 || []).length;
    out.innerHTML = '<div class="alert a-blu">공장 ' + P.fac.length + ' · 공장 인보이스 ' + P.inv.length + '줄 ' + money(sum(P.inv, x => x.amt)) + ' · 송금 ' + P.pay.length + '줄 ' + money(sum(P.pay, x => x.amt)) + '<br>1099 지급 ' + n99 + '줄 (' + P.years.join(', ') + ') · 1099 대상 ' + P.payees.length + '명 · 보너스 적립 ' + P.acc.length + ' · 배분 ' + P.dist.length + '회 · 배분표 ' + P.split.length + '줄<br>커미션 공제 ' + P.ded.length + ' · 공제 기록 ' + P.dedHist.length + ' · 정산 옵션 ' + P.opts.length + (P.warn.length ? '<br><span class="warn">' + P.warn.map(esc).join(' · ') + '</span>' : '') + '</div><button class="b-blue" id="bossGo">넣기</button>';
    $('bossGo').onclick = async () => {
      busy(true);
      try {
        const now = new Date().toISOString(), ops = [];
        P.fac.forEach(f => ops.push({ op: 'set', col: 'factories', id: f.code, data: { id: f.code, code: f.code, name: f.name, note: f.note, active: true, createdAt: now } }));
        P.inv.forEach(x => ops.push({ op: 'set', col: 'factoryInvoices', id: x.id, data: Object.assign({}, x, { seed: true, createdAt: now, updatedAt: now }) }));
        P.pay.forEach(x => ops.push({ op: 'set', col: 'factoryPayments', id: x.id, data: Object.assign({}, x, { seed: true, createdAt: now }) }));
        P.acc.forEach(x => ops.push({ op: 'set', col: 'bonusAcc', id: x.id, data: Object.assign({}, x, { ref: '', seed: true }) }));
        P.dist.forEach(x => ops.push({ op: 'set', col: 'bonusDist', id: x.id, data: Object.assign({}, x, { seed: true, createdBy: S.user.email, createdAt: now }) }));
        if (P.split.length) ops.push({ op: 'set', col: 'bonusSplit', id: 'main', data: { id: 'main', rows: P.split, updatedAt: now } });
        P.payees.forEach(p => ops.push({ op: 'set', col: 'payees', id: p.who, data: Object.assign({ id: p.who }, p) }));
        (P.inv99 || []).forEach(x => ops.push({ op: 'set', col: 'pay1099', id: x.id, data: Object.assign({}, x, { gross: x.amt, acc: 0, ref: '', seed: true, createdAt: now }) }));
        const hist = {}; P.dedHist.forEach(h => { (hist[h.id] = hist[h.id] || []).push({ d: h.d, amt: h.amt, ref: h.ref }); });
        P.ded.forEach(d => { const h = hist[d.id] || [], used = R2(h.reduce((a, x) => a + x.amt, 0)); ops.push({ op: 'set', col: 'deductions', id: d.id, data: Object.assign({}, d, { used, hist: h, st: d.st || (used >= d.total - 0.005 ? '완료' : ''), seed: true, createdBy: S.user.email, createdAt: now, updatedAt: now }) }); });
        P.opts.forEach(o => { if (S.smByCode[o.sm]) ops.push({ op: 'update', col: 'salesmen', id: o.sm, data: { cashKeep: o.cashKeep, defaultPer: o.defaultPer } }); });
        await S.DB.batch(ops);
        /* 정산 미룸 → deferred(다음 정산에 같이 올라옴) · 정산 제외 → settled(이미 지급) — entries 에 없으면 cod */
        let nDf = 0, nEx = 0;
        for (const x of (P.defer || []).map(x => ({ id: x.id, data: { deferred: 'sheet', deferredAt: x.d }, k: 'd' })).concat((P.excl || []).map(x => ({ id: x.id, data: { settled: 'sheet-excl:' + x.d, settledAt: x.d }, k: 'e' })))) {
          try { await S.DB.update('entries', x.id, x.data); } catch (e) { try { await S.DB.update('cod', x.id, x.data); } catch (e2) { continue; } }
          if (x.k === 'd') nDf++; else nEx++; }
        if (nDf || nEx) toast('정산 미룸 ' + nDf + ' · 정산 제외 ' + nEx + '건 반영', 'good');
        dropBossCache();
        out.innerHTML = '<div class="alert a-grn">넣었습니다 — ' + ops.length + '건. 경영 탭에서 확인하세요.</div>'; toast('경영 자료 ' + ops.length + '건', 'good');
      } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
      busy(false);
    };
  } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
}
/* ---- 🏭 공장 명세서 (공장별 엑셀) → factories · factoryInvoices · factoryPayments ----
 *  같은 공장 · 같은 연도의 지난 명세서 줄(src 'stmt')은 지우고 새로 넣음 → 고친 파일을 다시 올려도 겹치지 않음. 앱에서 손으로 넣은 줄은 그대로. */
const firstDate = P => P.inv.concat(P.pay).map(x => x.d).filter(Boolean).sort()[0] || '';
async function factoryStatementFile(file, out) {
  out.innerHTML = '<div class="load">읽는 중…</div>';
  try {
    const { XLSX, wb } = await readBook(file);
    const P = parseFactoryStatement(wb.SheetNames.map(n => ({ name: n, rows: aoa(XLSX, wb, n) || [] })));
    if (!P.sheets.length) throw new Error('공장 명세서 모양이 아닙니다 (머리글 Date · PAID DATE · DEPOSIT MONEY 가 있는 탭이 없음)');
    const facs = (await S.DB.list('factories')).filter(f => f.active !== false), hit = matchFactory(P.name, facs), sug = suggestFactoryCode(P.name);
    /* 교체 범위 = 탭 연도 + 실제 줄 날짜의 연도 (SHENGXING 처럼 2025 탭이 2024-12 날짜 줄로 시작하면 2024 줄도 같이 교체) */
    const years = Array.from(new Set(P.sheets.map(s => s.year).filter(Boolean).concat(P.inv.concat(P.pay).map(x => String(x.d || '').substring(0, 4)).filter(Boolean)))).sort();
    const rowsHtml = P.sheets.map(s => '<tr><td><b>' + esc(s.year || '?') + '</b></td><td class="r">' + s.inv.length + '줄 · ' + money(s.sumInv) + (s.fwdSkipped ? '<br><small class="muted">이월 ' + money(s.fwdSkipped) + ' 은 앞 연도 줄로 계산 (안 넣음)</small>' : s.fwd ? '<br><small class="muted">이월 ' + money(s.fwd) + ' 포함</small>' : '') + '</td><td class="r">' + (s.hdr.total == null ? '—' : money(s.hdr.total) + ' ' + (s.okTotal ? '<b class="ok">✓</b>' : '<b class="warn">≠ ' + money(s.sumInvAll) + '</b>')) + '</td><td class="r">' + s.pay.length + '줄 · ' + money(s.sumPay) + '</td><td class="r">' + (s.hdr.deposit == null ? '—' : money(s.hdr.deposit) + ' ' + (s.okDep ? '<b class="ok">✓</b>' : '<b class="warn">≠</b>')) + '</td></tr>').join('');
    out.innerHTML = '<div class="card"><h2>🏭 공장 명세서 — ' + esc(P.name || file.name) + '</h2>' +
      '<div class="two"><div class="fg"><label>공장</label>' + sel('fsFac', facs.map(f => [f.code, f.name + ' (' + f.code + ')']).concat([['__new', '＋ 새 공장으로 등록: ' + (P.name || '?')]]), hit ? hit.code : '__new') + '</div><div class="fg" id="fsCodeBox" style="' + (hit ? 'display:none' : '') + '"><label>새 공장 코드 (영문 2~4자)</label><input id="fsCode" value="' + esc(sug) + '" maxlength="4" style="text-transform:uppercase"></div></div>' +
      (hit ? '<div class="muted" style="font-size:12px">이름이 맞는 기존 공장 <b>' + esc(hit.name) + '</b> 으로 들어갑니다. 다른 공장이면 위에서 바꾸세요.</div>' : '<div class="muted" style="font-size:12px">맞는 기존 공장이 없어 새 공장으로 등록합니다. 이미 있는 공장이면 위에서 고르세요.</div>') +
      '<table style="margin-top:8px"><tr><th>연도</th><th class="r">인보이스 (물품+운임)</th><th class="r">파일 TOTAL</th><th class="r">송금</th><th class="r">파일 DEPOSIT</th></tr>' + rowsHtml + '</table>' +
      (P.warn.length ? '<div class="alert a-amb" style="margin-top:8px">⚠️ ' + P.warn.length + '줄은 읽지 못해 빠집니다<div style="font-size:12px;max-height:120px;overflow:auto">' + P.warn.slice(0, 30).map(esc).join('<br>') + '</div></div>' : '') +
      '<label style="display:flex;gap:6px;align-items:flex-start;margin-top:10px;padding:8px 10px;border:1.5px solid #fca5a5;background:#fef2f2;border-radius:10px"><input type="checkbox" id="fsAll" checked style="margin-top:3px"> <span><b>📄 이 공장을 엑셀대로 완전히 맞추기 (권장)</b> — 이 공장의 지금 줄(인보이스 · 송금)을 <b>모두 지우고</b> 이 파일의 줄만 넣습니다. 잘못 지웠거나 겹친 것이 있어도 파일 그대로 돌아옵니다. 끄면 아래 선택대로 연도별로만 바꿉니다.</span></label>' +
      (P.sheets[0] && !P.sheets[0].fwd && !P.sheets[0].fwdSkipped && P.inv.length ? '<label class="muted" style="display:flex;gap:6px;align-items:flex-start;margin-top:8px"><input type="checkbox" id="fsPre" checked style="margin-top:3px"> <span>첫 탭(' + esc(P.sheets[0].year) + ')에 <b>이월(BALANCE FORWARD)이 없습니다</b> → 이 명세서는 첫 줄 날짜(' + esc(firstDate(P)) + ') 전 잔액을 0 으로 봅니다. 이 공장의 <b>그 전 날짜 줄을 모두 지웁니다</b> (옛 파일 · 옛 자료). 끄면 그대로 둡니다.</span></label>' : '') +
      '<label class="muted" style="display:flex;gap:6px;align-items:flex-start;margin-top:8px"><input type="checkbox" id="fsRepl" checked style="margin-top:3px"> <span>이 공장의 ' + esc(years.join(', ')) + '년 <b>기존 줄을 모두 지우고 명세서로 바꿉니다</b> (지난 명세서 · 옛 대시보드 자료 · 손입력). 명세서가 그 연도의 기준이므로 켜 두면 겹치지 않습니다. 끄면 지난 명세서 줄만 바꾸고 나머지는 둡니다.</span></label>' +
      '<div class="hint">파일 TOTAL · DEPOSIT 과 ✓ 가 맞는지 확인하고 넣으세요. 넣은 뒤 경영 → 🏭 공장의 잔액이 파일 BALANCE 와 같아야 합니다.</div>' +
      '<div class="btns"><button class="b-blue" id="fsGo">' + (P.inv.length + P.pay.length) + '줄 넣기</button></div></div>';
    $('fsFac').onchange = () => { $('fsCodeBox').style.display = $('fsFac').value === '__new' ? '' : 'none'; };
    $('fsGo').onclick = async () => {
      let code = $('fsFac').value; const isNew = code === '__new';
      if (isNew) { code = $('fsCode').value.trim().toUpperCase(); if (!/^[A-Z0-9]{2,4}$/.test(code)) return toast('새 공장 코드는 영문 · 숫자 2~4자', 'bad'); if (facs.some(f => f.code === code)) return toast('이미 있는 코드입니다 — 위에서 그 공장을 고르세요', 'bad'); }
      busy(true);
      try {
        const now = new Date().toISOString(), ops = [], ys = new Set(years);
        /* 파일 머리의 TOTAL · DEPOSIT · BALANCE 를 공장 문서에 남겨 두어 공장 화면에서 앱 잔액과 대조 */
        const stmtHdr = {}; P.sheets.forEach(sh => { if (sh.year) stmtHdr[sh.year] = { total: sh.hdr.total, deposit: sh.hdr.deposit, balance: sh.hdr.balance, file: file.name, at: now }; });
        const exF = facs.find(f => f.code === code) || {};
        if (isNew) ops.push({ op: 'set', col: 'factories', id: code, data: { id: code, code, name: P.name || code, note: '명세서 가져오기', active: true, createdAt: now, stmt: stmtHdr } });
        else ops.push({ op: 'update', col: 'factories', id: code, data: { stmt: Object.assign({}, exF.stmt || {}, stmtHdr), updatedAt: now } });
        const [oldI, oldP] = await Promise.all([S.DB.list('factoryInvoices', { where: [['f', '==', code]] }).catch(() => []), S.DB.list('factoryPayments', { where: [['f', '==', code]] }).catch(() => [])]);
        const all = $('fsAll') && $('fsAll').checked, repl = $('fsRepl') && $('fsRepl').checked, pre = $('fsPre') && $('fsPre').checked, d0 = firstDate(P);
        const gone = x => all || (ys.has(String(x.d || '').substring(0, 4)) && (repl || x.src === 'stmt')) || (pre && d0 && String(x.d || '') < d0);
        let del = 0; oldI.forEach(x => { if (gone(x)) { ops.push({ op: 'del', col: 'factoryInvoices', id: x.id }); del++; } });
        oldP.forEach(x => { if (gone(x)) { ops.push({ op: 'del', col: 'factoryPayments', id: x.id }); del++; } });
        const seen = {}; const idOf = (pre, d, amt) => { const k = pre + '-' + code + '-' + d + '-' + Math.round(amt * 100); seen[k] = (seen[k] || 0) + 1; return k + (seen[k] > 1 ? '-' + seen[k] : ''); };
        P.inv.forEach(x => { const id = idOf('FSI', x.d, x.amt); ops.push({ op: 'set', col: 'factoryInvoices', id, data: { id, f: code, d: x.d, type: x.type, item: x.item, frt: x.frt, amt: x.amt, note: x.note, src: 'stmt', file: file.name, createdAt: now, updatedAt: now } }); });
        P.pay.forEach(x => { const id = idOf('FSP', x.d, x.amt); ops.push({ op: 'set', col: 'factoryPayments', id, data: { id, f: code, d: x.d, amt: x.amt, note: '', src: 'stmt', file: file.name, createdAt: now } }); });
        await S.DB.batch(ops);
        dropMgCache(); dropBossCache();
        out.innerHTML = '<div class="alert a-grn">넣었습니다 — ' + esc(P.name || code) + ' (' + esc(code) + ') · 인보이스 ' + P.inv.length + '줄 · 송금 ' + P.pay.length + '줄' + (del ? ' · 기존 줄 ' + del + '개 ' + (all ? '모두 지우고 파일대로' : '교체') : '') + '. 잔액이 파일 BALANCE ' + (P.sheets[P.sheets.length - 1] && P.sheets[P.sheets.length - 1].hdr.balance != null ? money(P.sheets[P.sheets.length - 1].hdr.balance) : '') + ' 와 같아야 합니다. <u data-gomg style="cursor:pointer">🏭 경영 → 공장</u>에서 확인하세요.</div>';
        out.querySelectorAll('[data-gomg]').forEach(u => u.onclick = () => Router.go('mg', 'fac'));
        toast('🏭 ' + (P.name || code) + ' 명세서 ' + (P.inv.length + P.pay.length) + '줄', 'good');
      } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
      busy(false);
    };
  } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
}
async function importComm(file) {
  if (!file) return; busy(true); outEl().innerHTML = '';
  try {
    const { XLSX, wb } = await readBook(file); const ops = []; let nR = 0, nL = 0;
    const rt = aoa(XLSX, wb, '세일즈맨 요율');
    if (rt) { const H = hdrIdx(rt[0], { sm: /세일즈맨/, a: /A 인보이스/, disc: /할인/, w: /W 인보이스/, p: /P 인보이스/, ex: /EXCHANGE/, dp: /DP/, office: /OFFICE/ });
      for (let i = 1; i < rt.length; i++) { const r = rt[i]; const code = String(r[H.sm] || '').trim().toUpperCase(); if (!code) continue; const rates = {}; ['a', 'disc', 'w', 'p', 'ex', 'dp', 'office'].forEach(kk => { if (H[kk] >= 0 && r[H[kk]] !== '') { let v = num(r[H[kk]]); if (v > 1) v = v / 100; rates[kk] = v; } }); const cur = S.smByCode[code] || { code, name: code, active: true }; ops.push({ op: 'set', col: 'salesmen', id: code, data: Object.assign({}, cur, { rates: Object.assign({}, RATE_DEFAULT, cur.rates || {}, rates) }) }); nR++; } }
    /* 정산 기록 (대시보드가 확정할 때 쓰는 장부): 정산일 · 세일즈맨 · ID · 가게 · 금액 · 보관 탭 · 지급액
     *  · ID 가 현장 수금(C…)이면 entries, COD · ACH · 카드(D… · ACH-…)면 cod 를 정산됨으로
     *  · 보관 탭마다 📁 정산 완료 한 줄(settlements, src:'sheet') — 기간은 그 보관 탭 첫 줄 "M/D/YYYY ~ M/D/YYYY" 에서 */
    const lg = aoa(XLSX, wb, '정산 기록'), grp = {}, ledger = [];
    if (lg) for (let i = 1; i < lg.length; i++) { const r = lg[i] || []; const id = String(r[2] || '').trim().split('@')[0]; if (!id) continue; ledger.push({ d: dstr(r[0]), sm: String(r[1] || '').trim().toUpperCase(), id, amt: num(r[4]), tab: String(r[5] || '').trim(), pay: r[6] === '' || r[6] == null ? null : num(r[6]) }); nL++; }
    ledger.forEach(x => { const k = x.tab || (x.sm + ' ' + x.d); const g = grp[k] = grp[k] || { tab: k, sm: x.sm, day: x.d, n: 0, total: 0, pay: 0 }; g.n++; g.total = R2(g.total + x.amt); if (x.pay != null) g.pay = R2(g.pay + x.pay); });
    const md2 = s => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s); return m ? m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0') : ''; };
    Object.values(grp).forEach(g => { const t = aoa(XLSX, wb, g.tab), a1 = t && t[0] ? String(t[0][0] || '') : '', pr = a1.split('~'), id = 'SH-' + g.tab.replace(/[^A-Za-z0-9-]/g, '_');
      ops.push({ op: 'set', col: 'settlements', id, data: { id, sm: g.sm, day: g.day, from: pr.length > 1 ? md2(pr[0]) : '', to: pr.length > 1 ? md2(pr[1]) : '', n: g.n, total: g.total, pay: g.pay, finalPay: g.pay, src: 'sheet', tab: g.tab, createdAt: g.day } }); });
    /* update 는 없는 문서에 실패하므로 하나씩 — 수금(entries)에 없으면 COD(cod)에서 찾음 */
    let ok = 0, fail = 0, okCod = 0;
    for (const x of ledger) { const data = { settled: 'sheet:' + x.d + ':' + x.tab, settledAt: x.d }; try { await S.DB.update('entries', x.id, data); ok++; } catch (e) { try { await S.DB.update('cod', x.id, data); okCod++; } catch (e2) { fail++; } } }
    for (const o of ops) { try { if (o.op === 'update') await S.DB.update(o.col, o.id, o.data); else await S.DB.set(o.col, o.id, o.data); } catch (e) { fail++; } }
    S.sms = await S.DB.list('salesmen', { order: ['code', 'asc'] }); S.smByCode = {}; S.sms.forEach(x => { S.smByCode[x.code] = x; });
    dropBossCache();
    say('요율 ' + nR + '명 · 정산 기록 ' + nL + '줄 (현장 수금 ' + ok + ' · COD·ACH·카드 ' + okCod + ' 정산됨 · 못 찾음 ' + fail + ') · 📁 정산 완료 ' + Object.keys(grp).length + '건<br><b>가져오기 끝</b> — ④ 대시보드 파일도 올리면 정산 미룸 · 정산 제외가 반영됩니다');
  } catch (e) { outEl().insertAdjacentHTML('beforeend', '<div class="alert a-red">' + esc(e.message) + '</div>'); }
  busy(false);
}

/* ============================================================
 *  📦 아이템 — THE ONE Item Master 를 엑셀로 받아 올리면 모든 폰의 아이템 목록이 바뀜
 * ============================================================ */
async function catalogAdmin() {
  const meta = await S.DB.get('catalog', 'meta');
  $('adminBody').innerHTML = '<div class="card"><h2>📦 아이템 목록 (주문용)</h2>' +
    (meta ? '<div class="sumbox">지금: <b>' + (meta.count || 0).toLocaleString() + '개</b> · ' + esc(String(meta.updatedAt || '').substring(0, 16).replace('T', ' ')) + ' · ' + esc(meta.by || '') + '</div>' : '<div class="alert a-amb">아직 올린 아이템 목록이 없습니다</div>') +
    '<div class="btns" style="justify-content:flex-start;margin-top:8px"><button class="b-ghost" onclick="location.hash=\'#/items\'">🏷 아이템 전체 보기 · 등록 · 숨기기 · 분류 옮기기</button></div><div class="hint">분류별로 훑어보며 여러 개를 체크해 한 번에 숨기기 · 보이기 · 옮기기 · 삭제 (담당자도 가능). 엑셀은 대량 변경용.</div></div>' +
    '<div class="card" style="border:2px solid #fcd34d"><h2>🐝 SmartBee ALL ITEMS 로 맞추기 <span class="en">Sync from SmartBee export</span></h2>' +
    '<div class="muted">SmartBee 에서 <b>ALL ITEMS</b>(CATEGORY · ITEM 3 · DESCRIPTION · PRICE · BARCODE)를 엑셀로 뽑아 <b>그대로</b> 올리세요 — Item Master 모양으로 고칠 필요 없습니다. 새 코드는 비슷한 코드 · 이름으로 분류를 추정해 추가하고(미리보기에서 고쳐 쓸 수 있음), 이미 있는 코드는 <b>이름 · 가격 · 바코드가 바뀐 것만</b> 고칩니다. 앱에서 정한 분류 · 숨김 · 창고 위치 · 사진 · SRP 는 그대로 둡니다. 관리 → 📥 가져오기의 "파일 올리기"에 넣어도 같은 결과입니다.</div>' +
    '<div class="fg" style="margin-top:10px"><input type="file" id="sbFile" accept=".xlsx,.xls,.csv"></div><div id="sbOut"></div></div>' +
    '<div class="card"><h2>📦 Item Master 엑셀 — 전체 바꾸기</h2><div class="muted">구글 시트 <b>THE ONE Item Master</b> 를 <b>파일 → 다운로드 → Microsoft Excel</b> 로 받아 그대로 고르세요. Items 탭과 Categories 탭을 읽습니다. Hide 에 x 표시된 것은 <b>숨김</b>으로 올립니다. <b>목록 전체가 파일대로 바뀝니다</b> — 앱에서 고친 숨김 · 위치 · 분류가 시트에 없으면 사라지니, 새 아이템만 넣을 때는 위 🐝 SmartBee 파일을 쓰세요.</div>' +
    '<div class="fg" style="margin-top:10px"><input type="file" id="catFile" accept=".xlsx"></div><div id="catOut"></div></div>' +
    '<div class="card"><h2>🧩 세트 · 인서트 구성</h2><div id="setBox"><div class="load">읽는 중…</div></div></div>' +
    photoCard();
  setAdmin();
  $('sbFile').onchange = () => { const f = $('sbFile').files[0]; if (f) smartbeeFile(f, $('sbOut'), catalogAdmin); };
  $('catFile').onchange = () => { const f = $('catFile').files[0]; if (f) itemMasterFile(f, $('catOut'), catalogAdmin); };
  $('phDrive').onclick = async () => {
    const on = !S.settings.photoDrive;
    busy(true);
    try { const cur = (await S.DB.get('settings', 'app')) || {}; await S.DB.set('settings', 'app', Object.assign(cur, { photoDrive: on })); S.settings.photoDrive = on; await loadCatalog(S, true); toast(on ? '드라이브 사진을 씁니다' : '드라이브 사진을 끔'); catalogAdmin(); }
    catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
  if ($('phTest')) $('phTest').onclick = () => {
    const px = photoIndex(); const id = px && (px.pic['N_BH01G'] || Object.values(px.pic)[0]);
    const out = $('phTestOut'); out.innerHTML = '<div class="load">사진 불러오는 중…</div>';
    const img = new Image(); img.onload = () => { out.innerHTML = '<div class="alert a-grn">✅ 드라이브 사진이 열립니다 — 켜도 됩니다</div>'; }; img.onerror = () => { out.innerHTML = '<div class="alert a-red">❌ 열리지 않습니다 — 구글이 로그인 화면으로 돌려보냅니다 (회사 계정 전용 공유). 고치는 법:<br>① 드라이브에서 <b>item_picture</b> 폴더와 <b>The One item</b>(세트 사진) 폴더 → 공유 → 일반 액세스 → <b>링크가 있는 모든 사용자 · 뷰어</b><br>② 공유 드라이브라서 이 메뉴가 회색이면: 공유 드라이브 설정 → "외부 사용자 액세스 허용" 켜기, 그래도 안 되면 admin.google.com → 앱 → Google Workspace → 드라이브 및 문서 → 공유 설정 → theonefl.com 외부 공유 허용<br>바꾼 뒤 이 버튼을 다시 눌러 ✅ 가 나오면 됩니다.</div>'; };
    img.src = driveUrl(id, 100) + '&t=' + Date.now();
  };
}
/** 📦 Item Master 엑셀(Items · Categories 탭) — 목록 전체를 파일대로 */
async function itemMasterFile(file, out, after) {
  out.innerHTML = '<div class="load">읽는 중…</div>';
  try {
    const { XLSX, wb } = await readBook(file);
    const p = parseItemMaster(aoa(XLSX, wb, 'Items'), aoa(XLSX, wb, 'Categories'));
    const warn = [];
    if (p.dup.length) warn.push('같은 코드가 두 번: ' + p.dup.length + '개 (첫 줄만 씀) — ' + p.dup.slice(0, 8).join(', '));
    if (p.dupBar.length) warn.push('같은 바코드를 쓰는 코드: ' + p.dupBar.length + '쌍 (스캔하면 앞의 것이 담김) — ' + p.dupBar.slice(0, 5).join(', '));
    if (p.noPrice.length) warn.push('가격 없음: ' + p.noPrice.length + '개 — ' + p.noPrice.slice(0, 8).join(', '));
    try { await loadCatalog(S); } catch (e) {}
    const C = catalog(); let lost = 0, locs = 0;
    if (C && C.items.length) { const inF = new Set(p.rows.map(r => r[0])); C.items.forEach(x => { if (x.virt) return; if (!inF.has(x.c)) lost++; if (x.loc) locs++; }); }
    out.innerHTML = '<div class="alert a-blu">아이템 <b>' + p.rows.length.toLocaleString() + '개</b> · 사진 ' + p.photos.toLocaleString() + '개 · 카테고리 ' + p.cats.length + '줄 · 🙈 숨김 ' + p.hidden + '개</div>' +
      warn.map(w => '<div class="alert a-amb">' + esc(w) + '</div>').join('') +
      (lost || locs ? '<div class="alert a-amb">⚠️ 전체 바꾸기입니다 — ' + (lost ? '지금 목록에 있는데 파일에 없는 아이템 <b>' + lost.toLocaleString() + '개</b>가 빠지고, ' : '') + (locs ? '📍 창고 위치가 있는 아이템 ' + locs.toLocaleString() + '개는 파일의 Location 열이 없으면 위치가 비며, ' : '') + '앱에서 바꾼 숨김 · 분류도 파일대로 됩니다. 새 아이템만 넣으려면 🐝 SmartBee ALL ITEMS 로 올리세요.</div>' : '') +
      '<button class="b-blue" id="catGo" style="margin-top:10px">이대로 전체 바꾸기</button>';
    $('catGo').onclick = async () => {
      if (lost && !(await confirmBox(lost.toLocaleString() + '개 아이템이 목록에서 빠집니다. 그래도 파일대로 전체를 바꿀까요?', '전체 바꾸기'))) return;
      busy(true);
      try { const r = await publishCatalog(S, p); await loadCatalog(S, true); toast('아이템 ' + p.rows.length + '개 올림 (' + r.chunks + '묶음)', 'good'); out.innerHTML = '<div class="alert a-grn">올렸습니다 — ' + p.rows.length.toLocaleString() + '개</div>'; (after || catalogAdmin)(); }
      catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
      busy(false);
    };
  } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
}
/* ---- 🐝 SmartBee ALL ITEMS — 새 아이템 추가 · 이름 · 가격 · 바코드 맞추기 (분류 · 숨김 · 위치는 그대로) ---- */
let SBM_HID = null;
async function sbmHidden() { if (SBM_HID) return SBM_HID; try { const r = await fetch('data/sbm-hidden.json'); SBM_HID = r.ok ? await r.json() : []; } catch (e) { SBM_HID = []; } return SBM_HID; }
async function smartbeeFile(file, out, after) {
  out.innerHTML = '<div class="load">읽는 중…</div>';
  try {
    try { await loadCatalog(S); } catch (e) {}
    const C = catalog(); if (!C || !C.items.length) throw new Error('아직 아이템 목록이 없습니다 — 먼저 📦 Item Master 엑셀을 한 번 올려 주세요');
    let P = null, err = '';
    if (/\.(csv|txt)$/i.test(file.name)) { const text = (await file.text()).replace(/^﻿/, ''); P = parseSmartBeeItems(parseCsv(text, csvDelim(text.split(/\r?\n/)[0] || ''))); }
    else { const { XLSX, wb } = await readBook(file); for (const n of wb.SheetNames) { try { P = parseSmartBeeItems(aoa(XLSX, wb, n)); break; } catch (e) { err = e.message; } } }
    if (!P) throw new Error(err || '읽지 못했습니다');
    const D = smartbeeDiff(P, C, await sbmHidden());
    /* 새 아이템을 코드 가족 + 추정 분류로 묶어 보여 줌 */
    const G = {}; D.add.forEach(x => { const fam = codeFamily(x.c), k = fam + '\u0001' + x.g.path.join('\u0001'); const g = G[k] = G[k] || { fam, path: x.g.path.slice(), conf: x.g.conf, why: x.g.why, items: [], cats: {} }; g.items.push(x); g.cats[x.cat || '—'] = (g.cats[x.cat || '—'] || 0) + 1; });
    const groups = Object.values(G).sort((a, b) => b.items.length - a.items.length || a.fam.localeCompare(b.fam));
    const junk = g => Object.keys(g.cats).every(c => /^(CREDIT|DISCOUNT|NOTE)$/.test(c)) || g.items.every(x => !(x.p > 0));
    const CONF = { high: '✅ 확실', mid: '🔶 추정', low: '❔ 짐작', none: '❌ 모름' };
    const names = { g: new Set(), l1: new Set(), l2: new Set(), l3: new Set() };
    C.cats.forEach(p => ['g', 'l1', 'l2', 'l3'].forEach((k, j) => { if (p[j]) names[k].add(p[j]); })); C.items.forEach(x => ['g', 'l1', 'l2', 'l3'].forEach(k => { if (x[k]) names[k].add(x[k]); }));
    const dl = k => '<datalist id="sbdl_' + k + '">' + Array.from(names[k]).sort().map(v => '<option value="' + esc(v) + '">').join('') + '</datalist>';
    const lvIn = (i, k, j, v) => '<input data-sblv="' + i + ':' + j + '" list="sbdl_' + k + '" value="' + esc(v) + '" placeholder="' + ['Group', 'Level 1', 'Level 2', 'Level 3'][j] + '" autocomplete="off" class="sm">';
    const chgLine = x => '<div class="muted"><b>' + esc(x.c) + '</b> ' + ['d', 'p', 'b'].filter(k => x.ch[k] != null).map(k => k === 'd' ? '이름 ' + esc(x.it.d) + ' → <b>' + esc(x.ch.d) + '</b>' : k === 'p' ? '가격 ' + money(x.it.p) + ' → <b>' + money(x.ch.p) + '</b>' : '바코드 ' + esc(x.it.b || '—') + ' → <b>' + esc(x.ch.b) + '</b>').join(' · ') + '</div>';
    const more = (L, f, max) => L.slice(0, max).map(f).join('') + (L.length > max ? '<div class="muted">… ' + (L.length - max).toLocaleString() + '개 더</div>' : '');
    out.innerHTML = '<div class="alert a-blu">파일 <b>' + P.items.length.toLocaleString() + '</b>개 코드 · 지금 목록 ' + C.items.filter(x => !x.virt).length.toLocaleString() + '개<br>같음 ' + D.same.toLocaleString() + ' · <b>바뀐 것 ' + D.chg.length.toLocaleString() + '</b> (이름 ' + D.cnt.d + ' · 가격 ' + D.cnt.p + ' · 바코드 ' + D.cnt.b + ') · <b>새 코드 ' + D.add.length.toLocaleString() + '</b>' + (D.oldHid.length ? ' · 이전 시스템 단종(숨김) ' + D.oldHid.length.toLocaleString() : '') + (D.gone.length ? ' · 파일에 없는 아이템 ' + D.gone.length.toLocaleString() : '') + '</div>' +
      (P.fixed.length ? '<div class="alert a-grn">엑셀로 복사하다 깨진 줄 ' + P.fixed.length + '개를 살려 읽었습니다: ' + esc(P.fixed.slice(0, 10).join(', ')) + '</div>' : '') +
      (P.dup.length ? '<div class="alert a-amb">같은 코드가 두 번 ' + P.dup.length + '개 (첫 줄만 씀): ' + esc(P.dup.slice(0, 8).join(', ')) + '</div>' : '') +
      (D.chg.length ? '<details class="sumbox" open><summary><b>✏️ 바뀐 것 ' + D.chg.length.toLocaleString() + '개</b> <span class="muted">— 체크한 항목만 고칩니다</span></summary><div style="display:flex;gap:14px;flex-wrap:wrap;margin:6px 0"><label><input type="checkbox" id="sbFd" checked> 이름 ' + D.cnt.d + '</label><label><input type="checkbox" id="sbFp" checked> 가격 ' + D.cnt.p + '</label><label><input type="checkbox" id="sbFb" checked> 바코드 ' + D.cnt.b + '</label></div>' + more(D.chg, chgLine, 60) + '</details>' : '') +
      (groups.length ? '<div class="sumbox"><b>＋ 새 아이템 ' + D.add.length.toLocaleString() + '개 — ' + groups.length + '묶음</b><div class="muted">분류는 비슷한 코드 · 이름으로 추정했습니다. 틀리면 고쳐 쓰고(목록에서 고르거나 새 이름), 넣지 않을 묶음은 체크를 푸세요. 비워 두면 "분류 없음"(검색만 됨). Group 은 인보이스 종류(Jewelry → A · Other → P · Set &amp; Display → W).</div>' + dl('g') + dl('l1') + dl('l2') + dl('l3') +
        groups.map((g, i) => { const off = junk(g); const px = g.items.map(x => x.p).filter(p => p > 0); const pr = px.length ? (Math.min(...px) === Math.max(...px) ? money(px[0]) : money(Math.min(...px)) + '~' + money(Math.max(...px))) : '가격 없음';
          return '<div class="pr" style="flex-wrap:wrap;align-items:flex-start"><label style="display:flex;gap:6px;align-items:flex-start;flex:1 1 100%;cursor:pointer"><input type="checkbox" data-sbg="' + i + '" ' + (off ? '' : 'checked') + ' style="width:20px;height:20px;flex:0 0 auto;margin-top:2px"><span style="flex:1"><b>' + esc(g.fam) + '</b> <span class="muted">' + g.items.length + '개 · ' + esc(Object.keys(g.cats).join(' · ')) + ' · ' + pr + '</span><small style="display:block;color:#64748b">' + esc(g.items.slice(0, 3).map(x => x.c + ' ' + x.d).join(' / ')) + (g.items.length > 3 ? ' …' : '') + '</small><small style="display:block;color:' + (g.conf === 'high' ? '#15803d' : g.conf === 'none' ? '#b91c1c' : '#b45309') + '">' + CONF[g.conf] + ' — ' + esc(g.why) + '</small></span></label>' +
            '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;flex:1 1 100%;margin:4px 0 0 26px">' + g.path.map((v, j) => lvIn(i, ['g', 'l1', 'l2', 'l3'][j], j, v)).join('') + '</div>' +
            (off ? '<small class="muted" style="margin-left:26px">크레딧 · 디스카운트 · 가격 없는 코드라 기본으로 뺐습니다</small>' : '') + '</div>'; }).join('') + '</div>' : '') +
      (D.oldHid.length ? '<details class="sumbox"><summary><b>🗂 이전 시스템에서 레벨을 비워 둔 코드 ' + D.oldHid.length.toLocaleString() + '개</b> <span class="muted">— 단종 · 안 파는 것으로 보고 넣지 않습니다</span></summary><label class="pick" id="sbOldP" style="margin-top:6px"><span class="ck">✓</span><span class="pm"><b>이것도 🙈 숨김으로 목록에 넣기</b><small>바코드 스캔 · 지난 인보이스 조회에는 잡히고 주문 화면에는 안 보임</small></span></label>' + more(D.oldHid, x => '<div class="muted">' + esc(x.c + ' ' + x.d) + '</div>', 40) + '</details>' : '') +
      (D.gone.length ? '<details class="sumbox"><summary><b>📭 목록에는 있는데 파일에 없는 아이템 ' + D.gone.length.toLocaleString() + '개</b></summary><label class="pick" id="sbGoneP" style="margin-top:6px"><span class="ck">✓</span><span class="pm"><b>🙈 숨기기</b><small>SmartBee 에서 지운 것이면 숨김으로 (삭제는 안 함 — 🏷 아이템 관리에서 언제든 되돌림)</small></span></label>' + more(D.gone, x => '<div class="muted">' + esc(x.c + ' ' + x.d) + (x.h ? ' 🙈' : '') + '</div>', 40) + '</details>' : '') +
      (D.noPrice.length ? '<div class="alert a-amb">가격이 0 인 새 코드 ' + D.noPrice.length + '개: ' + esc(D.noPrice.slice(0, 10).join(', ')) + (D.noPrice.length > 10 ? ' …' : '') + '</div>' : '') +
      '<button class="b-blue" id="sbGo" style="margin-top:10px">✅ 적용</button><div class="hint">분류 · 숨김 · 위치 · 사진 · SRP 는 건드리지 않습니다. 적용하면 모든 폰이 새 목록을 받습니다.</div>';
    ['sbOldP', 'sbGoneP'].forEach(id => { if ($(id)) $(id).onclick = () => $(id).classList.toggle('on'); });
    $('sbGo').onclick = async () => {
      const fields = { d: $('sbFd') ? $('sbFd').checked : true, p: $('sbFp') ? $('sbFp').checked : true, b: $('sbFb') ? $('sbFb').checked : true };
      const add = []; groups.forEach((g, i) => { const ck = out.querySelector('[data-sbg="' + i + '"]'); if (!ck || !ck.checked) return; const lv = [0, 1, 2, 3].map(j => { const el = out.querySelector('[data-sblv="' + i + ':' + j + '"]'); return el ? el.value.trim() : ''; }); g.items.forEach(x => add.push({ c: x.c, d: x.d, p: x.p, b: x.b, lv, h: false })); });
      if ($('sbOldP') && $('sbOldP').classList.contains('on')) D.oldHid.forEach(x => add.push({ c: x.c, d: x.d, p: x.p, b: x.b, lv: ['', '', '', ''], h: true }));
      const hide = $('sbGoneP') && $('sbGoneP').classList.contains('on') ? D.gone.filter(x => !x.h).map(x => x.c) : [];
      const nChg = D.chg.filter(x => (fields.d && x.ch.d != null) || (fields.p && x.ch.p != null) || (fields.b && x.ch.b != null)).length;
      if (!nChg && !add.length && !hide.length) return toast('바꿀 것이 없습니다', 'bad');
      if (!(await confirmBox('고침 ' + nChg + ' · 새 아이템 ' + add.length + (hide.length ? ' · 숨김 ' + hide.length : '') + ' — 적용할까요? 모든 폰이 새 목록을 받습니다.', '적용'))) return;
      busy(true);
      try {
        const r = await editCatalog(S, (rows, cats) => applySmartBee(rows, cats, { chg: D.chg, fields, add, hide }));
        toast('🐝 고침 ' + r.changed + ' · 새 아이템 ' + r.added + (r.hidden ? ' · 숨김 ' + r.hidden : ''), 'good');
        out.innerHTML = '<div class="alert a-grn">적용했습니다 — 고침 ' + r.changed + ' · 새 아이템 ' + r.added + (r.addedHidden ? ' (숨김 ' + r.addedHidden + ')' : '') + (r.hidden ? ' · 숨김 ' + r.hidden : '') + '. 분류를 비워 둔 새 아이템은 🏷 아이템 관리 → 📥 레벨 · 그룹 일괄 변경 → ❔ 분류 없음 에서 고치세요.</div>';
        (after || catalogAdmin)();
      } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
      busy(false);
    };
  } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
}

/* ---- 📤 자료 내려받기 — 앱에 쌓인 자료(주문 · 인보이스 · 수금 · 거래처 · 아이템)를 달 단위 엑셀로 (보관 · 회계 · 시트 분석용) ---- */
function exportCard() {
  const d = new Date(), yms = []; for (let i = 0; i < 24; i++) { yms.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); d.setMonth(d.getMonth() - 1); }
  return '<div class="card"><h2>📤 자료 내려받기 (백업 · 보관)</h2><div class="muted">앱 자료는 Firebase(Firestore) 에 쌓입니다. 달을 골라 받으면 그 달의 <b>주문 · 주문 줄 · 인보이스 · 수금 · 백오더</b> 와 지금의 <b>거래처 · 아이템</b> 이 탭별로 든 엑셀 한 파일이 됩니다. 달마다 한 번 받아 드라이브 "THE ONE 데이터 보관/연도" 폴더에 넣어 두면 회계 · 분석 · 백업이 됩니다.</div>' +
    '<div class="two" style="margin-top:8px">' + sel('exYm', yms.map(y => [y, y])) + '<button class="b-blue" id="exGo">⬇️ 이 달 엑셀 받기</button></div><div id="exOut"></div></div>';
}
function bindExport() {
  if (!$('exGo')) return;
  $('exGo').onclick = async () => {
    const ym = $('exYm').value, out = $('exOut'); out.innerHTML = '<div class="load">모으는 중…</div>'; busy(true);
    try {
      const XLSX = await loadXlsx();
      const [orders, invs, entries, bos, accts] = await Promise.all([S.DB.list('orders', { where: [['ym', '==', ym]] }), S.DB.list('invoices', { where: [['ym', '==', ym]] }), S.DB.list('entries', { where: [['ym', '==', ym]] }), S.DB.list('backorders'), S.DB.list('accounts')]);
      const lines = []; for (const o of orders) { const L = await S.DB.get('orderLines', o.id).catch(() => null); (L && L.lines || []).forEach(l => lines.push([o.no, o.d, o.sm, o.acct, o.store, o.st, l.c, l.d, l.q, l.pq == null ? '' : l.pq, l.p, l.lp == null ? '' : l.lp, l.t || '', l.note || ''])); }
      const wb = XLSX.utils.book_new();
      const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
      add('Orders', [['No', 'Date', 'SalesRep', 'Acct', 'Store', 'Status', 'Lines', 'Qty', 'Amount', 'Memo', 'Invoices', 'SentAt', 'DoneAt']].concat(orders.map(o => [o.no, o.d, o.sm, o.acct, o.store, o.st, o.n, o.qty, o.amt, o.memo || '', (o.invs || []).join(' '), o.sentAt || '', o.doneAt || ''])));
      add('OrderLines', [['OrderNo', 'Date', 'SalesRep', 'Acct', 'Store', 'Status', 'Code', 'Description', 'Qty', 'Picked', 'Price', 'ListPrice', 'Type', 'Note']].concat(lines));
      add('Invoices', [['Invoice', 'Type', 'Date', 'Acct', 'Store', 'SalesRep', 'Terms', 'Order', 'Qty', 'Sub', 'Disc%', 'Total', 'Balance', 'Status', 'Memo']].concat(invs.map(x => [x.no, x.t, x.d, x.acct, x.store, x.sm, x.terms || '', x.order, x.qty, x.sub, x.disc || 0, x.total, x.bal == null ? x.total : x.bal, x.st === 'x' ? 'VOID' : x.st, x.memo || ''])));
      add('InvoiceLines', [['Invoice', 'Date', 'Acct', 'Store', 'Code', 'Description', 'Qty', 'Price', 'Amount', 'Level1']].concat(invs.flatMap(x => (x.lines || []).map(l => [x.no, x.d, x.acct, x.store, l.c, l.d, l.q, l.p, R2(l.q * l.p), l.g || '']))));
      add('Payments', [['ID', 'Date', 'SalesRep', 'Acct', 'Store', 'Total', 'Methods', 'Invoices', 'Memo', 'Void', 'Verified']].concat(entries.map(e => [e.id, e.d, e.sm, e.acct, e.store, e.total, (e.pays || []).map(p => p.m + (p.ref ? '#' + p.ref : '') + ':' + p.amt).join(' '), (e.invs || []).map(v => v.no + ':' + v.amt).join(' '), e.memo || '', e.void ? 'Y' : '', e.v ? 'Y' : ''])));
      add('Backorders', [['OrderId', 'Order', 'Date', 'Acct', 'Store', 'SalesRep', 'Status', 'Code', 'Qty', 'Price']].concat(bos.flatMap(b => (b.lines || []).map(l => [b.id, b.order, b.d, b.acct, b.store, b.sm, b.st, l.c, l.q, l.p]))));
      add('Accounts', [['Acct', 'Store', 'Address', 'City', 'State', 'Zip', 'Tel', 'SalesRep', 'Terms', 'Note', 'Disc']].concat(accts.map(a => [a.acct, a.store, a.addr || '', a.city || '', a.state || '', a.zip || '', a.tel || '', a.sm || '', a.terms || '', a.note || '', JSON.stringify(a.disc || {})])));
      const C = catalog(); if (C) add('Items', [['Code', 'Description', 'Price', 'SRP', 'Barcode', 'Group', 'Level 1', 'Level 2', 'Level 3', 'Photo']].concat(C.rows));
      XLSX.writeFile(wb, 'THE_ONE_' + ym + '.xlsx');
      out.innerHTML = '<div class="alert a-grn">' + ym + ' — 주문 ' + orders.length + ' · 줄 ' + lines.length + ' · 인보이스 ' + invs.length + ' · 수금 ' + entries.length + ' · 백오더 ' + bos.length + ' · 거래처 ' + accts.length + '</div>';
    } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.code || e.message) + '</div>'; }
    busy(false);
  };
}
/* ---- 사진 규칙 ---- */
function photoCard() {
  const C = catalog(), st = (C && C.photoStat) || { dropped: 0, drive: 0 }, px = photoIndex();
  const withPh = C ? C.items.filter(x => x.ph).length : 0;
  return '<div class="card"><h2>🖼 사진 규칙 — 코드와 맞는 사진만</h2><div class="muted">① 드라이브 item_picture 에 <b>코드 이름</b>으로 있는 사진 (세트 · 인서트는 Gallery 의 세트 사진) ② 시트 Photo 칸 — 같은 사진을 골드 · 실버 아이템이 같이 쓰면 URL 에 코드가 들어 있는 것만 ③ 세트는 구성품 사진을 빌리지 않음.</div>' +
    '<div class="sumbox" style="margin-top:8px">지금 사진 있는 아이템 <b>' + withPh.toLocaleString() + '</b>개 · 골드/실버 섞여서 뺀 것 <b>' + st.dropped + '</b>개 · 드라이브 사진 ' + (S.settings.photoDrive ? '<b>' + st.drive + '</b>개 사용 중' : '꺼짐') + (px ? ' · 드라이브 색인 ' + Object.keys(px.pic).length + ' + 세트 ' + Object.keys(px.gal).length : '') + '</div>' +
    '<label class="pick ' + (S.settings.photoDrive ? 'on' : '') + '" id="phDrive" style="margin-top:8px"><span class="ck">✓</span><span class="pm"><b>드라이브 item_picture 사진 쓰기</b><small>새 사진은 코드 이름(예: 18KCNG01.jpg)으로 item_picture 폴더에 넣으면 THE ONE Mail 스크립트가 한 시간 안에 색인해 자동으로 붙습니다. 폴더가 "링크가 있는 모든 사용자 · 뷰어" 로 공유돼 있어야 앱에서 보입니다. <b>회사(theonefl.com) 안에서만</b> 공유하면 앱에서는 구글이 로그인 화면으로 돌려보내서 사진이 안 뜹니다 (예전 Apps Script 는 구글 주소 안에서 돌아서 보였던 것). 안 열리는 동안은 Shopify 사진이 있는 아이템만 그걸로 대신 보여 줍니다.</small></span></label>' +
    '<div class="btns"><button class="b-ghost b-sm" id="phTest">🔎 드라이브 사진 시험</button></div><div id="phTestOut"></div></div>';
}
/* ---- 인보이스 종류 — 아이템이 어느 인보이스로 갈지, 커미션은 어느 칸으로 셀지 ---- */
let IT = null;
function invTypeCard() {
  IT = invTypes(S).map(t => Object.assign({}, t));
  return '<div class="card"><h2>🧾 인보이스 종류 <span class="en">Invoice types</span></h2><div class="muted">이전 시스템과 같이 <b>A 주얼리 · P 그 외 제품 · W 디스플레이 · 세트</b>. 번호는 <b>영문 한 글자 + 다섯 자리</b> (A43107). 99999 다음은 자동으로 AA00001 → AB00001 … 로 넘어갑니다.<br>' +
    '첫 줄은 기본 (규칙에 안 맞는 아이템). 규칙은 아이템의 Group · Level 1~3 이름을 쉼표로 (예: <b>Jewelry</b>, <b>Other</b>, <b>Set &amp; Display</b>), 코드 앞글자는 <b>코드:EB</b>.<br>' +
    '<b>다음 번호</b>는 이전 시스템에서 마지막으로 쓴 번호 다음으로 맞춰 두세요 (두 프로그램을 같이 쓰는 동안 겹치지 않게). 커미션 칸은 정산서의 A · P · W 요율 중 어느 것으로 셀지입니다.</div><div id="itRows"><div class="load">읽는 중…</div></div>' +
    '<div class="btns"><button class="b-ghost" id="itAdd">＋ 종류 추가</button><button class="b-blue" id="itSave">인보이스 종류 저장</button></div></div>';
}
async function bindInvTypes() {
  let cnt = {}; try { cnt = (await S.DB.get('counters', 'inv2')) || {}; } catch (e) {}
  const paint = () => {
    $('itRows').innerHTML = IT.map((t, i) => '<div class="payrow" style="grid-template-columns:56px 1fr 120px;margin-top:8px">' +
      '<input data-it="' + i + '" data-k="c" value="' + esc(t.c) + '" placeholder="G" maxlength="1" style="text-transform:uppercase;text-align:center;font-weight:800">' +
      '<input data-it="' + i + '" data-k="n" value="' + esc(t.n) + '" placeholder="이름">' +
      sel('', [['A', '커미션 A'], ['P', '커미션 P'], ['W', '커미션 W'], ['CM', '반품(CM)']], t.comm || 'A', 'data-it="' + i + '" data-k="comm"') +
      '<input class="full" style="grid-column:1/4" data-it="' + i + '" data-k="match" value="' + esc(t.match || '') + '" placeholder="' + (i ? '규칙 (예: Hair, 코드:EB)' : '기본 — 규칙 없음') + '">' +
      '<small class="muted" style="grid-column:1/4;display:flex;align-items:center;gap:6px">다음 번호 <b>' + esc(fmtNo(t, cnt[t.c] || t.start || 1)) + '</b> <input type="number" data-itn="' + esc(t.c) + '" value="' + (cnt[t.c] || t.start || 1) + '" style="width:110px;padding:4px 8px;font-size:13px"><button class="b-ghost b-sm" data-itset="' + esc(t.c) + '">번호 맞추기</button></small>' +
      (i ? '<button class="x" data-itx="' + i + '">✕</button>' : '') + '</div>').join('');
    document.querySelectorAll('[data-it]').forEach(inp => inp.onchange = () => { const t = IT[+inp.dataset.it], k = inp.dataset.k; t[k] = k === 'c' ? inp.value.trim().toUpperCase() : inp.value.trim(); if (k === 'c') paint(); });
    document.querySelectorAll('[data-itx]').forEach(b => b.onclick = () => { IT.splice(+b.dataset.itx, 1); paint(); });
    document.querySelectorAll('[data-itset]').forEach(b => b.onclick = async () => {
      const c = b.dataset.itset, n = Math.floor(Number(document.querySelector('[data-itn="' + c + '"]').value) || 0); if (n < 1) return toast('1 이상', 'bad');
      const t = IT.find(x => x.c === c);
      if (!(await confirmBox(c + ' 다음 번호를 ' + fmtNo(t, n) + ' 로 맞출까요? (이미 쓴 번호보다 작으면 겹칩니다)', '맞추기'))) return;
      busy(true); try { const cur = (await S.DB.get('counters', 'inv2')) || {}; cur[c] = n; await S.DB.set('counters', 'inv2', cur); cnt = cur; toast(c + ' 다음 번호 ' + fmtNo(t, n), 'good'); paint(); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false);
    });
  };
  paint();
  $('itAdd').onclick = () => { IT.push({ c: '', n: '', comm: 'A', match: '' }); paint(); };
  $('itSave').onclick = async () => {
    const list = IT.filter(t => t.c).map(t => ({ c: t.c, n: t.n || t.c, comm: t.comm || 'A', match: t.match || '', start: t.start || 1 }));
    const seen = {};
    for (const t of list) {
      if (!/^[A-Z]$/.test(t.c)) return toast('종류 코드는 영문 한 글자: ' + t.c, 'bad');
      if (seen[t.c]) return toast('같은 코드가 두 번: ' + t.c, 'bad'); seen[t.c] = 1;
    }
    if (!list.length) return toast('종류가 하나는 있어야 합니다', 'bad');
    busy(true);
    try { const cur = (await S.DB.get('settings', 'app')) || {}; cur.invTypes = list; await S.DB.set('settings', 'app', cur); S.settings.invTypes = list; setInvTypeMap(list); toast('인보이스 종류 저장 — 새로 담는 아이템부터 적용', 'good'); }
    catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}

/* ---- 🧩 세트 구성 — SET_MASTER 엑셀 올리기 · 세트 하나씩 고치기 ---- */
let SETQ = '';
async function setAdmin() {
  try { await loadCatalog(S, false); } catch (e) {}
  const C = catalog(), sets = (C && C.sets) || {};
  const codes = Object.keys(sets).sort();
  const hits = SETQ ? codes.filter(k => (k + ' ' + (sets[k].n || '') + ' ' + (sets[k].old || '')).toUpperCase().includes(SETQ.toUpperCase())).slice(0, 40) : [];
  $('setBox').innerHTML = '<div class="sumbox">지금 <b>' + codes.length + '</b>개 세트</div>' +
    '<div class="muted">드라이브의 <b>SET_MASTER_코드변경_구성.xlsx</b> 를 그대로 올리면 "세트 구성" 탭(구성품 · 수량)과 "세트 목록" 탭(이름 · 리스트 가격)을 읽습니다. SET · CODE · QTY 세 칸짜리 시트도 됩니다. 올리면 전체를 바꿉니다.</div>' +
    '<div class="seg" style="margin-top:8px"><button class="on" data-sw="new">새 세트 코드 (FI-…, C4-…)</button><button data-sw="old">기존 코드 (FLSIDE01 …)</button></div>' +
    '<input type="file" id="setFile" accept=".xlsx"><div id="setOut"></div>' +
    '<div class="fg" style="margin-top:12px"><label>세트 찾아서 고치기</label><input id="setQ" value="' + esc(SETQ) + '" placeholder="세트 코드 · 이름" autocomplete="off"></div>' +
    hits.map(k => '<div class="pr tap" data-set="' + esc(k) + '"><div class="ct"><b>' + esc(k) + (sets[k].old ? ' <span class="muted">(' + esc(sets[k].old) + ')</span>' : '') + '</b><small>' + esc(sets[k].n || '') + ' · ' + sets[k].k.length + '종 · ' + sets[k].k.reduce((a, x) => a + x[1], 0) + '개' + (sets[k].st ? ' · ' + esc(sets[k].st) : '') + '</small></div></div>').join('') +
    '<button class="b-ghost b-sm" id="setNew" style="margin-top:8px">＋ 새 세트</button>';
  let which = 'new';
  document.querySelectorAll('[data-sw]').forEach(b => b.onclick = () => { which = b.dataset.sw; document.querySelectorAll('[data-sw]').forEach(x => x.classList.toggle('on', x === b)); });
  $('setQ').oninput = debounceA(() => { SETQ = $('setQ').value; setAdmin().then(() => { const q = $('setQ'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }); }, 300);
  document.querySelectorAll('[data-set]').forEach(el => el.onclick = () => setForm(el.dataset.set, sets));
  $('setNew').onclick = () => setForm('', sets);
  $('setFile').onchange = () => { const file = $('setFile').files[0]; if (file) setBookFile(file, $('setOut'), which, setAdmin); };
}
/** 🧩 세트 엑셀 하나 — 미리보기 → 올리기. which: 'new' | 'old' (세트 코드 기준) */
async function setBookFile(file, out, which, after) {
  out.innerHTML = '<div class="load">읽는 중…</div>';
  try {
    try { await loadCatalog(S, false); } catch (e) {}
    const { XLSX, wb } = await readBook(file);
    const names = wb.SheetNames;
    const comp = aoa(XLSX, wb, names.find(n => /세트\s*구성/.test(n)) || names.find(n => /SET/i.test(n) && !/목록|LIST|요약/i.test(n)) || names[0]);
    const list = aoa(XLSX, wb, names.find(n => /세트\s*목록/.test(n)) || '');
    const r = parseSetBook(comp, list, which || 'new');
    const C2 = catalog(); const miss = {}; let missN = 0;
    Object.values(r.sets).forEach(st => st.k.forEach(x => { if (C2 && !C2.byCode[x[0]]) { miss[x[0]] = 1; } }));
    missN = Object.keys(miss).length;
    const inCat = C2 ? Object.keys(r.sets).filter(k => C2.byCode[k] && !C2.byCode[k].virt).length : 0;
    out.innerHTML = '<div class="alert a-blu">세트 <b>' + Object.keys(r.sets).length + '개</b> · 구성 ' + r.lines.toLocaleString() + '줄 · 이름 있는 세트 ' + r.named + '개 (' + (which === 'old' ? '기존 코드 기준' : '새 세트 코드 기준') + ')<br>아이템 목록에 같은 코드가 있는 세트 ' + inCat + '개 (그 가격 사용) · 나머지는 세트 목록의 리스트 가격 (없으면 구성품 합)</div>' +
      (missN ? '<div class="alert a-amb">아이템 목록에 없는 구성품 코드 ' + missN + '개 — 주문는 되지만 사진 · 가격이 비어 있습니다: ' + esc(Object.keys(miss).slice(0, 12).join(', ')) + '</div>' : '') +
      '<button class="b-blue" id="setGo" style="margin-top:8px">이대로 세트 올리기 (전체 바꿈)</button>';
    $('setGo').onclick = async () => { busy(true); try { await publishSets(S, r.sets); await loadCatalog(S, true); toast('세트 ' + Object.keys(r.sets).length + '개 올림', 'good'); out.innerHTML = '<div class="alert a-grn">세트 ' + Object.keys(r.sets).length + '개 올렸습니다</div>'; (after || setAdmin)(); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
}
function debounceA(fn, ms) { let t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }
function setForm(code, sets) {
  const st = code ? JSON.parse(JSON.stringify(sets[code])) : { n: '', k: [] };
  const paint = () => {
    openModal('<h2>🧩 ' + (code ? esc(code) : '새 세트') + '</h2>' +
      '<div class="two"><div class="fg"><label>세트 코드</label><input id="sfC" value="' + esc(code) + '" ' + (code ? 'readonly' : '') + ' style="text-transform:uppercase"></div><div class="fg"><label>리스트 가격 (비우면 구성품 합)</label><input id="sfP" type="number" step="0.01" value="' + esc(st.p || '') + '"></div></div>' +
      '<div class="fg"><label>이름</label><input id="sfN" value="' + esc(st.n || '') + '"></div>' +
      '<div class="fg"><label>구성품 ' + st.k.length + '종 · ' + st.k.reduce((a, x) => a + x[1], 0) + '개</label>' + st.k.map((x, i) => {
        const it = catalog() && catalog().byCode[x[0]];
        return '<div class="invrow" style="grid-template-columns:1fr 70px 28px"><div><b>' + esc(x[0]) + '</b><small class="muted" style="display:block">' + esc(it ? it.d : '목록에 없음') + '</small></div><input type="number" min="1" data-sfq="' + i + '" value="' + x[1] + '"><button class="b-ghost b-sm" data-sfx="' + i + '" style="padding:4px">✕</button></div>';
      }).join('') + '</div>' +
      '<div class="two"><input id="sfAdd" placeholder="아이템 코드 · 바코드 + 엔터" style="text-transform:uppercase"><input id="sfAddQ" type="number" value="1" min="1"></div>' +
      '<div class="btns">' + (code ? '<button class="b-ghost" id="sfDel" style="color:#991b1b">세트 삭제</button>' : '') + '<button class="b-blue" id="sfSave">저장</button></div>');
    document.querySelectorAll('[data-sfq]').forEach(inp => inp.onchange = () => { st.k[+inp.dataset.sfq][1] = Math.max(1, Math.floor(Number(inp.value) || 1)); });
    document.querySelectorAll('[data-sfx]').forEach(b => b.onclick = () => { st.k.splice(+b.dataset.sfx, 1); keep(); paint(); });
    $('sfAdd').onkeydown = e => { if (e.key !== 'Enter') return; e.preventDefault(); const it = exactItem($('sfAdd').value); const c = it ? it.c : $('sfAdd').value.trim().toUpperCase(); if (!c) return; const q = Math.max(1, Math.floor(Number($('sfAddQ').value) || 1)); const ex = st.k.find(x => x[0] === c); if (ex) ex[1] += q; else st.k.push([c, q]); keep(); paint(); setTimeout(() => $('sfAdd').focus(), 30); };
    const keep = () => { st.n = $('sfN').value.trim(); st.p = Number($('sfP').value) || 0; if (!code) code = $('sfC').value.trim().toUpperCase(); };
    $('sfSave').onclick = async () => {
      keep(); const c = code || $('sfC').value.trim().toUpperCase(); if (!c) return toast('세트 코드를 넣으세요', 'bad'); if (!st.k.length) return toast('구성품을 넣으세요', 'bad');
      if (!st.p) delete st.p;
      const all = Object.assign({}, sets, { [c]: st });
      busy(true); try { await publishSets(S, all); await loadCatalog(S, true); closeModal(); toast('세트 저장', 'good'); setAdmin(); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false);
    };
    if ($('sfDel')) $('sfDel').onclick = async () => { if (!(await confirmBox(code + ' 세트를 지울까요?', '삭제'))) return; const all = Object.assign({}, sets); delete all[code]; busy(true); try { await publishSets(S, all); await loadCatalog(S, true); closeModal(); setAdmin(); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  };
  paint();
}

/* ============================================================
 *  🗂 분류 — 레벨 이름 바꾸기 · 순서 · 시작 단계, 그리고 일괄 변경 파일 (SBM 의 레벨 정리 · 디스크립션 · 코드 변경 파일 역할)
 * ============================================================ */
let TP = [];   // 펼친 경로 (전체 4단계 기준)
/* 이전 시스템 분류로 되돌리기 — data/sbm-tree.json (이전 시스템 LEVEL 1 · 2 · GROUP NAME, 2026-10 내보내기) 을 한 번에 적용 */
function sbmCard(C) {
  const L1 = {}; C.items.forEach(x => { if (x.l1) L1[x.l1] = 1; });
  const sbm = ['EARRING', 'NECKLACE', 'ANKLET', 'NOSE'].filter(k => L1[k]).length >= 3;
  return '<div class="card" style="border:2px solid ' + (sbm ? '#bbf7d0' : '#fdba74') + '"><h2>🐝 이전 시스템 분류 (LEVEL 1 · 2 · GROUP)</h2>' +
    (sbm ? '<div class="alert a-grn">✅ 지금 이전 시스템 분류를 쓰고 있습니다. 순서: "" 맨 앞 → " → 주얼리 ABC → [ 그 외 → &lt; * z 맨 뒤 (+ 📌 고정).</div>' :
      '<div class="alert a-amb">⚠️ 지금은 THE ONE 카탈로그 분류(Earrings · Hoops … )입니다. 아래 버튼 한 번이면 세일즈맨이 쓰던 이전 시스템 LEVEL 1 · LEVEL 2 · GROUP 으로 바뀝니다 (7,268개, Group 은 Jewelry · Other · Set &amp; Display = 인보이스 A · P · W).</div>') +
    '<div class="btns"><button class="' + (sbm ? 'b-ghost' : 'b-blue') + '" id="sbmGo">🐝 이전 시스템 분류로 ' + (sbm ? '다시 ' : '') + '바꾸기</button></div></div>';
}
const cleanLbl = n => cleanName(n) + (cleanName(n) !== String(n) ? ' (' + n + ')' : '');
/** 오타 · 잘린 이름 · 따옴표만 다른 분류 찾기 — 같은 상위 안에서 (예: INDUSTRIA / INDUSTRIAL / INDUSTRIAL") */
function findDupes(C) {
  const nz = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const out = [];
  [['l1', ['g']], ['l2', ['g', 'l1']], ['l3', ['g', 'l1', 'l2']]].forEach(([lv, par]) => {
    const groups = {};
    C.items.forEach(x => { if (!x[lv]) return; const key = par.map(k => x[k] || '').join('\u0001'); const g = groups[key] = groups[key] || { under: par.map(k => x[k] || ''), cnt: {} }; g.cnt[x[lv]] = (g.cnt[x[lv]] || 0) + 1; });
    Object.values(groups).forEach(g => {
      const names = Object.keys(g.cnt).sort((a, b) => g.cnt[b] - g.cnt[a] || b.length - a.length);
      const done = {};
      names.forEach(a => names.forEach(b => {
        if (a === b || done[b] || done[a]) return;
        const na = nz(a), nb = nz(b); if (!na || !nb) return;
        const same = na === nb, quote = b.replace(/"/g, '') === a.replace(/"/g, '') && !/""$/.test(a) && !/""$/.test(b);
        const trunc = (nb.length === 9 || nb.length === 10) && na.length > nb.length && na.startsWith(nb) && b.length <= 10;   // 이전 시스템 10자 잘림
        if (same || quote || trunc) { out.push({ lv, under: g.under, keep: a, drop: b, nk: g.cnt[a], nd: g.cnt[b], why: same ? '기호만 다름' : quote ? '따옴표' : '잘린 이름' }); done[b] = 1; }
      }));
    });
  });
  return out;
}
function dupeCard(C) {
  const d = findDupes(C);
  return '<div class="card"><h2>🧹 비슷한 이름 합치기</h2><div class="muted">같은 상위 안에서 오타 · 잘린 이름(이전 시스템 10자) · 따옴표만 다른 분류를 찾았습니다. "합치기"를 누르면 아이템이 많은 쪽 이름으로 합쳐집니다.</div>' +
    (d.length ? d.map((x, i) => '<div class="pr"><div class="ct"><b>' + esc(x.drop) + ' <span class="muted">(' + x.nd + ')</span> → ' + esc(x.keep) + ' <span class="muted">(' + x.nk + ')</span></b><small>' + esc(x.under.filter(Boolean).map(cleanLbl).join(' › ')) + ' · ' + x.why + '</small></div><button class="b-blue b-sm" data-dupe="' + i + '">합치기</button></div>').join('') + (d.length > 1 ? '<div class="btns"><button class="b-ghost" id="dupeAll">모두 합치기 (' + d.length + ')</button></div>' : '') : '<div class="none">지금은 비슷한 이름이 없습니다 ✅</div>') + '</div>';
}
function pinOf(name) { const P = pins(), k = String(name).toUpperCase(); if (P.top.some(x => x.toUpperCase() === k)) return 'top'; if (P.bottom.some(x => x.toUpperCase() === k)) return 'bottom'; return ''; }
/** 아이템별 판매 파일 → [[code, qty]…] 많이 나간 순. 머리글에서 Item/Code 열과 Qty/수량 열을 찾음 (머리글 줄은 위에서 20줄 안) */
export function parsePop(t) {
  if (!t || t.length < 2) return null;
  for (let h = 0; h < Math.min(20, t.length); h++) {
    const hr = t[h].map(x => String(x || '').trim().toLowerCase());
    const ic = hr.findIndex(x => /^(item|item ?code|item ?#|item ?no|code|코드)$/.test(x)), iq = hr.findIndex(x => /^(total ?qty|qty|quantity|수량|sold|판매수량)$/.test(x));
    if (ic < 0 || iq < 0) continue;
    const m = {};
    for (let i = h + 1; i < t.length; i++) { const c = String(t[i][ic] || '').trim().toUpperCase(), q = Number(String(t[i][iq] || '').replace(/[^0-9.\-]/g, '')); if (!c || !q || /^total/i.test(c)) continue; m[c] = (m[c] || 0) + q; }
    return Object.keys(m).map(c => [c, Math.round(m[c])]).filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]);
  }
  return null;
}
async function treeAdmin() {
  $('adminBody').innerHTML = '<div class="load">읽는 중…</div>';
  try { await loadCatalog(S); } catch (e) {}
  const C = catalog(); if (!C || !C.items.length) { $('adminBody').innerHTML = '<div class="card"><div class="none">먼저 📦 아이템을 올려 주세요</div></div>'; return; }
  const start = catStart(S);
  let node = C.tree, under = [];
  for (const p of TP) { if (node.map[p]) { node = node.map[p]; under.push(p); } else break; }
  TP = under.slice();
  const depth = under.length;   // 0=Group 1=Level1 2=Level2 3=Level3
  const LV = ['Group', 'Level 1', 'Level 2', 'Level 3'];
  const crumbs = '<div class="chips" style="margin-top:0"><button class="' + (depth ? '' : 'on') + '" data-tp="0">전체</button>' + under.map((p, i) => '<button class="' + (i === under.length - 1 ? 'on' : '') + '" data-tp="' + (i + 1) + '">' + esc(p) + '</button>').join('') + '</div>';
  const kids = node.kids;
  $('adminBody').innerHTML = '<div class="card"><h2>🗂 분류 (' + C.items.length.toLocaleString() + '개 아이템)</h2>' +
    '<div class="btns" style="justify-content:flex-start;margin:0 0 6px"><button class="b-blue b-sm" id="tLvTool">📥 레벨 · 그룹 일괄 변경 (엑셀)</button><button class="b-ghost b-sm" onclick="location.hash=\'#/items\'">🏷 아이템 전체 보기 · 🙈 숨기기 · 분류 옮기기</button></div><div class="muted">주문 화면의 품목 단계입니다 (🙈 숨김 아이템은 빠짐). 순서 규칙: <b>📌 위에 고정 → ABC 순 → 📌 아래에 고정</b> (분류 안의 아이템은 코드 순). 이름을 바꾸면 그 분류의 아이템 전체에 적용됩니다. 아이템을 다른 분류로 옮기는 건 아래 "일괄 변경 파일"로 합니다.</div>' +
    '<div class="fg" style="margin-top:8px"><label>주문 화면 시작 단계</label><div class="seg"><button class="' + (start === 'l1' ? 'on' : '') + '" data-cs="l1">Level 1 부터 (ANKLET · EARRING … SBMGo 처럼)</button><button class="' + (start === 'g' ? 'on' : '') + '" data-cs="g">Group 부터 (Jewelry · Beauty …)</button></div></div>' +
    crumbs + '<div class="muted" style="margin:4px 0">' + esc(LV[depth]) + ' · ' + kids.length + '개</div>' +
    kids.map(k => { const pt = pinOf(k.name); return '<div class="pr"><div class="ct tap" data-tin="' + esc(k.name) + '"><b>' + (pt === 'top' ? '📌 ' : pt === 'bottom' ? '📍 ' : '') + esc(k.name) + '</b><small>' + k.n.toLocaleString() + '개' + (k.kids.length ? ' · 하위 ' + k.kids.length : '') + (pt === 'top' ? ' · 위에 고정' : pt === 'bottom' ? ' · 아래에 고정' : '') + '</small></div>' +
      '<button class="b-ghost b-sm' + (pt === 'top' ? ' on' : '') + '" data-tup="' + esc(k.name) + '" title="위에 고정" style="' + (pt === 'top' ? 'background:#fef3c7' : '') + '">📌↑</button><button class="b-ghost b-sm" data-tdn="' + esc(k.name) + '" title="아래에 고정" style="' + (pt === 'bottom' ? 'background:#fef3c7' : '') + '">📍↓</button>' + (depth >= 1 ? '<button class="b-ghost b-sm" data-tloc="' + esc(k.name) + '" title="창고 위치 (통로)">📍' + esc(catLocs()[locKey(under.slice(1).concat([k.name]))] || '') + '</button>' : '') + '<button class="b-ghost b-sm" data-tren="' + esc(k.name) + '" title="이름 바꾸기">✏️</button>' + (depth >= 1 ? '<button class="b-ghost b-sm" data-tmv="' + esc(k.name) + '" title="다른 곳으로 옮기기">➡️</button>' : '') + '</div>'; }).join('') + '</div>' +
    (depth >= 1 ? '<div class="btns"><button class="b-ghost" id="tItems">📋 이 분류의 아이템 ' + node.n.toLocaleString() + '개 보기 · 하나씩 바꾸기</button></div><div id="tItemList"></div>' : '') + '</div>' +
    '<div class="card"><h2>🔎 코드로 아이템 분류 바꾸기</h2><div class="muted">아이템 코드(또는 바코드)를 치면 지금 분류가 보이고 Group · Level 1 · 2 · 3 을 바로 고칠 수 있습니다. 아이템을 다른 Level 1 로 옮기거나, 새 Level 이름을 만들 때 쓰세요.</div><div class="fg" style="margin-top:8px"><input id="tCode" placeholder="예: AHG103" autocomplete="off" style="text-transform:uppercase"></div><div id="tCodeOut"></div>' +
    '<div class="card"><h2>✨ 자주 나가는 아이템</h2><div class="muted">주문 화면 맨 위 "✨ 자주 나가는" 칸의 순서입니다. 가게가 최근에 산 것이 먼저 나오고, 그 다음 이 목록 순서입니다. 이전 시스템의 <b>Sales Report by Item</b>(엑셀) 처럼 <b>Item</b>(코드) 과 <b>Qty</b>(수량) 열이 있는 파일을 올리면 많이 나간 순으로 저장됩니다.' + (popularCodes().length ? ' 지금 <b>' + popularCodes().length + '개</b> 올라와 있음.' : ' 아직 없음.') + '</div>' +
    '<div class="fg" style="margin-top:8px"><input type="file" id="popFile" accept=".xlsx,.csv"></div><div id="popOut"></div></div>' +
    '<div class="card"><h2>📍 창고 위치 가져오기 — 재고 사이트 통로</h2><div class="muted">재고 · UPS 사이트(theonecorp.vercel.app) → 재고 → 상품 → <b>내보내기</b> 로 받은 파일(CSV · 엑셀)을 그대로 고르세요. <b>상품 코드</b>와 <b>통로(Corredor)</b> 두 칸만 읽고, 가격 · 설명 같은 다른 칸은 건드리지 않습니다. 아이템마다 위치가 들어가 픽킹 리스트가 통로 순으로 나옵니다. 분류 대부분이 한 통로에 있으면 그 분류의 기본 위치도 같이 채워 새 아이템도 자동으로 그 통로를 따릅니다.</div>' +
    '<div class="fg" style="margin-top:8px"><input type="file" id="locFile" accept=".csv,.xlsx,.xls,.txt"></div><div id="locOut"></div></div>' +
    sbmCard(C) + dupeCard(C) +
    '<div class="card"><h2>📄 일괄 변경 파일 — 이전 시스템 편의 파일 그대로</h2><div class="muted">이전 시스템에서 쓰던 <b>LEVEL_1_AND_2</b> (ITEM CODE · LEVEL 1 · LEVEL 2) 와 <b>GROUP_NAME_CHANGE</b> (ITEM CODE · CURRENT GROUP NAME · NEW GROUP NAME) 파일을 그대로 올리면 됩니다. 아래에서 지금 상태를 같은 모양으로 받아 엑셀에서 고친 뒤 다시 올리세요. 이전 시스템 내보내기에서 칸이 깨진 줄(줄바꿈 · 탭)도 알아서 살려 읽습니다.<br>' +
    'LEVEL 파일에서 <b>LEVEL 1 이 빈 줄은 🙈 숨김</b>(이전 시스템처럼 세일즈맨 주문 화면에서 빠짐), 레벨이 있으면 보임으로 바뀝니다. Level 1 이름의 앞글자로 Group(인보이스 A · P · W)이 정해집니다: 보통 이름 → Jewelry(A), [ ] → Other(P), "" → Set &amp; Display(W). GROUP NAME 은 Level 3 으로 들어갑니다 (NEW 가 비어 있으면 CURRENT 그대로).<br>' +
    '그 밖의 열도 됩니다 (<b>있는 열만</b> 바꾸고 빈 칸은 그대로): Code(필수) · NewCode · Description · Price · SRP · Barcode · Group · Level 1 · 2 · 3 · Photo · Hide(x 숨김 / n 보임) · Delete(x). 목록에 없는 코드에 Description 과 Price 가 있으면 새 아이템으로 추가됩니다.</div>' +
    '<div class="btns" style="flex-wrap:wrap"><button class="b-ghost" id="tDlLevel">⬇️ LEVEL_1_AND_2.xlsx</button><button class="b-ghost" id="tDlGroup">⬇️ GROUP_NAME_CHANGE.xlsx</button><button class="b-ghost" id="tCsv">⬇️ 전체 CSV</button></div>' +
    '<div class="sumbox" style="margin-top:10px"><b>📊 구글 시트에서 바로 반영</b><div class="muted">편의 파일들을 구글 시트 탭(LEVEL_1_AND_2 · GROUP_NAME_CHANGE · POPULAR)으로 두고 거기서 고친 뒤, 여기서 탭을 누르면 읽어 와서 미리보기 → 적용합니다. 시트는 <b>공유 → 일반 액세스 → 링크가 있는 모든 사용자 · 뷰어</b> 여야 합니다.</div>' +
    '<div style="display:flex;gap:6px;margin-top:6px"><input id="gsUrl" placeholder="구글 시트 주소 붙여넣기" value="' + esc(S.settings.catSheet || '') + '" style="flex:1"><button class="b-ghost b-sm" id="gsSave">연결</button></div>' +
    (S.settings.catSheet ? '<div class="btns" style="flex-wrap:wrap;margin-top:8px"><button class="b-blue b-sm" data-gs="LEVEL_1_AND_2">📥 LEVEL_1_AND_2 반영</button><button class="b-blue b-sm" data-gs="GROUP_NAME_CHANGE">📥 GROUP_NAME_CHANGE 반영</button><button class="b-ghost b-sm" data-gs="POPULAR">✨ POPULAR 반영</button></div><div style="display:flex;gap:6px;margin-top:6px"><input id="gsTab" placeholder="다른 탭 이름 (예: TreeUpdate)" style="flex:1"><button class="b-ghost b-sm" data-gs="_">📥 이 탭 반영</button></div><a class="muted" href="https://docs.google.com/spreadsheets/d/' + esc(S.settings.catSheet) + '" target="_blank" rel="noopener">시트 열기 ↗</a>' : '') + '</div>' +
    '<div class="fg" style="margin-top:8px"><input type="file" id="tFile" accept=".xlsx,.csv"></div><div id="tOut"></div></div>';
  document.querySelectorAll('[data-cs]').forEach(b => b.onclick = async () => { busy(true); try { const cur = (await S.DB.get('settings', 'app')) || {}; cur.catStart = b.dataset.cs; await S.DB.set('settings', 'app', cur); S.settings.catStart = b.dataset.cs; toast('저장'); treeAdmin(); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); });
  document.querySelectorAll('[data-tp]').forEach(b => b.onclick = () => { TP = TP.slice(0, +b.dataset.tp); treeAdmin(); });
  document.querySelectorAll('[data-tin]').forEach(el => el.onclick = () => { if (depth < 3) { TP = under.concat([el.dataset.tin]); treeAdmin(); } });
  const lvKey = ['g', 'l1', 'l2', 'l3'][depth];
  /* 📍 분류 기본 창고 위치 — 이 분류 아이템 중 자기 위치가 없는 것이 이 통로로 정렬됨 (픽킹 리스트) */
  document.querySelectorAll('[data-tloc]').forEach(b => b.onclick = () => {
    const name = b.dataset.tloc, key = locKey(under.slice(1).concat([name])), now = catLocs()[key] || '';
    openModal('<h2>📍 ' + esc(name) + ' — 창고 위치</h2><div class="muted">이 분류(하위 포함) 아이템의 기본 통로 · 선반입니다. 예: <b>A</b>, <b>A-03</b>, <b>12-4</b>. 아이템에 따로 적은 위치가 있으면 그게 먼저입니다. 픽킹 리스트가 이 순서로 정렬됩니다.</div><div class="fg" style="margin-top:8px"><input id="clIn" value="' + esc(now) + '" autocapitalize="characters" style="text-transform:uppercase;font-size:20px;font-weight:800;text-align:center" placeholder="A-03"></div><div class="btns"><button class="b-ghost" id="clX">취소</button><button class="b-blue" id="clOk">저장</button></div>');
    $('clX').onclick = closeModal; setTimeout(() => $('clIn') && $('clIn').focus(), 50);
    $('clOk').onclick = async () => { const v = $('clIn').value.trim().toUpperCase(); closeModal(); busy(true);
      try { const cur = (await S.DB.get('settings', 'app')) || {}; const m = Object.assign({}, cur.catLoc || {}); if (v) m[key] = v; else delete m[key]; cur.catLoc = m; await S.DB.set('settings', 'app', cur); S.settings.catLoc = m; setLocs(m); toast('📍 ' + name + ' → ' + (v || '비움'), 'good'); treeAdmin(); }
      catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  });
  document.querySelectorAll('[data-tren]').forEach(b => b.onclick = () => {
    const from = b.dataset.tren;
    openModal('<h2>✏️ ' + esc(LV[depth]) + ' 이름 바꾸기</h2><div class="muted">' + esc(under.join(' › ') || '전체') + ' 안의 <b>' + esc(from) + '</b></div><div class="fg" style="margin-top:8px"><input id="trNew" value="' + esc(from) + '"></div><div class="muted">같은 이름이 이미 있으면 거기에 합쳐집니다.</div><div class="btns"><button class="b-ghost" id="trX">닫기</button><button class="b-blue" id="trOk">바꾸기</button></div>');
    $('trX').onclick = closeModal;
    $('trOk').onclick = async () => {
      const to = $('trNew').value.trim(); if (!to || to === from) return closeModal();
      closeModal(); busy(true);
      try { const r = await editCatalog(S, (rows, cats) => ({ n: renameCat(rows, cats, lvKey, under, from, to) })); toast(r.n + '개 아이템 분류 이름 변경', 'good'); treeAdmin(); }
      catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
      busy(false);
    };
  });
  /* 📌 고정 — 이름으로 저장 (어느 단계에 있어도 같은 이름이면 같이 적용) */
  const pin = async (name, where) => {
    const P = pins(), cur = pinOf(name);
    const top = P.top.filter(x => x.toUpperCase() !== name.toUpperCase()), bottom = P.bottom.filter(x => x.toUpperCase() !== name.toUpperCase());
    if (cur !== where) (where === 'top' ? top : bottom).push(name);
    busy(true);
    try { const c = (await S.DB.get('settings', 'app')) || {}; c.catPins = { top, bottom }; await S.DB.set('settings', 'app', c); S.settings.catPins = c.catPins; setPins(c.catPins); toast(cur === where ? '고정 해제' : where === 'top' ? '📌 위에 고정' : '📍 아래에 고정'); treeAdmin(); }
    catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
  document.querySelectorAll('[data-tup]').forEach(b => b.onclick = () => pin(b.dataset.tup, 'top'));
  document.querySelectorAll('[data-tdn]').forEach(b => b.onclick = () => pin(b.dataset.tdn, 'bottom'));
  $('popFile').onchange = () => { const file = $('popFile').files[0]; if (file) popFileImport(file, $('popOut'), treeAdmin); };
  /* ➡️ 분류 옮기기 — 같은 단계의 다른 상위를 고름 (Level 1 은 Group 으로, Level 2 는 다른 Level 1 로 …) */
  const parents = (() => { const out = []; const walk = (nd, path) => { if (path.length === depth) { out.push(path); return; } nd.kids.forEach(k => walk(k, path.concat([k.name]))); }; walk(C.tree, []); return out; })();
  document.querySelectorAll('[data-tmv]').forEach(b => b.onclick = () => {
    const name = b.dataset.tmv, curKey = under.join(' › ');
    openModal('<h2>➡️ ' + esc(LV[depth]) + ' 옮기기</h2><div class="muted"><b>' + esc(cleanLbl(name)) + '</b> (' + esc(LV[depth]) + ') 를 어디 아래로 옮길까요? 지금: ' + esc(curKey || '맨 위') + '</div>' +
      '<div class="fg" style="margin-top:8px"><label>옮길 곳 (' + esc(LV[depth - 1]) + ')</label>' + sel('tmvTo', parents.map(p => [p.join('\u0001'), p.map(cleanLbl).join(' › ')]), under.join('\u0001')) + '</div>' +
      '<div class="fg"><label>또는 새 ' + esc(LV[depth - 1]) + ' 이름 (위 선택 대신)</label><input id="tmvNew" placeholder="' + (depth === 1 ? 'Jewelry · Other · Set & Display 중 하나' : '새 이름') + '"></div>' +
      (depth === 1 ? '<div class="alert a-blu">Group 은 인보이스 종류와 연결됩니다: Jewelry → A, Other → P, Set &amp; Display → W</div>' : '') +
      '<div class="btns"><button class="b-ghost" id="tmvX">닫기</button><button class="b-blue" id="tmvOk">옮기기</button></div>');
    $('tmvX').onclick = closeModal;
    $('tmvOk').onclick = async () => {
      let to = $('tmvTo').value.split('\u0001'); const nw = $('tmvNew').value.trim();
      if (nw) { to = depth === 1 ? [nw] : under.slice(0, depth - 1); if (depth > 1) to[depth - 2] = nw; }
      if (to.join('\u0001') === under.join('\u0001')) return toast('같은 곳입니다', 'bad');
      closeModal(); busy(true);
      try { const r = await editCatalog(S, (rows, cats) => { ensureCats(rows, cats); return { n: moveCatTo(rows, cats, depth, under, name, to) }; }); toast(r.n + '개 아이템 → ' + to.map(cleanLbl).join(' › '), 'good'); TP = to; treeAdmin(); }
      catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
      busy(false);
    };
  });
  /* 📋 이 분류의 아이템 — 하나씩 바꾸기 */
  if ($('tItems')) $('tItems').onclick = () => {
    const list = C.items.filter(x => { const L = [x.g, x.l1, x.l2, x.l3]; return under.every((u, i) => L[i] === u); }).slice(0, 300);
    $('tItemList').innerHTML = list.map(x => '<div class="pr"><div class="ct"><b>' + esc(x.c) + (x.h ? ' <span class="tag t-x">🙈</span>' : '') + '</b><small>' + esc(x.d) + ' · ' + esc([x.l1, x.l2, x.l3].filter(Boolean).map(cleanLbl).join(' › ')) + '</small></div><button class="b-ghost b-sm" data-tfix="' + esc(x.c) + '">바꾸기</button></div>').join('') + (node.n > 300 ? '<div class="muted">300개까지만 보입니다 — 나머지는 아래 "코드로 바꾸기"로</div>' : '');
    $('tItemList').querySelectorAll('[data-tfix]').forEach(bb => bb.onclick = () => itemFix(bb.dataset.tfix));
  };
  /* 🔎 코드로 바꾸기 */
  $('tCode').oninput = () => { const it = exactItem($('tCode').value); $('tCodeOut').innerHTML = it ? '<div class="pr"><div class="ct"><b>' + esc(it.c) + '</b><small>' + esc(it.d) + '</small><small>' + esc([it.g, it.l1, it.l2, it.l3].filter(Boolean).map(cleanLbl).join(' › ')) + '</small></div><button class="b-blue b-sm" id="tCodeGo">분류 바꾸기</button></div>' : ($('tCode').value.trim() ? '<div class="muted">맞는 코드가 없습니다</div>' : ''); if ($('tCodeGo')) $('tCodeGo').onclick = () => itemFix(it.c); };
  function itemFix(code) {
    const it = C.byCode[code]; if (!it) return;
    const names = { g: [], l1: [], l2: [], l3: [] }; C.items.forEach(x => { ['g', 'l1', 'l2', 'l3'].forEach(k => { if (x[k] && !names[k].includes(x[k])) names[k].push(x[k]); }); });
    const dl = k => '<datalist id="dl_' + k + '">' + names[k].sort().map(v => '<option value="' + esc(v) + '">').join('') + '</datalist>';
    openModal('<h2>' + esc(it.c) + '</h2><div class="muted">' + esc(it.d) + '</div>' +
      ['g', 'l1', 'l2', 'l3'].map((k, i) => '<div class="fg"><label>' + LV[i] + (k === 'g' ? ' (Jewelry → A · Other → P · Set & Display → W)' : '') + '</label><input id="tf_' + k + '" list="dl_' + k + '" value="' + esc(it[k] || '') + '" autocomplete="off">' + dl(k) + '</div>').join('') +
      '<div class="muted">목록에 없는 이름을 적으면 새 분류가 만들어집니다. 비우면 그 단계 없음.</div><div class="btns"><button class="b-ghost" id="tfX">닫기</button><button class="b-blue" id="tfOk">저장</button></div>');
    $('tfX').onclick = closeModal;
    $('tfOk').onclick = async () => {
      const set = { g: $('tf_g').value.trim(), l1: $('tf_l1').value.trim(), l2: $('tf_l2').value.trim(), l3: $('tf_l3').value.trim() };
      if (!set.l1) return toast('Level 1 은 있어야 합니다', 'bad');
      closeModal(); busy(true);
      try { await editCatalog(S, (rows, cats, sets) => applyBulk(rows, cats, sets, [{ code: it.c, set }])); toast(it.c + ' → ' + [set.l1, set.l2, set.l3].filter(Boolean).map(cleanLbl).join(' › '), 'good'); treeAdmin(); }
      catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
      busy(false);
    };
  }
  const DUP = findDupes(C);
  const mergeDupes = async (list) => {
    busy(true);
    try { const r = await editCatalog(S, (rows, cats) => { let n = 0; list.forEach(x => { n += renameCat(rows, cats, x.lv, x.under, x.drop, x.keep); }); return { n }; }); toast(list.length + '개 이름 합침 · 아이템 ' + r.n + '개', 'good'); treeAdmin(); }
    catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
  document.querySelectorAll('[data-dupe]').forEach(b => b.onclick = async () => { const x = DUP[+b.dataset.dupe]; if (await confirmBox(x.drop + ' → ' + x.keep + ' 으로 합칠까요? (' + x.nd + '개 아이템)', '합치기')) mergeDupes([x]); });
  if ($('dupeAll')) $('dupeAll').onclick = async () => { if (await confirmBox(DUP.length + '개를 모두 합칠까요?', '모두 합치기')) mergeDupes(DUP); };
  if ($('sbmGo')) $('sbmGo').onclick = async () => {
    if (!(await confirmBox('모든 아이템의 분류를 이전 시스템의 LEVEL 1 · LEVEL 2 · GROUP 으로 바꿀까요? (Group 은 Jewelry · Other · Set & Display 로 — 인보이스 A · P · W 와 연결)', '바꾸기'))) return;
    busy(true);
    try {
      const res = await fetch('data/sbm-tree.json?v=' + Date.now()); if (!res.ok) throw new Error('data/sbm-tree.json 을 읽지 못했습니다');
      const m = await res.json();
      const patches = Object.keys(m).map(c => ({ code: c, set: { g: m[c][0], l1: m[c][1], l2: m[c][2], l3: m[c][3] } }));
      const r = await editCatalog(S, (rows, cats, sets) => { cats.length = 0; return applyBulk(rows, cats, sets, patches); });
      toast('이전 시스템 분류로 바꿨습니다 — ' + r.changed + '개 (목록에 없는 코드 ' + r.missing.length + ')', 'good'); TP = []; treeAdmin();
    } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
  const dlXlsx = async (rows, name) => { busy(true); try { const XLSX = await loadXlsx(); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1'); XLSX.writeFile(wb, name); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); };
  $('tLvTool').onclick = () => levelTool(S, treeAdmin);
  $('tDlLevel').onclick = () => dlXlsx(sbmLevelRows(), 'LEVEL_1_AND_2_' + today() + '.xlsx');
  $('tDlGroup').onclick = () => dlXlsx(sbmGroupRows(), 'GROUP_NAME_CHANGE_' + today() + '.xlsx');
  $('tCsv').onclick = () => { const blob = new Blob([catalogCsv()], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'the-one-items-' + today() + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  $('locFile').onchange = () => { const file = $('locFile').files[0]; if (file) locFileImport(file, $('locOut'), treeAdmin); };
  $('tFile').onchange = () => { const file = $('tFile').files[0]; if (file) bulkFile(file, $('tOut'), treeAdmin); };
  /* 📊 구글 시트에서 바로 읽기 */
  const sheetIdOf = v => { const m = String(v || '').match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/) || String(v || '').match(/^([A-Za-z0-9_-]{20,})$/); return m ? m[1] : ''; };
  $('gsSave').onclick = async () => {
    const id = sheetIdOf($('gsUrl').value); if (!id) return toast('구글 시트 주소(또는 ID)를 확인하세요', 'bad');
    busy(true); try { const cur = (await S.DB.get('settings', 'app')) || {}; cur.catSheet = id; await S.DB.set('settings', 'app', cur); S.settings.catSheet = id; toast('시트 연결 저장', 'good'); treeAdmin(); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false);
  };
  document.querySelectorAll('[data-gs]').forEach(b => b.onclick = async () => {
    const id = S.settings.catSheet; const tab = b.dataset.gs === '_' ? $('gsTab').value.trim() : b.dataset.gs; if (!id || !tab) return toast('시트와 탭 이름을 확인하세요', 'bad');
    const out = $('tOut'); out.innerHTML = '<div class="load">구글 시트 "' + esc(tab) + '" 읽는 중…</div>';
    try {
      const t = await readSheetTab(id, tab);
      if (tab.toUpperCase() === 'POPULAR' || /popular|자주/i.test(tab)) {
        const r = parsePop(t); if (!r || !r.length) throw new Error('POPULAR 탭에 ITEM · QTY 가 없습니다');
        const C = catalog(), known = r.filter(x => C.byCode[x[0]]);
        out.innerHTML = '<div class="alert a-blu">✨ ' + known.length + '개 (목록에 있는 것) · 상위: ' + esc(known.slice(0, 6).map(x => x[0] + ' ' + x[1]).join(', ')) + '</div><div class="btns"><button class="b-blue" id="tGo">저장</button></div>';
        $('tGo').onclick = async () => { busy(true); try { await S.DB.set('catalog', 'pop', { j: JSON.stringify(known.slice(0, 1000)), n: known.length, updatedAt: new Date().toISOString(), by: S.user.email }); await loadCatalog(S, true); toast('✨ 자주 나가는 ' + known.length + '개 저장', 'good'); treeAdmin(); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
        return;
      }
      previewBulk(t, tab, out);
    } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '<br><span class="muted">시트가 "링크가 있는 모든 사용자 · 뷰어" 로 공유돼 있는지, 탭 이름이 맞는지 확인하세요.</span></div>'; }
  });
}
/** ✨ 자주 나가는 아이템 파일 하나 (Item · Qty) */
async function popFileImport(file, out, after) {
  out.innerHTML = '<div class="load">읽는 중…</div>';
  try {
    try { await loadCatalog(S); } catch (e) {}
    const { XLSX, wb } = await readBook(file);
    let best = null;
    for (const name of wb.SheetNames) { const t = aoa(XLSX, wb, name); const r = parsePop(t); if (r && (!best || r.length > best.length)) best = r; }
    if (!best || !best.length) throw new Error('Item(코드) 열과 Qty(수량) 열을 찾지 못했습니다');
    const C = catalog(), known = best.filter(r => C.byCode[r[0]]);
    out.innerHTML = '<div class="alert a-blu">' + best.length + '개 코드 (목록에 있는 것 ' + known.length + '개). 상위: ' + esc(known.slice(0, 8).map(r => r[0] + ' ' + r[1]).join(', ')) + '</div><div class="btns"><button class="b-blue" id="popGo">저장</button></div>';
    $('popGo').onclick = async () => { busy(true); try { await S.DB.set('catalog', 'pop', { j: JSON.stringify(known.slice(0, 1000)), n: known.length, updatedAt: new Date().toISOString(), by: S.user.email }); await loadCatalog(S, true); toast('✨ 자주 나가는 ' + known.length + '개 저장', 'good'); out.innerHTML = '<div class="alert a-grn">✨ 자주 나가는 ' + known.length + '개 저장</div>'; (after || treeAdmin)(); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
  } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
}
/** 📍 창고 위치 파일 하나 (코드 + 통로) */
async function locFileImport(file, out, after) {
  out.innerHTML = '<div class="load">읽는 중…</div>';
  try {
    try { await loadCatalog(S); } catch (e) {}
    let t;
    if (/\.(csv|txt)$/i.test(file.name)) { const text = (await file.text()).replace(/^﻿/, ''); t = parseCsv(text, csvDelim(text.split(/\r?\n/)[0] || '')); }
    else { const { XLSX, wb } = await readBook(file); t = aoa(XLSX, wb, wb.SheetNames[0]); }
    const r = parseLocSheet(t);
    const rows = catalog().rows.map(x => x.slice()), cats = catalog().cats.map(x => x.slice()), sets = JSON.parse(JSON.stringify(catalog().sets || {}));
    const sum = applyBulk(rows, cats, sets, r.patches);
    const sug = suggestCatLocs(rows), cur = catLocs(), newSug = Object.keys(sug).filter(k => cur[k] !== sug[k]);
    const aisles = {}; r.patches.forEach(p => { const a = p.set.loc.split(/[-.\s/]/)[0]; aisles[a] = (aisles[a] || 0) + 1; });
    const al = Object.keys(aisles).sort(new Intl.Collator('en', { numeric: true }).compare);
    out.innerHTML = '<div class="alert a-blu">파일 위치 <b>' + r.patches.length.toLocaleString() + '</b>줄 · 목록에 있는 아이템 중 바뀌는 것 <b>' + sum.changed.toLocaleString() + '</b>개 · 통로 ' + al.length + '개 (' + esc(al.slice(0, 30).join(' · ')) + (al.length > 30 ? ' …' : '') + ')' + (r.blank ? '<br>통로가 비어 있는 줄 ' + r.blank + '개는 건너뜀' : '') + '</div>' +
      (sum.missing.length ? '<div class="alert a-amb">우리 아이템 목록에 없는 코드 ' + sum.missing.length + '개 (건너뜀): ' + esc(sum.missing.slice(0, 12).join(', ')) + '</div>' : '') +
      (newSug.length ? '<label class="pick on" id="locCat" style="margin-top:6px"><span class="ck">✓</span><span class="pm"><b>분류 기본 위치도 채우기 · ' + newSug.length + '개 분류</b><small>' + esc(newSug.slice(0, 8).map(k => k.split('\u0001').join(' › ') + ' → ' + sug[k]).join(' / ')) + (newSug.length > 8 ? ' …' : '') + '</small></span></label>' : '') +
      (sum.changed || newSug.length ? '<button class="b-blue" id="locGo" style="margin-top:8px">이대로 적용</button>' : '<div class="none">바뀌는 것이 없습니다</div>');
    if ($('locCat')) $('locCat').onclick = () => $('locCat').classList.toggle('on');
    if ($('locGo')) $('locGo').onclick = async () => {
      const withCat = $('locCat') && $('locCat').classList.contains('on');
      if (!(await confirmBox(sum.changed.toLocaleString() + '개 아이템 위치' + (withCat ? ' + 분류 ' + newSug.length + '개 기본 위치' : '') + '를 저장할까요? 모든 폰의 픽킹 리스트에 반영됩니다.', '적용'))) return;
      busy(true);
      try {
        if (sum.changed) await editCatalog(S, (rw, ct, st) => applyBulk(rw, ct, st, r.patches));
        if (withCat) { const app = (await S.DB.get('settings', 'app')) || {}; const m = Object.assign({}, app.catLoc || {}); newSug.forEach(k => { m[k] = sug[k]; }); app.catLoc = m; await S.DB.set('settings', 'app', app); S.settings.catLoc = m; setLocs(m); }
        toast('📍 위치 저장 — 아이템 ' + sum.changed + (withCat ? ' · 분류 ' + newSug.length : ''), 'good'); out.innerHTML = '<div class="alert a-grn">📍 위치 저장 — 아이템 ' + sum.changed + (withCat ? ' · 분류 ' + newSug.length : '') + '</div>'; (after || treeAdmin)();
      } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
      busy(false);
    };
  } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
}
/** 📄 일괄 변경 파일 하나 (LEVEL_1_AND_2 · GROUP_NAME_CHANGE · TreeUpdate · Code + 바꿀 열) */
async function bulkFile(file, out, after) {
  out.innerHTML = '<div class="load">읽는 중…</div>';
  try {
    try { await loadCatalog(S); } catch (e) {}
    let t, name;
    if (/\.(csv|txt)$/i.test(file.name)) { const text = (await file.text()).replace(/^﻿/, ''); t = parseCsv(text, csvDelim(text.split(/\r?\n/)[0] || '')); name = file.name; }
    else { const { XLSX, wb } = await readBook(file); name = wb.SheetNames.find(n => /treeupdate|items|아이템|변경|level|group/i.test(n)) || wb.SheetNames[0]; t = aoa(XLSX, wb, name); }
    previewBulk(t, name, out, after);
  } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
}
/** 일괄 변경 미리보기 → 적용 (파일 · 구글 시트 공용) */
function previewBulk(t, name, out, after) {
  const r = parseBulkSheet(t);
  const rows = catalog().rows.map(x => x.slice()), cats = catalog().cats.map(x => x.slice()), sets = JSON.parse(JSON.stringify(catalog().sets || {}));
  const sum = applyBulk(rows, cats, sets, r.patches);
  const lab = { nc: '코드 변경', d: 'Description', p: 'Price', s: 'SRP', b: 'Barcode', g: 'Group', l1: 'Level 1', l2: 'Level 2', l3: 'Level 3', ph: 'Photo', h: '🙈 숨김 · 보임', del: '삭제' };
  out.innerHTML = '<div class="alert a-blu">탭 <b>' + esc(name) + '</b> · ' + r.patches.length.toLocaleString() + '줄 · 바꾸는 열: ' + r.cols.map(k => lab[k]).join(', ') + '<br>바뀌는 아이템 <b>' + sum.changed.toLocaleString() + '</b> · 코드 변경 ' + sum.renamed + ' · 새 아이템 ' + sum.added + ' · 삭제 ' + sum.deleted + (sum.hidden || sum.shown ? ' · 🙈 숨김 ' + sum.hidden + ' · 👁 보임 ' + sum.shown : '') + '</div>' +
    (r.blankHides ? '<div class="alert a-amb">LEVEL 1 이 빈 줄은 숨김으로, 레벨이 있는 줄은 보임으로 맞춥니다 (이전 시스템과 같은 뜻)</div>' : '') +
    (r.fixed && r.fixed.length ? '<div class="alert a-grn">이전 시스템 내보내기에서 깨진 줄 ' + r.fixed.length + '개를 살려 읽었습니다</div>' : '') +
    (r.broken && r.broken.length ? '<div class="alert a-amb">칸이 깨진 줄 ' + r.broken.length + '개 건너뜀 (줄바꿈 · 탭이 섞임): ' + esc(r.broken.slice(0, 8).join(', ')) + '</div>' : '') +
    (sum.missing.length ? '<div class="alert a-amb">목록에 없는 코드 ' + sum.missing.length + '개 (건너뜀): ' + esc(sum.missing.slice(0, 10).join(', ')) + '</div>' : '') +
    (sum.dupNew.length ? '<div class="alert a-red">새 코드가 이미 있어 바꾸지 못함 ' + sum.dupNew.length + '개: ' + esc(sum.dupNew.slice(0, 10).join(', ')) + '</div>' : '') +
    (sum.changed ? '<button class="b-blue" id="tGo" style="margin-top:8px">이대로 적용 (' + sum.changed.toLocaleString() + '개)</button>' : '<div class="none">바뀌는 것이 없습니다</div>');
  if ($('tGo')) $('tGo').onclick = async () => { if (!(await confirmBox(sum.changed.toLocaleString() + '개 아이템을 바꿀까요? 모든 폰이 새 목록을 받습니다.', '적용'))) return; busy(true); try { await editCatalog(S, (rw, ct, st) => applyBulk(rw, ct, st, r.patches)); toast('적용했습니다 — 모든 폰이 새 목록을 받습니다', 'good'); out.innerHTML = '<div class="alert a-grn">적용했습니다 — ' + sum.changed.toLocaleString() + '개</div>'; (after || treeAdmin)(); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
}
/** 공개(링크 공유) 구글 시트의 탭을 CSV 로 읽어 2차원 배열로 */
async function readSheetTab(id, tab) {
  const url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(id) + '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(tab) + '&t=' + Date.now();
  const res = await fetch(url); if (!res.ok) throw new Error('시트를 읽지 못했습니다 (' + res.status + ')');
  const text = await res.text();
  if (/<html/i.test(text.substring(0, 200))) throw new Error('시트가 공개돼 있지 않거나 탭 이름이 다릅니다');
  return parseCsv(text);
}
export function parseCsv(text, dl) {
  dl = dl || ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === dl) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => String(v).trim() !== ''));
}
