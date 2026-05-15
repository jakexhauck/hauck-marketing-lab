import Shell from "../components/Shell";

export default function Dashboard() {
  return (
    <Shell>
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-slate-900">Hauck Dashboard</h1>
      </header>
      <main className="flex-1 p-4">
        <p className="text-sm text-slate-600">
          Placeholder. Lead list arrives in Section 04.
        </p>
      </main>
    </Shell>
  );
}
