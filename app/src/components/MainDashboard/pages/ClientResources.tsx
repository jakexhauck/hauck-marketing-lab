interface Props {
  clientName: string;
  onBack: () => void;
}

export function ClientResources({ clientName, onBack }: Props) {
  return (
    <div className="md-placeholder">
      <button type="button" className="md-back" onClick={onBack}>
        ◂ Back to dashboard
      </button>
      <div>
        <span className="md-tag">▸ NOT WIRED</span>
        {clientName} · Resources
      </div>
    </div>
  );
}
