// Compact MD5 for kosync protocol (password hash + document digests).

const K = new Uint32Array(64)
for (let i = 0; i < 64; i++)
  K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)

const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]

const rotl = (x: number, c: number) => ((x << c) | (x >>> (32 - c))) | 0

export const md5Bytes = (input: Uint8Array): string => {
  const len = input.length
  const bitLenLo = (len * 8) >>> 0
  const bitLenHi = Math.floor((len * 8) / 4294967296)
  const paddedLen = (((len + 8) >> 6) + 1) << 6
  const padded = new Uint8Array(paddedLen)
  padded.set(input)
  padded[len] = 0x80
  const dv = new DataView(padded.buffer)
  dv.setUint32(paddedLen - 8, bitLenLo, true)
  dv.setUint32(paddedLen - 4, bitLenHi, true)

  let a0 = 0x67452301 | 0, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476 | 0
  const M = new Int32Array(16)

  for (let chunk = 0; chunk < paddedLen; chunk += 64) {
    for (let i = 0; i < 16; i++) M[i] = dv.getInt32(chunk + i * 4, true)
    let A = a0, B = b0, C = c0, D = d0
    for (let i = 0; i < 64; i++) {
      let F: number, g: number
      if (i < 16) { F = (B & C) | (~B & D); g = i }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16 }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16 }
      else { F = C ^ (B | ~D); g = (7 * i) % 16 }
      F = (F + A + (K[i] | 0) + M[g]) | 0
      A = D; D = C; C = B
      B = (B + rotl(F, S[(Math.floor(i / 16) * 4) + (i % 4)])) | 0
    }
    a0 = (a0 + A) | 0
    b0 = (b0 + B) | 0
    c0 = (c0 + C) | 0
    d0 = (d0 + D) | 0
  }

  const toHexLE = (n: number) => {
    let s = ''
    for (let i = 0; i < 4; i++) s += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, '0')
    return s
  }
  return toHexLE(a0) + toHexLE(b0) + toHexLE(c0) + toHexLE(d0)
}

export const md5String = (s: string): string =>
  md5Bytes(new TextEncoder().encode(s))

// KOReader partial MD5: samples 1024 bytes at offsets 1024 << 2i for i = -1..10
// (i.e. 256, 1024, 4096, 16384, ... 1073741824), stopping at EOF.
export const partialMd5 = async (blob: Blob): Promise<string> => {
  const offsets: number[] = []
  for (let i = -1; i <= 10; i++) offsets.push(1024 * Math.pow(2, 2 * i))
  const chunks: Uint8Array[] = []
  for (const offset of offsets) {
    if (offset >= blob.size) break
    const buf = await blob.slice(offset, offset + 1024).arrayBuffer()
    if (buf.byteLength === 0) break
    chunks.push(new Uint8Array(buf))
  }
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const all = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) { all.set(c, pos); pos += c.length }
  return md5Bytes(all)
}
