import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles.css";

// Inside the Android app the files are local already; a service worker only matters on the web.
if (location.protocol.startsWith("http") && !(window as unknown as { Capacitor?: unknown }).Capacitor) registerSW({ immediate: true });

// Ask the browser not to evict photos when the phone runs low on space.
void navigator.storage?.persist?.();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
