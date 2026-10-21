/* ============================================================
 *  📥 레벨 · 그룹 일괄 변경 — 엑셀로 아이템 코드마다 Level 1 · Level 2 · GROUP NAME(Level 3) 을 정해서 한꺼번에
 *    ① 받기: 지금 상태를 엑셀로 (전체 · 코드/이름 · Level 1 · 분류 없음 · 숨김 으로 골라서) + "분류 목록" 탭
 *    ② 엑셀에서 고치기   ③ 올리기 → 바뀌는 것 미리보기 (새 이름 경고) → 적용
 *  규칙은 이전 시스템 LEVEL_1_AND_2 와 같음: LEVEL 1 이 빈 줄 = 🙈 숨김, 레벨이 있으면 보임 · Group(A · P · W) 은 Level 1 앞글자로
 * ============================================================ */
import { $, esc, toast, busy, openModal, closeModal, confirmBox } from './ui.js';
import { loadCatalog, catalog, editCatalog, parseBulkSheet, applyBulk, cleanName, SET_L1, NO_L1 } from './catalog.js';

const loadXlsx = () => window.XLSX ? Promise.resolve(window.XLSX) : new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error('엑셀 도구를 불러오지 못했습니다 (인터넷 확인)')); document.head.appendChild(s); });
const today = () => new Date().toISOString().slice(0, 10);
const key = s => String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();
const lbl = s => s ? cleanName(s) : '—';
let S = null, F = { by: 'all', q: '', l1: '' };

/** 받을 아이템 — 지금 고른 범위 */
function pick() {
  const C = catalog(), q = key(F.q);
  return C.items.filter(x => {
    if (F.by === 'q') return q && (key(x.c).includes(q) || key(x.d).includes(q));
    if (F.by === 'l1') return F.l1 && x.l1 === F.l1;
    if (F.by === 'none') return !x.h && !x.l1;
    if (F.by === 'hid') return x.h;
    return true;
  });
}
/** 주문 화면에 Level 1 로 안 보이는 것 */
function diag() { const C = catalog(); return { hid: C.items.filter(x => x.h).length, none: C.items.filter(x => !x.h && !x.l1 && !x.virt).length, sets: C.items.filter(x => !x.h && !x.l1 && x.virt).length }; }
function l1List() { const m = {}; catalog().items.forEach(x => { if (x.l1) m[x.l1] = (m[x.l1] || 0) + 1; }); return Object.keys(m).sort((a, b) => cleanName(a).localeCompare(cleanName(b))).map(k => [k, m[k]]); }

export async function levelTool(state, done) {
  S = state;
  busy(true); try { await loadCatalog(S); } catch (e) { /* 캐시로 */ } busy(false);
  if (!catalog()) return toast('아이템 목록을 읽지 못했습니다', 'bad');
  paint(done);
}

