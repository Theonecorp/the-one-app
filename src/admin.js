/* ============================================================
 *  관리 — 사용자 · 세일즈맨(요율) · 설정 · 옛 시트에서 가져오기
 * ============================================================ */
import { $, esc, money, num, R2, today, ym, toast, busy, openModal, closeModal, confirmBox, Router, sel, sum, sortBy, pad4, nz } from './ui.js';
import { newId } from './db.js';
import { RATE_LABELS, RATE_DEFAULT, invType, setInvTypeMap } from './comm.js';
import { bumpAccountsVer } from './mgr.js';
import { roleLabel, JOBS, jobLabel } from './main.js';
import { parseItemMaster, publishCatalog, loadCatalog, catalog, parseSetBook, publishSets, exactItem, editCatalog, renameCat, ensureCats, moveCatTo, parseBulkSheet, applyBulk, catalogCsv, catStart, pins, setPins, popularCodes, photoIndex, driveUrl, cleanName, sbmLevelRows, sbmGroupRows } from './catalog.js';
import { invTypes, fmtNo, company } from './invoicing.js';

let S = null, TAB = 'users';
export function register(state) { S = state; Router.on('admin', pageAdmin); }
async function pageAdmin(arg) {
  if (arg) TAB = arg;
  let h = '<div class="seg">' + [['users', '👤 사용자'], ['sms', '🧑‍💼 세일즈맨'], ['set', '⚙️ 설정'], ['cat', '📦 아이템'], ['tree', '🗂 분류'], ['imp', '📥 가져오기']].map(t => '<button class="' + (TAB === t[0] ? 'on' : '') + '" data-at="' + t[0] + '">' + t[1] + '</button>').join('') + '</div><div id="adminBody"><div class="load">읽는 중…</div></div>';
  $('page').innerHTML = h;
  document.querySelectorAll('[data-at]').forEach(b => b.onclick = () => { TAB = b.dataset.at; pageAdmin(); });
  try { if (TAB === 'users') await users(); else if (TAB === 'sms') await salesmen(); else if (TAB === 'set') await settings(); else if (TAB === 'cat') await catalogAdmin(); else if (TAB === 'tree') await treeAdmin(); else await importer(); }
  catch (e) {
    const perm = /permission/i.test(String(e.code || e.message));
    $('adminBody').innerHTML = '<div class="card"><div class="alert a-red">읽지 못했습니다: ' + esc(e.code || e.message) + '</div>' +
      (perm ? '<div class="alert a-amb">권한 오류입니다. Firebase 콘솔 → Firestore → 규칙에 저장소의 firestore.rules 가 <b>게시</b>됐는지 확인하세요.</div>' : '') + '</div>';
  }
}

/* ---- 사용자 ---- */
async function users() {
  const list = sortBy(await S.DB.list('users'), u => (u.role === 'admin' ? '0' : u.role === 'manager' ? '1' : '2') + u.email);
  $('adminBody').innerHTML = '<div class="card"><h2>사용자 ' + list.length + '명</h2><div class="muted">구글 계정 이메일로 등록합니다. 세일즈맨은 세일즈맨 코드를 꼭 연결하세요. ACH 은행 정보는 "ACH 접근" 켠 사람만 봅니다.</div><button class="b-blue" id="uNew" style="margin-top:8px">＋ 사용자 추가</button></div>' +
    '<div class="card">' + list.map(u => '<div class="pr tap" data-u="' + esc(u.email) + '"><div class="ct"><b>' + esc(u.name || u.email) + ' <span class="tag ' + (u.role === 'admin' ? 't-a' : u.role === 'manager' ? 't-b' : 't-k') + '">' + roleLabel(u.role).split(' ')[0] + '</span>' + (u.role === 'manager' && u.job ? ' <span class="tag t-b">' + esc(jobLabel(u.job).split(' ')[0]) + '</span>' : '') + (u.sm ? ' <span class="tag t-g">' + esc(u.sm) + '</span>' : '') + (u.achAccess ? ' <span class="tag t-r">ACH</span>' : '') + (u.active === false ? ' <span class="tag t-g">비활성</span>' : '') + '</b><small>' + esc(u.email) + '</small></div></div>').join('') + '</div>';
  $('uNew').onclick = () => userForm(null);
  document.querySelectorAll('[data-u]').forEach(el => el.onclick = () => userForm(list.find(u => u.email === el.dataset.u)));
}
function userForm(u) {
  u = u || {};
  openModal('<h2>' + (u.email ? esc(u.email) : '＋ 사용자') + '</h2>' +
    '<div class="fg"><label>구글 이메일</label><input id="uEmail" value="' + esc(u.email || '') + '" ' + (u.email ? 'readonly' : '') + ' placeholder="name@gmail.com"></div>' +
    '<div class="two"><div class="fg"><label>이름</label><input id="uName" value="' + esc(u.name || '')+ '"></div><div class="fg"><label>역할</label>' + sel('uRole', [['salesman', '세일즈맨'], ['manager', '담당자'], ['admin', '관리자']], u.role || 'salesman') + '</div></div>' +
    '<div class="fg"><label>담당자의 일 (담당자만) — 화면이 달라집니다</label>' + sel('uJob', JOBS.map(j => [j[0], j[1] + ' · ' + j[2]]), u.job || 'office') + '<small class="muted">오피스: 오더 · 수금 확인 · COD · AR 전부 / 인보이스: 픽킹 확인 · 인보이스 확정 · 인보이스 찾기 / 픽킹·팩킹: 들어온 오더 · 픽킹 결과만 / 어카운팅: 수금 확인 · COD · ACH · AR · 인보이스 찾기</small></div>' +
    '<div class="two"><div class="fg"><label>세일즈맨 코드</label><input id="uSm" list="uSmList" value="' + esc(u.sm || '') + '" placeholder="예: BRANDON" style="text-transform:uppercase" autocomplete="off"><datalist id="uSmList">' + S.sms.map(s => '<option value="' + esc(s.code) + '">').join('') + '</datalist><small class="muted">목록에 없으면 그대로 입력 — 저장할 때 세일즈맨도 같이 만듭니다</small></div><div class="fg"><label>옵션</label><label class="muted" style="display:flex;gap:6px;align-items:center;padding:8px 0"><input type="checkbox" id="uAch" style="width:18px;height:18px" ' + (u.achAccess ? 'checked' : '') + '> ACH 은행 정보 접근</label><label class="muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="uAct" style="width:18px;height:18px" ' + (u.active !== false ? 'checked' : '') + '> 활성</label></div></div>' +
    '<div class="btns">' + (u.email && u.email !== S.user.email ? '<button class="b-ghost" id="uDel">삭제</button>' : '') + '<button class="b-blue" id="uSave">저장</button></div>');
  $('uSave').onclick = async () => {
    const email = $('uEmail').value.trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('이메일을 확인하세요', 'bad');
    let smv = $('uSm').value.trim().toUpperCase().replace(/\s+/g, ' ');
    if (!smv && $('uRole').value === 'salesman' && $('uName').value.trim()) smv = $('uName').value.trim().toUpperCase().split(/\s+/)[0];
    const doc = { email, name: $('uName').value.trim(), role: $('uRole').value, job: $('uJob').value, sm: smv, achAccess: $('uAch').checked, active: $('uAct').checked, updatedAt: new Date().toISOString() };
    if (doc.role === 'salesman' && !doc.sm) return toast('세일즈맨 코드(또는 이름)를 넣으세요', 'bad');
    busy(true); try {
      let made = '';
      if (doc.sm && !S.smByCode[doc.sm]) { await S.DB.set('salesmen', doc.sm, { code: doc.sm, name: doc.name || doc.sm, email: doc.role === 'salesman' ? email : '', rates: Object.assign({}, RATE_DEFAULT), active: true, updatedAt: new Date().toISOString() }); await reloadSms(); made = ' · 세일즈맨 ' + doc.sm + ' 새로 만듦 (요율은 세일즈맨 탭에서 확인)'; }
      await S.DB.set('users', email, Object.assign({ createdAt: today() }, u, doc)); closeModal(); toast('저장' + made); users();
    } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false);
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
  $('adminBody').innerHTML = '<div class="card"><h2>세일즈맨 ' + list.length + '명</h2><div class="muted">코드는 수금 기록·AR·정산의 기준입니다 (대문자). 요율은 정산서 계산에 씁니다.</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="b-blue" id="sNew">＋ 세일즈맨 추가</button>' + (miss.length ? '<button class="b-ghost" id="sBase">👥 기본 명단 ' + miss.length + '명 한 번에</button>' : '') + '</div></div>' +
    '<div class="card"><table><tr><th>코드</th><th>이름</th><th class="r">A</th><th class="r">W</th><th class="r">P</th><th class="r">DP</th><th class="r">OFF</th></tr>' + list.map(s => { const r = Object.assign({}, RATE_DEFAULT, s.rates || {}); return '<tr class="tap" data-s="' + esc(s.code) + '"><td><b>' + esc(s.code) + '</b>' + (s.active === false ? ' <span class="tag t-g">비활성</span>' : '') + '</td><td>' + esc(s.name || '') + '</td><td class="r">' + pr(r.a) + '</td><td class="r">' + pr(r.w) + '</td><td class="r">' + pr(r.p) + '</td><td class="r">' + pr(r.dp) + '</td><td class="r">' + pr(r.office) + '</td></tr>'; }).join('') + '</table></div>';
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
    '<div class="btns"><button class="b-blue" id="smSave">저장</button></div>');
  $('smSave').onclick = async () => {
    const code = $('smCode').value.trim().toUpperCase(); if (!code) return toast('코드를 넣으세요', 'bad');
    const rates = {}; RATE_LABELS.forEach(x => { rates[x[0]] = R2(num($('r_' + x[0]).value) / 100 * 10000) / 10000; });
    const doc = { code, name: $('smName').value.trim(), email: $('smEmail').value.trim().toLowerCase(), rates, active: $('smAct').checked, updatedAt: new Date().toISOString() };
    busy(true); try { await S.DB.set('salesmen', code, doc); await reloadSms(); closeModal(); toast('저장'); salesmen(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false);
  };
}

