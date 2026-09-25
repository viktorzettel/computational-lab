import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { PLANETS, GAIA_BINS, ALPHA_CEN, AU_PER_LY, KM_PER_AU, RSUN_AU } from './data.ts'

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// Scene scale: 1 unit = 1 AU. The scene spans ~9 orders of magnitude
// (planet radii ~1e-4 AU up to stars ~7e5 AU), so we use a logarithmic
// depth buffer and fixed-pixel-size point markers to keep everything visible.
// ---------------------------------------------------------------------------

const app = document.querySelector<HTMLDivElement>('#app')!

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1e-5, 4e7)
camera.position.set(0, 22, 52)

const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
app.appendChild(renderer.domElement)

// Scene Lighting for realistic metallic and shaded materials
const ambientLight = new THREE.AmbientLight(0xdde8ff, 0.75)
scene.add(ambientLight)

const sunLight = new THREE.DirectionalLight(0xfff8ed, 1.8)
sunLight.position.set(0, 5, 5)
scene.add(sunLight)

const labelRenderer = new CSS2DRenderer()
labelRenderer.setSize(window.innerWidth, window.innerHeight)
labelRenderer.domElement.className = 'label-layer'
app.appendChild(labelRenderer.domElement)

const controls = new OrbitControls(camera, labelRenderer.domElement)
controls.enableDamping = true
controls.zoomSpeed = 3
controls.minDistance = 5e-5 // ~7,500 km: close enough to see Earth at true scale
controls.maxDistance = 1.8e7

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OBLIQUITY = 23.4392811 * Math.PI / 180

// RA/Dec/distance -> scene position (ecliptic plane horizontal, y = ecliptic north)
function starPosition(raHours: number, decDeg: number, distLy: number): THREE.Vector3 {
  const ra = (raHours / 24) * Math.PI * 2
  const dec = (decDeg * Math.PI) / 180
  const x = Math.cos(dec) * Math.cos(ra)
  const yEq = Math.cos(dec) * Math.sin(ra)
  const zEq = Math.sin(dec)
  const yEcl = Math.cos(OBLIQUITY) * yEq + Math.sin(OBLIQUITY) * zEq
  const zEcl = -Math.sin(OBLIQUITY) * yEq + Math.cos(OBLIQUITY) * zEq
  return new THREE.Vector3(x, zEcl, yEcl).multiplyScalar(distLy * AU_PER_LY)
}

function solveKepler(M: number, e: number): number {
  let E = M
  for (let i = 0; i < 12; i++) E = M + e * Math.sin(E)
  return E
}

function trueAnomaly(E: number, e: number): number {
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2))
}

// Position on an ellipse (focus at origin) for true anomaly nu, in the XZ plane
function orbitPoint(a: number, e: number, nu: number, out: THREE.Vector3): THREE.Vector3 {
  const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu))
  return out.set(r * Math.cos(nu), 0, -r * Math.sin(nu))
}

function ellipseLine(a: number, e: number, color: number, opacity: number, flip = false): THREE.Line {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 256; i++) {
    const nu = (i / 256) * Math.PI * 2
    const p = orbitPoint(a, e, nu, new THREE.Vector3())
    if (flip) p.multiplyScalar(-1)
    pts.push(p)
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts)
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }))
}

// Soft round sprite so points render as glowing dots instead of hard squares
const starTexture = (() => {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.4, 'rgba(255,255,255,0.8)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
})()

// Fixed-pixel-size marker so bodies stay visible at any zoom (like real stars:
// far too small to resolve, but bright enough to see)
function createMarker(color: number, sizePx: number): THREE.Points {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()])
  const mat = new THREE.PointsMaterial({
    color, size: sizePx, sizeAttenuation: false, transparent: true, opacity: 0.9,
    depthWrite: false, map: starTexture,
  })
  const pts = new THREE.Points(geo, mat)
  pts.renderOrder = 1
  return pts
}

function createLabel(text: string, cls = ''): CSS2DObject {
  const div = document.createElement('div')
  div.className = `label ${cls}`.trim()
  div.textContent = text
  return new CSS2DObject(div)
}

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
const fadeIn = (d: number, from: number, to: number) => smooth((d - from) / (to - from))
const fadeOut = (d: number, from: number, to: number) => 1 - smooth((d - from) / (to - from))

const sphereGeo = new THREE.SphereGeometry(1, 32, 32)

function createBody(radiusAu: number, color: number, markerPx: number, labelText: string): THREE.Mesh {
  const mesh = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color }))
  mesh.scale.setScalar(radiusAu)
  mesh.add(createMarker(color, markerPx))
  mesh.add(createLabel(labelText))
  return mesh
}

// ---------------------------------------------------------------------------
// Distance measurement: click a named star's label to draw a dashed line from
// the Sun to that star with the distance in light-years. Click again to clear.
// ---------------------------------------------------------------------------

const measureLine = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.85 }),
)
measureLine.visible = false
scene.add(measureLine)
const measureLabel = createLabel('', 'label-measure')
measureLabel.visible = false
scene.add(measureLabel)
let measuredName: string | null = null
let measuredPos: THREE.Vector3 | null = null

function clearMeasure() {
  measuredName = null
  measuredPos = null
  measureLine.visible = false
  measureLabel.visible = false
  document.querySelectorAll('.label-active').forEach((el) => el.classList.remove('label-active'))
  refreshTravelPanel()
}

/** Select a star as the measured / travel target (dashed line from the Sun + Depart button). */
function setMeasure(name: string, pos: THREE.Vector3, el?: HTMLElement) {
  clearMeasure()
  measuredName = name
  el?.classList.add('label-active')
  measuredPos = pos.clone()
  measureLine.geometry.dispose()
  measureLine.geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), pos])
  measureLine.visible = true
  measureLabel.position.copy(pos).multiplyScalar(0.5)
  measureLabel.element.textContent = `${(pos.length() / AU_PER_LY).toFixed(2)} ly`
  measureLabel.visible = true
  refreshTravelPanel()
}

function makeMeasurable(label: CSS2DObject, name: string, getPos: () => THREE.Vector3) {
  const el = label.element
  el.classList.add('label-clickable')
  el.addEventListener('pointerdown', (e) => e.stopPropagation())
  el.addEventListener('click', (e) => {
    e.stopPropagation()
    if (travel) return // finish or exit the current journey first
    if (measuredName === name) {
      clearMeasure()
      return
    }
    setMeasure(name, getPos(), el)
  })
}

// ---------------------------------------------------------------------------
// Solar system: Sun + planets on Kepler orbits
// ---------------------------------------------------------------------------

const sun = createBody(RSUN_AU, 0xfff2cc, 7, 'Sun')
scene.add(sun)

interface PlanetObj {
  def: (typeof PLANETS)[number]
  mesh: THREE.Mesh
  marker: THREE.Points
  label: CSS2DObject
  orbit: THREE.Line
}

const planets: PlanetObj[] = PLANETS.map((def) => {
  const mesh = createBody(def.radiusKm / KM_PER_AU, def.color, 3.5, def.name)
  const marker = mesh.children[0] as THREE.Points
  const label = mesh.children[1] as CSS2DObject
  const orbit = ellipseLine(def.a, def.e, def.color, 0.35)
  scene.add(mesh, orbit)
  return { def, mesh, marker, label, orbit }
})

const earthMesh = planets.find((p) => p.def.name === 'Earth')!.mesh

// Saturn's rings (real proportions, visible when zoomed close)
{
  const saturn = planets.find((p) => p.def.name === 'Saturn')!
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.24, 2.27, 64),
    new THREE.MeshBasicMaterial({ color: 0xd9c79a, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  )
  ring.rotation.x = Math.PI / 2 + 0.466 // ~26.7 deg axial tilt
  saturn.mesh.add(ring)
}

// ---------------------------------------------------------------------------
// Kuiper Belt (30-50 AU disc) and Oort Cloud (2,000-100,000 AU shell)
// ---------------------------------------------------------------------------

function pointCloud(positions: number[], color: number, sizePx: number, opacity: number): THREE.Points {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const mat = new THREE.PointsMaterial({
    color, size: sizePx, sizeAttenuation: false, transparent: true, opacity,
    depthWrite: false, map: starTexture,
  })
  return new THREE.Points(geo, mat)
}

const kuiperPts: number[] = []
for (let i = 0; i < 2500; i++) {
  const r = 30 + Math.random() * 20
  const angle = Math.random() * Math.PI * 2
  const incl = (Math.random() + Math.random() + Math.random() - 1.5) * 0.08 // ~few degrees
  kuiperPts.push(r * Math.cos(angle), r * Math.sin(incl), r * Math.sin(angle))
}
const kuiper = pointCloud(kuiperPts, 0x8899aa, 2, 0.5)
scene.add(kuiper)
const kuiperLabel = createLabel('Kuiper Belt', 'label-region')
kuiperLabel.position.set(0, 2, -45)
scene.add(kuiperLabel)

const OORT_INNER = 2000
const OORT_OUTER = 100000
const oortPts: number[] = []
for (let i = 0; i < 7000; i++) {
  // log-uniform radius -> denser toward the inner edge
  const r = OORT_INNER * Math.pow(OORT_OUTER / OORT_INNER, Math.random())
  const theta = Math.random() * Math.PI * 2
  const phi = Math.acos(Math.random() * 2 - 1)
  oortPts.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta))
}
const oort = pointCloud(oortPts, 0x88aacc, 2, 0.25)
scene.add(oort)
const oortLabel = createLabel('Oort Cloud', 'label-region')
oortLabel.position.set(0, 25000, -40000)
scene.add(oortLabel)

// ---------------------------------------------------------------------------
// Alpha Centauri: A-B binary on its true Kepler orbit + Proxima, placed at the
// system's real position 4.37 ly from the Sun
// ---------------------------------------------------------------------------

const AC = ALPHA_CEN
const alphaCenPos = starPosition(AC.raHours, AC.decDeg, AC.distLy)
const alphaCen = new THREE.Group()
alphaCen.position.copy(alphaCenPos)
scene.add(alphaCen)

// Each star orbits the barycenter on an ellipse scaled by the mass ratio
const aA = (AC.mB / (AC.mA + AC.mB)) * AC.a
const aB = (AC.mA / (AC.mA + AC.mB)) * AC.a

const starA = createBody(AC.rA, 0xfff4e8, 6, 'α Cen A')
const starB = createBody(AC.rB, 0xffd2a1, 5, 'α Cen B')
alphaCen.add(starA, starB)

const orbitA = ellipseLine(aA, AC.e, 0xfff4e8, 0.8)
const orbitB = ellipseLine(aB, AC.e, 0xffd2a1, 0.8, true)
alphaCen.add(orbitA, orbitB)

// Proxima at its real offset from A-B (~13,000 AU), with a reference circle
// through that point (the true orbit takes ~550,000 years)
const proximaLocal = starPosition(AC.proxima.raHours, AC.proxima.decDeg, AC.proxima.distLy).sub(alphaCenPos)
const proxima = createBody(AC.rProxima, 0xff4500, 4, 'Proxima Centauri')
proxima.position.copy(proximaLocal)
alphaCen.add(proxima)

{
  const axis = new THREE.Vector3(0, 1, 0).cross(proximaLocal).normalize()
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 256; i++) {
    const q = new THREE.Quaternion().setFromAxisAngle(axis, (i / 256) * Math.PI * 2)
    pts.push(proximaLocal.clone().applyQuaternion(q))
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts)
  const proximaOrbit = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff4500, transparent: true, opacity: 0.4 }))
  alphaCen.add(proximaOrbit)
}

const alphaCenLabel = createLabel('Alpha Centauri', 'label-system')
alphaCen.add(alphaCenLabel)
makeMeasurable(alphaCenLabel, 'Alpha Centauri', () => alphaCenPos.clone())
makeMeasurable(proxima.children[1] as CSS2DObject, 'Proxima Centauri', () => alphaCenPos.clone().add(proximaLocal))

