// ----------------------------------------------------
// APPLICATION STATE
// ----------------------------------------------------
let scene, camera, renderer, controls;
let starData = [];             // Raw array of all processed stars
let filteredStars = [];         // Stars that pass active filters
let starGeometry;              // Three.js BufferGeometry for point clouds
let starPointsMesh;            // THREE.Points mesh object
let pointTexture;              // Cached circular star texture
let starShaderMaterial;        // Custom ShaderMaterial for particle sizing/glow

// Reference Overlays
let galacticPlaneGrid;
let distanceRingsGroup;
let ringLabelsGroup;            // Group container for concentric ring text sprites
let oortCloudPoints;           // Points system representing Oort Cloud
let outerPlanetsOrbitsGroup;   // Group containing planetary orbit lines
let planetsGroup;              // Group containing physical planet spheres
let planets = [];              // Array to hold planet animation data
let selectionLine;
let sunSphere;
let hoveredObject = null;
let selectedStar = null;
let crispDotTexture;           // Cached sharp, sleek point texture
let sunGroup;                  // Group for multi-layered Sun
let sunCorona;                 // Animated corona sphere
let sunGlowSprite;             // Billboard glow sprite
let sunOuterGlow;              // Outer atmosphere mesh
let oortCloudOuter;            // Outer sparse Oort shell
let oortRingLine;              // Oort Cloud boundary ring

// Raycasting & Sizing
const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 0.5; // Large enough click target in space
const mouse = new THREE.Vector2();

// Camera Animation States (Smooth Fly-To)
let isAnimatingCamera = false;
let cameraTargetPos = new THREE.Vector3();
let controlsTargetPos = new THREE.Vector3();
let animationProgress = 0;
const animationDuration = 60; // frames (~1 sec)

// Filters State
let activeFilters = new Set();
let maxDistance = 100.0;
const defaultFilters = [
    "Giant / Subgiant", "Hot Blue Star", "A-type Star", "F-type Star", 
    "Yellow Dwarf", "Orange Dwarf", "Red Dwarf", "White Dwarf", "Unclassified Star"
];

// HR Diagram Canvas Cache
let hrCanvas, hrCtx;
let hrStarsCache = []; // Caches pixel coordinates for instant canvas lookups

// ----------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
    initThreeJS();
    initUIEventListeners();
    loadCatalogData();
});

// ----------------------------------------------------
// THREE.JS SETUP
// ----------------------------------------------------
function initThreeJS() {
    const container = document.getElementById('canvas-container');
    
    // Scene setup
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05060b, 0.003); // Soft depth fading
    
    // Camera
    camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.0000005, 1000);
    camera.position.set(30, 20, 50); // General orbital view on load
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit DPR for mobile performance
    renderer.setClearColor(scene.fog.color);
    container.appendChild(renderer.domElement);
    
    // Orbit Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 250; // Don't orbit beyond catalog limit
    controls.minDistance = 0.000790626; // Block zooming closer than 50 AU
    
    // Core Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0xffebd2, 1, 150);
    pointLight.position.set(0, 0, 0); // Light source emanating from the Sun
    scene.add(pointLight);

    // Dynamic Star Texture
    pointTexture = createStarTexture();
    crispDotTexture = createCrispDotTexture();

    // Create Custom Shaders for Star Points
    initStarShaderMaterial();

    // Setup Reference Space Grid & Concentric boundary rings
    createSpatialReferences();
    
    // Window Resizing
    window.addEventListener('resize', onWindowResize);
    
    // Raycasting Click & Hover Detection
    renderer.domElement.addEventListener('pointerdown', onDocumentPointerDown);
    renderer.domElement.addEventListener('pointermove', onDocumentPointerMove);
    
    // Animation Loop
    animate();
}

// ----------------------------------------------------
// CUSTOM STARDUST SHADER
// ----------------------------------------------------
function initStarShaderMaterial() {
    // Custom shaders allow varying point sizes and brightness based on Absolute Magnitude
    // and realistic size decay depending on depth (zooming closer makes particles larger).
    
    const vertexShader = `
        attribute float size;
        attribute vec3 customColor;
        varying vec3 vColor;
        void main() {
            vColor = customColor;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            // Attenuate size based on Z-depth (distance to camera)
            gl_PointSize = size * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
        }
    `;

    const fragmentShader = `
        uniform sampler2D pointTexture;
        varying vec3 vColor;
        void main() {
            // Apply radial starlight texture and multiply by RGB vertex color
            gl_FragColor = vec4(vColor, 1.0) * texture2D(pointTexture, gl_PointCoord);
        }
    `;

    starShaderMaterial = new THREE.ShaderMaterial({
        uniforms: {
            pointTexture: { value: pointTexture }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending, // Points blend glow when intersecting
        depthWrite: false,                // Disabling prevents black square outlines around soft sprites
    });
}

// Dynamically creates a sharp, solid circular texture for stars
function createStarTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
    ctx.fill();
    
    return new THREE.CanvasTexture(canvas);
}

// Dynamically creates a sharp, sleek circular point texture with a subtle glow for Oort particles
function createCrispDotTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillRect(0, 0, 32, 32);
    
    // Sleek solid circle with subtle outer glow
    ctx.beginPath();
    ctx.arc(16, 16, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
    ctx.shadowColor = '#00c6ff';
    ctx.shadowBlur = 5;
    ctx.fill();
    
    return new THREE.CanvasTexture(canvas);
}

