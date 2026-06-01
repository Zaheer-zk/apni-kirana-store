'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Skeleton } from '@aks/ui/components/skeleton';
import { toast } from '@aks/ui/components/sonner';
import { cn } from '@aks/ui/lib/utils';
import { api } from '@/lib/api';
import { useOnlineLocation } from '@/lib/use-online-location';

interface DriverStatusResp {
  status?: string;
}

const STATUS_LABEL: Record<string, string> = {
  ONLINE: 'Available for deliveries',
  OFFLINE: 'Not accepting deliveries',
  PENDING_APPROVAL: 'Awaiting approval',
  SUSPENDED: 'Account suspended',
};

/**
 * Compact online/offline pill shown in the top app bar.
 *
 * Visually mirrors the hero `OnlineToggle` (green dot when ONLINE, grey
 * otherwise) but takes far less space so it can live next to the avatar.
 * Hidden on the smallest screens — the burger menu surfaces the full hero
 * toggle through the dashboard.
 *
 * Refetches the driver's current status on mount so an admin-side status
 * change (suspend / re-approve) is reflected as soon as the driver navigates.
 */
export function HeaderOnlineToggle() {
  const queryClient = useQueryClient();

  const statusQuery = useQuery<DriverStatusResp>({
    queryKey: ['driverStatus'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: DriverStatusResp }>(
        '/api/v1/drivers/stats/today',
      );
      return res.data?.data ?? {};
    },
    // Re-fetch on mount so navigation between pages picks up admin-side
    // status changes (suspend / re-approve) without a manual reload.
    refetchOnMount: 'always',
    refetchInterval: 60_000,
  });

  const status = statusQuery.data?.status ?? 'OFFLINE';
  const isOnline = status === 'ONLINE';
  const isLocked = status === 'PENDING_APPROVAL' || status === 'SUSPENDED';

  // Push GPS while online so the matching engine can find this driver.
  useOnlineLocation(isOnline);

  const toggleMutation = useMutation({
    mutationFn: async (next: boolean) => {
      const r = await api.put<{ success: boolean; data: DriverStatusResp }>(
        '/api/v1/drivers/status',
        { status: next ? 'ONLINE' : 'OFFLINE' },
      );
      return r.data?.data;
    },
    onSuccess: (_data, next) => {
      toast.success(next ? "You're online" : "You're offline");
      queryClient.invalidateQueries({ queryKey: ['driverStatus'] });
      queryClient.invalidateQueries({ queryKey: ['driverTodayStats'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Could not change status');
    },
  });

  if (statusQuery.isLoading) {
    return <Skeleton className="hidden h-9 w-44 rounded-full sm:block" />;
  }

  const label = STATUS_LABEL[status] ?? STATUS_LABEL.OFFLINE;
  const lockedTitle =
    status === 'PENDING_APPROVAL'
      ? 'Your account is awaiting admin approval.'
      : status === 'SUSPENDED'
        ? 'Your account is suspended. Contact support.'
        : undefined;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOnline}
      aria-label={`You are ${isOnline ? 'online' : 'offline'}. ${
        isLocked ? lockedTitle : 'Click to toggle.'
      }`}
      title={lockedTitle}
      disabled={toggleMutation.isPending || isLocked}
      onClick={() => !isLocked && toggleMutation.mutate(!isOnline)}
      className={cn(
        'hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors sm:inline-flex',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        isOnline
          ? 'border-primary-200 bg-primary-50 text-primary hover:bg-primary-100'
          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
        isLocked && 'cursor-not-allowed opacity-60',
        toggleMutation.isPending && 'cursor-wait',
      )}
    >
      <span className="relative flex h-2.5 w-2.5">
        {isOnline ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
        ) : null}
        <span
          className={cn(
            'relative inline-flex h-2.5 w-2.5 rounded-full',
            isOnline ? 'bg-primary' : isLocked ? 'bg-amber-500' : 'bg-gray-400',
          )}
        />
      </span>
      <span className="hidden md:inline">{label}</span>
      <span className="md:hidden">{isOnline ? 'Online' : isLocked ? 'Locked' : 'Offline'}</span>
      {toggleMutation.isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      ) : null}
    </button>
  );
}