// ---------------------------------------------------------------------------
// 150 ly catalog: Gaia DR3 objects that are GCNS members (stars, white dwarfs
// and brown dwarfs) at their real 3D positions, colored by bp_rp and sized by
// absolute magnitude, plus naked-eye Hipparcos-2 stars that Gaia misses (too
// bright). Proxima and alpha Cen A/B are excluded (they live in the Alpha Cen
// group). Counts and index ranges come from the JSON (`count`, `sources`).
// ---------------------------------------------------------------------------

interface GaiaData {
  count: number
  sources: [string, number, number][] // [catalog, startIndex, endIndex)
  pos: number[] // flat xyz, light-years, ecliptic scene frame
  col: number[] // flat rgb, 0-255
  bin: number[] // brightness bin, 0 (bright) .. 5 (faint), see GAIA_BINS
  // Old format: [index, name]. New format: [index, name, fame_tier] sorted by tier then brightness.
  names: ([number, string] | [number, string, number])[]
  cls?: number[] // per-point class id (optional, new format)
  classes?: { id: number; key: string; label: string; count: number }[]
}

// Named catalog stars: label + fly-to target. `prio` = draw/placement priority (0 = highest).
interface NamedStar {
  name: string
  tier: number
  prio: number
  pos: THREE.Vector3 // AU
  distLy: number // from the Sun
  label: CSS2DObject
  halfW: number // estimated half label width in px (for overlap tests)
  shown: boolean
  opacity: number
}
const namedStars: NamedStar[] = []
const catalogCounts = { gaia: 0, hipparcos: 0 }

// Star-class styling (discreet desaturated tints). Matched by `key`, then by position
// in `classes` (red, orange, yellow dwarf, F, A, hot blue, giant, white dwarf, unclassified).
interface ClassStyle { color: [number, number, number]; size: number }
const CLASS_STYLE_BY_KEY: Record<string, ClassStyle> = {
  red_dwarf: { color: [222, 176, 128], size: 0.8 }, // muted amber
  orange_dwarf: { color: [236, 200, 158], size: 0.9 }, // soft orange
  yellow_dwarf: { color: [246, 232, 206], size: 1.0 }, // warm white
  f_type: { color: [244, 243, 236], size: 1.08 }, // near-white
  a_type: { color: [222, 232, 248], size: 1.18 }, // pale blue-white
  hot_blue: { color: [186, 208, 246], size: 1.32 }, // pale blue
  giant: { color: [232, 204, 146], size: 1.45 }, // muted gold
  white_dwarf: { color: [214, 226, 238], size: 0.72 }, // pale cool white
  unclassified: { color: [146, 149, 156], size: 0.8 }, // neutral grey, dwarf size
}
const CLASS_KEY_ORDER = Object.keys(CLASS_STYLE_BY_KEY)
const classStyle = (key: string, order: number): ClassStyle =>
  CLASS_STYLE_BY_KEY[key] ?? CLASS_STYLE_BY_KEY[CLASS_KEY_ORDER[order]] ?? CLASS_STYLE_BY_KEY.unclassified

fetch(`${import.meta.env.BASE_URL}gaia_stars_150ly.json`)
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })
  .then((data: GaiaData) => {
    for (const [src, start, end] of data.sources) {
      if (src === 'Gaia DR3') catalogCounts.gaia = end - start
      if (src === 'Hipparcos') catalogCounts.hipparcos = end - start
    }
    // One Points object per (class, brightness bin): PointsMaterial has a single size.
    // Without `cls` (old JSON) there is a single pseudo-class and the per-star `col` is kept.
    const hasCls = Array.isArray(data.cls) && data.cls.length === data.count && Array.isArray(data.classes)
    const classes = hasCls ? data.classes! : []
    const classIndex = new Map<number, number>()
    classes.forEach((c, k) => classIndex.set(c.id, k))
    const styles = classes.map((c, k) => classStyle(c.key, k))
    const nGroups = hasCls ? classes.length : 1
    const positions: number[][][] = Array.from({ length: nGroups }, () => GAIA_BINS.map(() => []))
    const colors: number[][][] = Array.from({ length: nGroups }, () => GAIA_BINS.map(() => []))
    const counted = new Array(nGroups).fill(0)
    for (let i = 0; i < data.count; i++) {
      const b = data.bin[i]
      const g = hasCls ? classIndex.get(data.cls![i]) ?? nGroups - 1 : 0
      counted[g]++
      positions[g][b].push(
        data.pos[i * 3] * AU_PER_LY,
        data.pos[i * 3 + 1] * AU_PER_LY,
        data.pos[i * 3 + 2] * AU_PER_LY,
      )
      if (hasCls) {
        const c = styles[g].color
        colors[g][b].push(c[0] / 255, c[1] / 255, c[2] / 255)
      } else {
        colors[g][b].push(data.col[i * 3] / 255, data.col[i * 3 + 1] / 255, data.col[i * 3 + 2] / 255)
      }
    }
    for (let g = 0; g < nGroups; g++) {
      GAIA_BINS.forEach((binDef, b) => {
        if (positions[g][b].length === 0) return
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions[g][b], 3))
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors[g][b], 3))
        const size = hasCls ? THREE.MathUtils.clamp(binDef.sizePx * styles[g].size, 1.6, 9) : binDef.sizePx
        const mat = new THREE.PointsMaterial({
          size,
          sizeAttenuation: false,
          vertexColors: true,
          transparent: true,
          opacity: binDef.opacity,
          depthWrite: false,
          map: starTexture,
        })
        scene.add(new THREE.Points(geo, mat))
      })
    }
    if (hasCls) {
      buildLegend(classes.map((c, k) => ({
        label: c.label,
        count: Number.isFinite(c.count) ? c.count : counted[k],
        color: styles[k].color,
      })))
    }

    // Names: new format is already sorted by tier then brightness; old format has no tier,
    // so treat all as tier 1 and order by brightness bin (stable).
    const entries = data.names.map((e, order) => ({
      i: e[0], name: e[1], tier: e.length > 2 ? Number(e[2]) : 1, order,
    }))
    const isNew = data.names.some((e) => e.length > 2)
    if (!isNew) entries.sort((a, b) => data.bin[a.i] - data.bin[b.i] || a.order - b.order)
    entries.forEach((e, prio) => {
      const tier = Number.isFinite(e.tier) ? Math.max(0, Math.round(e.tier)) : 2
      const label = createLabel(e.name, `label-star t${Math.min(tier, 3)}`)
      label.position.set(
        data.pos[e.i * 3] * AU_PER_LY,
        data.pos[e.i * 3 + 1] * AU_PER_LY,
        data.pos[e.i * 3 + 2] * AU_PER_LY,
      )
      label.visible = false
      makeMeasurable(label, e.name, () => label.position.clone())
      scene.add(label)
      namedStars.push({
        name: e.name, tier, prio, pos: label.position, label,
        distLy: label.position.length() / AU_PER_LY,
        halfW: e.name.length * (tier === 0 ? 3.3 : 3.0) + 4,
        shown: false, opacity: -1,
      })
    })
    buildFlytoList()
  })
  .catch((err) => console.error('Failed to load Gaia catalog:', err))

const sunSystemLabel = createLabel('Solar System', 'label-system')
scene.add(sunSystemLabel)

// ---------------------------------------------------------------------------
// Galactic center indicator: Sgr A* sits 26,700 ly away — far outside this
// map — so point at it from just beyond the 150-ly bubble
// ---------------------------------------------------------------------------

const galacticIndicator = new THREE.Group()
{
  const dir = starPosition(17.761, -29.008, 1).normalize() // Sgr A* (RA 17h45m, Dec -29°)
  const from = dir.clone().multiplyScalar(155 * AU_PER_LY)
  const to = dir.clone().multiplyScalar(185 * AU_PER_LY)
  const geo = new THREE.BufferGeometry().setFromPoints([from, to])
  galacticIndicator.add(
    new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffcf7a, transparent: true, opacity: 0.7 })),
  )
  const tip = createMarker(0xffd9a0, 9)
  tip.position.copy(to)
  galacticIndicator.add(tip)
  const label = createLabel('Galactic Center (26,700 ly)', 'label-galactic')
  label.position.copy(to)
  galacticIndicator.add(label)
}
galacticIndicator.visible = false
scene.add(galacticIndicator)

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

const hud = document.createElement('div')
hud.className = 'hud'
hud.innerHTML = `
  <h2>Galactic Neighborhood</h2>
  <div class="hud-rows">
    <div><span>Scale</span><b>1 unit = 1 AU, true distances</b></div>
    <div><span>View</span><b id="hud-view"></b></div>
    <div><span>Distance from Sun</span><b id="hud-dist"></b></div>
    <div><span>Elapsed</span><b id="hud-elapsed"></b></div>
    <div><span>α Cen A–B separation</span><b id="hud-sep"></b></div>
  </div>
  <div class="hud-group"><span>Speed</span><span class="hud-buttons" id="hud-speed"></span></div>
  <div class="hud-group"><span>Go to</span><span class="hud-buttons" id="hud-goto"></span></div>
  <div class="hud-tip" id="hud-tip"></div>
`
app.appendChild(hud)

const hudView = hud.querySelector('#hud-view')!
const hudDist = hud.querySelector('#hud-dist')!
const hudElapsed = hud.querySelector('#hud-elapsed')!
const hudSep = hud.querySelector('#hud-sep')!
const hudTip = hud.querySelector('#hud-tip')!

// Time controls
let daysPerSecond = 1
const speedEl = hud.querySelector('#hud-speed')!
const speeds: [string, number][] = [['1 h/s', 1 / 24], ['1 d/s', 1], ['30 d/s', 30], ['1 yr/s', 365.25], ['20 yr/s', 7305]]
for (const [text, value] of speeds) {
  const btn = document.createElement('button')
  btn.textContent = text
  btn.dataset.dps = String(value)
  if (value === daysPerSecond) btn.classList.add('active')
  btn.addEventListener('click', () => setSpeed(value))
  speedEl.appendChild(btn)
}

// Custom values (e.g. from space travel) simply deselect every preset
function setSpeed(dps: number) {
  daysPerSecond = dps
  speedEl.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', Number((b as HTMLElement).dataset.dps) === dps)
  })
}

// Camera fly-to: lerp the target, interpolate distance exponentially so the
// zoom feels uniform across orders of magnitude. A flight may name a moving
// object (a planet) — the destination tracks it and the camera keeps
// following it after arrival, until the user zooms far away.
interface FlightSpec {
  target: THREE.Vector3
  offset: THREE.Vector3
  followObj?: THREE.Object3D
}
let flight: {
  start: number
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
  fromOffset: THREE.Vector3
  toOffset: THREE.Vector3
  toObj?: THREE.Object3D
} | null = null
let followObj: THREE.Object3D | null = null

function flyTo(spec: FlightSpec) {
  followObj = null
  flight = {
    start: performance.now(),
    fromTarget: controls.target.clone(),
    toTarget: spec.target.clone(),
    fromOffset: camera.position.clone().sub(controls.target),
    toOffset: spec.offset.clone(),
    toObj: spec.followObj,
  }
}

const gotoEl = hud.querySelector('#hud-goto')!
const views: [string, () => FlightSpec][] = [
  ['Planets', () => ({ target: new THREE.Vector3(), offset: new THREE.Vector3(0, 22, 52) })],
  ['Earth', () => ({ target: earthMesh.position.clone(), offset: new THREE.Vector3(0, 6e-5, 2e-4), followObj: earthMesh })],
  ['Oort Cloud', () => ({ target: new THREE.Vector3(), offset: new THREE.Vector3(0, 9e4, 1.7e5) })],
  ['α Centauri', () => ({ target: alphaCenPos, offset: new THREE.Vector3(0, 22, 52) })],
  ['Neighborhood', () => ({ target: new THREE.Vector3(), offset: new THREE.Vector3(0, 6e5, 1.15e6) })],
  ['150 ly', () => ({ target: new THREE.Vector3(), offset: new THREE.Vector3(0, 1.05e7, 1.95e7) })],
]
for (const [text, getView] of views) {
  const btn = document.createElement('button')
  btn.textContent = text
  btn.addEventListener('click', () => flyTo(getView()))
  gotoEl.appendChild(btn)
}

