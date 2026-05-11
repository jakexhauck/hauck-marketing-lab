interface Props {
  clientName: string;
  onBack: () => void;
}

export function ClientContract({ clientName, onBack }: Props) {
  return (
    <div className="md-placeholder">
      <button type="button" className="md-back" onClick={onBack}>
        ◂ Back to dashboard
      </button>
      <div>
        <span className="md-tag">▸ NOT WIRED</span>
        {clientName} · Contract
      </div>
    </div>
  );
}
