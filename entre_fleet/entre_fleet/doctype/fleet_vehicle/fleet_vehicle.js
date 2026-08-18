frappe.provide("entre_fleet");

const FV_CONDITION_COLOR = {
	Novo: "green",
	Nova: "green",
	Recauchutado: "teal",
	Usado: "gray",
	Usada: "gray",
	"A Substituir": "red",
};

entre_fleet.render_tyre_battery_schematic = function (frm) {
	entre_fleet.inject_tyre_schematic_style();

	const $wrapper = frm.fields_dict.tyre_battery_schematic.$wrapper;
	const tyres = frm.doc.tyres || [];
	const batteries = frm.doc.batteries || [];

	if (!tyres.length && !batteries.length) {
		$wrapper.html(
			`<p class="fv-schematic-empty-message">${__(
				"Defina o número de eixos e/ou baterias acima para gerar o esquema."
			)}</p>`
		);
		return;
	}

	const axles = [];
	for (let i = 0; i < tyres.length; i += 2) {
		axles.push([tyres[i], tyres[i + 1]]);
	}

	const axleSpacing = 62;
	const topPad = 26;
	const width = 180;
	const height = topPad * 2 + Math.max(axles.length - 1, 0) * axleSpacing;

	let svg = "";
	if (axles.length) {
		svg += `<svg viewBox="0 0 ${width} ${height}" class="fv-schematic-svg" role="img" aria-label="${__(
			"Esquema de pneus"
		)}">`;
		svg += `<rect x="${width / 2 - 14}" y="${topPad}" width="28" height="${
			height - topPad * 2
		}" rx="8" class="fv-schematic-chassis" />`;
		axles.forEach((pair, i) => {
			const y = topPad + i * axleSpacing;
			svg += `<line x1="26" y1="${y}" x2="${width - 26}" y2="${y}" class="fv-schematic-axle-bar" />`;
			svg += entre_fleet.render_tyre_rect(frm, pair[0], 6, y - 20);
			svg += entre_fleet.render_tyre_rect(frm, pair[1], width - 36, y - 20);
			svg += `<text x="${width / 2}" y="${y + 4}" class="fv-schematic-axle-label">${i + 1}º</text>`;
		});
		svg += `</svg>`;
	}

	const batteryCards = batteries.length
		? `<div class="fv-schematic-battery-grid">${batteries
				.map((b) => entre_fleet.render_battery_card(frm, b))
				.join("")}</div>`
		: "";

	const legend = entre_fleet.render_condition_legend();

	$wrapper.html(`
		<div class="fv-schematic">
			<div class="fv-schematic-diagram">
				${svg ? `<div class="fv-schematic-svg-col">${svg}</div>` : ""}
				${batteryCards ? `<div class="fv-schematic-battery-col">${batteryCards}</div>` : ""}
			</div>
			${legend}
			<p class="fv-schematic-hint">${__("Clique num pneu ou bateria para editar o estado.")}</p>
		</div>
	`);

	$wrapper.find("[data-fv-fieldname]").on("click", (e) => {
		const $el = $(e.currentTarget);
		entre_fleet.open_schematic_row(frm, $el.attr("data-fv-fieldname"), $el.attr("data-fv-row"));
	});
};

entre_fleet.render_tyre_rect = function (frm, tyre, x, y) {
	if (!tyre) return "";
	const color = FV_CONDITION_COLOR[tyre.condition] || "empty";
	const label = frappe.utils.escape_html(`${tyre.position_label || ""}: ${tyre.condition || __("Sem registo")}`);
	return `
		<g data-fv-fieldname="tyres" data-fv-row="${tyre.name}" class="fv-schematic-tyre-group" tabindex="0">
			<rect x="${x}" y="${y}" width="30" height="40" rx="6" class="fv-schematic-tyre-rect fv-schematic-${color}">
				<title>${label}</title>
			</rect>
		</g>
	`;
};

