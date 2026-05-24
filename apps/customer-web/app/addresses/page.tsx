'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MapPin, Plus } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { toast } from '@aks/ui/components/sonner';
import { AppHeader } from '@/components/AppHeader';
import { AddressCard } from '@/components/AddressCard';
import { AddressFormDialog } from '@/components/AddressFormDialog';
import { EmptyPanel, ErrorPanel, PageLoader } from '@/components/StatePanels';
import {
  createAddress,
  deleteAddress,
  fetchAddresses,
  setDefaultAddress,
  updateAddress,
  type AddressFormInput,
  type SavedAddress,
} from '@/lib/addresses';
import { useUser } from '@/lib/use-user';

export default function AddressesPage() {
  const { user, mounted } = useUser({ redirectTo: '/addresses' });
  const queryClient = useQueryClient();

  const addressesQuery = useQuery({
    queryKey: ['addresses'],
    queryFn: fetchAddresses,
    enabled: !!user,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SavedAddress | null>(null);

  const createMutation = useMutation({
    mutationFn: createAddress,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      toast.success('Address saved');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AddressFormInput> }) =>
      updateAddress(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      toast.success('Address updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAddress,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      toast.success('Address removed');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not delete'),
  });

  const setDefaultMutation = useMutation({
    mutationFn: setDefaultAddress,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      toast.success('Default address updated');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not update'),
  });

  function handleAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function handleEdit(addr: SavedAddress) {
    setEditing(addr);
    setDialogOpen(true);
  }

  async function handleSubmit(input: AddressFormInput) {
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, input });
    } else {
      await createMutation.mutateAsync(input);
    }
  }

  function handleDelete(addr: SavedAddress) {
    if (!confirm(`Remove “${addr.label}” from your saved addresses?`)) return;
    deleteMutation.mutate(addr.id);
  }

  const addresses = addressesQuery.data ?? [];
  const submitting = createMutation.isPending || updateMutation.isPending;

  if (!mounted || !user) {
    return (
      <>
        <AppHeader showSearch={false} />
        <main className="page-shell py-10">
          <PageLoader />
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader showSearch={false} />
      <main className="page-shell py-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Saved addresses</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage where we deliver. Your default address is used at checkout.
            </p>
          </div>
          <Button onClick={handleAdd}>
            <Plus className="h-4 w-4" />
            Add new address
          </Button>
        </header>

        {addressesQuery.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : addressesQuery.isError ? (
          <ErrorPanel
            message={
              addressesQuery.error instanceof Error
                ? addressesQuery.error.message
                : 'Could not load your addresses.'
            }
            onRetry={() => addressesQuery.refetch()}
          />
        ) : addresses.length === 0 ? (
          <EmptyPanel
            icon={<MapPin className="h-6 w-6" />}
            title="No addresses yet"
            subtitle="Add your first delivery address to start ordering."
            action={
              <Button onClick={handleAdd}>
                <Plus className="h-4 w-4" />
                Add an address
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {addresses.map((addr) => (
              <AddressCard
                key={addr.id}
                address={addr}
                onEdit={() => handleEdit(addr)}
                onDelete={() => handleDelete(addr)}
                onSetDefault={() => setDefaultMutation.mutate(addr.id)}
                disabled={deleteMutation.isPending || setDefaultMutation.isPending}
              />
            ))}
          </div>
        )}

        <AddressFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          initial={editing}
          onSubmit={handleSubmit}
          submitting={submitting}
          hideDefaultToggle={addresses.length === 0}
        />
      </main>
    </>
  );
}