/* ---- 설정 ---- */
async function settings() {
  const s = S.settings || {};
  $('adminBody').innerHTML = '<div class="card"><h2>정산 설정</h2>' +
    '<div class="fg"><label>할인 초과 기준 (이 값을 넘으면 할인 요율) %</label><input id="stDisc" value="' + ((s.discLimit != null ? s.discLimit : 0.2) * 100).toFixed(0) + '" inputmode="decimal"></div>' +
    '<div class="fg"><label>EXCHANGE 가게 키워드 (쉼표로)</label><input id="stKw" value="' + esc(s.specialKeywords || 'BEAUTY EXCHANGE, BEAUTY EXCAHNGE') + '"></div>' +
    '<div class="fg"><label>EXCHANGE 칸 제목</label><input id="stTitle" value="' + esc(s.specialTitle || 'BEAUTY EXCHANGE') + '"></div>' +
    '<div class="fg"><label>담당자 알림 이메일 (옵션)</label><input id="stMail" value="' + esc(s.reportTo || 'check@theonefl.com') + '"></div>' +
    '<h2 style="margin-top:14px">인보이스에 찍히는 회사 정보</h2>' + (() => { const c = company(S); return '<div class="fg"><label>회사 이름</label><input id="coName" value="' + esc(c.name) + '"></div><div class="two"><div class="fg"><label>주소 1</label><input id="coA1" value="' + esc(c.addr1) + '"></div><div class="fg"><label>주소 2 (City, ST Zip)</label><input id="coA2" value="' + esc(c.addr2) + '"></div></div><div class="two"><div class="fg"><label>전화</label><input id="coTel" value="' + esc(c.tel) + '"></div><div class="fg"><label>하단 인사말</label><input id="coThx" value="' + esc(c.thanks) + '"></div></div>'; })() +
    '<div class="muted">AR 기준일: ' + esc(s.arAsOf || '없음') + ' · 거래처 버전: ' + esc(s.accountsVer || '0') + '</div>' +
    '<div class="btns"><button class="b-blue" id="stSave">저장</button></div></div>' + invTypeCard();
  bindInvTypes();
  $('stSave').onclick = async () => { const doc = Object.assign({}, s, { discLimit: num($('stDisc').value) / 100, specialKeywords: $('stKw').value.trim(), specialTitle: $('stTitle').value.trim(), reportTo: $('stMail').value.trim(), co: { name: $('coName').value.trim(), addr1: $('coA1').value.trim(), addr2: $('coA2').value.trim(), tel: $('coTel').value.trim(), thanks: $('coThx').value.trim() } }); busy(true); try { await S.DB.set('settings', 'app', doc); S.settings = doc; toast('저장'); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); };
}

/* ============================================================
 *  📥 가져오기 — 옛 구글 시트를 엑셀로 내려받은 파일을 그대로 올립니다
 *   · The One 수금 입력 (2026).xlsx → _ACCOUNTS → accounts · _SALESMEN → salesmen/users · _ENTRIES → entries
 *   · THE ONE 수금 (SALES).xlsx → COD 입력 → cod · 세일즈맨 탭 → entries 의 sb/rc/v/disc/note/인보이스 금액
 *   · THE ONE 커미션.xlsx → 세일즈맨 요율 · 정산 기록(settled)
 * ============================================================ */
