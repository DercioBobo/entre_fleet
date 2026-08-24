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

const FTB_DEST_STATUS_CLASS = {
	Pendente: "pending",
	"No Prazo": "ontime",
	Atrasado: "late",
};

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
					placeholder="${this.text(__("Pesquisar por matrícula, tipo, marca, modelo ou condutor..."))}"
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
		$grid.find("[data-action='detalhes']").on("click", (e) => {
			this.open_details_dialog(this.vehicle_by_name($(e.currentTarget).attr("data-vehicle")));
		});
		$grid.find("[data-action='entrega']").on("click", (e) => {
			const $btn = $(e.currentTarget);
			this.open_entrega_dialog(this.vehicle_by_name($btn.attr("data-vehicle")), $btn.attr("data-row"));
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
				v.vehicle_type,
				v.brand,
				v.model,
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
		const isService = state === "on_trip" && vehicle.open_trip.trip_type === "Serviço a Cliente";

		return `
			<div class="trip-card trip-card-${state}">
				<div class="trip-card-top">
					<span class="trip-card-plate">${this.text(vehicle.license_plate || "—")}</span>
					<span class="trip-card-status trip-card-status-${state}">${FTB_STATUS_LABEL[state]}</span>
				</div>
				<div class="trip-card-title">
					${this.text(title)}
					${isService ? `<span class="trip-card-service-badge">${__("Serviço")}</span>` : ""}
				</div>
				<div class="trip-card-type">${this.text(vehicle.vehicle_type || "—")}</div>
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
			const isService = trip.trip_type === "Serviço a Cliente";

			return `
				<div class="trip-card-details">
					<div class="trip-card-detail"><strong>${__("Condutor")}:</strong> ${this.text(
						trip.driver_name || trip.driver || "—"
					)}</div>
					${
						isService
							? `<div class="trip-card-detail"><strong>${__("Cliente")}:</strong> ${this.text(
									trip.customer_name || trip.customer || "—"
							  )}</div>
							<div class="trip-card-detail"><strong>${__("Referência")}:</strong> ${this.text(trip.service_reference || "—")}</div>`
							: ""
					}
					<div class="trip-card-detail"><strong>${__("Saída")}:</strong> ${this.date(trip.departure_datetime)}</div>
					<div class="trip-card-detail"><strong>${__("Odómetro Inicial")}:</strong> ${this.text(trip.odometer_start)} km</div>
					${!isService && trip.route ? `<div class="trip-card-detail"><strong>${__("Rota")}:</strong> ${this.text(trip.route)}</div>` : ""}
					${trip.cargo ? `<div class="trip-card-detail"><strong>${__("Carga")}:</strong> ${this.text(trip.cargo)}</div>` : ""}
					<div class="trip-card-elapsed" data-departure="${trip.departure_datetime}">—</div>
				</div>
				${isService ? this.render_destinations(vehicle, trip) : ""}
				<div class="trip-card-actions">
					<button class="btn btn-sm btn-default trip-card-btn" data-action="detalhes" data-vehicle="${this.text(
						vehicle.name
					)}">${__("Ver Detalhes")}</button>
					<button class="btn btn-sm btn-primary trip-card-btn" data-action="chegada" data-vehicle="${this.text(
						vehicle.name
					)}">${__("Registar Chegada")}</button>
				</div>
			`;
		}

		if (state === "available") {
			return `
				<div class="trip-card-details">
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

	render_destinations(vehicle, trip) {
		const destinations = trip.destinations || [];
		if (!destinations.length) return "";

		const rows = destinations
			.map((d) => {
				const statusClass = FTB_DEST_STATUS_CLASS[d.status] || "pending";
				return `
					<div class="trip-dest-row trip-dest-${statusClass}">
						<span class="trip-dest-name">${this.text(d.destination)}</span>
						<span class="trip-dest-eta">${d.eta ? this.date(d.eta) : "—"}</span>
						<span class="trip-dest-status trip-dest-status-${statusClass}">${this.text(d.status || "Pendente")}</span>
						${
							d.actual_delivery_date
								? `<span class="trip-dest-done">${this.date(d.actual_delivery_date)}</span>`
								: `<button type="button" class="trip-dest-btn" data-action="entrega" data-vehicle="${this.text(
										vehicle.name
								  )}" data-row="${this.text(d.name)}">${__("Registar Entrega")}</button>`
						}
					</div>
				`;
			})
			.join("");

		return `<div class="trip-card-destinations">${rows}</div>`;
	}

	update_timers() {
		this.$container.find(".trip-card-elapsed").each((_, el) => {
			const $el = $(el);
			const departure = $el.attr("data-departure");
			$el.text(this.format_elapsed(departure));
		});
	}

	// Data de Saída only carries a date (no time), so elapsed time is counted
	// in whole days since departure rather than a precise hh:mm countdown.
	format_elapsed(departureStr) {
		if (!departureStr) return "—";
		const start = frappe.datetime.str_to_obj(departureStr);
		const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
		const today = new Date();
		const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
		const days = Math.round((todayDay - startDay) / 86400000);

		if (days <= 0) return __("Em curso desde hoje");
		if (days === 1) return __("Em curso há 1 dia");
		return __("Em curso há {0} dias", [days]);
	}

	// ---- dialogs -------------------------------------------------------

	requires_cargo(vehicle) {
		return !!vehicle.vehicle_type && vehicle.vehicle_type !== "Administrativo";
	}

	open_saida_dialog(vehicle) {
		if (!vehicle) return;

		const canServeClient = this.requires_cargo(vehicle);
		let tripType = "Serviço a Cliente";
		let destinationRows = [];
		let rowSeq = 0;

		const fields = [];

		if (canServeClient) {
			fields.push(
				{ fieldname: "trip_type_html", fieldtype: "HTML" },
				{ fieldname: "trip_type", fieldtype: "Data", hidden: 1, default: tripType }
			);
		}

		fields.push(
			{
				fieldname: "driver",
				fieldtype: "Link",
				options: "Fleet Driver",
				label: __("Condutor"),
				reqd: 1,
				get_query: () => ({
					query: "entre_fleet.entre_fleet.doctype.fleet_trip_log.fleet_trip_log.driver_query",
				}),
			},
			{ fieldname: "col_top", fieldtype: "Column Break" },
			{
				fieldname: "departure_datetime",
				fieldtype: "Date",
				label: __("Data de Saída"),
				reqd: 1,
				default: frappe.datetime.get_today(),
			},
			{
				fieldname: "odometer_start",
				fieldtype: "Float",
				label: __("Odómetro Inicial (km)"),
				reqd: 1,
				default: vehicle.current_odometer || 0,
			},
			{ fieldname: "col_mid", fieldtype: "Column Break" }
		);

		if (canServeClient) {
			fields.push(
				{
					fieldname: "route",
					fieldtype: "Data",
					label: __("Rota"),
					depends_on: 'eval:doc.trip_type != "Serviço a Cliente"',
				},
				{
					fieldname: "service_section",
					fieldtype: "Section Break",
					label: __("Serviço ao Cliente"),
					depends_on: 'eval:doc.trip_type == "Serviço a Cliente"',
				},
				{
					fieldname: "customer",
					fieldtype: "Link",
					options: "Customer",
					label: __("Cliente"),
					onchange: function () {
						const customerVal = this.get_value();
						const orderVal = dialog.get_value("service_order");
						if (!customerVal || !orderVal) return;
						frappe.db.get_value("Fleet Service Order", orderVal, "customer").then((r) => {
							if (r.message.customer && r.message.customer !== customerVal) {
								// The order on file belongs to a different client —
								// clear it rather than leave a mismatched pairing.
								dialog.set_value("service_order", "");
							}
						});
					},
				},
				{
					fieldname: "loading_location",
					fieldtype: "Data",
					label: __("Local de Carregamento"),
				},
				{ fieldname: "col_service", fieldtype: "Column Break" },
				{
					fieldname: "service_order",
					fieldtype: "Link",
					options: "Fleet Service Order",
					label: __("Pedido de Serviço"),
					get_query: () => {
						const filters = { status: ["in", ["Aberta", "Em Andamento"]] };
						const customerVal = dialog.get_value("customer");
						if (customerVal) filters.customer = customerVal;
						return { filters };
					},
					onchange: function () {
						const val = this.get_value();
						if (!val) {
							dialog.set_df_property("service_order", "description", "");
							return;
						}
						frappe.db.get_value("Fleet Service Order", val, ["customer", "order_date"]).then((r) => {
							if (r.message.customer) dialog.set_value("customer", r.message.customer);
							dialog.set_df_property(
								"service_order",
								"description",
								r.message.order_date
									? __("Data do Pedido: {0}", [frappe.datetime.str_to_user(r.message.order_date)])
									: ""
							);
						});
					},
				},
				{
					fieldname: "loading_date",
					fieldtype: "Date",
					label: __("Data de Carregamento"),
					default: frappe.datetime.get_today(),
				},
				// Destinations get their own full-width section instead of sharing
				// a column with the loading fields — a scrollable add/remove list
				// reads as cramped when it's squeezed next to other inputs.
				{
					fieldname: "destinations_section",
					fieldtype: "Section Break",
					label: __("Destinos"),
					depends_on: 'eval:doc.trip_type == "Serviço a Cliente"',
				},
				// Destinations get a hand-built add/remove list instead of a grid —
				// a Table field's grid needs a `frm` for column context that a plain
				// Dialog doesn't have, and a short dispatch-time destination list
				// doesn't need spreadsheet affordances anyway.
				{
					fieldname: "destinations_html",
					fieldtype: "HTML",
				},
				// Unconditional (no depends_on) so it closes out the Serviço-only
				// section above and always renders — after Local de Carregamento
				// for Serviço trips, right after Rota for Interno ones.
				{
					fieldname: "cargo_section",
					fieldtype: "Section Break",
					label: __("Carga"),
				},
				{
					fieldname: "cargo",
					fieldtype: "Data",
					label: __("Carga"),
					description: vehicle.load_capacity
						? __("Capacidade do veículo: {0} toneladas", [vehicle.load_capacity])
						: "",
				}
			);
		} else {
			fields.push({
				fieldname: "route",
				fieldtype: "Data",
				label: __("Rota"),
			});
		}

		const render_type_toggle = () => {
			const $el = dialog.fields_dict.trip_type_html.$wrapper;
			$el.html(`
				<div class="ftb-type-label">${__("Tipo de Viagem")}</div>
				<div class="ftb-type-toggle">
					<button type="button" class="ftb-type-btn ${
						tripType === "Interno" ? "active" : ""
					}" data-value="Interno">${__("Interno")}</button>
					<button type="button" class="ftb-type-btn ${
						tripType === "Serviço a Cliente" ? "active" : ""
					}" data-value="Serviço a Cliente">${__("Serviço a Cliente")}</button>
				</div>
			`);
			$el.find(".ftb-type-btn").on("click", (e) => {
				tripType = $(e.currentTarget).attr("data-value");
				dialog.set_value("trip_type", tripType);
				render_type_toggle();
			});
		};

		const render_destinations = () => {
			const $el = dialog.fields_dict.destinations_html.$wrapper;
			const rows = destinationRows
				.map(
					(row) => `
						<div class="ftb-dest-item">
							<span class="ftb-dest-dot"></span>
							<span class="ftb-dest-name">${this.text(row.destination)}</span>
							<span class="ftb-dest-eta">${row.eta ? this.date(row.eta) : ""}</span>
							<button type="button" class="ftb-dest-remove" data-row="${row.id}">&times;</button>
						</div>`
				)
				.join("");

			$el.html(`
				<div class="ftb-dest-add">
					<input type="text" class="ftb-dest-input-name" placeholder="${__("Nome do destino")}" />
					<input type="date" class="ftb-dest-input-eta" />
					<button type="button" class="ftb-dest-add-btn">${__("Adicionar")}</button>
				</div>
				<div class="ftb-dest-list">
					${rows || `<div class="ftb-dest-empty">${__("Ainda sem destinos adicionados.")}</div>`}
				</div>
			`);

			const add_row = () => {
				const $name = $el.find(".ftb-dest-input-name");
				const $eta = $el.find(".ftb-dest-input-eta");
				const destination = ($name.val() || "").trim();
				if (!destination) {
					$name.trigger("focus");
					return;
				}
				destinationRows.push({ id: `row-${++rowSeq}`, destination, eta: $eta.val() || "" });
				render_destinations();
			};

			$el.find(".ftb-dest-add-btn").on("click", add_row);
			$el.find(".ftb-dest-input-name, .ftb-dest-input-eta").on("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					add_row();
				}
			});
			$el.find(".ftb-dest-remove").on("click", (e) => {
				const id = $(e.currentTarget).attr("data-row");
				destinationRows = destinationRows.filter((r) => r.id !== id);
				render_destinations();
			});
		};

		const dialog = new frappe.ui.Dialog({
			title: `${__("Registar Saída")} — ${vehicle.license_plate}`,
			fields,
			primary_action_label: __("Confirmar Saída"),
			primary_action: (values) => {
				if (canServeClient && tripType === "Serviço a Cliente") {
					if (!values.service_order) {
						frappe.msgprint(__("Indique o Pedido de Serviço."));
						return;
					}
					if (!destinationRows.length) {
						frappe.msgprint(__("Adicione pelo menos um destino."));
						return;
					}
				}
				dialog.hide();
				frappe.call({
					method: "entre_fleet.entre_fleet.api.start_trip",
					args: {
						vehicle: vehicle.name,
						...values,
						trip_type: canServeClient ? tripType : undefined,
						destinations: destinationRows.map((r) => ({ destination: r.destination, eta: r.eta })),
					},
					freeze: true,
					freeze_message: __("A registar saída..."),
				}).then(() => {
					frappe.show_alert({ message: __("Saída registada."), indicator: "green" });
					this.load_data();
				});
			},
		});

		dialog.$wrapper.addClass("ftb-saida-dialog");

		if (canServeClient) {
			render_type_toggle();
			render_destinations();
		}

		dialog.show();
	}

	open_entrega_dialog(vehicle, destinationRow) {
		if (!vehicle || !vehicle.open_trip) return;
		const destination = (vehicle.open_trip.destinations || []).find((d) => d.name === destinationRow);

		const dialog = new frappe.ui.Dialog({
			title: `${__("Registar Entrega")} — ${destination ? destination.destination : ""}`,
			fields: [
				{
					fieldname: "actual_delivery_date",
					fieldtype: "Date",
					label: __("Data de Entrega"),
					reqd: 1,
					default: frappe.datetime.get_today(),
					description: destination && destination.eta ? __("Previsão: {0}", [this.date(destination.eta)]) : "",
				},
			],
			primary_action_label: __("Confirmar Entrega"),
			primary_action: (values) => {
				dialog.hide();
				frappe.call({
					method: "entre_fleet.entre_fleet.api.mark_trip_destination_delivered",
					args: {
						trip_log: vehicle.open_trip.name,
						destination_row: destinationRow,
						actual_delivery_date: values.actual_delivery_date,
					},
					freeze: true,
					freeze_message: __("A registar entrega..."),
				}).then(() => {
					frappe.show_alert({ message: __("Entrega registada."), indicator: "green" });
					this.load_data();
				});
			},
		});
		dialog.show();
	}

	open_chegada_dialog(vehicle) {
		if (!vehicle || !vehicle.open_trip) return;
		const trip = vehicle.open_trip;

		const fields = [
			{
				fieldname: "arrival_datetime",
				fieldtype: "Date",
				label: __("Data de Chegada"),
				reqd: 1,
				default: frappe.datetime.get_today(),
			},
			{
				fieldname: "odometer_end",
				fieldtype: "Float",
				label: __("Odómetro Final (km)"),
				reqd: 1,
				description: __("Odómetro inicial: {0} km", [trip.odometer_start]),
			},
			{
				fieldname: "route",
				fieldtype: "Data",
				label: __("Rota"),
				default: trip.route,
			},
		];

		if (this.requires_cargo(vehicle)) {
			fields.push({
				fieldname: "cargo",
				fieldtype: "Data",
				label: __("Carga"),
				reqd: 1,
				default: trip.cargo,
			});
		}

		const dialog = new frappe.ui.Dialog({
			title: `${__("Registar Chegada")} — ${vehicle.license_plate}`,
			fields,
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

	open_details_dialog(vehicle) {
		if (!vehicle || !vehicle.open_trip) return;
		const trip = vehicle.open_trip;
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
		facts.push([__("Odómetro Inicial"), `${this.text(trip.odometer_start)} km`]);
		if (trip.cargo) facts.push([__("Carga"), this.text(trip.cargo)]);
		if (vehicle.load_capacity) facts.push([__("Capacidade do Veículo"), `${this.text(vehicle.load_capacity)} t`]);

		const factsHtml = facts
			.map(
				([label, value]) => `
					<div class="ftb-detail-item">
						<div class="ftb-detail-label">${label}</div>
						<div class="ftb-detail-value">${value}</div>
					</div>`
			)
			.join("");

		const dialog = new frappe.ui.Dialog({
			title: `${__("Detalhes da Viagem")} — ${vehicle.license_plate}`,
			fields: [{ fieldname: "details_html", fieldtype: "HTML" }],
		});

		dialog.$wrapper.addClass("ftb-details-dialog");
		dialog.fields_dict.details_html.$wrapper.html(`
			<div class="ftb-detail-header">
				<div>
					<div class="ftb-detail-title">${this.text(title)}</div>
					<div class="ftb-detail-sub">${this.text(vehicle.vehicle_type || "—")}</div>
				</div>
				${isService ? `<span class="trip-card-service-badge">${__("Serviço")}</span>` : ""}
			</div>
			${this.render_timeline(trip)}
			<div class="ftb-detail-grid">${factsHtml}</div>
		`);
		dialog.show();
	}

	// A generalized version of the small on-card stepper: Saída is always
	// reached (the trip exists), each destination lights up once delivered
	// (teal on time, red if late), the first undelivered stop reads as the
	// current leg, and Chegada waits at the end for everything else to close.
	render_timeline(trip) {
		const destinations = trip.destinations || [];
		const nodes = [{ label: __("Saída"), sub: this.date(trip.departure_datetime), state: "done" }];

		if (destinations.length) {
			let activeAssigned = false;
			destinations.forEach((d) => {
				let state;
				if (d.actual_delivery_date) {
					state = d.status === "Atrasado" ? "late" : "done";
				} else if (!activeAssigned) {
					state = "active";
					activeAssigned = true;
				} else {
					state = "pending";
				}
				nodes.push({ label: d.destination, sub: d.eta ? this.date(d.eta) : "", state });
			});
			nodes.push({
				label: __("Chegada"),
				sub: "",
				state: destinations.every((d) => d.actual_delivery_date) ? "active" : "pending",
			});
		} else {
			nodes.push({ label: __("Em Viagem"), sub: "", state: "active" });
			nodes.push({ label: __("Chegada"), sub: "", state: "pending" });
		}

		const items = nodes
			.map((n, i) => {
				const node = `
					<div class="ftb-tl-node ftb-tl-${n.state}">
						<div class="ftb-tl-dot"></div>
						<div class="ftb-tl-label">${this.text(n.label)}</div>
						${n.sub ? `<div class="ftb-tl-sub">${this.text(n.sub)}</div>` : ""}
					</div>`;
				if (i === nodes.length - 1) return node;
				const lineDone = nodes[i + 1].state !== "pending";
				return `${node}<div class="ftb-tl-line ${lineDone ? "ftb-tl-line-done" : ""}"></div>`;
			})
			.join("");

		return `<div class="ftb-timeline">${items}</div>`;
	}

	// ---- formatting ------------------------------------------------------

	text(value) {
		return frappe.utils.escape_html(value === null || value === undefined ? "" : String(value));
	}

	datetime(value) {
		return value ? frappe.datetime.str_to_user(value) : "—";
	}

	date(value) {
		return value ? frappe.datetime.str_to_user(value) : "—";
	}
};