// ----------------------------------------------------
// SUN & OORT CLOUD TEXTURE GENERATORS
// ----------------------------------------------------
function createSunGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const cx = 128, cy = 128;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 128);
    gradient.addColorStop(0, 'rgba(255, 255, 240, 1.0)');
    gradient.addColorStop(0.03, 'rgba(255, 245, 210, 0.95)');
    gradient.addColorStop(0.08, 'rgba(255, 220, 140, 0.7)');
    gradient.addColorStop(0.18, 'rgba(255, 180, 60, 0.35)');
    gradient.addColorStop(0.35, 'rgba(255, 120, 20, 0.12)');
    gradient.addColorStop(0.55, 'rgba(255, 80, 0, 0.04)');
    gradient.addColorStop(0.8, 'rgba(200, 50, 0, 0.01)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);

    return new THREE.CanvasTexture(canvas);
}

function createOortParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(210, 240, 255, 1.0)');
    gradient.addColorStop(0.15, 'rgba(170, 225, 255, 0.7)');
    gradient.addColorStop(0.35, 'rgba(120, 200, 255, 0.3)');
    gradient.addColorStop(0.6, 'rgba(80, 160, 255, 0.08)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    return new THREE.CanvasTexture(canvas);
}

// ----------------------------------------------------
// SPATIAL REFERENCE RIGS
// ----------------------------------------------------
function createSpatialReferences() {
    // Astronomical Units conversion (1 Ly ≈ 63,241 AU)
    const AU_TO_LY = 1.0 / 63241.0;

    // 1. Concentric Boundary Rings (10, 20, 30, ..., 100 Ly boundaries)
    distanceRingsGroup = new THREE.Group();
    ringLabelsGroup = new THREE.Group();
    
    const ringMaterials = new THREE.LineBasicMaterial({ 
        color: 0x00c6ff, 
        transparent: true, 
        opacity: 0.12,
        blending: THREE.AdditiveBlending
    });
    
    const radii = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    radii.forEach(radius => {
        // Draw Ring Line
        const ringGeo = new THREE.BufferGeometry();
        const vertices = [];
        const segmentCount = 128;
        
        for (let i = 0; i <= segmentCount; i++) {
            const theta = (i / segmentCount) * Math.PI * 2;
            vertices.push(
                Math.cos(theta) * radius,
                0,
                Math.sin(theta) * radius
            );
        }
        ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const line = new THREE.Line(ringGeo, ringMaterials);
        distanceRingsGroup.add(line);

        // Draw 3D Text Sprite next to the boundary ring (sitting on the X-axis)
        const labelSprite = createTextSprite(`${radius} Ly`);
        labelSprite.position.set(radius + 0.3, 0, 0);
        labelSprite.scale.set(4, 1, 1); // standard large size for deep galactic view
        ringLabelsGroup.add(labelSprite);
    });
    scene.add(distanceRingsGroup);
    scene.add(ringLabelsGroup);

    // 2. Oort Cloud — single shell of sharp dots at exactly 5,000 AU
    const oortMidR = 5000.0 * AU_TO_LY;

    const oortCount = 4000;
    const oortGeo = new THREE.BufferGeometry();
    const oortPos = new Float32Array(oortCount * 3);

    for (let i = 0; i < oortCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        
        oortPos[i * 3]     = oortMidR * Math.sin(phi) * Math.cos(theta);
        oortPos[i * 3 + 1] = oortMidR * Math.cos(phi);
        oortPos[i * 3 + 2] = -oortMidR * Math.sin(phi) * Math.sin(theta);
    }
    
    oortGeo.setAttribute('position', new THREE.Float32BufferAttribute(oortPos, 3));

    const oortMaterial = new THREE.PointsMaterial({
        size: 2, // Fixed 2 pixels on screen
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: false // Sharp dots
    });

    oortCloudPoints = new THREE.Points(oortGeo, oortMaterial);
    scene.add(oortCloudPoints);

    // Floating label
    const oortLabel = createTextSprite("Oort Cloud \u00b7 5,000 AU");
    oortLabel.position.set(oortMidR * 0.05, oortMidR * 1.15, 0);
    oortLabel.material.opacity = 0.0;
    oortLabel.scale.set(oortMidR * 1.5, oortMidR * 0.375, 1);
    oortCloudPoints.add(oortLabel);

    // 3. Complete Planetary System (Orbits & Planets)
    outerPlanetsOrbitsGroup = new THREE.Group();
    planetsGroup = new THREE.Group();
    planets = [];

    // Setup circular orbits helper
    function createCircularOrbit(radiusAU, colorHex, labelText, showLabel = true) {
        const radius = radiusAU * AU_TO_LY;
        const orbitGeo = new THREE.BufferGeometry();
        const vertices = [];
        const segmentCount = 90;
        for (let i = 0; i <= segmentCount; i++) {
            const theta = (i / segmentCount) * Math.PI * 2;
            vertices.push(
                Math.cos(theta) * radius,
                0,
                Math.sin(theta) * radius
            );
        }
        orbitGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const orbitMat = new THREE.LineBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending
        });
        const line = new THREE.LineLoop(orbitGeo, orbitMat);

        if (showLabel) {
            // Add 3D Text Label to the orbit line, scaled proportionally
            const label = createTextSprite(labelText);
            label.position.set(radius + radius * 0.08, 0, 0); 
            label.material.opacity = 0.0;
            label.scale.set(radius * 1.5, radius * 0.375, 1); // PERFECT scale matching
            line.add(label);
        }

        return line;
    }

    // Configurations for planets (visually enhanced sizing, realistic coordinates)
    const planetsConfig = [
        { name: "Mercury", r: 0.39, color: 0xa5a5a5, size: 0.0000010, speed: 4.15, showLabel: false },
        { name: "Venus", r: 0.72, color: 0xe3bb76, size: 0.0000020, speed: 1.62, showLabel: false },
        { name: "Earth", r: 1.00, color: 0x2f80ed, size: 0.0000022, speed: 1.00, showLabel: false },
        { name: "Mars", r: 1.52, color: 0xe2574c, size: 0.0000015, speed: 0.53, showLabel: false },
        { name: "Jupiter", r: 5.20, color: 0xd4a373, size: 0.0000100, speed: 0.084, showLabel: false },
        { name: "Saturn", r: 9.58, color: 0xf1c40f, size: 0.0000085, speed: 0.034, showLabel: false },
        { name: "Uranus", r: 19.22, color: 0x4fc3f7, size: 0.0000055, speed: 0.012, showLabel: false },
        { name: "Neptune", r: 30.07, color: 0x1e88e5, size: 0.0000052, speed: 0.006, showLabel: false }
    ];

    planetsConfig.forEach(config => {
        // Add Orbit Loop
        const orbitLine = createCircularOrbit(config.r, config.color, `${config.name} (${config.r} AU)`, config.showLabel);
        outerPlanetsOrbitsGroup.add(orbitLine);

        // Add Planet Mesh
        const pRadius = config.r * AU_TO_LY;
        const pGeo = new THREE.SphereGeometry(config.size, 16, 16);
        const pMat = new THREE.MeshBasicMaterial({ color: config.color });
        const pMesh = new THREE.Mesh(pGeo, pMat);
        planetsGroup.add(pMesh);

        planets.push({
            name: config.name,
            radius: pRadius,
            speed: config.speed,
            mesh: pMesh,
            eccentric: false
        });
    });

    // Add Pluto (eccentric, inclined orbit)
    const plutoGeo = new THREE.BufferGeometry();
    const plutoVertices = [];
    const plutoA = 39.48 * AU_TO_LY;
    const plutoE = 0.248;
    const plutoI = 17.16 * Math.PI / 180; // 17.16 degrees tilted
    
    for (let j = 0; j <= 128; j++) {
        const theta = (j / 128) * Math.PI * 2;
        const r = plutoA * (1 - plutoE * plutoE) / (1 + plutoE * Math.cos(theta));
        const xPrime = r * Math.cos(theta);
        const zPrime = r * Math.sin(theta);
        const x = xPrime;
        const y = -zPrime * Math.sin(plutoI);
        const z = zPrime * Math.cos(plutoI);
        plutoVertices.push(x, y, z);
    }
    plutoGeo.setAttribute('position', new THREE.Float32BufferAttribute(plutoVertices, 3));
    
    const plutoMat = new THREE.LineBasicMaterial({
        color: 0x9b51e0,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending
    });
    const plutoLine = new THREE.LineLoop(plutoGeo, plutoMat);
    
    // Add Pluto 3D label sprite at aphelion coordinate, scaled proportionally
    const plutoAphelion = plutoA * (1 + plutoE);
    const plutoLabel = createTextSprite("Pluto Orbit (17° tilt)");
    plutoLabel.position.set(plutoAphelion + plutoAphelion * 0.08, 0, 0);
    plutoLabel.material.opacity = 0.0;
    plutoLabel.scale.set(plutoA * 1.5, plutoA * 0.375, 1); // PERFECT scale matching
    plutoLine.add(plutoLabel);

    outerPlanetsOrbitsGroup.add(plutoLine);

    // Create Pluto Mesh
    const plutoSize = 0.0000012; // visual size
    const pPlutoGeo = new THREE.SphereGeometry(plutoSize, 12, 12);
    const pPlutoMat = new THREE.MeshBasicMaterial({ color: 0x9b51e0 });
    const plutoMesh = new THREE.Mesh(pPlutoGeo, pPlutoMat);
    planetsGroup.add(plutoMesh);

    planets.push({
        name: "Pluto",
        a: plutoA,
        e: plutoE,
        inclination: plutoI,
        speed: 0.004,
        mesh: plutoMesh,
        eccentric: true
    });

    scene.add(outerPlanetsOrbitsGroup);
    scene.add(planetsGroup);

    // 4. Galactic Plane Grid (Z=0)
    const gridSize = 200;
    const gridDivisions = 40;
    galacticPlaneGrid = new THREE.GridHelper(gridSize, gridDivisions, 0x00ffd5, 0x0c1125);
    galacticPlaneGrid.position.y = 0;
    
    if(Array.isArray(galacticPlaneGrid.material)) {
        galacticPlaneGrid.material.forEach(m => {
            m.transparent = true;
            m.opacity = 0.08;
        });
    } else {
        galacticPlaneGrid.material.transparent = true;
        galacticPlaneGrid.material.opacity = 0.08;
    }
    scene.add(galacticPlaneGrid);

    // 5. Sun as a simple yellow dot
    const sunGeo = new THREE.BufferGeometry();
    sunGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    
    const sunMat = new THREE.PointsMaterial({
        map: createStarTexture(),
        color: 0xffd700,
        size: 3,
        sizeAttenuation: false,
        transparent: true,
        opacity: 1.0
    });
    
    sunSphere = new THREE.Points(sunGeo, sunMat);
    scene.add(sunSphere);

    // 6. Vertical drop-line container for selected star
    const lineMaterial = new THREE.LineDashedMaterial({
        color: 0x00ffd5,
        dashSize: 0.5,
        gapSize: 0.3,
        transparent: true,
        opacity: 0.5
    });
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    selectionLine = new THREE.LineSegments(lineGeo, lineMaterial);
    selectionLine.computeLineDistances(); 
    selectionLine.visible = false;
    scene.add(selectionLine);
    
    createConstellations();
}

