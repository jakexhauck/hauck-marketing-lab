import { useSyncExternalStore } from "react";

// Which dialing variation the caller is working from, and making it stick.
//
// Jake chose picking over automatic rotation, so the choice is a real piece of
// state with two demands on it: the floating script panel writes it, and
// CallWorkspace reads it three components away, on every outcome pressed. Those
// two are on opposite sides of the tree from each other.
//
// A context provider would mean a provider in ColdCallSection and a prop
// threaded through two components that have no interest in it. localStorage plus
// useSyncExternalStore gets the same result with neither, and buys the thing
// "it sticks" actually means to somebody dialing: it survives a reload, a tab
// close, and going to look at the tracker and coming back.
//
// Per-device on purpose. This is a preference about how somebody is working
// today, not a record of anything; the record is the script_id on each dial,
// written server-side.

const KEY = "hml_cold_call_script";

// useSyncExternalStore compares snapshots by identity, so reading localStorage
// on every call would loop forever on a string it rebuilds each time. Cached,
// and the cache is the only thing that ever changes.
let cached: string | null = null;
let loaded = false;

const listeners = new Set<() => void>();

function read(): string | null {
  if (!loaded) {
    try {
      cached = localStorage.getItem(KEY);
    } catch {
      // Storage unavailable (private mode, blocked). The selection then lasts
      // as long as the page, which is worse but not broken.
      cached = null;
    }
    loaded = true;
  }
  return cached;
}

function emit() {
  for (const listener of listeners) listener();
}

export function setSelectedScriptId(id: string | null): void {
  if (read() === id) return;
  cached = id;
  loaded = true;
  try {
    if (id === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, id);
  } catch {
    // Kept in memory regardless, so the current session still behaves.
  }
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab of the same console changing the selection should not leave
  // this one recording dials against a script the caller thinks they left.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    loaded = false;
    emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

// The server has no opinion during SSR and there is none here either.
function serverSnapshot(): string | null {
  return null;
}

export function useSelectedScriptId(): string | null {
  return useSyncExternalStore(subscribe, read, serverSnapshot);
}

// What to record on a dial, given what is selected and what still exists.
//
// Two jobs. It drops a selection naming a script that has been archived or
// deleted, so a stale localStorage value cannot outlive the thing it points at.
// And when nothing is selected it falls back to the first variation, which is
// what makes "tracked every single time" true rather than aspirational: a caller
// who never opens the panel still attributes their dials.
//
// Returns null only when there are no scripts at all, which is honest: there is
// nothing to attribute a dial to yet.
export function resolveScriptId(
  selected: string | null,
  scripts: { id: string }[],
): string | null {
  if (scripts.length === 0) return null;
  if (selected && scripts.some((s) => s.id === selected)) return selected;
  return scripts[0].id;
}

// Test seam. Nothing in the app calls this; it exists so a test can start from a
// known state without reaching into module internals.
export function resetSelectedScriptForTests(): void {
  cached = null;
  loaded = false;
  listeners.clear();
}