entre_fleet.render_battery_card = function (frm, battery) {
	const color = FV_CONDITION_COLOR[battery.condition] || "empty";
	return `
		<div class="fv-schematic-battery-card fv-schematic-${color}" data-fv-fieldname="batteries" data-fv-row="${battery.name}" tabindex="0">
			<span class="fv-schematic-battery-icon">&#9889;</span>
			<span class="fv-schematic-battery-label">${frappe.utils.escape_html(battery.position_label || "")}</span>
			<span class="fv-schematic-battery-condition">${frappe.utils.escape_html(battery.condition || __("Sem registo"))}</span>
		</div>
	`;
};

entre_fleet.render_condition_legend = function () {
	const items = [
		[__("Novo/Nova"), "green"],
		[__("Recauchutado"), "teal"],
		[__("Usado/Usada"), "gray"],
		[__("A Substituir"), "red"],
		[__("Sem registo"), "empty"],
	];
	const html = items
		.map(
			([label, color]) => `
				<span class="fv-schematic-legend-item">
					<span class="fv-schematic-legend-swatch fv-schematic-${color}"></span>
					${label}
				</span>
			`
		)
		.join("");
	return `<div class="fv-schematic-legend">${html}</div>`;
};

entre_fleet.open_schematic_row = function (frm, fieldname, rowName) {
	const grid = frm.fields_dict[fieldname] && frm.fields_dict[fieldname].grid;
	if (!grid) return;
	const row = grid.grid_rows.find((r) => r.doc.name === rowName);
	if (!row) return;

	grid.wrapper[0].scrollIntoView({ behavior: "smooth", block: "center" });
	row.toggle_view(true);
};

