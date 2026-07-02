import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { friendlyMessage } from "./lib/errors";
import { toast } from "sonner";

// Global safety nets — catch anything that escapes React/component-level try/catch
window.addEventListener("unhandledrejection", (event) => {
  console.error("[unhandledrejection]", event.reason);
  const msg = friendlyMessage(event.reason, "Erro inesperado em segundo plano");
  // Avoid toast spam from benign aborts
  if (!/aborted|cancell?ed/i.test(msg)) toast.error(msg);
});

window.addEventListener("error", (event) => {
  // ResizeObserver noise — safe to ignore
  if (event.message?.includes("ResizeObserver")) return;
  console.error("[window.error]", event.error || event.message);
});

createRoot(document.getElementById("root")!).render(<App />);

// Fade out the boot splash once the app has mounted
requestAnimationFrame(() => {
  const splash = document.getElementById("boot-splash");
  if (!splash) return;
  splash.classList.add("boot-splash--hidden");
  setTimeout(() => splash.remove(), 400);
});
