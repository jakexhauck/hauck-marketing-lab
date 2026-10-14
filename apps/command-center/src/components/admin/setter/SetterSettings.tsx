import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Undo2 } from "lucide-react";
import ScriptEditor from "../script/ScriptEditor";
import { useSaveSetterScriptMutation, useSetterScriptQuery } from "../../../hooks/useApi";
import { useAuth } from "../../../context/AuthContext";
import { api } from "../../../lib/api";
import { SopButton, SopError } from "../sop/sopKit";

interface Props {
  tenantId: string;
  clientName: string;
}

// The Setter Suite Settings tab (replaced the Dialing Hub). One setting so far:
// the client's dialing script, written here and read by the cockpit's script
// panel.
//
// The editor itself is shared with Cold Calling's Scripts page
// (components/admin/script/ScriptEditor); this file only supplies the client's
// document and where it saves to. The parent keys this component on the tenant,
// so switching client remounts and reseeds the editor cleanly.
//
// Write from template (owners, 2026-10-06): replaces the script with the Client
// Setup template, company name filled in (functions/lib/scriptTemplate.ts), with
// one Undo. The editor seeds only once, so it is remounted (editorKey) whenever
// one of these replaces the document under it.

interface ScriptResponse {
  html: string;
  updatedAt: string | null;
  filled?: number;
  canUndo?: boolean;
}

export default function SetterSettings({ tenantId, clientName }: Props) {
  const scriptQuery = useSetterScriptQuery(tenantId, true);
  const saveMutation = useSaveSetterScriptMutation(tenantId);
  const { admin } = useAuth();
  const qc = useQueryClient();
  const [editorKey, setEditorKey] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [canUndo, setCanUndo] = useState(false);

  const replaced = (res: ScriptResponse) => {
    qc.setQueryData(["admin", "setter", "script", tenantId], { html: res.html, updatedAt: res.updatedAt });
    setEditorKey((k) => k + 1);
  };

  const fromTemplate = useMutation({
    mutationFn: () =>
      api<ScriptResponse>("/api/admin/setter/script/template", { method: "POST", body: JSON.stringify({ tenantId }) }),
    onSuccess: (res) => {
      replaced(res);
      setCanUndo(!!res.canUndo);
      setConfirming(false);
    },
  });
  const undo = useMutation({
    mutationFn: () =>
      api<ScriptResponse>("/api/admin/setter/script/undo", { method: "POST", body: JSON.stringify({ tenantId }) }),
    onSuccess: (res) => {
      replaced(res);
      setCanUndo(false);
    },
  });

  const hasScript = !!scriptQuery.data?.html?.trim();
  const write = () => (hasScript && !confirming ? setConfirming(true) : fromTemplate.mutate());

  return (
    <div className="max-w-[880px]">
      {admin?.role === "owner" && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SopButton onClick={write} disabled={fromTemplate.isPending || scriptQuery.isLoading}>
            <FileText size={14} aria-hidden />
            {fromTemplate.isPending ? "Writing..." : confirming ? "Replace the current script?" : "Write from template"}
          </SopButton>
          {confirming && !fromTemplate.isPending && (
            <SopButton onClick={() => setConfirming(false)}>Cancel</SopButton>
          )}
          {canUndo && (
            <SopButton onClick={() => undo.mutate()} disabled={undo.isPending}>
              <Undo2 size={14} aria-hidden /> Undo
            </SopButton>
          )}
          {fromTemplate.data && fromTemplate.data.filled === 0 && (
            <span className="text-[12.5px] text-warning">No [Company Name] in the template</span>
          )}
          <SopError error={fromTemplate.error ?? undo.error} />
        </div>
      )}
      <ScriptEditor
        key={editorKey}
        title="Dialing script"
        subtitle={`${clientName}'s full script. Setters open this from the lead cockpit.`}
        html={scriptQuery.data?.html}
        isLoading={scriptQuery.isLoading}
        isError={scriptQuery.isError}
        save={(html) => saveMutation.mutateAsync({ tenantId, html })}
      />
    </div>
  );
}
