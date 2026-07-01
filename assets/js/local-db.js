/* global window */
(function () {
  const DB_NAME = "DriveERP_LocalCache";
  const DB_VERSION = 1;
  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (event) {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv", { keyPath: "key" });
        if (!db.objectStoreNames.contains("events")) db.createObjectStore("events", { keyPath: "eventId" });
        if (!db.objectStoreNames.contains("pendingOps")) db.createObjectStore("pendingOps", { keyPath: "operationId" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function put(store, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function get(store, key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAll(store) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function remove(store, key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  window.LocalDB = {
    openDb,
    setKV: (key, value) => put("kv", { key, value, updatedAt: new Date().toISOString() }),
    getKV: async (key) => {
      const row = await get("kv", key);
      return row ? row.value : null;
    },
    putEvent: (event) => put("events", event),
    getEvents: () => getAll("events"),
    putPendingOp: (op) => put("pendingOps", op),
    getPendingOps: () => getAll("pendingOps"),
    removePendingOp: (id) => remove("pendingOps", id)
  };
})();
