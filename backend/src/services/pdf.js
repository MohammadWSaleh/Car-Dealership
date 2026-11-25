const PDFDocument = require('pdfkit');
const { usd, lbpFmt, dmy } = require('../util');

// FR-DEAL-06, FR-PAY-03/05/06, FR-DEL-05. PDFs are generated on demand from the stored data.
function build(draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: { Producer: 'Full Stack Motors' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    draw(doc);
    footer(doc);
    doc.end();
  });
}
const BRAND = {
  name: process.env.COMPANY_NAME || 'Full Stack Motors',
  tagline: 'One stack. One price. Your car.',
  address: process.env.COMPANY_ADDRESS || 'Highway Road, Beirut, Lebanon',
  phone: process.env.COMPANY_PHONE || '+961 1 000 000',
  email: process.env.COMPANY_EMAIL || 'sales@fsm.lb',
  vat: process.env.COMPANY_VAT || 'VAT No. 0000000',
  blue: '#1d4ed8', navy: '#0f2a4a',
};
function header(doc, title, number) {
  // brand band with logo mark
  doc.rect(0, 0, doc.page.width, 78).fill(BRAND.navy);
  // logo mark: gradient tile, car roofline, three "stack" bars, amber light
  const gr = doc.linearGradient(50, 18, 92, 60); gr.stop(0, '#1558c7').stop(1, '#0ea5e9');
  doc.roundedRect(50, 18, 42, 42, 9).fill(gr);
  doc.save().translate(50, 18).scale(42 / 64);
  doc.path('M8 38C15 26 27 19 40 19c8 0 14 6 17 14-10-4-20-4-30-1-7 2-13 5-19 6z').fill('#ffffff');
  doc.roundedRect(8, 43, 48, 3.6, 1.8).fillOpacity(0.95).fill('#ffffff');
  doc.roundedRect(8, 49.5, 36, 3.6, 1.8).fillOpacity(0.7).fill('#ffffff');
  doc.roundedRect(8, 56, 22, 3.6, 1.8).fillOpacity(0.45).fill('#ffffff');
  doc.fillOpacity(1).circle(56.5, 34.5, 3).fill('#ffb454');
  doc.restore();
  doc.font('Helvetica-BoldOblique').fontSize(18).fillColor('#ffffff').text('FULL STACK', 104, 19, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#38bdf8').text('M O T O R S', 104, 40, { lineBreak: false });
  
  doc.fontSize(8).fillColor('#cbd5e1').text(BRAND.address, 330, 20, { width: 215, align: 'right' }).text(`${BRAND.phone}  |  ${BRAND.email}`, 330, 32, { width: 215, align: 'right' }).text(BRAND.vat, 330, 44, { width: 215, align: 'right' });
  doc.x = 50; doc.y = 100;
  doc.font('Helvetica-Bold').fontSize(16).fillColor(BRAND.navy).text(title);
  if (number) doc.font('Helvetica').fontSize(11).fillColor('#333').text(`No. ${number}`);
  doc.moveDown(0.6);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(1.5).strokeColor(BRAND.blue).stroke().lineWidth(1);
  doc.moveDown(0.6);
  doc.font('Helvetica');
}
function footer(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 38;
    doc.moveTo(50, y - 6).lineTo(545, y - 6).strokeColor('#cbd5e1').stroke();
    doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(`${BRAND.name}  |  ${BRAND.address}  |  ${BRAND.phone}  |  ${BRAND.vat}`, 50, y, { width: 400, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, 450, y, { width: 95, align: 'right', lineBreak: false });
  }
}
function kv(doc, rows) {
  rows.forEach(([k, v]) => {
    doc.fontSize(10).fillColor('#555').text(`${k}: `, { continued: true }).fillColor('#000').text(String(v ?? '-'));
  });
  doc.moveDown(0.5);
}
function table(doc, heads, rows, widths) {
  const x0 = 50;
  let y = doc.y;
  const drawRow = (cells, bold) => {
    let x = x0;
    cells.forEach((c, i) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#000').text(String(c), x + 2, y, { width: widths[i] - 4, align: i > 0 && /^\$|^LBP|^-?\d/.test(String(c)) ? 'right' : 'left' });
      x += widths[i];
    });
    y += 16;
  };
  drawRow(heads, true);
  doc.moveTo(x0, y - 3).lineTo(x0 + widths.reduce((a, b) => a + b, 0), y - 3).strokeColor('#999').stroke();
  rows.forEach((r) => drawRow(r, false));
  doc.y = y + 4;
  doc.x = 50;
  doc.font('Helvetica');
}

