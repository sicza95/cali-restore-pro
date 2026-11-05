export function isPositiveLength(value: string) {
  return value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) > 0;
}
