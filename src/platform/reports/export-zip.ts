import { crc32 } from './export-bytes';

const encode = new TextEncoder();

// A small uncompressed ZIP writer for the known parts of an OOXML workbook.
export function zip(files: [string, string][], type: string) {
  const entries: BlobPart[] = [];
  const directory: BlobPart[] = [];
  let offset = 0;
  let directorySize = 0;
  for (const [name, content] of files) {
    const path = encode.encode(name);
    const bytes = encode.encode(content);
    if (offset + bytes.length > 8_000_000) throw new Error('Workbook size limit');
    const crc = crc32(bytes);

    function header(central: boolean) {
      const buffer = new ArrayBuffer(central ? 46 : 30);
      const view = new DataView(buffer);
      const shift = central ? 2 : 0;
      view.setUint32(0, central ? 0x02014b50 : 0x04034b50, true);
      view.setUint16(4 + shift, 20, true);
      view.setUint16(12 + shift, 33, true); // DOS date 1980-01-01
      view.setUint32(14 + shift, crc, true);
      view.setUint32(18 + shift, bytes.length, true);
      view.setUint32(22 + shift, bytes.length, true);
      view.setUint16(26 + shift, path.length, true);
      if (central) {
        view.setUint16(4, 20, true);
        view.setUint32(42, offset, true);
      }
      return buffer;
    }
    const local = header(false);
    const central = header(true);
    entries.push(local, path, bytes);
    directory.push(central, path);
    offset += local.byteLength + path.length + bytes.length;
    directorySize += central.byteLength + path.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  return new Blob([...entries, ...directory, end.buffer], { type });
}
