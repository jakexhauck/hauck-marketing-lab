// Thin strip shown only in the shared-password sub-account, which is Made
// Better Landscaping Co's real account (it was the test account until
// 2026-08-09). It sits above the navy hero and carries the top safe-area inset
// in that mode. The component name is legacy; the session mode is still "test".
export default function TestBanner() {
  return (
    <div
      className="bg-[var(--brand-primary)] px-4 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-white"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 6px)" }}
    >
      Made Better Landscaping Co
    </div>
  );
}
