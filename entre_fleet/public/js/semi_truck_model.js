import * as THREE from 'three';

const stage = document.querySelector('three-d-stage');
await stage.ready;

/* ---------- materials ---------- */
const M = {
  paint: new THREE.MeshStandardMaterial({ name: 'cab_paint', color: 0x9c2f28, roughness: 0.34, metalness: 0.25 }),
  paintDark: new THREE.MeshStandardMaterial({ name: 'lower_paint', color: 0x5a1c19, roughness: 0.45, metalness: 0.2 }),
  chrome: new THREE.MeshStandardMaterial({ name: 'chrome', color: 0xdde2e7, roughness: 0.16, metalness: 0.4 }),
  trim: new THREE.MeshStandardMaterial({ name: 'dark_trim', color: 0x30343a, roughness: 0.62, metalness: 0.18 }),
  tire: new THREE.MeshStandardMaterial({ name: 'tire_rubber', color: 0x1a1b1d, roughness: 0.92, metalness: 0.0 }),
  glass: new THREE.MeshStandardMaterial({ name: 'glass', color: 0xa6bfcd, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.45 }),
  amber: new THREE.MeshStandardMaterial({ name: 'marker_amber', color: 0xd9891f, roughness: 0.35, metalness: 0.1, emissive: 0x3a2205 }),
  red: new THREE.MeshStandardMaterial({ name: 'lamp_red', color: 0xa8231d, roughness: 0.35, metalness: 0.1 }),
};

const truck = new THREE.Group();
truck.name = 'semi_tractor';

/* ---------- helpers ---------- */
function box(name, [w, h, d], [x, y, z], mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.name = name;
  m.position.set(x, y, z);
  truck.add(m);
  return m;
}
function cyl(name, r1, r2, h, [x, y, z], mat, seg = 36, opts = {}) {
  const g = new THREE.CylinderGeometry(r1, r2, h, seg, 1, !!opts.open, opts.thetaStart || 0, opts.thetaLength ?? Math.PI * 2);
  const m = new THREE.Mesh(g, mat);
  m.name = name;
  m.position.set(x, y, z);
  truck.add(m);
  return m;
}
/** extrude a side profile (array of [x,y]) laterally, centered on z */
function profile(name, pts, depth, mat, bevel = 0.02) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: depth - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3,
  });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  const m = new THREE.Mesh(g, mat);
  m.name = name;
  truck.add(m);
  return m;
}
/** half-cylinder shell used for fenders: axis along z, covering the top */
function fender(name, radius, width, [x, y, z], mat) {
  const m = cyl(name, radius, radius, width, [x, y, z], mat, 40, {
    open: true, thetaStart: Math.PI / 2, thetaLength: Math.PI,
  });
  m.rotation.x = Math.PI / 2;
  m.material = mat;
  m.material.side = THREE.DoubleSide;
  return m;
}

/* ---------- wheels ---------- */
function wheel(name, [x, y, z], R, W) {
  const t = cyl(name + '_tire', R, R, W, [x, y, z], M.tire, 44);
  t.rotation.x = Math.PI / 2;
  const hub = cyl(name + '_wheel', R * 0.52, R * 0.52, W + 0.012, [x, y, z], M.chrome, 32);
  hub.rotation.x = Math.PI / 2;
  const cap = cyl(name + '_hubcap', R * 0.17, R * 0.13, 0.09, [x, y, z], M.chrome, 20);
  cap.rotation.x = Math.PI / 2;
  cap.position.z += Math.sign(z) * (W / 2 + 0.03);
}
const FR = 0.545, FW = 0.40;   // steer tire
const RR = 0.52, RW = 0.33;    // drive tire
const AX_F = 2.35, AX_R1 = -2.40, AX_R2 = -3.60;

wheel('steer_l', [AX_F, FR, 1.03], FR, FW);
wheel('steer_r', [AX_F, FR, -1.03], FR, FW);
for (const [i, ax] of [AX_R1, AX_R2].entries()) {
  for (const s of [1, -1]) {
    wheel(`drive${i + 1}_${s > 0 ? 'l' : 'r'}_in`, [ax, RR, s * 0.52], RR, RW);
    wheel(`drive${i + 1}_${s > 0 ? 'l' : 'r'}_out`, [ax, RR, s * 0.90], RR, RW);
  }
}
// axles + suspension
cyl('front_axle', 0.075, 0.075, 2.1, [AX_F, FR, 0], M.trim, 20).rotation.x = Math.PI / 2;
for (const ax of [AX_R1, AX_R2]) {
  const a = cyl('drive_axle', 0.105, 0.105, 1.9, [ax, RR, 0], M.trim, 20);
  a.rotation.x = Math.PI / 2;
  const d = cyl('differential', 0.30, 0.30, 0.42, [ax, RR, 0], M.trim, 24);
  d.rotation.x = Math.PI / 2;
}
cyl('driveshaft', 0.05, 0.05, 2.2, [-1.4, 0.72, 0], M.trim, 16).rotation.z = Math.PI / 2;

