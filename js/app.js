import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { auth } from "./firebase.js";
import { store } from "./utils/store.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderImport } from "./views/import.js";
import { renderCategorize } from "./views/categorize.js";
import { renderTransactions } from "./views/transactions.js";

const loginScreen = document.getElementById("login-screen");
const appEl = document.getElementById("app");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const userEmailEl = document.getElementById("user-email");
const viewRoot = document.getElementById("view-root");
const tabButtons = document.querySelectorAll(".tab-btn");

const views = {
  dashboard: renderDashboard,
  import: renderImport,
  categorize: renderCategorize,
  transactions: renderTransactions,
};

let currentView = "dashboard";

export function showToast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

export function switchView(name) {
  if (!views[name]) return;
  currentView = name;
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === name);
  });
  renderCurrentView();
}

function renderCurrentView() {
  viewRoot.innerHTML = "";
  views[currentView](viewRoot);
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

document.getElementById("logout-btn").addEventListener("click", () => {
  signOut(auth);
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const submitBtn = loginForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    loginError.textContent = "Anmeldung fehlgeschlagen. E-Mail/Passwort prüfen.";
  } finally {
    submitBtn.disabled = false;
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginScreen.classList.add("hidden");
    appEl.classList.remove("hidden");
    userEmailEl.textContent = user.email;
    store.start();
    // Views neu rendern, sobald sich die Daten ändern (Live-Sync).
    // Ausnahme: die Import-Ansicht hat eigenen, noch nicht gespeicherten
    // Zwischenstand (Spalten-Mapping/Vorschau) - der soll nicht durch
    // fremde Änderungen (z.B. vom Partner) verworfen werden.
    store.subscribe(() => {
      if (currentView !== "import") renderCurrentView();
    });
    switchView(currentView);
  } else {
    store.stop();
    appEl.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    loginForm.reset();
  }
});
