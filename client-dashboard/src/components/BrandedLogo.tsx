import { useClient } from "../context/ClientContext";
import clsx from "clsx";

interface Props {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: "h-10 w-10 text-[13px]",
  md: "h-12 w-12 text-base",
  lg: "h-16 w-16 text-2xl",
};

export default function BrandedLogo({ size = "md", className }: Props) {
  const { client } = useClient();
  return (
    <div
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-2xl font-display font-black text-white",
        sizes[size],
        className
      )}
      style={{
        backgroundColor: "var(--brand-primary)",
        boxShadow:
          "0 8px 16px -10px rgba(15,23,42,0.45), inset 0 1px 0 rgba(255,255,255,0.18)",
      }}
      aria-label={client.brand.appName}
    >
      {client.brand.logoUrl ? (
        <img
          src={client.brand.logoUrl}
          alt={client.brand.appName}
          className="h-full w-full rounded-2xl object-cover"
        />
      ) : (
        <span className="tracking-tight">{client.brand.initials}</span>
      )}
    </div>
  );
}
