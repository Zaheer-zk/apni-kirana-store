// Idempotent dummy-data loader: 5 customers, 5 store-owners (each with
// an ACTIVE+OPEN store stocked with the full catalog), and 5 drivers
// — all anchored to Khandela (Sikar district, Rajasthan).
//
// Why a separate script: the main `seed.ts` does a hard reset of every
// table. This one upserts so it can be re-run on an existing dev DB
// without wiping carts, orders, or the existing named-trio fixtures
// (Zaheer / Baqala / Chotu).
//
// Run with:
//   cd backend
//   npx tsx prisma/seed-khandela.ts
//
// Credentials are deterministic — see the bottom of this file for the
// table printed on completion. Same password for everyone:
//   test1234
//
// Phones / emails / usernames are NEW (7777 series) and won't collide
// with the existing 8888 / 9999 series.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = 'test1234';

// Khandela town centre. ±0.0005° ≈ 50m — keeps every store/driver
// well within walking distance of each other for deterministic
// matching during E2E testing.
const KHANDELA = { lat: 27.6033, lng: 75.4944 };

// Small spread so each store/driver/customer has a distinct point on
// the map but they're all in the same zone.
function jitter(base: number, idx: number): number {
  // Deterministic per-index offset so re-runs produce the same coords.
  return base + (idx - 2) * 0.0008; // ±0.0016° (~180m) across 5 items
}

