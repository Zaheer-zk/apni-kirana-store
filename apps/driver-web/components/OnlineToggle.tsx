'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Power } from 'lucide-react';
import { Badge } from '@aks/ui/components/badge';
import { Skeleton } from '@aks/ui/components/skeleton';
import { toast } from '@aks/ui/components/sonner';
import { cn } from '@aks/ui/lib/utils';
import { api } from '@/lib/api';

interface DriverStatusResp {
  status?: string;
}

/**
 * Online/offline toggle for the driver dashboard. Calls the same backend
 * endpoint as the Expo app (`PUT /drivers/status`) but skips GPS payload —
 * the web app explicitly doesn't track location (see `docs/driver-web.md`).
 *
 * Showing the toggle on the web is intentional: a driver checking the
 * dashboard between shifts can flip themselves offline so the matching
 * engine stops considering them.
 */
export function OnlineToggle() {
  const queryClient = useQueryClient();

  const statusQuery = useQuery<DriverStatusResp>({
    queryKey: ['driverStatus'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: DriverStatusResp }>(
        '/api/v1/drivers/stats/today',
      );
      return res.data?.data ?? {};
    },
    refetchInterval: 60_000,
  });

  const isOnline = statusQuery.data?.status === 'ONLINE';

  const toggleMutation = useMutation({
    mutationFn: async (next: boolean) => {
      const r = await api.put<{ success: boolean; data: DriverStatusResp }>(
        '/api/v1/drivers/status',
        { status: next ? 'ONLINE' : 'OFFLINE' },
      );
      return r.data?.data;
    },
    onSuccess: (_data, next) => {
      toast.success(next ? 'You are online' : 'You are offline');
      queryClient.invalidateQueries({ queryKey: ['driverStatus'] });
      queryClient.invalidateQueries({ queryKey: ['driverTodayStats'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Could not change status');
    },
  });

  if (statusQuery.isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 rounded-2xl border p-4 shadow-sm sm:p-5',
        isOnline ? 'border-primary-200 bg-primary-50' : 'border-gray-200 bg-white',
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full',
            isOnline ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500',
          )}
        >
          <Power className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900">
            {isOnline ? 'You are online' : "You're offline"}
          </p>
          <p className="text-xs text-gray-500">
            {isOnline
              ? 'You can receive incoming delivery requests on your mobile app.'
              : 'Go online to start receiving delivery requests.'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant={isOnline ? 'success' : 'default'} className="hidden sm:inline-flex">
          {isOnline ? 'ONLINE' : 'OFFLINE'}
        </Badge>
        <button
          type="button"
          role="switch"
          aria-checked={isOnline}
          disabled={toggleMutation.isPending}
          onClick={() => toggleMutation.mutate(!isOnline)}
          className={cn(
            'relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-60',
            isOnline ? 'bg-primary' : 'bg-gray-300',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition',
              isOnline ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </button>
      </div>
    </div>
  );
}
