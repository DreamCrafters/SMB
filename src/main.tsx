import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { readClientSiteTitle } from "./services/appEnvironment";
import "./styles.css";

document.title = readClientSiteTitle();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
