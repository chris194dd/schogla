import {
  analyzeCsv,
  parseGermanDate,
  parseGermanAmount,
  buildDescription,
  hashTransaction,
} from "../utils/csv.js";
import { store, suggestCategory, importTransactions, addRule } from "../utils/store.js";
import { CATEGORIES } from "../config.js";
import { showToast } from "../app.js";

function fmtEuro(n) {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export function renderImport(root) {
  root.innerHTML = `
    <div class="card">
      <h2>CSV importieren</h2>
      <p class="muted">Exportiere die Umsatzliste eures Bankkontos als CSV (z.B. bei der DKB: Umsätze -&gt; Exportieren) und lade sie hier hoch.</p>
      <div id="dropzone" class="dropzone">
        <input type="file" id="file-input" accept=".csv,text/csv" class="hidden" />
        <p>Datei hierher ziehen oder klicken zum Auswählen</p>
      </div>
      <details style="margin-top:12px">
        <summary class="muted" style="cursor:pointer">Oder CSV-Inhalt einfügen</summary>
        <textarea id="paste-area" rows="6" style="width:100%; margin-top:8px; font-family:monospace; font-size:0.85em;" placeholder="CSV-Inhalt hier einfügen..."></textarea>
        <button class="btn" id="paste-btn" style="margin-top:8px">Einfügen übernehmen</button>
      </details>
    </div>
    <div id="mapping-root"></div>
  `;

  const dropzone = root.querySelector("#dropzone");
  const fileInput = root.querySelector("#file-input");

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file) readFile(file, root);
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) readFile(fileInput.files[0], root);
  });

  root.querySelector("#paste-btn").addEventListener("click", () => {
    const text = root.querySelector("#paste-area").value;
    if (text.trim()) handleText(text, root);
  });
}

function readFile(file, root) {
  const reader = new FileReader();
  reader.onload = () => handleText(reader.result, root);
  reader.readAsText(file, "UTF-8");
}

function handleText(text, root) {
  const analyzed = analyzeCsv(text);
  const mappingRoot = root.querySelector("#mapping-root");
  if (analyzed.error) {
    mappingRoot.innerHTML = `<div class="card"><p class="error-text">${analyzed.error}</p></div>`;
    return;
  }
  renderMapping(mappingRoot, analyzed);
}

function renderMapping(root, analyzed) {
  const { headers, guess } = analyzed;
  const colOptions = headers
    .map((h, i) => `<option value="${i}">${escapeHtml(h)}</option>`)
    .join("");

  root.innerHTML = `
    <div class="card">
      <h2>Spalten zuordnen</h2>
      <p class="muted">${analyzed.rows.length} Buchungszeile(n) erkannt (Kopfzeile: Zeile ${analyzed.headerRowIndex + 1}, Trennzeichen "${analyzed.delimiter}").</p>
      <div class="grid-3">
        <label>Datum-Spalte
          <select id="map-date">${colOptions}</select>
        </label>
        <label>Betrag-Spalte
          <select id="map-amount">${colOptions}</select>
        </label>
        <label>Beschreibung-Spalte(n)
          <select id="map-desc" multiple size="4">${colOptions}</select>
        </label>
      </div>
      <button class="btn btn-primary" id="build-preview-btn" style="margin-top:16px">Vorschau erzeugen</button>
    </div>
    <div id="preview-root"></div>
  `;

  const dateSel = root.querySelector("#map-date");
  const amountSel = root.querySelector("#map-amount");
  const descSel = root.querySelector("#map-desc");

  if (guess.dateCol !== -1) dateSel.value = String(guess.dateCol);
  if (guess.amountCol !== -1) amountSel.value = String(guess.amountCol);
  Array.from(descSel.options).forEach((opt) => {
    if (guess.descriptionCols.includes(Number(opt.value))) opt.selected = true;
  });

  root.querySelector("#build-preview-btn").addEventListener("click", () => {
    const dateCol = Number(dateSel.value);
    const amountCol = Number(amountSel.value);
    const descCols = Array.from(descSel.selectedOptions).map((o) => Number(o.value));
    buildPreview(root, analyzed, { dateCol, amountCol, descCols });
  });
}

