import PDFDocument from 'pdfkit';

// PDFKit's built-in fonts have no ₹ glyph, hence "Rs."
const money = (n) => `Rs. ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Renders an order invoice as a PDF buffer.
 * ponytail: no GST breakup — the catalogue stores tax-inclusive prices with no HSN/rate
 * per product. Add tax lines here once products carry a GST rate.
 */
export function renderInvoice({ order, vendor }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).font('Helvetica-Bold').text('IrriKart', 50, 50);
    doc.fontSize(10).font('Helvetica').text('Tax Invoice / Bill of Supply', 50, 75);
    doc
      .fontSize(10)
      .text(`Invoice for order ${order.orderNumber}`, 300, 50, { align: 'right' })
      .text(`Order date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`, { align: 'right' })
      .text(`Payment: ${order.paymentMethod === 'COD' ? 'Cash on delivery' : 'Prepaid (online)'}`, { align: 'right' });

    doc.moveDown(2);
    const top = doc.y;
    doc.font('Helvetica-Bold').text('Sold by', 50, top);
    doc.font('Helvetica').text(vendor?.legalBusinessName || vendor?.storeName || 'IrriKart', 50, top + 14);
    if (vendor?.contactEmail) doc.text(vendor.contactEmail);

    const a = order.address;
    doc.font('Helvetica-Bold').text('Ship to', 300, top);
    if (a) {
      doc
        .font('Helvetica')
        .text(a.name, 300, top + 14)
        .text([a.line1, a.line2].filter(Boolean).join(', '), { width: 245 })
        .text(`${a.city}, ${a.state} ${a.pincode}`)
        .text(`Phone: ${a.phone}`);
    }

    doc.moveDown(2);
    let y = Math.max(doc.y, top + 90);
    const cols = { item: 50, qty: 330, price: 380, total: 470 };
    doc.font('Helvetica-Bold');
    doc.text('Item', cols.item, y).text('Qty', cols.qty, y).text('Unit price', cols.price, y).text('Amount', cols.total, y, { width: 75, align: 'right' });
    y += 16;
    doc.moveTo(50, y).lineTo(545, y).stroke();
    y += 6;
    doc.font('Helvetica');
    for (const item of order.items) {
      const label = `${item.name}\nSKU ${item.sku}`;
      const h = doc.heightOfString(label, { width: 270 });
      if (y + h > 760) {
        doc.addPage();
        y = 50;
      }
      doc
        .text(label, cols.item, y, { width: 270 })
        .text(`${item.quantity} ${item.unit ?? ''}`.trim(), cols.qty, y)
        .text(money(item.unitPrice), cols.price, y)
        .text(money(item.totalPrice), cols.total, y, { width: 75, align: 'right' });
      y += Math.max(h, 14) + 8;
    }
    doc.moveTo(50, y).lineTo(545, y).stroke();
    y += 10;

    const line = (label, value, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').text(label, 330, y).text(value, cols.total, y, { width: 75, align: 'right' });
      y += 16;
    };
    line('Subtotal', money(order.subtotal));
    if (order.discount > 0) line('Discount', `- ${money(order.discount)}`);
    line('Total', money(order.amount), true);

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#666')
      .text('Prices are inclusive of all applicable taxes. This is a computer-generated invoice.', 50, 780, {
        align: 'center',
        width: 495,
      });
    doc.end();
  });
}
