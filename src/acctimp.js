/* ============================================================
 *  📇 거래처 목록 업데이트 — 이전 시스템 account list 엑셀 (머리글 없어도 됨)
 *    열: (빈칸) · 계정코드 · 가게 이름 · 주소 · 도시 · 주 · ZIP · 전화 · 담당 세일즈맨  — 머리글이 있으면 이름으로 찾음
 *    ① 새 거래처 추가  ② 바뀐 칸만 고침 (지도 좌표 · 배송지 · 메모 · ACH 같은 앱 정보는 그대로 — 덮어쓰지 않음)
 *    ③ 목록에 없는 거래처 = 💤 비활성 (단, 최근 90일 인보이스 · 앱에서 새로 만든 곳 · "계속 활성" 은 빼고 따로 보여 줌)
 *    ④ 목록에 있는데 💤 인 곳 = 다시 활성
 * ============================================================ */
import { $, esc, toast, busy, confirmBox, pad4, today, addDays } from './ui.js';
import { bumpAccountsVer } from './mgr.js';

let S = null;
export function acctImportCard() {
  return '<div class="card" style="border:2px solid #bbf7d0"><h2>📇 거래처 목록 업데이트 <span class="en">Account list update</span></h2><div class="muted">이전 시스템의 account list 엑셀을 그대로 올리세요 (머리글 없어도 됨: 계정코드 · 가게 · 주소 · 도시 · 주 · ZIP · 전화 · 세일즈맨). ' +
    '새 거래처는 추가, 바뀐 칸만 고치고, 지도 좌표 · 배송지 · 메모 · ACH 같은 앱 정보는 그대로 둡니다. <b>목록에 없는 거래처는 💤 비활성</b>으로 (최근 거래가 있거나 앱에서 새로 만든 곳은 빼고 따로 보여 줌). 미리보기 → 적용.</div>' +
    '<div class="fg" style="margin-top:8px"><input type="file" id="acImpF" accept=".xlsx,.xls,.csv"></div><div id="acImpOut"></div></div>';
}
export function bindAcctImport(state, readBook, aoa) {
  S = state;
  $('acImpF').onchange = () => { const f = $('acImpF').files[0]; if (f) acctFile(state, f, $('acImpOut'), readBook, aoa); };
}
/** 거래처 목록 파일 하나 — 미리보기 → 적용 (📥 파일 올리기 자동 인식에서도 씀) */
export async function acctFile(state, f, out, readBook, aoa) {
  S = state; out.innerHTML = '<div class="load">읽는 중…</div>';
  try { const { XLSX, wb } = await readBook(f); await preview(parseAcctList(aoa(XLSX, wb, wb.SheetNames[0])), out); }
  catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
}

