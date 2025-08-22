import { useState } from "react";
import { apiPost } from "../lib/apiClient";

type Props = {
  solutionId: string | number;
  text: string;
  status?: "draft" | "sent_for_confirm" | "confirmed_by_user" | "rejected" | "published";
  onPromoted?: (articleId: number) => void;
};

export default function SolutionCard({ solutionId, text, status, onPromoted }: Props) {
  const [busy, setBusy] = useState<null | "send" | "promote">(null);
  const [state, setState] = useState(status ?? "draft");

  async function sendConfirm() {
    setBusy("send");
    try {
      await apiPost(`/solutions/${solutionId}/send_confirmation_email`);
      setState("sent_for_confirm");
      alert("Confirmation email sent.");
    } catch (e:any) {
      alert(e?.message || "Failed to send confirmation.");
    } finally { setBusy(null); }
  }

  async function promote() {
    setBusy("promote");
    try {
      const r = await apiPost<{article_id:number}>(`/solutions/${solutionId}/promote`);
      setState("published");
      alert("Promoted to KB.");
      onPromoted?.(r.article_id);
    } catch (e:any) {
      alert(e?.message || "Promote failed");
    } finally { setBusy(null); }
  }

  const canPromote = state === "confirmed_by_user" || state === "published";

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="text-sm uppercase tracking-wide opacity-60">Proposed solution</div>
      <pre className="whitespace-pre-wrap text-sm">{text}</pre>
      <div className="flex items-center gap-2">
        <span className="text-xs px-2 py-1 rounded-full bg-gray-100">
          {state.replaceAll("_"," ")}
        </span>
        <div className="ml-auto flex gap-2">
          <button
            className="px-3 py-1 rounded-md border"
            disabled={busy !== null}
            onClick={sendConfirm}
          >
            {busy==="send" ? "Sending..." : "Send confirmation"}
          </button>
          <button
            className="px-3 py-1 rounded-md border"
            disabled={busy !== null || !canPromote}
            onClick={promote}
            title={!canPromote ? "Enable after user confirms" : ""}
          >
            {busy==="promote" ? "Promoting..." : "Promote to KB"}
          </button>
        </div>
      </div>
    </div>
  );
}
