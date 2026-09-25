export function luhn(value: string): boolean {
  const digits = value.replace(/[ -]/g, '');
  if (!/^\d{13,19}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = digits.length - 1, step = 0; i >= 0; i--, step++) {
    let n = Number(digits[i]);
    if (step % 2) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}
export function myNumber(value: string): boolean {
  const digits = value.replace(/[ -]/g, '');
  if (!/^\d{12}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 10; i >= 0; i--) sum += Number(digits[i]) * (2 + (10 - i) % 6);
  const remainder = sum % 11;
  return Number(digits[11]) === (remainder <= 1 ? 0 : 11 - remainder);
}
export function corporateId(value: string): boolean {
  const digits = value.replace(/[ -]/g, '');
  if (!/^\d{13}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 12; i >= 1; i--) sum += Number(digits[i]) * (i % 2 === 0 ? 2 : 1);
  return Number(digits[0]) === 9 - (sum % 9);
}
export function ipv4(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 4 && parts.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255 && (p.length === 1 || p[0] !== '0'));
}
