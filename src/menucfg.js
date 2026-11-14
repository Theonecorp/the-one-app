/* ============================================================
 *  🧭 서랍 메뉴 설정 — 관리 › 🧭 메뉴 (v0.8.241 · 2026-11-14 관리자: "서랍에 나오는 고정 메뉴 전체를 관리 화면에서 앱 관리자가 지정 —
 *     카테고리 레벨 정리하듯이 · 역할에 맞게 보이도록 · 이름 변경 · 위아래 이동 · 정리한 뒤에 셋업하고 고정")
 *   역할을 고르면 그 역할의 서랍(묶음 → 화면)이 나옴 · 줄마다 ☑ 보이기 · 이름 · ↑ ↓ · (화면) 다른 묶음으로
 *   저장 = settings/app.drawerCfg[역할] · ↺ 기본값 = 그 역할 설정 지움 (원래 서랍)
 *   권한은 서랍이 따로 지킴: 그 역할이 못 여는 화면은 켜도 안 보이고, 🔒 오너 전용(경영 · 정산 · 수금 현황 …)은 오너 · 관리자에게만
 * ============================================================ */
import { $, esc, toast, busy, confirmBox, bt, bi } from './ui.js';
import { JOBS, drawerModel, redrawDrawer } from './main.js';

let ROLE = 'office', ED = null, DIRTY = false;
/* 이름이 같은 화면 구별 (홈이 여러 개) */
const HINT = () => ({ shome: bt('담당자 대시보드', 'Staff dashboard'), own: bt('관리자 · 오너 대시보드', 'Owner dashboard'), home: bt('세일즈맨 홈', 'Salesman home'), catmg: bt('디자인 홈', 'Design home'), verify: bt('회계 홈 · 수금 확인', 'Accounting home'), now: bt('수금 현황', 'Collections status') });
const ROLES = () => [['admin', '⚙️ ' + bt('관리자', 'Admin')], ['owner', '👑 ' + bt('오너', 'Owner')], ['salesman', '🚗 ' + bt('세일즈맨', 'Salesman')]].concat(JOBS.filter(j => j[0] !== 'agente').map(j => [j[0], '🧑‍💼 ' + j[1]]));
/** 모든 역할의 기본 서랍을 합친 목록 — 이 역할에 없던 화면도 꺼진 채로 원래 묶음에 (전체를 한눈에) */
function fullModel(role) {
  const own = drawerModel(role), all = {};
  ROLES().forEach(([r]) => drawerModel(r).forEach(g => { all[g.id] = all[g.id] || { id: g.id, ko: g.ko, en: g.en, items: {} }; g.items.forEach(it => { all[g.id].items[it.k] = all[g.id].items[it.k] || it; }); }));
  const order = []; own.forEach(g => order.push(g.id)); Object.keys(all).forEach(id => { if (!order.includes(id)) order.push(id); });
  return order.map(id => { const og = own.find(g => g.id === id), ag = all[id], keys = (og ? og.items.map(i => i.k) : []).concat(Object.keys(ag.items).filter(k => !(og && og.items.some(i => i.k === k))));
    return { id, def: bt(ag.ko, ag.en), name: '', on: !!(og && og.on), items: keys.map(k => { const oi = og && og.items.find(i => i.k === k), it = oi || ag.items[k]; return { k, ic: it.ic, def: bt(it.ko, it.en), name: '', on: !!(oi && oi.on) }; }) }; });
}
/** 저장된 설정 + 기본 목록 → 편집용 (설정에 없는 새 화면은 꺼진 채 원래 묶음 끝에) */
function editModel(S, role) {
  const full = fullModel(role), cfg = S.settings && S.settings.drawerCfg && S.settings.drawerCfg[role];
  if (!Array.isArray(cfg) || !cfg.length) return full;
  const meta = {}; full.forEach(g => g.items.forEach(i => { meta[i.k] = { ic: i.ic, def: i.def, g: g.id }; }));
  const gdef = {}; full.forEach(g => { gdef[g.id] = g.def; });
  const used = new Set(), out = cfg.map(G => ({ id: G.id, def: gdef[G.id] || G.name || G.id, name: G.name && G.name !== gdef[G.id] ? G.name : '', on: G.on !== false,
    items: (G.items || []).filter(it => meta[it.k] || it.k).map(it => { used.add(it.k); const m = meta[it.k] || { ic: '•', def: it.k }; return { k: it.k, ic: m.ic, def: m.def, name: it.name && it.name !== m.def ? it.name : '', on: it.on !== false }; }) }));
  full.forEach(g => g.items.forEach(i => { if (used.has(i.k)) return; let G = out.find(x => x.id === g.id); if (!G) { G = { id: g.id, def: g.def, name: '', on: true, items: [] }; out.push(G); } G.items.push(Object.assign({}, i, { on: false })); }));
  return out;
}
export async function menuAdmin(box, S) {
  if (!ED) ED = editModel(S, ROLE);
  const has = !!(S.settings && S.settings.drawerCfg && Array.isArray(S.settings.drawerCfg[ROLE]) && S.settings.drawerCfg[ROLE].length);
  const gsel = (gi, ii) => '<select data-mg="' + gi + ':' + ii + '" title="' + esc(bt('다른 묶음으로', 'Move to group')) + '">' + ED.map((G, k) => '<option value="' + k + '"' + (k === gi ? ' selected' : '') + '>' + esc(G.name || G.def) + '</option>').join('') + '</select>';
  box.innerHTML = '<div class="card"><h2>🧭 ' + bi('서랍 메뉴', 'Drawer menu') + '</h2><div class="muted">' + bt('역할을 고르고, 묶음 · 화면마다 ☑ 보이기 · 이름 · ↑ ↓ 순서 · 묶음 옮기기를 정한 뒤 💾 저장. 그 역할 사람들의 서랍이 바로 바뀝니다. 그 역할이 권한이 없는 화면은 켜도 보이지 않고, 🔒 오너 전용 화면(경영 · 정산 · 수금 현황 · 미수금 현황)은 오너 · 관리자에게만 보입니다.', 'Pick a role, then set ☑ show · name · ↑ ↓ order · group for each group and screen, and 💾 Save. That role\'s drawer changes right away. Screens the role has no permission for stay hidden, and 🔒 owner-only screens show only to owners and admins.') + '</div>' +
    '<div class="chips" style="margin-top:8px;flex-wrap:wrap">' + ROLES().map(r => '<button type="button" class="' + (r[0] === ROLE ? 'on' : '') + '" data-mr="' + r[0] + '">' + esc(r[1]) + '</button>').join('') + '</div>' +
    '<div class="muted" style="margin-top:6px">' + (has ? '✅ ' + bt('이 역할은 저장된 설정을 씁니다', 'This role uses a saved layout') : '◻️ ' + bt('이 역할은 아직 기본 서랍입니다 (저장하면 고정)', 'This role still uses the default drawer (save to fix it)')) + (DIRTY ? ' · <b class="warn">' + bt('저장 안 한 변경 있음', 'Unsaved changes') + '</b>' : '') + '</div></div>' +
    '<div class="card mcfg">' + ED.map((G, gi) => '<div class="mcg' + (G.on ? '' : ' off') + '"><div class="mcr mch"><label class="mck"><input type="checkbox" data-mgo="' + gi + '"' + (G.on ? ' checked' : '') + '></label><input class="mcn" data-mgn="' + gi + '" value="' + esc(G.name) + '" placeholder="' + esc(G.def) + '"><span class="mcb"><button type="button" class="b-ghost b-sm" data-mgu="' + gi + '"' + (gi ? '' : ' disabled') + '>↑</button><button type="button" class="b-ghost b-sm" data-mgd="' + gi + '"' + (gi < ED.length - 1 ? '' : ' disabled') + '>↓</button></span></div>' +
      G.items.map((it, ii) => '<div class="mcr mci' + (it.on ? '' : ' off') + '"><label class="mck"><input type="checkbox" data-mio="' + gi + ':' + ii + '"' + (it.on ? ' checked' : '') + '></label><span class="mic">' + esc(it.ic || '•') + '</span><input class="mcn" data-min="' + gi + ':' + ii + '" value="' + esc(it.name) + '" placeholder="' + esc(it.def) + '"><span class="mcb"><button type="button" class="b-ghost b-sm" data-miu="' + gi + ':' + ii + '"' + (ii ? '' : ' disabled') + '>↑</button><button type="button" class="b-ghost b-sm" data-mid="' + gi + ':' + ii + '"' + (ii < G.items.length - 1 ? '' : ' disabled') + '>↓</button>' + gsel(gi, ii) + '</span><small class="muted mck2">' + esc(HINT()[it.k] || it.k) + '</small></div>').join('') + '</div>').join('') + '</div>' +
    '<div class="card"><div class="btns"><button type="button" class="b-ghost" id="mcReset">↺ ' + bi('기본값으로', 'Back to default') + '</button><button type="button" class="b-blue" id="mcSave">💾 ' + bi('저장', 'Save') + '</button></div></div>';
  const re = () => menuAdmin(box, S), mark = () => { DIRTY = true; };
  const ix = s => s.split(':').map(Number);
  box.querySelectorAll('[data-mr]').forEach(b => b.onclick = async () => { if (DIRTY && !(await confirmBox(bt('저장하지 않은 변경이 있습니다 — 버리고 다른 역할로 갈까요?', 'Discard unsaved changes?'), bt('버리기', 'Discard')))) return; ROLE = b.dataset.mr; ED = editModel(S, ROLE); DIRTY = false; re(); });
  box.querySelectorAll('[data-mgo]').forEach(c => c.onchange = () => { ED[+c.dataset.mgo].on = c.checked; mark(); re(); });
  box.querySelectorAll('[data-mgn]').forEach(c => c.oninput = () => { ED[+c.dataset.mgn].name = c.value.trim(); mark(); });
  box.querySelectorAll('[data-mgu]').forEach(b => b.onclick = () => { const i = +b.dataset.mgu; [ED[i - 1], ED[i]] = [ED[i], ED[i - 1]]; mark(); re(); });
  box.querySelectorAll('[data-mgd]').forEach(b => b.onclick = () => { const i = +b.dataset.mgd; [ED[i + 1], ED[i]] = [ED[i], ED[i + 1]]; mark(); re(); });
  box.querySelectorAll('[data-mio]').forEach(c => c.onchange = () => { const [g, i] = ix(c.dataset.mio); ED[g].items[i].on = c.checked; mark(); re(); });
  box.querySelectorAll('[data-min]').forEach(c => c.oninput = () => { const [g, i] = ix(c.dataset.min); ED[g].items[i].name = c.value.trim(); mark(); });
  box.querySelectorAll('[data-miu]').forEach(b => b.onclick = () => { const [g, i] = ix(b.dataset.miu), L = ED[g].items; [L[i - 1], L[i]] = [L[i], L[i - 1]]; mark(); re(); });
  box.querySelectorAll('[data-mid]').forEach(b => b.onclick = () => { const [g, i] = ix(b.dataset.mid), L = ED[g].items; [L[i + 1], L[i]] = [L[i], L[i + 1]]; mark(); re(); });
  box.querySelectorAll('[data-mg]').forEach(c => c.onchange = () => { const [g, i] = ix(c.dataset.mg), to = +c.value; if (to === g) return; const [it] = ED[g].items.splice(i, 1); ED[to].items.push(it); mark(); re(); });
  $('mcReset').onclick = async () => {
    if (!(await confirmBox(bt('이 역할의 서랍을 원래(기본) 서랍으로 되돌릴까요?', 'Reset this role\'s drawer to the default?'), bt('되돌리기', 'Reset')))) return;
    busy(true); try { const all = Object.assign({}, (S.settings && S.settings.drawerCfg) || {}); delete all[ROLE]; await S.DB.update('settings', 'app', { drawerCfg: all }); S.settings.drawerCfg = all; ED = editModel(S, ROLE); DIRTY = false; redrawDrawer(); toast(bt('기본 서랍으로 되돌렸습니다', 'Reset to default'), 'good'); re(); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); } busy(false);
  };
  $('mcSave').onclick = async () => {
    const cfg = ED.map(G => ({ id: G.id, name: G.name || '', on: !!G.on, items: G.items.map(it => ({ k: it.k, name: it.name || '', on: !!it.on })) }));   // 이름은 바꾼 것만 저장 (안 바꾼 것은 각자 언어의 기본 이름)
    busy(true); try { const all = Object.assign({}, (S.settings && S.settings.drawerCfg) || {}, { [ROLE]: cfg }); await S.DB.update('settings', 'app', { drawerCfg: all }); S.settings.drawerCfg = all; DIRTY = false; redrawDrawer(); toast('💾 ' + bt('서랍 메뉴를 저장했습니다', 'Drawer menu saved'), 'good'); re(); } catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); } busy(false);
  };
}
