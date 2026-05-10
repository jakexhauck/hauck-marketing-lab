type Props = {
  agentName: string;
  agentInitial: string;
  onClick: () => void;
};

export function AskDock({ agentName, agentInitial, onClick }: Props) {
  return (
    <div className="ask-dock" title="Open chat drawer" onClick={onClick}>
      <div className="ask-dock-icon">{agentInitial}</div>
      <div className="ask-dock-text">
        <span className="small">DIRECT LINE TO</span>
        <span className="big">{agentName}</span>
      </div>
      <span className="ask-dock-kbd">⌘ K</span>
    </div>
  );
}
