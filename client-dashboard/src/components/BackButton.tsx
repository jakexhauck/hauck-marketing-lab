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
      className="inline-flex items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-700 active:bg-slate-100"
      style={{ minHeight: "44px", minWidth: "44px" }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
      {label}
    </button>
  );
}
