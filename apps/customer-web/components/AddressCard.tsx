'use client';

import { Briefcase, Check, Home, MapPin, Pencil, Star, Trash2 } from 'lucide-react';
import { Badge } from '@aks/ui/components/badge';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent } from '@aks/ui/components/card';
import { cn } from '@aks/ui/lib/utils';
import { formatAddressLine, type SavedAddress } from '@/lib/addresses';

/**
 * Per-address row used on the addresses page AND inside the checkout's
 * address picker. In picker mode (`selectable`), the whole card becomes
 * a radio-like target and we hide the edit/delete actions.
 */
interface AddressCardProps {
  address: SavedAddress;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onSetDefault?: () => void;
  disabled?: boolean;
}

export function AddressCard({
  address,
  selectable = false,
  selected = false,
  onSelect,
  onEdit,
  onDelete,
  onSetDefault,
  disabled = false,
}: AddressCardProps) {
  const Icon = iconForLabel(address.label);
  const content = (
    <CardContent className="flex items-start gap-3 p-4">
      <div
        className={cn(
          'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full',
          selected ? 'bg-primary text-primary-foreground' : 'bg-primary-100 text-primary-700',
        )}
        aria-hidden
      >
        {selected ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-gray-900">{address.label}</h3>
          {address.isDefault ? (
            <Badge variant="success" className="text-[10px]">
              Default
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-gray-600">{formatAddressLine(address)}</p>
        <p className="mt-0.5 text-xs text-gray-500">
          <MapPin className="mr-1 inline h-3 w-3" />
          {address.lat.toFixed(4)}, {address.lng.toFixed(4)}
        </p>

        {!selectable ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!address.isDefault && onSetDefault ? (
              <Button
                size="sm"
                variant="outline"
                onClick={onSetDefault}
                disabled={disabled}
                className="h-8"
              >
                <Star className="h-3.5 w-3.5" />
                Set as default
              </Button>
            ) : null}
            {onEdit ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={onEdit}
                disabled={disabled}
                className="h-8"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            ) : null}
            {onDelete ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={onDelete}
                disabled={disabled}
                className="h-8 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </CardContent>
  );

  if (selectable) {
    return (
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        className={cn(
          'w-full rounded-xl border bg-white text-left transition focus:outline-none focus:ring-2 focus:ring-ring',
          selected ? 'border-primary ring-1 ring-primary/30' : 'border-gray-200 hover:border-primary-200',
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <Card
      className={cn(
        'border',
        selected ? 'border-primary ring-1 ring-primary/30' : 'border-gray-200',
      )}
    >
      {content}
    </Card>
  );
}

function iconForLabel(label: string) {
  const lower = label.toLowerCase();
  if (lower.includes('home')) return Home;
  if (lower.includes('work') || lower.includes('office')) return Briefcase;
  return MapPin;
}
