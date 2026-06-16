import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandPaletteProvider } from "./CommandPalette";

// The cockpit frame: fixed sidebar, slim top bar, scrolling content well.
// CommandPaletteProvider wraps everything inside it (Sidebar's ⌘K button and the
// global shortcut both live here) and sits inside the router so it can navigate.
export function AppShell() {
  return (
    <CommandPaletteProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-bg text-text">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1320px] px-6 py-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </CommandPaletteProvider>
  );
}
