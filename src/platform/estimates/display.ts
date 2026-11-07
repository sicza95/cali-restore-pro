export function quantityText(value: string | null | undefined) {
  if (value === null || value === undefined) return '—';
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
}
