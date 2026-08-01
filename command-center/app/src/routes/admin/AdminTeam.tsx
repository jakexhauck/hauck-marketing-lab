import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  Pencil,
  RefreshCw,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import AdminPage from "../../components/admin/AdminPage";
import { useToast } from "../../context/ToastContext";
import {
  suggestUsername,
  ADMIN_ROLE_ORDER,
  ADMIN_ROLE_SPECS,
  adminRoleLabel,
  effectiveAdminRole,
  type AdminRole,
} from "../../lib/adminRoles";

// Admin > Team: who can sign into this console, and what their role opens.
//
// Owner-only. Before roles existed every login here was a full super-admin over
// every client, so this page's real job is not "add a user", it is "hand someone
// a key that opens exactly one door". The role picker therefore shows what a
// role CANNOT reach next to what it can: the leash has to be readable at the
// moment the login is created, not discovered later.
//
// There is no invite email. Jake sets the password and hands it over, so the
// one moment the plaintext exists is surfaced deliberately (the handoff card)
// and never again.

interface Member {
  id: string;
  name: string;
  // What they type to sign in (0051). Email is now optional and not a handle.
  username: string;
  email: string;
  role: AdminRole;
  status: "active" | "disabled";
  createdAt: string;
  lastLoginAt: string | null;
}

const MIN_PASSWORD = 12;

// Readable, unambiguous password. No l/1/I/O/0: this gets read aloud or typed
// off a screenshot, and a character someone has to squint at is a support call.
const PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generatePassword(length = 16): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  let out = "";
  for (const b of bytes) out += PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length];
  return out;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// "Never" reads as an accusation on a login created two minutes ago, so an