// ---------------------------------------------------------------------------
// Zoom bar (right edge): logarithmic slider for distance-to-target,
// so each pixel of travel covers the same zoom factor
// ---------------------------------------------------------------------------

const ZOOM_MIN = controls.minDistance
const ZOOM_MAX = controls.maxDistance
const zoombar = document.createElement('div')
zoombar.className = 'zoombar'
zoombar.innerHTML = `
  <button id="zoom-in" title="Zoom in">+</button>
  <div class="zoombar-track" id="zoom-track"><div class="zoombar-thumb" id="zoom-thumb"></div></div>
  <button id="zoom-out" title="Zoom out">&minus;</button>
`
app.appendChild(zoombar)
const zoomTrack = zoombar.querySelector<HTMLDivElement>('#zoom-track')!
const zoomThumb = zoombar.querySelector<HTMLDivElement>('#zoom-thumb')!

const currentZoomDistance = () => camera.position.distanceTo(controls.target)

function setZoomDistance(d: number) {
  flight = null // manual zoom cancels any fly-to in progress
  const dist = THREE.MathUtils.clamp(d, ZOOM_MIN, ZOOM_MAX)
  tmp.copy(camera.position).sub(controls.target)
  if (tmp.lengthSq() === 0) tmp.set(0, 0, 1)
  camera.position.copy(controls.target).addScaledVector(tmp.normalize(), dist)
}

let zoomDragging = false
function zoomFromPointer(e: PointerEvent) {
  const rect = zoomTrack.getBoundingClientRect()
  const t = THREE.MathUtils.clamp((e.clientY - rect.top) / rect.height, 0, 1)
  setZoomDistance(Math.exp(THREE.MathUtils.lerp(Math.log(ZOOM_MIN), Math.log(ZOOM_MAX), t)))
}
zoomTrack.addEventListener('pointerdown', (e) => {
  zoomDragging = true
  zoomTrack.setPointerCapture(e.pointerId)
  zoomFromPointer(e)
})
zoomTrack.addEventListener('pointermove', (e) => {
  if (zoomDragging) zoomFromPointer(e)
})
zoomTrack.addEventListener('pointerup', () => {
  zoomDragging = false
})
zoombar.querySelector('#zoom-in')!.addEventListener('click', () => setZoomDistance(currentZoomDistance() * 0.5))
zoombar.querySelector('#zoom-out')!.addEventListener('click', () => setZoomDistance(currentZoomDistance() * 2))

// Scale reference ticks along the track (log scale)
const ZOOM_TICKS: [number, string][] = [
  [1e-3, '0.001 AU'],
  [1, '1 AU'],
  [100, '100 AU'],
  [1e4, '10k AU'],
  [AU_PER_LY, '1 ly'],
  [10 * AU_PER_LY, '10 ly'],
  [50 * AU_PER_LY, '50 ly'],
  [150 * AU_PER_LY, '150 ly'],
]
for (const [d, text] of ZOOM_TICKS) {
  const t = (Math.log(d) - Math.log(ZOOM_MIN)) / (Math.log(ZOOM_MAX) - Math.log(ZOOM_MIN))
  const tick = document.createElement('div')
  tick.className = 'zoombar-tick'
  tick.style.top = `${t * 100}%`
  tick.textContent = text
  zoomTrack.appendChild(tick)
}

// ---------------------------------------------------------------------------
// Relativistic space travel: a constant 1.5 g brachistochrone from low Earth
// orbit (10,000 km up) to any measured star — accelerate to the midpoint,
// flip, decelerate. Working in units of light-years and years (c = 1), with
// proper acceleration a:
//   x(t) = (sqrt(1 + (a t)^2) - 1) / a      coordinate distance
//   v(t) = a t / sqrt(1 + (a t)^2)          coordinate velocity (fraction of c)
//   tau(t) = asinh(a t) / a                 proper (ship) time
// ---------------------------------------------------------------------------

const G_LY_PER_YR2 = 1.0323 // 1 g expressed in ly/yr^2
const SHIP_ACCEL = 1.5 * G_LY_PER_YR2
const PAD_ALTITUDE = (6371 + 10000) / KM_PER_AU // 10,000 km above Earth's surface
const Y_UP = new THREE.Vector3(0, 1, 0)
const COUNTDOWN_S = 3

// Local model extents for travel camera (Y-up, nose +Y). Keep in sync with createDetailedRocket().
const SHIP_LOCAL_NOSE = 3.28
const SHIP_LOCAL_AFT = -2.15
const SHIP_LOCAL_RADIUS = 0.52
const SHIP_LOCAL_LENGTH = SHIP_LOCAL_NOSE - SHIP_LOCAL_AFT

// ---------------------------------------------------------------------------
// High-detail Interstellar Spacecraft Model (Starship-adjacent)
// ---------------------------------------------------------------------------

/** Cosine/tangent-ogive style profile: tip at y=height (r≈0), base at y=0 (r=radius). */
function buildOgiveProfile(radius: number, height: number, steps = 20): THREE.Vector2[] {
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps // 0 = tip, 1 = base
    const y = height * (1 - t)
    // Blend sine ogive (blunt mid) with slight linear for a Starship-like taper
    const r = radius * (0.12 * t + 0.88 * Math.sin((Math.PI / 2) * t))
    pts.push(new THREE.Vector2(Math.max(0.002, r), y))
  }
  return pts
}

/** Vacuum Raptor-style bell: narrow throat near attach (top), flared exit (bottom). */
function buildRaptorBellGeometry(segments = 24): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.055, 0.58), // attach lip
    new THREE.Vector2(0.048, 0.52), // throat
    new THREE.Vector2(0.052, 0.46),
    new THREE.Vector2(0.072, 0.38),
    new THREE.Vector2(0.10, 0.28),
    new THREE.Vector2(0.135, 0.18),
    new THREE.Vector2(0.165, 0.09),
    new THREE.Vector2(0.185, 0.02),
    new THREE.Vector2(0.192, 0.0), // exit plane
  ]
  return new THREE.LatheGeometry(pts, segments)
}