const sv = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const zip5 = v => { const s = sv(v).replace(/\.0+$/, ''); return /^\d{3,4}$/.test(s) ? s.padStart(5, '0') : s; };   // 엑셀이 지운 앞 0 (NJ · MA 07302)
/** 엑셀 → [{acct, store, addr, city, state, zip, tel, sm}] */
export function parseAcctList(t) {
  if (!t || !t.length) throw new Error('시트가 비어 있습니다');
  const isCode = v => /^\d{1,5}$/.test(sv(v).replace(/\.0+$/, ''));
  /* 머리글이 있으면 이름으로 */
  const want = { acct: /^(acct|account|cust(omer)?)\s*(#|no|code|3)?$|계정|^code$/i, store: /^(name|store|customer\s*name|가게)/i, addr: /^(address|addr|주소)/i, city: /^city|도시/i, state: /^(state|st)$|^주$/i, zip: /^zip|우편/i, tel: /^(phone|tel|전화)/i, sm: /(sales\s*)?rep|salesman|세일즈맨|담당/i };
  let hi = -1, ix = null;
  for (let r = 0; r < Math.min(5, t.length); r++) { const row = (t[r] || []).map(sv); const m = {}; Object.keys(want).forEach(k => { const c = row.findIndex(h => h && !isCode(h) && want[k].test(h)); if (c >= 0) m[k] = c; }); if (m.acct != null && m.store != null) { hi = r; ix = m; break; } }
  if (!ix) {
    /* 머리글 없음 — 계정코드(숫자)가 가장 많은 열 다음부터 가게 · 주소 · 도시 · 주 · ZIP · 전화 · 세일즈맨 */
    const n = Math.max(...t.slice(0, 50).map(r => (r || []).length)); let best = -1, bn = 0;
    for (let c = 0; c < n; c++) { const k = t.slice(0, 50).filter(r => r && isCode(r[c])).length; if (k > bn) { bn = k; best = c; } }
    if (best < 0) throw new Error('계정코드 열을 찾지 못했습니다');
    ix = { acct: best, store: best + 1, addr: best + 2, city: best + 3, state: best + 4, zip: best + 5, tel: best + 6, sm: best + 7 };
  }
  const out = [], seen = {}, dup = [];
  for (let r = hi + 1; r < t.length; r++) {
    const row = t[r] || []; const raw = sv(row[ix.acct]).replace(/\.0+$/, ''); if (!isCode(raw)) continue;
    const acct = pad4(raw), store = sv(row[ix.store]); if (!store) continue;
    if (seen[acct]) { dup.push(acct); continue; } seen[acct] = 1;
    const g = k => ix[k] == null ? '' : sv(row[ix[k]]);
    out.push({ acct, store, addr: g('addr'), city: g('city'), state: g('state').toUpperCase(), zip: zip5(row[ix.zip]), tel: g('tel'), sm: g('sm').toUpperCase() });
  }
  if (!out.length) throw new Error('거래처 줄을 찾지 못했습니다');
  return { rows: out, dup };
}
const F = ['store', 'addr', 'city', 'state', 'zip', 'tel', 'sm'];
const LAB = { store: '가게 이름', addr: '주소', city: '도시', state: '주', zip: 'ZIP', tel: '전화', sm: '세일즈맨' };

async function preview(P, out) {
  out.innerHTML = '<div class="load">지금 거래처 읽는 중…</div>';
  const cur = (await S.DB.list('accounts')).map(a => Object.assign({ acct: a.id }, a)), by = {}; cur.forEach(a => { by[a.acct] = a; });   // 폰에 저장된 목록 말고 서버 최신으로
  const inFile = {}; P.rows.forEach(r => { inFile[r.acct] = 1; });
  const add = [], chg = [], react = [], cnt = {};
  P.rows.forEach(r => {
    const a = by[r.acct];
    if (!a) { add.push(r); return; }
    const d = {}; F.forEach(k => { if (k === 'tel' && !r.tel) return; if (sv(a[k]) !== r[k] && !(k === 'zip' && zip5(a[k]) === r[k])) { d[k] = r[k]; cnt[k] = (cnt[k] || 0) + 1; } });
    if (Object.keys(d).length) chg.push({ a, r, d });
    if (a.inactive) react.push(a);
  });
  /* 목록에 없는 곳 — 최근 90일 인보이스가 있거나, 앱에서 90일 안에 만들었거나, "계속 활성" 이면 빼 둠 */
  out.innerHTML = '<div class="load">최근 거래 확인 중…</div>';
  let recent = {};
  try { (await S.DB.list('invoices', { where: [['d', '>=', addDays(today(), -90)]] })).forEach(v => { if (v.acct && v.st !== 'x') recent[v.acct] = v.d > (recent[v.acct] || '') ? v.d : recent[v.acct]; }); } catch (e) { recent = {}; }
  const cut = addDays(today(), -90);
  const gone = cur.filter(a => !inFile[a.acct] && !a.inactive);
  const keep = gone.filter(a => recent[a.acct] || a.keepActive || (a.createdAt && String(a.createdAt).slice(0, 10) >= cut));
  const off = gone.filter(a => !keep.includes(a));
  const why = a => recent[a.acct] ? '최근 인보이스 ' + recent[a.acct] : a.keepActive ? '계속 활성으로 지정됨' : '앱에서 새로 만든 곳';
  const smNew = {}; P.rows.forEach(r => { if (r.sm && !(S.smByCode || {})[r.sm]) smNew[r.sm] = (smNew[r.sm] || 0) + 1; });
  const list = (L, f, max) => L.slice(0, max || 30).map(f).join('') + (L.length > (max || 30) ? '<div class="muted">… ' + (L.length - (max || 30)).toLocaleString() + '곳 더</div>' : '');
  out.innerHTML = '<div class="alert a-blu" style="margin-top:8px">파일 거래처 <b>' + P.rows.length.toLocaleString() + '</b>곳 · 지금 앱 ' + cur.length.toLocaleString() + '곳 (활성 ' + cur.filter(a => !a.inactive).length.toLocaleString() + ')' + (P.dup.length ? ' · 중복 코드 ' + P.dup.length + ' 건너뜀' : '') + '</div>' +
    (Object.keys(smNew).length ? '<div class="alert a-amb">⚠️ 세일즈맨 목록에 없는 이름: ' + Object.keys(smNew).map(k => '<b>' + esc(k) + '</b> ' + smNew[k] + '곳').join(' · ') + ' — 오타가 아닌지 확인하세요</div>' : '') +
    '<details class="sumbox"' + (add.length ? ' open' : '') + '><summary><b>＋ 새 거래처 ' + add.length + '곳</b></summary>' + list(add, r => '<div class="muted">' + esc(r.acct + ' ' + r.store + ' · ' + r.city + ' ' + r.state + ' · ' + r.sm) + '</div>') + '</details>' +
    '<details class="sumbox"><summary><b>✏️ 바뀐 거래처 ' + chg.length + '곳</b> <span class="muted">' + Object.keys(cnt).map(k => LAB[k] + ' ' + cnt[k]).join(' · ') + '</span></summary>' + list(chg, x => '<div class="muted"><b>' + esc(x.a.acct + ' ' + x.a.store) + '</b>: ' + Object.keys(x.d).map(k => esc(LAB[k]) + ' ' + esc(x.a[k] || '—') + ' → <b>' + esc(x.d[k] || '—') + '</b>').join(' · ') + '</div>', 60) + '</details>' +
    (react.length ? '<details class="sumbox"><summary><b>✅ 다시 활성 ' + react.length + '곳</b> <span class="muted">(목록에 있는데 지금 💤)</span></summary>' + list(react, a => '<div class="muted">' + esc(a.acct + ' ' + a.store) + '</div>') + '</details>' : '') +
    '<label class="pick on" id="acOffP" style="margin-top:8px"><span class="ck">✓</span><span class="pm"><b>💤 목록에 없는 거래처 ' + off.length.toLocaleString() + '곳 비활성으로</b><small>거래처 목록 · 검색 맨 뒤로 가고 💤 표시. 기록은 그대로, 언제든 다시 활성 가능 (거래처 창 → 수정)</small></span></label>' +
    '<details class="sumbox"><summary class="muted">비활성 될 곳 보기</summary>' + list(off, a => '<div class="muted">' + esc(a.acct + ' ' + a.store + ' · ' + (a.sm || '')) + '</div>', 80) + '</details>' +
    (keep.length ? '<details class="sumbox" open><summary><b>⚠️ 목록에 없지만 그대로 둘 곳 ' + keep.length + '곳</b> <span class="muted">— 확인해 보세요</span></summary>' + list(keep, a => '<div class="muted">' + esc(a.acct + ' ' + a.store + ' · ' + (a.sm || '')) + ' — <b>' + esc(why(a)) + '</b></div>', 80) + '</details>' : '') +
    '<button class="b-blue" id="acGo" style="margin-top:10px">✅ 적용</button><div id="acProg" class="muted" style="margin-top:6px"></div>';
  $('acOffP').onclick = () => $('acOffP').classList.toggle('on');
  $('acGo').onclick = async () => {
    const doOff = $('acOffP').classList.contains('on');
    if (!(await confirmBox('새 거래처 ' + add.length + ' · 고침 ' + chg.length + ' · 다시 활성 ' + react.length + (doOff ? ' · 💤 비활성 ' + off.length : '') + ' — 적용할까요?', '적용'))) return;
    const now = new Date().toISOString(), me = S.user.email, ops = [];
    add.forEach(r => ops.push({ op: 'set', col: 'accounts', id: r.acct, data: Object.assign({}, r, { createdAt: now, createdBy: me, src: 'acctlist' }) }));
    const upd = {}; const put = (id, d) => { upd[id] = Object.assign(upd[id] || {}, d); };
    chg.forEach(x => put(x.a.acct, Object.assign({}, x.d, { updatedAt: now })));
    react.forEach(a => put(a.acct, { inactive: false, reactAt: now, reactBy: me }));
    if (doOff) off.forEach(a => put(a.acct, { inactive: true, inactiveAt: now, inactiveBy: me, inactiveWhy: '거래처 목록에서 빠짐' }));
    Object.keys(upd).forEach(id => ops.push({ op: 'update', col: 'accounts', id, data: upd[id] }));
    busy(true); const prog = $('acProg'); let done = 0;
    try {
      for (let i = 0; i < ops.length; i += 400) { await S.DB.batch(ops.slice(i, i + 400)); done = Math.min(ops.length, i + 400); prog.textContent = done.toLocaleString() + ' / ' + ops.length.toLocaleString() + ' 저장 중…'; }
      await bumpAccountsVer();
      prog.innerHTML = '<div class="alert a-grn">적용했습니다 — 새 ' + add.length + ' · 고침 ' + chg.length + ' · 다시 활성 ' + react.length + (doOff ? ' · 💤 ' + off.length : '') + '. 주소가 바뀐 곳은 지도 좌표가 6시간 안에 다시 잡힙니다.</div>';
      toast('거래처 목록 업데이트 완료', 'good');
    } catch (e) { prog.innerHTML = '<div class="alert a-red">' + done + '건까지 저장하고 멈춤: ' + esc(e.code || e.message) + ' — 같은 파일을 다시 올리면 이어서 됩니다</div>'; }
    busy(false);
  };
}