function paint(done) {
  const d = diag(), L1 = l1List();
  openModal('<h2>📥 레벨 · 그룹 일괄 변경 <span class="en">Level · Group bulk update</span></h2>' +
    '<div class="sumbox"><b>주문 화면에서 안 보이는 아이템</b><div class="muted" style="margin-top:4px">' +
    '<a href="javascript:void 0" data-lq="hid">🙈 숨김 ' + d.hid.toLocaleString() + '개</a> — 세일즈맨 주문 화면(분류 · 검색)에서 빠짐<br>' +
    '<a href="javascript:void 0" data-lq="none">❔ Level 1 없음 ' + (d.none + d.sets).toLocaleString() + '개</a> — 검색은 되고 분류에는 맨 뒤 <b>' + esc(cleanName(NO_L1)) + '</b>' + (d.sets ? ' · 세트 ' + d.sets + '개는 <b>' + esc(cleanName(SET_L1)) + '</b>' : '') + ' 에 모여 있음. 제자리 Level 1 을 넣어 주세요.</div></div>' +
    '<div class="card" style="margin:10px 0 0;box-shadow:none;border:1px solid var(--line,#e5e7eb)"><b>① 지금 상태 받기</b>' +
    '<div class="seg" style="margin-top:6px;flex-wrap:wrap">' + [['all', '전체'], ['q', '🔎 코드 · 이름'], ['l1', 'Level 1'], ['none', '❔ 분류 없음'], ['hid', '🙈 숨김']].map(m => '<button class="' + (F.by === m[0] ? 'on' : '') + '" data-lb="' + m[0] + '">' + m[1] + '</button>').join('') + '</div>' +
    (F.by === 'q' ? '<input id="lvQ" value="' + esc(F.q) + '" placeholder="예: BD · BJB · BODY" autocapitalize="characters" style="margin-top:6px">' : '') +
    (F.by === 'l1' ? '<select id="lvL1" style="margin-top:6px"><option value="">— Level 1 고르기 —</option>' + L1.map(x => '<option value="' + esc(x[0]) + '"' + (F.l1 === x[0] ? ' selected' : '') + '>' + esc(cleanName(x[0])) + ' (' + x[1] + ')</option>').join('') + '</select>' : '') +
    '<button class="b-blue" id="lvDl" style="margin-top:8px">⬇️ 엑셀 받기 · <span id="lvN">' + pick().length.toLocaleString() + '</span>개</button>' +
    '<div class="hint">열: <b>ITEM CODE · 참고 DESCRIPTION · LEVEL 1 · LEVEL 2 · GROUP NAME · HIDE</b>. 두 번째 탭 "분류 목록"에 지금 쓰는 Level 1 › Level 2 이름이 있습니다 — 거기서 복사해 붙이면 오타가 없습니다.</div></div>' +
    '<div class="card" style="margin:10px 0 0;box-shadow:none;border:1px solid var(--line,#e5e7eb)"><b>② 엑셀에서 고치기 → ③ 올리기</b>' +
    '<div class="muted" style="margin-top:4px">· 바꿀 줄만 남겨도 됩니다 (파일에 없는 아이템은 그대로)<br>· <b>HIDE 칸에 x = 🙈 숨김</b>, 비우면 👁 보임 (주문 화면에 나옴)<br>· HIDE 열이 없는 파일(이전 시스템 LEVEL_1_AND_2)은 <b>LEVEL 1 이 빈 줄 = 🙈 숨김</b><br>· LEVEL 2 · GROUP NAME 이 빈 칸이면 지금 값 그대로<br>· Group(인보이스 A · P · W)은 Level 1 앞글자로 자동: 보통 이름 → Jewelry(A) · [ ] → Other(P) · "" → Set &amp; Display(W)<br>· 이전 시스템 LEVEL_1_AND_2 · GROUP_NAME_CHANGE 파일도 그대로 됩니다</div>' +
    '<input type="file" id="lvF" accept=".xlsx,.xls,.csv" style="margin-top:8px"><div id="lvOut"></div></div>' +
    '<div class="btns"><button class="b-ghost" id="lvX">닫기</button></div>', { wide: true });
  const cnt = () => { if ($('lvN')) $('lvN').textContent = pick().length.toLocaleString(); };
  document.querySelectorAll('[data-lb]').forEach(b => b.onclick = () => { F.by = b.dataset.lb; paint(done); });
  document.querySelectorAll('[data-lq]').forEach(a => a.onclick = () => { F.by = a.dataset.lq; paint(done); });
  if ($('lvQ')) { $('lvQ').oninput = () => { F.q = $('lvQ').value; cnt(); }; setTimeout(() => $('lvQ') && $('lvQ').focus(), 50); }
  if ($('lvL1')) $('lvL1').onchange = () => { F.l1 = $('lvL1').value; cnt(); };
  $('lvX').onclick = closeModal;
  $('lvDl').onclick = download;
  $('lvF').onchange = () => upload(done);
}