async function importer() {
  $('adminBody').innerHTML = exportCard() + '<div class="card"><h2>📥 옛 시트에서 가져오기</h2><div class="muted">구글 시트를 <b>파일 → 다운로드 → Microsoft Excel</b> 로 받은 파일을 올립니다. 같은 ID 는 덮어쓰므로 여러 번 올려도 됩니다. 순서: ① 수금 입력 파일 → ② SALES 파일 → ③ 커미션 파일.</div>' +
    '<div class="fg" style="margin-top:10px"><label>① The One 수금 입력 (2026).xlsx — 거래처 · 세일즈맨 · 수금</label><input type="file" id="f1" accept=".xlsx"></div>' +
    '<div class="fg"><label>② THE ONE 수금 (SALES).xlsx — COD 입력 · 세일즈맨 탭의 확인 표시</label><input type="file" id="f2" accept=".xlsx"></div>' +
    '<div class="fg"><label>③ THE ONE 커미션.xlsx — 요율 · 정산 기록</label><input type="file" id="f3" accept=".xlsx"></div>' +
    '<div id="impOut"></div></div>';
  bindExport();
  $('f1').onchange = () => importMain($('f1').files[0]); $('f2').onchange = () => importSales($('f2').files[0]); $('f3').onchange = () => importComm($('f3').files[0]);
}
async function loadXlsx() { if (window.XLSX) return window.XLSX; await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); return window.XLSX; }
async function readBook(file) { const XLSX = await loadXlsx(); const buf = await file.arrayBuffer(); return { XLSX, wb: XLSX.read(buf, { type: 'array', cellDates: true }) }; }
function aoa(XLSX, wb, name) { const ws = wb.Sheets[name]; if (!ws) return null; return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }); }
function dstr(v) { if (v instanceof Date) { const d = new Date(v.getTime() - v.getTimezoneOffset() * 60000); return d.toISOString().substring(0, 10); } const s = String(v || '').trim(); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10); const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0'); return ''; }
function hdrIdx(row, names) { const idx = {}; row = row.map(x => String(x || '').trim()); Object.keys(names).forEach(k => { const j = row.findIndex(h => names[k].test(h)); idx[k] = j; }); return idx; }
const say = (h) => { $('impOut').insertAdjacentHTML('beforeend', '<div class="alert a-blu">' + h + '</div>'); };

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
    String(r[16] || '').split('|').forEach(tok => { tok = tok.trim(); if (!tok) return; const mm = tok.match(/^([^:]+):(.+)$/); if (!mm) return; const nos = mm[1].split(/[\s,]+/).filter(Boolean), a = R2(num(mm[2])); nos.forEach((no, j) => invs.push({ no: no.toUpperCase(), t: invType(no), amt: j === 0 ? a : 0 })); });
    out.push({ id: String(r[0]).trim(), d, ym: ym(d), sm: String(r[2] || '').trim().toUpperCase(), acct: pad4(r[5]), store: String(r[4] || '').trim(), addr: String(r[6] || '').trim(), newStore: /^Y/i.test(String(r[12] || '')),
      pays: [{ m, ref: String(r[8] || '').trim(), amt, dep: dstr(r[11]), mob: /^Y/i.test(String(r[18] || '')) }], invs, total: amt, invTotal: sum(invs, v => v.amt), mismatch: '', memo: String(r[10] || '').trim(),
      repl: /^Y/i.test(String(r[20] || '')), orig: String(r[21] || '').trim(), disc: '', sb: false, rc: false, v: false, vn: '', settled: '', void: false, createdBy: String(r[3] || '').trim().toLowerCase(), createdAt: dstr(r[1]), imported: true });
  }
  return out;
}
async function importMain(file) {
  if (!file) return; busy(true); $('impOut').innerHTML = '';
  try {
    const { XLSX, wb } = await readBook(file);
    const acc = aoa(XLSX, wb, '_ACCOUNTS'), smv = aoa(XLSX, wb, '_SALESMEN'), ent = aoa(XLSX, wb, '_ENTRIES');
    const ops = [];
    if (acc) { for (let i = 1; i < acc.length; i++) { const r = acc[i]; const code = pad4(r[0]); if (!code || !r[1]) continue; ops.push({ op: 'set', col: 'accounts', id: code, data: { acct: code, store: String(r[1]).trim(), addr: String(r[2] || '').trim(), city: String(r[3] || '').trim(), state: String(r[4] || '').trim(), zip: String(r[5] || '').trim(), tel: String(r[6] || '').trim(), sm: String(r[7] || '').trim().toUpperCase(), note: String(r[8] || '').trim() } }); } say('거래처 ' + ops.length + '곳'); }
    let nS = 0;
    if (smv) { for (let i = 1; i < smv.length; i++) { const r = smv[i]; const name = String(r[1] || '').trim().toUpperCase(), email = String(r[0] || '').trim().toLowerCase(); if (!name) continue; const active = !/^N/i.test(String(r[2] || 'Y')); ops.push({ op: 'set', col: 'salesmen', id: name, data: Object.assign({ code: name, name, email, active, rates: RATE_DEFAULT }, S.smByCode[name] || {}, { active }) }); if (email) ops.push({ op: 'set', col: 'users', id: email, data: Object.assign({ email, name, role: 'salesman', sm: name, active, createdAt: today() }, {}) }); nS++; } say('세일즈맨 ' + nS + '명 (이메일 있는 사람은 사용자에도 등록)'); }
    let nE = 0;
    if (ent) { const list = parseEntriesSheet(ent); list.forEach(e => ops.push({ op: 'set', col: 'entries', id: e.id, data: e })); nE = list.length; say('수금 ' + nE + '건 (VOID 제외) · 합계 ' + money(sum(list, e => e.total))); }
    await S.DB.batch(ops);
    if (acc) await bumpAccountsVer();
    S.sms = await S.DB.list('salesmen', { order: ['code', 'asc'] }); S.smByCode = {}; S.sms.forEach(x => { S.smByCode[x.code] = x; });
    say('<b>저장 완료</b> — 다음은 ② SALES 파일');
  } catch (e) { $('impOut').insertAdjacentHTML('beforeend', '<div class="alert a-red">' + esc(e.message) + '</div>'); }
  busy(false);
}
/** SALES 파일: COD 입력 탭 + 세일즈맨 탭들(머리글 이름으로 찾음) */
async function importSales(file) {
  if (!file) return; busy(true); $('impOut').innerHTML = '';
  try {
    const { XLSX, wb } = await readBook(file);
    const ops = []; let nC = 0, nF = 0, missing = 0;
    const cod = aoa(XLSX, wb, 'COD 입력');
    if (cod) {
      const H = hdrIdx(cod[0], { sm: /세일즈맨/, d: /날짜/, acct: /계정코드/, store: /가게/, method: /결제 방법/, ref: /참조/, amt: /^금액/, invA: /^A 인보이스/, amtA: /^A 금액/, invP: /^P 인보이스/, amtP: /^P 금액/, invCM: /^CM 인보이스/, amtCM: /^CM 금액/, invW: /^W 인보이스/, amtW: /^W 금액/, disc: /디스카운트/, note: /^메모/, id: /^ID$/, v: /정산 확인/, vn: /확인 메모/ });
      for (let i = 1; i < cod.length; i++) { const r = cod[i]; const d = dstr(r[H.d]); if (!d || !r[H.sm]) continue; const invs = []; ['A', 'P', 'CM', 'W'].forEach(t => { const no = String(r[H['inv' + t]] || '').trim().toUpperCase(), a = R2(num(r[H['amt' + t]])); if (no) no.split(/[\s,]+/).filter(Boolean).forEach((x, j) => invs.push({ no: x, t, amt: j === 0 ? a : 0 })); });
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
        if (!(e.invs || []).length) { const invs = []; ['A', 'P', 'CM', 'W'].forEach(tt => { const no = String(r[H['inv' + tt]] || '').trim().toUpperCase(), a = R2(num(r[H['amt' + tt]])); if (no) no.split(/[\s,]+/).filter(Boolean).forEach((x, j) => invs.push({ no: x, t: tt, amt: j === 0 ? a : 0 })); }); if (invs.length) { patch.invs = invs; patch.invTotal = sum(invs, v => v.amt); } }
        if (!e._p) { e._p = patch; nF++; } else Object.assign(e._p, patch); }
    });
    Object.values(ents).forEach(e => { if (e._p) ops.push({ op: 'update', col: 'entries', id: e.id, data: e._p }); });
    await S.DB.batch(ops);
    say('COD·카드·ACH ' + nC + '건 · 세일즈맨 탭 확인 표시 ' + nF + '건 반영' + (missing ? ' · 수금 파일에 없는 ID ' + missing + '건 건너뜀' : '') + '<br><b>저장 완료</b> — 다음은 ③ 커미션 파일');
  } catch (e) { $('impOut').insertAdjacentHTML('beforeend', '<div class="alert a-red">' + esc(e.message) + '</div>'); }
  busy(false);
}
async function importComm(file) {
  if (!file) return; busy(true); $('impOut').innerHTML = '';
  try {
    const { XLSX, wb } = await readBook(file); const ops = []; let nR = 0, nL = 0;
    const rt = aoa(XLSX, wb, '세일즈맨 요율');
    if (rt) { const H = hdrIdx(rt[0], { sm: /세일즈맨/, a: /A 인보이스/, disc: /할인/, w: /W 인보이스/, p: /P 인보이스/, ex: /EXCHANGE/, dp: /DP/, office: /OFFICE/ });
      for (let i = 1; i < rt.length; i++) { const r = rt[i]; const code = String(r[H.sm] || '').trim().toUpperCase(); if (!code) continue; const rates = {}; ['a', 'disc', 'w', 'p', 'ex', 'dp', 'office'].forEach(kk => { if (H[kk] >= 0 && r[H[kk]] !== '') { let v = num(r[H[kk]]); if (v > 1) v = v / 100; rates[kk] = v; } }); const cur = S.smByCode[code] || { code, name: code, active: true }; ops.push({ op: 'set', col: 'salesmen', id: code, data: Object.assign({}, cur, { rates: Object.assign({}, RATE_DEFAULT, cur.rates || {}, rates) }) }); nR++; } }
    const lg = aoa(XLSX, wb, '정산 기록');
    if (lg) { for (let i = 1; i < lg.length; i++) { const r = lg[i]; const id = String(r[2] || '').trim().split('@')[0]; if (!id) continue; ops.push({ op: 'update', col: 'entries', id, data: { settled: 'sheet:' + dstr(r[0]) + ':' + String(r[5] || ''), settledAt: dstr(r[0]) } }); nL++; } }
    /* update 는 없는 문서에 실패하므로 하나씩 */
    let ok = 0, fail = 0;
    for (const o of ops) { try { if (o.op === 'update') await S.DB.update(o.col, o.id, o.data); else await S.DB.set(o.col, o.id, o.data); ok++; } catch (e) { fail++; } }
    S.sms = await S.DB.list('salesmen', { order: ['code', 'asc'] }); S.smByCode = {}; S.sms.forEach(x => { S.smByCode[x.code] = x; });
    say('요율 ' + nR + '명 · 정산 기록 ' + nL + '줄 (반영 ' + ok + ' · 못 찾음 ' + fail + ')<br><b>가져오기 끝</b>');
  } catch (e) { $('impOut').insertAdjacentHTML('beforeend', '<div class="alert a-red">' + esc(e.message) + '</div>'); }
  busy(false);
}

