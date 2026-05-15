import { Inbox } from "lucide-react";

interface Props {
  message: string;
}

export default function EmptyState({ message }: Props) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <Inbox size={32} className="text-[var(--text-faint)]" aria-hidden="true" />
      <div className="label-cap-strong text-[var(--text-muted)]">No Leads</div>
      <p className="max-w-[260px] text-sm text-[var(--text-muted)]">{message}</p>
    </div>
  );
}
