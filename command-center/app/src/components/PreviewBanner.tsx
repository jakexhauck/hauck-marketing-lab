import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";

/**
 * App-wide banner shown only while a super-admin is previewing a client's view
 * read-only (Plan 05). It makes the impersonation obvious (so admin actions are
 * never mistaken for the client's own) and offers a one-click exit that restores
 * the admin session and returns to the admin console. Writes are already refused
 * by the backend; this is the visible half of that contract.
 */
export default function PreviewBanner() {
  const { preview, exitPreview } = useAuth();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  if (!preview) return null;

  const onExit = async () => {
    setLeaving(true);
    const res = await exitPreview();
    if (res.ok) {
      navigate("/admin/clients", { replace: true });
    } else {
      // The session is gone or the call failed; fall back to login rather than
      // leaving the admin stuck behind a read-only banner.
      setLeaving(false);
      navigate("/login", { replace: true });
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        fontSize: "0.78rem",
        fontWeight: 600,
        letterSpacing: "0.01em",
        padding: "6px 12px",
        paddingTop: "calc(6px + env(safe-area-inset-top))",
        background: "#4338ca",
        color: "#fff",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
        <Eye size={14} />
        {preview.staff
          ? `Viewing as ${preview.staff.name} (read-only)`
          : "Previewing this client read-only"}
      </span>
      <button
        type="button"
        onClick={() => void onExit()}
        disabled={leaving}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          borderRadius: "9999px",
          border: "1px solid rgba(255,255,255,0.5)",
          padding: "2px 10px",
          fontSize: "0.72rem",
          fontWeight: 700,
          color: "#fff",
          background: "rgba(255,255,255,0.12)",
          cursor: leaving ? "default" : "pointer",
          opacity: leaving ? 0.7 : 1,
        }}
      >
        {leaving && <Loader2 size={12} className="animate-spin" />}
        {leaving ? "Exiting..." : "Exit preview"}
      </button>
    </div>
  );
}
