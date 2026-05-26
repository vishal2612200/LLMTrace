import React from "react";
import ReactDOM from "react-dom/client";
import { Activity, BarChart3, FileText, GitBranch, MessageSquareText, Settings } from "lucide-react";

import { api } from "./api/client";
import { ChatPage } from "./pages/ChatPage";
import { ConversationsPage } from "./pages/ConversationsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DocsPage } from "./pages/DocsPage";
import { HarnessPage } from "./pages/HarnessPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useRuntimeSettings } from "./hooks/useRuntimeSettings";
import "./styles/app.css";

type View = "chat" | "conversations" | "dashboard" | "harness" | "docs" | "settings";

function App() {
  const [view, setView] = React.useState<View>("chat");
  const [activeConversationId, setActiveConversationId] = React.useState<string | undefined>();
  const runtimeSettings = useRuntimeSettings();

  React.useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [view]);

  React.useEffect(() => {
    void api.runtimeSettings().catch(() => undefined);
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">LT</span>
          <div>
            <strong>LLMTrace</strong>
            <small>Inference Ops</small>
          </div>
        </div>
        <nav className="nav-list" aria-label="Primary">
          <button className={view === "chat" ? "active" : ""} onClick={() => setView("chat")}>
            <MessageSquareText size={18} /> Chat
          </button>
          <button className={view === "conversations" ? "active" : ""} onClick={() => setView("conversations")}>
            <Activity size={18} /> Conversations
          </button>
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
            <BarChart3 size={18} /> Dashboard
          </button>
          <button className={view === "harness" ? "active" : ""} onClick={() => setView("harness")}>
            <GitBranch size={18} /> Harness
          </button>
        </nav>
        <div className="sidebar-bottom">
          <nav className="nav-list sidebar-utility" aria-label="Resources">
            <button className={view === "docs" ? "active" : ""} onClick={() => setView("docs")}>
              <FileText size={18} /> Docs
            </button>
            <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>
              <Settings size={18} /> Settings
            </button>
          </nav>
          <div className="sidebar-note">
            <span>Default mode</span>
            <strong>{runtimeSettings.defaultProvider} provider</strong>
            <small>{runtimeSettings.defaultModel}</small>
          </div>
        </div>
      </aside>
      <main className="main">
        {view === "chat" && (
          <ChatPage conversationId={activeConversationId} onConversationChange={setActiveConversationId} />
        )}
        {view === "conversations" && (
          <ConversationsPage
            onResume={(id) => {
              setActiveConversationId(id);
              setView("chat");
            }}
          />
        )}
        {view === "dashboard" && <DashboardPage onOpenSettings={() => setView("settings")} />}
        {view === "harness" && <HarnessPage onOpenSettings={() => setView("settings")} />}
        {view === "docs" && <DocsPage />}
        {view === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}

declare global {
  interface Window {
    __LLMTRACE_ROOT__?: ReturnType<typeof ReactDOM.createRoot>;
  }
}

const rootElement = document.getElementById("root")!;
const root = window.__LLMTRACE_ROOT__ ?? ReactDOM.createRoot(rootElement);
window.__LLMTRACE_ROOT__ = root;

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
