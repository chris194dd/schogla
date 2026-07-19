import { store } from "../utils/store.js";
import { CATEGORIES, INCOME_CATEGORY, UNCATEGORIZED } from "../config.js";

let categoryChart = null;
let trendChart = null;

function fmtEuro(n) {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym) {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

export function renderDashboard(root) {
  const availableMonths = Array.from(
    new Set(store.transactions.map((t) => t.date.slice(0, 7)))
  ).sort();
  const defaultMonth = availableMonths.includes(currentMonthValue())
    ? currentMonthValue()
    : availableMonths[availableMonths.length - 1] || currentMonthValue();

  root.innerHTML = `
    <div class="toolbar">
      <label>Monat
        <input type="month" id="dash-month" value="${defaultMonth}" />
      </label>
    </div>
    <div id="dash-content"></div>
  `;

  const monthInput = root.querySelector("#dash-month");
  monthInput.addEventListener("change", () => renderContent(root, monthInput.value));
  renderContent(root, defaultMonth);
}

function renderContent(root, ym) {
  const content = root.querySelector("#dash-content");
  const txs = store.transactions.filter((t) => t.date.startsWith(ym));

  const income = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expenses = txs.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const saldo = income + expenses;
  const uncategorizedCount = txs.filter((t) => t.category === UNCATEGORIZED).length;

  const expenseCategories = CATEGORIES.filter((c) => c !== INCOME_CATEGORY);
  const sums = expenseCategories.map((cat) =>
    Math.abs(
      txs
        .filter((t) => t.category === cat && t.amount < 0)
        .reduce((s, t) => s + t.amount, 0)
    )
  );

  content.innerHTML = `
    <div class="grid-3">
      <div class="card stat">
        <div class="label">Einnahmen — ${monthLabel(ym)}</div>
        <div class="value income">${fmtEuro(income)}</div>
      </div>
      <div class="card stat">
        <div class="label">Ausgaben — ${monthLabel(ym)}</div>
        <div class="value expense">${fmtEuro(Math.abs(expenses))}</div>
      </div>
      <div class="card stat">
        <div class="label">Saldo</div>
        <div class="value">${fmtEuro(saldo)}</div>
      </div>
    </div>

    ${
      uncategorizedCount > 0
        ? `<div class="card">
            <span class="badge uncategorized">${uncategorizedCount} Buchung(en) noch nicht klassifiziert</span>
          </div>`
        : ""
    }

    <div class="card">
      <h2>Ausgaben nach Kategorie</h2>
      ${txs.length === 0 ? '<div class="empty-state">Keine Buchungen in diesem Monat.</div>' : '<div class="chart-wrap"><canvas id="category-chart"></canvas></div>'}
    </div>

    <div class="card">
      <h2>Verlauf (Saldo pro Monat)</h2>
      <div class="chart-wrap"><canvas id="trend-chart"></canvas></div>
    </div>
  `;

  if (categoryChart) categoryChart.destroy();
  if (txs.length > 0) {
    const ctx = content.querySelector("#category-chart");
    categoryChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: expenseCategories,
        datasets: [
          {
            label: "Ausgaben (€)",
            data: sums,
            backgroundColor: "#c2542f",
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } },
      },
    });
  }

  // Trend über alle vorhandenen Monate
  const allMonths = Array.from(
    new Set(store.transactions.map((t) => t.date.slice(0, 7)))
  ).sort();
  const trendData = allMonths.map((m) => {
    const monthTxs = store.transactions.filter((t) => t.date.startsWith(m));
    return monthTxs.reduce((s, t) => s + t.amount, 0);
  });

  if (trendChart) trendChart.destroy();
  const trendCtx = content.querySelector("#trend-chart");
  trendChart = new Chart(trendCtx, {
    type: "line",
    data: {
      labels: allMonths.map(monthLabel),
      datasets: [
        {
          label: "Saldo (€)",
          data: trendData,
          borderColor: "#2f6f4f",
          backgroundColor: "rgba(47,111,79,0.1)",
          fill: true,
          tension: 0.2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
    },
  });
}
