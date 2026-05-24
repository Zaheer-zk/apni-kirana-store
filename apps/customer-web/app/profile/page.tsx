'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CalendarDays,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Receipt,
  User as UserIcon,
} from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent } from '@aks/ui/components/card';
import { Input } from '@aks/ui/components/input';
import { Label } from '@aks/ui/components/label';
import { Separator } from '@aks/ui/components/separator';
import { toast } from '@aks/ui/components/sonner';
import { Avatar, AvatarFallback } from '@aks/ui/components/avatar';
import { AppHeader } from '@/components/AppHeader';
import { ErrorPanel, PageLoader } from '@/components/StatePanels';
import { api, unwrap } from '@/lib/api';
import { clearSession, setStoredUser, type StoredUser } from '@/lib/auth';
import { useUser } from '@/lib/use-user';

interface UserMe {
  id: string;
  name: string | null;
  phone: string;
  // The backend currently ignores `email` on update (column doesn't exist on
  // the User model — see backend/src/routes/users.routes.ts). We render the
  // field as read-only when missing and surface a hint that it's coming.
  email?: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  defaultAddress?: {
    id: string;
    label: string;
    street: string;
    city: string;
    pincode: string;
  } | null;
}

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z
    .string()
    .email('Enter a valid email')
    .max(120)
    .optional()
    .or(z.literal('')),
});

type ProfileFormInput = z.infer<typeof profileSchema>;

