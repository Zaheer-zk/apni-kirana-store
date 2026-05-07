import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function reset() {
  await prisma.auditLog.deleteMany().catch(() => {});
  await prisma.zone.deleteMany().catch(() => {});
  await prisma.promoRedemption.deleteMany().catch(() => {});
  await prisma.promo.deleteMany().catch(() => {});
  await prisma.notification.deleteMany();
  await prisma.orderRating.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.storeItem.deleteMany();
  await prisma.catalogItem.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.store.deleteMany();
  await prisma.address.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

function generateOtp4(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

async function main() {
  console.log('🌱 Resetting database...');
  await reset();
  console.log('🌱 Seeding marketplace catalog...');

  // ─── 1. ADMIN ─────────────────────────────────────────────────────────
  const admin = await prisma.user.create({
    data: { phone: '9999999999', name: 'Admin User', role: 'ADMIN', isActive: true },
  });

  // ─── 2. MASTER CATALOG (admin-curated) ────────────────────────────────
  const catalogSeed = [
    // GROCERY
    { name: 'Basmati Rice Premium', cat: 'GROCERY', unit: '1kg', desc: 'Long-grain aged basmati' },
    { name: 'Toor Dal', cat: 'GROCERY', unit: '500g', desc: 'Yellow split pigeon peas' },
    { name: 'Sugar', cat: 'GROCERY', unit: '1kg', desc: 'Refined white sugar' },
    { name: 'Sunflower Oil', cat: 'GROCERY', unit: '1L', desc: 'Cold-pressed sunflower oil' },
    { name: 'Britannia Bread', cat: 'GROCERY', unit: '1 loaf', desc: 'Soft white bread, 400g' },
    { name: 'Amul Butter', cat: 'GROCERY', unit: '100g', desc: 'Salted butter' },
    { name: 'Atta (Wheat Flour)', cat: 'GROCERY', unit: '5kg', desc: '100% whole wheat flour' },
    { name: 'Salt Tata', cat: 'GROCERY', unit: '1kg', desc: 'Iodised salt' },
    { name: 'Onions', cat: 'GROCERY', unit: '1kg', desc: 'Fresh red onions' },
    { name: 'Potatoes', cat: 'GROCERY', unit: '1kg', desc: 'Fresh potatoes' },
    { name: 'Tomatoes', cat: 'GROCERY', unit: '500g', desc: 'Fresh tomatoes' },
    { name: 'Eggs (12 pcs)', cat: 'GROCERY', unit: '12 pcs', desc: 'Farm-fresh white eggs' },
    // BEVERAGES
    { name: 'Tea Powder Tata', cat: 'BEVERAGES', unit: '500g', desc: 'Strong Assam tea' },
    { name: 'Coffee Nescafe', cat: 'BEVERAGES', unit: '50g', desc: 'Instant coffee jar' },
    { name: 'Bisleri Water', cat: 'BEVERAGES', unit: '1L', desc: 'Packaged drinking water' },
    { name: 'Coca-Cola', cat: 'BEVERAGES', unit: '500ml', desc: 'Soft drink bottle' },
    { name: 'Milk Amul (1L)', cat: 'BEVERAGES', unit: '1L', desc: 'Toned milk pouch' },
    // SNACKS
    { name: 'Maggi Noodles', cat: 'SNACKS', unit: '1 pack', desc: 'Masala instant noodles' },
    { name: 'Parle-G Biscuits', cat: 'SNACKS', unit: '1 pack', desc: 'Glucose biscuits' },
    { name: 'Lays Chips', cat: 'SNACKS', unit: '1 pack', desc: 'Magic Masala flavour' },
    { name: 'Kurkure', cat: 'SNACKS', unit: '1 pack', desc: 'Masala Munch' },
    { name: 'Oreo Cookies', cat: 'SNACKS', unit: '1 pack', desc: 'Chocolate cream biscuits' },
    // HOUSEHOLD
    { name: 'Toothpaste Colgate', cat: 'HOUSEHOLD', unit: '100g', desc: 'Strong teeth toothpaste' },
    { name: 'Surf Excel Detergent', cat: 'HOUSEHOLD', unit: '1kg', desc: 'Top-load powder' },
    { name: 'Dettol Soap', cat: 'HOUSEHOLD', unit: '1 bar', desc: 'Antibacterial soap, 75g' },
    { name: 'Vim Dishwash', cat: 'HOUSEHOLD', unit: '500ml', desc: 'Liquid dishwash' },
    { name: 'Harpic Toilet Cleaner', cat: 'HOUSEHOLD', unit: '500ml', desc: 'Strong cleaner' },
    { name: 'Tissue Papers', cat: 'HOUSEHOLD', unit: '1 pack', desc: '100-pull facial tissue' },
    // MEDICINE
    { name: 'Paracetamol 500mg', cat: 'MEDICINE', unit: '10 tablets', desc: 'For fever / pain' },
    { name: 'Crocin Advance', cat: 'MEDICINE', unit: '15 tablets', desc: 'Quick relief paracetamol' },
    { name: 'Dolo 650', cat: 'MEDICINE', unit: '15 tablets', desc: 'Paracetamol 650mg' },
    { name: 'Vicks Vaporub', cat: 'MEDICINE', unit: '50ml', desc: 'Cold relief balm' },
    { name: 'Band-Aid Pack', cat: 'MEDICINE', unit: '20 strips', desc: 'Adhesive bandages' },
    { name: 'ORS Sachets', cat: 'MEDICINE', unit: '5 packs', desc: 'Rehydration salts' },
  ];

  const catalog = [];
  for (const c of catalogSeed) {
    const item = await prisma.catalogItem.create({
      data: {
        name: c.name,
        description: c.desc,
        category: c.cat as any,
        defaultUnit: c.unit,
        isActive: true,
      },
    });
    catalog.push(item);
  }
  console.log(`✓ ${catalog.length} catalog items created (admin-managed master list)`);

  // ─── 3. STORES (4 active, 1 pending, 1 suspended) ─────────────────────
  // All locations clustered around Khandela town centre, Sikar district,
  // Rajasthan (lat ~27.6033, lng ~75.4944). Spread within ~1 km so the
  // matching engine's 5 km radius covers every store from every customer
  // address — perfect for end-to-end order routing tests.
  const storeData = [
    {
      ownerPhone: '9999988881', ownerName: 'Raju Kumar',
      storeName: "Raju's Kirana Store",
      description: 'Fresh groceries and daily essentials',
      category: 'GROCERY' as const, lat: 27.6020, lng: 75.4935,
      street: 'Main Bazaar, Old Khandela', city: 'Khandela', pincode: '332702',
      status: 'ACTIVE' as const, isOpen: true, rating: 4.6, totalRatings: 124,
    },
    {
      ownerPhone: '9999988882', ownerName: 'Priya Sharma',
      storeName: 'Sharma General Store',
      description: '24/7 essentials for the colony',
      category: 'GENERAL' as const, lat: 27.6050, lng: 75.4960,
      street: 'Station Road, Khandela', city: 'Khandela', pincode: '332702',
      status: 'ACTIVE' as const, isOpen: true, rating: 4.4, totalRatings: 89,
    },
    {
      ownerPhone: '9999988883', ownerName: 'Anil Verma',
      storeName: 'Anil Medical Store',
      description: 'Licensed pharmacy with home delivery',
      category: 'PHARMACY' as const, lat: 27.6010, lng: 75.4920,
      street: 'Hospital Road, Khandela', city: 'Khandela', pincode: '332702',
      status: 'ACTIVE' as const, isOpen: true, rating: 4.8, totalRatings: 56,
    },
    {
      ownerPhone: '9999988884', ownerName: 'Mohan Patel',
      storeName: 'Mohan Snacks Corner',
      description: 'Hot snacks and beverages',
      category: 'RESTAURANT' as const, lat: 27.6068, lng: 75.4970,
      street: 'Bus Stand, Khandela', city: 'Khandela', pincode: '332702',
      status: 'ACTIVE' as const, isOpen: false, rating: 4.2, totalRatings: 203,
    },
    {
      ownerPhone: '9999988885', ownerName: 'Sunita Devi',
      storeName: 'Sunita Provision Store',
      description: 'Awaiting verification',
      category: 'GROCERY' as const, lat: 27.6005, lng: 75.4960,
      street: 'Sikar Road, Khandela', city: 'Khandela', pincode: '332702',
      status: 'PENDING_APPROVAL' as const, isOpen: false, rating: 0, totalRatings: 0,
    },
    {
      ownerPhone: '9999988886', ownerName: 'Vinod Agarwal',
      storeName: 'Vinod Suspended Mart',
      description: 'Suspended due to complaints',
      category: 'GENERAL' as const, lat: 27.6090, lng: 75.4990,
      street: 'Outer Ring, Khandela', city: 'Khandela', pincode: '332702',
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
        street: s.street, city: s.city, state: 'Rajasthan', pincode: s.pincode,
        status: s.status, isOpen: s.isOpen, openTime: '08:00', closeTime: '22:00',
        rating: s.rating, totalRatings: s.totalRatings,
      },
    });
    stores.push(store);
  }
  console.log(`✓ ${stores.length} stores`);

  // ─── 4. STORE-ITEMS — each ACTIVE store picks subset of catalog ───────
  // Define which catalog items each store carries (by name) + price multiplier
  function pick(names: string[], priceMul = 1.0, stockMin = 10, stockMax = 80) {
    return names.map((n) => {
      const item = catalog.find((c) => c.name === n);
      if (!item) throw new Error('Unknown catalog item: ' + n);
      const basePrice: Record<string, number> = {
        'Basmati Rice Premium': 120, 'Toor Dal': 95, 'Sugar': 45, 'Sunflower Oil': 180,
        'Britannia Bread': 35, 'Amul Butter': 56, 'Atta (Wheat Flour)': 250, 'Salt Tata': 22,
        'Onions': 40, 'Potatoes': 30, 'Tomatoes': 25, 'Eggs (12 pcs)': 84,
        'Tea Powder Tata': 280, 'Coffee Nescafe': 165, 'Bisleri Water': 20, 'Coca-Cola': 40,
        'Milk Amul (1L)': 66, 'Maggi Noodles': 14, 'Parle-G Biscuits': 10, 'Lays Chips': 30,
        'Kurkure': 20, 'Oreo Cookies': 30, 'Toothpaste Colgate': 90, 'Surf Excel Detergent': 220,
        'Dettol Soap': 45, 'Vim Dishwash': 30, 'Harpic Toilet Cleaner': 110, 'Tissue Papers': 65,
        'Paracetamol 500mg': 25, 'Crocin Advance': 35, 'Dolo 650': 30, 'Vicks Vaporub': 65,
        'Band-Aid Pack': 45, 'ORS Sachets': 20,
      };
      return {
        catalogItemId: item.id,
        price: Math.round((basePrice[n] ?? 50) * priceMul),
        stockQty: Math.floor(stockMin + Math.random() * (stockMax - stockMin)),
      };
    });
  }

  // Raju's Kirana — broad grocery selection
  const rajuItems = pick(
    ['Basmati Rice Premium','Toor Dal','Sugar','Sunflower Oil','Britannia Bread','Amul Butter',
     'Atta (Wheat Flour)','Salt Tata','Onions','Potatoes','Tomatoes','Eggs (12 pcs)',
     'Tea Powder Tata','Coffee Nescafe','Milk Amul (1L)','Maggi Noodles','Parle-G Biscuits'],
    1.0, 20, 100,
  );
  for (const it of rajuItems) {
    await prisma.storeItem.create({ data: { storeId: stores[0].id, ...it, isAvailable: true } });
  }

  // Sharma General — household-heavy + some snacks/grocery (overlapping with Raju)
  const sharmaItems = pick(
    ['Toothpaste Colgate','Surf Excel Detergent','Dettol Soap','Vim Dishwash','Harpic Toilet Cleaner',
     'Tissue Papers','Bisleri Water','Coca-Cola','Lays Chips','Kurkure','Oreo Cookies',
     'Maggi Noodles','Parle-G Biscuits','Sugar','Salt Tata','Tea Powder Tata'], // shares some w/Raju
    1.05, 15, 70,  // Sharma is slightly pricier
  );
  for (const it of sharmaItems) {
    await prisma.storeItem.create({ data: { storeId: stores[1].id, ...it, isAvailable: true } });
  }

  // Anil Medical — pharmacy, plus some basics
  const anilItems = pick(
    ['Paracetamol 500mg','Crocin Advance','Dolo 650','Vicks Vaporub','Band-Aid Pack','ORS Sachets',
     'Bisleri Water','Tissue Papers'], // a few non-meds for cross-store match testing
    1.0, 25, 90,
  );
  for (const it of anilItems) {
    await prisma.storeItem.create({ data: { storeId: stores[2].id, ...it, isAvailable: true } });
  }

  // Mohan Snacks — snacks + drinks (closed currently but listed)
  const mohanItems = pick(
    ['Maggi Noodles','Parle-G Biscuits','Lays Chips','Kurkure','Oreo Cookies',
     'Coca-Cola','Bisleri Water','Coffee Nescafe'],
    1.10, 20, 50,
  );
  for (const it of mohanItems) {
    await prisma.storeItem.create({
      data: { storeId: stores[3].id, ...it, isAvailable: true },
    });
  }

  const totalStoreItems = rajuItems.length + sharmaItems.length + anilItems.length + mohanItems.length;
  console.log(`✓ ${totalStoreItems} store-items (each store priced independently, overlap intentional)`);

  // ─── 5. DRIVERS ───────────────────────────────────────────────────────
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
    drivers.push(await prisma.driver.create({
      data: {
        userId: u.id, vehicleType: d.vt as any, vehicleNumber: d.vn,
        licenseNumber: `DL${d.phone.slice(-8)}`, status: d.status as any,
        // All drivers start near Khandela town centre — within 200m of every
        // store so dispatch picks the closest one deterministically.
        currentLat: 27.6033, currentLng: 75.4944,
        rating: d.rating, totalRatings: d.ratings, totalEarnings: d.earnings,
      },
    }));
  }
  console.log(`✓ ${drivers.length} drivers`);

  // ─── 6. CUSTOMERS ────────────────────────────────────────────────────
  // All customers live in Khandela so the matching engine routes orders
  // to a real candidate store every time. Spread within ~500m of the
  // town centre so each customer gets multiple eligible stores nearby.
  const customerData = [
    // Test Customer's address is intentionally ~150m from Raju's Kirana
    // so any order they place reaches Raju (store 9999988881) via the matching engine.
    { phone: '9999966661', name: 'Test Customer', city: 'Khandela', pin: '332702', lat: 27.6025, lng: 75.4938 },
    { phone: '9999966662', name: 'Anita Verma',   city: 'Khandela', pin: '332702', lat: 27.6055, lng: 75.4965 },
    { phone: '9999966663', name: 'Rohit Mehra',   city: 'Khandela', pin: '332702', lat: 27.6015, lng: 75.4925 },
    { phone: '9999966664', name: 'Kavita Iyer',   city: 'Khandela', pin: '332702', lat: 27.6075, lng: 75.4980 },
  ];
  const customers = [];
  for (const c of customerData) {
    const u = await prisma.user.create({
      data: { phone: c.phone, name: c.name, role: 'CUSTOMER', isActive: true },
    });
    const home = await prisma.address.create({
      data: {
        userId: u.id, label: 'Home', street: `${Math.floor(Math.random() * 99) + 1} Main Road`,
        city: c.city, state: 'Rajasthan', pincode: c.pin,
        lat: c.lat, lng: c.lng, isDefault: true,
      },
    });
    if (customers.length < 2) {
      await prisma.address.create({
        data: {
          userId: u.id, label: 'Work', street: 'Shop 12, Sikar Road',
          city: 'Sikar', state: 'Rajasthan', pincode: '332001',
          // Sikar town — ~30 km from Khandela. A "far" address for
          // testing the matching engine's distance ranking + city-wide fallback.
          lat: 27.6094, lng: 75.1399, isDefault: false,
        },
      });
    }
    customers.push({ user: u, address: home });
  }
  console.log(`✓ ${customers.length} customers (with addresses)`);

  // ─── 7. SAMPLE ORDERS (matching the catalog model) ────────────────────
  // Use Raju's storeItems for past orders
  const rajuStoreItems = await prisma.storeItem.findMany({
    where: { storeId: stores[0].id },
    include: { catalogItem: true },
    take: 5,
  });

  const orderConfigs = [
    { custIdx: 0, status: 'DELIVERED', daysAgo: 7, hours: 0, qty: 3, paid: 'PAID', method: 'ONLINE' },
    { custIdx: 1, status: 'DELIVERED', daysAgo: 5, hours: 0, qty: 4, paid: 'PAID', method: 'CASH_ON_DELIVERY' },
    { custIdx: 2, status: 'DELIVERED', daysAgo: 3, hours: 0, qty: 2, paid: 'PAID', method: 'ONLINE' },
    { custIdx: 0, status: 'DELIVERED', daysAgo: 1, hours: 8, qty: 5, paid: 'PAID', method: 'ONLINE' },
    { custIdx: 0, status: 'PICKED_UP', daysAgo: 0, hours: 1, qty: 2, paid: 'PENDING', method: 'CASH_ON_DELIVERY' },
    { custIdx: 1, status: 'DRIVER_ASSIGNED', daysAgo: 0, hours: 0.5, qty: 3, paid: 'PAID', method: 'ONLINE' },
    { custIdx: 2, status: 'STORE_ACCEPTED', daysAgo: 0, hours: 0.2, qty: 1, paid: 'PENDING', method: 'CASH_ON_DELIVERY' },
    { custIdx: 3, status: 'PENDING', daysAgo: 0, hours: 0.05, qty: 2, paid: 'PENDING', method: 'CASH_ON_DELIVERY' },
    { custIdx: 0, status: 'CANCELLED', daysAgo: 2, hours: 0, qty: 2, paid: 'REFUNDED', method: 'ONLINE', cancelReason: 'Customer changed mind' },
    { custIdx: 1, status: 'REJECTED', daysAgo: 1, hours: 5, qty: 3, paid: 'REFUNDED', method: 'ONLINE', rejectReason: 'Out of stock items' },
  ];

  let orderCount = 0;
  const deliveredOrderIds: string[] = [];
  for (const cfg of orderConfigs) {
    const customer = customers[cfg.custIdx];
    const items = rajuStoreItems.slice(0, cfg.qty);
    const subtotal = items.reduce((s, i) => s + i.price * 2, 0);
    const deliveryFee = 30;
    const commission = Math.round(subtotal * 0.10);
    const total = subtotal + deliveryFee;
    const createdAt = new Date(Date.now() - cfg.daysAgo * 86400000 - cfg.hours * 3600000);

    const wasAssigned = ['DELIVERED', 'PICKED_UP', 'DRIVER_ASSIGNED'].includes(cfg.status);
    const wasAccepted = !['PENDING', 'CANCELLED', 'REJECTED'].includes(cfg.status);
    const driverId = wasAssigned ? drivers[0].id : null;

    const order = await prisma.order.create({
      data: {
        customerId: customer.user.id,
        storeId: stores[0].id,
        driverId,
        status: cfg.status as any,
        subtotal, deliveryFee, commission, total,
        paymentMethod: cfg.method as any, paymentStatus: cfg.paid as any,
        deliveryAddressId: customer.address.id,
        notes: '',
        cancelReason: cfg.cancelReason || null,
        rejectionReason: cfg.rejectReason || null,
        dropoffOtp: wasAccepted ? generateOtp4() : null,
        storeAcceptedAt: wasAccepted ? createdAt : null,
        driverAssignedAt: wasAssigned ? createdAt : null,
        pickedUpAt: ['DELIVERED', 'PICKED_UP'].includes(cfg.status) ? createdAt : null,
        deliveredAt: cfg.status === 'DELIVERED' ? createdAt : null,
        createdAt,
        items: {
          create: items.map((it) => ({
            itemId: it.id,
            name: it.catalogItem.name,
            price: it.price,
            unit: it.catalogItem.defaultUnit,
            qty: 2,
          })),
        },
      },
    });
    if (cfg.status === 'DELIVERED') deliveredOrderIds.push(order.id);
    orderCount++;
  }
  console.log(`✓ ${orderCount} sample orders (every status, with dropoffOtp)`);

  // ─── 8. RATINGS ──────────────────────────────────────────────────────
  let ratingCount = 0;
  for (let i = 0; i < deliveredOrderIds.length - 1; i++) {
    const order = await prisma.order.findUnique({ where: { id: deliveredOrderIds[i] } });
    if (!order) continue;
    await prisma.orderRating.create({
      data: {
        orderId: order.id, customerId: order.customerId,
        storeRating: 4 + Math.floor(Math.random() * 2),
        driverRating: 4 + Math.floor(Math.random() * 2),
        storeComment: 'Quick delivery, fresh items!',
        driverComment: 'Friendly driver',
      },
    });
    ratingCount++;
  }
  console.log(`✓ ${ratingCount} ratings on past orders`);

  // ─── 9. NOTIFICATIONS ─────────────────────────────────────────────────
  const pendingStore = stores.find((s) => s.name.includes('Sunita')) ?? stores[stores.length - 1];
  const pendingDriver = drivers.find((d) => d.user?.name?.includes('Vikas')) ?? drivers[drivers.length - 1];
  const notifs = [
    {
      userId: admin.id,
      title: 'New store awaiting approval',
      body: 'Sunita Provision Store registered.',
      data: { event: 'ADMIN_NEW_STORE_PENDING', storeId: pendingStore.id },
    },
    {
      userId: admin.id,
      title: 'New driver awaiting approval',
      body: 'Vikas Kumar (BIKE) registered.',
      data: { event: 'ADMIN_NEW_DRIVER_PENDING', driverId: pendingDriver.id },
    },
    {
      userId: customers[0].user.id,
      title: 'Order delivered!',
      body: 'Your order from Raju\'s Kirana has been delivered.',
    },
    {
      userId: customers[1].user.id,
      title: 'Driver assigned',
      body: 'Mukesh Sharma is on the way.',
    },
    {
      userId: drivers[0].userId,
      title: 'New delivery request',
      body: 'Pickup from Raju\'s Kirana, ₹85 earnings.',
    },
    {
      userId: stores[0].ownerId,
      title: 'New order received',
      body: 'Order awaiting acceptance — accept within 3 minutes.',
    },
  ];
  for (const n of notifs) {
    await prisma.notification.create({ data: { ...n, isRead: Math.random() > 0.5 } });
  }

  // ─── 10. PROMO CODES ──────────────────────────────────────────────────
  await prisma.promo.create({
    data: {
      code: 'WELCOME50',
      description: 'Flat ₹50 off — welcome offer',
      discountType: 'FLAT',
      discountValue: 50,
      minOrderValue: 150,
      perUserLimit: 1,
      isActive: true,
    },
  });
  await prisma.promo.create({
    data: {
      code: 'SAVE10',
      description: '10% off — capped at ₹100',
      discountType: 'PERCENT',
      discountValue: 10,
      maxDiscount: 100,
      minOrderValue: 100,
      isActive: true,
    },
  });
  await prisma.promo.create({
    data: {
      code: 'KIRANA20',
      description: '20% off — capped at ₹50, min order ₹200',
      discountType: 'PERCENT',
      discountValue: 20,
      maxDiscount: 50,
      minOrderValue: 200,
      isActive: true,
    },
  });
  console.log(`✓ 3 promo codes seeded (WELCOME50, SAVE10, KIRANA20)`);

  // ─── 11. NAMED TEST TRIO — Zaheer / Baqala / Chotu ───────────────────
  // Three closely-located entities so end-to-end testing is deterministic.
  // Coordinates: ~27.6033 / 75.4944 (Khandela town centre, Sikar district,
  // Rajasthan — within 100m of each other so dispatch always matches).

  // 11.1 Customer — Zaheer
  const zaheer = await prisma.user.create({
    data: {
      phone: '8888888881',
      name: 'Zaheer Khan',
      role: 'CUSTOMER',
      isActive: true,
    },
  });
  await prisma.address.create({
    data: {
      userId: zaheer.id,
      label: 'Home',
      street: 'House 14, Bus Stand Road, Khandela',
      city: 'Khandela',
      state: 'Rajasthan',
      pincode: '332702',
      // Khandela town centre — ~70 m from Baqala, the test store
      lat: 27.6038,
      lng: 75.4949,
      isDefault: true,
    },
  });
  await prisma.address.create({
    data: {
      userId: zaheer.id,
      label: 'Office',
      street: 'Shop 12, Sikar Road',
      city: 'Sikar',
      state: 'Rajasthan',
      pincode: '332001',
      // Sikar town — ~30 km from Khandela. A "far" address for testing
      // the distance-ranked dispatch and city-wide fallback.
      lat: 27.6094,
      lng: 75.1399,
      isDefault: false,
    },
  });
  console.log('✓ Customer "Zaheer Khan" (8888888881) with Home + Office addresses');

  // 11.2 Store — Baqala (well-stocked)
  const baqalaOwner = await prisma.user.create({
    data: {
      phone: '8888888882',
      name: 'Baqala Owner',
      role: 'STORE_OWNER',
      isActive: true,
    },
  });
  const baqalaStore = await prisma.store.create({
    data: {
      ownerId: baqalaOwner.id,
      name: 'Baqala — The Corner Shop',
      description: 'Your friendly neighbourhood kirana — open 7am to 11pm',
      category: 'GROCERY',
      lat: 27.6033, // Khandela town centre — ~70m from Zaheer's home
      lng: 75.4944,
      street: 'Main Bazaar, Khandela',
      city: 'Khandela',
      state: 'Rajasthan',
      pincode: '332702',
      status: 'ACTIVE',
      isOpen: true,
      openTime: '07:00',
      closeTime: '23:00',
      rating: 4.8,
      totalRatings: 247,
    },
  });
  // Stock Baqala with the entire catalog at competitive prices
  const allCatalog = await prisma.catalogItem.findMany();
  for (const c of allCatalog) {
    const basePrice: Record<string, number> = {
      'Basmati Rice Premium': 115, 'Toor Dal': 90, 'Sugar': 42, 'Sunflower Oil': 175,
      'Britannia Bread': 32, 'Amul Butter': 54, 'Atta (Wheat Flour)': 240, 'Salt Tata': 20,
      'Onions': 38, 'Potatoes': 28, 'Tomatoes': 24, 'Eggs (12 pcs)': 80,
      'Tea Powder Tata': 270, 'Coffee Nescafe': 160, 'Bisleri Water': 18, 'Coca-Cola': 38,
      'Milk Amul (1L)': 64, 'Maggi Noodles': 14, 'Parle-G Biscuits': 10, 'Lays Chips': 28,
      'Kurkure': 18, 'Oreo Cookies': 28, 'Toothpaste Colgate': 88, 'Surf Excel Detergent': 215,
      'Dettol Soap': 42, 'Vim Dishwash': 28, 'Harpic Toilet Cleaner': 105, 'Tissue Papers': 60,
      'Paracetamol 500mg': 24, 'Crocin Advance': 34, 'Dolo 650': 28, 'Vicks Vaporub': 62,
      'Band-Aid Pack': 42, 'ORS Sachets': 18,
    };
    await prisma.storeItem.create({
      data: {
        storeId: baqalaStore.id,
        catalogItemId: c.id,
        price: basePrice[c.name] ?? 50,
        stockQty: 50 + Math.floor(Math.random() * 50),
        isAvailable: true,
      },
    });
  }
  console.log(`✓ Store "Baqala" (8888888882) ACTIVE+OPEN, ~70m from Zaheer (Khandela), stocking all ${allCatalog.length} catalog items`);

  // 11.3 Driver — Chotu (ONLINE, near Baqala)
  const chotuUser = await prisma.user.create({
    data: {
      phone: '8888888883',
      name: 'Chotu Singh',
      role: 'DRIVER',
      isActive: true,
    },
  });
  await prisma.driver.create({
    data: {
      userId: chotuUser.id,
      vehicleType: 'BIKE',
      vehicleNumber: 'RJ-23-CH-1234',
      licenseNumber: 'RJ98765432',
      status: 'ONLINE',
      currentLat: 27.6035, // ~30m from Baqala in Khandela town centre
      currentLng: 75.4946,
      rating: 4.9,
      totalRatings: 312,
      totalEarnings: 24800,
    },
  });
  console.log(`✓ Driver "Chotu Singh" (8888888883) ONLINE, BIKE, ~30m from Baqala (Khandela)`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  END-TO-END TEST TRIO (deterministic order routing)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Location:  Khandela, Sikar, Rajasthan (lat ~27.6033, lng ~75.4944)');
  console.log('  Customer:  8888888881  Zaheer Khan');
  console.log('  Store:     8888888882  Baqala — The Corner Shop  (70m away, ALL items)');
  console.log('  Driver:    8888888883  Chotu Singh  (ONLINE, 30m from Baqala)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ─── SUMMARY ──────────────────────────────────────────────────────────
  console.log('\n✅ Seed complete!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  CATALOG MODEL — admin manages master list, stores pick + price');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Admin:      9999999999');
  console.log('  Stores:     9999988881..86  (Raju, Sharma, Anil, Mohan, Sunita-PEND, Vinod-SUSP)');
  console.log('  Drivers:    9999977771..75  (Suresh-ONLINE, Ramesh, Mukesh, Vikas-PEND, Deepak-SUSP)');
  console.log('  Customers:  9999966661..64');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ${catalog.length} catalog items, ${totalStoreItems} store-item records`);
  console.log(`  ${stores.length} stores, ${drivers.length} drivers, ${customers.length} customers`);
  console.log(`  ${orderCount} orders, ${ratingCount} ratings, ${notifs.length} notifications`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
