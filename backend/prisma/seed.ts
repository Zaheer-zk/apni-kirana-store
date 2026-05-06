import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Reset everything before seeding (in correct FK order)
async function reset() {
  await prisma.notification.deleteMany();
  await prisma.orderRating.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.item.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.store.deleteMany();
  await prisma.address.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  console.log('🌱 Resetting database...');
  await reset();
  console.log('🌱 Seeding...');

  // ─────────────────────────────────────────────────────────────────
  // 1. ADMIN
  // ─────────────────────────────────────────────────────────────────
  const admin = await prisma.user.create({
    data: { phone: '9999999999', name: 'Admin User', role: 'ADMIN', isActive: true },
  });

  // ─────────────────────────────────────────────────────────────────
  // 2. STORES — 6 total: 4 ACTIVE (all 4 categories), 1 PENDING, 1 SUSPENDED
  // ─────────────────────────────────────────────────────────────────
  const storeData = [
    {
      ownerPhone: '9999988881', ownerName: 'Raju Kumar',
      storeName: "Raju's Kirana Store", description: 'Fresh groceries and daily essentials',
      category: 'GROCERY' as const, lat: 28.6139, lng: 77.2090,
      street: '123 Main Bazaar', city: 'New Delhi', pincode: '110001',
      status: 'ACTIVE' as const, isOpen: true, rating: 4.6, totalRatings: 124,
    },
    {
      ownerPhone: '9999988882', ownerName: 'Priya Sharma',
      storeName: 'Sharma General Store', description: '24/7 essentials for the colony',
      category: 'GENERAL' as const, lat: 28.6219, lng: 77.2100,
      street: '78 Karol Bagh', city: 'New Delhi', pincode: '110005',
      status: 'ACTIVE' as const, isOpen: true, rating: 4.4, totalRatings: 89,
    },
    {
      ownerPhone: '9999988883', ownerName: 'Anil Verma',
      storeName: 'Anil Medical Store', description: 'Licensed pharmacy with home delivery',
      category: 'PHARMACY' as const, lat: 28.6280, lng: 77.2150,
      street: '12 Janpath', city: 'New Delhi', pincode: '110001',
      status: 'ACTIVE' as const, isOpen: true, rating: 4.8, totalRatings: 56,
    },
    {
      ownerPhone: '9999988884', ownerName: 'Mohan Patel',
      storeName: 'Mohan Snacks Corner', description: 'Hot snacks and beverages',
      category: 'RESTAURANT' as const, lat: 28.6300, lng: 77.2080,
      street: '45 Chandni Chowk', city: 'New Delhi', pincode: '110006',
      status: 'ACTIVE' as const, isOpen: false, rating: 4.2, totalRatings: 203,
    },
    {
      ownerPhone: '9999988885', ownerName: 'Sunita Devi',
      storeName: 'Sunita Provision Store', description: 'Awaiting verification',
      category: 'GROCERY' as const, lat: 28.6250, lng: 77.2200,
      street: '99 Daryaganj', city: 'New Delhi', pincode: '110002',
      status: 'PENDING_APPROVAL' as const, isOpen: false, rating: 0, totalRatings: 0,
    },
    {
      ownerPhone: '9999988886', ownerName: 'Vinod Agarwal',
      storeName: 'Vinod Suspended Mart', description: 'Suspended due to complaints',
      category: 'GENERAL' as const, lat: 28.6400, lng: 77.2300,
      street: '5 Old Delhi', city: 'New Delhi', pincode: '110007',
      status: 'SUSPENDED' as const, isOpen: false, rating: 2.1, totalRatings: 15,
    },
  ];

  const stores = [];
  for (const s of storeData) {
    const owner = await prisma.user.create({
      data: { phone: s.ownerPhone, name: s.ownerName, role: 'STORE_OWNER', isActive: true },
    });
    const store = await prisma.store.create({
      data: {
        ownerId: owner.id, name: s.storeName, description: s.description,
        category: s.category, lat: s.lat, lng: s.lng,
        street: s.street, city: s.city, state: 'Delhi', pincode: s.pincode,
        status: s.status, isOpen: s.isOpen, openTime: '08:00', closeTime: '22:00',
        rating: s.rating, totalRatings: s.totalRatings,
      },
    });
    stores.push(store);
  }
  console.log(`✓ ${stores.length} stores (4 ACTIVE + 1 PENDING + 1 SUSPENDED)`);

  // ─────────────────────────────────────────────────────────────────
  // 3. ITEMS — covering all 6 categories across the 4 active stores
  // ─────────────────────────────────────────────────────────────────
  const allItems = [
    // Raju's Kirana (GROCERY-heavy)
    { storeIdx: 0, name: 'Basmati Rice Premium', cat: 'GROCERY', price: 120, unit: '1kg', stock: 50, img: '🍚' },
    { storeIdx: 0, name: 'Toor Dal', cat: 'GROCERY', price: 95, unit: '500g', stock: 30, img: '🟡' },
    { storeIdx: 0, name: 'Sugar', cat: 'GROCERY', price: 45, unit: '1kg', stock: 100, img: '🍬' },
    { storeIdx: 0, name: 'Sunflower Oil', cat: 'GROCERY', price: 180, unit: '1L', stock: 40, img: '🌻' },
    { storeIdx: 0, name: 'Britannia Bread', cat: 'GROCERY', price: 35, unit: '1 loaf', stock: 20, img: '🍞' },
    { storeIdx: 0, name: 'Amul Butter', cat: 'GROCERY', price: 56, unit: '100g', stock: 25, img: '🧈' },
    { storeIdx: 0, name: 'Atta (Wheat Flour)', cat: 'GROCERY', price: 250, unit: '5kg', stock: 35, img: '🌾' },
    { storeIdx: 0, name: 'Salt Tata', cat: 'GROCERY', price: 22, unit: '1kg', stock: 80, img: '🧂' },
    { storeIdx: 0, name: 'Tea Powder Tata', cat: 'BEVERAGES', price: 280, unit: '500g', stock: 25, img: '☕' },
    { storeIdx: 0, name: 'Coffee Nescafe', cat: 'BEVERAGES', price: 165, unit: '50g', stock: 15, img: '☕' },
    { storeIdx: 0, name: 'Maggi Noodles', cat: 'SNACKS', price: 14, unit: '1 pack', stock: 200, img: '🍜' },
    { storeIdx: 0, name: 'Parle-G Biscuits', cat: 'SNACKS', price: 10, unit: '1 pack', stock: 150, img: '🍪' },

    // Sharma General (HOUSEHOLD-heavy)
    { storeIdx: 1, name: 'Toothpaste Colgate', cat: 'HOUSEHOLD', price: 90, unit: '100g', stock: 50, img: '🪥' },
    { storeIdx: 1, name: 'Surf Excel Detergent', cat: 'HOUSEHOLD', price: 220, unit: '1kg', stock: 30, img: '🧺' },
    { storeIdx: 1, name: 'Dettol Soap', cat: 'HOUSEHOLD', price: 45, unit: '1 bar', stock: 75, img: '🧼' },
    { storeIdx: 1, name: 'Vim Dishwash', cat: 'HOUSEHOLD', price: 30, unit: '500ml', stock: 40, img: '🍽️' },
    { storeIdx: 1, name: 'Harpic Toilet Cleaner', cat: 'HOUSEHOLD', price: 110, unit: '500ml', stock: 25, img: '🚽' },
    { storeIdx: 1, name: 'Bisleri Water', cat: 'BEVERAGES', price: 20, unit: '1L', stock: 100, img: '💧' },
    { storeIdx: 1, name: 'Coca-Cola', cat: 'BEVERAGES', price: 40, unit: '500ml', stock: 80, img: '🥤' },
    { storeIdx: 1, name: 'Lays Chips', cat: 'SNACKS', price: 30, unit: '1 pack', stock: 60, img: '🥔' },
    { storeIdx: 1, name: 'Kurkure', cat: 'SNACKS', price: 20, unit: '1 pack', stock: 70, img: '🌽' },

    // Anil Medical (MEDICINE)
    { storeIdx: 2, name: 'Paracetamol 500mg', cat: 'MEDICINE', price: 25, unit: '10 tablets', stock: 60, img: '💊' },
    { storeIdx: 2, name: 'Crocin Advance', cat: 'MEDICINE', price: 35, unit: '15 tablets', stock: 40, img: '💊' },
    { storeIdx: 2, name: 'Dolo 650', cat: 'MEDICINE', price: 30, unit: '15 tablets', stock: 50, img: '💊' },
    { storeIdx: 2, name: 'Vicks Vaporub', cat: 'MEDICINE', price: 65, unit: '50ml', stock: 25, img: '🧴' },
    { storeIdx: 2, name: 'Band-Aid Pack', cat: 'MEDICINE', price: 45, unit: '20 strips', stock: 30, img: '🩹' },
    { storeIdx: 2, name: 'ORS Sachets', cat: 'MEDICINE', price: 20, unit: '5 packs', stock: 80, img: '🥤' },
    { storeIdx: 2, name: 'Cough Syrup Benadryl', cat: 'MEDICINE', price: 110, unit: '100ml', stock: 20, img: '🍶' },
    { storeIdx: 2, name: 'Antiseptic Cream', cat: 'OTHER', price: 80, unit: '20g', stock: 35, img: '🧴' },

    // Mohan Snacks (SNACKS-heavy)
    { storeIdx: 3, name: 'Samosa (2 pcs)', cat: 'SNACKS', price: 30, unit: '2 pcs', stock: 0, img: '🥟' }, // OUT OF STOCK
    { storeIdx: 3, name: 'Vada Pav', cat: 'SNACKS', price: 25, unit: '1 pc', stock: 50, img: '🥪' },
    { storeIdx: 3, name: 'Masala Chai', cat: 'BEVERAGES', price: 15, unit: '1 cup', stock: 100, img: '🫖' },
    { storeIdx: 3, name: 'Cold Coffee', cat: 'BEVERAGES', price: 60, unit: '300ml', stock: 30, img: '🧋' },
    { storeIdx: 3, name: 'Pav Bhaji', cat: 'OTHER', price: 80, unit: '1 plate', stock: 25, img: '🍛' },
  ];

  for (const i of allItems) {
    await prisma.item.create({
      data: {
        storeId: stores[i.storeIdx].id,
        name: i.name, category: i.cat as any, price: i.price, unit: i.unit,
        stockQty: i.stock, isAvailable: i.stock > 0,
      },
    });
  }
  console.log(`✓ ${allItems.length} items (covers all 6 categories, 1 OUT OF STOCK)`);

  // ─────────────────────────────────────────────────────────────────
  // 4. DRIVERS — 5 total covering all statuses
  // ─────────────────────────────────────────────────────────────────
  const driverData = [
    { phone: '9999977771', name: 'Suresh Singh', vt: 'BIKE', vn: 'DL-01-AB-1234', status: 'ONLINE', rating: 4.9, ratings: 145, earnings: 18540 },
    { phone: '9999977772', name: 'Ramesh Yadav', vt: 'SCOOTER', vn: 'DL-02-CD-5678', status: 'OFFLINE', rating: 4.6, ratings: 89, earnings: 12300 },
    { phone: '9999977773', name: 'Mukesh Sharma', vt: 'CAR', vn: 'DL-03-EF-9012', status: 'ACTIVE', rating: 4.7, ratings: 67, earnings: 9800 },
    { phone: '9999977774', name: 'Vikas Kumar', vt: 'BIKE', vn: 'DL-04-GH-3456', status: 'PENDING_APPROVAL', rating: 0, ratings: 0, earnings: 0 },
    { phone: '9999977775', name: 'Deepak Singh', vt: 'BIKE', vn: 'DL-05-IJ-7890', status: 'SUSPENDED', rating: 3.2, ratings: 12, earnings: 1200 },
  ];

  const drivers = [];
  for (const d of driverData) {
    const u = await prisma.user.create({
      data: { phone: d.phone, name: d.name, role: 'DRIVER', isActive: true },
    });
    const driver = await prisma.driver.create({
      data: {
        userId: u.id, vehicleType: d.vt as any, vehicleNumber: d.vn,
        licenseNumber: `DL${d.phone.slice(-8)}`, status: d.status as any,
        currentLat: 28.6150, currentLng: 77.2100,
        rating: d.rating, totalRatings: d.ratings, totalEarnings: d.earnings,
      },
    });
    drivers.push(driver);
  }
  console.log(`✓ ${drivers.length} drivers (covers ONLINE/OFFLINE/ACTIVE/PENDING/SUSPENDED)`);

  // ─────────────────────────────────────────────────────────────────
  // 5. CUSTOMERS — 5 with multiple addresses each
  // ─────────────────────────────────────────────────────────────────
  const customerData = [
    { phone: '9999966661', name: 'Test Customer', city: 'New Delhi', pin: '110001', lat: 28.6315, lng: 77.2167 },
    { phone: '9999966662', name: 'Anita Verma', city: 'New Delhi', pin: '110005', lat: 28.6219, lng: 77.2100 },
    { phone: '9999966663', name: 'Rohit Mehra', city: 'New Delhi', pin: '110001', lat: 28.6280, lng: 77.2150 },
    { phone: '9999966664', name: 'Kavita Iyer', city: 'New Delhi', pin: '110007', lat: 28.6400, lng: 77.2300 },
    { phone: '9999966665', name: 'Suspended User', city: 'New Delhi', pin: '110002', lat: 28.6250, lng: 77.2200, suspended: true },
  ];

  const customers = [];
  for (const c of customerData) {
    const u = await prisma.user.create({
      data: { phone: c.phone, name: c.name, role: 'CUSTOMER', isActive: !c.suspended },
    });
    // Home address (default)
    const home = await prisma.address.create({
      data: {
        userId: u.id, label: 'Home', street: `${Math.floor(Math.random() * 99) + 1} Main Road`,
        city: c.city, state: 'Delhi', pincode: c.pin,
        lat: c.lat, lng: c.lng, isDefault: true,
      },
    });
    // Work address (non-default) for first 2 customers
    if (customers.length < 2) {
      await prisma.address.create({
        data: {
          userId: u.id, label: 'Work', street: '500 Cyber Hub',
          city: 'Gurgaon', state: 'Haryana', pincode: '122002',
          lat: 28.4946, lng: 77.0890, isDefault: false,
        },
      });
    }
    customers.push({ user: u, address: home });
  }
  console.log(`✓ ${customers.length} customers (1 SUSPENDED, 2 with multiple addresses)`);

  // ─────────────────────────────────────────────────────────────────
  // 6. ORDERS — every status, mix of stores/drivers/customers
  // ─────────────────────────────────────────────────────────────────
  const itemsByStore: Record<string, any[]> = {};
  for (const store of stores) {
    itemsByStore[store.id] = await prisma.item.findMany({ where: { storeId: store.id } });
  }

  const orderConfigs = [
    // Older delivered orders (last 7 days)
    { custIdx: 0, storeIdx: 0, driverIdx: 0, status: 'DELIVERED', daysAgo: 7, hours: 0, qty: 3, paid: 'PAID', method: 'ONLINE' },
    { custIdx: 1, storeIdx: 0, driverIdx: 0, status: 'DELIVERED', daysAgo: 6, hours: 0, qty: 2, paid: 'PAID', method: 'CASH_ON_DELIVERY' },
    { custIdx: 2, storeIdx: 1, driverIdx: 1, status: 'DELIVERED', daysAgo: 5, hours: 0, qty: 4, paid: 'PAID', method: 'CASH_ON_DELIVERY' },
    { custIdx: 3, storeIdx: 2, driverIdx: 2, status: 'DELIVERED', daysAgo: 4, hours: 0, qty: 2, paid: 'PAID', method: 'ONLINE' },
    { custIdx: 0, storeIdx: 1, driverIdx: 0, status: 'DELIVERED', daysAgo: 3, hours: 0, qty: 5, paid: 'PAID', method: 'ONLINE' },

    // Yesterday
    { custIdx: 1, storeIdx: 2, driverIdx: 1, status: 'DELIVERED', daysAgo: 1, hours: 12, qty: 1, paid: 'PAID', method: 'CASH_ON_DELIVERY' },
    { custIdx: 2, storeIdx: 0, driverIdx: 0, status: 'DELIVERED', daysAgo: 1, hours: 8, qty: 6, paid: 'PAID', method: 'ONLINE' },

    // Today — various active states
    { custIdx: 0, storeIdx: 0, driverIdx: 0, status: 'PICKED_UP', daysAgo: 0, hours: 1, qty: 2, paid: 'PENDING', method: 'CASH_ON_DELIVERY' },
    { custIdx: 1, storeIdx: 1, driverIdx: 2, status: 'DRIVER_ASSIGNED', daysAgo: 0, hours: 0.5, qty: 3, paid: 'PAID', method: 'ONLINE' },
    { custIdx: 2, storeIdx: 2, driverIdx: 0, status: 'STORE_ACCEPTED', daysAgo: 0, hours: 0.2, qty: 1, paid: 'PENDING', method: 'CASH_ON_DELIVERY' },
    { custIdx: 3, storeIdx: 0, driverIdx: null, status: 'PENDING', daysAgo: 0, hours: 0.05, qty: 2, paid: 'PENDING', method: 'CASH_ON_DELIVERY' },

    // Cancelled & Rejected examples
    { custIdx: 0, storeIdx: 1, driverIdx: null, status: 'CANCELLED', daysAgo: 2, hours: 0, qty: 2, paid: 'REFUNDED', method: 'ONLINE', cancelReason: 'Customer changed mind' },
    { custIdx: 1, storeIdx: 2, driverIdx: null, status: 'REJECTED', daysAgo: 1, hours: 5, qty: 3, paid: 'REFUNDED', method: 'ONLINE', rejectReason: 'Out of stock items' },
  ];

  let orderCount = 0;
  const deliveredOrderIds: string[] = [];
  for (const cfg of orderConfigs) {
    const customer = customers[cfg.custIdx];
    const store = stores[cfg.storeIdx];
    const items = itemsByStore[store.id].slice(0, cfg.qty);
    if (items.length === 0) continue;

    const subtotal = items.reduce((s, i) => s + i.price * 2, 0);
    const deliveryFee = 30;
    const commission = Math.round(subtotal * 0.10);
    const total = subtotal + deliveryFee;
    const createdAt = new Date(Date.now() - cfg.daysAgo * 86400000 - cfg.hours * 3600000);

    const driverId = cfg.driverIdx !== null ? drivers[cfg.driverIdx].id : null;
    const wasAssigned = ['DELIVERED', 'PICKED_UP', 'DRIVER_ASSIGNED'].includes(cfg.status);
    const wasAccepted = !['PENDING', 'CANCELLED', 'REJECTED'].includes(cfg.status);

    const order = await prisma.order.create({
      data: {
        customerId: customer.user.id,
        storeId: store.id,
        driverId: wasAssigned ? driverId : null,
        status: cfg.status as any,
        subtotal, deliveryFee, commission, total,
        paymentMethod: cfg.method as any, paymentStatus: cfg.paid as any,
        deliveryAddressId: customer.address.id,
        notes: '',
        cancelReason: cfg.cancelReason || null,
        rejectionReason: cfg.rejectReason || null,
        storeAcceptedAt: wasAccepted ? createdAt : null,
        driverAssignedAt: wasAssigned ? createdAt : null,
        pickedUpAt: ['DELIVERED', 'PICKED_UP'].includes(cfg.status) ? createdAt : null,
        deliveredAt: cfg.status === 'DELIVERED' ? createdAt : null,
        createdAt,
        items: {
          create: items.map((it) => ({
            itemId: it.id, name: it.name, price: it.price, unit: it.unit, qty: 2,
          })),
        },
      },
    });
    if (cfg.status === 'DELIVERED') deliveredOrderIds.push(order.id);
    orderCount++;
  }
  console.log(`✓ ${orderCount} orders covering ALL statuses (PENDING → DELIVERED + CANCELLED + REJECTED)`);

  // ─────────────────────────────────────────────────────────────────
  // 7. RATINGS — for delivered orders
  // ─────────────────────────────────────────────────────────────────
  const ratingComments = [
    'Quick delivery, fresh items!',
    'Good service, will order again.',
    'Items were exactly as described.',
    'Driver was very polite and on time.',
    null,
  ];
  let ratingCount = 0;
  for (let i = 0; i < deliveredOrderIds.length - 2; i++) {
    const order = await prisma.order.findUnique({ where: { id: deliveredOrderIds[i] } });
    if (!order) continue;
    await prisma.orderRating.create({
      data: {
        orderId: order.id,
        customerId: order.customerId,
        storeRating: 4 + Math.floor(Math.random() * 2), // 4 or 5
        driverRating: 4 + Math.floor(Math.random() * 2),
        storeComment: ratingComments[i % ratingComments.length],
        driverComment: i % 2 === 0 ? 'Friendly driver' : null,
      },
    });
    ratingCount++;
  }
  console.log(`✓ ${ratingCount} ratings on past delivered orders`);

  // ─────────────────────────────────────────────────────────────────
  // 8. NOTIFICATIONS — covering different scenarios
  // ─────────────────────────────────────────────────────────────────
  const notifs = [
    { userId: admin.id, title: 'New store awaiting approval', body: 'Sunita Provision Store registered and needs your review.' },
    { userId: admin.id, title: 'New driver awaiting approval', body: 'Vikas Kumar (BIKE) registered and needs your review.' },
    { userId: customers[0].user.id, title: 'Order delivered!', body: 'Your order from Raju\'s Kirana Store has been delivered. Rate now!' },
    { userId: customers[0].user.id, title: 'Order picked up', body: 'Suresh Singh has picked up your order from Raju\'s Kirana Store.' },
    { userId: customers[1].user.id, title: 'Driver assigned', body: 'Mukesh Sharma is on the way to pick up your order.' },
    { userId: customers[2].user.id, title: 'Order accepted', body: 'Anil Medical Store has accepted your order.' },
    { userId: drivers[0].userId, title: 'New delivery request', body: 'Pickup from Raju\'s Kirana, ₹85 earnings.' },
    { userId: drivers[0].userId, title: 'Bonus unlocked!', body: 'You earned ₹100 bonus for completing 10 deliveries today.' },
    { userId: stores[0].ownerId, title: 'New order received', body: 'Order #cmoabc... — 2 items, ₹350 total. Accept within 3 minutes.' },
    { userId: stores[0].ownerId, title: 'Order completed', body: 'Order #cmoxyz... was successfully delivered. Earnings: ₹315.' },
  ];
  for (const n of notifs) {
    await prisma.notification.create({
      data: { ...n, isRead: Math.random() > 0.5 },
    });
  }
  console.log(`✓ ${notifs.length} notifications across admin/customers/drivers/stores`);

  // ─────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────
  console.log('\n✅ Seed complete!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  LOGIN CREDENTIALS — phone + OTP (OTP in backend logs)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ADMIN');
  console.log('    9999999999  Admin User');
  console.log('');
  console.log('  STORE OWNERS (6 stores: 4 active, 1 pending, 1 suspended)');
  console.log('    9999988881  Raju\'s Kirana       (GROCERY, ACTIVE, OPEN)');
  console.log('    9999988882  Sharma General      (GENERAL, ACTIVE, OPEN)');
  console.log('    9999988883  Anil Medical        (PHARMACY, ACTIVE, OPEN)');
  console.log('    9999988884  Mohan Snacks        (RESTAURANT, ACTIVE, CLOSED)');
  console.log('    9999988885  Sunita Provision    (PENDING — admin to approve)');
  console.log('    9999988886  Vinod Suspended     (SUSPENDED)');
  console.log('');
  console.log('  DRIVERS (5: covering every status)');
  console.log('    9999977771  Suresh Singh   BIKE     ONLINE');
  console.log('    9999977772  Ramesh Yadav   SCOOTER  OFFLINE');
  console.log('    9999977773  Mukesh Sharma  CAR      ACTIVE');
  console.log('    9999977774  Vikas Kumar    BIKE     PENDING — admin to approve');
  console.log('    9999977775  Deepak Singh   BIKE     SUSPENDED');
  console.log('');
  console.log('  CUSTOMERS (5: 4 active, 1 suspended)');
  console.log('    9999966661  Test Customer   (with Work + Home addresses)');
  console.log('    9999966662  Anita Verma     (with Work + Home addresses)');
  console.log('    9999966663  Rohit Mehra');
  console.log('    9999966664  Kavita Iyer');
  console.log('    9999966665  Suspended User  (isActive=false)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  DATABASE TOTALS');
  console.log(`    ${stores.length} stores`);
  console.log(`    ${allItems.length} items (across 6 categories: GROCERY, MEDICINE,`);
  console.log('             HOUSEHOLD, SNACKS, BEVERAGES, OTHER)');
  console.log(`    ${drivers.length} drivers`);
  console.log(`    ${customers.length} customers (with addresses)`);
  console.log(`    ${orderCount} orders (every status: PENDING/STORE_ACCEPTED/`);
  console.log('             DRIVER_ASSIGNED/PICKED_UP/DELIVERED/CANCELLED/REJECTED)');
  console.log(`    ${ratingCount} ratings on delivered orders`);
  console.log(`    ${notifs.length} notifications`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
