'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ListPlus, Send } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Input } from '@aks/ui/components/input';
import { Label } from '@aks/ui/components/label';
import { Card, CardContent } from '@aks/ui/components/card';
import { toast } from '@aks/ui/components/sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@aks/ui/components/select';
import { ItemCategory, ItemCategoryLabels } from '@aks/shared';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { api } from '@/lib/api';

// Store owners use this to ask admin to add an item that isn't in the
// master catalog yet. Admin's review queue lives in the admin app — the
// approved CatalogItem auto-links into this store's inventory at the
// suggested price (or zero).
export default function RequestItemPage() {
  return (
    <AuthGuard>
      <AppShell>
        <RequestItemInner />
      </AppShell>
    </AuthGuard>
  );
}

function RequestItemInner() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    description: '',
    category: ItemCategory.GROCERY,
    defaultUnit: 'pcs',
    imageUrl: '',
    priceHint: '',
  });

  const create = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      if (name.length < 2) throw new Error('Item name is required');
      const payload: Record<string, unknown> = {
        name,
        category: form.category,
        defaultUnit: form.defaultUnit.trim() || 'pcs',
      };
      if (form.description.trim()) payload.description = form.description.trim();
      if (form.imageUrl.trim()) payload.imageUrl = form.imageUrl.trim();
      if (form.priceHint.trim()) {
        const price = Number.parseFloat(form.priceHint);
        if (!Number.isFinite(price) || price <= 0) {
          throw new Error('Price hint must be a positive number');
        }
        payload.priceHint = price;
      }
      const res = await api.post('/api/v1/catalog/requests', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Request sent — admin will review shortly.');
      queryClient.invalidateQueries({ queryKey: ['catalogRequestsMine'] });
      setForm({
        name: '',
        description: '',
        category: ItemCategory.GROCERY,
        defaultUnit: 'pcs',
        imageUrl: '',
        priceHint: '',
      });
    },
    onError: (err: Error) => toast.error(err.message || 'Could not submit request'),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/help"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Help
      </Link>

      <header className="flex items-center gap-3">
        <div className="rounded-xl bg-primary p-3 text-primary-foreground">
          <ListPlus className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Request a new catalog item</h1>
          <p className="text-sm text-gray-600">
            Tell admin what to add. Once approved, the item appears in your inventory automatically.
          </p>
        </div>
      </header>

      <Card>
        <CardContent className="space-y-4 p-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="name">Item name *</Label>
              <Input
                id="name"
                placeholder="e.g. Aashirvaad Atta 5kg"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                maxLength={120}
              />
              <p className="text-xs text-gray-500">
                Be specific — brand + size makes the catalog cleaner.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="category">Category *</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(ItemCategory).map((v) => (
                      <SelectItem key={v} value={v}>
                        {ItemCategoryLabels[v]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="unit">Unit *</Label>
                <Input
                  id="unit"
                  placeholder="kg, g, L, ml, pcs"
                  value={form.defaultUnit}
                  onChange={(e) => setForm({ ...form, defaultUnit: e.target.value })}
                  required
                  maxLength={40}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description (optional)</Label>
              <textarea
                id="description"
                placeholder="Short note that helps admin (variant, packaging size, MRP, etc.)"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                maxLength={500}
                className="flex w-full rounded-md border border-input bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="priceHint">Your selling price (₹, optional)</Label>
                <Input
                  id="priceHint"
                  type="number"
                  inputMode="decimal"
                  placeholder="e.g. 240"
                  value={form.priceHint}
                  onChange={(e) => setForm({ ...form, priceHint: e.target.value })}
                  min={0}
                  step="0.01"
                />
                <p className="text-xs text-gray-500">
                  We&apos;ll pre-fill this on your inventory after approval.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="imageUrl">Image URL (optional)</Label>
                <Input
                  id="imageUrl"
                  placeholder="https://…"
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" asChild>
                <Link href="/help">Cancel</Link>
              </Button>
              <Button type="submit" disabled={create.isPending}>
                <Send className="h-4 w-4" />
                {create.isPending ? 'Sending…' : 'Send request'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
