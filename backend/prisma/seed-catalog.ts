/**
 * Production-safe catalog seed.
 *
 *   docker compose --env-file .env.prod -f docker-compose.prod.yml \
 *     exec backend npx tsx prisma/seed-catalog.ts
 *
 * Idempotent — every item is `upsert`-ed by name, so re-running is safe and
 * never overwrites stores' price/stock data (those live in StoreItem, not
 * CatalogItem). Adds ~120 generic kirana products covering staples, dals,
 * spices, dairy, fresh produce, snacks, beverages, household and OTC medicine
 * commonly stocked in Indian neighbourhood stores.
 *
 * Unlike prisma/seed.ts this script does NOT create any users or stores and
 * does NOT delete anything. Safe for production.
 */
import { PrismaClient, ItemCategory } from '@prisma/client';

const prisma = new PrismaClient();

interface SeedItem {
  name: string;
  category: ItemCategory;
  defaultUnit: string;
  description?: string;
}

const items: SeedItem[] = [
  // ─── Grocery: staples, dals, flours ─────────────────────────────────────
  { name: 'Basmati Rice Premium 5kg',      category: 'GROCERY', defaultUnit: '5kg' },
  { name: 'Sona Masoori Rice 5kg',         category: 'GROCERY', defaultUnit: '5kg' },
  { name: 'Toor Dal 1kg',                  category: 'GROCERY', defaultUnit: '1kg' },
  { name: 'Moong Dal 1kg',                 category: 'GROCERY', defaultUnit: '1kg' },
  { name: 'Chana Dal 1kg',                 category: 'GROCERY', defaultUnit: '1kg' },
  { name: 'Urad Dal 1kg',                  category: 'GROCERY', defaultUnit: '1kg' },
  { name: 'Masoor Dal 1kg',                category: 'GROCERY', defaultUnit: '1kg' },
  { name: 'Rajma 500g',                    category: 'GROCERY', defaultUnit: '500g' },
  { name: 'Kabuli Chana 500g',             category: 'GROCERY', defaultUnit: '500g' },
  { name: 'Black Chana 500g',              category: 'GROCERY', defaultUnit: '500g' },
  { name: 'Aashirvaad Atta 5kg',           category: 'GROCERY', defaultUnit: '5kg' },
  { name: 'Maida 1kg',                     category: 'GROCERY', defaultUnit: '1kg' },
  { name: 'Sooji (Semolina) 500g',         category: 'GROCERY', defaultUnit: '500g' },
  { name: 'Besan (Gram Flour) 500g',       category: 'GROCERY', defaultUnit: '500g' },
  { name: 'Poha 500g',                     category: 'GROCERY', defaultUnit: '500g' },
  { name: 'Dalia 500g',                    category: 'GROCERY', defaultUnit: '500g' },

  // ─── Grocery: oils, ghee, sugar, salt ───────────────────────────────────
  { name: 'Sunflower Oil 1L',              category: 'GROCERY', defaultUnit: '1L' },
  { name: 'Mustard Oil 1L',                category: 'GROCERY', defaultUnit: '1L' },
  { name: 'Refined Oil 1L',                category: 'GROCERY', defaultUnit: '1L' },
  { name: 'Coconut Oil 500ml',             category: 'GROCERY', defaultUnit: '500ml' },
  { name: 'Amul Ghee 500g',                category: 'GROCERY', defaultUnit: '500g' },
  { name: 'Sugar 1kg',                     category: 'GROCERY', defaultUnit: '1kg' },
  { name: 'Jaggery (Gud) 500g',            category: 'GROCERY', defaultUnit: '500g' },
  { name: 'Tata Salt 1kg',                 category: 'GROCERY', defaultUnit: '1kg' },
  { name: 'Black Salt 100g',               category: 'GROCERY', defaultUnit: '100g' },

  // ─── Grocery: spices ────────────────────────────────────────────────────
  { name: 'Turmeric (Haldi) Powder 200g',  category: 'GROCERY', defaultUnit: '200g' },
  { name: 'Red Chilli Powder 200g',        category: 'GROCERY', defaultUnit: '200g' },
  { name: 'Coriander (Dhania) Powder 200g',category: 'GROCERY', defaultUnit: '200g' },
  { name: 'Cumin (Jeera) Seeds 100g',      category: 'GROCERY', defaultUnit: '100g' },
  { name: 'Mustard (Rai) Seeds 100g',      category: 'GROCERY', defaultUnit: '100g' },
  { name: 'Black Pepper Powder 100g',      category: 'GROCERY', defaultUnit: '100g' },
  { name: 'Cardamom (Elaichi) 50g',        category: 'GROCERY', defaultUnit: '50g' },
  { name: 'Cloves (Laung) 50g',            category: 'GROCERY', defaultUnit: '50g' },
  { name: 'Cinnamon (Dalchini) 50g',       category: 'GROCERY', defaultUnit: '50g' },
  { name: 'Bay Leaves (Tej Patta) 25g',    category: 'GROCERY', defaultUnit: '25g' },
  { name: 'Garam Masala 100g',             category: 'GROCERY', defaultUnit: '100g' },
  { name: 'Hing (Asafoetida) 25g',         category: 'GROCERY', defaultUnit: '25g' },
  { name: 'Pav Bhaji Masala 100g',         category: 'GROCERY', defaultUnit: '100g' },
  { name: 'Chaat Masala 100g',             category: 'GROCERY', defaultUnit: '100g' },
  { name: 'Sambhar Masala 100g',           category: 'GROCERY', defaultUnit: '100g' },
  { name: 'Kasuri Methi 50g',              category: 'GROCERY', defaultUnit: '50g' },

  // ─── Grocery: tea, coffee, health drinks, dry fruits ────────────────────
  { name: 'Tata Tea Premium 250g',         category: 'GROCERY', defaultUnit: '250g' },
  { name: 'Red Label Tea 250g',            category: 'GROCERY', defaultUnit: '250g' },
  { name: 'Tetley Tea 250g',               category: 'GROCERY', defaultUnit: '250g' },
  { name: 'Nescafe Classic Coffee 100g',   category: 'GROCERY', defaultUnit: '100g' },
  { name: 'Bru Instant Coffee 100g',       category: 'GROCERY', defaultUnit: '100g' },
  { name: 'Bournvita 500g',                category: 'GROCERY', defaultUnit: '500g' },
  { name: 'Horlicks 500g',                 category: 'GROCERY', defaultUnit: '500g' },
  { name: 'Almonds 250g',                  category: 'GROCERY', defaultUnit: '250g' },
  { name: 'Cashews 250g',                  category: 'GROCERY', defaultUnit: '250g' },
  { name: 'Raisins 250g',                  category: 'GROCERY', defaultUnit: '250g' },
  { name: 'Dates (Khajoor) 250g',          category: 'GROCERY', defaultUnit: '250g' },
  { name: 'Walnuts 250g',                  category: 'GROCERY', defaultUnit: '250g' },

  // ─── Grocery: dairy & bakery ────────────────────────────────────────────
  { name: 'Amul Milk Toned 1L',            category: 'GROCERY', defaultUnit: '1L' },
  { name: 'Amul Curd 500g',                category: 'GROCERY', defaultUnit: '500g' },
  { name: 'Amul Paneer 200g',              category: 'GROCERY', defaultUnit: '200g' },
  { name: 'Amul Butter 100g',              category: 'GROCERY', defaultUnit: '100g' },
  { name: 'Britannia Cheese Slices 100g',  category: 'GROCERY', defaultUnit: '100g' },
  { name: 'Britannia Bread',               category: 'GROCERY', defaultUnit: '1 loaf' },
  { name: 'Pav Buns (6 pcs)',              category: 'GROCERY', defaultUnit: '6 pcs' },
  { name: 'Eggs (12 pcs)',                 category: 'GROCERY', defaultUnit: '12 pcs' },
  { name: 'Dabur Honey 250g',              category: 'GROCERY', defaultUnit: '250g' },
  { name: 'Mango Pickle 500g',             category: 'GROCERY', defaultUnit: '500g' },
  { name: 'Maggi Tomato Ketchup 1kg',      category: 'GROCERY', defaultUnit: '1kg' },

  // ─── Grocery: vegetables ────────────────────────────────────────────────
  { name: 'Onions 1kg',                    category: 'GROCERY', defaultUnit: '1kg' },
  { name: 'Potatoes 1kg',                  category: 'GROCERY', defaultUnit: '1kg' },
  { name: 'Tomatoes 1kg',                  category: 'GROCERY', defaultUnit: '1kg' },
  { name: 'Ginger 250g',                   category: 'GROCERY', defaultUnit: '250g' },
  { name: 'Garlic 250g',                   category: 'GROCERY', defaultUnit: '250g' },
  { name: 'Lemon 250g',                    category: 'GROCERY', defaultUnit: '250g' },
  { name: 'Green Chillies 100g',           category: 'GROCERY', defaultUnit: '100g' },
  { name: 'Coriander Leaves 100g',         category: 'GROCERY', defaultUnit: '100g' },
  { name: 'Spinach (Palak) 250g',          category: 'GROCERY', defaultUnit: '250g' },
  { name: 'Cabbage',                       category: 'GROCERY', defaultUnit: '1 pc' },
  { name: 'Cauliflower',                   category: 'GROCERY', defaultUnit: '1 pc' },
  { name: 'Carrot 500g',                   category: 'GROCERY', defaultUnit: '500g' },
  { name: 'Cucumber 500g',                 category: 'GROCERY', defaultUnit: '500g' },
  { name: 'Capsicum 250g',                 category: 'GROCERY', defaultUnit: '250g' },
  { name: 'Brinjal (Baingan) 500g',        category: 'GROCERY', defaultUnit: '500g' },
  { name: 'Bhindi (Ladyfinger) 500g',      category: 'GROCERY', defaultUnit: '500g' },

  // ─── Grocery: fruits ────────────────────────────────────────────────────
  { name: 'Apple 1kg',                     category: 'GROCERY', defaultUnit: '1kg' },
  { name: 'Banana (1 dozen)',              category: 'GROCERY', defaultUnit: '12 pcs' },
  { name: 'Orange 1kg',                    category: 'GROCERY', defaultUnit: '1kg' },
  { name: 'Mango 1kg',                     category: 'GROCERY', defaultUnit: '1kg' },
  { name: 'Watermelon',                    category: 'GROCERY', defaultUnit: '1 pc' },

  // ─── Snacks ─────────────────────────────────────────────────────────────
  { name: 'Parle-G Biscuits 100g',         category: 'SNACKS', defaultUnit: '100g' },
  { name: 'Britannia Marie Gold 250g',     category: 'SNACKS', defaultUnit: '250g' },
  { name: 'Hide & Seek 100g',              category: 'SNACKS', defaultUnit: '100g' },
  { name: 'Britannia Good Day 100g',       category: 'SNACKS', defaultUnit: '100g' },
  { name: 'Bourbon Biscuits 150g',         category: 'SNACKS', defaultUnit: '150g' },
  { name: 'Oreo Cookies 120g',             category: 'SNACKS', defaultUnit: '120g' },
  { name: 'Lays Chips 50g',                category: 'SNACKS', defaultUnit: '50g' },
  { name: 'Kurkure Masala Munch 50g',      category: 'SNACKS', defaultUnit: '50g' },
  { name: 'Haldiram Bhujia 200g',          category: 'SNACKS', defaultUnit: '200g' },
  { name: 'Aloo Bhujia 200g',              category: 'SNACKS', defaultUnit: '200g' },
  { name: 'Cadbury Dairy Milk 50g',        category: 'SNACKS', defaultUnit: '50g' },
  { name: 'KitKat 4-Finger',               category: 'SNACKS', defaultUnit: '1 pc' },
  { name: '5 Star Chocolate 25g',          category: 'SNACKS', defaultUnit: '25g' },
  { name: 'Maggi 2-Min Noodles 280g',      category: 'SNACKS', defaultUnit: '280g' },
  { name: 'Yippee Noodles 280g',           category: 'SNACKS', defaultUnit: '280g' },
  { name: 'Top Ramen Noodles 280g',        category: 'SNACKS', defaultUnit: '280g' },

  // ─── Beverages ──────────────────────────────────────────────────────────
  { name: 'Coca-Cola 750ml',               category: 'BEVERAGES', defaultUnit: '750ml' },
  { name: 'Pepsi 750ml',                   category: 'BEVERAGES', defaultUnit: '750ml' },
  { name: 'Sprite 750ml',                  category: 'BEVERAGES', defaultUnit: '750ml' },
  { name: 'Thums Up 750ml',                category: 'BEVERAGES', defaultUnit: '750ml' },
  { name: 'Limca 750ml',                   category: 'BEVERAGES', defaultUnit: '750ml' },
  { name: 'Frooti 200ml',                  category: 'BEVERAGES', defaultUnit: '200ml' },
  { name: 'Maaza 600ml',                   category: 'BEVERAGES', defaultUnit: '600ml' },
  { name: 'Real Mixed Fruit Juice 1L',     category: 'BEVERAGES', defaultUnit: '1L' },
  { name: 'Bisleri Water 1L',              category: 'BEVERAGES', defaultUnit: '1L' },
  { name: 'Aquafina Water 1L',             category: 'BEVERAGES', defaultUnit: '1L' },
  { name: 'Red Bull 250ml',                category: 'BEVERAGES', defaultUnit: '250ml' },

  // ─── Household: detergents & cleaners ───────────────────────────────────
  { name: 'Surf Excel Matic 1kg',          category: 'HOUSEHOLD', defaultUnit: '1kg' },
  { name: 'Ariel Detergent 1kg',           category: 'HOUSEHOLD', defaultUnit: '1kg' },
  { name: 'Tide Plus 1kg',                 category: 'HOUSEHOLD', defaultUnit: '1kg' },
  { name: 'Ghadi Detergent 1kg',           category: 'HOUSEHOLD', defaultUnit: '1kg' },
  { name: 'Vim Bar 200g',                  category: 'HOUSEHOLD', defaultUnit: '200g' },
  { name: 'Vim Liquid Dishwash 500ml',     category: 'HOUSEHOLD', defaultUnit: '500ml' },
  { name: 'Pril Dishwash 500ml',           category: 'HOUSEHOLD', defaultUnit: '500ml' },
  { name: 'Harpic Toilet Cleaner 500ml',   category: 'HOUSEHOLD', defaultUnit: '500ml' },
  { name: 'Lizol Floor Cleaner 500ml',     category: 'HOUSEHOLD', defaultUnit: '500ml' },
  { name: 'Phenyl 1L',                     category: 'HOUSEHOLD', defaultUnit: '1L' },

  // ─── Household: personal care ───────────────────────────────────────────
  { name: 'Lifebuoy Soap 125g',            category: 'HOUSEHOLD', defaultUnit: '125g' },
  { name: 'Lux Soap 100g',                 category: 'HOUSEHOLD', defaultUnit: '100g' },
  { name: 'Dettol Soap 75g',               category: 'HOUSEHOLD', defaultUnit: '75g' },
  { name: 'Dove Soap 100g',                category: 'HOUSEHOLD', defaultUnit: '100g' },
  { name: 'Santoor Soap 100g',             category: 'HOUSEHOLD', defaultUnit: '100g' },
  { name: 'Cinthol Soap 100g',             category: 'HOUSEHOLD', defaultUnit: '100g' },
  { name: 'Sunsilk Shampoo 180ml',         category: 'HOUSEHOLD', defaultUnit: '180ml' },
  { name: 'Pantene Shampoo 180ml',         category: 'HOUSEHOLD', defaultUnit: '180ml' },
  { name: 'Head & Shoulders Shampoo 180ml',category: 'HOUSEHOLD', defaultUnit: '180ml' },
  { name: 'Clinic Plus Shampoo 175ml',     category: 'HOUSEHOLD', defaultUnit: '175ml' },
  { name: 'Dove Shampoo 180ml',            category: 'HOUSEHOLD', defaultUnit: '180ml' },
  { name: 'Colgate Toothpaste 100g',       category: 'HOUSEHOLD', defaultUnit: '100g' },
  { name: 'Pepsodent Toothpaste 100g',     category: 'HOUSEHOLD', defaultUnit: '100g' },
  { name: 'Sensodyne Toothpaste 75g',      category: 'HOUSEHOLD', defaultUnit: '75g' },
  { name: 'Close-Up Toothpaste 80g',       category: 'HOUSEHOLD', defaultUnit: '80g' },
  { name: 'Colgate Toothbrush',            category: 'HOUSEHOLD', defaultUnit: '1 pc' },
  { name: 'Parachute Coconut Oil 250ml',   category: 'HOUSEHOLD', defaultUnit: '250ml' },
  { name: 'Dabur Amla Hair Oil 200ml',     category: 'HOUSEHOLD', defaultUnit: '200ml' },
  { name: 'Vatika Hair Oil 200ml',         category: 'HOUSEHOLD', defaultUnit: '200ml' },
  { name: 'Gillette Razor',                category: 'HOUSEHOLD', defaultUnit: '1 pc' },
  { name: 'Whisper Sanitary Pads (15 pc)', category: 'HOUSEHOLD', defaultUnit: '15 pc' },
  { name: 'Stayfree Sanitary Pads (15 pc)',category: 'HOUSEHOLD', defaultUnit: '15 pc' },

  // ─── Household: other ───────────────────────────────────────────────────
  { name: 'Good Knight Activ+ Refill',     category: 'HOUSEHOLD', defaultUnit: '1 pc' },
  { name: 'Mortein Coil',                  category: 'HOUSEHOLD', defaultUnit: '10 pc' },
  { name: 'All Out Refill',                category: 'HOUSEHOLD', defaultUnit: '1 pc' },
  { name: 'Tissue Paper Box (100 pc)',     category: 'HOUSEHOLD', defaultUnit: '100 pc' },
  { name: 'Garbage Bags (30 pc)',          category: 'HOUSEHOLD', defaultUnit: '30 pc' },
  { name: 'Matchbox (10 pc)',              category: 'HOUSEHOLD', defaultUnit: '10 pc' },
  { name: 'Cycle Agarbatti',               category: 'HOUSEHOLD', defaultUnit: '1 pack' },
  { name: 'Aluminium Foil Roll 18m',       category: 'HOUSEHOLD', defaultUnit: '18m' },

  // ─── Medicine (OTC) ─────────────────────────────────────────────────────
  { name: 'Paracetamol 500mg (10 tabs)',   category: 'MEDICINE', defaultUnit: '10 tabs' },
  { name: 'Crocin Advance (15 tabs)',      category: 'MEDICINE', defaultUnit: '15 tabs' },
  { name: 'Dolo 650 (15 tabs)',            category: 'MEDICINE', defaultUnit: '15 tabs' },
  { name: 'Combiflam (10 tabs)',           category: 'MEDICINE', defaultUnit: '10 tabs' },
  { name: 'Vicks Vaporub 50ml',            category: 'MEDICINE', defaultUnit: '50ml' },
  { name: 'Strepsils Lozenges (8 pc)',     category: 'MEDICINE', defaultUnit: '8 pc' },
  { name: 'Band-Aid (20 strips)',          category: 'MEDICINE', defaultUnit: '20 strips' },
  { name: 'Dettol Antiseptic 250ml',       category: 'MEDICINE', defaultUnit: '250ml' },
  { name: 'Savlon Antiseptic 250ml',       category: 'MEDICINE', defaultUnit: '250ml' },
  { name: 'Volini Spray 60g',              category: 'MEDICINE', defaultUnit: '60g' },
  { name: 'Moov Cream 50g',                category: 'MEDICINE', defaultUnit: '50g' },
  { name: 'Iodex 16g',                     category: 'MEDICINE', defaultUnit: '16g' },
  { name: 'ORS Sachets (5 pc)',            category: 'MEDICINE', defaultUnit: '5 pc' },
  { name: 'Eno Sachet 5g',                 category: 'MEDICINE', defaultUnit: '5g' },
  { name: 'Pudin Hara Capsules (10 pc)',   category: 'MEDICINE', defaultUnit: '10 pc' },
  { name: 'Cetirizine (10 tabs)',          category: 'MEDICINE', defaultUnit: '10 tabs' },
  { name: 'Allegra 120 (10 tabs)',         category: 'MEDICINE', defaultUnit: '10 tabs' },
  { name: 'Benadryl Cough Syrup 100ml',    category: 'MEDICINE', defaultUnit: '100ml' },
  { name: 'Honitus Cough Drops (10 pc)',   category: 'MEDICINE', defaultUnit: '10 pc' },
];

async function main(): Promise<void> {
  let created = 0;
  let already = 0;

  for (const item of items) {
    const existing = await prisma.catalogItem.findUnique({
      where: { name: item.name },
      select: { id: true },
    });
    if (existing) {
      already += 1;
      continue;
    }
    await prisma.catalogItem.create({ data: item });
    created += 1;
  }

  console.log(`✓ Catalog seed complete — ${created} added, ${already} already present (${items.length} total).`);
}

main()
  .catch((err) => {
    console.error('Catalog seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
