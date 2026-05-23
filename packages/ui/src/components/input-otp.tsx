'use client';

import * as React from 'react';
import { OTPInput, OTPInputContext } from 'input-otp';
import { Minus } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * Six-box OTP entry component. Wraps the headless `input-otp` library so each
 * slot is a styled box, the focused slot gets the brand ring, and Backspace
 * walks back to the previous slot.
 *
 * Usage:
 *   <InputOTP maxLength={6} value={otp} onChange={setOtp}>
 *     <InputOTPGroup>
 *       {Array.from({ length: 6 }).map((_, i) => (
 *         <InputOTPSlot key={i} index={i} />
 *       ))}
 *     </InputOTPGroup>
 *   </InputOTP>
 */
const InputOTP = React.forwardRef<
  React.ElementRef<typeof OTPInput>,
  React.ComponentPropsWithoutRef<typeof OTPInput>
>(({ className, containerClassName, ...props }, ref) => (
  <OTPInput
    ref={ref}
    containerClassName={cn(
      'flex items-center gap-2 has-[:disabled]:opacity-50',
      containerClassName,
    )}
    className={cn('disabled:cursor-not-allowed', className)}
    {...props}
  />
));
InputOTP.displayName = 'InputOTP';

const InputOTPGroup = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center gap-2', className)} {...props} />
  ),
);
InputOTPGroup.displayName = 'InputOTPGroup';

const InputOTPSlot = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'> & { index: number }
>(({ index, className, ...props }, ref) => {
  const inputOTPContext = React.useContext(OTPInputContext);
  const slot = inputOTPContext.slots[index];
  if (!slot) {
    return null;
  }
  const { char, hasFakeCaret, isActive } = slot;
  return (
    <div
      ref={ref}
      className={cn(
        'relative flex h-12 w-12 items-center justify-center rounded-md border border-gray-300 bg-white text-lg font-semibold text-gray-900 shadow-sm transition-all',
        isActive && 'z-10 border-primary ring-2 ring-primary/40',
        className,
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-px animate-pulse bg-gray-700" />
        </div>
      )}
    </div>
  );
});
InputOTPSlot.displayName = 'InputOTPSlot';

const InputOTPSeparator = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  (props, ref) => (
    <div ref={ref} role="separator" {...props}>
      <Minus className="h-4 w-4 text-gray-400" />
    </div>
  ),
);
InputOTPSeparator.displayName = 'InputOTPSeparator';

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator };
