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
	Pago: "green",
	Concluído: "green",
	"A Expirar": "amber",
	"Em Manutenção": "amber",
	"Em Andamento": "amber",
	Pendente: "amber",
	Aberto: "amber",
	Expirado: "red",
	Inactivo: "gray",
	Abatido: "red",
	Cancelado: "gray",
	Suspenso: "red",
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

		this.vehicle_field = this.page.add_field({
			fieldname: "vehicle",
			label: __("Veículo"),
			fieldtype: "Link",
			options: "Fleet Vehicle",
			change: () => {
				const vehicle = this.vehicle_field.get_value();
				if (vehicle && vehicle !== this.current_vehicle) {
					frappe.set_route("fleet-vehicle-dossier", vehicle);
				}
			},
		});

		this.$container = $('<div class="fleet-dossier">').appendTo(this.page.body);
		this.render_vehicle_index();
		this.load_from_route();
	}

	load_from_route() {
		const vehicle = frappe.get_route()[1];
		if (vehicle && vehicle !== this.current_vehicle) {
			this.vehicle_field.set_value(vehicle);
			this.load_vehicle(vehicle);
		} else if (!vehicle && this.current_vehicle !== null) {
			this.current_vehicle = null;
			this.vehicle_field.set_value("");
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
				<input
					type="text"
					class="dossier-search-input"
					placeholder="${this.text(__("Pesquisar por matrícula, marca, modelo ou condutor..."))}"
				/>
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
					[v.license_plate, v.brand, v.model, v.assigned_driver_name]
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
		const driverLabel = vehicle.assigned_driver
			? this.text(vehicle.assigned_driver_name || vehicle.assigned_driver)
			: __("Sem condutor");

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
				<div class="dossier-card-meta">${driverLabel}</div>
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
		this.$container.empty();
		this.$container.append(this.render_hero(data.vehicle, data.documents));
		this.$container.append(this.render_kpis(data.summary));
		this.$container.append(this.render_assignments_section(data.assignments));
		this.$container.append(this.render_trips_section(data.trips));
		this.$container.append(this.render_fuel_section(data.fuel_logs));
		this.$container.append(this.render_maintenance_section(data.maintenance_requests, data.job_cards));
		this.$container.append(this.render_documents_section(data.documents));
		this.$container.append(this.render_fines_section(data.fines));
	}

	// ---- sections -------------------------------------------------------

	render_hero(vehicle, documents) {
		const builtInChips = documents
			.filter((d) => d.source === "vehicle")
			.map((d) => this.chip(`${d.document_type}: ${this.date(d.expiry_date)}`, STATUS_COLOR[d.status] || "gray"))
			.join("");

		return `
			<div class="dossier-hero">
				<div class="dossier-plate">${this.text(vehicle.license_plate || "—")}</div>
				<div class="dossier-identity">
					<h2>
						${this.text([vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(" "))}
						${this.badge(vehicle.status || __("Sem Estado"), STATUS_COLOR[vehicle.status] || "gray")}
					</h2>
					<div class="dossier-meta-line">
						<strong>${__("Categoria")}:</strong> ${this.text(vehicle.category || "—")}
						&nbsp;·&nbsp;
						<strong>${__("Combustível")}:</strong> ${this.text(vehicle.fuel_type || "—")}
						&nbsp;·&nbsp;
						<strong>${__("Odómetro")}:</strong> ${this.text(vehicle.current_odometer || 0)} km
					</div>
					<div class="dossier-meta-line">
						<strong>${__("Condutor Atribuído")}:</strong>
						${vehicle.assigned_driver ? this.link("Fleet Driver", vehicle.assigned_driver) : "—"}
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
			[
				__("Multas Pendentes"),
				summary.pending_fines_count,
				summary.pending_fines_count ? this.currency(summary.pending_fines_total) : null,
			],
			[__("Documentos a Expirar"), summary.expiring_documents_count, null],
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
			],
			assignments,
			__("Sem histórico de condutores para este veículo.")
		);
		return this.render_section(__("Histórico de Condutores"), body, assignments.length);
	}

	render_trips_section(trips) {
		const body = this.render_table(
			[
				{ label: __("Saída"), render: (r) => this.datetime(r.departure_datetime) },
				{ label: __("Chegada"), render: (r) => this.datetime(r.arrival_datetime) },
				{ label: __("Condutor"), render: (r) => this.link("Fleet Driver", r.driver, r.driver_name) },
				{ label: __("Odómetro"), render: (r) => `${this.text(r.odometer_start)} → ${this.text(r.odometer_end || "—")}` },
				{
					label: __("Km"),
					render: (r) =>
						r.odometer_end && r.odometer_end > r.odometer_start
							? this.text(r.odometer_end - r.odometer_start)
							: "—",
				},
				{ label: __("Combustível Usado"), render: (r) => (r.fuel_used ? `${this.text(r.fuel_used)} L` : "—") },
				{ label: __("Rota/Propósito"), render: (r) => this.text(r.route_purpose) },
			],
			trips,
			__("Sem viagens registadas para este veículo.")
		);
		return this.render_section(__("Viagens"), body, trips.length);
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
			],
			fuel_logs,
			__("Sem abastecimentos registados para este veículo.")
		);
		return this.render_section(__("Abastecimentos"), body, fuel_logs.length);
	}

	render_maintenance_section(maintenance_requests, job_cards) {
		const requestsTable = this.render_table(
			[
				{ label: __("Nº"), render: (r) => this.link("Fleet Maintenance Request", r.name) },
				{ label: __("Data Abertura"), render: (r) => this.date(r.opening_date) },
				{ label: __("Prioridade"), render: (r) => this.badge(r.priority || "—", "gray") },
				{ label: __("Estado"), render: (r) => this.badge(r.status, STATUS_COLOR[r.status] || "gray") },
				{ label: __("Problema Reportado"), render: (r) => this.text(r.reported_issue) },
			],
			maintenance_requests,
			__("Sem pedidos de manutenção para este veículo.")
		);

		const jobCardsTable = this.render_table(
			[
				{ label: __("Nº"), render: (r) => this.link("Fleet Job Card", r.name) },
				{ label: __("Pedido"), render: (r) => this.link("Fleet Maintenance Request", r.maintenance_request) },
				{ label: __("Oficina"), render: (r) => this.text(r.workshop) },
				{ label: __("Custo Mão de Obra"), render: (r) => this.currency(r.labor_cost) },
				{ label: __("Custo Total"), render: (r) => this.currency(r.total_cost) },
				{ label: __("Estado"), render: (r) => this.badge(r.status, STATUS_COLOR[r.status] || "gray") },
				{ label: __("Conclusão"), render: (r) => this.date(r.completion_date) },
			],
			job_cards,
			__("Sem ordens de serviço para este veículo.")
		);

		const body = `
			<h4>${this.text(__("Pedidos de Manutenção"))}</h4>
			${requestsTable}
			<h4>${this.text(__("Ordens de Serviço"))}</h4>
			${jobCardsTable}
		`;
		return this.render_section(__("Manutenção"), body, maintenance_requests.length + job_cards.length);
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

	render_fines_section(fines) {
		const body = this.render_table(
			[
				{ label: __("Data"), render: (r) => this.date(r.date) },
				{ label: __("Condutor"), render: (r) => this.link("Fleet Driver", r.driver, r.driver_name) },
				{ label: __("Valor"), render: (r) => this.currency(r.amount) },
				{ label: __("Motivo"), render: (r) => this.text(r.reason) },
				{ label: __("Estado"), render: (r) => this.badge(r.status, STATUS_COLOR[r.status] || "gray") },
			],
			fines,
			__("Sem multas registadas para este veículo.")
		);
		return this.render_section(__("Multas"), body, fines.length);
	}

	// ---- generic building blocks -----------------------------------------

	render_section(title, innerHtml, count) {
		const countBadge = count != null ? `<span class="dossier-section-count">${count}</span>` : "";
		return `
			<details class="dossier-section" open>
				<summary>${this.text(title)}${countBadge}</summary>
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
