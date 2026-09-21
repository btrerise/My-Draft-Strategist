// db.js
const DB_NAME = 'LineupStrategistDB';
const DB_VERSION = 1;
const STORE_NAME = 'sleeperData';

// The open connection, shared by every read and write below. Previously each getCachedData /
// cacheData call opened its OWN connection to the same database and then dropped it on the
// floor -- so building a player's score history, which fetches up to 18 weeks and reads then
// writes a cache entry per week, opened around 36 connections for what is one database.
//
// Cached as the promise rather than the resolved database so that concurrent callers (the week
// fetches run under Promise.all, so they all start at once) share one in-flight open instead of
// racing to create several.
let _dbPromise = null;

export const initDB = () => {
    if (_dbPromise) return _dbPromise;

    _dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };

        request.onsuccess = () => {
            const db = request.result;
            // If the connection is ever closed out from under us -- another tab requesting a
            // version upgrade triggers this -- drop the cached promise so the next call opens
            // a fresh one instead of handing back a dead handle that throws on .transaction().
            db.onclose = () => { _dbPromise = null; };
            db.onversionchange = () => { db.close(); _dbPromise = null; };
            resolve(db);
        };
        request.onerror = () => {
            // Don't cache a rejection: a failed open (private browsing, storage pressure)
            // should be retried on the next call, not replayed forever.
            _dbPromise = null;
            reject(request.error);
        };
    });

    return _dbPromise;
};

export const getCachedData = async (key) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const cacheData = async (key, data) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(data, key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};