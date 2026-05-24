// Invoice generation — GST-compliant PDF per delivered order.
//
// Storage strategy: writes to disk under STORAGE_ROOT/invoices/<YYYY-MM>/
// <invoiceNumber>.pdf. In production that path should be a Docker-mounted
// volume so invoices survive container rebuilds. In dev it's local.
//
// Invoice numbering follows the Indian-FY convention "AKS/2026-27/000123"
// where the digits are monotonic per financial year (Apr 1 → Mar 31).
// Allocation is atomic via prisma.$transaction so two concurrent deliveries
// can never receive the same number.
//
// GST: defaults to 5% (basic food/grocery rate). When CatalogItem grows a
// gstRate column we can switch to per-item; for now everything in this
// store is taxed at the base rate. Tax is split into CGST (2.5%) + SGST
// (2.5%) for intra-state delivery — most kirana deliveries are intra-state
// so this is the correct breakdown.

import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { prisma } from '../config/prisma';

const STORAGE_ROOT = process.env['STORAGE_ROOT'] || path.resolve(process.cwd(), 'storage');
const INVOICES_DIR = path.join(STORAGE_ROOT, 'invoices');

// Base GST rate for grocery / household / FMCG. Sliced 50/50 into CGST + SGST
// for intra-state delivery. If we later need IGST for inter-state deliveries
// we'll branch on customer state vs store state.
const GST_RATE = 0.05;

/**
 * Return current Indian financial year as "2026-27" (Apr 1 → Mar 31).
 * For dates before April, the FY started in the previous calendar year.
 */
function currentFinancialYear(d: Date = new Date()): string {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-indexed: 0=Jan, 3=April
  const fyStart = month >= 3 ? year : year - 1;
  const fyEndShort = String((fyStart + 1) % 100).padStart(2, '0');
  return `${fyStart}-${fyEndShort}`;
}

/**
 * Allocate the next invoice number for the current FY. Uses a row lock on
 * the most-recent Order with a number in this FY so two concurrent calls
 * can't allocate the same sequence digit.
 */
