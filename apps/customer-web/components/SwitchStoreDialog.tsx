'use client';

import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@aks/ui/components/dialog';
import { Button } from '@aks/ui/components/button';

interface SwitchStoreDialogProps {
  open: boolean;
  /** Current store name (will be cleared). */
  currentStore: string | null;
  /** Store the user is trying to add an item from. */
  newStore: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation dialog shown when a customer tries to add an item from a
 * different store than the one already in their cart. Mirrors Swiggy
 * Instamart / Zepto's UX — explicit, single-tap clear.
 */
export function SwitchStoreDialog({
  open,
  currentStore,
  newStore,
  onCancel,
  onConfirm,
}: SwitchStoreDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onCancel() : null)}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <DialogTitle>Switch to {newStore ?? 'this store'}?</DialogTitle>
              <DialogDescription>
                Your current cart from{' '}
                <span className="font-semibold text-gray-700">{currentStore ?? 'another store'}</span>{' '}
                will be cleared. You can only order from one store at a time.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Keep current cart
          </Button>
          <Button variant="default" onClick={onConfirm}>
            Switch &amp; add item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