const contractPdf = (d) => build((doc) => {
  header(doc, 'Vehicle Purchase Contract', d.contract.number);
  kv(doc, [['Date', dmy(d.contract.created_at)], ['Buyer', d.deal.contact_name], ['Email', d.deal.contact_email], ['Phone', d.deal.contact_phone],
    ['Quotation', d.quotation.number], ['Consultant', d.consultant]]);
  doc.fontSize(12).fillColor('#0f2a4a').text('Vehicle'); doc.moveDown(0.3);
  kv(doc, [['Model', `${d.trim.brand} ${d.trim.model} ${d.trim.name}`], ['Fuel type', d.trim.fuel_type], ['Colour', d.quotation.color || 'As agreed'], ['VIN', d.car ? d.car.vin : 'To be allocated on arrival']]);
  doc.fontSize(12).fillColor('#0f2a4a').text('Price (fixed, final)'); doc.moveDown(0.3);
  table(doc, ['Item', 'Amount (USD)'], [
    [`${d.trim.brand} ${d.trim.model} ${d.trim.name} (includes import charges and VAT)`, usd(d.quotation.price_usd)],
    ...d.items.map((i) => [i.description, usd(i.price_usd)]),
    ['Total (VAT included)', usd(d.contract.total_usd)],
    [`of which VAT (${d.vat_rate}%)`, usd(d.contract.vat_amount)],
    [`Stamp duty (${d.stamp_percent}% of the contract total)`, usd(d.contract.stamp_duty_usd)],
    ['Equivalent total in LBP', lbpFmt(d.total_lbp)],
  ], [380, 115]);
  doc.fontSize(12).fillColor('#0f2a4a').text('Terms'); doc.moveDown(0.3);
  doc.fontSize(9).fillColor('#000').text(d.contract.terms, { align: 'left' });
  doc.moveDown(0.5);
  doc.fontSize(9).text(`Deposit rule if the buyer cancels: ${d.deposit_rule_text}. The agreed price is held for ${d.contract.hold_days} days after the deposit.`);
  doc.moveDown(2);
  doc.fontSize(10).text('Buyer signature: ______________________      Dealership signature: ______________________');
  doc.moveDown(0.5);
  doc.fontSize(8).fillColor('#666').text(d.contract.status === 'signed' ? `Signed ${d.contract.signed_method === 'online' ? 'online by ' + d.contract.signed_name : 'on paper'} on ${dmy(d.contract.signed_at)}.` : 'Not signed yet.');
});