async function download() {
  const list = pick(); if (!list.length) return toast('받을 아이템이 없습니다', 'bad');
  busy(true);
  try {
    const XLSX = await loadXlsx(), wb = XLSX.utils.book_new();
    const rows = [['ITEM CODE', '참고 DESCRIPTION', 'LEVEL 1', 'LEVEL 2', 'GROUP NAME', 'HIDE']].concat(list.map(x => [x.c, x.d || '', x.l1 || '', x.l2 || '', x.l3 || '', x.h ? 'x' : '']));
    const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = [{ wch: 16 }, { wch: 40 }, { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 7 }];
    XLSX.utils.book_append_sheet(wb, ws, 'LEVEL');
    /* 분류 목록 — 지금 쓰는 Level 1 › Level 2 › GROUP NAME 과 아이템 수 */
    const m = {}; catalog().items.forEach(x => { if (!x.l1) return; const k = [x.l1, x.l2 || '', x.l3 || ''].join('\u0001'); m[k] = (m[k] || 0) + 1; });
    const cats = [['LEVEL 1', 'LEVEL 2', 'GROUP NAME', '아이템 수']].concat(Object.keys(m).sort().map(k => k.split('\u0001').concat([m[k]])));
    const ws2 = XLSX.utils.aoa_to_sheet(cats); ws2['!cols'] = [{ wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws2, '분류 목록');
    const nm = F.by === 'q' ? key(F.q).replace(/[^A-Z0-9]+/g, '_') : F.by === 'l1' ? cleanName(F.l1).replace(/[^A-Za-z0-9]+/g, '_') : F.by;
    XLSX.writeFile(wb, 'LEVEL_' + nm + '_' + today() + '.xlsx');
  } catch (e) { toast('실패: ' + e.message, 'bad'); }
  busy(false);
}

/** 대소문자 · 띄어쓰기만 다른 이름은 지금 쓰는 이름으로 맞춤 (body jewelry → BODY JEWELRY) */
function canon(patches) {
  const C = catalog(), n1 = {}, n2 = {}, n3 = {};
  C.items.forEach(x => { if (x.l1) n1[key(x.l1)] = x.l1; if (x.l2) n2[key(x.l1) + '|' + key(x.l2)] = x.l2; if (x.l3) n3[key(x.l3)] = n3[key(x.l3)] || x.l3; });
  const fresh1 = {}, fresh2 = {};
  patches.forEach(p => {
    const s = p.set;
    if (s.l1) { const c = n1[key(s.l1)]; if (c) s.l1 = c; else fresh1[s.l1] = (fresh1[s.l1] || 0) + 1; }
    if (s.l2) { const l1 = s.l1 || (C.byCode[p.code] || {}).l1 || ''; const c = n2[key(l1) + '|' + key(s.l2)]; if (c) s.l2 = c; else if (!fresh1[l1]) { const k = cleanName(l1) + ' › ' + s.l2; fresh2[k] = (fresh2[k] || 0) + 1; } }
    if (s.l3) { const c = n3[key(s.l3)]; if (c) s.l3 = c; }
  });
  return { fresh1, fresh2 };
}

async function upload(done) {
  const file = $('lvF').files[0]; if (!file) return;
  const out = $('lvOut'); out.innerHTML = '<div class="load">읽는 중…</div>';
  try {
    const XLSX = await loadXlsx();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const name = wb.SheetNames.find(n => /^level/i.test(n.trim())) || wb.SheetNames[0];
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' });
    /* HIDE 열이 있으면 그 칸으로 숨김을 정함 (x = 숨김 · 빈 칸 = 보임) — 없으면 옛 규칙(LEVEL 1 빈 줄 = 숨김) */
    const hr = (aoa[0] || []).map(h => String(h || '').trim().toLowerCase()), hi = hr.findIndex(h => /^(hide|hidden|숨김)$/.test(h)), ci = hr.findIndex(h => /^(item ?code|code|코드|아이템 ?코드)$/.test(h));
    const r = parseBulkSheet(aoa, { keepBlank: hi >= 0 });
    if (hi >= 0 && ci >= 0) { const hm = {}; aoa.slice(1).forEach(x => { const c = String(x[ci] || '').trim().toUpperCase(); if (c) hm[c] = /^(x|y|yes|1|true|숨김|hide|hidden)$/i.test(String(x[hi] || '').trim()) ? 1 : 0; }); r.patches.forEach(p => { if (p.code in hm) p.set.h = hm[p.code]; }); }
    const bad = r.cols.filter(k => !['l1', 'l2', 'l3', 'g', 'h'].includes(k));
    if (bad.length) throw new Error('이 도구는 Level · Group 만 바꿉니다 — 다른 열(' + bad.join(', ') + ')이 있는 파일은 관리 → 분류 → 일괄 변경 파일에서 올리세요');
    const { fresh1, fresh2 } = canon(r.patches);
    /* 지금과 같은 값은 빼서 진짜 바뀌는 것만 — Level 1 이 그대로면 Group 도 그대로 둠 */
    const C0 = catalog();
    r.patches = r.patches.filter(p => {
      const it = C0.byCode[p.code], s = p.set; if (!it) return true;
      ['l1', 'l2', 'l3'].forEach(k => { if (k in s && (s[k] || '') === (it[k] || '')) delete s[k]; });
      if ('h' in s && s.h === (it.h ? 1 : 0)) delete s.h;
      if (!('l1' in s)) delete s.g;
      return Object.keys(s).length > 0;
    });
    const C = catalog(), rows = C.rows.map(x => x.slice()), cats = C.cats.map(x => x.slice()), sets = JSON.parse(JSON.stringify(C.sets || {}));
    const sum = applyBulk(rows, cats, sets, r.patches);
    /* 바뀌는 것 — 전/후 */
    const was = {}; C.rows.forEach(x => { was[x[0]] = x; });
    const diffs = [];
    rows.forEach(x => { const w = was[x[0]] || (C.byCode[x[0]] ? [x[0], '', 0, 0, '', C.byCode[x[0]].g || '', '', '', '', '', 0] : null); if (!w) return; if (w[5] !== x[5] || w[6] !== x[6] || w[7] !== x[7] || w[8] !== x[8] || (w[10] ? 1 : 0) !== (x[10] ? 1 : 0)) diffs.push([w, x]); });
    const path = x => x[10] ? '🙈 숨김' : [x[6], x[7], x[8]].map(lbl).join(' › ');
    const f1 = Object.keys(fresh1), f2 = Object.keys(fresh2);
    out.innerHTML = '<div class="alert a-blu" style="margin-top:8px">파일 <b>' + esc(file.name) + '</b> · ' + r.patches.length.toLocaleString() + '줄<br>바뀌는 아이템 <b>' + diffs.length.toLocaleString() + '</b>개' + (sum.hidden || sum.shown ? ' · 🙈 숨김 ' + sum.hidden + ' · 👁 보임 ' + sum.shown : '') + (sum.sets ? ' · 🧩 세트 ' + sum.sets + '개 분류 지정' : '') + '</div>' +
      (r.fixed && r.fixed.length ? '<div class="alert a-grn">이전 시스템 내보내기에서 깨진 줄 ' + r.fixed.length + '개를 살려 읽었습니다</div>' : '') +
      (f1.length ? '<div class="alert a-amb">⚠️ 새 Level 1 이 생깁니다 (오타가 아닌지 확인): ' + f1.map(k => '<b>' + esc(k) + '</b> ' + fresh1[k] + '개').join(' · ') + '</div>' : '') +
      (f2.length ? '<div class="alert a-amb">⚠️ 새 Level 2 가 생깁니다: ' + f2.slice(0, 20).map(k => '<b>' + esc(k) + '</b> ' + fresh2[k] + '개').join(' · ') + (f2.length > 20 ? ' …' : '') + '</div>' : '') +
      (sum.missing.length ? '<div class="alert a-amb">목록에 없는 코드 ' + sum.missing.length + '개 (건너뜀): ' + esc(sum.missing.slice(0, 12).join(', ')) + (sum.missing.length > 12 ? ' …' : '') + '</div>' : '') +
      (diffs.length ? '<div class="lvdiff">' + diffs.slice(0, 300).map(p => '<div class="pr"><div class="ct"><b>' + esc(p[1][0]) + '</b><small>' + esc(path(p[0])) + '</small><small>→ <b>' + esc(path(p[1])) + '</b></small></div></div>').join('') + (diffs.length > 300 ? '<div class="muted">… ' + (diffs.length - 300).toLocaleString() + '개 더</div>' : '') + '</div>' +
        '<button class="b-blue" id="lvGo" style="margin-top:8px">✅ 이대로 적용 (' + diffs.length.toLocaleString() + '개)</button>' : '<div class="none">바뀌는 것이 없습니다</div>');
    if ($('lvGo')) $('lvGo').onclick = async () => {
      if (!(await confirmBox(diffs.length.toLocaleString() + '개 아이템의 분류를 바꿀까요? 모든 폰이 새 목록을 받습니다.', '적용'))) return;
      busy(true);
      try { await editCatalog(S, (rw, ct, st) => applyBulk(rw, ct, st, r.patches)); await loadCatalog(S, true); toast('✅ ' + diffs.length + '개 분류 변경 — 모든 폰에 반영됩니다', 'good'); closeModal(); if (done) done(); }
      catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
      busy(false);
    };
  } catch (e) { out.innerHTML = '<div class="alert a-red" style="margin-top:8px">' + esc(e.message) + '</div>'; }
}
