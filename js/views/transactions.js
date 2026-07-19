import { store, updateTransactionCategory, deleteTransaction } from "../utils/store.js";
import { CATEGORIES } from "../config.js";
import { showToast } from "../app.js";

function fmtEuro(n) {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let filters = { month: "", category: "", search: "" };

export function renderTransactions(root) {
  const months = Array.from(new Set(store.transactions.map((t) => t.date.slice(0, 7)))).sort().reverse();

  root.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <label>Monat
          <select id="f-month">
            <option value="">Alle</option>
            ${months.map((m) => `<option value="${m}" ${filters.month === m ? "selected" : ""}>${m}</option>`).join("")}
          </select>
        </label>
        <label>Kategorie
          <select id="f-category">
            <option value="">Alle</option>
            ${CATEGORIES.map((c) => `<option value="${escapeHtml(c)}" ${filters.category === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
          </select>
        </label>
        <label>Suche
          <input type="search" id="f-search" placeholder="Beschreibung..." value="${escapeHtml(filters.search)}" />
        </label>
      </div>
      <div id="tx-table-wrap"></div>
    </div>
  `;

  root.querySelector("#f-month").addEventListener("change", (e) => {
    filters.month = e.target.value;
    renderTable(root);
  });
  root.querySelector("#f-category").addEventListener("change", (e) => {
    filters.category = e.target.value;
    renderTable(root);
  });
  root.querySelector("#f-search").addEventListener("input", (e) => {
    filters.search = e.target.value;
    renderTable(root);
  });

  renderTable(root);
}

function renderTable(root) {
  const wrap = root.querySelector("#tx-table-wrap");
  let items = [...store.transactions];
  if (filters.month) items = items.filter((t) => t.date.startsWith(filters.month));
  if (filters.category) items = items.filter((t) => t.category === filters.category);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    items = items.filter((t) => t.description.toLowerCase().includes(q));
  }
  items.sort((a, b) => (a.date < b.date ? 1 : -1));

  const total = items.reduce((s, t) => s + t.amount, 0);

  const catOptions = CATEGORIES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");

  wrap.innerHTML = `
    <p class="muted">${items.length} Buchung(en) — Summe: ${fmtEuro(total)}</p>
    <div style="max-height:600px; overflow:auto;">
    <table>
      <thead>
        <tr>
          <th>Datum</th>
          <th>Beschreibung</th>
          <th class="amount">Betrag</th>
          <th>Kategorie</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (t) => `
          <tr data-id="${t.id}">
            <td>${t.date}</td>
            <td>${escapeHtml(t.description)}</td>
            <td class="amount ${t.amount < 0 ? "negative" : "positive"}">${fmtEuro(t.amount)}</td>
            <td>
              <select class="cat-select" data-id="${t.id}">
                ${catOptions}
              </select>
            </td>
            <td><button class="btn btn-danger delete-btn" data-id="${t.id}">Löschen</button></td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
    </div>
    ${items.length === 0 ? '<div class="empty-state">Keine Buchungen gefunden.</div>' : ""}
  `;

  wrap.querySelectorAll(".cat-select").forEach((sel) => {
    const id = sel.dataset.id;
    const tx = items.find((t) => t.id === id);
    sel.value = tx.category;
    sel.addEventListener("change", async () => {
      sel.disabled = true;
      try {
        await updateTransactionCategory(id, sel.value);
        showToast("Kategorie aktualisiert");
      } catch (err) {
        showToast("Fehler: " + err.message);
      } finally {
        sel.disabled = false;
      }
    });
  });

  wrap.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Diese Buchung wirklich löschen?")) return;
      btn.disabled = true;
      try {
        await deleteTransaction(btn.dataset.id);
        showToast("Buchung gelöscht");
      } catch (err) {
        showToast("Fehler: " + err.message);
        btn.disabled = false;
      }
    });
  });
}