function createDetailedRocket() {
  const ship = new THREE.Group()

  // Materials — stainless PBR hull, rough dark heatshield, readable glass
  const hullMat = new THREE.MeshPhysicalMaterial({
    color: 0xe7edf4,
    metalness: 0.96,
    roughness: 0.18,
    clearcoat: 0.35,
    clearcoatRoughness: 0.25,
  })
  const hullMatDark = new THREE.MeshPhysicalMaterial({
    color: 0xc5ccd6,
    metalness: 0.94,
    roughness: 0.28,
    clearcoat: 0.2,
    clearcoatRoughness: 0.35,
  })
  const tileMat = new THREE.MeshStandardMaterial({
    color: 0x14171c,
    metalness: 0.18,
    roughness: 0.92,
  })
  const tileMatSoft = new THREE.MeshStandardMaterial({
    color: 0x22262e,
    metalness: 0.22,
    roughness: 0.82,
  })
  const seamMat = new THREE.MeshStandardMaterial({
    color: 0x8b949e,
    metalness: 0.9,
    roughness: 0.4,
  })
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x041018,
    emissive: 0x00e5c0,
    emissiveIntensity: 1.35,
    metalness: 0.15,
    roughness: 0.08,
    transmission: 0.55,
    thickness: 0.2,
    transparent: true,
    opacity: 0.88,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  })
  const glassRimMat = new THREE.MeshStandardMaterial({
    color: 0x00f5d4,
    emissive: 0x00f5d4,
    emissiveIntensity: 2.8,
    metalness: 0.7,
    roughness: 0.25,
  })
  const engineMat = new THREE.MeshPhysicalMaterial({
    color: 0x2a3038,
    metalness: 0.94,
    roughness: 0.26,
    clearcoat: 0.2,
  })
  const engineThroatMat = new THREE.MeshStandardMaterial({
    color: 0x1a1e24,
    metalness: 0.85,
    roughness: 0.45,
    emissive: 0x331100,
    emissiveIntensity: 0.15,
  })

  const SEG = 24 // keep polycount modest

  // --- Stacked cylindrical body (aft → nose), Starship-adjacent silhouette ---
  type Barrel = { y: number; h: number; rTop: number; rBot: number; mat: THREE.Material }
  const barrels: Barrel[] = [
    { y: -1.35, h: 0.55, rTop: 0.52, rBot: 0.54, mat: hullMatDark }, // aft skirt / thrust structure
    { y: -0.45, h: 1.25, rTop: 0.50, rBot: 0.52, mat: hullMat },     // lower tank
    { y: 0.45, h: 0.55, rTop: 0.485, rBot: 0.50, mat: hullMatDark }, // intertank
    { y: 1.25, h: 1.05, rTop: 0.48, rBot: 0.485, mat: hullMat },     // upper tank
  ]
  for (const b of barrels) {
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(b.rTop, b.rBot, b.h, SEG),
      b.mat,
    )
    barrel.position.y = b.y
    ship.add(barrel)

    // Darker heatshield belly (windward half-cylinder, slightly proud)
    const rAvg = (b.rTop + b.rBot) * 0.5 + 0.012
    const shield = new THREE.Mesh(
      new THREE.CylinderGeometry(rAvg, rAvg, b.h * 0.98, SEG, 1, false, -Math.PI / 2, Math.PI),
      tileMat,
    )
    shield.position.y = b.y
    ship.add(shield)
  }

  // Tile banding on windward half
  for (const y of [-1.2, -0.7, -0.2, 0.35, 0.9, 1.45]) {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.535, 0.535, 0.016, SEG, 1, false, -Math.PI / 2, Math.PI),
      tileMatSoft,
    )
    band.position.y = y
    ship.add(band)
  }

  // Circumferential panel seams (thin torus rings)
  for (const y of [-1.55, -1.05, -0.45, 0.15, 0.75, 1.35, 1.75]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.505, 0.006, 5, 36), seamMat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = y
    ship.add(ring)
  }

  // Longitudinal panel lines (leeward stainless)
  for (let i = 0; i < 4; i++) {
    const a = -0.7 + i * 0.45
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.009, 3.15, 0.009), seamMat)
    line.position.set(Math.sin(a) * 0.498, 0.15, Math.cos(a) * 0.498)
    ship.add(line)
  }

  // Fairing / ogive nose
  const noseH = 1.4
  const noseR = 0.48
  const noseY = 1.78
  const nose = new THREE.Mesh(new THREE.LatheGeometry(buildOgiveProfile(noseR, noseH, 18), SEG), hullMat)
  nose.position.y = noseY
  ship.add(nose)
  const noseShield = new THREE.Mesh(
    new THREE.LatheGeometry(buildOgiveProfile(noseR + 0.01, noseH, 18), SEG, -Math.PI / 2, Math.PI),
    tileMat,
  )
  noseShield.position.y = noseY
  ship.add(noseShield)

  // Readable cockpit window + emissive rim (chase-cam readable)
  const windowGeo = new THREE.CylinderGeometry(0.49, 0.49, 0.38, SEG, 1, false, Math.PI * 0.28, Math.PI * 0.44)
  const cockpitWindow = new THREE.Mesh(windowGeo, glassMat)
  cockpitWindow.position.y = 2.0
  ship.add(cockpitWindow)
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.012, 6, 24),
    glassRimMat,
  )
  rim.position.set(0, 2.0, 0.42)
  rim.rotation.y = Math.PI / 2
  rim.scale.set(1, 1.15, 0.55)
  ship.add(rim)

  // Mid-body secondary ports
  const hullWinGeo = new THREE.CircleGeometry(0.07, 12)
  for (const [sx, sy] of [[0.505, 0.95], [-0.505, 0.95], [0.505, 0.55], [-0.505, 0.55]] as const) {
    const w = new THREE.Mesh(hullWinGeo, glassMat)
    w.position.set(sx, sy, 0.12)
    w.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2
    ship.add(w)
  }

  const cockpitGlow = new THREE.PointLight(0x00f5d4, 0.65, 5, 2)
  cockpitGlow.position.set(0, 2.0, 0.55)
  ship.add(cockpitGlow)

  // Forward body flaps (Starship-adjacent, not toy canards)
  const flapGeo = new THREE.BoxGeometry(0.05, 0.55, 0.72)
  const flapL = new THREE.Mesh(flapGeo, tileMat)
  flapL.position.set(0.55, 1.55, 0)
  flapL.rotation.z = -0.28
  const flapR = new THREE.Mesh(flapGeo, tileMat)
  flapR.position.set(-0.55, 1.55, 0)
  flapR.rotation.z = 0.28
  ship.add(flapL, flapR)

  // Aft elon-style fins
  const finShape = new THREE.Shape()
  finShape.moveTo(0, 0)
  finShape.lineTo(0.78, -0.45)
  finShape.lineTo(0.58, -1.25)
  finShape.lineTo(0, -1.0)
  finShape.closePath()
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.045, bevelEnabled: false })
  finGeo.center()
  const leftFin = new THREE.Mesh(finGeo, tileMat)
  leftFin.position.set(0.58, -0.85, 0)
  leftFin.rotation.y = Math.PI / 2
  const rightFin = new THREE.Mesh(finGeo, tileMat)
  rightFin.position.set(-0.58, -0.85, 0)
  rightFin.rotation.y = -Math.PI / 2
  ship.add(leftFin, rightFin)

  // Nav lights
  const portNav = createMarker(0xff3333, 4.5)
  portNav.position.set(1.05, -1.35, 0)
  const stbdNav = createMarker(0x33ff66, 4.5)
  stbdNav.position.set(-1.05, -1.35, 0)
  const beacon = createMarker(0xffffff, 5)
  beacon.position.set(0, noseY + noseH + 0.02, 0.06)
  ship.add(portNav, stbdNav, beacon)

  // Engine cluster: center + hex ring (7 vacuum bells)
  const bellGeo = buildRaptorBellGeometry(18)
  bellGeo.translate(0, -0.58, 0)
  const bellY = -1.72
  const bells: THREE.Vector3[] = [new THREE.Vector3(0, bellY, 0)]
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6
    bells.push(new THREE.Vector3(Math.cos(a) * 0.22, bellY, Math.sin(a) * 0.22))
  }
  for (const pos of bells) {
    const bell = new THREE.Mesh(bellGeo, engineMat)
    bell.position.copy(pos)
    ship.add(bell)
    const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.08, 10), engineThroatMat)
    throat.position.set(pos.x, bellY + 0.52, pos.z)
    ship.add(throat)
  }

  // Exhaust plume (shared, centered under cluster)
  const plumeGroup = new THREE.Group()
  plumeGroup.position.y = -2.05

  const coreGeo = new THREE.ConeGeometry(0.32, 2.6, 14)
  coreGeo.rotateX(Math.PI)
  coreGeo.translate(0, -1.3, 0)
  const plumeCore = new THREE.Mesh(
    coreGeo,
    new THREE.MeshBasicMaterial({ color: 0xb8f0ff, transparent: true, opacity: 0.92 }),
  )
  plumeGroup.add(plumeCore)

  const outerPlumeGeo = new THREE.ConeGeometry(0.72, 4.0, 14)
  outerPlumeGeo.rotateX(Math.PI)
  outerPlumeGeo.translate(0, -2.0, 0)
  const plumeOuter = new THREE.Mesh(
    outerPlumeGeo,
    new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.4 }),
  )
  plumeGroup.add(plumeOuter)

  const diamondMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })
  const diamonds: THREE.Mesh[] = []
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.18 - i * 0.028, 14), diamondMat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = -0.45 - i * 0.62
    plumeGroup.add(ring)
    diamonds.push(ring)
  }

  const plumeLight = new THREE.PointLight(0x7dd3fc, 3.2, 0.08)
  plumeLight.position.y = -2.0
  plumeGroup.add(plumeLight)

  plumeGroup.visible = false
  ship.add(plumeGroup)

  // Ignition ramp (0 = engines cold, 1 = full burn). Used by the pre-launch countdown;
  // the travel loop multiplies its plume pulse by this level. Default 1 keeps old behaviour.
  const coreMat = plumeCore.material as THREE.MeshBasicMaterial
  const outerMat = plumeOuter.material as THREE.MeshBasicMaterial
  let ignitionLevel = 1
  const setIgnition = (t: number) => {
    const k = THREE.MathUtils.clamp(t, 0, 1)
    ignitionLevel = k
    const e = k * k * (3 - 2 * k) // smoothstep
    plumeGroup.visible = k > 0.001
    coreMat.opacity = 0.92 * e
    outerMat.opacity = 0.4 * e
    diamondMat.opacity = 0.8 * e * e
    plumeCore.scale.set(0.55 + 0.45 * e, 0.25 + 0.75 * e, 0.55 + 0.45 * e)
    plumeOuter.scale.set(0.5 + 0.5 * e, 0.2 + 0.8 * e, 0.5 + 0.5 * e)
    plumeLight.intensity = 3.2 * e
  }
  const getIgnition = () => ignitionLevel
  ;(ship as THREE.Group & { setIgnition?: (t: number) => void }).setIgnition = setIgnition

  const shipKeyLight = new THREE.DirectionalLight(0xffffff, 1.35)
  shipKeyLight.position.set(4, 8, 6)
  ship.add(shipKeyLight)

  // Warp dust tunnel
  const WARP_COUNT = 240
  const warpGeo = new THREE.BufferGeometry()
  const warpPositions = new Float32Array(WARP_COUNT * 3)
  for (let i = 0; i < WARP_COUNT; i++) {
    warpPositions[i * 3] = (Math.random() - 0.5) * 16
    warpPositions[i * 3 + 1] = (Math.random() - 0.5) * 32
    warpPositions[i * 3 + 2] = (Math.random() - 0.5) * 16
  }
  warpGeo.setAttribute('position', new THREE.BufferAttribute(warpPositions, 3))
  const warpMat = new THREE.PointsMaterial({
    color: 0x93c5fd,
    size: 2.2,
    transparent: true,
    opacity: 0.0,
    sizeAttenuation: false,
    map: starTexture,
  })
  const warpParticles = new THREE.Points(warpGeo, warpMat)
  ship.add(warpParticles)

  return {
    ship,
    plumeGroup,
    plumeCore,
    plumeOuter,
    diamonds,
    plumeLight,
    warpParticles,
    warpMat,
    warpPositions,
    setIgnition,
    getIgnition,
  }
}

const rocketSystems = createDetailedRocket()
const shipGroup = rocketSystems.ship
const shipDot = createMarker(0x5eead4, 5)
shipGroup.add(shipDot)
shipGroup.visible = false
scene.add(shipGroup)

interface Travel {
  name: string
  dest: THREE.Vector3 // AU, target star (fixed)
  origin: THREE.Vector3 // AU, launch pad; rides with Earth until ignition
  dir: THREE.Vector3
  D: number // total distance, ly
  tHalf: number // Earth time to midpoint, yr
  tauHalf: number // ship time to midpoint, yr
  T: number // total Earth time, yr
  Tship: number // total ship time, yr
  t0: number // simYears at ignition
  countdownEnd: number | null // performance.now() ms; null once engines fire
  arrived: boolean
}
let travel: Travel | null = null

let travelCameraMode: 'chase' | 'cockpit' | 'orbit' | 'cinematic' = 'chase'
let warpFactor = 1.0
const travelShipHeading = new THREE.Vector3(0, 1, 0)

const travelPanel = document.createElement('div')
travelPanel.className = 'travel-panel'
travelPanel.hidden = true
travelPanel.innerHTML = `
  <h3 id="tp-title"></h3>
  <div class="tp-rows" id="tp-rows">
    <div><span>Phase</span><b id="tp-phase"></b></div>
    <div><span>Speed</span><b id="tp-speed"></b></div>
    <div><span>Lorentz γ</span><b id="tp-gamma"></b></div>
    <div><span>Traveled</span><b id="tp-done"></b></div>
    <div><span>Remaining</span><b id="tp-left"></b></div>
    <div><span>Ship time</span><b id="tp-ship"></b></div>
    <div><span>Earth time</span><b id="tp-earth"></b></div>
  </div>
  <div class="tp-control-group" id="tp-cam-group">
    <span class="tp-control-label">Camera Angle</span>
    <div class="tp-btn-row" id="tp-cam-btns">
      <button class="active" data-mode="chase">🎥 Chase</button>
      <button data-mode="cockpit">🚀 Cockpit</button>
      <button data-mode="orbit">🛰️ Free Orbit</button>
      <button data-mode="cinematic">🎬 Cinematic</button>
    </div>
  </div>
  <div class="tp-control-group" id="tp-warp-group">
    <span class="tp-control-label">Flight Pacing</span>
    <div class="tp-btn-row" id="tp-warp-btns">
      <button data-warp="0.2">0.2x Cinematic</button>
      <button class="active" data-warp="1">1x Cruise</button>
      <button data-warp="4">4x Fast</button>
      <button data-warp="20">20x Max Warp</button>
    </div>
  </div>
  <div class="tp-actions">
    <button id="tp-start">🚀 Depart from Earth — 1.5 g</button>
    <button id="tp-exit">Exit journey</button>
  </div>
`
app.appendChild(travelPanel)

// Big mid-screen countdown shown between "Depart" and ignition
const countdownEl = document.createElement('div')
countdownEl.className = 'cd-overlay'
countdownEl.hidden = true
countdownEl.innerHTML = '<div class="cd-num" id="cd-num"></div><div class="cd-sub">Ignition · Esc to cancel</div>'
app.appendChild(countdownEl)
const cdNum = countdownEl.querySelector<HTMLDivElement>('#cd-num')!
let cdShownDigit = -1

const tpTitle = travelPanel.querySelector('#tp-title')!
const tpRows = travelPanel.querySelector<HTMLDivElement>('#tp-rows')!
const tpStart = travelPanel.querySelector<HTMLButtonElement>('#tp-start')!
const tpExit = travelPanel.querySelector<HTMLButtonElement>('#tp-exit')!
const tpPhase = travelPanel.querySelector('#tp-phase')!
const tpSpeed = travelPanel.querySelector('#tp-speed')!
const tpGamma = travelPanel.querySelector('#tp-gamma')!
const tpDone = travelPanel.querySelector('#tp-done')!
const tpLeft = travelPanel.querySelector('#tp-left')!
const tpShip = travelPanel.querySelector('#tp-ship')!
const tpEarth = travelPanel.querySelector('#tp-earth')!
const tpCamGroup = travelPanel.querySelector<HTMLDivElement>('#tp-cam-group')!
const tpWarpGroup = travelPanel.querySelector<HTMLDivElement>('#tp-warp-group')!

/** Lock OrbitControls during scripted travel cams; Free Orbit re-enables them. */
function applyTravelCameraMode(mode: 'chase' | 'cockpit' | 'orbit' | 'cinematic') {
  travelCameraMode = mode
  const free = mode === 'orbit'
  controls.enabled = free
  // If entering Free Orbit from a locked cam that sat on/near the nose, kick outside.
  if (free && travel) {
    const s = Math.max(shipGroup.scale.x, 1e-9)
    const clearance = Math.max(SHIP_LOCAL_RADIUS * s * 4, SHIP_LOCAL_LENGTH * s * 0.4, camera.near * 8)
    const d = camera.position.distanceTo(shipGroup.position)
    if (d < clearance) {
      const out = camera.position.clone().sub(shipGroup.position)
      if (out.lengthSq() < 1e-16) out.copy(travelShipHeading).multiplyScalar(-1)
      camera.position.copy(shipGroup.position).addScaledVector(out.normalize(), Math.max(clearance, SHIP_LOCAL_LENGTH * s * 2.2))
      controls.target.copy(shipGroup.position)
    }
  }
}

// Wire Camera View Switcher
travelPanel.querySelectorAll<HTMLButtonElement>('#tp-cam-btns button').forEach((btn) => {
  btn.addEventListener('click', () => {
    travelPanel.querySelectorAll('#tp-cam-btns button').forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
    applyTravelCameraMode((btn.dataset.mode as typeof travelCameraMode) || 'chase')
  })
})