/* ============================================================
 *  📦 아이템 — THE ONE Item Master 를 엑셀로 받아 올리면 모든 폰의 아이템 목록이 바뀜
 * ============================================================ */
async function catalogAdmin() {
  const meta = await S.DB.get('catalog', 'meta');
  $('adminBody').innerHTML = '<div class="card"><h2>📦 아이템 목록 (오더용)</h2>' +
    (meta ? '<div class="sumbox">지금: <b>' + (meta.count || 0).toLocaleString() + '개</b> · ' + esc(String(meta.updatedAt || '').substring(0, 16).replace('T', ' ')) + ' · ' + esc(meta.by || '') + '</div>' : '<div class="alert a-amb">아직 올린 아이템 목록이 없습니다</div>') +
    '<div class="muted">구글 시트 <b>THE ONE Item Master</b> 를 <b>파일 → 다운로드 → Microsoft Excel</b> 로 받아 그대로 고르세요. Items 탭과 Categories 탭을 읽고, Hide 에 x 표시된 것은 뺍니다. 시트가 바뀔 때마다 다시 올리면 됩니다.</div>' +
    '<div class="fg" style="margin-top:10px"><input type="file" id="catFile" accept=".xlsx"></div><div id="catOut"></div></div>' +
    '<div class="card"><h2>🧩 세트 · 인서트 구성</h2><div id="setBox"><div class="load">읽는 중…</div></div></div>' +
    photoCard() +
    '<div class="card"><h2>🛒 오더 탭</h2><label class="pick ' + (S.settings.ordersOn ? 'on' : '') + '" id="ordOn"><span class="ck">✓</span><span class="pm"><b>세일즈맨 · 담당자에게 오더 탭 보이기</b><small>끄면 관리자만 봅니다 (시험용)</small></span></label></div>';
  setAdmin();
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
    const img = new Image(); img.onload = () => { out.innerHTML = '<div class="alert a-grn">✅ 드라이브 사진이 열립니다 — 켜도 됩니다</div>'; }; img.onerror = () => { out.innerHTML = '<div class="alert a-red">❌ 열리지 않습니다 — 드라이브에서 <b>item_picture</b> · <b>The One item</b> 공유 드라이브(폴더)를 "링크가 있는 모든 사용자 · 뷰어"로 바꾼 뒤 다시 시험하세요</div>'; };
    img.src = driveUrl(id, 100) + '&t=' + Date.now();
  };
  $('catFile').onchange = async () => {
    const file = $('catFile').files[0]; if (!file) return;
    const out = $('catOut'); out.innerHTML = '<div class="load">읽는 중…</div>';
    try {
      const { XLSX, wb } = await readBook(file);
      const p = parseItemMaster(aoa(XLSX, wb, 'Items'), aoa(XLSX, wb, 'Categories'));
      const warn = [];
      if (p.dup.length) warn.push('같은 코드가 두 번: ' + p.dup.length + '개 (첫 줄만 씀) — ' + p.dup.slice(0, 8).join(', '));
      if (p.dupBar.length) warn.push('같은 바코드를 쓰는 코드: ' + p.dupBar.length + '쌍 (스캔하면 앞의 것이 담김) — ' + p.dupBar.slice(0, 5).join(', '));
      if (p.noPrice.length) warn.push('가격 없음: ' + p.noPrice.length + '개 — ' + p.noPrice.slice(0, 8).join(', '));
      out.innerHTML = '<div class="alert a-blu">아이템 <b>' + p.rows.length.toLocaleString() + '개</b> · 사진 ' + p.photos.toLocaleString() + '개 · 카테고리 ' + p.cats.length + '줄 · 숨김(뺌) ' + p.hidden + '개</div>' +
        warn.map(w => '<div class="alert a-amb">' + esc(w) + '</div>').join('') +
        '<button class="b-blue" id="catGo" style="margin-top:10px">이대로 올리기</button>';
      $('catGo').onclick = async () => {
        busy(true);
        try { const r = await publishCatalog(S, p); await loadCatalog(S, true); toast('아이템 ' + p.rows.length + '개 올림 (' + r.chunks + '묶음)', 'good'); catalogAdmin(); }
        catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
        busy(false);
      };
    } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
  };
  $('ordOn').onclick = async () => {
    const on = !S.settings.ordersOn;
    busy(true);
    try { const cur = (await S.DB.get('settings', 'app')) || {}; await S.DB.set('settings', 'app', Object.assign(cur, { ordersOn: on })); S.settings.ordersOn = on; toast(on ? '오더 탭을 켰습니다' : '오더 탭을 껐습니다'); catalogAdmin(); }
    catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}