// Draws famous constellation asterisms using 3D lines
function createConstellations() {
    const constellationsGroup = new THREE.Group();
    
    const lineMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending
    });

    // Big Dipper (Shopping Wagon)
    // RA (deg), Dec (deg), Dist (Ly)
    const bigDipperStars = [
        { name: "Dubhe", ra: 165.93, dec: 61.75, dist: 123.6 },
        { name: "Merak", ra: 165.46, dec: 56.38, dist: 81.1 },
        { name: "Phecda", ra: 178.45, dec: 53.69, dist: 83.2 },
        { name: "Megrez", ra: 183.85, dec: 57.03, dist: 58.4 },
        { name: "Alioth", ra: 193.50, dec: 55.95, dist: 81.1 },
        { name: "Mizar", ra: 200.98, dec: 54.92, dist: 82.9 },
        { name: "Alkaid", ra: 206.88, dec: 49.31, dist: 103.9 }
    ];

    // Connect them in order (Alkaid -> Mizar -> Alioth -> Megrez -> Phecda -> Merak -> Dubhe)
    // Also add the pan shape connection: Megrez -> Dubhe
    const connections = [
        [6, 5], [5, 4], [4, 3], // Handle
        [3, 2], [2, 1], [1, 0], // Pan bottom & front
        [3, 0] // Complete the pan
    ];
    
    connections.forEach(pair => {
        const p1 = bigDipperStars[pair[0]];
        const p2 = bigDipperStars[pair[1]];
        
        const getPos = (p) => {
            const raRad = p.ra * Math.PI / 180;
            const decRad = p.dec * Math.PI / 180;
            
            const x = p.dist * Math.cos(decRad) * Math.cos(raRad);
            const y = p.dist * Math.cos(decRad) * Math.sin(raRad);
            const z = p.dist * Math.sin(decRad);
            
            // Swap Y and Z for Three.js coordinates
            return new THREE.Vector3(x, z, -y);
        };

        const v1 = getPos(p1);
        const v2 = getPos(p2);
        
        const geo = new THREE.BufferGeometry().setFromPoints([v1, v2]);
        const line = new THREE.Line(geo, lineMat);
        constellationsGroup.add(line);
    });

    scene.add(constellationsGroup);
}