const receiptPdf = (d) => build((doc) => {
  const p = d.payment; const refund = p.kind === 'refund';
  const KIND = { deposit: 'Deposit', payment: 'Payment', balance: 'Balance payment', installment: 'Instalment', refund: 'Refund', full: 'Full payment' };
  const money = (n, c) => `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${c}`;
  header(doc, refund ? 'Refund Receipt' : 'Payment Receipt', p.receipt_number);
  const L = 50; const W = 495; const y0 = doc.y;
  // status stamp
  doc.roundedRect(L + W - 96, 100, 96, 26, 13).fill(refund ? '#fef3c7' : '#dcfce7');
  doc.font('Helvetica-Bold').fontSize(10).fillColor(refund ? '#92400e' : '#166534').text(refund ? 'REFUNDED' : 'PAID', L + W - 96, 108, { width: 96, align: 'center', lineBreak: false });
  // amount card
  let y = y0 + 4;
  doc.roundedRect(L, y, W, 92, 10).fillAndStroke('#eef6ff', '#bcd6ff');
  doc.rect(L, y + 10, 4, 72).fill(BRAND.blue);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569').text(refund ? 'AMOUNT REFUNDED' : 'AMOUNT RECEIVED', L + 22, y + 16, { lineBreak: false, characterSpacing: 1 });
  doc.font('Helvetica-Bold').fontSize(30).fillColor(BRAND.navy).text(money(p.amount, p.currency), L + 22, y + 32, { lineBreak: false });
  doc.font('Helvetica').fontSize(9).fillColor('#475569').text(`Paid from ${d.deal.contact_name}`, L + 22, y + 72, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569').text('USD EQUIVALENT', L + 300, y + 16, { width: 175, align: 'right', lineBreak: false, characterSpacing: 1 });
  doc.font('Helvetica-Bold').fontSize(18).fillColor(BRAND.navy).text(usd(p.amount_usd), L + 300, y + 32, { width: 175, align: 'right', lineBreak: false });
  doc.font('Helvetica').fontSize(8.5).fillColor('#475569').text(`1 USD = LBP ${Math.round(p.exchange_rate).toLocaleString('en-US')}`, L + 300, y + 60, { width: 175, align: 'right', lineBreak: false });
  doc.text(`Rate fixed on ${dmy(p.created_at)}`, L + 300, y + 73, { width: 175, align: 'right', lineBreak: false });
  // details grid
  y += 116;
  const cell = (x, yy, label, value) => {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748b').text(label.toUpperCase(), x, yy, { width: 225, lineBreak: false, characterSpacing: 0.8 });
    doc.font('Helvetica').fontSize(11).fillColor('#0f172a').text(String(value ?? '-'), x, yy + 12, { width: 225, lineBreak: false, ellipsis: true });
  };
  const rows = [['Received from', d.deal.contact_name, 'Date', dmy(p.created_at)], ['Vehicle', d.car_name, 'Payment type', KIND[p.kind] || p.kind],
    ['Method', String(p.method || '-').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), 'Reference', p.reference || '-'], ['Received by', d.staff_name, 'Receipt number', p.receipt_number]];
  rows.forEach((r, i) => { const yy = y + i * 42; cell(L, yy, r[0], r[1]); cell(L + 270, yy, r[2], r[3]); doc.moveTo(L, yy + 33).lineTo(L + W, yy + 33).lineWidth(0.5).strokeColor('#e2e8f0').stroke().lineWidth(1); });
  // balance box
  y += rows.length * 42 + 10;
  const paid = d.balance_usd <= 0;
  doc.roundedRect(L, y, W, 54, 10).fill(paid ? '#ecfdf5' : '#f8fafc');
  doc.roundedRect(L, y, W, 54, 10).lineWidth(1).strokeColor(paid ? '#a7f3d0' : '#e2e8f0').stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569').text(refund ? 'REMAINING PAID AMOUNT AFTER REFUND' : 'BALANCE AFTER THIS PAYMENT', L + 18, y + 12, { lineBreak: false, characterSpacing: 1 });
  doc.font('Helvetica-Bold').fontSize(20).fillColor(paid ? '#047857' : BRAND.navy).text(usd(Math.max(d.balance_usd, 0)), L + 18, y + 25, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(paid ? '#047857' : '#475569').text(paid ? 'Fully paid, thank you' : 'Still to pay', L + 250, y + 24, { width: 227, align: 'right', lineBreak: false });
  // signatures and note
  y += 54 + 56;
  [['Customer signature', L], ['Authorised signature and stamp', L + 270]].forEach(([label, x]) => {
    doc.moveTo(x, y).lineTo(x + 225, y).lineWidth(0.8).strokeColor('#94a3b8').stroke().lineWidth(1);
    doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(label, x, y + 5, { width: 225, lineBreak: false });
  });
  doc.font('Helvetica').fontSize(8).fillColor('#64748b').text('This receipt confirms the payment shown above. All car prices are fixed in US dollars; amounts paid in Lebanese pounds use the exchange rate printed on this receipt. Keep it with your contract.', L, y + 34, { width: W, align: 'left' });
});

const invoicePdf = (d) => build((doc) => {
  header(doc, 'Tax Invoice', d.invoice.number);
  kv(doc, [['Date', dmy(d.invoice.created_at)], ['Customer', d.deal.contact_name], ['Vehicle', d.car_name], ['VIN', d.vin || '-']]);
  table(doc, ['Description', 'Amount (USD)'], [
    ...d.lines.map((l) => [l.description, usd(l.price_usd)]),
    ['Net amount', usd(d.invoice.net_usd)],
    [`VAT (${d.invoice.vat_rate}%)`, usd(d.invoice.vat_amount)],
    ['Total', usd(d.invoice.total_usd)],
  ], [380, 115]);
});

const loanPdf = (d) => build((doc) => {
  header(doc, 'Loan Request Summary', `LN-${d.loan.id}`);
  kv(doc, [['Partner bank', d.loan.bank], ['Date', dmy(d.loan.created_at)], ['Applicant', d.deal.contact_name], ['Email', d.deal.contact_email], ['Phone', d.deal.contact_phone]]);
  doc.fontSize(12).fillColor('#0f2a4a').text('Car and quotation'); doc.moveDown(0.3);
  kv(doc, [['Car', d.car_name], ['Quotation', d.quotation.number], ['Total price (USD)', usd(d.total_usd)], ['Quotation valid until', dmy(d.quotation.valid_until)], ['Status', d.loan.status]]);
});

const handoverPdf = (d) => build((doc) => {
  header(doc, 'Vehicle Handover Form', `H-${d.deal.id}`);
  kv(doc, [['Customer', d.deal.contact_name], ['Vehicle', d.car_name], ['VIN', d.vin || '-'], ['Colour', d.color || '-'], ['Contract', d.contract_number], ['Keys handed over', d.keys_count ?? '____']]);
  doc.fontSize(12).fillColor('#0f2a4a').text('Accessories'); doc.moveDown(0.3);
  (d.accessories.length ? d.accessories : ['None']).forEach((a) => doc.fontSize(10).fillColor('#000').text(`[  ]  ${a}`));
  doc.moveDown(0.8);
  doc.fontSize(12).fillColor('#0f2a4a').text('Inspection'); doc.moveDown(0.3);
  d.inspection.forEach((i) => doc.fontSize(10).fillColor('#000').text(`${i.passed ? '[x]' : '[ ]'}  ${i.label}`));
  doc.moveDown(2);
  doc.fontSize(10).text('Customer signature: ______________________      Coordinator signature: ______________________');
});

module.exports = { contractPdf, receiptPdf, invoicePdf, loanPdf, handoverPdf };