/* ---- 📤 자료 내려받기 — 앱에 쌓인 자료(오더 · 인보이스 · 수금 · 거래처 · 아이템)를 달 단위 엑셀로 (보관 · 회계 · 시트 분석용) ---- */
function exportCard() {
  const d = new Date(), yms = []; for (let i = 0; i < 24; i++) { yms.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); d.setMonth(d.getMonth() - 1); }
  return '<div class="card"><h2>📤 자료 내려받기 (백업 · 보관)</h2><div class="muted">앱 자료는 Firebase(Firestore) 에 쌓입니다. 달을 골라 받으면 그 달의 <b>오더 · 오더 줄 · 인보이스 · 수금 · 백오더</b> 와 지금의 <b>거래처 · 아이템</b> 이 탭별로 든 엑셀 한 파일이 됩니다. 달마다 한 번 받아 드라이브 "THE ONE 데이터 보관/연도" 폴더에 넣어 두면 회계 · 분석 · 백업이 됩니다.</div>' +
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
      out.innerHTML = '<div class="alert a-grn">' + ym + ' — 오더 ' + orders.length + ' · 줄 ' + lines.length + ' · 인보이스 ' + invs.length + ' · 수금 ' + entries.length + ' · 백오더 ' + bos.length + ' · 거래처 ' + accts.length + '</div>';
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
    '<label class="pick ' + (S.settings.photoDrive ? 'on' : '') + '" id="phDrive" style="margin-top:8px"><span class="ck">✓</span><span class="pm"><b>드라이브 item_picture 사진 쓰기</b><small>폴더가 "링크가 있는 모든 사용자" 로 공유돼 있어야 폰에서 보입니다. 아래 시험으로 먼저 확인하세요.</small></span></label>' +
    '<div class="btns"><button class="b-ghost b-sm" id="phTest">🔎 드라이브 사진 시험</button></div><div id="phTestOut"></div></div>';
}
/* ---- 인보이스 종류 — 아이템이 어느 인보이스로 갈지, 커미션은 어느 칸으로 셀지 ---- */
let IT = null;
function invTypeCard() {
  IT = invTypes(S).map(t => Object.assign({}, t));
  return '<div class="card"><h2>🧾 인보이스 종류 <span class="en">Invoice types</span></h2><div class="muted">SmartBee 와 같이 <b>A 주얼리 · P 그 외 제품 · W 디스플레이 · 세트</b>. 번호는 <b>영문 한 글자 + 다섯 자리</b> (A43107). 99999 다음은 자동으로 AA00001 → AB00001 … 로 넘어갑니다.<br>' +
    '첫 줄은 기본 (규칙에 안 맞는 아이템). 규칙은 아이템의 Group · Level 1~3 이름을 쉼표로 (예: <b>Jewelry</b>, <b>Other</b>, <b>Set &amp; Display</b>), 코드 앞글자는 <b>코드:EB</b>.<br>' +
    '<b>다음 번호</b>는 SmartBee 에서 마지막으로 쓴 번호 다음으로 맞춰 두세요 (두 프로그램을 같이 쓰는 동안 겹치지 않게). 커미션 칸은 정산서의 A · P · W 요율 중 어느 것으로 셀지입니다.</div><div id="itRows"><div class="load">읽는 중…</div></div>' +
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
  $('setFile').onchange = async () => {
    const file = $('setFile').files[0]; if (!file) return;
    const out = $('setOut'); out.innerHTML = '<div class="load">읽는 중…</div>';
    try {
      const { XLSX, wb } = await readBook(file);
      const names = wb.SheetNames;
      const comp = aoa(XLSX, wb, names.find(n => /세트\s*구성/.test(n)) || names.find(n => /SET/i.test(n) && !/목록|LIST|요약/i.test(n)) || names[0]);
      const list = aoa(XLSX, wb, names.find(n => /세트\s*목록/.test(n)) || '');
      const r = parseSetBook(comp, list, which);
      const C2 = catalog(); const miss = {}; let missN = 0;
      Object.values(r.sets).forEach(st => st.k.forEach(x => { if (C2 && !C2.byCode[x[0]]) { miss[x[0]] = 1; } }));
      missN = Object.keys(miss).length;
      const inCat = C2 ? Object.keys(r.sets).filter(k => C2.byCode[k] && !C2.byCode[k].virt).length : 0;
      out.innerHTML = '<div class="alert a-blu">세트 <b>' + Object.keys(r.sets).length + '개</b> · 구성 ' + r.lines.toLocaleString() + '줄 · 이름 있는 세트 ' + r.named + '개<br>아이템 목록에 같은 코드가 있는 세트 ' + inCat + '개 (그 가격 사용) · 나머지는 세트 목록의 리스트 가격 (없으면 구성품 합)</div>' +
        (missN ? '<div class="alert a-amb">아이템 목록에 없는 구성품 코드 ' + missN + '개 — 오더는 되지만 사진 · 가격이 비어 있습니다: ' + esc(Object.keys(miss).slice(0, 12).join(', ')) + '</div>' : '') +
        '<button class="b-blue" id="setGo" style="margin-top:8px">이대로 세트 올리기</button>';
      $('setGo').onclick = async () => { busy(true); try { await publishSets(S, r.sets); await loadCatalog(S, true); toast('세트 ' + Object.keys(r.sets).length + '개 올림', 'good'); setAdmin(); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
    } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
  };
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
/* SmartBee 분류로 되돌리기 — data/sbm-tree.json (SmartBee LEVEL 1 · 2 · GROUP NAME, 2026-10 내보내기) 을 한 번에 적용 */
function sbmCard(C) {
  const L1 = {}; C.items.forEach(x => { if (x.l1) L1[x.l1] = 1; });
  const sbm = ['EARRING', 'NECKLACE', 'ANKLET', 'NOSE'].filter(k => L1[k]).length >= 3;
  return '<div class="card" style="border:2px solid ' + (sbm ? '#bbf7d0' : '#fdba74') + '"><h2>🐝 SmartBee 분류 (LEVEL 1 · 2 · GROUP)</h2>' +
    (sbm ? '<div class="alert a-grn">✅ 지금 SmartBee 분류를 쓰고 있습니다. 순서: "" 맨 앞 → " → 주얼리 ABC → [ 그 외 → &lt; * z 맨 뒤 (+ 📌 고정).</div>' :
      '<div class="alert a-amb">⚠️ 지금은 THE ONE 카탈로그 분류(Earrings · Hoops … )입니다. 아래 버튼 한 번이면 세일즈맨이 쓰던 SmartBee LEVEL 1 · LEVEL 2 · GROUP 으로 바뀝니다 (7,268개, Group 은 Jewelry · Other · Set &amp; Display = 인보이스 A · P · W).</div>') +
    '<div class="btns"><button class="' + (sbm ? 'b-ghost' : 'b-blue') + '" id="sbmGo">🐝 SmartBee 분류로 ' + (sbm ? '다시 ' : '') + '바꾸기</button></div></div>';
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
        const trunc = (nb.length === 9 || nb.length === 10) && na.length > nb.length && na.startsWith(nb) && b.length <= 10;   // SmartBee 10자 잘림
        if (same || quote || trunc) { out.push({ lv, under: g.under, keep: a, drop: b, nk: g.cnt[a], nd: g.cnt[b], why: same ? '기호만 다름' : quote ? '따옴표' : '잘린 이름' }); done[b] = 1; }
      }));
    });
  });
  return out;
}
function dupeCard(C) {
  const d = findDupes(C);
  return '<div class="card"><h2>🧹 비슷한 이름 합치기</h2><div class="muted">같은 상위 안에서 오타 · 잘린 이름(SmartBee 10자) · 따옴표만 다른 분류를 찾았습니다. "합치기"를 누르면 아이템이 많은 쪽 이름으로 합쳐집니다.</div>' +
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
    '<div class="muted">오더 화면의 품목 단계입니다. 순서 규칙: <b>📌 위에 고정 → ABC 순 → 📌 아래에 고정</b> (분류 안의 아이템은 코드 순). 이름을 바꾸면 그 분류의 아이템 전체에 적용됩니다. 아이템을 다른 분류로 옮기는 건 아래 "일괄 변경 파일"로 합니다.</div>' +
    '<div class="fg" style="margin-top:8px"><label>오더 화면 시작 단계</label><div class="seg"><button class="' + (start === 'l1' ? 'on' : '') + '" data-cs="l1">Level 1 부터 (ANKLET · EARRING … SBMGo 처럼)</button><button class="' + (start === 'g' ? 'on' : '') + '" data-cs="g">Group 부터 (Jewelry · Beauty …)</button></div></div>' +
    crumbs + '<div class="muted" style="margin:4px 0">' + esc(LV[depth]) + ' · ' + kids.length + '개</div>' +
    kids.map(k => { const pt = pinOf(k.name); return '<div class="pr"><div class="ct tap" data-tin="' + esc(k.name) + '"><b>' + (pt === 'top' ? '📌 ' : pt === 'bottom' ? '📍 ' : '') + esc(k.name) + '</b><small>' + k.n.toLocaleString() + '개' + (k.kids.length ? ' · 하위 ' + k.kids.length : '') + (pt === 'top' ? ' · 위에 고정' : pt === 'bottom' ? ' · 아래에 고정' : '') + '</small></div>' +
      '<button class="b-ghost b-sm' + (pt === 'top' ? ' on' : '') + '" data-tup="' + esc(k.name) + '" title="위에 고정" style="' + (pt === 'top' ? 'background:#fef3c7' : '') + '">📌↑</button><button class="b-ghost b-sm" data-tdn="' + esc(k.name) + '" title="아래에 고정" style="' + (pt === 'bottom' ? 'background:#fef3c7' : '') + '">📍↓</button><button class="b-ghost b-sm" data-tren="' + esc(k.name) + '" title="이름 바꾸기">✏️</button>' + (depth >= 1 ? '<button class="b-ghost b-sm" data-tmv="' + esc(k.name) + '" title="다른 곳으로 옮기기">➡️</button>' : '') + '</div>'; }).join('') + '</div>' +
    (depth >= 1 ? '<div class="btns"><button class="b-ghost" id="tItems">📋 이 분류의 아이템 ' + node.n.toLocaleString() + '개 보기 · 하나씩 바꾸기</button></div><div id="tItemList"></div>' : '') + '</div>' +
    '<div class="card"><h2>🔎 코드로 아이템 분류 바꾸기</h2><div class="muted">아이템 코드(또는 바코드)를 치면 지금 분류가 보이고 Group · Level 1 · 2 · 3 을 바로 고칠 수 있습니다. 아이템을 다른 Level 1 로 옮기거나, 새 Level 이름을 만들 때 쓰세요.</div><div class="fg" style="margin-top:8px"><input id="tCode" placeholder="예: AHG103" autocomplete="off" style="text-transform:uppercase"></div><div id="tCodeOut"></div>' +
    '<div class="card"><h2>✨ 자주 나가는 아이템</h2><div class="muted">오더 화면 맨 위 "✨ 자주 나가는" 칸의 순서입니다. 가게가 최근에 산 것이 먼저 나오고, 그 다음 이 목록 순서입니다. SmartBee 의 <b>Sales Report by Item</b>(엑셀) 처럼 <b>Item</b>(코드) 과 <b>Qty</b>(수량) 열이 있는 파일을 올리면 많이 나간 순으로 저장됩니다.' + (popularCodes().length ? ' 지금 <b>' + popularCodes().length + '개</b> 올라와 있음.' : ' 아직 없음.') + '</div>' +
    '<div class="fg" style="margin-top:8px"><input type="file" id="popFile" accept=".xlsx,.csv"></div><div id="popOut"></div></div>' +
    sbmCard(C) + dupeCard(C) +
    '<div class="card"><h2>📄 일괄 변경 파일 — SmartBee 편의 파일 그대로</h2><div class="muted">SmartBee 에서 쓰던 <b>LEVEL_1_AND_2</b> (ITEM CODE · LEVEL 1 · LEVEL 2) 와 <b>GROUP_NAME_CHANGE</b> (ITEM CODE · CURRENT GROUP NAME · NEW GROUP NAME) 파일을 그대로 올리면 됩니다. 아래에서 지금 상태를 같은 모양으로 받아 엑셀에서 고친 뒤 다시 올리세요. SmartBee 내보내기에서 칸이 깨진 줄(줄바꿈 · 탭)도 알아서 살려 읽습니다.<br>' +
    'LEVEL 파일은 Level 1 이름의 앞글자로 Group(인보이스 A · P · W)이 정해집니다: 보통 이름 → Jewelry(A), [ ] → Other(P), "" → Set &amp; Display(W). GROUP NAME 은 Level 3 으로 들어갑니다 (NEW 가 비어 있으면 CURRENT 그대로).<br>' +
    '그 밖의 열도 됩니다 (<b>있는 열만</b> 바꾸고 빈 칸은 그대로): Code(필수) · NewCode · Description · Price · SRP · Barcode · Group · Level 1 · 2 · 3 · Photo · Delete(x). 목록에 없는 코드에 Description 과 Price 가 있으면 새 아이템으로 추가됩니다.</div>' +
    '<div class="btns" style="flex-wrap:wrap"><button class="b-ghost" id="tDlLevel">⬇️ LEVEL_1_AND_2.xlsx</button><button class="b-ghost" id="tDlGroup">⬇️ GROUP_NAME_CHANGE.xlsx</button><button class="b-ghost" id="tCsv">⬇️ 전체 CSV</button></div>' +
    '<div class="sumbox" style="margin-top:10px"><b>📊 구글 시트에서 바로 반영</b><div class="muted">편의 파일들을 구글 시트 탭(LEVEL_1_AND_2 · GROUP_NAME_CHANGE · POPULAR)으로 두고 거기서 고친 뒤, 여기서 탭을 누르면 읽어 와서 미리보기 → 적용합니다. 시트는 <b>공유 → 일반 액세스 → 링크가 있는 모든 사용자 · 뷰어</b> 여야 합니다.</div>' +
    '<div style="display:flex;gap:6px;margin-top:6px"><input id="gsUrl" placeholder="구글 시트 주소 붙여넣기" value="' + esc(S.settings.catSheet || '') + '" style="flex:1"><button class="b-ghost b-sm" id="gsSave">연결</button></div>' +
    (S.settings.catSheet ? '<div class="btns" style="flex-wrap:wrap;margin-top:8px"><button class="b-blue b-sm" data-gs="LEVEL_1_AND_2">📥 LEVEL_1_AND_2 반영</button><button class="b-blue b-sm" data-gs="GROUP_NAME_CHANGE">📥 GROUP_NAME_CHANGE 반영</button><button class="b-ghost b-sm" data-gs="POPULAR">✨ POPULAR 반영</button></div><div style="display:flex;gap:6px;margin-top:6px"><input id="gsTab" placeholder="다른 탭 이름 (예: TreeUpdate)" style="flex:1"><button class="b-ghost b-sm" data-gs="_">📥 이 탭 반영</button></div><a class="muted" href="https://docs.google.com/spreadsheets/d/' + esc(S.settings.catSheet) + '" target="_blank" rel="noopener">시트 열기 ↗</a>' : '') + '</div>' +
    '<div class="fg" style="margin-top:8px"><input type="file" id="tFile" accept=".xlsx,.csv"></div><div id="tOut"></div></div>';
  document.querySelectorAll('[data-cs]').forEach(b => b.onclick = async () => { busy(true); try { const cur = (await S.DB.get('settings', 'app')) || {}; cur.catStart = b.dataset.cs; await S.DB.set('settings', 'app', cur); S.settings.catStart = b.dataset.cs; toast('저장'); treeAdmin(); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); });
  document.querySelectorAll('[data-tp]').forEach(b => b.onclick = () => { TP = TP.slice(0, +b.dataset.tp); treeAdmin(); });
  document.querySelectorAll('[data-tin]').forEach(el => el.onclick = () => { if (depth < 3) { TP = under.concat([el.dataset.tin]); treeAdmin(); } });
  const lvKey = ['g', 'l1', 'l2', 'l3'][depth];
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
  $('popFile').onchange = async () => {
    const file = $('popFile').files[0]; if (!file) return;
    const out = $('popOut'); out.innerHTML = '<div class="load">읽는 중…</div>';
    try {
      const { XLSX, wb } = await readBook(file);
      let best = null;
      for (const name of wb.SheetNames) { const t = aoa(XLSX, wb, name); const r = parsePop(t); if (r && (!best || r.length > best.length)) best = r; }
      if (!best || !best.length) throw new Error('Item(코드) 열과 Qty(수량) 열을 찾지 못했습니다');
      const C = catalog(), known = best.filter(r => C.byCode[r[0]]);
      out.innerHTML = '<div class="alert a-blu">' + best.length + '개 코드 (목록에 있는 것 ' + known.length + '개). 상위: ' + esc(known.slice(0, 8).map(r => r[0] + ' ' + r[1]).join(', ')) + '</div><div class="btns"><button class="b-blue" id="popGo">저장</button></div>';
      $('popGo').onclick = async () => { busy(true); try { await S.DB.set('catalog', 'pop', { j: JSON.stringify(known.slice(0, 1000)), n: known.length, updatedAt: new Date().toISOString(), by: S.user.email }); await loadCatalog(S, true); toast('✨ 자주 나가는 ' + known.length + '개 저장', 'good'); treeAdmin(); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
    } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
  };
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
    $('tItemList').innerHTML = list.map(x => '<div class="pr"><div class="ct"><b>' + esc(x.c) + '</b><small>' + esc(x.d) + ' · ' + esc([x.l1, x.l2, x.l3].filter(Boolean).map(cleanLbl).join(' › ')) + '</small></div><button class="b-ghost b-sm" data-tfix="' + esc(x.c) + '">바꾸기</button></div>').join('') + (node.n > 300 ? '<div class="muted">300개까지만 보입니다 — 나머지는 아래 "코드로 바꾸기"로</div>' : '');
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
    if (!(await confirmBox('모든 아이템의 분류를 SmartBee 의 LEVEL 1 · LEVEL 2 · GROUP 으로 바꿀까요? (Group 은 Jewelry · Other · Set & Display 로 — 인보이스 A · P · W 와 연결)', '바꾸기'))) return;
    busy(true);
    try {
      const res = await fetch('data/sbm-tree.json?v=' + Date.now()); if (!res.ok) throw new Error('data/sbm-tree.json 을 읽지 못했습니다');
      const m = await res.json();
      const patches = Object.keys(m).map(c => ({ code: c, set: { g: m[c][0], l1: m[c][1], l2: m[c][2], l3: m[c][3] } }));
      const r = await editCatalog(S, (rows, cats, sets) => { cats.length = 0; return applyBulk(rows, cats, sets, patches); });
      toast('SmartBee 분류로 바꿨습니다 — ' + r.changed + '개 (목록에 없는 코드 ' + r.missing.length + ')', 'good'); TP = []; treeAdmin();
    } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
  const dlXlsx = async (rows, name) => { busy(true); try { const XLSX = await loadXlsx(); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1'); XLSX.writeFile(wb, name); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); };
  $('tDlLevel').onclick = () => dlXlsx(sbmLevelRows(), 'LEVEL_1_AND_2_' + today() + '.xlsx');
  $('tDlGroup').onclick = () => dlXlsx(sbmGroupRows(), 'GROUP_NAME_CHANGE_' + today() + '.xlsx');
  $('tCsv').onclick = () => { const blob = new Blob([catalogCsv()], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'the-one-items-' + today() + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  $('tFile').onchange = async () => {
    const file = $('tFile').files[0]; if (!file) return;
    const out = $('tOut'); out.innerHTML = '<div class="load">읽는 중…</div>';
    try {
      const { XLSX, wb } = await readBook(file);
      const name = wb.SheetNames.find(n => /treeupdate|items|아이템|변경/i.test(n)) || wb.SheetNames[0];
      previewBulk(aoa(XLSX, wb, name), name, out);
    } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
  };
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
/** 일괄 변경 미리보기 → 적용 (파일 · 구글 시트 공용) */
function previewBulk(t, name, out) {
  const r = parseBulkSheet(t);
  const rows = catalog().rows.map(x => x.slice()), cats = catalog().cats.map(x => x.slice()), sets = JSON.parse(JSON.stringify(catalog().sets || {}));
  const sum = applyBulk(rows, cats, sets, r.patches);
  const lab = { nc: '코드 변경', d: 'Description', p: 'Price', s: 'SRP', b: 'Barcode', g: 'Group', l1: 'Level 1', l2: 'Level 2', l3: 'Level 3', ph: 'Photo', del: '삭제' };
  out.innerHTML = '<div class="alert a-blu">탭 <b>' + esc(name) + '</b> · ' + r.patches.length.toLocaleString() + '줄 · 바꾸는 열: ' + r.cols.map(k => lab[k]).join(', ') + '<br>바뀌는 아이템 <b>' + sum.changed.toLocaleString() + '</b> · 코드 변경 ' + sum.renamed + ' · 새 아이템 ' + sum.added + ' · 삭제 ' + sum.deleted + '</div>' +
    (r.fixed && r.fixed.length ? '<div class="alert a-grn">SmartBee 내보내기에서 깨진 줄 ' + r.fixed.length + '개를 살려 읽었습니다</div>' : '') +
    (r.broken && r.broken.length ? '<div class="alert a-amb">칸이 깨진 줄 ' + r.broken.length + '개 건너뜀 (줄바꿈 · 탭이 섞임): ' + esc(r.broken.slice(0, 8).join(', ')) + '</div>' : '') +
    (sum.missing.length ? '<div class="alert a-amb">목록에 없는 코드 ' + sum.missing.length + '개 (건너뜀): ' + esc(sum.missing.slice(0, 10).join(', ')) + '</div>' : '') +
    (sum.dupNew.length ? '<div class="alert a-red">새 코드가 이미 있어 바꾸지 못함 ' + sum.dupNew.length + '개: ' + esc(sum.dupNew.slice(0, 10).join(', ')) + '</div>' : '') +
    (sum.changed ? '<button class="b-blue" id="tGo" style="margin-top:8px">이대로 적용 (' + sum.changed.toLocaleString() + '개)</button>' : '<div class="none">바뀌는 것이 없습니다</div>');
  if ($('tGo')) $('tGo').onclick = async () => { if (!(await confirmBox(sum.changed.toLocaleString() + '개 아이템을 바꿀까요? 모든 폰이 새 목록을 받습니다.', '적용'))) return; busy(true); try { await editCatalog(S, (rw, ct, st) => applyBulk(rw, ct, st, r.patches)); toast('적용했습니다 — 모든 폰이 새 목록을 받습니다', 'good'); treeAdmin(); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); };
}
/** 공개(링크 공유) 구글 시트의 탭을 CSV 로 읽어 2차원 배열로 */
async function readSheetTab(id, tab) {
  const url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(id) + '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(tab) + '&t=' + Date.now();
  const res = await fetch(url); if (!res.ok) throw new Error('시트를 읽지 못했습니다 (' + res.status + ')');
  const text = await res.text();
  if (/<html/i.test(text.substring(0, 200))) throw new Error('시트가 공개돼 있지 않거나 탭 이름이 다릅니다');
  return parseCsv(text);
}
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => String(v).trim() !== ''));
}