// Dynamically draws 3D text sprites to label concentric rings and the Oort boundary
function createTextSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Transparent base
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillRect(0, 0, 256, 64);
    
    // Draw text with glowing neon blue look
    ctx.fillStyle = '#bdeeff';
    ctx.font = '500 24px "Outfit", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    
    // Add text shadow glow
    ctx.shadowColor = '#00c6ff';
    ctx.shadowBlur = 6;
    ctx.fillText(text, 10, 32);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ 
        map: texture, 
        transparent: true, 
        opacity: 0.55,
        blending: THREE.AdditiveBlending 
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(4, 1, 1); // aspect ratio scaled in 3D space units
    return sprite;
}

// ----------------------------------------------------
// CORE CATALOG LOADER & PARSER
// ----------------------------------------------------
async function loadCatalogData() {
    try {
        const response = await fetch('data/star_catalog_100ly_v1.csv');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const text = await response.text();
        starData = parseCSV(text);
        
        // Populate standard defaults
        defaultFilters.forEach(f => activeFilters.add(f));
        
        document.getElementById('star-count-display').innerText = `${starData.length.toLocaleString()} Stars Mapped`;
        
        // Rebuild particle geometries
        updateGeometry();
        
    } catch (e) {
        console.error("Error loading star catalog:", e);
        document.getElementById('star-count-display').innerText = "Database Connection Error";
    }
}

// Standard lightweight CSV Parser
function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    if(lines.length === 0) return [];
    
    const headers = lines[0].split(',');
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        
        // Splitting safely by comma
        const values = line.split(',');
        const star = {};
        
        for (let j = 0; j < headers.length; j++) {
            const header = headers[j];
            let val = values[j] ? values[j].trim() : '';
            
            if (val === 'NULL' || val === '') {
                star[header] = null;
            } else if (!isNaN(val)) {
                star[header] = parseFloat(val);
            } else {
                star[header] = val;
            }
        }
        data.push(star);
    }
    return data;
}

