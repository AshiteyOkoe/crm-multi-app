import { prisma } from '../lib/prisma';

export interface AppSettings {
  businessName: string;
  currency: string;
  taxRate: number; // 0-100
  lowStockAlertEnabled: boolean;
  receiptFooter: string;
  receiptChannels: string[]; // EMAIL | SMS | WHATSAPP
  loyaltyEnabled: boolean;
  creditEnabled: boolean;
  smsWebhookUrl: string;
  whatsappWebhookUrl: string;
}

const DEFAULTS: AppSettings = {
  businessName: 'BranchCRM',
  currency: 'GHS',
  taxRate: 0,
  lowStockAlertEnabled: true,
  receiptFooter: 'Thank you for shopping with us!',
  receiptChannels: ['EMAIL', 'WHATSAPP'],
  loyaltyEnabled: true,
  creditEnabled: true,
  smsWebhookUrl: '',
  whatsappWebhookUrl: '',
};

let cache: AppSettings | null = null;

export async function getAppSettings(): Promise<AppSettings> {
  if (cache) return cache;
  const rows = await prisma.appSetting.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  cache = {
    businessName: map.businessName ?? DEFAULTS.businessName,
    currency: map.currency ?? DEFAULTS.currency,
    taxRate: Number(map.taxRate ?? DEFAULTS.taxRate),
    lowStockAlertEnabled: (map.lowStockAlertEnabled ?? String(DEFAULTS.lowStockAlertEnabled)) === 'true',
    receiptFooter: map.receiptFooter ?? DEFAULTS.receiptFooter,
    receiptChannels: (map.receiptChannels ?? DEFAULTS.receiptChannels.join(',')).split(',').map((s) => s.trim()).filter(Boolean),
    loyaltyEnabled: (map.loyaltyEnabled ?? String(DEFAULTS.loyaltyEnabled)) === 'true',
    creditEnabled: (map.creditEnabled ?? String(DEFAULTS.creditEnabled)) === 'true',
    smsWebhookUrl: map.smsWebhookUrl ?? '',
    whatsappWebhookUrl: map.whatsappWebhookUrl ?? '',
  };
  return cache;
}

export function invalidateSettingsCache() {
  cache = null;
}

export async function currencySymbol(currency?: string): Promise<string> {
  const c = currency ?? (await getAppSettings()).currency;
  const symbols: Record<string, string> = { GHS: '₵', USD: '$', EUR: '€', GBP: '£', NGN: '₦', KES: 'KSh', ZAR: 'R' };
  return symbols[c] ?? `${c} `;
}
