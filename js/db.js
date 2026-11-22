const NAME = 'pulse4';
const VERSION = 1;
let database;
export function openDB() {
  if (database) return Promise.resolve(database);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, VERSION);
    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('samples')) db.createObjectStore('samples', { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
    };
    request.onsuccess = () => { database = request.result; resolve(database); };
    request.onerror = () => reject(request.error);
  });
}
async function store(name, mode = 'readonly') { await openDB(); return database.transaction(name, mode).objectStore(name); }
export async function addSample(sample) {
  const s = await store('samples', 'readwrite');
  return new Promise((resolve, reject) => { const r = s.add({ ts: Date.now(), hr: null, hrv: null, temp: null, batt: null, source: 'sim', ...sample }); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
export async function getSamples(rangeMs = 86400000) {
  const s = await store('samples');
  return new Promise((resolve, reject) => { const r = s.getAll(); r.onsuccess = () => resolve(r.result.filter(x => x.ts >= Date.now() - rangeMs).sort((a,b) => a.ts - b.ts)); r.onerror = () => reject(r.error); });
}
export async function saveSession(session) {
  const s = await store('sessions', 'readwrite');
  return new Promise((resolve, reject) => { const r = s.put({ id: session.id || crypto.randomUUID(), ...session }); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
export async function getSessions() {
  const s = await store('sessions');
  return new Promise((resolve, reject) => { const r = s.getAll(); r.onsuccess = () => resolve(r.result.sort((a,b) => b.startTs - a.startTs)); r.onerror = () => reject(r.error); });
}
export async function clearAll() {
  await openDB();
  return new Promise((resolve, reject) => { const tx = database.transaction(['samples','sessions'], 'readwrite'); tx.objectStore('samples').clear(); tx.objectStore('sessions').clear(); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}
