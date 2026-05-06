import { useAuthStore } from '@/store/auth.store';
import { UserRole } from '@aks/shared';

describe('auth.store', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, accessToken: null });
  });

  it('starts with null user and token', () => {
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('setAuth sets user and accessToken', () => {
    const user: any = { id: 'u1', name: 'A', phone: '999', role: UserRole.CUSTOMER };
    useAuthStore.getState().setAuth(user, 'tkn');
    expect(useAuthStore.getState().user).toEqual(user);
    expect(useAuthStore.getState().accessToken).toBe('tkn');
  });

  it('clearAuth resets to null', () => {
    const user: any = { id: 'u1', name: 'A', phone: '999', role: UserRole.CUSTOMER };
    useAuthStore.getState().setAuth(user, 'tkn');
    useAuthStore.getState().clearAuth();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