/* ---------- frame ---------- */
for (const s of [1, -1]) {
  box('frame_rail', [7.2, 0.26, 0.11], [-0.45, 0.94, s * 0.46], M.trim);
}
for (const x of [2.9, 1.6, 0.3, -1.1, -2.0, -3.0, -3.9]) {
  box('crossmember', [0.14, 0.18, 0.92], [x, 0.94, 0], M.trim);
}
// fifth wheel
box('fifth_wheel_plate', [1.15, 0.09, 1.05], [-3.0, 1.13, 0], M.trim);
box('fifth_wheel_ramp', [0.55, 0.07, 1.0], [-3.55, 1.05, 0], M.trim).rotation.z = 0.20;
for (const s of [1, -1]) box('fifth_wheel_rib', [1.15, 0.14, 0.1], [-3.0, 1.02, s * 0.4], M.trim);

/* ---------- hood + fenders ---------- */
profile('hood', [
  [1.32, 1.06], [1.32, 1.98], [2.55, 1.92], [3.02, 1.74], [3.18, 1.42], [3.18, 1.08],
], 2.30, M.paint);
fender('front_fender_l', 0.72, 0.50, [AX_F, FR + 0.10, 1.03], M.paint);
fender('front_fender_r', 0.72, 0.50, [AX_F, FR + 0.10, -1.03], M.paint);
box('hood_air_intake_l', [0.55, 0.30, 0.05], [1.75, 1.55, 1.17], M.trim);
box('hood_air_intake_r', [0.55, 0.30, 0.05], [1.75, 1.55, -1.17], M.trim);

// grille
box('grille_shell', [0.10, 0.66, 1.86], [3.20, 1.44, 0], M.chrome);
for (let i = 0; i < 7; i++) {
  box('grille_bar', [0.05, 0.56, 0.10], [3.26, 1.44, -0.72 + i * 0.24], M.chrome);
}
box('grille_recess', [0.06, 0.60, 1.72], [3.17, 1.44, 0], M.trim);
// bumper + lights
box('bumper', [0.22, 0.42, 2.42], [3.34, 0.86, 0], M.chrome);
box('bumper_valance', [0.10, 0.22, 2.20], [3.28, 0.62, 0], M.trim);
for (const s of [1, -1]) {
  const h = cyl('headlight', 0.17, 0.17, 0.10, [3.24, 1.28, s * 0.98], M.chrome, 24);
  h.rotation.z = Math.PI / 2;
  const l = cyl('headlight_lens', 0.14, 0.14, 0.05, [3.31, 1.28, s * 0.98], M.glass, 24);
  l.rotation.z = Math.PI / 2;
  box('fog_lamp', [0.07, 0.14, 0.24], [3.44, 0.86, s * 0.80], M.glass);
  box('turn_signal', [0.06, 0.12, 0.22], [3.22, 1.66, s * 0.95], M.amber);
}

/* ---------- cab ---------- */
profile('cab', [
  [1.32, 1.06], [1.32, 1.98], [1.12, 3.02], [-0.88, 3.06], [-0.88, 1.06],
], 2.44, M.paint);
box('cab_rocker_l', [2.2, 0.34, 0.07], [0.22, 1.14, 1.23], M.paintDark);
box('cab_rocker_r', [2.2, 0.34, 0.07], [0.22, 1.14, -1.23], M.paintDark);

// windshield
box('windshield_recess', [0.05, 1.02, 2.14], [1.25, 2.46, 0], M.trim).rotation.z = -0.19;
const ws = box('windshield', [0.06, 0.94, 2.06], [1.30, 2.46, 0], M.glass);
ws.rotation.z = -0.19;
box('visor', [0.30, 0.05, 2.44], [1.10, 3.10, 0], M.paint).rotation.z = 0.14;

