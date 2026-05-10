import { useEffect, useState } from "react";
import { api } from "../lib/tauri";

type Props = {
  initialError: string | null;
  onPicked: (path: string) => void;
};

export function FolderPicker({ initialError, onPicked }: Props) {
  const [candidate, setCandidate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);

  useEffect(() => {
    api.suggestFolderCandidates().then((cands) => {
      if (cands.length > 0) setCandidate(cands[0]);
    });
  }, []);

  const pick = async () => {
    try {
      const picked = await api.pickFolder();
      if (picked) {
        onPicked(picked);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const accept = () => {
    if (candidate) onPicked(candidate);
  };

  return (
    <div className="picker-shell">
      <div className="picker">
        <div className="picker-eye">▸ FIRST LAUNCH · FOLDER SELECT</div>
        <h1>Point me at your media-buying folder, Sir.</h1>
        <p>
          The folder is the source of truth — agents, skills, knowledge chunks, and chats all live
          inside it. I'll read from it and write new conversations back to <code>chats/</code>.
        </p>

        {candidate ? (
          <>
            <div className="picker-path">{candidate}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="action primary" onClick={accept}>
                Use this folder
              </button>
              <button className="action" onClick={pick}>
                Choose a different folder…
              </button>
            </div>
          </>
        ) : (
          <button className="action primary" onClick={pick}>
            Choose folder…
          </button>
        )}

        {error && <div className="picker-err">{error}</div>}
      </div>
    </div>
  );
}
