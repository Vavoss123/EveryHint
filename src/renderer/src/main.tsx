import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./theme/tokens.css";
import "./theme/fonts.css";

const element = document.getElementById("root");
if (!element) throw new Error("EveryHint root element is missing.");
const root = createRoot(element);
let disposed = false;
async function mount(): Promise<void> {
  // Separate chunks keep dashboard components AND their global styles out of
  // the floating document. The exact URL still uses the existing IPC boundary.
  const Component =
    new URLSearchParams(location.search).get("overlay") === "1"
      ? (await import("./FloatingAssistant")).FloatingAssistant
      : (await import("./DashboardApp")).DashboardApp;
  if (!disposed)
    root.render(
      <StrictMode>
        <Component />
      </StrictMode>,
    );
}
void mount().catch(() => {
  if (!disposed)
    root.render(
      <p role="alert">EveryHint could not open. Restart the application.</p>,
    );
});
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    disposed = true;
    root.unmount();
  });
