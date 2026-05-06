import { useDriverStore } from '@/store/driver.store';
import { UserRole, DriverStatus } from '@aks/shared';

describe('driver.store', () => {
  beforeEach(() => {
    useDriverStore.setState({
      user: null,
      driverProfile: null,
      accessToken: null,
      isOnline: false,
      activeOrderId: null,
      incomingOrderId: null,
    });
  });

  it('starts with default state', () => {
    const s = useDriverStore.getState();
    expect(s.user).toBeNull();
    expect(s.accessToken).toBeNull();
    expect(s.isOnline).toBe(false);
  });

  it('setAuth populates token, user, profile', () => {
    const user: any = { id: 'u', name: 'A', phone: '1', role: UserRole.DRIVER };
    const profile: any = {
      userId: 'u',
      vehicleType: 'BIKE',
      vehicleNumber: 'X',
      status: DriverStatus.ACTIVE,
    };
    useDriverStore.getState().setAuth('tkn', user, profile);
    expect(useDriverStore.getState().accessToken).toBe('tkn');
    expect(useDriverStore.getState().user).toEqual(user);
    expect(useDriverStore.getState().driverProfile).toEqual(profile);
  });

  it('setOnline toggles isOnline', () => {
    useDriverStore.getState().setOnline(true);
    expect(useDriverStore.getState().isOnline).toBe(true);
    useDriverStore.getState().setOnline(false);
    expect(useDriverStore.getState().isOnline).toBe(false);
  });

  it('active and incoming order setters', () => {
    useDriverStore.getState().setActiveOrder('a1');
    expect(useDriverStore.getState().activeOrderId).toBe('a1');
    useDriverStore.getState().setIncomingOrder('i1');
    expect(useDriverStore.getState().incomingOrderId).toBe('i1');
  });

  it('clearAuth resets state', () => {
    useDriverStore.getState().setAuth('tkn', {} as any, null);
    useDriverStore.getState().setActiveOrder('a');
    useDriverStore.getState().clearAuth();
    const s = useDriverStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.user).toBeNull();
    expect(s.activeOrderId).toBeNull();
  });
});
