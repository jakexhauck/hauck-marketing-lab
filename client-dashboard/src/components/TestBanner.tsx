// Thin amber strip shown only in the internal test sub-account. It sits above
// the navy hero and carries the top safe-area inset in that mode.
export default function TestBanner() {
  return (
    <div
      className="bg-amber-500 px-4 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-white"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 6px)" }}
    >
      Test account
    </div>
  );
}
