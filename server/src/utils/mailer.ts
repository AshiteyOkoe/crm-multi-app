// ============================================================
//  Outbound messaging (receipts, campaigns, reset emails)
//  Dev: messages are logged to the console.
//  Prod: plug in providers via webhooks or SMTP credentials.
// ============================================================

import { env } from '../config/env';
import type { AppSettings } from './settings';

type Channel = 'EMAIL' | 'SMS' | 'WHATSAPP';

interface OutboundMessage {
  to: string; // email or phone number
  channel: Channel;
  subject?: string;
  body: string;
}

const SMTP_HOST = process.env.SMTP_HOST ?? '';
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587);
const SMTP_USER = process.env.SMTP_USER ?? '';
const SMTP_PASS = process.env.SMTP_PASS ?? '';
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'no-reply@branchcrm.app';

function log(prefix: string, message: OutboundMessage) {
  console.log(`[mailer:${prefix}] ${message.channel} -> ${message.to} | ${message.subject ?? ''} ${message.body.slice(0, 200)}`);
}

async function postToWebhook(url: string, payload: unknown) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`webhook returned ${res.status}`);
    return true;
  } catch (err) {
    console.error('[mailer] webhook failed:', err);
    return false;
  }
}

async function sendEmail(message: OutboundMessage): Promise<boolean> {
  if (env.nodeEnv !== 'production' || (!SMTP_HOST && !process.env.EMAIL_WEBHOOK_URL)) {
    log('dev', message);
    return true;
  }
  if (process.env.EMAIL_WEBHOOK_URL) {
    return postToWebhook(process.env.EMAIL_WEBHOOK_URL, { to: message.to, subject: message.subject, body: message.body, from: EMAIL_FROM });
  }
  // SMTP via HTTP bridge endpoint — set SMTP_WEBHOOK_URL to a service that relays
  if (process.env.SMTP_WEBHOOK_URL) {
    return postToWebhook(process.env.SMTP_WEBHOOK_URL, { to: message.to, subject: message.subject, body: message.body, from: EMAIL_FROM, host: SMTP_HOST, port: SMTP_PORT, user: SMTP_USER, pass: SMTP_PASS });
  }
  log('no-provider', message);
  return true;
}

async function sendSms(message: OutboundMessage, settings?: AppSettings): Promise<boolean> {
  const webhook = settings?.smsWebhookUrl || process.env.SMS_WEBHOOK_URL;
  if (!webhook) {
    log('dev', message);
    return true;
  }
  return postToWebhook(webhook, { to: message.to, body: message.body });
}

async function sendWhatsApp(message: OutboundMessage, settings?: AppSettings): Promise<boolean> {
  const webhook = settings?.whatsappWebhookUrl || process.env.WHATSAPP_WEBHOOK_URL;
  if (!webhook) {
    log('dev', message);
    return true;
  }
  return postToWebhook(webhook, { to: message.to, body: message.body });
}

export async function sendMessage(message: OutboundMessage, settings?: AppSettings): Promise<boolean> {
  if (message.channel === 'EMAIL') return sendEmail(message);
  if (message.channel === 'WHATSAPP') return sendWhatsApp(message, settings);
  return sendSms(message, settings);
}

export { EMAIL_FROM };

// Build a plain-text receipt from a sale
export function buildReceiptText(opts: {
  businessName: string;
  footer: string;
  invoiceNo: string;
  createdAt: Date;
  branchName?: string;
  customerName?: string;
  currency: string;
  items: { productName: string; quantity: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  pointsDiscount: number;
  total: number;
  amountPaid: number;
  creditUsed: number;
  paymentMethod: string;
}) {
  const { businessName, footer, invoiceNo, createdAt, branchName, customerName, currency, items, subtotal, discount, tax, pointsDiscount, total, amountPaid, creditUsed, paymentMethod } = opts;
  const line = '--------------------------------';
  const rows = [
    businessName,
    branchName ? `Branch: ${branchName}` : '',
    `Invoice: ${invoiceNo}`,
    `Date: ${createdAt.toLocaleString()}`,
    customerName ? `Customer: ${customerName}` : '',
    line,
    ...items.map((i) => `${i.quantity} x ${i.productName}\n    ${currency} ${i.lineTotal.toFixed(2)}`),
    line,
    `Subtotal:    ${currency} ${subtotal.toFixed(2)}`,
    discount > 0 ? `Discount:    -${currency} ${discount.toFixed(2)}` : '',
    tax > 0 ? `Tax:         ${currency} ${tax.toFixed(2)}` : '',
    pointsDiscount > 0 ? `Points:      -${currency} ${pointsDiscount.toFixed(2)}` : '',
    `TOTAL:       ${currency} ${total.toFixed(2)}`,
    `Paid (${paymentMethod}): ${currency} ${amountPaid.toFixed(2)}`,
    creditUsed > 0 ? `On credit:   ${currency} ${creditUsed.toFixed(2)}` : '',
    '',
    footer,
  ].filter((r) => r !== '');
  return rows.join('\n');
}