entre_fleet.inject_tyre_schematic_style = function () {
	if (document.getElementById("fv-tyre-schematic-style")) return;

	const style = document.createElement("style");
	style.id = "fv-tyre-schematic-style";
	style.textContent = `
		.fv-schematic {
			--fv-navy: #0b2436;
			--fv-teal: #1c8c82;
			--fv-amber: #e0a030;
			--fv-red: #c4453a;
			--fv-green: #2e8b57;
			--fv-gray: #8994a1;
			--fv-sand: #f7f5f1;
			--fv-border: #e3e7ea;
			background: var(--fv-sand);
			border: 1px solid var(--fv-border);
			border-radius: 10px;
			padding: 18px 20px;
			margin-bottom: 8px;
		}
		.fv-schematic-empty-message {
			color: var(--fv-gray, #8994a1);
			font-size: 13px;
			margin: 0;
		}
		.fv-schematic-diagram {
			display: flex;
			flex-wrap: wrap;
			align-items: flex-start;
			gap: 28px;
		}
		.fv-schematic-svg-col {
			flex: 0 0 auto;
		}
		.fv-schematic-svg {
			width: 130px;
			display: block;
		}
		.fv-schematic-chassis {
			fill: #fff;
			stroke: var(--fv-border);
			stroke-width: 1;
		}
		.fv-schematic-axle-bar {
			stroke: var(--fv-border);
			stroke-width: 3;
		}
		.fv-schematic-axle-label {
			fill: var(--fv-gray);
			font-size: 9px;
			font-weight: 700;
			text-anchor: middle;
		}
		.fv-schematic-tyre-group {
			cursor: pointer;
			outline: none;
		}
		.fv-schematic-tyre-rect {
			stroke-width: 1;
			transition: opacity 0.12s ease, transform 0.12s ease;
			transform-box: fill-box;
			transform-origin: center;
		}
		.fv-schematic-tyre-group:hover .fv-schematic-tyre-rect,
		.fv-schematic-tyre-group:focus-visible .fv-schematic-tyre-rect {
			opacity: 0.8;
			transform: scale(1.08);
		}
		.fv-schematic-battery-col {
			flex: 1 1 200px;
			min-width: 180px;
		}
		.fv-schematic-battery-grid {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
			gap: 8px;
		}
		.fv-schematic-battery-card {
			display: flex;
			flex-direction: column;
			gap: 2px;
			padding: 8px 10px;
			border-radius: 8px;
			color: #fff;
			cursor: pointer;
			transition: transform 0.12s ease, box-shadow 0.12s ease;
		}
		.fv-schematic-battery-card:hover,
		.fv-schematic-battery-card:focus-visible {
			transform: translateY(-1px);
			box-shadow: 0 3px 10px rgba(11, 36, 54, 0.18);
			outline: none;
		}
		.fv-schematic-battery-icon {
			font-size: 14px;
			line-height: 1;
		}
		.fv-schematic-battery-label {
			font-size: 11px;
			font-weight: 700;
		}
		.fv-schematic-battery-condition {
			font-size: 10px;
			opacity: 0.9;
		}
		.fv-schematic-green {
			fill: var(--fv-green);
			stroke: var(--fv-green);
			background: var(--fv-green);
		}
		.fv-schematic-teal {
			fill: var(--fv-teal);
			stroke: var(--fv-teal);
			background: var(--fv-teal);
		}
		.fv-schematic-gray {
			fill: var(--fv-gray);
			stroke: var(--fv-gray);
			background: var(--fv-gray);
		}
		.fv-schematic-red {
			fill: var(--fv-red);
			stroke: var(--fv-red);
			background: var(--fv-red);
		}
		.fv-schematic-empty {
			fill: #fff;
			stroke: var(--fv-border);
			stroke-dasharray: 3 2;
			background: #fff;
			color: var(--fv-gray);
			border: 1px dashed var(--fv-border);
		}
		.fv-schematic-battery-card.fv-schematic-empty .fv-schematic-battery-label,
		.fv-schematic-battery-card.fv-schematic-empty .fv-schematic-battery-condition {
			color: var(--fv-gray);
		}
		.fv-schematic-legend {
			display: flex;
			flex-wrap: wrap;
			gap: 4px 16px;
			margin-top: 16px;
			padding-top: 12px;
			border-top: 1px solid var(--fv-border);
		}
		.fv-schematic-legend-item {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			font-size: 11px;
			color: var(--fv-navy);
			opacity: 0.75;
		}
		.fv-schematic-legend-swatch {
			width: 10px;
			height: 10px;
			border-radius: 3px;
			flex: 0 0 auto;
		}
		.fv-schematic-hint {
			margin: 8px 0 0;
			font-size: 11px;
			color: var(--fv-gray);
			font-style: italic;
		}
	`;
	document.head.appendChild(style);
};

frappe.ui.form.on("Fleet Vehicle", {
	refresh(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__("Ver Ficha Completa"), () => {
				frappe.set_route("fleet-vehicle-dossier", frm.doc.name);
			});
		}
		entre_fleet.render_tyre_battery_schematic(frm);
	},
	axle_count(frm) {
		entre_fleet.render_tyre_battery_schematic(frm);
	},
	battery_count(frm) {
		entre_fleet.render_tyre_battery_schematic(frm);
	},
	tyres_add(frm) {
		entre_fleet.render_tyre_battery_schematic(frm);
	},
	tyres_remove(frm) {
		entre_fleet.render_tyre_battery_schematic(frm);
	},
	batteries_add(frm) {
		entre_fleet.render_tyre_battery_schematic(frm);
	},
	batteries_remove(frm) {
		entre_fleet.render_tyre_battery_schematic(frm);
	},
});

frappe.ui.form.on("Fleet Vehicle Tyre", {
	condition(frm) {
		entre_fleet.render_tyre_battery_schematic(frm);
	},
});

frappe.ui.form.on("Fleet Vehicle Battery", {
	condition(frm) {
		entre_fleet.render_tyre_battery_schematic(frm);
	},
});
