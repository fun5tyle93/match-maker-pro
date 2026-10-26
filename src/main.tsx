import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// The league seed data (src/lib/seedLeague2026.ts) used to be inserted here on every start of a
// browser without a marker. The data is in the database now, and running it again on another device
// could create duplicate leagues, so it is no longer started.

createRoot(document.getElementById("root")!).render(<App />);