// Wire Warp / Pacing Switcher
travelPanel.querySelectorAll<HTMLButtonElement>('#tp-warp-btns button').forEach((btn) => {
  btn.addEventListener('click', () => {
    travelPanel.querySelectorAll('#tp-warp-btns button').forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
    warpFactor = parseFloat(btn.dataset.warp || '1.0')
  })
})

function refreshTravelPanel() {
  if (travel) {
    travelPanel.hidden = false
    tpRows.hidden = false
    if (tpCamGroup) tpCamGroup.hidden = false
    if (tpWarpGroup) tpWarpGroup.hidden = false
    tpStart.hidden = true
    tpExit.hidden = false
    tpTitle.textContent = travel.arrived
      ? `Arrived at ${travel.name}`
      : `En route to ${travel.name} · ${travel.D.toFixed(2)} ly`
  } else if (measuredName && measuredPos) {
    travelPanel.hidden = false
    tpRows.hidden = true
    if (tpCamGroup) tpCamGroup.hidden = true
    if (tpWarpGroup) tpWarpGroup.hidden = true
    tpStart.hidden = false
    tpExit.hidden = true
    tpTitle.textContent = `${measuredName} · ${(measuredPos.length() / AU_PER_LY).toFixed(2)} ly`
  } else {
    travelPanel.hidden = true
  }
}

function startTravel() {
  if (!measuredName || !measuredPos || travel) return
  const dest = measuredPos.clone()
  // Departure pad: 10,000 km above Earth's surface, on the side facing the star
  const earthPos = earthMesh.position.clone()
  const dir = dest.clone().sub(earthPos).normalize()
  const origin = earthPos.addScaledVector(dir, PAD_ALTITUDE)
  const D = dest.distanceTo(origin) / AU_PER_LY
  const d = D / 2
  const tHalf = Math.sqrt((1 + SHIP_ACCEL * d) ** 2 - 1) / SHIP_ACCEL
  const tauHalf = Math.acosh(1 + SHIP_ACCEL * d) / SHIP_ACCEL
  travel = {
    name: measuredName, dest, origin, dir, D,
    tHalf, tauHalf, T: 2 * tHalf, Tship: 2 * tauHalf,
    t0: simYears, countdownEnd: performance.now() + COUNTDOWN_S * 1000, arrived: false,
  }
  shipGroup.position.copy(origin)
  travelShipHeading.copy(dir)
  shipGroup.quaternion.setFromUnitVectors(Y_UP, travelShipHeading)
  shipGroup.visible = true
  rocketSystems.setIgnition(0) // engines cold; the countdown ramps them to full
  resetLook()
  cdShownDigit = -1

  // Set default camera mode and pacing
  travelPanel.querySelectorAll('#tp-cam-btns button').forEach((b) => {
    b.classList.toggle('active', (b as HTMLElement).dataset.mode === 'chase')
  })
  applyTravelCameraMode('chase')
  warpFactor = 1.0

  // Start with gentle pacing (1 d/s) during launch countdown so Earth stays in clear view
  setSpeed(1.0)

  // Chase exterior at pad: scale ship tiny next to Earth, park camera clearly aft/above
  const up = new THREE.Vector3(0, 1, 0)
  const padScale = 2.5e-5
  shipGroup.scale.setScalar(padScale)
  const padLen = SHIP_LOCAL_LENGTH * padScale
  const initialCamOffset = dir.clone().multiplyScalar(-(padLen * 2.3))
    .addScaledVector(up, padLen * 0.6)
  flight = null
  followObj = shipGroup
  controls.minDistance = Math.max(ZOOM_MIN, padLen * 0.5)
  controls.target.copy(origin)
  camera.position.copy(origin).add(initialCamOffset)
  refreshTravelPanel()
}

/**
 * Leave the journey and hand the camera back to free OrbitControls.
 *  - 'user'   : Esc / Exit button mid-flight -> ease out to a sensible free-orbit view
 *  - 'cancel' : Esc during countdown -> back to pre-launch (target kept, Depart shown), follow Earth
 *  - 'switch' : internal, a new journey starts right away (no camera move)
 */
function exitTravel(mode: 'user' | 'cancel' | 'switch' = 'user') {
  const t = travel
  travel = null
  rocketSystems.setIgnition(0)
  shipGroup.visible = false
  rocketSystems.plumeGroup.visible = false
  rocketSystems.warpMat.opacity = 0.0
  countdownEl.hidden = true
  cdShownDigit = -1
  endLookDrag()
  resetLook()
  // Reset the travel UI to its defaults so the next journey starts clean
  travelCameraMode = 'chase'
  travelPanel.querySelectorAll<HTMLElement>('#tp-cam-btns button').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === 'chase')
  })
  if (followObj === shipGroup) followObj = null
  flight = null
  controls.minDistance = ZOOM_MIN
  controls.enabled = true
  setSpeed(1)
  if (t && mode === 'cancel') {
    // Pre-launch state: look at Earth from where we are and keep following it
    controls.target.copy(earthMesh.position)
    followObj = earthMesh
  } else if (t && mode === 'user') {
    const shipPos = shipGroup.position.clone()
    const away = camera.position.clone().sub(shipPos)
    if (away.lengthSq() < 1e-20) away.copy(travelShipHeading).multiplyScalar(-1).add(tmp.set(0, 0.4, 0))
    away.normalize()
    if (t.arrived) {
      // Arrived: orbit the destination star at a system-scale view
      flyTo({ target: t.dest, offset: away.multiplyScalar(60) })
    } else {
      // Mid-flight: stop where the ship is and pull back so the surroundings are readable
      const traveled = shipPos.distanceTo(t.origin)
      controls.target.copy(shipPos)
      flyTo({ target: shipPos, offset: away.multiplyScalar(THREE.MathUtils.clamp(traveled * 0.3, 60, 3e5)) })
    }
  }
  refreshTravelPanel()
}

/** Esc during the countdown: abort before ignition, back to the pre-launch state. */
function cancelCountdown() {
  if (!travel || travel.countdownEnd === null) return
  exitTravel('cancel')
}

/** Pick a star from the fly-to list: select it and run the normal travel flow (countdown). */
function travelToTarget(name: string, pos: THREE.Vector3, el?: HTMLElement) {
  if (travel) {
    if (travel.countdownEnd !== null && travel.name === name) return // already counting down
    exitTravel('switch')
  }
  setMeasure(name, pos, el)
  startTravel()
}

tpStart.addEventListener('click', startTravel)
tpExit.addEventListener('click', () => exitTravel('user'))

const fmtYears = (y: number) => (y < 1 ? `${(y * 365.25).toFixed(1)} days` : `${y.toFixed(2)} years`)
const fmtLy = (ly: number) =>
  ly < 0.01 ? `${Math.round(ly * AU_PER_LY).toLocaleString('en-US')} AU` : `${ly.toFixed(3)} ly`

function formatDistance(au: number): string {
  if (au < 10000) return `${au.toFixed(au < 10 ? 2 : 0)} AU`
  const ly = au / AU_PER_LY
  if (ly < 0.1) return `${Math.round(au).toLocaleString('en-US')} AU`
  return `${Math.round(au).toLocaleString('en-US')} AU (${ly.toFixed(2)} ly)`
}

// ---------------------------------------------------------------------------
// Round 2 UI: look-around drag (chase / cockpit), Esc handling, fly-to list,
// star-class legend and decluttered star labels. Styles are injected here so the
// feature stays self-contained in main.ts.
// ---------------------------------------------------------------------------

const r2Style = document.createElement('style')
r2Style.textContent = `
.glass {
  background: rgba(20, 22, 28, 0.42);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  backdrop-filter: blur(20px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 14px;
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.88);
  font-family: Inter, system-ui, -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif;
  font-weight: 300;
  letter-spacing: 0.005em;
}
.glass button { font-family: inherit; }
.r2-head {
  all: unset; box-sizing: border-box; width: 100%; cursor: pointer;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 9px 12px; font-size: 11px; font-weight: 500; letter-spacing: 0.08em;
  text-transform: uppercase; color: rgba(255, 255, 255, 0.72);
}
.r2-head:hover { color: #fff; }
.r2-chev { transition: transform 0.2s ease; font-size: 10px; opacity: 0.7; }
.r2-collapsed .r2-chev { transform: rotate(-90deg); }
.r2-collapsed .r2-body { display: none; }

/* Legend (bottom right, left of the zoom bar ticks) */
.legend { position: absolute; right: 128px; bottom: 20px; width: 200px; }
.legend .r2-body { padding: 0 12px 10px; }
.lg-row { display: flex; align-items: center; gap: 9px; font-size: 12px; line-height: 21px; }
.lg-row i { width: 8px; height: 8px; border-radius: 50%; flex: none; box-shadow: 0 0 6px currentColor; }
.lg-row span { flex: 1; color: rgba(255, 255, 255, 0.82); white-space: nowrap; }
.lg-row b { font-weight: 300; color: rgba(255, 255, 255, 0.5); font-variant-numeric: tabular-nums; font-size: 11px; }

/* Fly-to list (top right, left of the zoom bar ticks) */
.flyto { position: absolute; right: 128px; top: 20px; width: 236px; }
.flyto .r2-body { padding: 0 8px 8px; }
.flyto input {
  box-sizing: border-box; width: 100%; margin: 0 0 6px; padding: 7px 10px;
  background: rgba(255, 255, 255, 0.07); border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9px; color: #fff; font: 300 12px Inter, system-ui, sans-serif; outline: none;
}
.flyto input:focus { border-color: rgba(255, 255, 255, 0.3); }
.flyto input::placeholder { color: rgba(255, 255, 255, 0.4); }
.fl-list { max-height: min(46vh, 380px); overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.2) transparent; }
.fl-sec { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255, 255, 255, 0.4); padding: 6px 6px 3px; }
.fl-item {
  all: unset; box-sizing: border-box; width: 100%; display: flex; justify-content: space-between; gap: 8px;
  padding: 4px 6px; border-radius: 7px; font-size: 12px; cursor: pointer; color: rgba(255, 255, 255, 0.84);
}
.fl-item:hover, .fl-item:focus-visible { background: rgba(255, 255, 255, 0.09); color: #fff; }
.fl-item b { font-weight: 300; color: rgba(255, 255, 255, 0.45); font-variant-numeric: tabular-nums; font-size: 11px; }
.fl-item.t0 span { font-weight: 400; }
.fl-empty { font-size: 12px; color: rgba(255, 255, 255, 0.4); padding: 6px; }
.fl-item[hidden], .fl-sec[hidden], .fl-empty[hidden] { display: none; }

/* Countdown overlay */
.tp-control-group[hidden], .tp-rows[hidden] { display: none; }
.cd-overlay {
  position: absolute; left: 0; right: 0; top: 0; height: 68%; display: flex; flex-direction: column; align-items: center; justify-content: center;
  pointer-events: none; font-family: Inter, system-ui, -apple-system, sans-serif;
}
.cd-overlay[hidden] { display: none; }
.cd-num {
  font-size: 150px; font-weight: 200; line-height: 1; color: rgba(255, 255, 255, 0.94);
  font-variant-numeric: tabular-nums; text-shadow: 0 0 40px rgba(0, 0, 0, 0.6), 0 0 22px rgba(94, 234, 212, 0.18);
  will-change: transform, opacity;
}
.cd-sub { margin-top: 18px; font-size: 11px; font-weight: 400; letter-spacing: 0.3em; text-transform: uppercase; color: rgba(255, 255, 255, 0.6); text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9); }

/* Star labels: small, quiet; tier 0 slightly brighter */
.label-star { font-size: 10.5px; color: rgba(232, 236, 244, 0.72); font-weight: 400; letter-spacing: 0.01em; transition: opacity 0.25s linear; }
.label-star.t0 { font-size: 11.5px; color: rgba(255, 255, 255, 0.92); }
.label-star.t2, .label-star.t3 { color: rgba(220, 226, 236, 0.62); }
.look-dragging { cursor: grabbing !important; }
`
document.head.appendChild(r2Style)

