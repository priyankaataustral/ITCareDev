import { useState } from "react";
import { apiPost } from "./apiClient";

/**
 * Props (all optional except one of `threadId` or `articleId`):
 * - threadId: number|string   // When present → submits to /threads/:id/feedback
 * - attemptId: number         // Optional, passed through to backend
 * - userEmail: string         // Optional, passed through to backend
 * - defaultType: "CONFIRM"|"REJECT" // If provided, locks the form to that type (no toggle)
 * - articleId: number|string  // Fallback mode: submits to /kb/articles/:id/feedback
 * - onSubmitted: function     // Callback after successful submit
 */
export default function KbFeedback(props) {
  const {
    threadId,
    attemptId,
    userEmail,
    defaultType,       // "CONFIRM" | "REJECT" (optional)
    articleId,         // if no threadId, falls back to KB-article feedback
    onSubmitted
  } = props || {};

  // Mode detection
  const isThreadMode = !!threadId;

  // Shared state
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState({ ok: "", err: "" });

  // Thread feedback state
  const [tType, setTType] = useState(defaultType || "CONFIRM"); // CONFIRM or REJECT
  const [rating, setRating] = useState(0);       // 1..5 (required for CONFIRM)
  const [comment, setComment] = useState("");    // optional
  const [reason, setReason] = useState("");      // required for REJECT

  // Article feedback state (legacy/thumbs)
  const [thumb, setThumb] = useState("");        // "helpful" | "not_helpful"
  const [aRating, setARating] = useState(0);
  const [aComment, setAComment] = useState("");

  async function submitThreadFeedback() {
    // Basic validations
    if (!tType || (tType !== "CONFIRM" && tType !== "REJECT")) {
      setMsg({ ok: "", err: "Choose Confirm or Not fixed." });
      return;
    }
    if (tType === "CONFIRM" && (!rating || rating < 1 || rating > 5)) {
      setMsg({ ok: "", err: "Please give a rating (1–5)." });
      return;
    }
    if (tType === "REJECT" && !reason.trim()) {
      setMsg({ ok: "", err: "Please provide a brief reason." });
      return;
    }

    setPending(true);
    setMsg({ ok: "", err: "" });

    try {
      await apiPost(`/threads/${threadId}/feedback`, {
        type: tType,                  // "CONFIRM" | "REJECT"
        rating: tType === "CONFIRM" ? rating : undefined,
        comment: comment || undefined,
        reason: tType === "REJECT" ? reason : undefined,
        attempt_id: attemptId || undefined,
        user_email: userEmail || undefined,
      });

      // Reset (keep defaultType lock)
      if (!defaultType) setTType("CONFIRM");
      setRating(0);
      setComment("");
      setReason("");

      setMsg({ ok: "Thanks for your feedback!", err: "" });
      onSubmitted && onSubmitted();
    } catch (e) {
      setMsg({ ok: "", err: e?.message || "Could not submit feedback" });
    } finally {
      setPending(false);
    }
  }

  async function submitArticleFeedback() {
    if (!thumb) {
      setMsg({ ok: "", err: "Choose 👍 or 👎" });
      return;
    }

    setPending(true);
    setMsg({ ok: "", err: "" });

    try {
      await apiPost(`/kb/${articleId}/feedback`, {
        feedback_type: thumb,                // "helpful" | "not_helpful"
        rating: aRating || undefined,
        comment: aComment || undefined,
        user_email: userEmail || undefined,
      });

      setThumb("");
      setARating(0);
      setAComment("");

      setMsg({ ok: "Thanks for your feedback!", err: "" });
      onSubmitted && onSubmitted();
    } catch (e) {
      setMsg({ ok: "", err: e?.message || "Could not submit feedback" });
    } finally {
      setPending(false);
    }
  }

  // --- UI helpers ---
  const Star = ({ filled, onClick, disabled }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-2xl ${filled ? "opacity-100" : "opacity-30"} disabled:opacity-40`}
      aria-label={filled ? "filled star" : "empty star"}
    >
      ★
    </button>
  );

  // =========================
  // THREAD MODE (CONFIRM/REJECT)
  // =========================
  if (isThreadMode) {
    const locked = !!defaultType; // if true, hide the toggle

    return (
      <div className="rounded-xl border p-4 space-y-4 bg-white dark:bg-gray-900">
        {!locked && (
          <div className="flex gap-2">
            <button
              className={`px-3 py-1 rounded-md border ${tType === "CONFIRM" ? "bg-green-50" : ""}`}
              onClick={() => setTType("CONFIRM")}
              disabled={pending}
            >
              ✅ Confirmed (Solved)
            </button>
            <button
              className={`px-3 py-1 rounded-md border ${tType === "REJECT" ? "bg-red-50" : ""}`}
              onClick={() => setTType("REJECT")}
              disabled={pending}
            >
              🚫 Not fixed
            </button>
          </div>
        )}

        {tType === "CONFIRM" && (
          <>
            <div className="space-y-1">
              <div className="text-sm font-medium">Rate the solution</div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    filled={rating >= n}
                    onClick={() => setRating(n)}
                    disabled={pending}
                  />
                ))}
                <span className="ml-2 text-sm text-gray-500">{rating || "—"}/5</span>
              </div>
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional comment…"
              className="w-full border rounded p-2 min-h-[80px]"
              disabled={pending}
            />
          </>
        )}

        {tType === "REJECT" && (
          <>
            <div className="space-y-1">
              <label className="text-sm font-medium">Reason</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What didn’t work?"
                className="w-full border rounded px-2 py-1"
                disabled={pending}
              />
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional details…"
              className="w-full border rounded p-2 min-h-[80px]"
              disabled={pending}
            />
          </>
        )}

        <div className="flex items-center gap-3">
          <button
            className="px-3 py-1 rounded-md border"
            onClick={submitThreadFeedback}
            disabled={pending || (tType === "CONFIRM" ? rating < 1 : false)}
          >
            {pending ? "Submitting…" : "Submit"}
          </button>
          {msg.ok && <span className="text-green-700 text-sm">{msg.ok}</span>}
          {msg.err && <span className="text-red-600 text-sm">{msg.err}</span>}
        </div>
      </div>
    );
  }

  // =========================
  // ARTICLE MODE (legacy thumbs)
  // =========================
  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex gap-2">
        <button
          className={`px-3 py-1 rounded-md border ${thumb === "helpful" ? "bg-green-50" : ""}`}
          onClick={() => setThumb("helpful")}
          disabled={pending}
        >
          👍 Helpful
        </button>
        <button
          className={`px-3 py-1 rounded-md border ${thumb === "not_helpful" ? "bg-red-50" : ""}`}
          onClick={() => setThumb("not_helpful")}
          disabled={pending}
        >
          👎 Not helpful
        </button>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm">Rating</label>
        <input
          type="number"
          min={1}
          max={5}
          value={aRating || ""}
          onChange={(e) => setARating(+e.target.value)}
          className="w-16 border rounded px-2 py-1"
          disabled={pending}
        />
      </div>

      <textarea
        value={aComment}
        onChange={(e) => setAComment(e.target.value)}
        placeholder="Optional comment…"
        className="w-full border rounded p-2 min-h-[80px]"
        disabled={pending}
      />

      <div className="flex items-center gap-3">
        <button
          className="px-3 py-1 rounded-md border"
          onClick={submitArticleFeedback}
          disabled={!thumb || pending || !articleId}
        >
          {pending ? "Submitting…" : "Submit"}
        </button>
        {msg.ok && <span className="text-green-700 text-sm">{msg.ok}</span>}
        {msg.err && <span className="text-red-600 text-sm">{msg.err}</span>}
      </div>
    </div>
  );
}
