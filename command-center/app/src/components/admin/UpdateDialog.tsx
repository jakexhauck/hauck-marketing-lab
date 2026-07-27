import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  seenStorageKey,
  unseenReleases,
  type Release,
} from "../../lib/releaseNotes";

// "Here is what changed" for everyone with an agency login.
//
// Mounted once in the admin shell, so it fires wherever a person lands rather
// than only on a page they might never open. It shows what they have not seen,
// they dismiss it, and it does not come back until the next release.
//
// Seen-state is per person in this browser (localStorage), not on the server.
// A changelog is not worth a table, and the failure mode of the cheap version is
// that a new browser shows the notes again, which errs towards being told twice
// rather than never. Storage is wrapped because Safari's private mode throws on
// write: a browser that refuses to remember must still show the app.
function readSeen(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSeen(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A person who cannot be remembered sees the notes again next time. That is
    // the whole cost, and it is not worth an error in front of them.
  }
}

export default function UpdateDialog() {
  const { admin } = useAuth();
  const [releases, setReleases] = useState<Release[]>([]);

  // Resolved once per signed-in person rather than on every render: reading
  // storage mid-render would make this component's output depend on something
  // React cannot see.
  useEffect(() => {
    if (!admin?.id) {
      setReleases([]);
      return;
    }
    setReleases(unseenReleases(readSeen(seenStorageKey(admin.id))));
  }, [admin?.id]);

  const dismiss = () => {
    if (admin?.id && releases[0]) {
      // Store the NEWEST unseen id, so dismissing catches a person up on
      // everything shown rather than one release at a time.
      writeSeen(seenStorageKey(admin.id), releases[0].id);
    }
    setReleases([]);
  };

  // Escape closes it, the same as the button. A modal that traps someone is
  // worse than one they miss.
  useEffect(() => {
    if (releases.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (releases.length === 0) return null;

  return (
    <div
      className="upd-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upd-title"
      // Clicking the backdrop dismisses; clicking the card must not, so the
      // check is on the target being the scrim itself.
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <UpdateStyle />
      <div className="upd-card">
        <button
          type="button"
          className="upd-close"
          aria-label="Close"
          onClick={dismiss}
        >
          <X size={16} />
        </button>

        <div className="upd-badge">
          <Sparkles size={14} aria-hidden />
          {releases.length > 1 ? `${releases.length} updates` : "What's new"}
        </div>

        {releases.map((release) => (
          <section key={release.id} className="upd-release">
            <h2 id="upd-title" className="upd-title">
              {release.title}
            </h2>
            <p className="upd-date">{release.date}</p>
            <ul className="upd-items">
              {release.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}

        <button type="button" className="upd-ok" onClick={dismiss} autoFocus>
          Got it
        </button>
      </div>
    </div>
  );
}

function UpdateStyle() {
  return (
    <style>{`
      .upd-scrim { position: fixed; inset: 0; z-index: 120; background: rgba(6, 12, 10, 0.62); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 20px; }
      .upd-card { position: relative; width: min(520px, 100%); max-height: 82dvh; overflow-y: auto; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: 0 24px 60px rgba(0,0,0,0.32); padding: 26px 26px 22px; }
      .upd-close { position: absolute; top: 14px; right: 14px; width: 28px; height: 28px; display: grid; place-items: center; border: 0; background: transparent; color: var(--text-faint); border-radius: 7px; cursor: pointer; }
      .upd-close:hover { background: var(--surface-2); color: var(--text); }

      .upd-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--brand-text); background: var(--brand-tint); border-radius: 999px; padding: 4px 11px; margin-bottom: 14px; }

      .upd-release + .upd-release { margin-top: 22px; padding-top: 20px; border-top: 1px solid var(--divider); }
      .upd-title { font-family: var(--font-display); font-size: 19px; font-weight: 600; letter-spacing: -0.01em; color: var(--text); margin: 0; line-height: 1.3; }
      .upd-date { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-faint); margin: 5px 0 14px; }
      .upd-items { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 11px; }
      .upd-items li { position: relative; padding-left: 20px; font-size: 14px; line-height: 1.55; color: var(--text-muted); }
      .upd-items li::before { content: ""; position: absolute; left: 3px; top: 8px; width: 7px; height: 7px; border-radius: 50%; background: var(--brand); }

      .upd-ok { margin-top: 22px; width: 100%; border: 0; border-radius: 10px; background: var(--brand); color: #fff; font: inherit; font-size: 14px; font-weight: 600; padding: 11px 0; cursor: pointer; }
      .upd-ok:hover { filter: brightness(1.06); }
      .upd-ok:focus-visible { outline: 2px solid var(--brand-text); outline-offset: 2px; }
    `}</style>
  );
}
