# Semi tractor 3D viewer — ERPNext integration pack

Files
- `three-d-stage.js`      web component: renderer, studio lighting, orbit controls, auto-framed camera, OBJ/GLB download toolbar. Defines `<three-d-stage>`.
- `semi_truck_model.js`   ES module: builds the tractor (134 named meshes, 8 named materials), hands it to the stage, and exposes the `window.truck` API.
- `viewer.html`           standalone reference page — open it locally to confirm everything works before wiring into ERPNext.

Units: metres, y-up, base resting on y = 0. Overall ~7.4 m long, 2.6 m wide, 3.7 m tall.

---

## 1. Install the assets

Put both JS files in your app's public folder:

    apps/<your_app>/<your_app>/public/js/three-d-stage.js
    apps/<your_app>/<your_app>/public/js/semi_truck_model.js

then `bench build` (or `bench --site <site> clear-cache`). They will be served at:

    /assets/<your_app>/js/three-d-stage.js
    /assets/<your_app>/js/semi_truck_model.js

Note: `semi_truck_model.js` is a **native ES module** and imports `three` by bare specifier.
Do NOT add it to `app_include_js` / the bundler — it must be loaded as
`<script type="module">` on a page that also carries the import map (below).
`three-d-stage.js` is a classic script and must load BEFORE the module.

## 2. Mount it on a page

Works in a Web Page (HTML section), a custom Page/HTML field, or a Portal template.
Paste the `<head>` import map from `viewer.html` verbatim — versions and integrity
hashes belong together — then the markup:

```html
<div id="truck-viewer" style="position:relative;width:100%;height:520px">
  <three-d-stage name="semi-tractor" background="#efece6" autorotate
                 style="display:block;width:100%;height:100%"></three-d-stage>
</div>
<script src="/assets/<your_app>/js/three-d-stage.js"></script>
<script type="module" src="/assets/<your_app>/js/semi_truck_model.js"></script>
```

The stage fills its container, so size `#truck-viewer`, not the component.
Hide the export toolbar for end users with `three-d-stage::part(toolbar){display:none}`
if the component exposes it, or wrap it and `overflow:hidden` the bottom strip.

## 3. Wait for the model, then drive it

`window.truck` appears after the module finishes. Guard for it:

```js
function whenTruckReady(cb) {
  if (window.truck) return cb(window.truck);
  const t = setInterval(() => { if (window.truck) { clearInterval(t); cb(window.truck); } }, 60);
}
```

### API

    truck.parts()                                   -> string[] of every mesh name
    truck.highlight(sel, opts)                      -> glow matching parts
    truck.clear(sel?)                               -> restore original materials
    truck.onPick(name => …)                         -> click a part, get its name
    truck.setStyle('solid'|'blueprint'|'ghost')     -> render style ('ghost' = line art)
    truck.style()                                   -> current style
    truck.object                                    -> the THREE.Group, if you need raw access

`sel` is a string (exact name or substring), a RegExp, or an array of either.
`opts`: `{ color: '#e04a2f', strength: 0.9, tint: true, pulse: true }` — `tint` also
repaints the base colour (best for tyres), `pulse` animates the glow.

Switching style clears active highlights — re-apply after `setStyle`.

### Part names

    steer_l_tire  steer_l_wheel  steer_l_hubcap        (front axle, l/r)
    drive1_l_in_tire  drive1_l_out_tire  drive1_r_…    (first drive axle, inner/outer duals)
    drive2_l_in_tire  …                                (second drive axle)
    front_axle  drive_axle  differential  driveshaft
    frame_rail  crossmember  fifth_wheel_plate
    hood  cab  sleeper  roof_fairing  windshield  side_window
    grille_shell  grille_bar  bumper  headlight  fog_lamp  turn_signal
    exhaust_stack  fuel_tank  battery_box  air_dryer
    rear_fender  mud_flap_l  tail_lamp  mirror_head  roof_marker

Call `truck.parts()` for the exact, complete list.

## 4. Wiring highlights to ERPNext data

Client Script on a Vehicle-like doctype — light every tyre whose pressure is low:

```js
frappe.ui.form.on('Vehicle', {
  refresh(frm) {
    whenTruckReady((truck) => {
      truck.clear();
      (frm.doc.tyre_readings || []).forEach((row) => {
        if (row.pressure_psi < row.min_psi) {
          truck.highlight(row.position + '_tire', { color: '#e04a2f', tint: true, pulse: true });
        }
      });
    });
  }
});
```

Store `position` on the child row as one of the part prefixes above
(`steer_l`, `drive1_r_out`, …) so the field value maps straight to a selector.

Click-to-select, feeding the picked part back into a field:

```js
whenTruckReady((truck) => truck.onPick((name) => {
  frm.set_value('selected_component', name);
  truck.clear(); truck.highlight(name, { color: '#2f7ae0' });
}));
```

Severity palette that reads well on all three styles:
ok `#3f8f5b` · watch `#d99a1f` · fault `#e04a2f` · selected `#2f7ae0`.

## 5. If you only need a static model

Open `viewer.html`, click **Download GLB**, attach the file in ERPNext, and render it
with `<model-viewer src="/files/semi-tractor.glb" camera-controls>`. Part names survive
in the GLB, but `model-viewer` gives you no highlight API — use the pack above if the
page needs to react to data. OBJ + MTL is for Blender/CAD round-trips, not the browser.

## 6. Gotchas

- three.js loads from unpkg via the import map. For an air-gapped site, vendor
  `three.module.js`, `three.core.js`, `OrbitControls.js`, `OBJExporter.js`,
  `GLTFExporter.js` into your app and repoint the map's URLs (drop the integrity
  block if you self-host).
- Only ONE copy of three.js may load on the page; a second copy breaks
  `instanceof` checks silently.
- Load order is strict: import map → `three-d-stage.js` → module.
- The component needs a container with a real height; inside a collapsed
  ERPNext section it will render 0 px tall.
- WebGL strokes are always hairline, so line-art mode can't do variable line weight.
