export const db = {};
export const auth = {};
export function doc(_db, col, id) { return { __col: col, __id: id }; }
export function collection(_db, name) { return { __col: name }; }
export function query(base) { return base || {}; }
export function where() { return {}; }
export function orderBy() { return {}; }
export function limit() { return {}; }
export function onSnapshot(q, cb) {
  const raw = (globalThis.__DATA__ && globalThis.__DATA__[q && q.__col]) || [];
  const snap = { docs: raw.map((d) => ({ id: d.id, data: () => d })), size: raw.length, forEach(f) { this.docs.forEach(f); } };
  if (typeof cb === 'function') cb(snap); else if (cb && typeof cb.next === 'function') cb.next(snap);
  return () => {};
}
export async function getDoc(ref) {
  const raw = (globalThis.__DATA__ && globalThis.__DATA__[ref.__col]) || [];
  const d = raw.find((x) => x.id === ref.__id);
  return { exists: () => !!d, data: () => d, id: ref.__id };
}
export async function getDocs(q) {
  const raw = (globalThis.__DATA__ && globalThis.__DATA__[q && q.__col]) || [];
  return { docs: raw.map((d) => ({ id: d.id, data: () => d })), size: raw.length, forEach(f) { this.docs.forEach(f); } };
}
export async function addDoc() { return { id: 'nuevo' }; }
export async function updateDoc() {}
export async function deleteDoc() {}
export async function setDoc() {}
export async function runTransaction(_db, fn) { return fn({ get: getDoc, set() {}, update() {} }); }
export function writeBatch() { return { set() {}, update() {}, delete() {}, commit: async () => {} }; }
export function serverTimestamp() { return null; }
export function arrayUnion(...v) { return v; }
export function arrayRemove(...v) { return v; }
export const Timestamp = { fromDate: (d) => ({ toDate: () => d }), now: () => ({ toDate: () => new Date() }) };
export function increment(n) { return n; }
export function initializeApp() { return {}; }
export function getFirestore() { return {}; }
export function getAuth() { return {}; }
export class GoogleAuthProvider { static credential() { return {}; } }
export function signInWithPopup() { return Promise.resolve({}); }
export function onAuthStateChanged() { return () => {}; }
export function signOut() { return Promise.resolve(); }
export function getFunctions() { return {}; }
export function httpsCallable() { return () => Promise.resolve({ data: {} }); }
export default {};
