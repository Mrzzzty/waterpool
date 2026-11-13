/**
 * Reverb fitting shared by both modes.
 *
 * A tiled swimming pool is close to the worst possible acoustic environment:
 * glazed ceramic absorbs almost nothing, water eats the top end, and the rooms
 * range from a 2.4 m locker corridor to a 50 m well. One fixed reverb per scene
 * cannot express that, so every room is reduced to a box and the response is
 * derived from its volume.
 *
 * This is deliberately cheap rather than physical. Sabine's equation gives
 * absurd decay times for glazed tile (25 s for the main hall), so the numbers
 * below are fitted so the *ordering* is right and the values land in a range
 * that still reads as architecture:
 *
 *   volume         -> pre-delay   (a big room answers you later)
 *   volume × damp  -> feedback    (a big room answers you longer)
 *   volume         -> lowpass     (a big room keeps its high end)
 *   volume         -> wet gain    (a big room puts more tail around you)
 *
 * `damp` is the only material term. 1.0 is dry glazed tile; standing water
 * takes roughly 15 % off, because a water surface absorbs mid/high frequencies
 * instead of returning them.
 */
export type Acoustic = {
  /** pre-delay of the near reflection pair, seconds */
  delay: number
  /** feedback of the near pair, 0..1 */
  feedback: number
  /** lowpass corner of the near pair, Hz */
  cutoff: number
  /** wet gain of the near pair */
  wet: number
  /** pre-delay of the single far reflection, seconds */
  far: number
  /** gain of the far reflection; small rooms get none */
  farGain: number
  /** dry bus level */
  level: number
}

const clamp = (v: number, lo: number, hi: number) => v < lo ? lo : v > hi ? hi : v

export function fitAcoustic(width: number, depth: number, height: number, damp: number, level = .72): Acoustic {
  const volume = Math.max(1, width) * Math.max(1, depth) * Math.max(1, height)
  const ratio = volume / 140
  return {
    delay: clamp(.026 * Math.cbrt(ratio), .026, .105),
    feedback: clamp(.50 + .085 * Math.log2(ratio), .34, .93) * damp,
    cutoff: clamp(1080 * Math.pow(ratio, .22), 820, 4600) * (.82 + .18 * damp),
    wet: clamp(.33 + .072 * Math.log2(ratio), .30, .78),
    far: clamp(.055 + .016 * Math.cbrt(ratio), .06, .21),
    // A small room has no separate late reflection, only a tight flutter.
    farGain: volume > 600 ? clamp(.015 * Math.pow(ratio, .30), 0, .16) : 0,
    level,
  }
}
