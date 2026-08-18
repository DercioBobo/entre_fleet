frappe.provide("entre_fleet");

frappe.pages["fleet-trip-board"].on_page_load = function (wrapper) {
	wrapper.fleet_trip_board = new entre_fleet.FleetTripBoard(wrapper);
};

frappe.pages["fleet-trip-board"].on_page_show = function (wrapper) {
	wrapper.fleet_trip_board && wrapper.fleet_trip_board.load_data();
};

const FTB_STATUS_LABEL = {
	available: __("Disponível"),
	on_trip: __("Em Viagem"),
	unavailable: __("Indisponível"),
};

const FTB_STATE_ORDER = { on_trip: 0, available: 1, unavailable: 2 };

const FTB_FILTERS = [
	["all", __("Todos")],
	["on_trip", __("Em Viagem")],
	["available", __("Disponíveis")],
	["unavailable", __("Indisponíveis")],
];

entre_fleet.FleetTripBoard = class FleetTripBoard {
	constructor(wrapper) {
		this.wrapper = wrapper;

		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Registo de Viagens"),
			single_column: true,
		});

		this.$container = $('<div class="trip-board">').appendTo(this.page.body);
		this.filter_status = "all";
		this.search_term = "";
		this.load_data();

		this.tick_interval = setInterval(() => this.update_timers(), 30 * 1000);
		$(wrapper).on("hide", () => clearInterval(this.tick_interval));
	}

	load_data() {
		this.$container.html(`<p class="trip-board-empty">${__("A carregar veículos...")}</p>`);
		frappe.call({ method: "entre_fleet.entre_fleet.api.get_trip_board" }).then((r) => {
			this.data = r.message || { vehicles: [], drivers: [] };
			this.render_board();
		});
	}

	// ---- rendering ---------------------------------------------------

	render_board() {
		const vehicles = this.data.vehicles || [];

		if (!vehicles.length) {
			this.$container.html(`<p class="trip-board-empty">${__("Nenhum veículo disponível.")}</p>`);
			return;
		}

		this.$container.html(`
			${this.render_toolbar(vehicles)}
			<div class="trip-board-grid"></div>
		`);

		this.$container.find(".trip-board-search").on("input", (e) => {
			this.search_term = e.currentTarget.value;
			this.render_grid();
		});

		this.$container.find("[data-filter]").on("click", (e) => {
			this.filter_status = $(e.currentTarget).attr("data-filter");
			this.$container.find("[data-filter]").removeClass("active");
			$(e.currentTarget).addClass("active");
			this.render_grid();
		});

		this.render_grid();
	}

	render_toolbar(vehicles) {
		const counts = { all: vehicles.length, on_trip: 0, available: 0, unavailable: 0 };
		vehicles.forEach((v) => counts[this.card_state(v)]++);

		const chips = FTB_FILTERS.map(
			([key, label]) => `
				<button
					type="button"
					class="trip-filter-chip trip-filter-chip-${key} ${key === this.filter_status ? "active" : ""}"
					data-filter="${key}"
				>
					${label} <span class="trip-filter-count">${counts[key]}</span>
				</button>
			`
		).join("");

		return `
			<div class="trip-board-toolbar">
				<input
					type="text"
					class="trip-board-search"
					placeholder="${this.text(__("Pesquisar por matrícula, marca, modelo ou condutor..."))}"
					value="${this.text(this.search_term)}"
				/>
				<div class="trip-filter-chips">${chips}</div>
			</div>
		`;
	}

	render_grid() {
		const vehicles = this.filtered_sorted_vehicles();
		const $grid = this.$container.find(".trip-board-grid");

		if (!vehicles.length) {
			$grid.html(`<p class="trip-board-empty">${__("Sem veículos correspondentes.")}</p>`);
			return;
		}

		$grid.html(vehicles.map((v) => this.render_card(v)).join(""));

		$grid.find("[data-action='saida']").on("click", (e) => {
			this.open_saida_dialog(this.vehicle_by_name($(e.currentTarget).attr("data-vehicle")));
		});
		$grid.find("[data-action='chegada']").on("click", (e) => {
			this.open_chegada_dialog(this.vehicle_by_name($(e.currentTarget).attr("data-vehicle")));
		});

		this.update_timers();
	}

	filtered_sorted_vehicles() {
		const vehicles = this.data.vehicles || [];
		const term = (this.search_term || "").trim().toLowerCase();

		const filtered = vehicles.filter((v) => {
			const state = this.card_state(v);
			if (this.filter_status !== "all" && state !== this.filter_status) return false;
			if (!term) return true;

			return [
				v.license_plate,
				v.brand,
				v.model,
				v.assigned_driver_name,
				v.open_trip && v.open_trip.driver_name,
			]
				.filter(Boolean)
				.some((field) => field.toLowerCase().includes(term));
		});

		return filtered.sort((a, b) => {
			const stateDiff = FTB_STATE_ORDER[this.card_state(a)] - FTB_STATE_ORDER[this.card_state(b)];
			if (stateDiff !== 0) return stateDiff;
			return (a.license_plate || "").localeCompare(b.license_plate || "");
		});
	}

	vehicle_by_name(name) {
		return (this.data.vehicles || []).find((v) => v.name === name);
	}

	card_state(vehicle) {
		if (vehicle.open_trip) return "on_trip";
		if (vehicle.status === "Activo") return "available";
		return "unavailable";
	}

	render_card(vehicle) {
		const state = this.card_state(vehicle);
		const title = [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || __("Sem identificação");

		return `
			<div class="trip-card trip-card-${state}">
				<div class="trip-card-top">
					<span class="trip-card-plate">${this.text(vehicle.license_plate || "—")}</span>
					<span class="trip-card-status trip-card-status-${state}">${FTB_STATUS_LABEL[state]}</span>
				</div>
				<div class="trip-card-title">${this.text(title)}</div>
				${this.render_stepper(state)}
				${this.render_card_body(vehicle, state)}
			</div>
		`;
	}

	render_stepper(state) {
		const stepClass = (step) => {
			if (state === "on_trip") return step === "saida" ? "done" : step === "trip" ? "active" : "pending";
			if (state === "available") return "pending";
			return "pending";
		};

		return `
			<div class="trip-stepper" aria-hidden="true">
				<span class="trip-step trip-step-${stepClass("saida")}">
					<span class="trip-step-dot"></span>${__("Saída")}
				</span>
				<span class="trip-step-line trip-step-line-${stepClass("trip")}"></span>
				<span class="trip-step trip-step-${stepClass("trip")}">
					<span class="trip-step-dot"></span>${__("Em Viagem")}
				</span>
				<span class="trip-step-line trip-step-line-${stepClass("chegada")}"></span>
				<span class="trip-step trip-step-${stepClass("chegada")}">
					<span class="trip-step-dot"></span>${__("Chegada")}
				</span>
			</div>
		`;
	}

	render_card_body(vehicle, state) {
		if (state === "on_trip") {
			const trip = vehicle.open_trip;
			return `
				<div class="trip-card-details">
					<div class="trip-card-detail"><strong>${__("Condutor")}:</strong> ${this.text(
						trip.driver_name || trip.driver || "—"
					)}</div>
					<div class="trip-card-detail"><strong>${__("Saída")}:</strong> ${this.datetime(trip.departure_datetime)}</div>
					<div class="trip-card-detail"><strong>${__("Odómetro Inicial")}:</strong> ${this.text(trip.odometer_start)} km</div>
					${trip.route_purpose ? `<div class="trip-card-detail"><strong>${__("Rota")}:</strong> ${this.text(trip.route_purpose)}</div>` : ""}
					<div class="trip-card-elapsed" data-departure="${trip.departure_datetime}">—</div>
				</div>
				<button class="btn btn-sm btn-primary trip-card-btn" data-action="chegada" data-vehicle="${this.text(
					vehicle.name
				)}">${__("Registar Chegada")}</button>
			`;
		}

		if (state === "available") {
			return `
				<div class="trip-card-details">
					<div class="trip-card-detail"><strong>${__("Condutor Atribuído")}:</strong> ${this.text(
						vehicle.assigned_driver_name || vehicle.assigned_driver || "—"
					)}</div>
					<div class="trip-card-detail"><strong>${__("Odómetro Actual")}:</strong> ${this.text(vehicle.current_odometer || 0)} km</div>
				</div>
				<button class="btn btn-sm btn-default trip-card-btn" data-action="saida" data-vehicle="${this.text(
					vehicle.name
				)}">${__("Registar Saída")}</button>
			`;
		}

		return `
			<div class="trip-card-details">
				<div class="trip-card-detail trip-card-detail-muted">${this.text(vehicle.status)}</div>
			</div>
		`;
	}

	update_timers() {
		this.$container.find(".trip-card-elapsed").each((_, el) => {
			const $el = $(el);
			const departure = $el.attr("data-departure");
			$el.text(`${__("Em curso há")} ${this.format_elapsed(departure)}`);
		});
	}

	format_elapsed(departureStr) {
		if (!departureStr) return "—";
		const start = frappe.datetime.str_to_obj(departureStr);
		const diffMs = Date.now() - start.getTime();
		if (diffMs < 0) return "0min";

		const totalMinutes = Math.floor(diffMs / 60000);
		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;
		return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
	}

	// ---- dialogs -------------------------------------------------------

	open_saida_dialog(vehicle) {
		if (!vehicle) return;

		const dialog = new frappe.ui.Dialog({
			title: `${__("Registar Saída")} — ${vehicle.license_plate}`,
			fields: [
				{
					fieldname: "driver",
					fieldtype: "Link",
					options: "Fleet Driver",
					label: __("Condutor"),
					reqd: 1,
					default: vehicle.assigned_driver,
				},
				{
					fieldname: "departure_datetime",
					fieldtype: "Datetime",
					label: __("Data/Hora de Saída"),
					reqd: 1,
					default: frappe.datetime.now_datetime(),
				},
				{
					fieldname: "odometer_start",
					fieldtype: "Float",
					label: __("Odómetro Inicial (km)"),
					reqd: 1,
					default: vehicle.current_odometer || 0,
				},
				{
					fieldname: "route_purpose",
					fieldtype: "Small Text",
					label: __("Rota/Propósito"),
				},
			],
			primary_action_label: __("Confirmar Saída"),
			primary_action: (values) => {
				dialog.hide();
				frappe.call({
					method: "entre_fleet.entre_fleet.api.start_trip",
					args: { vehicle: vehicle.name, ...values },
					freeze: true,
					freeze_message: __("A registar saída..."),
				}).then(() => {
					frappe.show_alert({ message: __("Saída registada."), indicator: "green" });
					this.load_data();
				});
			},
		});
		dialog.show();
	}

	open_chegada_dialog(vehicle) {
		if (!vehicle || !vehicle.open_trip) return;
		const trip = vehicle.open_trip;

		const dialog = new frappe.ui.Dialog({
			title: `${__("Registar Chegada")} — ${vehicle.license_plate}`,
			fields: [
				{
					fieldname: "arrival_datetime",
					fieldtype: "Datetime",
					label: __("Data/Hora de Chegada"),
					reqd: 1,
					default: frappe.datetime.now_datetime(),
				},
				{
					fieldname: "odometer_end",
					fieldtype: "Float",
					label: __("Odómetro Final (km)"),
					reqd: 1,
					description: __("Odómetro inicial: {0} km", [trip.odometer_start]),
				},
				{
					fieldname: "fuel_used",
					fieldtype: "Float",
					label: __("Combustível Usado (L)"),
				},
				{
					fieldname: "route_purpose",
					fieldtype: "Small Text",
					label: __("Rota/Propósito"),
					default: trip.route_purpose,
				},
			],
			primary_action_label: __("Confirmar Chegada"),
			primary_action: (values) => {
				if (values.odometer_end <= trip.odometer_start) {
					frappe.msgprint(__("Odómetro Final deve ser maior que o Odómetro Inicial ({0} km).", [trip.odometer_start]));
					return;
				}
				dialog.hide();
				frappe.call({
					method: "entre_fleet.entre_fleet.api.end_trip",
					args: { trip_log: trip.name, ...values },
					freeze: true,
					freeze_message: __("A registar chegada..."),
				}).then(() => {
					frappe.show_alert({ message: __("Chegada registada. Viagem concluída."), indicator: "green" });
					this.load_data();
				});
			},
		});
		dialog.show();
	}

	// ---- formatting ------------------------------------------------------

	text(value) {
		return frappe.utils.escape_html(value === null || value === undefined ? "" : String(value));
	}

	datetime(value) {
		return value ? frappe.datetime.str_to_user(value) : "—";
	}
};
