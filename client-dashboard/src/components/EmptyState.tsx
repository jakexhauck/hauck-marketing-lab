import { Inbox } from "lucide-react";

interface Props {
  message: string;
}

export default function EmptyState({ message }: Props) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <Inbox size={32} className="text-slate-300" aria-hidden="true" />
      <div className="label-cap-strong text-slate-500">No Leads</div>
      <p className="max-w-[260px] text-sm text-slate-500">{message}</p>
    </div>
  );
}