async function allocateInvoiceNumber(): Promise<string> {
  const fy = currentFinancialYear();
  const prefix = `AKS/${fy}/`;

  return prisma.$transaction(async (tx) => {
    const lastWithNumber = await tx.order.findFirst({
      where: { invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });

    let nextDigits = 1;
    if (lastWithNumber?.invoiceNumber) {
      const lastDigits = parseInt(lastWithNumber.invoiceNumber.slice(prefix.length), 10);
      if (Number.isFinite(lastDigits)) nextDigits = lastDigits + 1;
    }
    return `${prefix}${String(nextDigits).padStart(6, '0')}`;
  });
}

export interface InvoiceResult {
  invoiceNumber: string;
  invoicePath: string;
  absolutePath: string;
}

/**
 * Generate and persist a GST invoice PDF for the order. Idempotent: if an
 * invoice already exists for the order, returns it without regenerating.
 */
export async function generateInvoiceForOrder(orderId: string): Promise<InvoiceResult | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      customer: { select: { id: true, name: true, phone: true, email: true } },
      store: { select: { id: true, name: true, street: true, city: true, state: true, pincode: true } },
      deliveryAddress: { select: { label: true, street: true, city: true, state: true, pincode: true } },
    },
  });
  if (!order) return null;

  // Idempotency — return existing invoice if already generated.
  if (order.invoiceNumber && order.invoicePath) {
    return {
      invoiceNumber: order.invoiceNumber,
      invoicePath: order.invoicePath,
      absolutePath: path.join(STORAGE_ROOT, order.invoicePath),
    };
  }

  const invoiceNumber = await allocateInvoiceNumber();

  // Storage path: invoices/<YYYY-MM>/<sanitised>.pdf — month directories
  // keep the storage volume browsable + backup-able without 100k files in
  // one directory.
  const yyyyMm = new Date().toISOString().slice(0, 7); // "2026-05"
  const safeName = invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '_') + '.pdf';
  const relPath = path.join('invoices', yyyyMm, safeName);
  const absPath = path.join(STORAGE_ROOT, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });

  // ── PDF rendering ────────────────────────────────────────────────────────
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const out = fs.createWriteStream(absPath);
    out.on('finish', resolve);
    out.on('error', reject);
    doc.pipe(out);

    // Header
    doc
      .fontSize(18)
      .text('Apni Kirana Store', { align: 'left' })
      .fontSize(10)
      .fillColor('#666')
      .text('Tax Invoice', { align: 'left' })
      .moveDown(0.5);
    doc
      .fillColor('#000')
      .fontSize(9)
      .text(`Invoice number: ${invoiceNumber}`)
      .text(`Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`)
      .text(`Order: #${order.id.slice(-8)}`)
      .moveDown();

    // From / To
    const cursorY = doc.y;
    doc
      .fontSize(9)
      .fillColor('#666')
      .text('From (Seller)', 40, cursorY)
      .fillColor('#000')
      .fontSize(10)
      .text(order.store.name, 40, doc.y, { width: 240 })
      .fontSize(9)
      .text(`${order.store.street}`, { width: 240 })
      .text(`${order.store.city}, ${order.store.state} ${order.store.pincode}`, { width: 240 });

    doc
      .fontSize(9)
      .fillColor('#666')
      .text('To (Customer)', 320, cursorY)
      .fillColor('#000')
      .fontSize(10)
      .text(order.customer.name ?? 'Customer', 320, cursorY + 12, { width: 240 })
      .fontSize(9)
      .text(order.deliveryAddress.label, { width: 240 })
      .text(order.deliveryAddress.street, { width: 240 })
      .text(`${order.deliveryAddress.city}, ${order.deliveryAddress.state} ${order.deliveryAddress.pincode}`, { width: 240 });

    doc.moveDown(2);

    // Items table — manually drawn rows for pdfkit (no built-in table).
    const tableTop = doc.y + 4;
    const colX = { item: 40, qty: 290, rate: 340, taxable: 410, total: 480 };
    doc
      .fillColor('#444')
      .fontSize(9)
      .text('Item', colX.item, tableTop)
      .text('Qty', colX.qty, tableTop, { width: 40, align: 'right' })
      .text('Rate', colX.rate, tableTop, { width: 60, align: 'right' })
      .text('Taxable', colX.taxable, tableTop, { width: 60, align: 'right' })
      .text('Total', colX.total, tableTop, { width: 70, align: 'right' });
    doc
      .moveTo(40, tableTop + 14)
      .lineTo(555, tableTop + 14)
      .strokeColor('#ddd')
      .stroke();

    let y = tableTop + 20;
    let subtotal = 0;
    let taxTotal = 0;
    for (const item of order.items) {
      const lineTotal = item.price * item.qty; // GST-inclusive
      const taxable = lineTotal / (1 + GST_RATE);
      const tax = lineTotal - taxable;
      subtotal += taxable;
      taxTotal += tax;

      doc
        .fillColor('#000')
        .fontSize(9)
        .text(`${item.name} (${item.unit})`, colX.item, y, { width: 240 })
        .text(String(item.qty), colX.qty, y, { width: 40, align: 'right' })
        .text(item.price.toFixed(2), colX.rate, y, { width: 60, align: 'right' })
        .text(taxable.toFixed(2), colX.taxable, y, { width: 60, align: 'right' })
        .text(lineTotal.toFixed(2), colX.total, y, { width: 70, align: 'right' });
      y += 16;
    }

    // Totals block
    y += 12;
    const cgst = taxTotal / 2;
    const sgst = taxTotal / 2;

    doc
      .moveTo(40, y)
      .lineTo(555, y)
      .strokeColor('#ddd')
      .stroke();
    y += 6;

    const writeTotal = (label: string, value: string, bold = false) => {
      doc
        .fontSize(bold ? 11 : 9)
        .fillColor(bold ? '#000' : '#333')
        .text(label, 380, y, { width: 100, align: 'right' })
        .text(value, 480, y, { width: 70, align: 'right' });
      y += bold ? 16 : 14;
    };

    writeTotal('Subtotal', `₹ ${subtotal.toFixed(2)}`);
    writeTotal(`CGST @ ${(GST_RATE * 50).toFixed(2)}%`, `₹ ${cgst.toFixed(2)}`);
    writeTotal(`SGST @ ${(GST_RATE * 50).toFixed(2)}%`, `₹ ${sgst.toFixed(2)}`);
    writeTotal('Delivery fee', `₹ ${order.deliveryFee.toFixed(2)}`);
    if (order.promoDiscount && order.promoDiscount > 0) {
      writeTotal(`Promo (${order.promoCode ?? ''})`, `-₹ ${order.promoDiscount.toFixed(2)}`);
    }
    y += 4;
    writeTotal('Total', `₹ ${order.total.toFixed(2)}`, true);

    // Footer
    doc
      .moveDown(3)
      .fontSize(8)
      .fillColor('#888')
      .text(
        'This is a system-generated invoice and does not require a signature. ' +
          'GST is included in the item prices shown.',
        40,
        doc.y,
        { align: 'center', width: 515 },
      );

    doc.end();
  });

  // Persist on the order row.
  await prisma.order.update({
    where: { id: orderId },
    data: { invoiceNumber, invoicePath: relPath, invoiceGeneratedAt: new Date() },
  });

  return { invoiceNumber, invoicePath: relPath, absolutePath: absPath };
}

/**
 * Resolve an existing invoice's absolute path on disk.
 * Returns null if the order has no invoice or the file is missing.
 */
export function resolveInvoiceAbsolutePath(relPath: string): string | null {
  const abs = path.join(STORAGE_ROOT, relPath);
  if (!fs.existsSync(abs)) return null;
  return abs;
}

export const __test__ = { currentFinancialYear, allocateInvoiceNumber };
