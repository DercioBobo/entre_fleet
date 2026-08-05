# Prompt: Build the "Entre Fleet" Frappe App

Copy everything below into your IDE's AI assistant (Cursor/Copilot/etc.) to generate the app.

---

I'm building a Frappe/ERPNext app called `entre_fleet` (module label: "Entre Fleet") for fleet management (vehicle control, maintenance, fuel, drivers, dashboards, reports) on a client's ERPNext instance that already has HRMS installed.

## Critical constraints — follow exactly

**1. Fully standalone app — no dependency on HRMS or ERPNext core doctypes.**
Do not extend, link to, or inherit from HRMS's `Vehicle`/`Vehicle Log` or `Employee` — HRMS is out of scope entirely for this app, no exceptions, don't suggest linking to it even if it seems more "proper." Every doctype below is owned entirely by this app with respect to HRMS.

ERPNext core (non-HRMS) is a different story: if linking to ERPNext's `Asset`, `Maintenance Request`/`Maintenance Visit`, `Purchase Invoice`, or similar core doctypes would follow ERPNext best practice better than a standalone field, always suggest it and explain the tradeoff; I will decide whether to accept it.

**2. Naming collision avoidance.**
HRMS already installs a doctype literally named `Vehicle`. All doctype names in this app are prefixed `Fleet ` to guarantee no collision with HRMS, ERPNext core, or any other installed app. Before finalizing, check the target bench for any other name clashes.

**3. DocType technical names: English, ASCII only, strict PascalCase-with-spaces.**
- Doctype `name` fields are English (e.g. `Fleet Vehicle`), never Portuguese, never accented characters — Frappe's module-file resolution breaks on diacritics in the doctype `name`.
- Every word capitalized, matching the Python controller class exactly after `name.replace(" ", "").replace("-", "")`. E.g. `Fleet Vehicle` → `class FleetVehicle(Document)`. Watch out for multi-word names with lowercase connectors (of/and) — capitalize those too if any doctype needs one, to avoid a silent class-name mismatch that causes `bench migrate` to treat the doctype as orphaned and delete it.
- All **field labels** are Portuguese (PT-PT/Mozambican usage) — set directly on each field's `label` property. Field `fieldname`s stay English/snake_case.

**4. Directory structure — verify depth explicitly, don't eyeball it.**
```
entre_fleet/                         <- repo root
  pyproject.toml
  README.md
  entre_fleet/                       <- Python package, ONE level below root
    __init__.py                      <- __version__ = "0.0.1"
    hooks.py
    modules.txt                      <- contains: Entre Fleet
    config/__init__.py
    public/js/, public/css/
    entre_fleet/                     <- Frappe module folder, TWO levels below root
      __init__.py
      doctype/
        <doctype_folder>/            <- snake_case, e.g. fleet_vehicle
          __init__.py
          <doctype>.json
          <doctype>.py
          <doctype>.js                (client script, optional per doctype)
```
After generating files, verify with:
```bash
find "$(pwd)" -iname "hooks.py" -not -path "*/.git/*"        # must be 1 segment below root
find "$(pwd)" -type d -iname "doctype" -not -path "*/.git/*" # must be 2 segments below root
```

**5. pyproject.toml — flit_core, not setuptools.**
```toml
[project]
name = "entre_fleet"
authors = [{ name = "Entretech", email = "info@entretech.co.mz" }]
description = "Gestao de Frotas - Entretech"
requires-python = ">=3.10"
readme = "README.md"
dynamic = ["version"]

[build-system]
requires = ["flit_core >=3.4,<4"]
build-backend = "flit_core.buildapi"

[tool.bench.dev-dependencies]
```
No `package.json`, no `MANIFEST.in` unless a real need arises.

**6. hooks.py asset includes — full `/assets/<app>/...` path, no `.bundle` suffix:**
```python
app_include_css = "/assets/entre_fleet/css/entre_fleet.css"
app_include_js = ["/assets/entre_fleet/js/entre_fleet.js"]
```
Also wire the `Fleet Document Tracker` daily expiry check into `hooks.py` via `scheduler_events`, e.g.:
```python
scheduler_events = {
    "daily": ["entre_fleet.entre_fleet.doctype.fleet_document_tracker.fleet_document_tracker.update_expiry_status"]
}
```

**7. Naming series per doctype** (see list below for which pattern each uses).

**8. Before considering any doctype done, verify:**
```bash
# JSON syntax
python -c "import json, glob; [json.load(open(f, encoding='utf-8')) for f in glob.glob('entre_fleet/**/*.json', recursive=True)]"
# Python syntax
python -m py_compile $(find entre_fleet -name "*.py")
# Class name matches DocType name field exactly
python -c "
import json, glob
for f in glob.glob('entre_fleet/entre_fleet/entre_fleet/doctype/*/*.json'):
    d = json.load(open(f, encoding='utf-8'))
    if d.get('istable'): continue
    expected = d['name'].replace(' ', '').replace('-', '')
    py = f.rsplit('.json',1)[0] + '.py'
    content = open(py, encoding='utf-8').read()
    if f'class {expected}(' not in content:
        print('MISMATCH:', f, '->', expected)
"
# Every doctype belongs to the single "Entre Fleet" module
python -c "
import json, glob
for f in glob.glob('entre_fleet/entre_fleet/entre_fleet/doctype/*/*.json'):
    d = json.load(open(f, encoding='utf-8'))
    if d.get('module') != 'Entre Fleet':
        print('WRONG MODULE:', f, '->', d.get('module'))
"
```

## DocTypes to build

