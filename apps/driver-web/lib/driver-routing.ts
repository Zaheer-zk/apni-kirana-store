import { api } from './api';

export type DriverDestination = '/' | '/pending' | '/register';

/**
 * Decides where an authenticated driver lands after login / OTP verify.
 *
 * The auth response no longer carries the driver entity, so we probe
 * `GET /drivers/stats/today` (DRIVER-only, returns the driver's `status`):
 *  - 404 / no driver profile → the account exists but the vehicle/licence
 *    step hasn't been done → send to `/register` to complete it.
 *  - status PENDING_APPROVAL → `/pending`.
 *  - approved (OFFLINE / ONLINE / anything else) → the dashboard.
 *
 * Mirrors `apps/driver/lib/driver-routing.ts` from the Expo app — the web
 * surface should make the same routing decision.
 */
export async function resolveDriverDestination(): Promise<DriverDestination> {
  try {
    const res = await api.get<{
      success: boolean;
      data?: { status?: string };
    }>('/api/v1/drivers/stats/today');
    const status = res.data?.data?.status;
    if (status === 'PENDING_APPROVAL') return '/pending';
    return '/';
  } catch {
    // 404 (no driver profile yet) or a transient failure — route to the
    // vehicle/licence registration step so the driver can finish signing up.
    return '/register';
  }
}