// doors + side glass
for (const s of [1, -1]) {
  box('side_window', [1.28, 0.86, 0.05], [0.42, 2.52, s * 1.245], M.glass);
  box('door_seam', [0.05, 1.66, 0.05], [-0.34, 2.02, s * 1.225], M.trim);
  box('door_handle', [0.20, 0.05, 0.06], [-0.16, 2.02, s * 1.24], M.chrome);
  box('quarter_window', [0.30, 0.55, 0.05], [-0.62, 2.62, s * 1.245], M.glass);
  // mirrors
  const arm = box('mirror_arm', [0.06, 0.06, 0.34], [1.14, 2.70, s * 1.38], M.trim);
  box('mirror_head', [0.09, 0.52, 0.20], [1.14, 2.52, s * 1.56], M.trim);
  box('mirror_glass', [0.03, 0.44, 0.15], [1.20, 2.52, s * 1.56], M.glass);
  // steps
  box('cab_step', [0.52, 0.05, 0.32], [1.02, 0.66, s * 1.16], M.trim);
  box('cab_step', [0.52, 0.05, 0.32], [1.02, 0.94, s * 1.16], M.trim);
}

/* ---------- sleeper + roof fairing ---------- */
profile('sleeper', [
  [-0.86, 1.06], [-0.86, 3.14], [-1.86, 3.14], [-1.98, 2.90], [-1.98, 1.06],
], 2.48, M.paint);
profile('roof_fairing', [
  [-0.42, 3.00], [-0.62, 3.62], [-1.80, 3.66], [-1.96, 3.12], [-1.96, 2.98],
], 2.38, M.paint);
box('sleeper_window', [0.05, 0.44, 0.62], [-2.02, 2.52, 0.72], M.glass);
box('sleeper_skirt_l', [1.1, 0.30, 0.06], [-1.42, 1.14, 1.25], M.paintDark);
box('sleeper_skirt_r', [1.1, 0.30, 0.06], [-1.42, 1.14, -1.25], M.paintDark);
for (let i = 0; i < 5; i++) {
  box('roof_marker', [0.10, 0.07, 0.13], [-0.58, 3.52, -0.62 + i * 0.31], M.amber);
}
// antennas
for (const s of [1, -1]) cyl('antenna', 0.014, 0.010, 1.4, [-0.90, 3.55, s * 1.20], M.trim, 8);

/* ---------- stacks, tanks, rear ---------- */
for (const s of [1, -1]) {
  cyl('exhaust_stack', 0.082, 0.082, 2.55, [-0.72, 2.05, s * 1.30], M.chrome, 24);
  box('stack_clamp', [0.20, 0.09, 0.20], [-0.72, 2.60, s * 1.30], M.chrome);
  const tank = cyl('fuel_tank', 0.34, 0.34, 1.34, [0.62, 0.86, s * 1.14], M.chrome, 32);
  tank.rotation.z = Math.PI / 2;
  box('tank_strap', [0.06, 0.74, 0.72], [0.98, 0.86, s * 1.14], M.trim);
  box('tank_strap', [0.06, 0.74, 0.72], [0.26, 0.86, s * 1.14], M.trim);
  box('tank_step', [1.0, 0.05, 0.34], [0.62, 0.54, s * 1.12], M.trim);
}
box('battery_box', [0.70, 0.42, 0.36], [-1.24, 0.80, 1.10], M.trim);
box('air_dryer', [0.40, 0.36, 0.32], [-1.24, 0.80, -1.10], M.trim);

for (const s of [1, -1]) {
  box('rear_fender', [2.25, 0.06, 0.86], [-3.00, 1.22, s * 0.73], M.paintDark);
  box('rear_fender_lip', [0.06, 0.20, 0.86], [-1.91, 1.13, s * 0.73], M.paintDark);
  box('rear_fender_skirt', [2.25, 0.26, 0.05], [-3.00, 1.09, s * 1.14], M.paintDark);
}
box('mud_flap_l', [0.04, 0.46, 0.50], [-4.05, 0.40, 0.71], M.trim);
box('mud_flap_r', [0.04, 0.46, 0.50], [-4.05, 0.40, -0.71], M.trim);
box('rear_crossbar', [0.16, 0.20, 1.10], [-4.00, 1.02, 0], M.trim);
for (const s of [1, -1]) box('tail_lamp', [0.06, 0.14, 0.22], [-4.08, 1.02, s * 0.42], M.red);
// air lines / gladhands behind sleeper
box('air_line_tower', [0.14, 0.55, 0.44], [-2.20, 1.42, 0], M.trim);
for (const s of [1, -1]) cyl('gladhand', 0.05, 0.05, 0.10, [-2.20, 1.62, s * 0.14], M.chrome, 16).rotation.z = Math.PI / 2;

/* ---------- center & ship ---------- */
truck.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
const bb = new THREE.Box3().setFromObject(truck);
const c = bb.getCenter(new THREE.Vector3());
truck.position.x -= c.x;
truck.position.z -= c.z;
truck.position.y -= bb.min.y;

stage.setObject(truck);

