export enum PaymentGatewaySrc {
  CC = 'cc',
  KNET = 'knet',
  APPLE_PAY = 'apple-pay',
  APPLE_PAY_KNET = 'apple-pay-knet',
  GOOGLE_PAY = 'google-pay',
  SAMSUNG_PAY = 'samsung-pay',
}

export const SUPPORTED_GATEWAY_SRCS: string[] = Object.values(PaymentGatewaySrc);

export const CARD_TOKEN_CAPABLE_SRCS: string[] = [PaymentGatewaySrc.CC];

export function sanitizeGatewaySrc(value: unknown): PaymentGatewaySrc {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if ((SUPPORTED_GATEWAY_SRCS as string[]).includes(normalized)) {
      return normalized as PaymentGatewaySrc;
    }
  }
  return PaymentGatewaySrc.CC;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cc: 'Credit/Debit Card',
  card: 'Credit/Debit Card',
  knet: 'KNET',
  'apple-pay': 'Apple Pay',
  'apple-pay-knet': 'Apple Pay (KNET)',
  'google-pay': 'Google Pay',
  'samsung-pay': 'Samsung Pay',
};

export function getPaymentMethodLabel(src?: string | null): string {
  if (!src) return 'Credit/Debit Card';
  return PAYMENT_METHOD_LABELS[src.toLowerCase()] || src;
}

export function derivePaymentMethodLabel(transaction: any): string {
  if (!transaction) return 'Credit/Debit Card';
  const paymentType = (transaction.payment_type || transaction.paymentType || '').toLowerCase();
  const isKnet = Boolean(transaction.is_paid_from_knet);
  const isCc = Boolean(transaction.is_paid_from_cc);

  if (paymentType.includes('apple') && isKnet) return 'Apple Pay (KNET)';
  if (paymentType.includes('apple')) return 'Apple Pay';
  if (paymentType.includes('google')) return 'Google Pay';
  if (paymentType.includes('samsung')) return 'Samsung Pay';
  if (paymentType === 'knet' || isKnet) return 'KNET';
  if (paymentType === 'card' || paymentType === 'cc' || isCc) return 'Credit/Debit Card';
  return getPaymentMethodLabel(paymentType) || 'Credit/Debit Card';
}
