// What goes inside a client's badge: their picture when one is set (0147),
// their initials otherwise. The badge itself (size, shape, colour) stays with
// the caller; the picture inherits its corner radius so it fills the same
// shape the initials sat in.
export default function ClientMark({ picture, initials }: { picture?: string | null; initials: string }) {
  if (picture) {
    return (
      <img
        src={picture}
        alt=""
        className="h-full w-full object-cover"
        style={{ borderRadius: "inherit" }}
        draggable={false}
      />
    );
  }
  return <>{initials}</>;
}
