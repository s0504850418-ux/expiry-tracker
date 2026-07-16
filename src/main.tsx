import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// טוען את קונפיגורציית Firebase כדי לוודא כבר בזמן build שכל משתני
// הסביבה הנדרשים קיימים (ראה src/firebase/config.ts).
import "./firebase/config.ts";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
