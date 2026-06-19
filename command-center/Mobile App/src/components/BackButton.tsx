import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  to?: string;
  label?: string;
}

export default function BackButton({ to, label = "Back" }: Props) {
  const navigate = useNavigate();
  const handleClick = () => {
    if (to) navigate(to);
    else navigate(-1);
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[var(--text-muted)] transition-colors active:scale-[0.97] active:bg-[var(--surface-2)]"
      style={{ minHeight: "44px", minWidth: "44px" }}
    >
      <ChevronLeft size={18} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
