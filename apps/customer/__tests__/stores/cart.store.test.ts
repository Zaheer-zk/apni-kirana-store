import { useCartStore } from '@/store/cart.store';

const mkItem = (id: string, qty = 1, price = 100) => ({
  itemId: id,
  name: `Item ${id}`,
  price,
  unit: '1pc',
  qty,
} as any);

describe('cart.store', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] });
  });

  it('adds new item', () => {
    useCartStore.getState().addItem(mkItem('a', 2));
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].qty).toBe(2);
  });

  it('increments qty when adding existing item', () => {
    useCartStore.getState().addItem(mkItem('a', 1));
    useCartStore.getState().addItem(mkItem('a', 3));
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].qty).toBe(4);
  });

  it('removes item', () => {
    useCartStore.getState().addItem(mkItem('a'));
    useCartStore.getState().addItem(mkItem('b'));
    useCartStore.getState().removeItem('a');
    expect(useCartStore.getState().items.map((i) => i.itemId)).toEqual(['b']);
  });

  it('updateQty sets new qty, removes when 0', () => {
    useCartStore.getState().addItem(mkItem('a', 1));
    useCartStore.getState().updateQty('a', 5);
    expect(useCartStore.getState().items[0].qty).toBe(5);
    useCartStore.getState().updateQty('a', 0);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('total sums price * qty', () => {
    useCartStore.getState().addItem(mkItem('a', 2, 50));
    useCartStore.getState().addItem(mkItem('b', 3, 20));
    expect(useCartStore.getState().total()).toBe(2 * 50 + 3 * 20);
  });

  it('clearCart empties items', () => {
    useCartStore.getState().addItem(mkItem('a'));
    useCartStore.getState().clearCart();
    expect(useCartStore.getState().items).toEqual([]);
  });
});
