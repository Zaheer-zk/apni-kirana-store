'use client';

import { useState, FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, Copy, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { isSuperAdmin } from '@/lib/auth';
import type { ApiResponse } from '@aks/shared';

export interface ManagedUser {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  username: string | null;
  role: string;
  roles: string[];
  isActive: boolean;
  isSuperAdmin?: boolean;
}

const APP_ROLES = [
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'STORE_OWNER', label: 'Store Owner' },
  { value: 'DRIVER', label: 'Driver' },
];

interface Props {
  mode: 'create' | 'edit';
  user?: ManagedUser;
  onClose: () => void;
}

/** Modal for an admin to create a new account or edit an existing one. */
export default function UserFormModal({ mode, user, onClose }: Props) {
  const queryClient = useQueryClient();

  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('CUSTOMER');
  const [roles, setRoles] = useState<string[]>(
    user?.roles?.length ? user.roles.filter((r) => r !== 'ADMIN') : [],
  );
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === 'create') {
        const { data } = await api.post<ApiResponse<{ tempPassword: string }>>(
          '/api/v1/admin/users',
          { name, phone, email, username, role },
        );
        return data;
      }
      const { data } = await api.put<ApiResponse<unknown>>(`/api/v1/admin/users/${user!.id}`, {
        name,
        phone,
        email,
        isActive,
        // An admin's role set isn't editable via the role checkboxes.
        ...(user!.role === 'ADMIN' ? {} : { roles }),
      });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      if (mode === 'create') {
        const pw = (data?.data as { tempPassword?: string } | undefined)?.tempPassword;
        if (pw) {
          setTempPassword(pw);
          return;
        }
      }
      onClose();
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: ApiResponse<unknown> } })?.response?.data?.error ??
          (err as Error)?.message ??
          'Something went wrong.',
      );
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Name is required.');
    if (!/^\d{10}$/.test(phone)) return setError('Phone must be exactly 10 digits.');
    if (!email.trim()) return setError('Email is required.');
    if (mode === 'create' && username.trim().length < 3) {
      return setError('Username must be at least 3 characters.');
    }
    if (mode === 'edit' && user?.role !== 'ADMIN' && roles.length === 0) {
      return setError('The user must keep at least one role.');
    }
    mutation.mutate();
  }

  function toggleRole(value: string) {
    setRoles((prev) =>
      prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value],
    );
  }

  // Success screen after create — show the temp password once.
  if (tempPassword) {
    return (
      <Shell title="User created" onClose={onClose}>
        <p className="text-sm text-gray-600">
          Share this temporary password with <span className="font-medium">{name}</span>. They
          must change it the first time they log in.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <code className="flex-1 font-mono text-lg tracking-wide text-gray-900">
            {tempPassword}
          </code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(tempPassword);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="btn-secondary px-2.5 py-1.5"
          >
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        <button onClick={onClose} className="btn-primary mt-6 w-full">
          Done
        </button>
      </Shell>
    );
  }

  return (
    <Shell title={mode === 'create' ? 'Add user' : 'Edit user'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Mobile number">
          <input
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="10-digit number"
            required
          />
        </Field>
        <Field label="Email">
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>

        {mode === 'create' ? (
          <>
            <Field label="Username">
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Used for login"
                required
              />
            </Field>
            <Field label="Role">
              <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                {APP_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
                {/* Only the super admin may create other admin accounts. */}
                {isSuperAdmin() && <option value="ADMIN">Admin</option>}
              </select>
            </Field>
          </>
        ) : (
          <>
            {user?.role !== 'ADMIN' && (
              <Field label="Roles">
                <div className="flex flex-wrap gap-3">
                  {APP_ROLES.map((r) => (
                    <label key={r.value} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={roles.includes(r.value)}
                        onChange={() => toggleRole(r.value)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      {r.label}
                    </label>
                  ))}
                </div>
              </Field>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Account is active
            </label>
          </>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1">
            {mutation.isPending ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            ) : mode === 'create' ? (
              'Create user'
            ) : (
              'Save changes'
            )}
          </button>
        </div>
      </form>
    </Shell>
  );
}

function Shell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}
