import type { Customer, Product } from "@/types";

const DB_NAME = "crm-offline";
const DB_VERSION = 1;
const STORE_PRODUCTS = "branchProducts";
const STORE_CUSTOMERS = "customers";
const STORE_QUEUE = "saleQueue";

export interface PendingSale {
  id: number;
  payload: Record<string, unknown>;
  queuedAt: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
        db.createObjectStore(STORE_PRODUCTS, { keyPath: "branchId" });
      }
      if (!db.objectStoreNames.contains(STORE_CUSTOMERS)) {
        db.createObjectStore(STORE_CUSTOMERS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const store = db.createObjectStore(STORE_QUEUE, { keyPath: "id", autoIncrement: true });
        store.createIndex("queuedAt", "queuedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ======================= PRODUCTS (per branch) =======================

export async function cacheProducts(branchId: string, products: Product[]): Promise<void> {
  if (!branchId || !products.length) return;
  const db = await openDB();
  const tx = db.transaction(STORE_PRODUCTS, "readwrite");
  tx.objectStore(STORE_PRODUCTS).put({ branchId, products, savedAt: new Date().toISOString() });
  await txDone(tx);
  db.close();
}

export async function getCachedProducts(branchId: string): Promise<Product[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_PRODUCTS, "readonly").objectStore(STORE_PRODUCTS).get(branchId);
    req.onsuccess = () => {
      db.close();
      resolve(req.result?.products ?? []);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

// ======================= CUSTOMERS =======================

export async function cacheCustomers(list: Customer[]): Promise<void> {
  if (!list.length) return;
  const db = await openDB();
  const tx = db.transaction(STORE_CUSTOMERS, "readwrite");
  const store = tx.objectStore(STORE_CUSTOMERS);
  for (const c of list) store.put(c);
  await txDone(tx);
  db.close();
}

export async function getCachedCustomers(query: string): Promise<Customer[]> {
  const q = query.trim().toLowerCase();
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_CUSTOMERS, "readonly").objectStore(STORE_CUSTOMERS).getAll();
    req.onsuccess = () => {
      db.close();
      const all: Customer[] = req.result ?? [];
      if (!q) return resolve(all.slice(0, 20));
      resolve(
        all
          .filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q))
          .slice(0, 20)
      );
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

// ======================= PENDING SALE QUEUE =======================

export async function enqueueSale(payload: Record<string, unknown>): Promise<PendingSale> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, "readwrite");
    const req = tx.objectStore(STORE_QUEUE).add({ payload, queuedAt: new Date().toISOString() });
    req.onsuccess = () => {
      const row: PendingSale = { id: req.result as number, payload, queuedAt: new Date().toISOString() };
      resolve(row);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingSales(): Promise<PendingSale[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_QUEUE, "readonly").objectStore(STORE_QUEUE).getAll();
    req.onsuccess = () => {
      db.close();
      resolve((req.result ?? []).sort((a, b) => (a.queuedAt < b.queuedAt ? -1 : 1)));
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function removePendingSales(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const db = await openDB();
  const tx = db.transaction(STORE_QUEUE, "readwrite");
  const store = tx.objectStore(STORE_QUEUE);
  for (const id of ids) store.delete(id);
  await txDone(tx);
  db.close();
}

export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}
