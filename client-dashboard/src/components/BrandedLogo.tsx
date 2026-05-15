import { useClient } from "../context/ClientContext";
import clsx from "clsx";

interface Props {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: "h-8 w-8 text-sm",
  md: "h-12 w-12 text-lg",
  lg: "h-20 w-20 text-2xl",
};

export default function BrandedLogo({ size = "md", className }: Props) {
  const { client } = useClient();
  return (
    <div
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-2xl font-bold text-white shadow-sm",
        sizes[size],
        className
      )}
      style={{ backgroundColor: "var(--brand-primary)" }}
      aria-label={client.brand.appName}
    >
      {client.brand.logoUrl ? (
        <img src={client.brand.logoUrl} alt={client.brand.appName} className="h-full w-full rounded-2xl object-cover" />
      ) : (
        <span>{client.brand.initials}</span>
      )}
    </div>
  );
}
