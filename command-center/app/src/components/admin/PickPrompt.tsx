import type { ReactNode } from "react";

// The "pick something from the rail" signpost shown on the right of a roster
// page before anything is selected. Shared by Fulfillment > Clients and
// Fulfillment > Onboarding, which are the same shape with different rails.
//
// Scoped under .pk-kit so it reads the admin theme tokens light and dark.
// Deliberately quiet: it is a signpost, not a surface.

export default function PickPrompt({
  icon,
  title,
  sub,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <>
      <div className="pk-pick">
        <span className="pk-pick-ico" aria-hidden>
          {icon}
        </span>
        <div className="pk-pick-t">{title}</div>
        <div className="pk-pick-s">{sub}</div>
      </div>
      <style>{`
        .pk-kit .pk-pick {
          display: flex; flex-direction: column; align-items: center; text-align: center;
          gap: 4px; padding: 88px 24px;
        }
        .pk-kit .pk-pick-ico {
          width: 46px; height: 46px; border-radius: 14px; margin-bottom: 8px;
          display: grid; place-items: center;
          background: var(--brand-tint); color: var(--brand-text);
        }
        .pk-kit .pk-pick-t {
          font-family: var(--font-display); font-size: 17px; font-weight: 600; color: var(--text);
        }
        .pk-kit .pk-pick-s { font-size: 13.5px; color: var(--text-muted); }
      `}</style>
    </>
  );
}
