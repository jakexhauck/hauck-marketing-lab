import OperationsTasksTab from "../../components/admin/OperationsTasksTab";

// Command home: the agency task list, and nothing else.
//
// Business Health moved to Operations > Business Health and the shortcut grid
// duplicated the sidebar, so what is left is what Command is actually for:
// what is on the plate today. The card is the SAME component the Operations
// Tasks tab renders, so the two are one list, not two that drift.
//
// The page is a flex column and the list runs in fill mode, so the checklist
// takes the whole window and scrolls inside its own card rather than sitting
// in a 62vh box with dead space under it. There is no header panel: the rail
// row is the title.
//
// PillarStyle is mounted once by AdminLayout, so this page renders .pk-root.

export default function AdminCommand() {
  return (
    <div className="pk-root cmd-root">
      <CommandStyle />
      <OperationsTasksTab fill />
    </div>
  );
}

function CommandStyle() {
  return (
    <style>{`
      .pk-kit .pk-root.cmd-root {
        display: flex; flex-direction: column; gap: 14px;
        flex: 1 1 auto; min-height: 0; padding-bottom: 24px;
      }
      /* The controls row keeps its own margin; the card below it does the
         stretching, so nothing else in the column may grow. */
      .pk-kit .cmd-root .otk-controls { flex: 0 0 auto; }
    `}</style>
  );
}
