/* ============================================================
 *  데이터 계층 — Firestore (실제) / 메모리 (테스트·데모)
 *  앱의 나머지는 이 파일의 DB 객체만 씁니다.
 *    DB.get(col, id) · DB.list(col, {where:[[f,op,v]], order:[f,dir], limit}) · DB.set(col, id, data)
 *    DB.update(col, id, patch) · DB.del(col, id) · DB.batch([{op,col,id,data}]) · DB.newId(prefix)
 *  AUTH.signIn() · AUTH.signOut() · AUTH.onChange(fn) → {email, name}
 * ============================================================ */
export const firebaseConfig = {
  apiKey: "AIzaSyAEvQhEi6H0pPiIRpKRNRXt5m348aU8i24",
  authDomain: "the-one-app-ff40e.firebaseapp.com",
  projectId: "the-one-app-ff40e",
  storageBucket: "the-one-app-ff40e.firebasestorage.app",
  messagingSenderId: "235028136448",
  appId: "1:235028136448:web:183b6f84a3aa79dc71cee5"
};
export const MOCK = typeof window !== 'undefined' && !!window.__MOCK__;

let SEQ = 0;
export function newId(prefix) {
  SEQ++;
  return (prefix || 'X') + Date.now().toString(36).toUpperCase() + (SEQ < 36 ? '0' : '') + SEQ.toString(36).toUpperCase() +
         Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0');
}
export function nowIso() { return new Date().toISOString(); }

/* ---------- 메모리 구현 ---------- */
function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function matchWhere(doc, w) {
  const [f, op, v] = w, x = doc[f];
  switch (op) {
    case '==': return x === v;
    case '!=': return x !== v;
    case '<': return x < v; case '<=': return x <= v; case '>': return x > v; case '>=': return x >= v;
    case 'in': return (v || []).includes(x);
    case 'array-contains': return Array.isArray(x) && x.includes(v);
    default: return false;
  }
}
function makeMemoryDB(seed) {
  const store = {};
  Object.keys(seed || {}).forEach(col => { store[col] = {}; (seed[col] || []).forEach(d => { store[col][d.id] = JSON.parse(JSON.stringify(d)); }); });
  const col = c => (store[c] = store[c] || {});
  if (typeof window !== 'undefined') window.__MOCK_STORE__ = store;   // 시험용 — 메모리 DB 들여다보기
  const clone = d => d == null ? null : JSON.parse(JSON.stringify(d));
  return {
    kind: 'memory',
    async get(c, id) { return clone(col(c)[id] || null); },
    async list(c, q) {
      q = q || {};
      let rows = Object.values(col(c));
      (q.where || []).forEach(w => { rows = rows.filter(d => matchWhere(d, w)); });
      if (q.order) { const [f, dir] = q.order; rows.sort((a, b) => (dir === 'desc' ? -1 : 1) * cmp(a[f], b[f])); }
      if (q.limit) rows = rows.slice(0, q.limit);
      return rows.map(clone);
    },
    async set(c, id, data) { col(c)[id] = clone(Object.assign({}, data, { id })); return id; },
    async update(c, id, patch) { if (!col(c)[id]) throw new Error('not found: ' + c + '/' + id); Object.assign(col(c)[id], clone(patch)); },
    async del(c, id) { delete col(c)[id]; },
    async seq(id, key, start) { const d = col('counters')[id] = col('counters')[id] || { id }; const cur = d[key] != null ? Number(d[key]) : Number(start || 1); d[key] = cur + 1; return cur; },
    async batch(ops) { for (const o of ops) { if (o.op === 'set') await this.set(o.col, o.id, o.data); else if (o.op === 'update') await this.update(o.col, o.id, o.data); else if (o.op === 'del') await this.del(o.col, o.id); } },
    _dump() { return clone(store); }
  };
}
function makeMemoryAuth(user) {
  let cur = user || null, fns = [];
  return {
    async signIn() { cur = window.__MOCK_USER__ || { email: 'luke@theonefl.com', name: 'Luke Hur' }; fns.forEach(f => f(cur)); },
    async signOut() { cur = null; fns.forEach(f => f(null)); },
    onChange(f) { fns.push(f); setTimeout(() => f(cur), 0); },
    current() { return cur; }
  };
}