// ---- Look-around (chase / cockpit): drag adjusts yaw/pitch relative to the ship frame ----
const CHASE_MIN_DIST_LOCAL = 3 // ship units from the ship origin, never closer
const CHASE_PITCH_LIMIT = THREE.MathUtils.degToRad(78) // total elevation clamp (no flipping)
const COCKPIT_YAW_LIMIT = THREE.MathUtils.degToRad(100)
const COCKPIT_PITCH_LIMIT = THREE.MathUtils.degToRad(60)
// Cockpit eye placement (ship units): aft extent incl. plume tip (plume group at -2.05,
// outer cone 4.0 long, pulse up to ~1.12x) and lateral extent incl. fins/flaps (~1.36).
const COCKPIT_PLUME_EXTENT_LOCAL = 6.8
const COCKPIT_LATERAL_EXTENT_LOCAL = 1.6
const LOOK_SENS = 0.005 // rad per px
const LOOK_RETURN_DELAY = 1.2 // s after release before easing back
const LOOK_RETURN_RATE = 0.9 // 1/s exponential ease back to default
let lookYaw = 0
let lookPitch = 0
let lookDragId: number | null = null
let lookLastX = 0
let lookLastY = 0
let lookReleasedAt = 0
const chaseRel = new THREE.Vector3() // smoothed unit dir ship -> camera (chase); zero = snap

function resetLook() {
  lookYaw = 0
  lookPitch = 0
  chaseRel.set(0, 0, 0)
}

const lookActive = () =>
  !!travel && (travelCameraMode === 'chase' || travelCameraMode === 'cockpit') && !controls.enabled

function clampLook() {
  if (travelCameraMode === 'cockpit') {
    lookYaw = THREE.MathUtils.clamp(lookYaw, -COCKPIT_YAW_LIMIT, COCKPIT_YAW_LIMIT)
    lookPitch = THREE.MathUtils.clamp(lookPitch, -COCKPIT_PITCH_LIMIT, COCKPIT_PITCH_LIMIT)
  } else {
    // wrap yaw into (-PI, PI] so the ease-back takes the short way round
    lookYaw = Math.atan2(Math.sin(lookYaw), Math.cos(lookYaw))
    const base = Math.atan2(SHIP_LOCAL_LENGTH * 0.55, SHIP_LOCAL_LENGTH * 2.2 + SHIP_LOCAL_RADIUS)
    lookPitch = THREE.MathUtils.clamp(lookPitch, -CHASE_PITCH_LIMIT - base, CHASE_PITCH_LIMIT - base)
  }
}

function updateLookEase(dt: number) {
  if (lookDragId !== null) return
  if (performance.now() - lookReleasedAt < LOOK_RETURN_DELAY * 1000) return
  const k = Math.exp(-dt * LOOK_RETURN_RATE)
  lookYaw *= k
  lookPitch *= k
  if (Math.abs(lookYaw) < 1e-4) lookYaw = 0
  if (Math.abs(lookPitch) < 1e-4) lookPitch = 0
}

function endLookDrag() {
  if (lookDragId !== null) {
    try { labelRenderer.domElement.releasePointerCapture(lookDragId) } catch { /* already released */ }
    lookDragId = null
    lookReleasedAt = performance.now()
  }
  labelRenderer.domElement.classList.remove('look-dragging')
}

labelRenderer.domElement.addEventListener('pointerdown', (e) => {
  if (!lookActive() || e.button !== 0 || lookDragId !== null) return
  lookDragId = e.pointerId
  lookLastX = e.clientX
  lookLastY = e.clientY
  labelRenderer.domElement.setPointerCapture(e.pointerId)
  labelRenderer.domElement.classList.add('look-dragging')
})
labelRenderer.domElement.addEventListener('pointermove', (e) => {
  if (e.pointerId !== lookDragId) return
  if (!lookActive()) return endLookDrag()
  const dx = e.clientX - lookLastX
  const dy = e.clientY - lookLastY
  lookLastX = e.clientX
  lookLastY = e.clientY
  // "Grab the scene" convention (like OrbitControls): the view follows the pointer
  lookYaw -= dx * LOOK_SENS
  lookPitch += dy * LOOK_SENS
  clampLook()
})
labelRenderer.domElement.addEventListener('pointerup', (e) => { if (e.pointerId === lookDragId) endLookDrag() })
labelRenderer.domElement.addEventListener('pointercancel', (e) => { if (e.pointerId === lookDragId) endLookDrag() })

// ---- Legend: star classes ----
const legendEl = document.createElement('div')
legendEl.className = 'legend glass'
legendEl.hidden = true
legendEl.innerHTML = `
  <button class="r2-head" type="button"><span>Star classes</span><span class="r2-chev">▾</span></button>
  <div class="r2-body"></div>`
app.appendChild(legendEl)
legendEl.querySelector('.r2-head')!.addEventListener('click', () => legendEl.classList.toggle('r2-collapsed'))
legendEl.addEventListener('pointerdown', (e) => e.stopPropagation())

function buildLegend(rows: { label: string; count: number; color: [number, number, number] }[]) {
  const body = legendEl.querySelector('.r2-body')!
  body.innerHTML = ''
  for (const r of rows) {
    const row = document.createElement('div')
    row.className = 'lg-row'
    const sw = document.createElement('i')
    const rgb = `rgb(${r.color[0]}, ${r.color[1]}, ${r.color[2]})`
    sw.style.background = rgb
    sw.style.color = `rgba(${r.color[0]}, ${r.color[1]}, ${r.color[2]}, 0.45)`
    const name = document.createElement('span')
    name.textContent = r.label
    const cnt = document.createElement('b')
    cnt.textContent = r.count.toLocaleString('en-US')
    row.append(sw, name, cnt)
    body.appendChild(row)
  }
  legendEl.hidden = rows.length === 0
}

// ---- Fly-to list ----
const flytoEl = document.createElement('div')
flytoEl.className = 'flyto glass r2-collapsed'
flytoEl.innerHTML = `
  <button class="r2-head" type="button"><span>Fly to</span><span class="r2-chev">▾</span></button>
  <div class="r2-body">
    <input type="search" placeholder="Search stars…" spellcheck="false" autocomplete="off" />
    <div class="fl-list"></div>
  </div>`
app.appendChild(flytoEl)
const flytoInput = flytoEl.querySelector<HTMLInputElement>('input')!
const flytoList = flytoEl.querySelector<HTMLDivElement>('.fl-list')!
flytoEl.addEventListener('pointerdown', (e) => e.stopPropagation())
flytoEl.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true })
function setFlytoOpen(open: boolean) {
  flytoEl.classList.toggle('r2-collapsed', !open)
  if (open) flytoInput.focus({ preventScroll: true })
  else flytoInput.blur()
}
flytoEl.querySelector('.r2-head')!.addEventListener('click', () =>
  setFlytoOpen(flytoEl.classList.contains('r2-collapsed')))

interface FlytoItem { el: HTMLButtonElement; key: string; sec: HTMLDivElement }
const flytoItems: FlytoItem[] = []
const flytoSections: HTMLDivElement[] = []
const flytoEmpty = document.createElement('div')
flytoEmpty.className = 'fl-empty'
flytoEmpty.textContent = 'No matching star'
flytoEmpty.hidden = true

function addFlytoSection(title: string): HTMLDivElement {
  const sec = document.createElement('div')
  sec.className = 'fl-sec'
  sec.textContent = title
  flytoList.appendChild(sec)
  flytoSections.push(sec)
  return sec
}
function addFlytoItem(sec: HTMLDivElement, name: string, distLy: number, tier: number,
  getPos: () => THREE.Vector3, labelEl?: HTMLElement) {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = `fl-item t${Math.min(tier, 3)}`
  const n = document.createElement('span')
  n.textContent = name
  const d = document.createElement('b')
  d.textContent = `${distLy.toFixed(distLy < 10 ? 2 : 1)} ly`
  el.append(n, d)
  el.addEventListener('click', () => {
    setFlytoOpen(false)
    travelToTarget(name, getPos(), labelEl)
  })
  flytoList.appendChild(el)
  flytoItems.push({ el, key: name.toLowerCase(), sec })
}

function filterFlyto() {
  const q = flytoInput.value.trim().toLowerCase()
  const secCount = new Map<HTMLDivElement, number>()
  let any = 0
  for (const it of flytoItems) {
    const show = !q || it.key.includes(q)
    it.el.hidden = !show
    if (show) {
      any++
      secCount.set(it.sec, (secCount.get(it.sec) ?? 0) + 1)
    }
  }
  for (const s of flytoSections) s.hidden = !secCount.get(s)
  flytoEmpty.hidden = any > 0
}
flytoInput.addEventListener('input', filterFlyto)
flytoInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const first = flytoItems.find((it) => !it.el.hidden)
    first?.el.click()
  }
})

function buildFlytoList() {
  flytoList.innerHTML = ''
  flytoItems.length = 0
  flytoSections.length = 0
  // Pinned: the Alpha Centauri group (drawn by the group code, not part of `names`)
  const acSec = addFlytoSection('Alpha Centauri')
  const acLy = alphaCenPos.length() / AU_PER_LY
  addFlytoItem(acSec, 'Alpha Centauri', acLy, 0, () => alphaCenPos.clone(), alphaCenLabel.element)
  addFlytoItem(acSec, 'α Cen A', acLy, 0, () => starA.getWorldPosition(new THREE.Vector3()))
  addFlytoItem(acSec, 'α Cen B', acLy, 0, () => starB.getWorldPosition(new THREE.Vector3()))
  addFlytoItem(acSec, 'Proxima Centauri', alphaCenPos.clone().add(proximaLocal).length() / AU_PER_LY, 0,
    () => alphaCenPos.clone().add(proximaLocal), (proxima.children[1] as CSS2DObject).element)
  // Everything else in priority order (tier, then brightness)
  const hasTiers = namedStars.some((n) => n.tier !== 1)
  const titles = ['Brightest & best known', 'Well known', 'Named stars']
  let cur = -1
  let sec = acSec
  for (const n of namedStars) {
    const bucket = hasTiers ? Math.min(n.tier, 2) : 2
    if (bucket !== cur) {
      cur = bucket
      sec = addFlytoSection(titles[bucket])
    }
    addFlytoItem(sec, n.name, n.distLy, n.tier, () => n.pos.clone(), n.label.element)
  }
  flytoList.appendChild(flytoEmpty)
  filterFlyto()
}

// ---- Esc: cancel countdown / exit flight / close list / clear selection ----
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (document.activeElement === flytoInput && flytoInput.value) {
    flytoInput.value = ''
    filterFlyto()
    return
  }
  e.preventDefault()
  if (travel) {
    if (travel.countdownEnd !== null) cancelCountdown()
    else exitTravel('user')
    return
  }
  if (!flytoEl.classList.contains('r2-collapsed')) setFlytoOpen(false)
  else if (measuredName) clearMeasure()
})

// ---- Decluttered star labels (throttled ~10 Hz) ----
// Priority = tier, then brightness (array order). Greedy: a label is shown only if its
// screen box doesn't overlap an already placed one. Tier 0 ignores distance fade and can
// only be hidden by another tier-0 label (so lower tiers never hide it).
let lastLabelPass = 0
let alphaCenPlaced = true
const labelBoxes: number[] = [] // flat [cx, cy, hw, hh]
const LABEL_H = 8 // half height, px
const LABEL_PAD = 3

function tierFade(tier: number, dLy: number): number {
  if (tier <= 0) return 1
  if (tier === 1) return fadeOut(dLy, 150, 450)
  if (tier === 2) return fadeOut(dLy, 40, 120)
  return fadeOut(dLy, 15, 45)
}

function boxFree(cx: number, cy: number, hw: number, hh: number, upto = labelBoxes.length): boolean {
  for (let i = 0; i < upto; i += 4) {
    if (Math.abs(cx - labelBoxes[i]) < hw + labelBoxes[i + 2] && Math.abs(cy - labelBoxes[i + 1]) < hh + labelBoxes[i + 3]) {
      return false
    }
  }
  return true
}

function hideAllStarLabels() {
  for (const n of namedStars) {
    if (n.shown) {
      n.label.visible = false
      n.shown = false
    }
  }
}

