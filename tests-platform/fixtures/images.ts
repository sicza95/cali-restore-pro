const jpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAQDAwMDAgQDAwMEBAQFBgoGBgUFBgwICQcKDgwPDg4MDQ0PERYTDxAVEQ0NExoTFRcYGRkZDxIbHRsYHRYYGRj/2wBDAQQEBAYFBgsGBgsYEA0QGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBj/wgARCAAwAEADASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAUBBv/EABgBAQEBAQEAAAAAAAAAAAAAAAAFBgMH/9oADAMBAAIQAxAAAAHkxMvAYJWVA1BbOjeQRday3TGiCPSIYF4YLYgf/8QAFBABAAAAAAAAAAAAAAAAAAAAUP/aAAgBAQABBQJD/8QAGBEAAwEBAAAAAAAAAAAAAAAAABViIKH/2gAIAQMBAT8Bw2jo2josoWVn/8QAGxEAAAcBAAAAAAAAAAAAAAAAABQVIGFioeH/2gAIAQIBAT8BYiXzoRL50FpBaW//xAAUEAEAAAAAAAAAAAAAAAAAAABQ/9oACAEBAAY/AkP/xAAUEAEAAAAAAAAAAAAAAAAAAABQ/9oACAEBAAE/IUP/2gAMAwEAAgADAAAAEAAAAAwwggAAAP/EABkRAAIDAQAAAAAAAAAAAAAAAADwESDh8f/aAAgBAwEBPxCicCcCxosbX//EABgRAAMBAQAAAAAAAAAAAAAAABEg4fAA/9oACAECAQE/EGzNC9oVf//EABQQAQAAAAAAAAAAAAAAAAAAAFD/2gAIAQEAAT8QQ//Z',
  'base64',
);

// Generated from four flat color quadrants with pillow-heif 1.8.1 and an SDR nclx profile.
export const heic = Buffer.from(
  'AAAAHGZ0eXBoZWljAAAAAG1pZjFoZWljbWlhZgAAAX1tZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAAAERAAAEAAQAAAAABoQABAAAAAAAAANYAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABodmMxAAAAAA5waXRtAAAAAAABAAAA/WlwcnAAAADdaXBjbwAAAHZodmNDAQNwAAAAkAAAAAAAHvAA/P34+AAADwNgAAEAGEABDAH//wNwAAADAJAAAAMAAAMAHroCQGEAAQAqQgEBA3AAAAMAkAAAAwAAAwAeoCCBBZbq5Ka5uAhoMCAAAAMDIAAAAwAhYgABAAZEAcFzwIkAAAATY29scm5jbHgAAQANAAaAAAAAFGlzcGUAAAAAAAAAQAAAAEAAAAAoY2xhcAAAAEAAAAABAAAAMAAAAAEAAAAAAAAAAv////AAAAACAAAAEHBpeGkAAAAAAwgICAAAABhpcG1hAAAAAAAAAAEAAQWBAgMFhAAAAN5tZGF0AAAA0igBrwX4Vsp7/+sNf//6Vf2XxaKR7+D40LGlN8bI7758B//fyiSUic2rlv+e0FiFygk0m6jbPXZCXIsnkH2hPbfTSFdfefvQyOg8HUSvIoE3Tsi0ktr+7z0tEeQGX3ME+v/pSA/+gkxQ4Bg3wxoBW4okOxnLHW8sFQbplbrxzmCINOlqdTlpIoAZrQkRGRgdC/G7UDY9uNnP2qoRMwkJGApK78iQAAUEZT+nImMpA1fnUSS+mz/pUEEq9H0LRUQXptKWEdKzMgr/JWWeO3d3/ztCmQ==',
  'base64',
);

