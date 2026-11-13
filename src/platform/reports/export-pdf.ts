export async function printablePdf(
  count: number,
  language: 'en' | 'hu',
  width: number,
  height: number,
  render: (index: number) => Promise<{ jpeg: Blob; width: number; height: number }>,
) {
  const parts: BlobPart[] = [];
  const offsets = [0];
  let length = 0;
  function append(...items: (string | Blob)[]) {
    for (const item of items) {
      // PDF syntax below is ASCII. JPEG streams use their encoded byte size.
      length += typeof item === 'string' ? item.length : item.size;
      parts.push(item);
    }
  }
  function object(...items: (string | Blob)[]) {
    const id = offsets.length;
    offsets.push(length);
    append(id + ' 0 obj\n', ...items, '\nendobj\n');
  }
  append('%PDF-1.4\n');
  object(`<< /Type /Catalog /Pages 2 0 R /Lang (${language === 'hu' ? 'hu' : 'en'}) >>`);
  const pages = Array.from({ length: count }, (_, i) => 3 + i * 3 + ' 0 R');
  object(`<< /Type /Pages /Count ${count} /Kids [${pages.join(' ')}] >>`);
  for (let i = 0; i < count; i++) {
    const pageId = offsets.length;
    const image = await render(i);
    if (image.jpeg.type !== 'image/jpeg') throw new Error('JPEG unavailable');
    object(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Report ${pageId + 2} 0 R >> >> /Contents ${pageId + 1} 0 R >>`,
    );
    const drawing = `q\n${width} 0 0 ${height} 0 0 cm\n/Report Do\nQ\n`;
    object(`<< /Length ${drawing.length} >>\nstream\n`, drawing, 'endstream');
    object(
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.jpeg.size} >>\nstream\n`,
      image.jpeg,
      '\nendstream',
    );
    if (length > 32_000_000) throw new Error('PDF size limit');
  }
  const xref = length;
  append('xref\n0 ' + offsets.length + '\n0000000000 65535 f \n');
  for (const offset of offsets.slice(1)) append(String(offset).padStart(10, '0') + ' 00000 n \n');
  append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}
