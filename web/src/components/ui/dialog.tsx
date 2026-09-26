import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-[var(--app-z-overlay)] bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /**
   * Hides the built-in close button. Overlay click, Escape, focus trapping and
   * scroll locking are unaffected — the caller must supply its own labelled
   * close control. Never forwarded to the DOM.
   */
  showCloseButton?: boolean;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, showCloseButton = true, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-[var(--app-z-dialog)] grid w-[calc(100vw-2rem)] max-w-[320px] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-ios-alert bg-card/90 p-5 shadow-ios-card backdrop-blur-xl duration-200',
        'max-h-[calc(100vh-var(--app-safe-top)-var(--app-safe-bottom)-2rem)] supports-[height:100dvh]:max-h-[calc(100dvh-var(--app-safe-top)-var(--app-safe-bottom)-2rem)]',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1 data-[state=closed]:slide-out-to-top-1 data-[state=open]:slide-in-from-left-1 data-[state=open]:slide-in-from-top-1',
        'motion-reduce:animate-none motion-reduce:transition-none',
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close
          className="mobile-touch-target absolute flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80 active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
          style={{
            top: 'calc(var(--app-safe-top) + 0.75rem)',
            right: 'calc(var(--app-safe-right) + 0.75rem)',
          }}
        >
          <X className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">关闭</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col space-y-1.5 text-center', className)}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-ios-headline text-foreground', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-ios-footnote text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
