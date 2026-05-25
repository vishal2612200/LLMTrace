import React from "react";
import ReactDOM from "react-dom/client";
import { Activity, BarChart3, MessageSquareText } from "lucide-react";

import { ChatPage } from "./pages/ChatPage";
import { ConversationsPage } from "./pages/ConversationsPage";
import { DashboardPage } from "./pages/DashboardPage";
import "./styles/app.css";

type View = "chat" | "conversations" | "dashboard";

function App() {
  const [view, setView] = React.useState<View>("chat");
  const [activeConversationId, setActiveConversationId] = React.useState<string | undefined>();

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
        </nav>
        <div className="sidebar-note">
          <span>Default mode</span>
          <strong>Mock provider</strong>
          <small>No API key required</small>
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
        {view === "dashboard" && <DashboardPage />}
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
