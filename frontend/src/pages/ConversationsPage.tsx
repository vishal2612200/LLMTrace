import React from "react";
import { MessageSquareText, RotateCw } from "lucide-react";

import { api, ConversationSummary } from "../api/client";

export function ConversationsPage({ onResume }: { onResume: (id: string) => void }) {
  const [rows, setRows] = React.useState<ConversationSummary[]>([]);
  const [loading, setLoading] = React.useState(true);

  async function load() {
    setLoading(true);
    setRows(await api.conversations());
    setLoading(false);
  }

  React.useEffect(() => {
    void load();
  }, []);

  return (
    <section className="workspace">
      <header className="toolbar">
        <div>
          <h1>Conversations</h1>
          <p>Resume sessions and inspect stored redacted previews.</p>
        </div>
        <button onClick={load}>
          <RotateCw size={18} /> Refresh
        </button>
      </header>

      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>Conversation</th>
              <th>Status</th>
              <th>Provider</th>
              <th>Model</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>Loading conversations...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5}>No conversations yet.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  className="clickable-row"
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Resume conversation ${row.title}`}
                  onClick={() => onResume(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onResume(row.id);
                    }
                  }}
                >
                  <td>
                    <span className="row-title">
                      <MessageSquareText size={16} /> {row.title}
                    </span>
                  </td>
                  <td>
                    <span className={`status-pill ${row.status}`}>{row.status}</span>
                  </td>
                  <td>{row.provider}</td>
                  <td>{row.model}</td>
                  <td>{new Date(row.updated_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
