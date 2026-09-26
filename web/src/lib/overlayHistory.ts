/**
 * Lets the Android hardware Back button close the topmost overlay.
 *
 * Overlays here are not routed — they are local `useState` in `ChatDetail` — so
 * opening one has to plant a history entry of its own. Without that, Back walks
 * the hash router (or leaves the site) with a sheet still on screen.
 *
 * The bookkeeping is deliberately not paired with the effect lifecycle. React 18
 * StrictMode runs setup → cleanup → setup synchronously inside one commit, so a
 * push-in-setup / pop-in-cleanup pair would push, pop and push again and leave
 * `history` off by an entry. Instead:
 *
 *   - `retain` / `release` are idempotent edits to a set, not imperative
 *     push/pop calls, so their order and repetition do not matter; and
 *   - reconciliation is *coalesced* into a single microtask, which the
 *     synchronous StrictMode triple-invocation collapses to one no-op-net pass.
 *
 * Coalescing is what makes this safe. Scheduling a microtask per call would let
 * each of the three StrictMode invocations reconcile separately, and because
 * `history.back()` is asynchronous the resulting traversal would land on the
 * wrong entry.
 */

/** Overlay id -> its close callback, in open order. Only the last is Back's target. */
const held = new Map<string, () => void>();

/** History entries this module has pushed and not yet popped. */
let owned = 0;

/**
 * `popstate` events we caused ourselves by calling `history.back()`. They must
 * not be read as the user pressing Back, or closing one sheet would also close
 * the sheet underneath it.
 */
let pendingSelfPops = 0;

/** `pushState` throws on an opaque origin (sandboxed iframe, file://). */
let canUseHistory = true;

let scheduled = false;

function pushEntry(): boolean {
  if (!canUseHistory) return false;
  try {
    // The current URL on purpose: `pushState` never fires `hashchange`, so the
    // router in App.tsx never re-parses and a deep link survives untouched.
    window.history.pushState({ __overlayEntry: true }, '', window.location.href);
    return true;
  } catch {
    // Degrade to "Back does not close overlays" rather than throwing on open.
    canUseHistory = false;
    return false;
  }
}

function reconcile() {
  if (!canUseHistory) return;

  while (owned < held.size) {
    if (!pushEntry()) return;
    owned += 1;
  }

  // `owned` is decremented before the traversal completes. A `popstate` that
  // arrives while another reconcile is mid-flight can therefore leave a stale
  // forward entry behind, which is harmless: the invariant that matters is that
  // one Back closes exactly one overlay and never escapes the page.
  while (owned > held.size && owned > 0) {
    owned -= 1;
    pendingSelfPops += 1;
    window.history.back();
  }
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    reconcile();
  });
}

function onPopState() {
  if (pendingSelfPops > 0) {
    pendingSelfPops -= 1;
    return;
  }

  // The user pressed Back, so that entry is gone; drop our count with it.
  if (owned > 0) owned -= 1;

  // Close the topmost overlay. Its unmount calls `release`, which reconciles
  // against the already-decremented `owned` and finds nothing left to pop.
  const top = [...held.entries()].pop();
  if (top) top[1]();
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', onPopState);
}

/**
 * Claims a history entry for `id` while it is open. Idempotent: calling it twice
 * for the same id is a no-op, which is what makes it survive StrictMode.
 */
export function retain(id: string, onClose: () => void): void {
  held.set(id, onClose);
  schedule();
}

/** Gives up `id`'s history entry. Idempotent, and a no-op for an unknown id. */
export function release(id: string): void {
  if (!held.delete(id)) return;
  schedule();
}