/* ---------- highlight API (window.truck) ----------
   truck.parts()                       -> array of every part name
   truck.highlight('steer_l_tire')     -> glow one part
   truck.highlight(/^drive1_/, {color:'#ffb300', pulse:true})
   truck.clear()                       -> remove all highlights
   truck.onPick(name => …)             -> click a part, get its name
------------------------------------------------------ */
const HL = new Map();
function matches(sel, name) {
  if (sel instanceof RegExp) return sel.test(name);
  if (Array.isArray(sel)) return sel.some((s) => matches(s, name));
  return name === sel || name.includes(sel);
}
function meshes() { const out = []; truck.traverse((o) => { if (o.isMesh) out.push(o); }); return out; }

window.truck = {
  object: truck,
  parts: () => meshes().map((m) => m.name),
  highlight(sel, opts = {}) {
    const color = new THREE.Color(opts.color || '#ffc23d');
    const strength = opts.strength ?? 0.55;
    for (const m of meshes()) {
      if (!matches(sel, m.name) || HL.has(m)) continue;
      const hi = m.material.clone();
      hi.name = m.material.name + '_highlight';
      hi.emissive = color.clone();
      hi.emissiveIntensity = strength;
      if (opts.tint) hi.color = color.clone();
      HL.set(m, { orig: m.material, hi, pulse: !!opts.pulse, base: strength });
      m.material = hi;
    }
    return this;
  },
  clear(sel) {
    for (const [m, rec] of [...HL]) {
      if (sel && !matches(sel, m.name)) continue;
      m.material = rec.orig; rec.hi.dispose(); HL.delete(m);
    }
    return this;
  },
  onPick(cb) {
    const ray = new THREE.Raycaster(), v = new THREE.Vector2();
    const cam = stage._camera, el = stage._renderer.domElement;
    el.addEventListener('click', (e) => {
      const r = el.getBoundingClientRect();
      v.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(v, cam);
      const hit = ray.intersectObjects(meshes(), true)[0];
      if (hit) cb(hit.object.name, hit.object);
    });
    return this;
  },
};

/* ---------- blueprint / draft view ----------
   truck.setStyle('blueprint' | 'solid' | 'ghost')
--------------------------------------------- */
const INK = new THREE.LineBasicMaterial({ name: 'blueprint_ink', color: 0xbcd8f0, transparent: true, opacity: 0.9 });
const PAPER = new THREE.MeshStandardMaterial({ name: 'blueprint_fill', color: 0x123a63, roughness: 1, metalness: 0, flatShading: true, polygonOffset: true, polygonOffsetFactor: 1.5, polygonOffsetUnits: 1 });
const GHOST = new THREE.MeshBasicMaterial({ name: 'lineart_fill', color: 0xffffff, polygonOffset: true, polygonOffsetFactor: 2.5, polygonOffsetUnits: 1.5 });
const GHOST_INK = new THREE.LineBasicMaterial({ name: 'draft_ink', color: 0x0e1114 });

const edgeGroup = new THREE.Group();
edgeGroup.name = 'blueprint_edges';
edgeGroup.visible = false;
for (const m of meshes()) {
  const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 22), INK);
  l.name = m.name + '_edges';
  l.position.copy(m.position); l.rotation.copy(m.rotation); l.scale.copy(m.scale);
  edgeGroup.add(l);
}
edgeGroup.position.copy(truck.position);
stage._scene.add(edgeGroup);

const ORIG_MATS = new Map(meshes().map((m) => [m, m.material]));
const ORIG_BG = stage._scene.background ? stage._scene.background.clone() : null;
let styleNow = 'solid';

window.truck.setStyle = function (style) {
  styleNow = style;
  const bp = style === 'blueprint', gh = style === 'ghost';
  HL.clear();
  for (const [m, orig] of ORIG_MATS) m.material = bp ? PAPER : gh ? GHOST : orig;
  edgeGroup.visible = bp || gh;
  for (const l of edgeGroup.children) l.material = bp ? INK : GHOST_INK;
  if (stage._ground) stage._ground.visible = !bp && !gh;
  const bg = bp ? 0x0d2744 : gh ? 0xffffff : null;
  stage._scene.background = bg === null ? ORIG_BG : new THREE.Color(bg);
  document.documentElement.style.background = bp ? '#0d2744' : gh ? '#ffffff' : '#efece6';
  document.body.dataset.style = style;
  return this;
};
window.truck.style = () => styleNow;

// pulse loop for highlights created with { pulse: true }
(function pulse() {
  const k = 0.5 + 0.5 * Math.sin(performance.now() / 320);
  for (const rec of HL.values()) if (rec.pulse) rec.hi.emissiveIntensity = rec.base * (0.35 + 0.9 * k);
  requestAnimationFrame(pulse);
})();

