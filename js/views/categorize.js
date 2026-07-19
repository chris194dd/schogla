import { store, updateTransactionCategory, addRule } from "../utils/store.js";
import { CATEGORIES, UNCATEGORIZED } from "../config.js";
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

export function renderCategorize(root) {
  const items = store.transactions
    .filter((t) => t.category === UNCATEGORIZED)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const catOptions = CATEGORIES.filter((c) => c !== UNCATEGORIZED)
    .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
    .join("");

  root.innerHTML = `
    <div class="card">
      <h2>Nicht klassifizierte Buchungen (${items.length})</h2>
      ${
        items.length === 0
          ? '<div class="empty-state">Alles kategorisiert. 🎉</div>'
          : `<div style="max-height:600px; overflow:auto;">
          <table>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Beschreibung</th>
                <th class="amount">Betrag</th>
                <th>Kategorie</th>
                <th>Regel merken</th>
              </tr>
            </thead>
            <tbody id="cat-tbody">
              ${items
                .map(
                  (t) => `
                <tr data-id="${t.id}">
                  <td>${t.date}</td>
                  <td>${escapeHtml(t.description)}</td>
                  <td class="amount ${t.amount < 0 ? "negative" : "positive"}">${fmtEuro(t.amount)}</td>
                  <td>
                    <select class="cat-select" data-id="${t.id}">
                      <option value="">Kategorie wählen...</option>
                      ${catOptions}
                    </select>
                  </td>
                  <td>
                    <label style="display:flex; align-items:center; gap:6px; font-size:0.85em;">
                      <input type="checkbox" class="remember-cb" data-id="${t.id}" />
                      Regel merken
                    </label>
                  </td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>`
      }
    </div>
  `;

  root.querySelectorAll(".cat-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const id = sel.dataset.id;
      const category = sel.value;
      if (!category) return;
      sel.disabled = true;
      try {
        await updateTransactionCategory(id, category);
        const tx = store.transactions.find((t) => t.id === id);
        const rememberCb = root.querySelector(`.remember-cb[data-id="${id}"]`);
        if (rememberCb && rememberCb.checked && tx) {
          // Erstes Wort-Segment als Regel-Stichwort verwenden.
          const keyword = tx.description.split(" — ")[0];
          await addRule(keyword, category);
        }
        showToast("Kategorie gespeichert");
      } catch (err) {
        showToast("Fehler: " + err.message);
        sel.disabled = false;
      }
      // Zeile verschwindet automatisch beim nächsten Live-Update aus der Liste.
    });
  });
}