// ----------------------------------------------------
// STARS GEOMETRY ENGINE (REBUILD ATTRIBUTES)
// ----------------------------------------------------
function updateGeometry() {
    // Filter stars based on distance slider and toggle checklist
    filteredStars = starData.filter(star => {
        if (star.distance_ly > maxDistance) return false;
        return activeFilters.has(star.rough_star_type);
    });

    const count = filteredStars.length;
    
    // Allocate flat buffers for geometry attributes
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
        const star = filteredStars[i];
        const index3 = i * 3;

        // Coordinates mapping (Direct mapping in light-years)
        // Note: swap y and z coordinate to align Galactic plane horizontal in Three.js
        positions[index3] = star.x_ly;
        positions[index3 + 1] = star.z_ly; // Height is Y axis in standard Three.js Orbit Controls
        positions[index3 + 2] = -star.y_ly;

        // Custom Stellar Color Palette index mapping
        const color = getStellarColor(star.bp_rp, star.rough_star_type);
        colors[index3] = color.r;
        colors[index3 + 1] = color.g;
        colors[index3 + 2] = color.b;

        // Particle size scaled inversely by Absolute Magnitude
        // Brighter stars (lower absolute_g_mag) are visually larger
        sizes[i] = getStellarSize(star.absolute_g_mag);
    }

    // Recycle or construct THREE.BufferGeometry
    if (starPointsMesh) {
        scene.remove(starPointsMesh);
    }

    starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute('customColor', new THREE.BufferAttribute(colors, 3));
    starGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Reconstruct mesh wrapper
    starPointsMesh = new THREE.Points(starGeometry, starShaderMaterial);
    scene.add(starPointsMesh);
}

// Map color indices to realistic RGB starlight profiles
function getStellarColor(bp_rp, type) {
    const colorObj = new THREE.Color();
    
    switch (type) {
        case "Giant / Subgiant": return colorObj.setHex(0xffaa5e);
        case "Hot Blue Star": return colorObj.setHex(0x3cb8ff);
        case "A-type Star": return colorObj.setHex(0xc8f0ff);
        case "F-type Star": return colorObj.setHex(0xfafdff);
        case "Yellow Dwarf": return colorObj.setHex(0xfff4bd);
        case "Orange Dwarf": return colorObj.setHex(0xffaa5e);
        case "Red Dwarf": return colorObj.setHex(0xff5252);
        case "White Dwarf": return colorObj.setHex(0xffffff);
        default: return colorObj.setHex(0xa0a0a0);
    }
}

// Translates Absolute Magnitude (luminescence scale) into pixel point sizes
function getStellarSize(absMag) {
    if (absMag === null) return 1.0;
    
    // Absolute magnitude scale: lower/negative numbers are extremely bright,
    // red dwarfs are faint (mag 10 to 15).
    if (absMag < 0.0) {
        // Super giants
        return 3.5;
    } else if (absMag < 3.0) {
        // Bright stars
        return 2.5;
    } else if (absMag < 6.0) {
        // Medium stars (Sun-like)
        return 1.8;
    } else if (absMag < 9.0) {
        // K Dwarfs
        return 1.2;
    } else {
        // Red Dwarfs / Faint dwarfs
        return 0.8;
    }
}



// ----------------------------------------------------
// SELECTION & DYNAMIC DETAILS UPDATER
// ----------------------------------------------------
function selectStar(star) {
    selectedStar = star;
    
    // Toggle active details panel view
    document.getElementById('details-default-msg').classList.add('hidden');
    document.getElementById('details-content').classList.remove('hidden');
    
    // Fill dynamic labels
    document.getElementById('detail-star-name').innerText = star.star_name || star.catalog_label;
    
    const typeBadge = document.getElementById('detail-star-type-badge');
    typeBadge.innerText = star.rough_star_type;
    const badgeColors = {
        "Giant / Subgiant": "var(--clr-giant)",
        "Hot Blue Star": "var(--clr-hot)",
        "A-type Star": "var(--clr-a)",
        "F-type Star": "var(--clr-f)",
        "Yellow Dwarf": "var(--clr-g)",
        "Orange Dwarf": "var(--clr-k)",
        "Red Dwarf": "var(--clr-m)",
        "White Dwarf": "var(--clr-wd)",
        "Unclassified Star": "var(--clr-unclassified)"
    };
    typeBadge.style.borderColor = badgeColors[star.rough_star_type] || "var(--clr-unclassified)";
    
    document.getElementById('detail-distance').innerText = `${star.distance_ly.toFixed(2)} Light-Years (${star.distance_pc.toFixed(2)} Parsecs)`;
    document.getElementById('detail-apparent-mag').innerText = star.phot_g_mean_mag ? star.phot_g_mean_mag.toFixed(2) : "N/A";
    document.getElementById('detail-absolute-mag').innerText = star.absolute_g_mag.toFixed(2);
    document.getElementById('detail-color-index').innerText = star.bp_rp ? star.bp_rp.toFixed(2) : "N/A";
    
    // Coordinates info
    document.getElementById('detail-coord-x').innerText = star.x_ly.toFixed(2);
    document.getElementById('detail-coord-y').innerText = star.y_ly.toFixed(2);
    document.getElementById('detail-coord-z').innerText = star.z_ly.toFixed(2);

    // Update 3D height Drop Line
    const showDropLine = document.getElementById('toggle-droplines').checked;
    if (showDropLine) {
        const vertices = [
            star.x_ly, star.z_ly, -star.y_ly, // Star coordinate in Three.js space
            star.x_ly, 0, -star.y_ly         // Galactic projection point
        ];
        selectionLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        selectionLine.geometry.attributes.position.needsUpdate = true;
        selectionLine.computeLineDistances(); // Recompute dashed patterns
        selectionLine.visible = true;
    } else {
        selectionLine.visible = false;
    }

}