export default function ProfilePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user: stored, mounted } = useUser({ redirectTo: '/profile' });

  const meQuery = useQuery({
    queryKey: ['users-me'],
    queryFn: async () => {
      const res = await api.get('/api/v1/users/me');
      return unwrap<UserMe>(res.data);
    },
    enabled: !!stored,
  });

  const [editing, setEditing] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileFormInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: '', email: '' },
  });

  useEffect(() => {
    if (meQuery.data) {
      reset({ name: meQuery.data.name ?? '', email: meQuery.data.email ?? '' });
    }
  }, [meQuery.data, reset]);

  const updateMutation = useMutation({
    mutationFn: async (input: ProfileFormInput) => {
      const payload: { name?: string; email?: string } = { name: input.name };
      if (input.email) payload.email = input.email;
      const res = await api.put('/api/v1/users/me', payload);
      return unwrap<UserMe>(res.data);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['users-me'], data);
      queryClient.invalidateQueries({ queryKey: ['users-me'] });
      // Keep localStorage in sync so AppHeader / login state shows the new
      // name without a hard refresh.
      if (stored) {
        const next: StoredUser = {
          ...stored,
          name: data.name ?? stored.name,
          email: data.email ?? stored.email,
        };
        setStoredUser(next);
      }
      toast.success('Profile updated');
      setEditing(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not update profile'),
  });

  function handleSignOut() {
    if (!confirm('Sign out of your account?')) return;
    clearSession();
    queryClient.clear();
    router.replace('/');
  }

  if (!mounted || !stored) {
    return (
      <>
        <AppHeader showSearch={false} />
        <main className="page-shell py-10">
          <PageLoader />
        </main>
      </>
    );
  }

  if (meQuery.isLoading) {
    return (
      <>
        <AppHeader showSearch={false} />
        <main className="page-shell py-10">
          <PageLoader />
        </main>
      </>
    );
  }

  if (meQuery.isError || !meQuery.data) {
    return (
      <>
        <AppHeader showSearch={false} />
        <main className="page-shell py-10">
          <ErrorPanel
            message={
              meQuery.error instanceof Error ? meQuery.error.message : 'Could not load your profile.'
            }
            onRetry={() => meQuery.refetch()}
          />
        </main>
      </>
    );
  }

  const me = meQuery.data;
  const memberSince = new Date(me.createdAt).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <AppHeader showSearch={false} />
      <main className="page-shell py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My account</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your profile, addresses, and orders.</p>
        </header>

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <section className="space-y-5">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <Avatar className="h-14 w-14">
                    <AvatarFallback className="text-lg font-bold">
                      {initials(me.name ?? me.phone)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-gray-900">
                      {me.name ?? 'Add your name'}
                    </p>
                    <p className="text-sm text-gray-500">
                      <Phone className="mr-1 inline h-3 w-3" />
                      +91 {me.phone}
                    </p>
                    <p className="text-xs text-gray-500">
                      <CalendarDays className="mr-1 inline h-3 w-3" />
                      Member since {memberSince}
                    </p>
                  </div>
                </div>

                <Separator className="my-5" />

                {editing ? (
                  <form
                    onSubmit={handleSubmit((v) => updateMutation.mutateAsync(v))}
                    className="space-y-4"
                  >
                    <Field label="Full name" htmlFor="name" error={errors.name?.message}>
                      <Input id="name" autoFocus {...register('name')} />
                    </Field>
                    <Field
                      label="Email (optional)"
                      htmlFor="email"
                      error={errors.email?.message}
                      hint="We currently don't send verification emails — this is stored for future updates."
                    >
                      <Input
                        id="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        {...register('email')}
                      />
                    </Field>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          reset({ name: me.name ?? '', email: me.email ?? '' });
                          setEditing(false);
                        }}
                        disabled={updateMutation.isPending}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" loading={updateMutation.isPending}>
                        Save changes
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-3">
                    <InfoRow icon={<UserIcon className="h-4 w-4" />} label="Name" value={me.name ?? '—'} />
                    <InfoRow
                      icon={<Mail className="h-4 w-4" />}
                      label="Email"
                      value={me.email ?? 'Not set'}
                    />
                    <InfoRow
                      icon={<Phone className="h-4 w-4" />}
                      label="Phone"
                      value={`+91 ${me.phone}`}
                      hint="Phone is used to sign in and can't be changed here."
                    />
                    <div className="pt-2">
                      <Button variant="outline" onClick={() => setEditing(true)}>
                        Edit profile
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <h2 className="mb-3 text-base font-semibold text-gray-900">Quick actions</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ActionLink
                    href="/orders"
                    icon={<Receipt className="h-4 w-4" />}
                    title="My orders"
                    subtitle="Track active orders and reorder"
                  />
                  <ActionLink
                    href="/addresses"
                    icon={<MapPin className="h-4 w-4" />}
                    title="Saved addresses"
                    subtitle="Manage where we deliver"
                  />
                  <ActionLink
                    href="/change-password"
                    icon={<KeyRound className="h-4 w-4" />}
                    title="Change password"
                    subtitle="Pick a new password"
                  />
                  <ActionLink
                    href="/cart"
                    icon={<Receipt className="h-4 w-4" />}
                    title="Cart"
                    subtitle="See what's queued up"
                  />
                </div>
              </CardContent>
            </Card>
          </section>

          <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
            {me.defaultAddress ? (
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    Default address
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {me.defaultAddress.label}
                  </p>
                  <p className="text-sm text-gray-600">
                    {me.defaultAddress.street}, {me.defaultAddress.city} {me.defaultAddress.pincode}
                  </p>
                  <Button variant="outline" size="sm" asChild className="mt-3 w-full">
                    <Link href="/addresses">Manage addresses</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm font-semibold text-gray-900">No default address</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Save an address to make checkout faster.
                  </p>
                  <Button asChild className="mt-3 w-full">
                    <Link href="/addresses">Add an address</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            <Button
              variant="outline"
              className="w-full border-destructive text-destructive hover:bg-red-50 hover:text-destructive"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </aside>
        </div>
      </main>
    </>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-600">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
        <p className="truncate text-sm text-gray-900">{value}</p>
        {hint ? <p className="text-[11px] text-gray-500">{hint}</p> : null}
      </div>
    </div>
  );
}

function ActionLink({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 transition hover:border-primary-200 hover:bg-primary-50/40"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-primary-700">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 group-hover:text-primary">{title}</p>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
    </Link>
  );
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

// Avoid the `Loader2` unused warning when we add/remove loading paths.
void Loader2;