| DocType (name) | Class | Autoname | Notes |
|---|---|---|---|
| `Fleet Vehicle` | `FleetVehicle` | `field:license_plate` | Matricula, marca, modelo, ano, categoria, estado, tipo de combustivel, odometro atual, chassi, motor, condutor atribuido (Link -> Fleet Driver, **read-only, synced from the active Fleet Driver Assignment — see validation logic**), validade seguro/inspecao/licenca (the 3 core documents every vehicle has — see Document Tracker note below), foto, observacoes |
| `Fleet Driver` | `FleetDriver` | `field:license_number` | Nome, nº carta de conducao, categoria da carta, validade, telefone, estado, foto |
| `Fleet Driver Assignment` | `FleetDriverAssignment` | `naming_series:` | Link -> Fleet Vehicle, Link -> Fleet Driver, data inicio, data fim, ativo (checkbox) — history of who drove what, since one vehicle can rotate drivers over shifts |
| `Fleet Trip Log` | `FleetTripLog` | `naming_series:` | Link -> Fleet Vehicle, Link -> Fleet Driver, odometro inicial/final, data/hora saida e chegada, rota/proposito, combustivel usado |
| `Fleet Fuel Log` | `FleetFuelLog` | `naming_series:` | Link -> Fleet Vehicle, Link -> Fleet Driver, litros, preco/litro, custo total (calculado), posto, odometro |
| `Fleet Maintenance Request` | `FleetMaintenanceRequest` | `naming_series:` | Link -> Fleet Vehicle, problema reportado, prioridade, estado, data abertura |
| `Fleet Job Card` | `FleetJobCard` | `naming_series:` | Link -> Fleet Maintenance Request, oficina, pecas usadas (child table -> `Fleet Job Card Item`), custo mao de obra, custo total (calculado), estado, data conclusao |
| `Fleet Job Card Item` | `FleetJobCardItem` | — (child table, `istable: 1`, no autoname) | Peca/item (Data), quantidade, custo unitario, custo total (calculado) — rows of `Fleet Job Card`'s "pecas usadas" |
| `Fleet Document Tracker` | `FleetDocumentTracker` | `naming_series:` | Link -> Fleet Vehicle, tipo de documento, data de validade, estado (Valido/A Expirar/Expirado) — for documents **beyond** the 3 built into `Fleet Vehicle` (seguro/inspecao/licenca), e.g. IPAT, extintor, revisao — feeds a daily scheduled job that flags upcoming expiries |
| `Fleet Fine` | `FleetFine` | `naming_series:` | Link -> Fleet Vehicle, Link -> Fleet Driver, data, valor, motivo, estado (pago/pendente) |

**Naming series — derived from the Portuguese doctype label, no `FRT`/`FROTA` prefix.** Pattern: `<CODE>-.YY.-.##` (2-digit year, running number zero-padded to 2 digits). The `#` count is only a minimum padding width, not a cap — Frappe's counter is a plain integer, so it continues unpadded past 99 (`...-98`, `...-99`, `...-100`, `...-101`) with no truncation or collision risk. Fine as-is for every doctype; widen to `.###` only if you want `RV-26-009` to keep reading as 3 digits once Trip Log/Fuel Log volume regularly passes 100/year — that's a cosmetic call, not a functional one.

| Doctype | Nome em portugues | Naming series |
|---|---|---|
| `Fleet Driver Assignment` | Atribuicao de Motorista | `AT-.YY.-.##` |
| `Fleet Trip Log` | Registo de Viagem | `RV-.YY.-.##` |
| `Fleet Fuel Log` | Registo de Abastecimento | `RA-.YY.-.##` |
| `Fleet Maintenance Request` | Pedido de Manutencao | `PM-.YY.-.##` |
| `Fleet Job Card` | Ordem de Servico | `OS-.YY.-.##` |
| `Fleet Document Tracker` | Controlo de Documentos | `CD-.YY.-.##` |
| `Fleet Fine` | Multa | `MU-.YY.-.##` |

(`Fleet Vehicle` and `Fleet Driver` use `field:` autoname, not a naming series. `Fleet Job Card Item` is a child table, no naming.)

## Validation logic to include
- `Fleet Vehicle.validate()`: warn (msgprint, not blocking) when `insurance_expiry`, `inspection_expiry`, or `license_expiry` is expired or within 30 days.
- `Fleet Driver.validate()`: warn when `license_expiry` is expired.
- `Fleet Fuel Log`: auto-calculate `total_cost` from `litres * price_per_litre` in `validate()`.
- `Fleet Trip Log`: validate `odometer_end > odometer_start`.
- `Fleet Job Card`: auto-calculate `custo_total` from `custo_mao_de_obra + sum(pecas_usadas.custo_total)` in `validate()`.
- `Fleet Driver Assignment.validate()`/`on_update()`: when `ativo` is checked, unset `ativo` (and stamp `data_fim`) on any other assignment for the same `Fleet Vehicle`, then write that driver onto `Fleet Vehicle.condutor_atribuido`. This is the single source of truth for "current driver" — `condutor_atribuido` is never edited directly on `Fleet Vehicle`.
- `Fleet Trip Log` / `Fleet Fuel Log`: validate the submitted odometer reading is not lower than `Fleet Vehicle.odometro_atual`, then update `Fleet Vehicle.odometro_atual` to the new reading on submit — keeps the vehicle's current odometer in sync across both logs instead of drifting.

## Design/UI direction for the workspace and any custom dashboard pages
- Clean, modern, card-based layout. Teal/navy color scheme, minimal gradients.
- Prefer Tailwind utility classes for any custom HTML/portal pages; style panels are welcome for dashboard summary cards — but don't overuse it, keep it restrained.
- Frappe Workspace with Number Cards (active vehicles, expiring documents this month, open maintenance requests, fuel cost this month) + charts (fuel cost trend, maintenance cost per vehicle).

Generate the full app now, doctype by doctype, running the verification commands after each one before moving to the next.
