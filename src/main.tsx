import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { seedLeague2026, seedLeagueJugend2026 } from "./lib/seedLeague2026";

// Seed initial league data (runs once, async)
seedLeague2026();
seedLeagueJugend2026();

createRoot(document.getElementById("root")!).render(<App />);