function ifd(tags: [number, number, number, number][], data: Buffer, le = true, cr2 = false) {
  const start = cr2 ? 16 : 8;
  const head = Buffer.alloc(start + 2 + tags.length * 12 + 4);
  const put16 = (at: number, value: number) =>
    le ? head.writeUInt16LE(value, at) : head.writeUInt16BE(value, at);
  const put32 = (at: number, value: number) =>
    le ? head.writeUInt32LE(value, at) : head.writeUInt32BE(value, at);
  head.write(le ? 'II' : 'MM');
  put16(2, 42);
  put32(4, start);
  if (cr2) {
    head.write('CR', 8);
    head[10] = 2;
  }
  put16(start, tags.length);
  for (const [i, [tag, type, count, value]] of tags.entries()) {
    const at = start + 2 + i * 12;
    put16(at, tag);
    put16(at + 2, type);
    put32(at + 4, count);
    if (type === 3 && count === 1) put16(at + 8, value);
    else if (type === 1) head.writeUInt32BE(value, at + 8);
    else put32(at + 8, value === -1 ? head.length : value);
  }
  return Buffer.concat([head, data]);
}

function box(type: string, ...parts: Buffer[]) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + parts.reduce((size, part) => size + part.length, 0));
  header.write(type, 4);
  return Buffer.concat([header, ...parts]);
}

export const rotatedHeic = (() => {
  const input = Buffer.from(heic);
  const properties = input.indexOf('ipco') - 4;
  const associations = input.indexOf('ipma') - 4;
  const count = associations + 18;
  input[count]!++;
  for (const name of ['meta', 'iprp', 'ipco', 'ipma']) {
    const at = input.indexOf(name) - 4;
    input.writeUInt32BE(
      input.readUInt32BE(at) + (name === 'ipco' ? 9 : name === 'ipma' ? 1 : 10),
      at,
    );
  }
  const itemOffset = input.indexOf('iloc') + 16;
  input.writeUInt32BE(input.readUInt32BE(itemOffset) + 10, itemOffset);
  const media = input.indexOf('mdat') - 4;
  return Buffer.concat([
    input.subarray(0, properties + input.readUInt32BE(properties) - 9),
    box('irot', Buffer.from([1])),
    input.subarray(associations, media),
    Buffer.from([6]),
    input.subarray(media),
  ]);
})();

export const orientedJpeg = (() => {
  const app1 = Buffer.concat([Buffer.from('Exif\0\0'), ifd([[274, 3, 1, 6]], Buffer.alloc(0))]);
  const marker = Buffer.from([0xff, 0xe1, 0, app1.length + 2]);
  return Buffer.concat([jpeg.subarray(0, 2), marker, app1, jpeg.subarray(2)]);
})();

export const tiff = ifd(
  [
    [256, 3, 1, 3],
    [257, 3, 1, 2],
    [258, 3, 1, 8],
    [259, 3, 1, 1],
    [262, 3, 1, 1],
    [273, 4, 1, -1],
    [274, 3, 1, 2],
    [277, 3, 1, 1],
    [278, 4, 1, 2],
    [279, 4, 1, 6],
  ],
  Buffer.from([10, 60, 150, 100, 120, 200]),
  false,
);

export const dng = ifd(
  [
    [274, 3, 1, 6],
    [513, 4, 1, -1],
    [514, 4, 1, jpeg.length],
    [50706, 1, 4, 0x01040000],
  ],
  jpeg,
);

export const cr2 = ifd(
  [
    [273, 4, 1, -1],
    [274, 3, 1, 6],
    [279, 4, 1, jpeg.length],
  ],
  jpeg,
  true,
  true,
);

export const cr3 = (() => {
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt16BE(64, 6);
  descriptor.writeUInt16BE(48, 8);
  descriptor.writeUInt32BE(jpeg.length, 12);
  return Buffer.concat([
    box('ftyp', Buffer.from('crx \0\0\0\0crx ')),
    box(
      'moov',
      box(
        'uuid',
        Buffer.from('85c0b687820f11e08111f4ce462b6a48', 'hex'),
        box('CMT1', ifd([[274, 3, 1, 6]], Buffer.alloc(0))),
      ),
    ),
    box(
      'uuid',
      Buffer.from('eaf42b5e1c984b88b9fbb7dc406e4d160000000000000001', 'hex'),
      box('PRVW', descriptor, jpeg),
    ),
  ]);
})();
