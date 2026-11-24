// Media fixtures for the smoke. Bytes matter, not decodability: a PNG is
// real (so previews could read it), the rest are labeled binary payloads.
import { randomBytes } from "node:crypto";
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const name = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

/** A real RGB PNG with random pixels; random data barely compresses. */
export function png(width, height, seed = randomBytes(width * height * 3)) {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0;
    seed.copy(raw, y * stride + 1, y * width * 3, (y + 1) * width * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const points = (size, fill) => Buffer.alloc(size, fill);

export function mediaFiles() {
  const mp4 = randomBytes(8 * 1024 * 1024);
  mp4.write("ftyp", 4, "ascii");
  const pdf = Buffer.from(
    "%PDF-1.4\n" +
      "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n" +
      "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n" +
      "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>endobj\n" +
      "trailer<< /Root 1 0 R >>\n%%EOF\n",
  );
  return [
    { path: "Notes/media/pixel.png", bytes: png(1, 1) },
    { path: "Notes/media/image-512.png", bytes: png(512, 512) },
    {
      path: "Notes/media/photo.jpg",
      bytes: Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        randomBytes(3 * 1024 * 1024),
        Buffer.from([0xff, 0xd9]),
      ]),
    },
    { path: "Notes/media/clip.mp4", bytes: mp4 },
    { path: "Notes/media/doc.pdf", bytes: pdf },
    { path: "Notes/media/blob.mp4", bytes: points(1024 * 1024, 0xa5) },
    { path: "Notes/media/empty.txt", bytes: Buffer.alloc(0) },
    {
      path: "Notes/media/boundary-2mib-minus1.mp4",
      bytes: points(2 * 1024 * 1024 - 1, 0x11),
    },
    {
      path: "Notes/media/boundary-2mib.mp4",
      bytes: points(2 * 1024 * 1024, 0x22),
    },
    {
      path: "Notes/media/boundary-2mib-plus1.mp4",
      bytes: points(2 * 1024 * 1024 + 1, 0x33),
    },
    { path: "Notes/media/sub/deep.mp4", bytes: randomBytes(64 * 1024) },
    {
      path: "Notes/媒体/中文 文件 #1 %.md",
      bytes: Buffer.from("中文文件名与空格\n"),
    },
    { path: "Notes/媒体/emoji 😀.md", bytes: Buffer.from("emoji file\n") },
  ];
}