async function main() {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_PROD_SEED !== 'yes'
  ) {
    console.error(
      '✋ Refusing to seed: NODE_ENV=production.\n' +
        '   Pass ALLOW_PROD_SEED=yes only if you really mean it.',
    );
    process.exit(1);
  }

  console.log('🌱 Seeding Khandela zone + 5-5-5 dummy users...\n');

  // ─── 1. Zone ────────────────────────────────────────────────────────
  // Upsert by name (Zone.name is @unique). Free-delivery threshold +
  // commission match the main seed's "real" defaults so the zone is
  // immediately useful in the matching engine.
  const khandelaZone = await prisma.zone.upsert({
    where: { name: 'Khandela' },
    create: {
      name: 'Khandela',
      city: 'Khandela',
      centerLat: KHANDELA.lat,
      centerLng: KHANDELA.lng,
      radiusKm: 5,
      baseDeliveryFee: 30,
      perKmFee: 5,
      commissionRate: 0.1, // 10%
      freeDeliveryThreshold: 299, // free delivery over ₹299
      isActive: true,
    },
    update: {
      // Bring an existing zone in line with our seed numbers in case
      // it drifted in dev. Leaves admin-set freeDeliveryThreshold
      // alone (we only set on create — see above).
      centerLat: KHANDELA.lat,
      centerLng: KHANDELA.lng,
      radiusKm: 5,
      isActive: true,
    },
  });
  console.log(`✓ Zone "Khandela" (${khandelaZone.id})`);

  const password = await bcrypt.hash(PASSWORD, 10);

  // ─── 2. 5 CUSTOMERS ────────────────────────────────────────────────
  const customers: Array<{ name: string; email: string; phone: string; username: string }> = [];
  for (let i = 1; i <= 5; i++) {
    const phone = `777770000${i}`;
    const email = `customer${i}@khandela.test`;
    const username = `customer${i}`;
    const name = `Customer ${i} (Khandela)`;
    const user = await prisma.user.upsert({
      where: { phone_role: { phone, role: 'CUSTOMER' } },
      create: {
        phone,
        email,
        username,
        passwordHash: password,
        name,
        role: 'CUSTOMER',
        roles: ['CUSTOMER'],
        isActive: true,
        phoneVerified: true,
      },
      update: { passwordHash: password, isActive: true, phoneVerified: true },
    });
    // Default address inside Khandela so the zone filter accepts orders.
    const existingAddress = await prisma.address.findFirst({
      where: { userId: user.id, isDefault: true },
    });
    if (!existingAddress) {
      await prisma.address.create({
        data: {
          userId: user.id,
          label: 'Home',
          street: `House ${10 + i}, Khandela`,
          city: 'Khandela',
          state: 'Rajasthan',
          pincode: '332702',
          lat: jitter(KHANDELA.lat, i),
          lng: jitter(KHANDELA.lng, i),
          isDefault: true,
        },
      });
    }
    customers.push({ name, email, phone, username });
  }
  console.log(`✓ 5 customers seeded (customer1..5)`);

  // ─── 3. 5 STORE OWNERS + STORES ────────────────────────────────────
  // Each store is ACTIVE + OPEN and stocked with the entire catalog
  // (so matching always has options). Prices vary slightly per store
  // so multi-store dedup (offerCount / from-₹X) is visible.
  const owners: Array<{ name: string; email: string; phone: string; username: string; storeName: string }> = [];
  const allCatalog = await prisma.catalogItem.findMany({ select: { id: true } });
  const storeNamePool = [
    'Khandela Provision Store',
    'Sharma Kirana Khandela',
    'Royal Mart Khandela',
    'Jain General Store',
    'Bus Stand Bazaar',
  ];
  for (let i = 1; i <= 5; i++) {
    const phone = `777770001${i - 1}`; // 7777700010..14
    const email = `store${i}@khandela.test`;
    const username = `store${i}`;
    const ownerName = `Store Owner ${i}`;
    const storeName = storeNamePool[i - 1]!;
    const owner = await prisma.user.upsert({
      where: { phone_role: { phone, role: 'STORE_OWNER' } },
      create: {
        phone,
        email,
        username,
        passwordHash: password,
        name: ownerName,
        role: 'STORE_OWNER',
        roles: ['STORE_OWNER'],
        isActive: true,
        phoneVerified: true,
      },
      update: { passwordHash: password, isActive: true, phoneVerified: true },
    });
    const store = await prisma.store.upsert({
      where: { ownerId: owner.id },
      create: {
        ownerId: owner.id,
        name: storeName,
        description: `Test store ${i} in Khandela`,
        category: 'GROCERY',
        lat: jitter(KHANDELA.lat, i),
        lng: jitter(KHANDELA.lng, i),
        street: `Shop ${i}, Main Bazaar, Khandela`,
        city: 'Khandela',
        state: 'Rajasthan',
        pincode: '332702',
        status: 'ACTIVE',
        isOpen: true,
        openTime: '07:00',
        closeTime: '22:00',
        rating: 4.0 + (i * 0.15),
        totalRatings: 20 + i * 8,
      },
      update: {
        status: 'ACTIVE',
        isOpen: true,
        lat: jitter(KHANDELA.lat, i),
        lng: jitter(KHANDELA.lng, i),
      },
    });
    // Stock every catalog item — vary the price per-store by a small
    // factor so the catalog-first cards show "from ₹X" hints.
    const priceFactor = 0.9 + i * 0.05; // 0.95, 1.00, 1.05, 1.10, 1.15
    for (const c of allCatalog) {
      await prisma.storeItem.upsert({
        where: { storeId_catalogItemId: { storeId: store.id, catalogItemId: c.id } },
        create: {
          storeId: store.id,
          catalogItemId: c.id,
          price: Math.round(50 * priceFactor),
          stockQty: 30 + Math.floor(Math.random() * 40),
          isAvailable: true,
        },
        update: {
          isAvailable: true,
          // Don't clobber stock on re-runs — that would let the script
          // accidentally "refill" stock that's been intentionally
          // depleted during testing.
        },
      });
    }
    owners.push({ name: ownerName, email, phone, username, storeName });
  }
  console.log(`✓ 5 store owners + stores seeded (store1..5), each stocking ${allCatalog.length} catalog items`);

  // ─── 4. 5 DRIVERS (all ONLINE in Khandela) ─────────────────────────
  const drivers: Array<{ name: string; email: string; phone: string; username: string; vehicleType: string }> = [];
  const vehicleTypes: Array<'BIKE' | 'SCOOTER' | 'CAR' | 'BICYCLE' | 'ON_FOOT'> = [
    'BIKE', 'SCOOTER', 'CAR', 'BICYCLE', 'ON_FOOT',
  ];
  for (let i = 1; i <= 5; i++) {
    const phone = `777770002${i - 1}`; // 7777700020..24
    const email = `driver${i}@khandela.test`;
    const username = `driver${i}`;
    const name = `Driver ${i} (Khandela)`;
    const vehicleType = vehicleTypes[i - 1]!;
    const user = await prisma.user.upsert({
      where: { phone_role: { phone, role: 'DRIVER' } },
      create: {
        phone,
        email,
        username,
        passwordHash: password,
        name,
        role: 'DRIVER',
        roles: ['DRIVER'],
        isActive: true,
        phoneVerified: true,
      },
      update: { passwordHash: password, isActive: true, phoneVerified: true },
    });
    const driver = await prisma.driver.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        vehicleType,
        vehicleNumber: `RJ-23-KH-${1000 + i}`,
        licenseNumber: `RJ-KH-${10000 + i}`,
        status: 'ONLINE',
        currentLat: jitter(KHANDELA.lat, i),
        currentLng: jitter(KHANDELA.lng, i),
        rating: 4.2 + i * 0.1,
        totalRatings: 30 + i * 5,
      },
      update: {
        status: 'ONLINE',
        currentLat: jitter(KHANDELA.lat, i),
        currentLng: jitter(KHANDELA.lng, i),
      },
    });
    // Opt the driver into the Khandela zone so the matching engine
    // sees them as eligible.
    await prisma.driverZone.upsert({
      where: {
        driverId_zoneId: { driverId: driver.id, zoneId: khandelaZone.id },
      },
      create: { driverId: driver.id, zoneId: khandelaZone.id },
      update: {},
    });
    drivers.push({ name, email, phone, username, vehicleType });
  }
  console.log(`✓ 5 drivers seeded (driver1..5), all ONLINE in Khandela zone\n`);

  // ─── 5. CREDENTIALS TABLE ──────────────────────────────────────────
  console.log('━'.repeat(75));
  console.log('  KHANDELA TEST USERS — all share password: ' + PASSWORD);
  console.log('━'.repeat(75));
  console.log('\n  CUSTOMERS');
  console.log('  ' + 'Phone'.padEnd(13) + 'Username'.padEnd(13) + 'Email');
  for (const c of customers) {
    console.log('  ' + c.phone.padEnd(13) + c.username.padEnd(13) + c.email);
  }
  console.log('\n  STORE OWNERS');
  console.log('  ' + 'Phone'.padEnd(13) + 'Username'.padEnd(13) + 'Email'.padEnd(32) + 'Store');
  for (const o of owners) {
    console.log('  ' + o.phone.padEnd(13) + o.username.padEnd(13) + o.email.padEnd(32) + o.storeName);
  }
  console.log('\n  DRIVERS');
  console.log('  ' + 'Phone'.padEnd(13) + 'Username'.padEnd(13) + 'Email'.padEnd(32) + 'Vehicle');
  for (const d of drivers) {
    console.log('  ' + d.phone.padEnd(13) + d.username.padEnd(13) + d.email.padEnd(32) + d.vehicleType);
  }
  console.log('\n' + '━'.repeat(75));
  console.log('  Log in via:');
  console.log('    • phone + OTP (OTP visible in backend logs when SMS_PROVIDER=CONSOLE)');
  console.log('    • username + password (test1234)');
  console.log('    • email + password (test1234) on the surfaces that accept email');
  console.log('━'.repeat(75));
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
