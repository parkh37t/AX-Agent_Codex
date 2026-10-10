import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import HostedApp from "./HostedApp";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {import.meta.env.VITE_AX_HOSTED === "true" ? <HostedApp /> : <App />}
  </React.StrictMode>,
);
