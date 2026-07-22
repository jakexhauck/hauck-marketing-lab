// A deferred-delete queue with an undo window.
//
// The row disappears from the UI immediately, but the destructive write is held
// back for `delayMs`. Inside that window `undo(key)` cancels it outright, so
// there is nothing to un-delete on the server. After the window the commit
// fires for real.
//
// Framework-agnostic on purpose: the caller owns its own list state (restoring
// the row on undo, or on a failed commit) and this only owns the timers. That
// keeps it unit-testable without a DOM.

export interface UndoQueueOptions<T> {
  // How long the user gets to change their mind. Should outlast the toast.
  delayMs?: number;
  // The real destructive write, run once the window closes.
  commit: (item: T) => Promise<void>;
  // Commit threw: the row is already gone from the UI, so hand it back.
  onCommitError?: (item: T, err: unknown) => void;
}

export interface UndoQueue<T> {
  schedule: (key: string, item: T) => void;
  undo: (key: string) => boolean;
  flushAll: () => void;
  pendingCount: () => number;
}

export function createUndoQueue<T>(opts: UndoQueueOptions<T>): UndoQueue<T> {
  const { delayMs = 6500, commit, onCommitError } = opts;
  const pending = new Map<string, { item: T; timer: ReturnType<typeof setTimeout> }>();

  const fire = (key: string) => {
    const entry = pending.get(key);
    if (!entry) return;
    pending.delete(key);
    void (async () => {
      try {
        await commit(entry.item);
      } catch (err) {
        onCommitError?.(entry.item, err);
      }
    })();
  };

  return {
    schedule(key, item) {
      // Re-scheduling the same key restarts its window rather than stacking.
      const existing = pending.get(key);
      if (existing) clearTimeout(existing.timer);
      const timer = setTimeout(() => fire(key), delayMs);
      pending.set(key, { item, timer });
    },

    // True when the delete was still pending, i.e. the undo actually landed.
    undo(key) {
      const entry = pending.get(key);
      if (!entry) return false;
      clearTimeout(entry.timer);
      pending.delete(key);
      return true;
    },

    // Navigating away should not silently cancel a delete the user asked for,
    // so unmount commits everything still in flight straight away.
    flushAll() {
      for (const key of [...pending.keys()]) {
        const entry = pending.get(key);
        if (entry) clearTimeout(entry.timer);
        fire(key);
      }
    },

    pendingCount() {
      return pending.size;
    },
  };
}
