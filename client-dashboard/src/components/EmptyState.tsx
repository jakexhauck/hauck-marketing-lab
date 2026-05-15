interface Props {
  message: string;
}

export default function EmptyState({ message }: Props) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <p className="text-center text-sm text-slate-500">{message}</p>
    </div>
  );
}
