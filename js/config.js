// Trage hier die Konfiguration deines Firebase-Projekts ein.
// Firebase Console -> Projekteinstellungen -> "Meine Apps" -> Web-App -> Config.
// Diese Werte sind öffentliche Client-IDs (kein Geheimnis) - der eigentliche
// Schutz eurer Daten passiert über firestore.rules + Firebase Authentication.
export const firebaseConfig = {
  apiKey: "HIER_EINTRAGEN",
  authDomain: "HIER_EINTRAGEN.firebaseapp.com",
  projectId: "HIER_EINTRAGEN",
  storageBucket: "HIER_EINTRAGEN.appspot.com",
  messagingSenderId: "HIER_EINTRAGEN",
  appId: "HIER_EINTRAGEN",
};

// Feste Kategorienliste. Änderungen hier wirken sich auf Dropdowns in der
// ganzen App aus.
export const CATEGORIES = [
  "Essen + Trinken",
  "Gastronomie / Freizeit",
  "Wohnung",
  "Einkünfte",
  "Urlaub",
  "Auto",
  "Hund",
  "nicht klassifiziert",
];

export const UNCATEGORIZED = "nicht klassifiziert";
export const INCOME_CATEGORY = "Einkünfte";
