import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { App } from "./App";
import "./style.css";
import "./polish.css";

function FrontendMountedSignal() {
  useEffect(() => { void invoke("desktop_ui_ready").catch(() => undefined); }, []);
  return null;
}

createRoot(document.getElementById("root")!).render(<StrictMode><FrontendMountedSignal /><App /></StrictMode>);
