frappe.provide("entre_fleet");

frappe.pages["fleet-vehicle-dossier"].on_page_load = function (wrapper) {
	wrapper.fleet_vehicle_dossier = new entre_fleet.FleetVehicleDossier(wrapper);
};

frappe.pages["fleet-vehicle-dossier"].on_page_show = function (wrapper) {
	wrapper.fleet_vehicle_dossier && wrapper.fleet_vehicle_dossier.load_from_route();
};

const STATUS_COLOR = {
	Activo: "green",
	Válido: "green",
	Concluído: "green",
	Agendado: "green",
	"A Expirar": "amber",
	"Em Manutenção": "amber",
	"Em Andamento": "amber",
	Aberto: "amber",
	"A Vencer": "amber",
	Vencido: "red",
	Expirado: "red",
	Inactivo: "gray",
	Abatido: "red",
	Cancelado: "gray",
	Parado: "red",
	Suspenso: "red",
	Conforme: "green",
	"Não Conforme": "red",
	"No Prazo": "green",
	Atrasado: "red",
};

entre_fleet.FleetVehicleDossier = class FleetVehicleDossier {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.current_vehicle = null;

		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Ficha do Veículo"),
			single_column: true,
		});

		this.$container = $('<div class="fleet-dossier">').appendTo(this.page.body);
		this.render_vehicle_index();
		this.load_from_route();
	}

	load_from_route() {
		const vehicle = frappe.get_route()[1];
		if (vehicle && vehicle !== this.current_vehicle) {
			this.load_vehicle(vehicle);
		} else if (!vehicle && this.current_vehicle !== null) {
			this.current_vehicle = null;
			this.page.set_title(__("Ficha do Veículo"));
			this.render_vehicle_index();
		}
	}

	load_vehicle(vehicle) {
		this.current_vehicle = vehicle;
		this.page.set_title(vehicle);

		frappe
			.call({
				method: "entre_fleet.entre_fleet.api.get_vehicle_dossier",
				args: { vehicle },
				freeze: true,
				freeze_message: __("A carregar ficha do veículo..."),
			})
			.then((r) => {
				if (r.message) this.render(r.message);
			});
	}

	// ---- vehicle index (card grid + search) -------------------------------

	render_vehicle_index() {
		this.$container.html(`
			<div class="dossier-index">
				<div class="dossier-index-toolbar">
					<input
						type="text"
						class="dossier-search-input"
						placeholder="${this.text(__("Pesquisar por matrícula, marca, modelo ou condutor..."))}"
					/>
					<a class="dossier-calendar-link" href="/app/fleet-maintenance-schedule/view/calendar">
						${this.text(__("Calendário de Manutenções"))}
					</a>
				</div>
				<div class="dossier-vehicle-grid">
					<p class="dossier-empty">${this.text(__("A carregar veículos..."))}</p>
				</div>
			</div>
		`);

		const $grid = this.$container.find(".dossier-vehicle-grid");
		const $input = this.$container.find(".dossier-search-input");

		$input.on("input", () => this.filter_and_render_grid($grid, $input.val()));

		if (this.all_vehicles) {
			this.filter_and_render_grid($grid, $input.val());
			return;
		}

		frappe.call({ method: "entre_fleet.entre_fleet.api.list_vehicles" }).then((r) => {
			this.all_vehicles = r.message || [];
			this.filter_and_render_grid($grid, $input.val());
		});
	}

	filter_and_render_grid($grid, term) {
		const vehicles = this.all_vehicles || [];
		term = (term || "").trim().toLowerCase();

		const filtered = !term
			? vehicles
			: vehicles.filter((v) =>
					[v.license_plate, v.brand, v.model, v.vehicle_type]
						.filter(Boolean)
						.some((field) => field.toLowerCase().includes(term))
			  );

		this.render_vehicle_grid($grid, filtered, vehicles.length === 0);
	}

	render_vehicle_grid($grid, vehicles, fleetIsEmpty) {
		if (!vehicles.length) {
			const message = fleetIsEmpty
				? __("Nenhum veículo registado.")
				: __("Sem veículos correspondentes à pesquisa.");
			$grid.html(`<p class="dossier-empty">${this.text(message)}</p>`);
			return;
		}

		$grid.html(vehicles.map((v) => this.render_vehicle_card(v)).join(""));
		$grid.find(".dossier-vehicle-card").on("click", (e) => {
			e.preventDefault();
			frappe.set_route("fleet-vehicle-dossier", $(e.currentTarget).attr("data-vehicle"));
		});
	}

	render_vehicle_card(vehicle) {
		const alert = this.document_alert(vehicle);
		const alertDot = alert ? `<span class="dossier-card-alert dossier-card-alert-${alert}"></span>` : "";
		const title =
			[vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(" ") || __("Sem identificação");

		return `
			<a
				class="dossier-vehicle-card"
				href="/app/fleet-vehicle-dossier/${encodeURIComponent(vehicle.name)}"
				data-vehicle="${this.text(vehicle.name)}"
			>
				${alertDot}
				<div class="dossier-card-plate">${this.text(vehicle.license_plate || "—")}</div>
				<div class="dossier-card-title">${this.text(title)}</div>
				${this.badge(vehicle.status || __("Sem Estado"), STATUS_COLOR[vehicle.status] || "gray")}
				<div class="dossier-card-meta">${this.text(vehicle.category || "—")} · ${this.text(vehicle.fuel_type || "—")}</div>
				<div class="dossier-card-meta">${this.text(vehicle.vehicle_type || "—")}</div>
			</a>
		`;
	}

	document_alert(vehicle) {
		const dates = [vehicle.insurance_expiry, vehicle.inspection_expiry, vehicle.license_expiry].filter(Boolean);
		if (!dates.length) return null;

		const today = frappe.datetime.get_today();
		const in30 = new Date();
		in30.setDate(in30.getDate() + 30);
		const in30Str = in30.toISOString().slice(0, 10);

		let worst = null;
		dates.forEach((d) => {
			if (d < today) worst = "red";
			else if (d <= in30Str && worst !== "red") worst = "amber";
		});
		return worst;
	}

	render(data) {
		this.data = data;
		this.$container.empty();
		this.$container.append(this.render_back_link());
		this.$container.append(this.render_hero(data.vehicle, data.documents, data.schedules[0] || null));
		this.$container.append(this.render_kpis(data.summary));
		this.$container.append(this.render_tyres_section(data.vehicle));
		this.$container.append(this.render_assignments_section(data.assignments));
		this.$container.append(this.render_trips_section(data.trips));
		this.$container.append(this.render_fuel_section(data.fuel_logs));
		this.$container.append(this.render_schedules_section(data.schedules));
		this.$container.append(this.render_maintenance_section(data.maintenance_requests, data.job_cards));
		this.$container.append(this.render_inspections_section(data.inspections));
		this.$container.append(this.render_documents_section(data.documents));

		this.$container.find("[data-action='detalhes']").on("click", (e) => {
			this.open_trip_details_dialog($(e.currentTarget).attr("data-trip"));
		});
	}

	render_back_link() {
		const $link = $(
			`<a class="dossier-back-link" href="/app/fleet-vehicle-dossier">&larr; ${this.text(
				__("Todos os Veículos")
			)}</a>`
		);
		$link.on("click", (e) => {
			e.preventDefault();
			frappe.set_route("fleet-vehicle-dossier");
		});
		return $link;
	}

	// ---- sections -------------------------------------------------------

	render_hero(vehicle, documents, nextSchedule) {
		const builtInChips = documents
			.filter((d) => d.source === "vehicle")
			.map((d) => this.chip(`${d.document_type}: ${this.date(d.expiry_date)}`, STATUS_COLOR[d.status] || "gray"))
			.join("");

		const nextDue =
			[nextSchedule && nextSchedule.next_due_date ? this.date(nextSchedule.next_due_date) : null, nextSchedule && nextSchedule.next_due_km ? `${this.text(nextSchedule.next_due_km)} km` : null]
				.filter(Boolean)
				.join(" · ") || "—";
		const nextMaintenance = nextSchedule
			? `${this.text(nextSchedule.maintenance_type)} — ${nextDue} ${this.badge(
					nextSchedule.status,
					STATUS_COLOR[nextSchedule.status] || "gray"
			  )}`
			: this.text(__("Sem manutenção preventiva agendada"));

		return `
			<div class="dossier-hero">
				<div class="dossier-plate">${this.text(vehicle.license_plate || "—")}</div>
				<div class="dossier-identity">
					<h2>
						${this.text([vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(" "))}
						${this.badge(vehicle.status || __("Sem Estado"), STATUS_COLOR[vehicle.status] || "gray")}
					</h2>
					<div class="dossier-meta-line">
						<strong>${__("Tipo de Viatura")}:</strong> ${this.text(vehicle.vehicle_type || "—")}
						&nbsp;·&nbsp;
						<strong>${__("Categoria")}:</strong> ${this.text(vehicle.category || "—")}
						&nbsp;·&nbsp;
						<strong>${__("Combustível")}:</strong> ${this.text(vehicle.fuel_type || "—")}
						&nbsp;·&nbsp;
						<strong>${__("Odómetro")}:</strong> ${this.text(vehicle.current_odometer || 0)} km
					</div>
					<div class="dossier-meta-line">
						<strong>${__("Próxima Manutenção")}:</strong> ${nextMaintenance}
					</div>
					<div class="dossier-doc-chips">${builtInChips}</div>
				</div>
			</div>
		`;
	}

	render_kpis(summary) {
		const tiles = [
			[__("Viagens"), summary.trip_count, null],
			[__("Km Percorridos"), `${summary.total_km}`, null],
			[__("Custo Combustível"), this.currency(summary.total_fuel_cost), `${summary.total_fuel_litres} L`],
			[__("Custo Manutenção"), this.currency(summary.total_maintenance_cost), null],
			[__("Documentos a Expirar"), summary.expiring_documents_count, null],
			[__("Não Conformidades (Verificações)"), summary.non_conforming_inspections_count, null],
		];

		const tileHtml = tiles
			.map(
				([label, value, sub]) => `
					<div class="dossier-kpi">
						<div class="dossier-kpi-value">${this.text(value)}</div>
						<div class="dossier-kpi-label">${this.text(label)}</div>
						${sub ? `<div class="dossier-kpi-sub">${this.text(sub)}</div>` : ""}
					</div>
				`
			)
			.join("");

		return `<div class="dossier-kpis">${tileHtml}</div>`;
	}

	render_tyres_section(vehicle) {
		const tyres = vehicle.tyres || [];
		const batteries = vehicle.batteries || [];

		if (!tyres.length && !batteries.length) {
			return "";
		}

		return this.render_section(
			__("Pneus e Baterias"),
			this.render_tyre_diagram(tyres, batteries),
			tyres.length + batteries.length
		);
	}

	render_tyre_diagram(tyres, batteries) {
		const axles = this.group_tyres_by_axle(tyres);

		const axleSpacing = 64;
		const topPad = 30;
		const width = 200;
		const height = topPad * 2 + Math.max(axles.length - 1, 0) * axleSpacing;

		let svg = `<svg viewBox="0 0 ${width} ${height}" class="dossier-tyre-svg" role="img" aria-label="${this.text(
			__("Esquema de pneus")
		)}">`;
		if (axles.length) {
			svg += `<rect x="${width / 2 - 12}" y="${topPad}" width="24" height="${
				height - topPad * 2
			}" rx="6" class="dossier-tyre-chassis" />`;
		}
		axles.forEach((axle, i) => {
			const y = topPad + i * axleSpacing;
			svg += `<line x1="30" y1="${y}" x2="${width - 30}" y2="${y}" class="dossier-tyre-axle-bar" />`;
			svg += this.render_tyre_group(axle.left, 10, y - 18, 30, 36);
			svg += this.render_tyre_group(axle.right, width - 40, y - 18, 30, 36);
			svg += `<text x="${width / 2}" y="${y + 4}" class="dossier-tyre-axle-label">${axle.axle_number}</text>`;
		});
		svg += `</svg>`;

		const batteryRow = batteries.length
			? `<div class="dossier-battery-row">${batteries.map((b) => this.render_battery_chip(b)).join("")}</div>`
			: "";

		return `
			<div class="dossier-tyre-diagram">
				${tyres.length ? svg : ""}
				${batteryRow}
				${this.render_condition_legend()}
			</div>
		`;
	}

	group_tyres_by_axle(tyres) {
		const axles = {};
		tyres.forEach((tyre) => {
			const key = tyre.axle_number;
			if (!axles[key]) axles[key] = { axle_number: key, left: [], right: [] };
			axles[key][tyre.side === "Direito" ? "right" : "left"].push(tyre);
		});
		return Object.keys(axles)
			.map((key) => axles[key])
			.sort((a, b) => a.axle_number - b.axle_number);
	}

	render_tyre_group(tyres, x, y, width, height) {
		if (!tyres.length) return this.render_tyre_rect(null, x, y, width, height);
		if (tyres.length === 1) return this.render_tyre_rect(tyres[0], x, y, width, height);

		const gap = 3;
		const rectWidth = (width - gap) / 2;
		return (
			this.render_tyre_rect(tyres[0], x, y, rectWidth, height) +
			this.render_tyre_rect(tyres[1], x + rectWidth + gap, y, rectWidth, height)
		);
	}

	render_tyre_rect(tyre, x, y, width, height) {
		if (!tyre) return "";
		const color = this.condition_color(tyre.condition);
		const rx = Math.min(5, width / 4);
		return `
			<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" class="dossier-tyre-rect dossier-tyre-${color}">
				<title>${this.text(tyre.position_label)}: ${this.text(tyre.condition || __("Sem registo"))}</title>
			</rect>
		`;
	}

	render_battery_chip(battery) {
		const color = this.condition_color(battery.condition);
		const title = `${this.text(battery.position_label)}: ${this.text(battery.condition || __("Sem registo"))}`;
		return `
			<div class="dossier-battery-chip dossier-tyre-${color}" title="${title}">
				${this.text(battery.position_label)}
			</div>
		`;
	}

	render_condition_legend() {
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
					<span class="dossier-legend-item">
						<span class="dossier-legend-swatch dossier-tyre-${color}"></span>
						${this.text(label)}
					</span>
				`
			)
			.join("");
		return `<div class="dossier-legend">${html}</div>`;
	}

	condition_color(condition) {
		const map = {
			Novo: "green",
			Nova: "green",
			Recauchutado: "teal",
			Usado: "gray",
			Usada: "gray",
			"A Substituir": "red",
		};
		return map[condition] || "empty";
	}

	render_assignments_section(assignments) {
		const body = this.render_table(
			[
				{ label: __("Condutor"), render: (r) => this.link("Fleet Driver", r.driver, r.driver_name) },
				{ label: __("Data Início"), render: (r) => this.date(r.start_date) },
				{ label: __("Data Fim"), render: (r) => this.date(r.end_date) },
				{
					label: __("Estado"),
					render: (r) => (r.active ? this.badge(__("Activo"), "green") : this.badge(__("Inactivo"), "gray")),
				},
				{ label: __("Doc."), render: (r) => this.docstatus_badge(r.docstatus) },
			],
			assignments,
			__("Sem histórico de condutores para este veículo.")
		);
		return this.render_section(__("Histórico de Condutores"), body, assignments.length);
	}

	render_trips_section(trips) {
		const body = this.render_table(
			[
				{ label: __("Saída"), render: (r) => this.date(r.departure_datetime) },
				{ label: __("Chegada"), render: (r) => this.date(r.arrival_datetime) },
				{ label: __("Condutor"), render: (r) => this.link("Fleet Driver", r.driver, r.driver_name) },
				{ label: __("Odómetro"), render: (r) => `${this.text(r.odometer_start)} → ${this.text(r.odometer_end || "—")}` },
				{
					label: __("Km"),
					render: (r) =>
						r.odometer_end && r.odometer_end > r.odometer_start
							? this.text(r.odometer_end - r.odometer_start)
							: "—",
				},
				{
					label: __("Combustível Estimado"),
					render: (r) =>
						r.estimated_fuel_used
							? `${this.text(Math.round(r.estimated_fuel_used * 100) / 100)} L (${this.currency(r.estimated_fuel_cost)})`
							: "—",
				},
				{
					label: __("Cliente / Rota"),
					render: (r) =>
						r.trip_type === "Serviço a Cliente"
							? `${this.link("Fleet Service Order", r.service_order, r.customer_name || r.customer)} ${
									r.service_reference ? `<br><span class="dossier-meta-line">${this.text(r.service_reference)}</span>` : ""
							  }`
							: this.text(r.route),
				},
				{ label: __("Carga"), render: (r) => this.text(r.cargo) },
				{
					label: __("Destinos"),
					render: (r) =>
						(r.destinations || [])
							.map(
								(d) =>
									`${this.badge(d.destination, STATUS_COLOR[d.status] || "gray")}`
							)
							.join(" ") || "—",
				},
				{
					label: __("Conformidade"),
					render: (r) =>
						r.service_conformity ? this.badge(r.service_conformity, STATUS_COLOR[r.service_conformity] || "gray") : "—",
				},
				{ label: __("Doc."), render: (r) => this.docstatus_badge(r.docstatus) },
				{
					label: "",
					render: (r) =>
						`<button type="button" class="btn btn-xs btn-default" data-action="detalhes" data-trip="${this.text(
							r.name
						)}">${__("Ver Detalhes")}</button>`,
				},
			],
			trips,
			__("Sem viagens registadas para este veículo.")
		);
		return this.render_section(__("Viagens"), body, trips.length);
	}

	open_trip_details_dialog(tripName) {
		const trip = (this.data.trips || []).find((t) => t.name === tripName);
		if (!trip) return;
		const vehicle = this.data.vehicle || {};
		const isService = trip.trip_type === "Serviço a Cliente";
		const title = [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || __("Sem identificação");

		const facts = [];
		facts.push([__("Condutor"), this.text(trip.driver_name || trip.driver || "—")]);
		if (isService) {
			facts.push([__("Cliente"), this.text(trip.customer_name || trip.customer || "—")]);
			facts.push([__("Pedido de Serviço"), this.text(trip.service_reference || trip.service_order || "—")]);
			facts.push([__("Local de Carregamento"), this.text(trip.loading_location || "—")]);
			facts.push([__("Data de Carregamento"), this.date(trip.loading_date)]);
		} else if (trip.route) {
			facts.push([__("Rota"), this.text(trip.route)]);
		}
		facts.push([
			__("Odómetro"),
			`${this.text(trip.odometer_start)} → ${this.text(trip.odometer_end || "—")} km`,
		]);
		if (trip.odometer_end && trip.odometer_end > trip.odometer_start) {
			facts.push([__("Distância"), `${this.text(trip.odometer_end - trip.odometer_start)} km`]);
		}
		if (trip.cargo) facts.push([__("Carga"), this.text(trip.cargo)]);
		if (vehicle.load_capacity) facts.push([__("Capacidade do Veículo"), `${this.text(vehicle.load_capacity)} t`]);
		if (trip.estimated_fuel_used) {
			facts.push([
				__("Combustível Estimado"),
				`${this.text(Math.round(trip.estimated_fuel_used * 100) / 100)} L (${this.currency(trip.estimated_fuel_cost)})`,
			]);
		}
		if (trip.service_conformity) facts.push([__("Conformidade"), this.text(trip.service_conformity)]);

		const factsHtml = facts
			.map(
				([label, value]) => `
					<div class="efd-detail-item">
						<div class="efd-detail-label">${label}</div>
						<div class="efd-detail-value">${value}</div>
					</div>`
			)
			.join("");

		const dialog = new frappe.ui.Dialog({
			title: `${__("Detalhes da Viagem")} — ${vehicle.license_plate || ""}`,
			fields: [{ fieldname: "details_html", fieldtype: "HTML" }],
		});

		dialog.$wrapper.addClass("efd-details-dialog");
		dialog.fields_dict.details_html.$wrapper.html(`
			<div class="efd-detail-header">
				<div>
					<div class="efd-detail-title">${this.text(title)}</div>
					<div class="efd-detail-sub">${this.text(vehicle.vehicle_type || "—")}</div>
				</div>
				${isService ? this.badge(__("Serviço"), "gray") : ""}
			</div>
			${this.render_trip_timeline(trip)}
			<div class="efd-detail-grid">${factsHtml}</div>
		`);
		dialog.show();
	}

	// Same dot-and-line timeline as the Trip Board's "Ver Detalhes", but a
	// closed trip's Chegada is definitively "done" (with its real date) —
	// and a destination left undelivered on a closed trip reads as stalled
	// (plain pending), not "active", since the trip isn't still moving.
	render_trip_timeline(trip) {
		const destinations = trip.destinations || [];
		const arrived = !!trip.arrival_datetime;
		const nodes = [{ label: __("Saída"), sub: this.date(trip.departure_datetime), state: "done" }];

		if (destinations.length) {
			let activeAssigned = false;
			destinations.forEach((d) => {
				let state;
				if (d.actual_delivery_date) {
					state = d.status === "Atrasado" ? "late" : "done";
				} else if (!activeAssigned && !arrived) {
					state = "active";
					activeAssigned = true;
				} else {
					state = "pending";
				}
				nodes.push({ label: d.destination, sub: d.eta ? this.date(d.eta) : "", state });
			});
			// A closed trip's return leg definitely happened, delivered or not;
			// an open one is "returning" once every destination is delivered.
			nodes.push({
				label: __("A Regressar"),
				sub: "",
				state: arrived ? "done" : destinations.every((d) => d.actual_delivery_date) ? "active" : "pending",
			});
			nodes.push({
				label: __("Chegada"),
				sub: arrived ? this.date(trip.arrival_datetime) : "",
				state: arrived ? "done" : "pending",
			});
		} else {
			nodes.push({ label: __("Em Viagem"), sub: "", state: arrived ? "done" : "active" });
			nodes.push({
				label: __("Chegada"),
				sub: arrived ? this.date(trip.arrival_datetime) : "",
				state: arrived ? "done" : "pending",
			});
		}

		const items = nodes
			.map((n, i) => {
				const node = `
					<div class="efd-tl-node efd-tl-${n.state}">
						<div class="efd-tl-dot"></div>
						<div class="efd-tl-label">${this.text(n.label)}</div>
						${n.sub ? `<div class="efd-tl-sub">${this.text(n.sub)}</div>` : ""}
					</div>`;
				if (i === nodes.length - 1) return node;
				const lineDone = nodes[i + 1].state !== "pending";
				return `${node}<div class="efd-tl-line ${lineDone ? "efd-tl-line-done" : ""}"></div>`;
			})
			.join("");

		return `<div class="efd-timeline">${items}</div>`;
	}

	render_fuel_section(fuel_logs) {
		const body = this.render_table(
			[
				{ label: __("Data"), render: (r) => this.date(r.creation) },
				{ label: __("Condutor"), render: (r) => this.link("Fleet Driver", r.driver, r.driver_name) },
				{ label: __("Posto"), render: (r) => this.text(r.fuel_station) },
				{ label: __("Litros"), render: (r) => this.text(r.litres) },
				{ label: __("Preço/Litro"), render: (r) => this.currency(r.price_per_litre) },
				{ label: __("Custo Total"), render: (r) => this.currency(r.total_cost) },
				{ label: __("Odómetro"), render: (r) => this.text(r.odometer) },
				{ label: __("Doc."), render: (r) => this.docstatus_badge(r.docstatus) },
			],
			fuel_logs,
			__("Sem abastecimentos registados para este veículo.")
		);
		return this.render_section(__("Abastecimentos"), body, fuel_logs.length);
	}

	render_schedules_section(schedules) {
		const body = this.render_table(
			[
				{ label: __("Tipo de Manutenção"), render: (r) => this.link("Fleet Maintenance Schedule", r.name, r.maintenance_type) },
				{
					label: __("Intervalo"),
					render: (r) =>
						[r.interval_days ? `${this.text(r.interval_days)} ${__("dias")}` : null, r.interval_km ? `${this.text(r.interval_km)} Km` : null]
							.filter(Boolean)
							.join(" · ") || "—",
				},
				{
					label: __("Última Realização"),
					render: (r) =>
						[r.last_done_date ? this.date(r.last_done_date) : null, r.last_done_odometer ? `${this.text(r.last_done_odometer)} km` : null]
							.filter(Boolean)
							.join(" · ") || "—",
				},
				{
					label: __("Próxima Manutenção"),
					render: (r) =>
						[r.next_due_date ? this.date(r.next_due_date) : null, r.next_due_km ? `${this.text(r.next_due_km)} km` : null]
							.filter(Boolean)
							.join(" · ") || "—",
				},
				{ label: __("Estado"), render: (r) => this.badge(r.status, STATUS_COLOR[r.status] || "gray") },
				{ label: __("Trabalho Planeado"), render: (r) => this.text(r.planned_work) },
			],
			schedules,
			__("Sem manutenção preventiva agendada para este veículo.")
		);
		return this.render_section(__("Manutenção Preventiva Agendada"), body, schedules.length);
	}

	render_inspections_section(inspections) {
		const body = this.render_table(
			[
				{ label: __("Nº"), render: (r) => this.link("Fleet Vehicle Inspection", r.name) },
				{ label: __("Data"), render: (r) => this.date(r.inspection_date) },
				{ label: __("Condutor"), render: (r) => this.link("Fleet Driver", r.driver, r.driver_name) },
				{ label: __("Não Conformidades"), render: (r) => this.text(r.non_conformities_count) },
				{ label: __("Estado Geral"), render: (r) => this.badge(r.overall_status || "—", STATUS_COLOR[r.overall_status] || "gray") },
				{ label: __("Doc."), render: (r) => this.docstatus_badge(r.docstatus) },
			],
			inspections,
			__("Sem verificações de veículo registadas para este veículo.")
		);
		return this.render_section(__("Verificações do Veículo"), body, inspections.length);
	}

	render_maintenance_section(maintenance_requests, job_cards) {
		const requestsBlock = maintenance_requests.length
			? `
				<h4>${this.text(__("Pedidos de Manutenção"))}</h4>
				${this.render_table(
					[
						{ label: __("Nº"), render: (r) => this.link("Fleet Maintenance Request", r.name) },
						{
							label: __("Tipo"),
							render: (r) => this.badge(r.tipo_manutencao || "—", r.tipo_manutencao === "Preventiva" ? "green" : "amber"),
						},
						{ label: __("Data Abertura"), render: (r) => this.date(r.opening_date) },
						{ label: __("Responsável"), render: (r) => this.text(r.responsavel) },
						{ label: __("Prioridade"), render: (r) => this.badge(r.priority || "—", "gray") },
						{ label: __("Estado"), render: (r) => this.badge(r.status, STATUS_COLOR[r.status] || "gray") },
						{ label: __("Problema Reportado"), render: (r) => this.text(r.reported_issue) },
						{ label: __("Peças Necessárias"), render: (r) => this.text(r.required_parts) },
						{ label: __("Observações"), render: (r) => this.text(r.remarks) },
					],
					maintenance_requests,
					""
				)}
			`
			: "";

		const jobCardsBlock = job_cards.length
			? `
				<h4>${this.text(__("Ordens de Serviço"))}</h4>
				${this.render_table(
					[
						{ label: __("Nº"), render: (r) => this.link("Fleet Job Card", r.name) },
						{ label: __("Pedido"), render: (r) => this.link("Fleet Maintenance Request", r.maintenance_request) },
						{ label: __("Problema Reportado"), render: (r) => this.text(r.reported_issue) },
						{ label: __("Oficina"), render: (r) => this.text(r.workshop) },
						{ label: __("Custo Mão de Obra"), render: (r) => this.currency(r.labor_cost) },
						{ label: __("Custo Total"), render: (r) => this.currency(r.total_cost) },
						{ label: __("Estado"), render: (r) => this.badge(r.status, STATUS_COLOR[r.status] || "gray") },
						{ label: __("Conclusão"), render: (r) => this.date(r.completion_date) },
						{ label: __("Doc."), render: (r) => this.docstatus_badge(r.docstatus) },
					],
					job_cards,
					""
				)}
			`
			: "";

		return this.render_section(
			__("Manutenção"),
			`${requestsBlock}${jobCardsBlock}`,
			maintenance_requests.length + job_cards.length
		);
	}

	render_documents_section(documents) {
		const body = this.render_table(
			[
				{ label: __("Tipo de Documento"), render: (r) => this.text(r.document_type) },
				{ label: __("Validade"), render: (r) => this.date(r.expiry_date) },
				{ label: __("Estado"), render: (r) => this.badge(r.status, STATUS_COLOR[r.status] || "gray") },
			],
			documents,
			__("Sem documentos registados para este veículo.")
		);
		return this.render_section(__("Documentos"), body, documents.length);
	}

	// ---- generic building blocks -----------------------------------------

	render_section(title, innerHtml, count) {
		if (!count) return "";
		return `
			<details class="dossier-section" open>
				<summary>${this.text(title)}<span class="dossier-section-count">${count}</span></summary>
				<div class="dossier-section-body">${innerHtml}</div>
			</details>
		`;
	}

	render_table(columns, rows, emptyMessage) {
		if (!rows || !rows.length) {
			return `<p class="dossier-empty">${this.text(emptyMessage)}</p>`;
		}
		const thead = columns.map((c) => `<th>${this.text(c.label)}</th>`).join("");
		const tbody = rows
			.map((row) => `<tr>${columns.map((c) => `<td>${c.render(row)}</td>`).join("")}</tr>`)
			.join("");
		return `
			<div class="dossier-table-wrap">
				<table class="dossier-table">
					<thead><tr>${thead}</tr></thead>
					<tbody>${tbody}</tbody>
				</table>
			</div>
		`;
	}

	// ---- formatting helpers ----------------------------------------------

	text(value) {
		return frappe.utils.escape_html(value === null || value === undefined ? "" : String(value));
	}

	link(doctype, name, label) {
		if (!name) return "—";
		return `<a href="${this.text(frappe.utils.get_form_link(doctype, name))}">${this.text(label || name)}</a>`;
	}

	badge(label, color) {
		return `<span class="dossier-badge dossier-badge-${color}">${this.text(label)}</span>`;
	}

	docstatus_badge(docstatus) {
		const map = {
			0: [__("Rascunho"), "gray"],
			1: [__("Submetido"), "green"],
			2: [__("Cancelado"), "red"],
		};
		const [label, color] = map[docstatus] || map[0];
		return this.badge(label, color);
	}

	chip(label, color) {
		return `<span class="dossier-chip dossier-chip-${color}">${this.text(label)}</span>`;
	}

	currency(value) {
		return frappe.format(value || 0, { fieldtype: "Currency" }, { only_value: true });
	}

	date(value) {
		return value ? frappe.datetime.str_to_user(value) : "—";
	}

	datetime(value) {
		return value ? frappe.datetime.str_to_user(value) : "—";
	}
};
