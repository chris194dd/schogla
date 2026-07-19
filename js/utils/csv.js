// Kleiner, robuster CSV-Parser für Bank-Exporte (z.B. DKB).
// Kein externes Package nötig -> funktioniert direkt über Firebase Hosting
// ohne Build-Schritt.

// Parst eine einzelne CSV-Zeile unter Berücksichtigung von Anführungszeichen.
function parseLine(line, delimiter) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        cells.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function detectDelimiter(line) {
  const semi = (line.match(/;/g) || []).length;
  const comma = (line.match(/,/g) || []).length;
  return semi >= comma ? ";" : ",";
}

// Sucht die Kopfzeile: die erste Zeile, die sowohl eine "Datum"-artige als
// auch eine "Betrag"-artige Spalte enthält. Bank-Exporte (z.B. DKB) haben
// davor oft ein paar Metadaten-Zeilen (Kontonummer, Kontostand, ...).
function detectHeaderRow(lines, delimiter) {
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const cells = parseLine(lines[i], delimiter).map((c) => c.toLowerCase());
    const hasDate = cells.some((c) => c.includes("datum"));
    const hasAmount = cells.some((c) => c.includes("betrag"));
    if (hasDate && hasAmount) return i;
  }
  return 0;
}

function guessColumn(headers, patterns) {
  const lower = headers.map((h) => h.toLowerCase());
  for (const p of patterns) {
    const idx = lower.findIndex((h) => h.includes(p));
    if (idx !== -1) return idx;
  }
  return -1;
}

export function analyzeCsv(rawText) {
  // Führende BOM entfernen, Zeilenumbrüche normalisieren, leere Zeilen raus.
  const text = rawText.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { error: "Die Datei enthält keine Zeilen." };
  }

  const delimiter = detectDelimiter(lines[Math.min(4, lines.length - 1)]);
  const headerRowIndex = detectHeaderRow(lines, delimiter);
  const headers = parseLine(lines[headerRowIndex], delimiter);
  const dataLines = lines.slice(headerRowIndex + 1);
  const rows = dataLines.map((l) => parseLine(l, delimiter));

  const dateCol = guessColumn(headers, ["buchungsdatum", "datum"]);
  const amountCol = guessColumn(headers, ["betrag"]);
  const payeeCol = guessColumn(headers, [
    "zahlungsempfänger",
    "zahlungsempfaenger",
    "empfänger",
    "name",
  ]);
  const purposeCol = guessColumn(headers, ["verwendungszweck", "buchungstext"]);

  return {
    delimiter,
    headerRowIndex,
    headers,
    rows,
    guess: {
      dateCol,
      amountCol,
      descriptionCols: [payeeCol, purposeCol].filter((c) => c !== -1),
    },
  };
}

// "20.07.26" / "20.07.2026" / "2026-07-20" -> "YYYY-MM-DD"
export function parseGermanDate(str) {
  if (!str) return null;
  const s = str.trim();

  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
  if (m) {
    const [, d, mo, y] = m;
    const year = 2000 + parseInt(y, 10);
    return `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

// "-1.234,56" -> -1234.56  |  "45.8" -> 45.8  |  "-45,8" -> -45.8
export function parseGermanAmount(str) {
  if (str === null || str === undefined) return NaN;
  let s = String(str).trim().replace(/[€\s]/g, "");
  if (s === "") return NaN;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  return parseFloat(s);
}

export function buildDescription(row, cols, headers) {
  return cols
    .map((c) => row[c])
    .filter((v) => v && v.trim().length > 0)
    .join(" — ");
}

// Einfache, stabile Kennung pro Buchung zur Duplikat-Erkennung beim Import.
export async function hashTransaction(date, amount, rawRow) {
  const input = `${date}|${amount}|${rawRow.join("|")}`;
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}