// account that has not signed in yet says so plainly instead.
function lastActive(member: Member): string {
  if (!member.lastLoginAt) return "Has not signed in yet";
  const then = new Date(member.lastLoginAt);
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 2) return "Signed in just now";
  if (mins < 60) return `Signed in ${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Signed in ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `Signed in ${days} day${days === 1 ? "" : "s"} ago`;
  return `Last signed in ${then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

export default function AdminTeam() {
  const { admin } = useAuth();
  const { showToast } = useToast();
  const myRole = effectiveAdminRole(admin?.role);

  const [team, setTeam] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  // The one moment a plaintext password exists in the UI. Cleared on dismiss.
  const [handoff, setHandoff] = useState<{
    name: string;
    username: string;
    password: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api<{ team: Member[] }>("/api/admin/team");
      setTeam(res.team ?? []);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Could not load the team. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const active = useMemo(() => team.filter((m) => m.status === "active"), [team]);

  const openAdd = () => {
    setEditing(null);
    setHandoff(null);
    setFormOpen(true);
  };

  const openEdit = (member: Member) => {
    setEditing(member);
    setHandoff(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const onCreated = (member: Member, password: string) => {
    closeForm();
    setHandoff({ name: member.name, username: member.username, password });
    void refresh();
  };

  const onSaved = () => {
    closeForm();
    showToast("Saved");
    void refresh();
  };

  const toggleStatus = async (member: Member) => {
    const disabling = member.status === "active";
    try {
      if (disabling) {
        await api(`/api/admin/team/${member.id}`, { method: "DELETE" });
      } else {
        await api(`/api/admin/team/${member.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "active" }),
        });
      }
      showToast(disabling ? "Login disabled" : "Login restored");
      void refresh();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not update that login");
    }
  };

  if (myRole !== "owner") {
    return (
      <div className="pk-root">
        <AdminPage section="Team" />
        <div className="pk-empty">Only an owner can manage logins.</div>
      </div>
    );
  }

  return (
    <div className="pk-root">
      {/* The icon, the goal paragraph and the standalone title are gone: the
          header panel is the same object on every admin page now, and an
          explanatory paragraph under a header is banned across the product. The
          count moves into the panel beside the section name, where a number
          belongs, and Add team member becomes the page's action. */}
      <AdminPage
        section="Team"
        actions={
          <>
            <span className="font-data text-[12px] text-faint tnum">
              {active.length} active {active.length === 1 ? "login" : "logins"}
            </span>
            <button type="button" className="pk-btn-save" onClick={openAdd}>
              <UserPlus size={15} aria-hidden style={{ marginRight: 7, verticalAlign: -3 }} />
              Add team member
            </button>
          </>
        }
      />

      {handoff && (
        <HandoffCard handoff={handoff} onDismiss={() => setHandoff(null)} />
      )}

      {formOpen && (
        <MemberForm
          key={editing?.id ?? "new"}
          member={editing}
          selfId={admin?.id ?? ""}
          onCancel={closeForm}
          onCreated={onCreated}
          onSaved={onSaved}
        />
      )}

      <div className="pk-section">
        <div className="pk-section-h">Logins</div>
        {loading && <div className="pk-empty">Loading the team...</div>}
        {loadError && !loading && (
          <div className="pk-empty">
            {loadError}{" "}
            <button type="button" className="pk-btn-cancel" onClick={() => void refresh()}>
              <RefreshCw size={13} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
              Retry
            </button>
          </div>
        )}
        {!loading && !loadError && (
          <div className="pk-list">
            {team.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                isSelf={member.id === admin?.id}
                onEdit={() => openEdit(member)}
                onToggle={() => void toggleStatus(member)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MemberRow({
  member,
  isSelf,
  onEdit,
  onToggle,
}: {
  member: Member;
  isSelf: boolean;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const disabled = member.status === "disabled";
  return (
    <div className="pk-li" style={disabled ? { opacity: 0.55 } : undefined}>
      <div
        className="pk-person-av"
        style={{
          background: member.role === "owner" ? "var(--brand-tint)" : "var(--surface-2)",
          color: member.role === "owner" ? "var(--brand-text)" : "var(--text-muted)",
        }}
      >
        {initials(member.name)}
      </div>
      <div className="pk-li-main">
        <div className="pk-li-label">
          {member.name}
          {isSelf && <span className="pk-kindtag human">You</span>}
          {disabled && (
            <span className="pk-kindtag" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
              Disabled
            </span>
          )}
        </div>
        <div className="pk-li-sub" style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>
          {member.username}
        </div>
      </div>
      <div className="pk-li-meta">
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{adminRoleLabel(member.role)}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            {lastActive(member)}
          </div>
        </div>
        <button type="button" className="pk-btn-cancel" onClick={onEdit}>
          <Pencil size={13} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
          Edit
        </button>
        {!isSelf && (
          <button type="button" className="pk-btn-cancel" onClick={onToggle}>
            {disabled ? "Restore" : "Disable"}
          </button>
        )}
      </div>
    </div>
  );
}

// Shown once, immediately after a login is created. The password is not stored
// anywhere readable, so this card is the only chance to copy it. It says so.
function HandoffCard({
  handoff,
  onDismiss,
}: {
  handoff: { name: string; username: string; password: string };
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = `Hauck Marketing console\nhttps://app.hauckmarketing.com/login\n\nUsername: ${handoff.username}\nPassword: ${handoff.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard blocked (insecure origin, or denied). The values are on
      // screen and selectable, so this is a downgrade, not a failure.
      setCopied(false);
    }
  };

  return (
    <div
      className="pk-card"
      style={{
        border: "1px solid var(--brand)",
        borderRadius: "var(--radius-lg)",
        padding: "18px 20px",
        marginTop: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
        <KeyRound size={16} aria-hidden style={{ color: "var(--brand-text)" }} />
        <strong style={{ fontFamily: "var(--font-display)", fontSize: 15 }}>
          {handoff.name}&apos;s login is ready
        </strong>
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 14 }}>
        Send these to them now. The password is stored hashed, so this is the only time it can be
        read. If it is lost, set a new one from Edit.
      </p>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          background: "var(--surface-2)",
          borderRadius: "var(--radius)",
          padding: "12px 14px",
          lineHeight: 1.8,
          userSelect: "all",
          wordBreak: "break-all",
        }}
      >
        <div>app.hauckmarketing.com/login</div>
        <div>{handoff.username}</div>
        <div>{handoff.password}</div>
      </div>
      <div className="pk-form-actions">
        <button type="button" className="pk-btn-save" onClick={() => void copy()}>
          {copied ? (
            <Check size={14} aria-hidden style={{ marginRight: 7, verticalAlign: -2 }} />
          ) : (
            <Copy size={14} aria-hidden style={{ marginRight: 7, verticalAlign: -2 }} />
          )}
          {copied ? "Copied" : "Copy login details"}
        </button>
        <button type="button" className="pk-btn-cancel" onClick={onDismiss}>
          Done
        </button>
      </div>
    </div>
  );
}

function MemberForm({
  member,
  selfId,
  onCancel,
  onCreated,
  onSaved,
}: {
  member: Member | null;
  selfId: string;
  onCancel: () => void;
  onCreated: (member: Member, password: string) => void;
  onSaved: () => void;
}) {
  const editingSelf = member?.id === selfId;
  const [name, setName] = useState(member?.name ?? "");
  const [username, setUsername] = useState(member?.username ?? "");
  // Once the username has been typed by hand it stops tracking the name, so a
  // deliberate handle is never silently overwritten by a later name edit.
  const [handleTouched, setHandleTouched] = useState(Boolean(member));
  const [email, setEmail] = useState(member?.email ?? "");
  const [role, setRole] = useState<AdminRole>(member?.role ?? "cold_caller");
  const [password, setPassword] = useState(() => (member ? "" : generatePassword()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spec = ADMIN_ROLE_SPECS[role];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError("Enter their name.");
    if (!username.trim()) return setError("Enter a username for them.");
    // A password is required to create, optional to edit (blank = unchanged).
    if (!member && password.trim().length < MIN_PASSWORD) {
      return setError(`Password must be at least ${MIN_PASSWORD} characters.`);
    }
    if (member && password.trim() && password.trim().length < MIN_PASSWORD) {
      return setError(`Password must be at least ${MIN_PASSWORD} characters.`);
    }

    setSaving(true);
    try {
      if (member) {
        const body: Record<string, unknown> = {
          name: name.trim(),
          username: username.trim(),
          email: email.trim(),
        };
        // The server refuses a self role change; do not even offer it.
        if (!editingSelf) body.role = role;
        if (password.trim()) body.password = password.trim();
        await api(`/api/admin/team/${member.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        onSaved();
      } else {
        const res = await api<{ member: Member }>("/api/admin/team", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            username: username.trim(),
            email: email.trim(),
            password: password.trim(),
            role,
          }),
        });
        onCreated(res.member, password.trim());
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="pk-card pk-form"
      onSubmit={submit}
      style={{ borderRadius: "var(--radius-lg)", padding: "20px 22px", marginTop: 18 }}
    >
      <div className="pk-section-h" style={{ marginTop: 0 }}>
        {member ? `Edit ${member.name}` : "Add team member"}
      </div>

      <div className="pk-field-row">
        <div className="pk-field">
          <label htmlFor="tm-name">Name</label>
          <input
            id="tm-name"
            className="pk-input"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!handleTouched) setUsername(suggestUsername(e.target.value));
            }}
            placeholder="Marcus Bell"
            autoComplete="off"
          />
        </div>
        <div className="pk-field">
          <label htmlFor="tm-username">Username (this is their login)</label>
          <input
            id="tm-username"
            className="pk-input"
            value={username}
            onChange={(e) => {
              setHandleTouched(true);
              setUsername(e.target.value.toLowerCase());
            }}
            placeholder="marcus"
            autoComplete="off"
            style={{ fontFamily: "var(--font-mono)" }}
          />
        </div>
      </div>

      <div className="pk-field">
        <label htmlFor="tm-email">Email (optional)</label>
        <input
          id="tm-email"
          className="pk-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Only if you want one on file"
          autoComplete="off"
        />
      </div>

      <div className="pk-field">
        <label htmlFor="tm-password">
          {member ? "New password (leave blank to keep the current one)" : "Password"}
        </label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            id="tm-password"
            className="pk-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={member ? "Unchanged" : ""}
            autoComplete="new-password"
            style={{ flex: "2 1 240px", fontFamily: "var(--font-mono)" }}
          />
          <button
            type="button"
            className="pk-btn-cancel"
            onClick={() => setPassword(generatePassword())}
          >
            <RefreshCw size={13} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
            Generate
          </button>
        </div>
      </div>

      <div className="pk-field">
        <label>Role</label>
        {editingSelf ? (
          <div className="pk-needs">
            You are an owner. Another owner has to change your role, so you cannot lock yourself
            out of your own console.
          </div>
        ) : (
          <div className="pk-people" style={{ marginTop: 2 }}>
            {ADMIN_ROLE_ORDER.map((option) => {
              const optionSpec = ADMIN_ROLE_SPECS[option];
              const on = option === role;
              return (
                <button
                  type="button"
                  key={option}
                  onClick={() => setRole(option)}
                  aria-pressed={on}
                  className="pk-person"
                  style={{
                    display: "block",
                    textAlign: "left",
                    cursor: "pointer",
                    font: "inherit",
                    color: "inherit",
                    borderColor: on ? "var(--brand)" : "var(--border)",
                    boxShadow: on ? "var(--shadow-brand)" : "var(--shadow-sm)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontFamily: "var(--font-display)",
                      fontSize: 14.5,
                      fontWeight: 600,
                    }}
                  >
                    {on && <Check size={14} aria-hidden style={{ color: "var(--brand-text)" }} />}
                    {optionSpec.label}
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: 12.5, marginTop: 4 }}>
                    {optionSpec.blurb}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!editingSelf && (
        <div
          className="pk-needs"
          style={{ display: "block", borderStyle: "solid", lineHeight: 1.7 }}
        >
          <strong style={{ color: "var(--text)" }}>
            {spec.label} opens: {spec.sees.join(", ")}.
          </strong>
          {spec.denied.length > 0 && (
            <div style={{ marginTop: 2 }}>Cannot reach: {spec.denied.join(", ")}.</div>
          )}
          {role === "owner" && (
            <div style={{ marginTop: 6, color: "var(--warning)", fontWeight: 600 }}>
              <ShieldCheck size={13} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
              An owner can see every client and can create and remove logins, including yours.
            </div>
          )}
        </div>
      )}

      {error && <div className="pk-form-error">{error}</div>}

      <div className="pk-form-actions">
        <button type="submit" className="pk-btn-save" disabled={saving}>
          {saving ? "Saving..." : member ? "Save changes" : "Create login"}
        </button>
        <button type="button" className="pk-btn-cancel" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
