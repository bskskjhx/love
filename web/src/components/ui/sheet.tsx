import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { prefersReducedMotion } from '@/utils';

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      'fixed inset-0 z-[var(--app-z-overlay)] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none',
      className
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  'fixed z-[var(--app-z-dialog)] gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:animate-none motion-reduce:transition-none',
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        // A bottom sheet must never exceed the live viewport, toolbars and
        // safe areas included, or its last row ends up under the home indicator.
        bottom:
          'inset-x-0 bottom-0 border-t max-h-[calc(100vh-var(--app-safe-top))] supports-[height:100dvh]:max-h-[calc(100dvh-var(--app-safe-top))] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        left: 'inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
        right:
          'inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm',
      },
    },
    defaultVariants: {
      side: 'right',
    },
  }
);

/** Travel past which releasing dismisses instead of springing back. */
const DISMISS_MIN_PX = 80;
/** Fraction of the sheet's own height that also counts as far enough. */
const DISMISS_FRACTION = 0.3;
/** Sideways drift past which the gesture is handed back to the browser. */
const HORIZONTAL_SLOP_PX = 30;
/** Matches the `translate` transition below; the exit runs on the same clock. */
const SETTLE_MS = 150;

interface GrabberHandlers {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
}

/**
 * Drag-to-dismiss for the strip at the top of a bottom sheet.
 *
 * The gesture is deliberately bound to the grabber rather than the whole sheet:
 * the grabber cannot scroll, holds no slider and holds no text, so there is no
 * scroll-position check, no `touch-action` negotiation and no way to steal a
 * text selection or a slider drag. That is the whole reason it is a strip.
 *
 * The travel is published as the CSS `translate` property, never `transform`.
 * `tailwindcss-animate` drives the open and close slides through `transform`, and
 * the two properties compose rather than overwrite, so a drag can never fight the
 * library's animation over the same property.
 */
function useSheetDrag(enabled: boolean, onDismiss: (() => void) | undefined) {
  const [offset, setOffset] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  /** Mirrors `offset` so the release handler never reads a stale render. */
  const offsetRef = React.useRef(0);
  const gesture = React.useRef({ pointerId: -1, startX: 0, startY: 0, abandoned: false });
  const exitTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const onDismissRef = React.useRef(onDismiss);
  onDismissRef.current = onDismiss;

  React.useEffect(() => () => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
  }, []);

  const setOffsetBoth = (next: number) => {
    offsetRef.current = next;
    setOffset(next);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Touch and pen only: a mouse drag is not an affordance anyone asks a sheet
    // for, and on a pointer device the grabber is hidden anyway.
    if (!enabled || e.pointerType === 'mouse') return;
    gesture.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, abandoned: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // A synthetic pointer (a test, or one the browser has stopped tracking)
      // has no capture to take. The handlers work without it, so this is not
      // worth failing the gesture over.
    }
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (g.pointerId !== e.pointerId || g.abandoned) return;

    const dy = e.clientY - g.startY;
    const dx = e.clientX - g.startX;

    // A mostly-sideways gesture is not a dismiss. Give it back rather than
    // silently swallowing it.
    if (Math.abs(dx) > HORIZONTAL_SLOP_PX && Math.abs(dx) > Math.abs(dy)) {
      g.abandoned = true;
      setDragging(false);
      setOffsetBoth(0);
      return;
    }

    // Upward travel is not a dismiss; the sheet rests at 0 rather than inverting.
    setOffsetBoth(Math.max(0, dy));
  };

  const settle = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (g.pointerId !== e.pointerId) return;
    g.pointerId = -1;
    setDragging(false);

    if (g.abandoned) return;

    // The grabber is a direct child of the sheet, so this is the sheet's height.
    const sheetHeight = e.currentTarget.parentElement?.offsetHeight || 0;
    const threshold = Math.max(DISMISS_MIN_PX, sheetHeight * DISMISS_FRACTION);

    if (offsetRef.current >= threshold) {
      // Carry the sheet the rest of the way off-screen *before* asking to close.
      // The consumers unmount this sheet rather than letting Radix animate it
      // out — `{open && <Sheet/>}`, with no exit-animation window — so a bare
      // dismiss would make it vanish from under the finger.
      setOffsetBoth(Math.max(sheetHeight, offsetRef.current + DISMISS_MIN_PX));
      const wait = prefersReducedMotion() ? 0 : SETTLE_MS;
      exitTimer.current = setTimeout(() => {
        exitTimer.current = null;
        onDismissRef.current?.();
      }, wait);
      return;
    }
    setOffsetBoth(0);
  };

  const handlers: GrabberHandlers = enabled
    ? {
        onPointerDown,
        onPointerMove,
        onPointerUp: settle,
        onPointerCancel: settle,
      }
    : ({} as GrabberHandlers);

  return { offset, dragging, handlers };
}

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /**
   * Hides the built-in close button. Overlay click, Escape, focus trapping and
   * scroll locking are unaffected — the caller must supply its own labelled
   * close control. Never forwarded to the DOM.
   */
  showCloseButton?: boolean;
  /**
   * Adds the drag-to-dismiss grabber. Defaults to on for `side="bottom"`; pass
   * `false` to opt a bottom sheet out, or omit `onDismiss` to disable it.
   */
  dragHandle?: boolean;
  /**
   * Called when the grabber is dragged far enough to dismiss. Required for the
   * drag to be armed: the root's open state lives with the caller, so a sheet
   * cannot close itself.
   */
  onDismiss?: () => void;
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = 'right', className, children, showCloseButton = true, dragHandle, onDismiss, style, ...props }, ref) => {
  const dismissible = (dragHandle ?? side === 'bottom') && !!onDismiss;
  const { offset, dragging, handlers } = useSheetDrag(dismissible, onDismiss);

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={ref}
        className={cn(sheetVariants({ side }), className)}
        style={{
          ...style,
          // `translate` rather than `transform` — see useSheetDrag.
          translate: offset ? `0 ${offset}px` : undefined,
          // Inline so it beats the variant's own `transition`, which does not
          // name `translate` and would leave the sheet snapping instantly.
          transition: dragging || prefersReducedMotion() ? 'none' : `translate ${SETTLE_MS}ms ease-out`,
        }}
        {...props}
      >
        {dismissible && (
          <div className="sheet-grabber" data-sheet-grabber {...handlers}>
            <span className="h-1 w-9 rounded-full bg-muted-foreground/40" aria-hidden="true" />
          </div>
        )}
        {children}
        {showCloseButton && (
          // Portal content sits outside the app shell, so it consumes its own
          // safe insets instead of inheriting the shell's padding.
          <SheetPrimitive.Close
            className="mobile-touch-target absolute flex h-9 w-9 items-center justify-center rounded-full opacity-70 ring-offset-background transition-colors hover:bg-accent hover:opacity-100 active:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none"
            style={{
              top: 'calc(var(--app-safe-top) + 0.5rem)',
              right: 'calc(var(--app-safe-right) + 0.5rem)',
            }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">关闭</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
});
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col space-y-2 text-center sm:text-left',
      className
    )}
    {...props}
  />
);
SheetHeader.displayName = 'SheetHeader';

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      className
    )}
    {...props}
  />
);
SheetFooter.displayName = 'SheetFooter';

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold text-foreground', className)}
    {...props}
  />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
