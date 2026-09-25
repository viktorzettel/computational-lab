// Astronomical data. Scene scale: 1 unit = 1 AU.

export const KM_PER_AU = 149597870.7
export const AU_PER_LY = 63241.077
export const RSUN_AU = 696340 / KM_PER_AU

export interface PlanetDef {
  name: string
  color: number
  a: number // semi-major axis, AU
  e: number // eccentricity
  periodYears: number
  radiusKm: number
  phase: number // initial mean anomaly, rad (arbitrary epoch)
}

export const PLANETS: PlanetDef[] = [
  { name: 'Mercury', color: 0x9c9490, a: 0.387, e: 0.206, periodYears: 0.241, radiusKm: 2440, phase: 0.8 },
  { name: 'Venus',   color: 0xe6c78f, a: 0.723, e: 0.007, periodYears: 0.615, radiusKm: 6052, phase: 2.4 },
  { name: 'Earth',   color: 0x6b93d6, a: 1.000, e: 0.017, periodYears: 1.000, radiusKm: 6371, phase: 4.1 },
  { name: 'Mars',    color: 0xc1440e, a: 1.524, e: 0.093, periodYears: 1.881, radiusKm: 3390, phase: 5.6 },
  { name: 'Jupiter', color: 0xd8ca9d, a: 5.203, e: 0.048, periodYears: 11.862, radiusKm: 69911, phase: 1.7 },
  { name: 'Saturn',  color: 0xead6a6, a: 9.537, e: 0.054, periodYears: 29.457, radiusKm: 58232, phase: 3.3 },
  { name: 'Uranus',  color: 0xafdbf5, a: 19.191, e: 0.047, periodYears: 84.011, radiusKm: 25362, phase: 0.3 },
  { name: 'Neptune', color: 0x5b7fdf, a: 30.069, e: 0.009, periodYears: 164.79, radiusKm: 24622, phase: 5.0 },
]

// Size (px) and opacity per luminosity bin in the 150 ly point cloud (6 bins, 0..5)
// (bin 0 = brightest by absolute G magnitude, bin 5 = faint red/white dwarfs)
export const GAIA_BINS: { sizePx: number; opacity: number }[] = [
  { sizePx: 7.5, opacity: 1.0 },
  { sizePx: 5.8, opacity: 0.95 },
  { sizePx: 4.6, opacity: 0.9 },
  { sizePx: 3.6, opacity: 0.82 },
  { sizePx: 2.7, opacity: 0.72 },
  { sizePx: 2.0, opacity: 0.6 },
]

// Alpha Centauri system parameters
export const ALPHA_CEN = {
  raHours: 14.66,
  decDeg: -60.84,
  distLy: 4.37,
  mA: 1.10, // solar masses
  mB: 0.90,
  a: 23.3, // A-B semi-major axis, AU
  e: 0.52,
  periodYears: 79.9,
  rA: 1.23 * RSUN_AU,
  rB: 0.86 * RSUN_AU,
  rProxima: 0.15 * RSUN_AU,
  proxima: { raHours: 14.495, decDeg: -62.679, distLy: 4.244 },
}