/* ---------- Firestore 구현 ---------- */
async function makeFirestoreDB() {
  const [{ initializeApp }, fs, au] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js'),
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js')
  ]);
  const app = initializeApp(firebaseConfig);
  /* 폰에 사본을 두어 인터넷이 끊겨도 읽기 · 쓰기가 됨 (다시 연결되면 자동 전송) */
  let db;
  try { db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) }); }
  catch (e) { db = fs.getFirestore(app); }
  const auth = au.getAuth(app);
  const strip = d => { const o = {}; Object.keys(d).forEach(k => { if (d[k] !== undefined) o[k] = d[k]; }); return o; };
  const DB = {
    kind: 'firestore',
    async get(c, id) { const s = await fs.getDoc(fs.doc(db, c, id)); return s.exists() ? Object.assign({ id: s.id }, s.data()) : null; },
    async list(c, q) {
      q = q || {};
      const parts = [fs.collection(db, c)];
      (q.where || []).forEach(w => parts.push(fs.where(w[0], w[1], w[2])));
      if (q.order) parts.push(fs.orderBy(q.order[0], q.order[1] || 'asc'));
      if (q.limit) parts.push(fs.limit(q.limit));
      const snap = await fs.getDocs(fs.query.apply(null, parts));
      return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    },
    async set(c, id, data) { await fs.setDoc(fs.doc(db, c, id), strip(Object.assign({}, data, { id }))); return id; },
    async update(c, id, patch) { await fs.updateDoc(fs.doc(db, c, id), strip(patch)); },
    async del(c, id) { await fs.deleteDoc(fs.doc(db, c, id)); },
    /** 번호 매기기 — counters/{id}.{key} 를 1 올리고 이전 값을 돌려줌 (동시에 눌러도 겹치지 않음) */
    async seq(id, key, start) {
      const ref = fs.doc(db, 'counters', id);
      return fs.runTransaction(db, async tx => {
        const s = await tx.get(ref); const cur = s.exists() && s.data()[key] != null ? Number(s.data()[key]) : Number(start || 1);
        tx.set(ref, { [key]: cur + 1 }, { merge: true }); return cur;
      });
    },
    async batch(ops) {
      for (let i = 0; i < ops.length; i += 400) {
        const b = fs.writeBatch(db);
        ops.slice(i, i + 400).forEach(o => {
          const ref = fs.doc(db, o.col, o.id);
          if (o.op === 'set') b.set(ref, strip(Object.assign({}, o.data, { id: o.id })));
          else if (o.op === 'update') b.update(ref, strip(o.data));
          else if (o.op === 'del') b.delete(ref);
        });
        await b.commit();
      }
    }
  };
  const AUTH = {
    async signIn() {
      const p = new au.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
      try { await au.signInWithPopup(auth, p); }
      catch (e) { if (/popup/i.test(String(e.code))) await au.signInWithRedirect(auth, p); else throw e; }
    },
    async signOut() { await au.signOut(auth); },
    onChange(f) { au.getRedirectResult(auth).catch(() => {}); au.onAuthStateChanged(auth, u => f(u ? { email: (u.email || '').toLowerCase(), name: u.displayName || '' } : null)); },
    current() { const u = auth.currentUser; return u ? { email: (u.email || '').toLowerCase(), name: u.displayName || '' } : null; }
  };
  return { DB, AUTH };
}

export async function connect() {
  if (MOCK) return { DB: speed(makeMemoryDB(window.__MOCK_SEED__ || {})), AUTH: makeMemoryAuth(window.__MOCK_USER__ || null) };
  const r = await makeFirestoreDB(); r.DB = speed(r.DB); return r;
}

/* ============================================================
 *  ⚡ 빠르게 — ① 같은 읽기는 잠깐(15초) 기억해서 탭을 오갈 때 다시 안 읽음 (그 컬렉션에 쓰면 바로 지움)
 *             ② 읽는 중이면 화면 위에 진행 막대 (window 'dbbusy' 이벤트)
 * ============================================================ */
const TTL = 15000, NOCACHE = { shipq: 1, counters: 1 };
let INFLIGHT = 0;
const busyEv = d => { INFLIGHT = Math.max(0, INFLIGHT + d); try { window.dispatchEvent(new CustomEvent('dbbusy', { detail: INFLIGHT })); } catch (e) {} };
function speed(DB) {
  const M = new Map(), P = new Map();   // M: 결과 {at, v} · P: 같은 읽기가 이미 진행 중이면 그 약속을 같이 씀
  const key = (k, c, q) => k + '|' + c + '|' + JSON.stringify(q || {});
  const drop = c => { for (const x of Array.from(M.keys())) if (x.split('|')[1] === c) M.delete(x); };
  const read = (k, c, q, fn) => {
    if (NOCACHE[c]) { busyEv(1); return fn().finally(() => busyEv(-1)); }   // 기다리며 계속 확인하는 것(UPS 요청)은 늘 새로
    const id = key(k, c, q), hit = M.get(id);
    if (hit && Date.now() - hit.at < TTL) return Promise.resolve(clone2(hit.v));
    if (P.has(id)) return P.get(id).then(clone2);
    busyEv(1);
    const pr = fn().then(v => { M.set(id, { at: Date.now(), v }); return v; }).finally(() => { P.delete(id); busyEv(-1); });
    P.set(id, pr); return pr.then(clone2);
  };
  const write = (c, fn) => { drop(c); busyEv(1); return fn().finally(() => { drop(c); busyEv(-1); }); };
  const W = Object.create(DB);
  W.get = (c, id) => read('g', c, id, () => DB.get(c, id));
  W.list = (c, q) => read('l', c, q, () => DB.list(c, q));
  W.set = (c, id, d) => write(c, () => DB.set(c, id, d));
  W.update = (c, id, d) => write(c, () => DB.update(c, id, d));
  W.del = (c, id) => write(c, () => DB.del(c, id));
  W.batch = ops => { const cs = Array.from(new Set(ops.map(o => o.col))); cs.forEach(drop); busyEv(1); return DB.batch(ops).finally(() => { cs.forEach(drop); busyEv(-1); }); };
  W.seq = (id, k, st) => { drop('counters'); return DB.seq(id, k, st); };
  /** 기억한 것을 버리고 새로 읽게 (새로고침 버튼 등) */
  W.fresh = c => { if (c) drop(c); else M.clear(); };
  return W;
}
/* 돌려준 결과를 화면이 고쳐도 기억한 원본은 그대로 */
function clone2(v) { return v == null || typeof v !== 'object' ? v : JSON.parse(JSON.stringify(v)); }