// Sets camera target to smoothly fly close to target star
function triggerFlyTo(star) {
    isAnimatingCamera = true;
    animationProgress = 0;
    
    // Controls focus center target
    controlsTargetPos.set(star.x_ly, star.z_ly, -star.y_ly);
    
    // Orbit offset vector to stand near the star
    const direction = new THREE.Vector3()
        .copy(camera.position)
        .sub(controls.target)
        .normalize();
        
    // If it's the Sun, fly close to see planetary orbits!
    if (star.star_name === "Sun (Sol)") {
        cameraTargetPos.copy(controlsTargetPos).addScaledVector(direction, 0.0015); // ~95 AU, perfect close-up planetary scale!
    } else {
        cameraTargetPos.copy(controlsTargetPos).addScaledVector(direction, 6.0); // 6 Ly for other stars
    }
}

// Smooth LERP/easing frame calculations
function updateCameraTransition() {
    if (!isAnimatingCamera) return;
    
    animationProgress += 0.05; // speed parameter per frame
    
    if (animationProgress >= 1.0) {
        // Snap to destination and close loop
        camera.position.copy(cameraTargetPos);
        controls.target.copy(controlsTargetPos);
        isAnimatingCamera = false;
    } else {
        // LERP transitions
        camera.position.lerp(cameraTargetPos, 0.08);
        controls.target.lerp(controlsTargetPos, 0.08);
    }
}

// ----------------------------------------------------
// CLICK & HOVER RAYCASTING (THREE.JS CANVAS)
// ----------------------------------------------------
function onDocumentPointerDown(event) {
    // Stop click handling if pointer is hovering overlay hud panels
    if (event.target !== renderer.domElement) return;

    // Normalizing mouse positions
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    
    if (starPointsMesh) {
        const intersects = raycaster.intersectObject(starPointsMesh);
        
        if (intersects.length > 0) {
            // Find index of clicked particle
            const clickedIdx = intersects[0].index;
            const star = filteredStars[clickedIdx];
            selectStar(star);
        }
    }
}

function onDocumentPointerMove(event) {
    // Normalizing mouse coordinates
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    const tooltip = document.getElementById('star-hover-tooltip');
    
    // Ignore hover when mouse is on interactive glass panels
    if (event.target !== renderer.domElement) {
        tooltip.classList.add('hidden');
        document.body.style.cursor = 'default';
        return;
    }

    raycaster.setFromCamera(mouse, camera);

    if (starPointsMesh) {
        const intersects = raycaster.intersectObject(starPointsMesh);

        if (intersects.length > 0) {
            const idx = intersects[0].index;
            const star = filteredStars[idx];
            
            // Set hovered state
            hoveredObject = star;
            document.body.style.cursor = 'pointer';

            // Show Tooltip HUD
            tooltip.innerText = star.star_name || star.catalog_label;
            tooltip.style.left = `${event.clientX}px`;
            tooltip.style.top = `${event.clientY}px`;
            tooltip.classList.remove('hidden');
        } else {
            hoveredObject = null;
            document.body.style.cursor = 'default';
            tooltip.classList.add('hidden');
        }
    }
}

