import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { seedLeague2026, seedLeagueJugend2026, seedEwigeTabelle } from "./lib/seedLeague2026";

// Seed initial league data (runs once, async)
// Remove old eternal league seed key so new v3 seed (with pointsAgainst) runs
localStorage.removeItem('kicker_seed_ewig_2026_sb_v1');
localStorage.removeItem('kicker_seed_ewig_2026_sb_v2');
localStorage.removeItem('kicker_seed_ewig_2026_sb_v3');
seedLeague2026();
seedLeagueJugend2026();
seedEwigeTabelle();

createRoot(document.getElementById("root")!).render(<App />);
