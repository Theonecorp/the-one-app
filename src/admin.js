/* ============================================================
 *  관리 — 사용자 · 세일즈맨(요율) · 설정 · 옛 시트에서 가져오기
 * ============================================================ */
import { $, esc, money, num, R2, today, ym, toast, busy, openModal, closeModal, confirmBox, Router, sel, sum, sortBy, pad4, nz } from './ui.js';
import { newId } from './db.js';
import { RATE_LABELS, RATE_DEFAULT, invType } from './comm.js';
import { bumpAccountsVer } from './mgr.js';
import { roleLabel } from './main.js';
import { parseItemMaster, publishCatalog, loadCatalog } from './catalog.js';

let S = null, TAB = 'users';
export function register(state) { S = state; Router.on('admin', pageAdmin); }
async function pageAdmin(arg) {
  if (arg) TAB = arg;
  let h = '<div class="seg">' + [['users', '👤 사용자'], ['sms', '🧑‍💼 세일즈맨'], ['set', '⚙️ 설정'], ['cat', '📦 아이템'], ['imp', '📥 가져오기']].map(t => '<button class="' + (TAB === t[0] ? 'on' : '') + '" data-at="' + t[0] + '">' + t[1] + '</button>').join('') + '</div><div id="adminBody"><div class="load">읽는 중…</div></div>';
  $('page').innerHTML = h;
  document.querySelectorAll('[data-at]').forEach(b => b.onclick = () => { TAB = b.dataset.at; pageAdmin(); });
  try { if (TAB === 'users') await users(); else if (TAB === 'sms') await salesmen(); else if (TAB === 'set') await settings(); else if (TAB === 'cat') await catalogAdmin(); else await importer(); }
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
    '<div class="card">' + list.map(u => '<div class="pr tap" data-u="' + esc(u.email) + '"><div class="ct"><b>' + esc(u.name || u.email) + ' <span class="tag ' + (u.role === 'admin' ? 't-a' : u.role === 'manager' ? 't-b' : 't-k') + '">' + roleLabel(u.role) + '</span>' + (u.sm ? ' <span class="tag t-g">' + esc(u.sm) + '</span>' : '') + (u.achAccess ? ' <span class="tag t-r">ACH</span>' : '') + (u.active === false ? ' <span class="tag t-g">비활성</span>' : '') + '</b><small>' + esc(u.email) + '</small></div></div>').join('') + '</div>';
  $('uNew').onclick = () => userForm(null);
  document.querySelectorAll('[data-u]').forEach(el => el.onclick = () => userForm(list.find(u => u.email === el.dataset.u)));
}
function userForm(u) {
  u = u || {};
  openModal('<h2>' + (u.email ? esc(u.email) : '＋ 사용자') + '</h2>' +
    '<div class="fg"><label>구글 이메일</label><input id="uEmail" value="' + esc(u.email || '') + '" ' + (u.email ? 'readonly' : '') + ' placeholder="name@gmail.com"></div>' +
    '<div class="two"><div class="fg"><label>이름</label><input id="uName" value="' + esc(u.name || '')+ '"></div><div class="fg"><label>역할</label>' + sel('uRole', [['salesman', '세일즈맨'], ['manager', '담당자'], ['admin', '관리자']], u.role || 'salesman') + '</div></div>' +
    '<div class="two"><div class="fg"><label>세일즈맨 코드</label><input id="uSm" list="uSmList" value="' + esc(u.sm || '') + '" placeholder="예: BRANDON" style="text-transform:uppercase" autocomplete="off"><datalist id="uSmList">' + S.sms.map(s => '<option value="' + esc(s.code) + '">').join('') + '</datalist><small class="muted">목록에 없으면 그대로 입력 — 저장할 때 세일즈맨도 같이 만듭니다</small></div><div class="fg"><label>옵션</label><label class="muted" style="display:flex;gap:6px;align-items:center;padding:8px 0"><input type="checkbox" id="uAch" style="width:18px;height:18px" ' + (u.achAccess ? 'checked' : '') + '> ACH 은행 정보 접근</label><label class="muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="uAct" style="width:18px;height:18px" ' + (u.active !== false ? 'checked' : '') + '> 활성</label></div></div>' +
    '<div class="btns">' + (u.email && u.email !== S.user.email ? '<button class="b-ghost" id="uDel">삭제</button>' : '') + '<button class="b-blue" id="uSave">저장</button></div>');
  $('uSave').onclick = async () => {
    const email = $('uEmail').value.trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('이메일을 확인하세요', 'bad');
    let smv = $('uSm').value.trim().toUpperCase().replace(/\s+/g, ' ');
    if (!smv && $('uRole').value === 'salesman' && $('uName').value.trim()) smv = $('uName').value.trim().toUpperCase().split(/\s+/)[0];
    const doc = { email, name: $('uName').value.trim(), role: $('uRole').value, sm: smv, achAccess: $('uAch').checked, active: $('uAct').checked, updatedAt: new Date().toISOString() };
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
    '<div class="muted">AR 기준일: ' + esc(s.arAsOf || '없음') + ' · 거래처 버전: ' + esc(s.accountsVer || '0') + '</div>' +
    '<div class="btns"><button class="b-blue" id="stSave">저장</button></div></div>';
  $('stSave').onclick = async () => { const doc = Object.assign({}, s, { discLimit: num($('stDisc').value) / 100, specialKeywords: $('stKw').value.trim(), specialTitle: $('stTitle').value.trim(), reportTo: $('stMail').value.trim() }); busy(true); try { await S.DB.set('settings', 'app', doc); S.settings = doc; toast('저장'); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); };
}

/* ============================================================
 *  📥 가져오기 — 옛 구글 시트를 엑셀로 내려받은 파일을 그대로 올립니다
 *   · The One 수금 입력 (2026).xlsx → _ACCOUNTS → accounts · _SALESMEN → salesmen/users · _ENTRIES → entries
 *   · THE ONE 수금 (SALES).xlsx → COD 입력 → cod · 세일즈맨 탭 → entries 의 sb/rc/v/disc/note/인보이스 금액
 *   · THE ONE 커미션.xlsx → 세일즈맨 요율 · 정산 기록(settled)
 * ============================================================ */
async function importer() {
  $('adminBody').innerHTML = '<div class="card"><h2>📥 옛 시트에서 가져오기</h2><div class="muted">구글 시트를 <b>파일 → 다운로드 → Microsoft Excel</b> 로 받은 파일을 올립니다. 같은 ID 는 덮어쓰므로 여러 번 올려도 됩니다. 순서: ① 수금 입력 파일 → ② SALES 파일 → ③ 커미션 파일.</div>' +
    '<div class="fg" style="margin-top:10px"><label>① The One 수금 입력 (2026).xlsx — 거래처 · 세일즈맨 · 수금</label><input type="file" id="f1" accept=".xlsx"></div>' +
    '<div class="fg"><label>② THE ONE 수금 (SALES).xlsx — COD 입력 · 세일즈맨 탭의 확인 표시</label><input type="file" id="f2" accept=".xlsx"></div>' +
    '<div class="fg"><label>③ THE ONE 커미션.xlsx — 요율 · 정산 기록</label><input type="file" id="f3" accept=".xlsx"></div>' +
    '<div id="impOut"></div></div>';
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
    '<div class="card"><h2>🛒 오더 탭</h2><label class="pick ' + (S.settings.ordersOn ? 'on' : '') + '" id="ordOn"><span class="ck">✓</span><span class="pm"><b>세일즈맨 · 담당자에게 오더 탭 보이기</b><small>끄면 관리자만 봅니다 (시험용)</small></span></label></div>';
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
