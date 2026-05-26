import React from "react";
import { CheckCircle2, Copy } from "lucide-react";

export type CopyState = Record<string, boolean>;

export function UtilityTitle({ icon, title, meta }: { icon: React.ReactNode; title: string; meta: string }) {
  return (
    <div className="panel-title utility-title">
      <div>
        <span>{icon}</span>
        <h2>{title}</h2>
      </div>
      <small>{meta}</small>
    </div>
  );
}

export async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through for background browser contexts without clipboard focus.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy failed.");
}

export function CodeBlock({
  id,
  value,
  copied,
  onCopy,
}: {
  id: string;
  value: string;
  copied?: boolean;
  onCopy: (id: string, value: string) => Promise<void>;
}) {
  return (
    <div className="code-block">
      <pre>{value}</pre>
      <button className="icon-button" data-copied={copied ? "true" : "false"} onClick={() => void onCopy(id, value)} aria-label={`Copy ${id}`}>
        {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
      </button>
    </div>
  );
}

export function StatusCard({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  tone: "blue" | "green" | "amber" | "red" | "teal";
}) {
  return (
    <div className={`metric utility-status-card ${tone}`}>
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
      <em>{note}</em>
    </div>
  );
}
