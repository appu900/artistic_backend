import { Injectable, Logger } from '@nestjs/common';
import * as QRCode from 'qrcode';
import * as PDFDocument from 'pdfkit';

const BRAND_PURPLE = '#391c71';
const BRAND_DARK = '#181b49';
const INK = '#1f2430';
const MUTED = '#6b7280';
const LIGHT_BG = '#f6f5fb';
const BORDER = '#e5e0f5';
const SUCCESS = '#16a34a';

export interface TicketLineItem {
  label: string;
  detail?: string;
  amount?: string;
}

export interface TicketPdfData {
  bookingReference: string;
  bookingTypeLabel: string;
  status?: string;
  customerName: string;
  eventOrServiceName: string;
  venueName?: string;
  venueAddress?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  items: TicketLineItem[];
  subtotal?: number;
  tax?: number;
  total: number;
  currency: string;
  paymentMethod?: string;
  transactionId?: string;
  paymentDate?: string;
  qrPayload: Record<string, any>;
}

/**
 * Generates the QR-coded "m-ticket" PDF attached to booking confirmation
 * emails. Kept dependency-light (pdfkit + qrcode, no headless browser) so it
 * can run inline in the payment webhook / worker request path.
 */
@Injectable()
export class TicketService {
  private readonly logger = new Logger(TicketService.name);

  async generateQrCodeBuffer(payload: Record<string, any>): Promise<Buffer> {
    return QRCode.toBuffer(JSON.stringify(payload), {
      type: 'png',
      margin: 1,
      scale: 8,
      color: { dark: BRAND_DARK, light: '#FFFFFF' },
    });
  }

