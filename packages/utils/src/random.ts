const crypto = globalThis.crypto || globalThis.msCrypto

const cryptoRandom = () => {
  const cryptoRandomSlices = []
  let cryptoRandoms: Uint32Array
  let cryptoRandom
  try {
    while ((cryptoRandom = '.' + cryptoRandomSlices.join('')).length < 30) {
      cryptoRandoms = crypto.getRandomValues(new Uint32Array(5))

      for (let i = 0; i < cryptoRandoms.length; i++) {
        const cRandom = cryptoRandoms[i]
        const slice = cRandom && cRandom < 4000000000 ? cRandom.toString().slice(1) : ''
        if (slice.length > 0) {
          cryptoRandomSlices[cryptoRandomSlices.length] = slice
        }
      }
    }
    return Number(cryptoRandom)
  } catch {
    return Math.random()
  }
}

export function random(from: number, to: number): number {
  const v1 = Math.floor(from > to ? to : from)
  const v2 = Math.floor(from > to ? from : to)

  return Math.floor(cryptoRandom() * (v2 - v1 + 1) + v1)
}

export function randomBytes(byteLength = 32) {
  return crypto.getRandomValues(new Uint8Array(byteLength))
}