// ----------------------------------------------------
// UI HUD HANDLERS & FILTERS BINDING
// ----------------------------------------------------
function initUIEventListeners() {
    
    // 1. Star search bar instant indexing
    const searchInput = document.getElementById('star-search');
    const clearBtn = document.getElementById('search-clear-btn');
    const dropdown = document.getElementById('search-results-dropdown');
    
    const famousStarsList = ["Sirius", "Proxima Centauri", "Alpha Centauri", "Vega", "Altair", "Fomalhaut", "Arcturus", "Capella"];
    
    function renderDropdownList(matches, isFamousMode) {
        if (matches.length > 0) {
            dropdown.innerHTML = isFamousMode ? '<div class="search-item" style="color:#00c6ff; font-size: 0.8em; text-transform: uppercase; cursor:default;">Famous Stars</div>' : '';
            matches.forEach(match => {
                const item = document.createElement('div');
                item.className = 'search-item';
                item.innerHTML = `
                    <span>${match.star_name || match.catalog_label}</span>
                    <span class="item-type">${match.rough_star_type} (${match.distance_ly.toFixed(1)} Ly)</span>
                `;
                item.addEventListener('click', () => {
                    selectStar(match);
                    triggerFlyTo(match);
                    dropdown.classList.add('hidden');
                    searchInput.value = match.star_name || match.catalog_label;
                });
                dropdown.appendChild(item);
            });
            dropdown.classList.remove('hidden');
        } else {
            dropdown.innerHTML = '<div class="search-item" style="cursor:default;color:#5e697e;">No stars found</div>';
            dropdown.classList.remove('hidden');
        }
    }

    function processSearch(query) {
        if (!query) {
            clearBtn.classList.add('hidden');
            let matches = starData.filter(star => star.star_name && famousStarsList.includes(star.star_name)).slice(0, 10);
            renderDropdownList(matches, true);
            return;
        }
        
        clearBtn.classList.remove('hidden');
        
        // Find matching star names or catalog IDs
        let matches = starData.filter(star => {
            const nameMatch = star.star_name && star.star_name.toLowerCase().includes(query);
            const labelMatch = star.catalog_label.toLowerCase().includes(query);
            return nameMatch || labelMatch;
        }).slice(0, 10);
        
        // Inject the Sun (Sol) if query matches
        if ("sun".includes(query) || "sol".includes(query) || "solar system".includes(query)) {
            const sunMatch = {
                star_name: "Sun (Sol)",
                catalog_label: "Solar System Center",
                rough_star_type: "Yellow Dwarf",
                distance_ly: 0.0,
                distance_pc: 0.0,
                phot_g_mean_mag: 4.83,
                absolute_g_mag: 4.83,
                bp_rp: 0.82,
                x_ly: 0.0,
                y_ly: 0.0,
                z_ly: 0.0
            };
            matches.unshift(sunMatch);
            if (matches.length > 10) matches.pop();
        }
        
        renderDropdownList(matches, false);
    }

    searchInput.addEventListener('input', (e) => {
        processSearch(e.target.value.toLowerCase().trim());
    });

    searchInput.addEventListener('focus', (e) => {
        processSearch(e.target.value.toLowerCase().trim());
    });

    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.classList.add('hidden');
        dropdown.classList.add('hidden');
    });

    // Hide search dropdown if clicked outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-wrapper') && !e.target.closest('#search-results-dropdown')) {
            dropdown.classList.add('hidden');
        }
    });

    // 2. Distance slider
    const distRange = document.getElementById('distance-range');
    const distValue = document.getElementById('distance-value');
    distRange.addEventListener('input', (e) => {
        maxDistance = parseFloat(e.target.value);
        distValue.innerText = `${maxDistance} Ly`;
        
        // If selected star is filtered out, clear details
        if(selectedStar && selectedStar.distance_ly > maxDistance) {
            clearSelection();
        }
        
        updateGeometry();
    });

    // 3. Stellar class button toggles
    const toggles = document.querySelectorAll('.filter-toggle');
    toggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
            const type = toggle.getAttribute('data-type');
            
            if (activeFilters.has(type)) {
                activeFilters.delete(type);
                toggle.classList.remove('active');
            } else {
                activeFilters.add(type);
                toggle.classList.add('active');
            }
            
            // Drop selected star details if filtered out
            if(selectedStar && selectedStar.rough_star_type === type && !activeFilters.has(type)) {
                clearSelection();
            }

            updateGeometry();
        });
    });

    // All on / All off buttons
    document.getElementById('filter-all-btn').addEventListener('click', () => {
        defaultFilters.forEach(f => activeFilters.add(f));
        toggles.forEach(t => t.classList.add('active'));
        updateGeometry();
    });

    document.getElementById('filter-none-btn').addEventListener('click', () => {
        activeFilters.clear();
        toggles.forEach(t => t.classList.remove('active'));
        clearSelection();
        updateGeometry();
    });

    // 4. Overlays Toggle switches
    document.getElementById('toggle-grid').addEventListener('change', (e) => {
        galacticPlaneGrid.visible = e.target.checked;
    });

    document.getElementById('toggle-rings').addEventListener('change', (e) => {
        distanceRingsGroup.visible = e.target.checked;
        ringLabelsGroup.visible = e.target.checked;
    });

    document.getElementById('toggle-droplines').addEventListener('change', (e) => {
        if(selectedStar && e.target.checked) {
            selectionLine.visible = true;
        } else {
            selectionLine.visible = false;
        }
    });

    document.getElementById('toggle-orbits').addEventListener('change', (e) => {
        outerPlanetsOrbitsGroup.visible = e.target.checked;
        if (planetsGroup) planetsGroup.visible = e.target.checked;
    });

    // 5. Inspector navigation actions
    document.getElementById('inspect-fly-to-btn').addEventListener('click', () => {
        if (selectedStar) {
            triggerFlyTo(selectedStar);
        }
    });

    document.getElementById('inspect-reset-cam-btn').addEventListener('click', () => {
        isAnimatingCamera = true;
        animationProgress = 0;
        controlsTargetPos.set(0, 0, 0); // Sun
        
        // Fly extremely close to the Sun to see planetary orbits (approx 95 AU)
        const direction = new THREE.Vector3(0, 0.5, 1).normalize(); // nice angled downward view
        cameraTargetPos.copy(controlsTargetPos).addScaledVector(direction, 0.0015);
    });

    document.getElementById('inspect-home-btn').addEventListener('click', () => {
        isAnimatingCamera = true;
        animationProgress = 0;
        controlsTargetPos.set(0, 0, 0); // Sun
        cameraTargetPos.set(30, 20, 50); // Default home perspective
    });

    // 6. Keyboard Arrow Keys Zoom Controls (Up/Down)
    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp') {
            zoomCamera(0.92); // Zoom in smoothly
            e.preventDefault(); // Prevent page scrolling
        } else if (e.key === 'ArrowDown') {
            zoomCamera(1.08); // Zoom out smoothly
            e.preventDefault(); // Prevent page scrolling
        }
    });
}

