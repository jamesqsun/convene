import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

/** Writes the PWA icons: a dark rounded square with a light ring. No image library needed. */

function crc32(bytes: Uint8Array): number {
  let crc = -1
  for (const byte of bytes) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ -1) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])))
  return Buffer.concat([length, typeBytes, data, crc])
}

function pixel(x: number, y: number, size: number): [number, number, number, number] {
  const half = size / 2
  const dx = x - half + 0.5
  const dy = y - half + 0.5
  const distance = Math.sqrt(dx * dx + dy * dy)
  const corner = size * 0.18
  const inside =
    Math.abs(dx) < half - corner ||
    Math.abs(dy) < half - corner ||
    Math.hypot(Math.abs(dx) - (half - corner), Math.abs(dy) - (half - corner)) < corner
  if (!inside) return [0, 0, 0, 0]
  const isRing =
    distance > size * 0.24 && distance < size * 0.34 && !(dx > 0 && Math.abs(dy) < size * 0.08)
  return isRing ? [250, 250, 249, 255] : [28, 25, 23, 255]
}

function png(size: number): Uint8Array {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixel(x, y, size)
      raw.set([r, g, b, a], y * (size * 4 + 1) + 1 + x * 4)
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array()),
  ])
}

for (const size of [192, 512]) writeFileSync(`public/icons/icon-${size}.png`, png(size))
console.log('Icons written to public/icons')
