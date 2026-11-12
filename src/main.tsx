import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./fonts.css";
import "./index.css";

// The league seed data used to be inserted here on every start of a browser without a marker.
// The data is in the database now, and running a seed again on another device could create
// duplicate leagues, so there is no seed any more.

createRoot(document.getElementById("root")!).render(<App />);