  async generateTicketPdf(data: TicketPdfData): Promise<Buffer> {
    const qrBuffer = await this.generateQrCodeBuffer(data.qrPayload).catch((err) => {
      this.logger.warn(`QR generation failed, continuing without QR: ${err.message}`);
      return null;
    });

    // First pass: render into an oversized scratch page purely to discover
    // how tall the content actually is (pdfkit's text flow makes heights
    // depend on word-wrap, so we can't compute this analytically upfront).
    const scratchDoc = new (PDFDocument as any)({
      size: [400, 3000],
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    scratchDoc.on('data', () => {});
    const contentEndY = this.renderTicket(scratchDoc, data, qrBuffer);
    scratchDoc.end();

    const pageHeight = Math.ceil(contentEndY) + 16;

    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new (PDFDocument as any)({
          size: [400, pageHeight],
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        this.renderTicket(doc, data, qrBuffer);
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /** Draws the ticket and returns the y-coordinate where content ends (before the footer band). */
  private renderTicket(doc: PDFKit.PDFDocument, data: TicketPdfData, qrBuffer: Buffer | null): number {
    const pageW = 400;
    const pad = 24;
    const contentW = pageW - pad * 2;

    // Header band
    doc.rect(0, 0, pageW, 96).fill(BRAND_DARK);
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(20)
      .text('ARTISTIC', pad, 26, { characterSpacing: 1.5 });
    doc
      .fillColor('#C9C4E8')
      .font('Helvetica')
      .fontSize(9)
      .text('E-TICKET · ' + data.bookingTypeLabel.toUpperCase(), pad, 52, { characterSpacing: 1 });
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text((data.status || 'CONFIRMED').toUpperCase(), pageW - pad - 120, 26, {
        width: 120,
        align: 'right',
      });

    let y = 116;

    // Booking reference chip
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('BOOKING REFERENCE', pad, y);
    y += 14;
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(16).text(data.bookingReference, pad, y);
    y += 30;

    // Event / service name
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(17).text(data.eventOrServiceName, pad, y, {
      width: contentW,
    });
    y = doc.y + 14;

    doc.moveTo(pad, y).lineTo(pageW - pad, y).strokeColor(BORDER).lineWidth(1).stroke();
    y += 16;

    const colW = (contentW - 16) / 2;
    const drawField = (label: string, value: string, x: number, yy: number, w: number) => {
      doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(label.toUpperCase(), x, yy, { width: w });
      doc
        .fillColor(INK)
        .font('Helvetica-Bold')
        .fontSize(11.5)
        .text(value || 'TBD', x, yy + 12, { width: w });
    };

    const rowHeight = (label: string, value: string, w: number) => {
      doc.font('Helvetica-Bold').fontSize(11.5);
      const h = doc.heightOfString(value || 'TBD', { width: w });
      return 12 + h + 14;
    };

    const dateVal = data.date || 'TBD';
    const timeVal = [data.startTime, data.endTime].filter(Boolean).join(' - ') || 'TBD';
    const h1 = Math.max(rowHeight('Date', dateVal, colW), rowHeight('Time', timeVal, colW));
    drawField('Date', dateVal, pad, y, colW);
    drawField('Time', timeVal, pad + colW + 16, y, colW);
    y += h1;

    doc.moveTo(pad, y).lineTo(pageW - pad, y).strokeColor(BORDER).lineWidth(1).stroke();
    y += 16;

    const venueName = data.venueName || 'Venue details to follow';
    const venueAddress = data.venueAddress || '';
    const venueVal = [venueName, venueAddress].filter(Boolean).join('\n');
    const customerVal = data.customerName || 'Guest';
    const h2 = Math.max(rowHeight('Venue', venueVal, colW), rowHeight('Ticket Holder', customerVal, colW));
    drawField('Venue', venueVal, pad, y, colW);
    drawField('Ticket Holder', customerVal, pad + colW + 16, y, colW);
    y += h2;
    y += 6;

    // Items box (seats/tables/booths/artist/equipment)
    if (data.items?.length) {
      const labelW = contentW - 24 - 90;
      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8.5).text('DETAILS', pad, y);
      y += 14;
      const boxTop = y;

      // First pass: measure total box height without drawing.
      let measuredH = 12;
      for (const item of data.items) {
        doc.font('Helvetica-Bold').fontSize(10.5);
        measuredH += doc.heightOfString(item.label, { width: labelW });
        if (item.detail) {
          doc.font('Helvetica').fontSize(9);
          measuredH += doc.heightOfString(item.detail, { width: contentW - 24 }) + 2;
        }
        measuredH += 8;
      }
      const boxHeight = measuredH + 4;

      doc.roundedRect(pad, boxTop, contentW, boxHeight, 8).fillAndStroke(LIGHT_BG, BORDER);

      // Second pass: draw text on top of the filled box.
      let iy = boxTop + 12;
      for (const item of data.items) {
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK);
        const lh = doc.heightOfString(item.label, { width: labelW });
        doc.text(item.label, pad + 12, iy, { width: labelW });
        if (item.amount) {
          doc
            .font('Helvetica-Bold')
            .fontSize(10.5)
            .fillColor(BRAND_PURPLE)
            .text(item.amount, pad + 12 + labelW, iy, { width: 90, align: 'right' });
        }
        iy += lh;
        if (item.detail) {
          doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(item.detail, pad + 12, iy, {
            width: contentW - 24,
          });
          iy = doc.y + 2;
        }
        iy += 8;
      }
      y = boxTop + boxHeight + 20;
    }

    // Perforation / tear line
    doc.circle(pad, y, 8).fill('#FFFFFF');
    doc.circle(pageW - pad, y, 8).fill('#FFFFFF');
    doc
      .moveTo(pad + 10, y)
      .lineTo(pageW - pad - 10, y)
      .dash(4, { space: 4 })
      .strokeColor(BORDER)
      .lineWidth(1.5)
      .stroke();
    doc.undash();
    y += 24;

    // QR code
    const qrSize = 150;
    const qrX = (pageW - qrSize) / 2;
    if (qrBuffer) {
      doc.image(qrBuffer, qrX, y, { width: qrSize, height: qrSize });
    } else {
      doc.roundedRect(qrX, y, qrSize, qrSize, 8).strokeColor(BORDER).stroke();
    }
    y += qrSize + 12;
    doc
      .fillColor(INK)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(data.bookingReference, pad, y, { width: contentW, align: 'center' });
    y += 16;
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8.5)
      .text('Present this e-ticket (printed or on your phone) at the venue entrance. Do not share your QR code.', pad + 20, y, {
        width: contentW - 40,
        align: 'center',
      });
    y = doc.y + 18;

    doc.moveTo(pad, y).lineTo(pageW - pad, y).strokeColor(BORDER).lineWidth(1).stroke();
    y += 16;

    // Payment summary
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8.5).text('PAYMENT SUMMARY', pad, y);
    y += 16;

    const paymentRow = (label: string, value: string, bold = false) => {
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(10)
        .text(label, pad, y, { width: contentW * 0.55 });
      doc
        .fillColor(bold ? BRAND_PURPLE : INK)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(bold ? 13 : 10)
        .text(value, pad + contentW * 0.45, y - (bold ? 2 : 0), { width: contentW * 0.55, align: 'right' });
      y += bold ? 20 : 16;
    };

    if (typeof data.subtotal === 'number') {
      paymentRow('Subtotal', `${data.subtotal.toFixed(2)} ${data.currency}`);
    }
    if (typeof data.tax === 'number' && data.tax > 0) {
      paymentRow('Tax / Fees', `${data.tax.toFixed(2)} ${data.currency}`);
    }
    if (data.paymentMethod) paymentRow('Payment Method', data.paymentMethod);
    if (data.transactionId) paymentRow('Transaction ID', data.transactionId);
    if (data.paymentDate) paymentRow('Paid On', data.paymentDate);

    doc.fillColor(SUCCESS).font('Helvetica-Bold').fontSize(9.5).text('PAID', pad, y, { width: contentW * 0.5 });
    y += 18;

    doc.moveTo(pad, y).lineTo(pageW - pad, y).strokeColor(BORDER).lineWidth(1).stroke();
    y += 12;
    paymentRow('Total Paid', `${data.total.toFixed(2)} ${data.currency}`, true);
    y += 12;

    // Footer band
    const footerY = y + 12;
    const footerHeight = 76;
    doc.rect(0, footerY, pageW, footerHeight).fill(BRAND_DARK);
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Artistic&Co.', pad, footerY + 18);
    doc
      .fillColor('#C9C4E8')
      .font('Helvetica')
      .fontSize(8.5)
      .text('info@artistic.global · www.artistic.global', pad, footerY + 36);
    doc
      .fillColor('#8F89B8')
      .font('Helvetica')
      .fontSize(7.5)
      .text('This is a system-generated e-ticket and does not require a signature.', pad, footerY + 54, {
        width: contentW,
      });

    return footerY + footerHeight;
  }
}