async function buildPreview(root, analyzed, mapping) {
  const previewRoot = root.querySelector("#preview-root");
  previewRoot.innerHTML = `<div class="card"><p class="muted">Verarbeite...</p></div>`;

  const rows = [];
  for (const raw of analyzed.rows) {
    if (raw.length <= Math.max(mapping.dateCol, mapping.amountCol)) continue;
    const dateRaw = raw[mapping.dateCol];
    const amountRaw = raw[mapping.amountCol];
    const date = parseGermanDate(dateRaw);
    const amount = parseGermanAmount(amountRaw);
    if (!date || Number.isNaN(amount)) continue;
    const description = buildDescription(raw, mapping.descCols, analyzed.headers) || "(ohne Beschreibung)";
    const hash = await hashTransaction(date, amount, raw);
    const category = suggestCategory(description);
    rows.push({ date, amount, description, category, hash, rememberKeyword: mapping.descCols.length ? raw[mapping.descCols[0]] : "" });
  }

  rows.sort((a, b) => (a.date < b.date ? 1 : -1));

  const existingHashes = new Set(store.transactions.map((t) => t.hash));
  const duplicateCount = rows.filter((r) => existingHashes.has(r.hash)).length;

  renderPreview(previewRoot, rows, duplicateCount);
}

function renderPreview(root, rows, duplicateCount) {
  const catOptions = CATEGORIES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");

  root.innerHTML = `
    <div class="card">
      <h2>Vorschau (${rows.length} Buchungen)</h2>
      ${duplicateCount > 0 ? `<p class="muted">${duplicateCount} Buchung(en) scheinen bereits importiert zu sein und werden beim Import übersprungen.</p>` : ""}
      <div style="max-height:480px; overflow:auto; margin-top:8px;">
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
        <tbody id="preview-tbody">
          ${rows
            .map(
              (r, i) => `
            <tr data-idx="${i}">
              <td>${r.date}</td>
              <td>${escapeHtml(r.description)}</td>
              <td class="amount ${r.amount < 0 ? "negative" : "positive"}">${fmtEuro(r.amount)}</td>
              <td>
                <select class="cat-select" data-idx="${i}">${catOptions}</select>
              </td>
              <td>
                <label style="display:flex; align-items:center; gap:6px; font-size:0.85em;">
                  <input type="checkbox" class="remember-cb" data-idx="${i}" />
                  <input type="text" class="remember-kw" data-idx="${i}" value="${escapeHtml(r.rememberKeyword)}" disabled style="width:140px" />
                </label>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
      </div>
      <div class="toolbar" style="margin-top:16px">
        <button class="btn btn-primary" id="import-btn">Importieren</button>
        <span id="import-status" class="muted"></span>
      </div>
    </div>
  `;

  // Kategorie-Dropdowns mit vorgeschlagener Kategorie vorbelegen.
  root.querySelectorAll(".cat-select").forEach((sel) => {
    const idx = Number(sel.dataset.idx);
    sel.value = rows[idx].category;
    sel.addEventListener("change", () => (rows[idx].category = sel.value));
  });

  root.querySelectorAll(".remember-cb").forEach((cb) => {
    cb.addEventListener("change", () => {
      const idx = Number(cb.dataset.idx);
      const kwInput = root.querySelector(`.remember-kw[data-idx="${idx}"]`);
      kwInput.disabled = !cb.checked;
    });
  });
  root.querySelectorAll(".remember-kw").forEach((input) => {
    input.addEventListener("input", () => {
      const idx = Number(input.dataset.idx);
      rows[idx].rememberKeyword = input.value;
    });
  });

  root.querySelector("#import-btn").addEventListener("click", async () => {
    const btn = root.querySelector("#import-btn");
    const status = root.querySelector("#import-status");
    btn.disabled = true;
    status.textContent = "Importiere...";
    try {
      const txsToImport = rows.map(({ rememberKeyword, ...tx }) => tx);
      const result = await importTransactions(txsToImport);

      const rememberChecks = Array.from(root.querySelectorAll(".remember-cb")).filter((cb) => cb.checked);
      for (const cb of rememberChecks) {
        const idx = Number(cb.dataset.idx);
        const kw = rows[idx].rememberKeyword;
        if (kw && kw.trim()) await addRule(kw, rows[idx].category);
      }

      status.textContent = `${result.imported} importiert, ${result.skipped} übersprungen (Duplikate).`;
      showToast(`${result.imported} Buchungen importiert`);
    } catch (err) {
      status.textContent = "Fehler beim Import: " + err.message;
    } finally {
      btn.disabled = false;
    }
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