function clearSelection() {
    selectedStar = null;
    selectionLine.visible = false;
    document.getElementById('details-content').classList.add('hidden');
    document.getElementById('details-default-msg').classList.remove('hidden');
}

// Programmatically zooms camera along the target vector
function zoomCamera(factor) {
    const offset = new THREE.Vector3()
        .copy(camera.position)
        .sub(controls.target);
    
    offset.multiplyScalar(factor);
    
    const newDist = offset.length();
    // Enforce OrbitControls boundaries
    if (newDist >= controls.minDistance && newDist <= controls.maxDistance) {
        camera.position.copy(controls.target).add(offset);
        controls.update();
    }
}

// ----------------------------------------------------
// RUNTIME ANIMATION LOOP & RESIZE HANDLERS
// ----------------------------------------------------
function animate() {
    requestAnimationFrame(animate);
    
    // 1. Smooth Camera Fly-to transition calculates frame LERPs
    updateCameraTransition();
    
    const cameraDistToSun = camera.position.length();

    // 2. Dynamic Oort Cloud - sharp fixed size pixels
    if (oortCloudPoints) {
        oortCloudPoints.visible = true;
        // Keep them as tiny dots when zooming in (cap at 2px), and scale down realistically when far away
        const scaledSize = Math.min(2.0, Math.max(0.2, 2.0 * (0.08 / cameraDistToSun)));
        oortCloudPoints.material.size = scaledSize;
    }

    // 3. Dynamic Planetary System — constant thickness, truthfully scaled
    const orbitsToggleChecked = document.getElementById('toggle-orbits') ? document.getElementById('toggle-orbits').checked : true;

    if (outerPlanetsOrbitsGroup) {
        if (cameraDistToSun > 0.15 || !orbitsToggleChecked) {
            outerPlanetsOrbitsGroup.visible = false;
            if (planetsGroup) planetsGroup.visible = false;
        } else {
            outerPlanetsOrbitsGroup.visible = true;
            if (planetsGroup) planetsGroup.visible = true;

            // Simply fully opaque when visible (truthfully scaled 1px lines)
            outerPlanetsOrbitsGroup.children.forEach(line => {
                line.material.opacity = 0.8;
                if (line.children.length > 0) {
                    line.children[0].material.opacity = 0.9;
                }
            });
        }
    }

    // Update planet orbital positions in 3D Space
    if (planets && planets.length > 0 && planetsGroup && planetsGroup.visible) {
        const timeFactor = Date.now() * 0.0001; // Slower, more realistic pace
        planets.forEach(p => {
            const angle = timeFactor * p.speed;
            let x, y, z;
            if (p.eccentric) {
                const r = p.a * (1 - p.e * p.e) / (1 + p.e * Math.cos(angle));
                const xPrime = r * Math.cos(angle);
                const zPrime = r * Math.sin(angle);
                x = xPrime;
                y = -zPrime * Math.sin(p.inclination);
                z = zPrime * Math.cos(p.inclination);
            } else {
                x = Math.cos(angle) * p.radius;
                y = 0;
                z = Math.sin(angle) * p.radius;
            }
            p.mesh.position.set(x, y, z);
        });
    }

    // 4. Dynamic Sun — simple yellow dot
    if (sunSphere) {
        if (cameraDistToSun < 0.079) {
            // "shrink to its original size, so a few bright yellow pixels"
            const sizeFactor = Math.max(3, 8 * (cameraDistToSun / 0.079));
            sunSphere.material.size = sizeFactor;
        } else {
            // "when outside the oort cloud... the sun should appear as all the other stars"
            const sizeFactor = Math.max(1, 8 * (0.079 / cameraDistToSun));
            sunSphere.material.size = sizeFactor;
        }
    }

    // 5. Logarithmic Zoom Scale Bar Needle Positioning
    // Calculate actual camera distance to the active target in light-years
    const activeZoomDist = camera.position.distanceTo(controls.target);
    const dMin = 0.03;  // Inner Oort scale (approx 2,000 AU)
    const dMax = 150.0; // Outer galactic orbit boundary
    
    const logMin = Math.log10(dMin);
    const logMax = Math.log10(dMax);
    const logVal = Math.log10(Math.max(dMin, Math.min(dMax, activeZoomDist)));
    
    const needlePct = ((logVal - logMin) / (logMax - logMin)) * 100;
    const needleNode = document.getElementById('zoom-needle');
    if (needleNode) {
        needleNode.style.bottom = `${needlePct}%`;
        
        // Generate a friendly, scientifically formatted text string
        let needleTextVal = "";
        if (activeZoomDist >= 1.0) {
            needleTextVal = `${activeZoomDist.toFixed(1)} Ly`;
        } else {
            // Convert to Astronomical Units (AU) if inside 1 Light-Year boundary (1 Ly ≈ 63,241 AU)
            const auValue = activeZoomDist * 63241.0;
            if (auValue >= 1000.0) {
                needleTextVal = `${(auValue / 1000.0).toFixed(1)}k AU`;
            } else {
                needleTextVal = `${auValue.toFixed(0)} AU`;
            }
        }
        
        const textSpan = needleNode.querySelector('.needle-text');
        if (textSpan) {
            textSpan.innerText = needleTextVal;
        }
    }
    
    controls.update(); // Dampen rotations
    renderer.render(scene, camera);
}

function onWindowResize() {
    const container = document.getElementById('canvas-container');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}
