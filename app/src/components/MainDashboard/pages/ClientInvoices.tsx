interface Props {
  clientName: string;
  onBack: () => void;
}

export function ClientInvoices({ clientName, onBack }: Props) {
  return (
    <div className="md-placeholder">
      <button type="button" className="md-back" onClick={onBack}>
        ◂ Back to dashboard
      </button>
      <div>
        <span className="md-tag">▸ NOT WIRED</span>
        {clientName} · Invoices
      </div>
    </div>
  );
}
