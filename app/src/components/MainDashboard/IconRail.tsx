import { useEffect } from "react";
import { SUB_APPS, type SubApp } from "../../lib/navigation";
import {
  IconBarChart,
  IconCheck,
  IconCode,
  IconDashboard,
  IconLayout,
  IconSettings,
  IconTarget,
  IconUsers,
} from "../icons";

interface IconRailProps {
  current: SubApp;
  onPick: (subApp: SubApp) => void;
}

function iconFor(id: SubApp) {
  switch (id) {
    case "dashboard":
      return IconDashboard;
    case "clients":
      return IconUsers;
    case "outreach":
      return IconTarget;
    case "sales":
      return IconBarChart;
    case "onboarding":
      return IconCheck;
    case "workspace":
      return IconLayout;
    case "builder":
      return IconCode;
    case "settings":
      return IconSettings;
  }
}

export function IconRail({ current, onPick }: IconRailProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const def = SUB_APPS.find((s) => s.kbd === e.key);
      if (def) {
        e.preventDefault();
        onPick(def.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPick]);

  const primary = SUB_APPS.filter(
    (s) => s.id !== "workspace" && s.id !== "settings",
  );
  const workspace = SUB_APPS.find((s) => s.id === "workspace");
  const settings = SUB_APPS.find((s) => s.id === "settings");

  const renderBtn = (def: typeof SUB_APPS[number]) => {
    const Icon = iconFor(def.id);
    const active = def.id === current;
    return (
      <button
        key={def.id}
        type="button"
        className={`hml-rail-btn${active ? " hml-rail-active" : ""}`}
        onClick={() => onPick(def.id)}
        title={def.name}
        aria-label={def.name}
        aria-current={active ? "page" : undefined}
      >
        <Icon size={17} />
        <span className="hml-rail-tip">
          <span>{def.name}</span>
          <span className="hml-rail-tip-sub">{def.subLine}</span>
          <span className="hml-rail-tip-kbd">
            {def.kbd === "," ? "⌘ ," : `⌘ ${def.kbd}`}
          </span>
        </span>
      </button>
    );
  };

  return (
    <aside className="hml-rail">
      <button
        type="button"
        className="hml-rail-mark"
        onClick={() => onPick("dashboard")}
        title="Hauck Marketing Lab"
        aria-label="Hauck Marketing Lab"
      >
        H
      </button>

      {primary.map(renderBtn)}

      {workspace && (
        <>
          <div className="hml-rail-div" />
          {renderBtn(workspace)}
        </>
      )}

      <div className="hml-rail-grow" />

      {settings && renderBtn(settings)}
    </aside>
  );
}