function updateStarLabels(now: number, dSun: number, acClose: boolean) {
  if (dSun <= 2e4) {
    hideAllStarLabels()
    alphaCenPlaced = true
    return
  }
  if (now - lastLabelPass < 100) return
  lastLabelPass = now
  const halfW = window.innerWidth / 2
  const halfH = window.innerHeight / 2
  labelBoxes.length = 0
  const pushBox = (world: THREE.Vector3, hw: number): [number, number] | null => {
    tmp2.copy(world).project(camera)
    if (tmp2.z >= 1 || tmp2.z <= -1) return null
    const x = tmp2.x * halfW
    const y = tmp2.y * halfH + 12 // label sits just above its point
    if (Math.abs(x) > halfW + hw || Math.abs(y) > halfH + 20) return null
    return [x, y]
  }
  // Fixed occupants: UI panels (labels never hide under them), the Galactic Center tag,
  // the Sun / Solar System label and Alpha Centauri
  for (const el of [hud, travelPanel, flytoEl, legendEl, zoombar]) {
    if (el.hidden) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0) continue
    labelBoxes.push(r.left + r.width / 2 - halfW, halfH - (r.top + r.height / 2), r.width / 2 + 4, r.height / 2 + 4)
  }
  if (galacticIndicator.visible) {
    const g = pushBox(galacticIndicator.children[2].position, 88)
    if (g) labelBoxes.push(g[0], g[1], 88, LABEL_H + 1)
  }
  const sunBox = pushBox(tmp3.set(0, 0, 0), 42)
  if (sunBox) labelBoxes.push(sunBox[0], sunBox[1], 42, LABEL_H + 1)
  alphaCenPlaced = false
  if (!acClose) {
    const ac = pushBox(alphaCenPos, 46)
    if (ac && boxFree(ac[0], ac[1], 46, LABEL_H + 1)) {
      labelBoxes.push(ac[0], ac[1], 46, LABEL_H + 1)
      alphaCenPlaced = true
    }
  }
  const fixedEnd = labelBoxes.length
  let tier0End = fixedEnd
  const camLy = 1 / AU_PER_LY
  for (const n of namedStars) {
    let show = false
    let op = 1
    const dLy = camera.position.distanceTo(n.pos) * camLy
    op = tierFade(n.tier, dLy)
    if (op > 0.04) {
      const p = pushBox(n.pos, n.halfW)
      if (p) {
        const hw = n.halfW + LABEL_PAD
        const hh = LABEL_H + LABEL_PAD * 0.5
        // tier 0: only collide with fixed occupants + other tier-0 labels
        const free = n.tier === 0 ? boxFree(p[0], p[1], hw, hh, tier0End) : boxFree(p[0], p[1], hw, hh)
        if (free) {
          labelBoxes.push(p[0], p[1], hw, hh)
          if (n.tier === 0) tier0End = labelBoxes.length
          show = true
        }
      }
    }
    if (show !== n.shown) {
      n.label.visible = show
      n.shown = show
    }
    if (show) {
      const q = Math.round(op * 20) / 20
      if (q !== n.opacity) {
        n.opacity = q
        n.label.element.style.opacity = String(q)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------

let simYears = 0
let lastTime = performance.now()
const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()
const tmp3 = new THREE.Vector3()

function animate() {
  requestAnimationFrame(animate)

  const now = performance.now()
  const dt = Math.min((now - lastTime) / 1000, 0.1)
  lastTime = now
  const activePacing = travel ? warpFactor : 1.0
  simYears += (dt * daysPerSecond * activePacing) / 365.25

  // Planets (positions must update before the camera flight/follow logic,
  // otherwise a followed planet is always one frame ahead of the camera)
  for (const p of planets) {
    const M = p.def.phase + (simYears / p.def.periodYears) * Math.PI * 2
    const nu = trueAnomaly(solveKepler(M % (Math.PI * 2), p.def.e), p.def.e)
    orbitPoint(p.def.a, p.def.e, nu, tmp)
    p.mesh.position.copy(tmp)
  }

  // Alpha Centauri A-B binary (shared anomaly, opposite sides of barycenter)
  const Mab = (simYears / AC.periodYears) * Math.PI * 2
  const nuAB = trueAnomaly(solveKepler(Mab % (Math.PI * 2), AC.e), AC.e)
  orbitPoint(aA, AC.e, nuAB, tmp)
  starA.position.copy(tmp)
  orbitPoint(aB, AC.e, nuAB, tmp)
  starB.position.copy(tmp).multiplyScalar(-1)

  // Space travel: hold on the pad through the countdown, then advance the
  // ship along its route in Earth (sim) time
  if (travel) {
    if (travel.countdownEnd !== null) {
      const remain = (travel.countdownEnd - now) / 1000
      if (remain > 0) {
        // Parked next to Earth, riding along in its orbit until ignition
        travel.dir.copy(travel.dest).sub(earthMesh.position).normalize()
        travel.origin.copy(earthMesh.position).addScaledVector(travel.dir, PAD_ALTITUDE)
        shipGroup.position.copy(travel.origin)
        travelShipHeading.copy(travel.dir)
        shipGroup.quaternion.setFromUnitVectors(Y_UP, travelShipHeading)
        // Engines spool up smoothly over the countdown (0 -> 1)
        rocketSystems.setIgnition(1 - remain / COUNTDOWN_S)

        // Large 3-2-1: each digit pops in, holds, then fades/shrinks
        const digit = Math.min(COUNTDOWN_S, Math.ceil(remain))
        const ph = 1 - (remain - (digit - 1)) // 0 -> 1 within this second
        if (digit !== cdShownDigit) {
          cdNum.textContent = String(digit)
          cdShownDigit = digit
        }
        const op = ph < 0.12 ? ph / 0.12 : 1 - smooth((ph - 0.5) / 0.5)
        cdNum.style.opacity = op.toFixed(3)
        cdNum.style.transform = `scale(${(1.12 - 0.2 * ph).toFixed(3)})`
        countdownEl.hidden = false
        tpPhase.textContent = `Pre-launch (${remain.toFixed(1)} s)`
        tpSpeed.textContent = '0.00 %c'
        tpGamma.textContent = '1.000'
        tpDone.textContent = '0 AU'
        tpLeft.textContent = fmtLy(travel.D)
        tpShip.textContent = '0.0 days'
        tpEarth.textContent = '0.0 days'
      } else {
        // Ignition: freeze the route geometry and clocks at this instant
        countdownEl.hidden = true
        cdShownDigit = -1
        rocketSystems.setIgnition(1) // full burn for the whole flight
        travel.countdownEnd = null
        travel.dir.copy(travel.dest).sub(earthMesh.position).normalize()
        travel.origin.copy(earthMesh.position).addScaledVector(travel.dir, PAD_ALTITUDE)
        travel.D = travel.dest.distanceTo(travel.origin) / AU_PER_LY
        const d = travel.D / 2
        travel.tHalf = Math.sqrt((1 + SHIP_ACCEL * d) ** 2 - 1) / SHIP_ACCEL
        travel.tauHalf = Math.acosh(1 + SHIP_ACCEL * d) / SHIP_ACCEL
        travel.T = 2 * travel.tHalf
        travel.Tship = 2 * travel.tauHalf
        travel.t0 = simYears

        // Accelerate simulation smoothly after clearing the launch pad
        setSpeed(1.0)
      }
    }

    if (travel.countdownEnd === null) {
      const a = SHIP_ACCEL
      const te = simYears - travel.t0
      let x: number, v: number, tau: number, phase: string
      if (te >= travel.T) {
        x = travel.D
        v = 0
        tau = travel.Tship
        phase = 'Arrived'
        if (!travel.arrived) {
          travel.arrived = true
          setSpeed(1) // back to base clock after the sprint
          refreshTravelPanel()
        }
      } else if (te < travel.tHalf) {
        x = (Math.sqrt(1 + (a * te) ** 2) - 1) / a
        v = (a * te) / Math.sqrt(1 + (a * te) ** 2)
        tau = Math.asinh(a * te) / a
        phase = 'Accelerating · 1.5 g'
      } else {
        const tr = travel.T - te
        x = travel.D - (Math.sqrt(1 + (a * tr) ** 2) - 1) / a
        v = (a * tr) / Math.sqrt(1 + (a * tr) ** 2)
        tau = travel.Tship - Math.asinh(a * tr) / a
        phase = 'Decelerating · 1.5 g (flipped)'
      }

      shipGroup.position.copy(travel.origin).addScaledVector(travel.dir, x * AU_PER_LY)

      // Smooth turnover maneuver around midpoint:
      const tMid = travel.t0 + travel.tHalf
      const flipDurationYears = (3.5 * daysPerSecond * activePacing) / 365.25
      let flipT = 0
      if (simYears >= tMid + flipDurationYears / 2) {
        flipT = 1.0
      } else if (simYears > tMid - flipDurationYears / 2) {
        flipT = smooth((simYears - (tMid - flipDurationYears / 2)) / flipDurationYears)
      }

      // Rotate heading from forward to reverse
      const flipAxis = tmp3.crossVectors(travel.dir, new THREE.Vector3(0, 1, 0)).normalize()
      if (flipAxis.lengthSq() < 0.1) flipAxis.set(1, 0, 0)
      travelShipHeading.copy(travel.dir).applyAxisAngle(flipAxis, flipT * Math.PI)
      shipGroup.quaternion.setFromUnitVectors(Y_UP, travelShipHeading)

      // Engine status: engines cut during mid-turnover
      const isTurning = flipT > 0.02 && flipT < 0.98
      const engineFiring = !travel.arrived && !isTurning
      const ign = rocketSystems.getIgnition()
      rocketSystems.plumeGroup.visible = engineFiring && ign > 0.001

      if (isTurning) {
        phase = 'Turnover Maneuver (180° Flip)'
      }

      // Animate exhaust plume pulsation & shock diamonds
      if (engineFiring && ign > 0.001) {
        const flamePulse = (1.0 + 0.08 * Math.sin(now * 0.03)) * ign
        rocketSystems.plumeCore.scale.set(flamePulse, (1.0 + 0.15 * Math.cos(now * 0.035)) * ign, flamePulse)
        rocketSystems.plumeOuter.scale.set(flamePulse * 1.05, (1.0 + 0.12 * Math.sin(now * 0.025)) * ign, flamePulse * 1.05)
        rocketSystems.plumeLight.intensity = (2.8 + 0.8 * Math.sin(now * 0.04)) * ign
        for (let i = 0; i < rocketSystems.diamonds.length; i++) {
          const dPulse = 1.0 + 0.1 * Math.sin(now * 0.04 + i)
          rocketSystems.diamonds[i].scale.set(dPulse, dPulse, dPulse)
        }
      }

      // Warp speed space-dust stream when v > 0.05c
      if (!travel.arrived) {
        const vFrac = Math.min(1.0, v)
        rocketSystems.warpMat.opacity = THREE.MathUtils.clamp((vFrac - 0.03) * 2.5, 0.0, 0.85)
        const positions = rocketSystems.warpPositions
        const speedStep = (vFrac * 60 + 2) * dt * 8
        for (let i = 0; i < positions.length; i += 3) {
          positions[i + 1] += speedStep
          if (positions[i + 1] > 16) positions[i + 1] = -16
        }
        rocketSystems.warpParticles.geometry.attributes.position.needsUpdate = true
      } else {
        rocketSystems.warpMat.opacity = 0.0
      }

      tpPhase.textContent = phase
      tpSpeed.textContent = `${(v * 100).toFixed(v > 0.99 ? 4 : 2)} %c`
      tpGamma.textContent = (1 / Math.sqrt(Math.max(1e-6, 1 - v * v))).toFixed(3)
      tpDone.textContent = fmtLy(x)
      tpLeft.textContent = fmtLy(Math.max(0, travel.D - x))
      tpShip.textContent = fmtYears(tau)
      tpEarth.textContent = fmtYears(Math.min(te, travel.T))
    }
  }

  // Camera flight / follow
  if (flight) {
    if (flight.toObj) flight.toTarget.copy(flight.toObj.position) // destination moves (planet)
    const k = smooth((now - flight.start) / 1600)
    controls.target.lerpVectors(flight.fromTarget, flight.toTarget, k)
    const dir = tmp.copy(flight.fromOffset).normalize().lerp(flight.toOffset.clone().normalize(), k).normalize()
    const dist = Math.exp(THREE.MathUtils.lerp(Math.log(flight.fromOffset.length()), Math.log(flight.toOffset.length()), k))
    camera.position.copy(controls.target).addScaledVector(dir, dist)
    if (k >= 1) {
      followObj = flight.toObj ?? null
      flight = null
    }
  } else if (followObj) {
    if (travel) {
      // Stable visual scale from journey progress (NOT camera distance) — avoids
      // shrink-into-hull feedback that trapped chase/cockpit inside the mesh.
      const heading = travelShipHeading.clone().normalize()
      const distFromOriginAu = shipGroup.position.distanceTo(travel.origin)
      const progress = THREE.MathUtils.clamp(distFromOriginAu / Math.max(travel.D * AU_PER_LY, 1e-9), 0, 1)
      const padScale = 2.5e-5
      const cruiseScale = 6e-4
      const shipVisualScale = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(padScale, cruiseScale, Math.min(1, progress * 15 + 0.02)),
        1e-6,
        0.02,
      )
      shipGroup.scale.setScalar(shipVisualScale)

      const nose = SHIP_LOCAL_NOSE * shipVisualScale
      const radius = SHIP_LOCAL_RADIUS * shipVisualScale
      const shipLen = SHIP_LOCAL_LENGTH * shipVisualScale
      const hullClearance = Math.max(radius * 4, shipLen * 0.4, camera.near * 8)

      // When following the ship, keep OrbitControls from dollying into the hull
      if (followObj === shipGroup) {
        controls.minDistance = Math.max(ZOOM_MIN, hullClearance)
      }

      const dShip = camera.position.distanceTo(shipGroup.position)
      shipDot.visible = dShip > shipLen * 10

      const worldUp = new THREE.Vector3(0, 1, 0)
      let camUp = worldUp
      if (Math.abs(heading.dot(worldUp)) > 0.92) camUp = new THREE.Vector3(0, 0, 1)

      // Ship frame for look-around: forward = heading, up = camUp made orthogonal, side = f x up
      const shipSide = tmp2.crossVectors(heading, camUp)
      if (shipSide.lengthSq() < 1e-10) shipSide.set(1, 0, 0)
      else shipSide.normalize()
      const shipUp = new THREE.Vector3().crossVectors(shipSide, heading).normalize()
      updateLookEase(dt)

      if (travelCameraMode === 'chase') {
        // Orbit the ship on a sphere (in ship units) around its origin: default ~2.2 ship-lengths
        // aft + above, rotated by the drag yaw/pitch. Built relative to the ship each frame, so
        // it never lags behind at relativistic speed and never cuts through the hull.
        const s = shipVisualScale
        const back = SHIP_LOCAL_LENGTH * 2.2 + SHIP_LOCAL_RADIUS
        const upOff = SHIP_LOCAL_LENGTH * 0.55
        const R = Math.max(Math.hypot(back, upOff), CHASE_MIN_DIST_LOCAL)
        const elev = THREE.MathUtils.clamp(Math.atan2(upOff, back) + lookPitch, -CHASE_PITCH_LIMIT, CHASE_PITCH_LIMIT)
        const az = lookYaw
        // direction from ship to camera (unit), in the ship frame
        const want = tmp3.copy(heading).multiplyScalar(-Math.cos(elev) * Math.cos(az))
          .addScaledVector(shipSide, -Math.cos(elev) * Math.sin(az))
          .addScaledVector(shipUp, Math.sin(elev))
          .normalize()
        if (chaseRel.lengthSq() < 0.5) chaseRel.copy(want)
        else chaseRel.lerp(want, 1 - Math.exp(-dt * 10)).normalize() // spherical-ish smoothing
        camera.position.copy(shipGroup.position).addScaledVector(chaseRel, R * s)
        controls.target.copy(shipGroup.position).addScaledVector(heading, nose * 0.12)
        controls.minDistance = Math.min(controls.minDistance, R * s * 0.5)
      } else if (travelCameraMode === 'cockpit') {
        // Always faces the destination (travel.dir), also after the mid-course flip (as in
        // round 1). The eye sits just beyond whichever ship end faces the target: past the nose
        // tip before the flip, past the aft plume tip after it (the plume then trails behind
        // the eye). During the flip the bound blends via c = heading·dir, with a lateral term
        // covering fins/flaps, so the eye never enters the hull or the exhaust.
        const s = shipVisualScale
        const fwd = travel.dir
        const c = THREE.MathUtils.clamp(heading.dot(fwd), -1, 1)
        const alongLocal = Math.max(SHIP_LOCAL_NOSE * c, -COCKPIT_PLUME_EXTENT_LOCAL * c, 0)
          + COCKPIT_LATERAL_EXTENT_LOCAL * Math.sqrt(Math.max(0, 1 - c * c))
        const safety = Math.max(radius * 0.4, camera.near * 10, 1e-7)
        const camPos = shipGroup.position.clone().addScaledVector(fwd, alongLocal * s + safety)
        camera.position.copy(camPos)
        // Look-around frame relative to the destination-facing forward
        const ckSide = new THREE.Vector3().crossVectors(fwd, camUp)
        if (ckSide.lengthSq() < 1e-10) ckSide.set(1, 0, 0)
        else ckSide.normalize()
        const ckUp = new THREE.Vector3().crossVectors(ckSide, fwd).normalize()
        const yaw = THREE.MathUtils.clamp(lookYaw, -COCKPIT_YAW_LIMIT, COCKPIT_YAW_LIMIT)
        const pitch = THREE.MathUtils.clamp(lookPitch, -COCKPIT_PITCH_LIMIT, COCKPIT_PITCH_LIMIT)
        const lookDir = tmp3.copy(fwd).multiplyScalar(Math.cos(pitch) * Math.cos(yaw))
          .addScaledVector(ckSide, Math.cos(pitch) * Math.sin(yaw))
          .addScaledVector(ckUp, Math.sin(pitch))
          .normalize()
        controls.target.copy(camPos).addScaledVector(lookDir, Math.max(20, shipLen * 800))
        controls.minDistance = safety
      } else if (travelCameraMode === 'cinematic') {
        // Side hero exterior
        let side = new THREE.Vector3().crossVectors(heading, camUp)
        if (side.lengthSq() < 1e-10) side.set(1, 0, 0)
        else side.normalize()
        const cineOffset = heading.clone().multiplyScalar(-(shipLen * 0.9))
          .addScaledVector(side, shipLen * 1.4)
          .addScaledVector(camUp, -shipLen * 0.28)
        controls.target.copy(shipGroup.position)
        camera.position.lerp(shipGroup.position.clone().add(cineOffset), 0.08)
      } else if (travelCameraMode === 'orbit') {
        // Free OrbitControls around the ship; refuse to sit inside the mesh
        tmp.copy(shipGroup.position).sub(controls.target)
        controls.target.add(tmp)
        camera.position.add(tmp)
        const d = camera.position.distanceTo(shipGroup.position)
        if (d < hullClearance) {
          const out = camera.position.clone().sub(shipGroup.position)
          if (out.lengthSq() < 1e-16) out.copy(heading).multiplyScalar(-1)
          camera.position.copy(shipGroup.position).addScaledVector(out.normalize(), hullClearance)
        }
      }
    } else {
      // Standard planetary follow
      controls.minDistance = ZOOM_MIN
      tmp.copy(followObj.position).sub(controls.target)
      controls.target.add(tmp)
      camera.position.add(tmp)
      if (camera.position.distanceTo(followObj.position) > 0.5) followObj = null
    }
  }

  // Distance-based fading keeps each zoom level clean:
  // markers/orbits fade out once they would collapse to a bright blob
  const dSun = camera.position.length()
  const dAC = tmp.copy(camera.position).sub(alphaCenPos).length()

  const planetFade = fadeOut(dSun, 400, 3000)
  const orbitFade = 0.35 * fadeOut(dSun, 1000, 8000)
  for (const p of planets) {
    // Marker also fades away when the camera is close enough to see the
    // true-scale sphere itself
    const radius = p.def.radiusKm / KM_PER_AU
    const dPlanet = tmp2.copy(camera.position).sub(p.mesh.position).length()
    ;(p.marker.material as THREE.PointsMaterial).opacity = 0.9 * planetFade * fadeIn(dPlanet, radius * 4, radius * 40)
    ;(p.orbit.material as THREE.LineBasicMaterial).opacity = orbitFade
    p.label.visible = dSun < 400
  }
  ;(kuiper.material as THREE.PointsMaterial).opacity = 0.5 * fadeOut(dSun, 2000, 20000)
  ;(oort.material as THREE.PointsMaterial).opacity =
    0.25 * fadeIn(dSun, 200, 1500) * fadeOut(dSun, 2e5, 1.2e6) + 0.04
  kuiperLabel.visible = dSun > 25 && dSun < 3000
  oortLabel.visible = dSun > 8000 && dSun < 8e5

  const acClose = dAC < 3000
  starA.children[1].visible = acClose
  starB.children[1].visible = acClose
  proxima.children[1].visible = dAC < 8e5
  alphaCenLabel.visible = !acClose
  const abOrbitFade = 0.8 * fadeOut(dAC, 1000, 8000)
  ;(orbitA.material as THREE.LineBasicMaterial).opacity = abOrbitFade
  ;(orbitB.material as THREE.LineBasicMaterial).opacity = abOrbitFade
  sun.children[1].visible = dSun < 3000
  sunSystemLabel.visible = dSun >= 3000
  galacticIndicator.visible = dSun > 3e5

  // Named-star labels: decluttered by priority, faded by distance (see updateStarLabels)
  updateStarLabels(now, dSun, acClose)
  alphaCenLabel.visible = !acClose && (dSun <= 2e4 || alphaCenPlaced)

  // HUD
  let view: string, tip: string
  if (dAC < 3000) {
    view = 'Alpha Centauri system'
    tip = 'A and B orbit their barycenter every 79.9 years (11.2–35.6 AU apart)'
  } else if (dSun < 70) {
    view = 'Planetary system'
    tip = 'Scroll out — the Kuiper Belt begins at 30 AU'
  } else if (dSun < 3000) {
    view = 'Kuiper Belt'
    tip = 'Keep zooming — the Oort Cloud spans 2,000–100,000 AU'
  } else if (dSun < 2.5e5) {
    view = 'Oort Cloud'
    tip = 'α Centauri is ~276,000 AU away (4.37 ly)'
  } else if (dSun < 1.5e6) {
    view = 'Interstellar space'
    tip = 'Every point is a real star: Gaia DR3 plus Hipparcos for bright stars Gaia misses'
  } else {
    view = 'Local neighborhood'
    tip = `${catalogCounts.gaia.toLocaleString('en-US')} Gaia DR3 + ${catalogCounts.hipparcos} Hipparcos stars, white dwarfs and brown dwarfs within 150 ly`
  }
  hudView.textContent = view
  hudTip.textContent = `💡 ${tip}`
  hudDist.textContent = formatDistance(dSun)
  hudElapsed.textContent =
    simYears < 1 ? `${(simYears * 365.25).toFixed(0)} days` : `${simYears.toFixed(2)} years`
  hudSep.textContent = `${starA.position.distanceTo(starB.position).toFixed(2)} AU`

  // Zoom bar thumb tracks the actual camera distance
  const zt =
    (Math.log(currentZoomDistance()) - Math.log(ZOOM_MIN)) / (Math.log(ZOOM_MAX) - Math.log(ZOOM_MIN))
  zoomThumb.style.top = `${THREE.MathUtils.clamp(zt, 0, 1) * 100}%`

  controls.update()
  renderer.render(scene, camera)
  labelRenderer.render(scene, camera)
}

animate()

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  labelRenderer.setSize(window.innerWidth, window.innerHeight)
})
