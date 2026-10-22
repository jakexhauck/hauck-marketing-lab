import { useState } from "react";
import type { Editor } from "@tiptap/react";
import type { BriefSection, BriefSectionId } from "../../../lib/agentWire";
import { BriefStyle, SectionBlock } from "../agents/BriefPanel";
import { BriefToolbar } from "../agents/BriefEditor";

// The old free-text brief sections, kept as Notes at the foot of the page they
// belong to (docs/build-plans/mission-control-brief.md, call 6). The same
// editors as before: Jake types, agents still write their own with a brief block.
export function NotesBlock({ tenantId, sections, ids }: { tenantId: string; sections: BriefSection[]; ids: BriefSectionId[] }) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const shown = ids.map((id) => sections.find((s) => s.section === id)).filter((s): s is BriefSection => !!s);
  if (!shown.length) return null;
  return (
    <div className="mcb-notes">
      <h3 className="mcb-h">Notes</h3>
      <div className="brf">
        <BriefStyle />
        <div className="brf-bar">
          <BriefToolbar editor={editor} />
        </div>
        <div className="brf-paper">
          {shown.map((s) => (
            <SectionBlock key={s.section} tenantId={tenantId} section={s} onFocus={setEditor} />
          ))}
        </div>
      </div>
    </div>
  );
}
