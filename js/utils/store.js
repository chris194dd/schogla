// Zentraler Datenspeicher: hält Transaktionen + Regeln im Speicher und
// hält sie per Firestore onSnapshot live synchron (auch zwischen euch beiden
// Geräten). Views abonnieren sich einfach mit store.subscribe(fn).
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
  serverTimestamp,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { db } from "../firebase.js";
import { UNCATEGORIZED } from "../config.js";

const listeners = new Set();
let transactions = [];
let rules = [];
let unsubTx = null;
let unsubRules = null;

function notify() {
  for (const fn of listeners) fn();
}

export const store = {
  get transactions() {
    return transactions;
  },
  get rules() {
    return rules;
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  start() {
    if (unsubTx) return;
    const txQuery = query(collection(db, "transactions"), orderBy("date", "desc"));
    unsubTx = onSnapshot(txQuery, (snap) => {
      transactions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      notify();
    });
    const rulesQuery = query(collection(db, "rules"));
    unsubRules = onSnapshot(rulesQuery, (snap) => {
      rules = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      notify();
    });
  },
  stop() {
    if (unsubTx) unsubTx();
    if (unsubRules) unsubRules();
    unsubTx = null;
    unsubRules = null;
    transactions = [];
    rules = [];
  },
};

export function suggestCategory(description) {
  const lower = description.toLowerCase();
  const hit = rules.find((r) => lower.includes(r.keyword.toLowerCase()));
  return hit ? hit.category : UNCATEGORIZED;
}

export async function importTransactions(newTxs) {
  const existingHashes = new Set(transactions.map((t) => t.hash));
  const toImport = newTxs.filter((t) => !existingHashes.has(t.hash));
  const skipped = newTxs.length - toImport.length;

  const CHUNK = 400; // Firestore Batch-Limit ist 500 Schreibvorgänge
  for (let i = 0; i < toImport.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const tx of toImport.slice(i, i + CHUNK)) {
      const ref = doc(collection(db, "transactions"));
      batch.set(ref, { ...tx, createdAt: serverTimestamp() });
    }
    await batch.commit();
  }
  return { imported: toImport.length, skipped };
}

export async function updateTransactionCategory(id, category) {
  await updateDoc(doc(db, "transactions", id), { category });
}

export async function deleteTransaction(id) {
  await deleteDoc(doc(db, "transactions", id));
}

export async function addRule(keyword, category) {
  const lower = keyword.trim().toLowerCase();
  if (!lower) return;
  const exists = rules.some((r) => r.keyword.toLowerCase() === lower);
  if (exists) return;
  await addDoc(collection(db, "rules"), {
    keyword: lower,
    category,
    createdAt: serverTimestamp(),
  });
}

export async function deleteRule(id) {
  await deleteDoc(doc(db, "rules", id));
}
