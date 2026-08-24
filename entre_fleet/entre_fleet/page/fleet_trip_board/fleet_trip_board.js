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
				${this.render_stepper(vehicle, state)}
				${this.render_card_body(vehicle, state)}
			</div>
		`;
	}

	// Service trips with destinations get a 4th step — "A Regressar" is derived
	// from the destinations already being tracked (all delivered = heading
	// back), not a separate field/action. Interno trips (and service trips
	// without destinations) keep the plain 3-step Saída → Em Viagem → Chegada,
	// since there's no signal there for when a return leg starts.
	render_stepper(vehicle, state) {
		const trip = state === "on_trip" ? vehicle.open_trip : null;
		const isService = !!trip && trip.trip_type === "Serviço a Cliente" && (trip.destinations || []).length > 0;
		const allDelivered = isService && trip.destinations.every((d) => d.actual_delivery_date);

		const steps = isService
			? [
					{ label: __("Saída"), state: "done" },
					{ label: __("Em Viagem"), state: allDelivered ? "done" : "active" },
					{ label: __("A Regressar"), state: allDelivered ? "active" : "pending" },
					{ label: __("Chegada"), state: "pending" },
			  ]
			: [
					{ label: __("Saída"), state: state === "on_trip" ? "done" : "pending" },
					{ label: __("Em Viagem"), state: state === "on_trip" ? "active" : "pending" },
					{ label: __("Chegada"), state: "pending" },
			  ];

		const items = steps
			.map((s, i) => {
				const node = `
					<span class="trip-step trip-step-${s.state}">
						<span class="trip-step-dot"></span>${s.label}
					</span>`;
				if (i === 0) return node;
				return `<span class="trip-step-line trip-step-line-${s.state}"></span>${node}`;
			})
			.join("");

		return `
			<div class="trip-stepper" aria-hidden="true">
				${items}
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
							  )}</div>`
							: ""
					}
					<div class="trip-card-detail"><strong>${__("Saída")}:</strong> ${this.date(trip.departure_datetime)}</div>
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
		// Interno is parked for now — every cargo-capable vehicle dispatch is
		// treated as a client service trip. Kept as a named constant (rather
		// than inlined) so reintroducing the toggle later is a small diff.
		const tripType = "Serviço a Cliente";
		let destinationRows = [];
		let rowSeq = 0;
		let editingRowId = null;

		const fields = [];

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
					fieldname: "service_section",
					fieldtype: "Section Break",
					label: __("Serviço ao Cliente"),
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
				{
					fieldname: "delay_reason",
					fieldtype: "Small Text",
					label: __("Motivo do Atraso"),
					description: __("A viatura saiu depois da Data de Carregamento prevista."),
					depends_on: "eval:doc.loading_date && doc.departure_datetime > doc.loading_date",
					mandatory_depends_on: "eval:doc.loading_date && doc.departure_datetime > doc.loading_date",
				},
				// Destinations get their own full-width section instead of sharing
				// a column with the loading fields — a scrollable add/remove list
				// reads as cramped when it's squeezed next to other inputs.
				{
					fieldname: "destinations_section",
					fieldtype: "Section Break",
					label: __("Destinos"),
				},
				// Destinations get a hand-built add/remove list instead of a grid —
				// a Table field's grid needs a `frm` for column context that a plain
				// Dialog doesn't have, and a short dispatch-time destination list
				// doesn't need spreadsheet affordances anyway.
				{
					fieldname: "destinations_html",
					fieldtype: "HTML",
				},
				// Own section so it renders after Local de Carregamento / Destinos,
				// not squeezed next to them.
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
		}

		// Present on every step of a trip's lifecycle (Saída, Chegada, and each
		// Registar Entrega), not just here — always optional, never gated.
		fields.push(
			{ fieldname: "remarks_section", fieldtype: "Section Break", label: __("Observações") },
			{ fieldname: "remarks", fieldtype: "Small Text" }
		);

		const render_destinations = () => {
			const $el = dialog.fields_dict.destinations_html.$wrapper;
			const rows = destinationRows
				.map((row) => {
					if (row.id === editingRowId) {
						return `
							<div class="ftb-dest-item ftb-dest-editing" data-row="${row.id}">
								<input type="text" class="ftb-dest-edit-name" value="${this.text(
									row.destination
								)}" placeholder="${__("Nome do destino")}" />
								<input type="date" class="ftb-dest-edit-eta" value="${row.eta || ""}" />
								<button type="button" class="ftb-dest-save" data-row="${row.id}" title="${__(
							"Guardar"
						)}">&#10003;</button>
								<button type="button" class="ftb-dest-cancel-edit" data-row="${row.id}" title="${__(
							"Cancelar"
						)}">&times;</button>
							</div>`;
					}
					return `
						<div class="ftb-dest-item" draggable="true" data-row="${row.id}">
							<span class="ftb-dest-handle" title="${__("Arrastar para reordenar")}">&#8942;&#8942;</span>
							<span class="ftb-dest-dot"></span>
							<span class="ftb-dest-name">${this.text(row.destination)}</span>
							<span class="ftb-dest-eta">${row.eta ? this.date(row.eta) : ""}</span>
							<button type="button" class="ftb-dest-edit" data-row="${row.id}" title="${__("Editar")}">&#9998;</button>
							<button type="button" class="ftb-dest-remove" data-row="${row.id}">&times;</button>
						</div>`;
				})
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
				${
					destinationRows.length > 1
						? `<div class="ftb-dest-hint">${__("Arraste pelo ⋮⋮ para reordenar a rota.")}</div>`
						: ""
				}
			`);

			const add_row = () => {
				const $name = $el.find(".ftb-dest-input-name");
				const $eta = $el.find(".ftb-dest-input-eta");
				const destination = ($name.val() || "").trim();
				if (!destination) {
					$name.trigger("focus");
					return;
				}
				const eta = $eta.val() || "";
				const newRow = { id: `row-${++rowSeq}`, destination, eta };
				// New stops default into date order (undated ones stay wherever
				// they land — last, effectively) — pure convenience: once added,
				// dragging is what actually decides the route order.
				const insertAt = eta ? destinationRows.findIndex((r) => !r.eta || r.eta > eta) : -1;
				if (insertAt === -1) {
					destinationRows.push(newRow);
				} else {
					destinationRows.splice(insertAt, 0, newRow);
				}
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

			$el.find(".ftb-dest-edit").on("click", (e) => {
				editingRowId = $(e.currentTarget).attr("data-row");
				render_destinations();
			});
			$el.find(".ftb-dest-cancel-edit").on("click", () => {
				editingRowId = null;
				render_destinations();
			});
			$el.find(".ftb-dest-save").on("click", (e) => {
				const $row = $(e.currentTarget).closest(".ftb-dest-item");
				const destination = ($row.find(".ftb-dest-edit-name").val() || "").trim();
				if (!destination) return;
				const row = destinationRows.find((r) => r.id === editingRowId);
				if (row) {
					row.destination = destination;
					row.eta = $row.find(".ftb-dest-edit-eta").val() || "";
				}
				editingRowId = null;
				render_destinations();
			});

			// Drag-to-reorder: manual order always wins once set — this only
			// picks where a *new* stop starts out (see add_row above).
			let dragId = null;
			$el.find(".ftb-dest-item[draggable='true']")
				.on("dragstart", (e) => {
					dragId = $(e.currentTarget).attr("data-row");
					e.currentTarget.classList.add("ftb-dest-dragging");
				})
				.on("dragend", (e) => {
					e.currentTarget.classList.remove("ftb-dest-dragging");
					$el.find(".ftb-dest-item").removeClass("ftb-dest-drop-before ftb-dest-drop-after");
				})
				.on("dragover", (e) => {
					e.preventDefault();
					const $target = $(e.currentTarget);
					if ($target.attr("data-row") === dragId) return;
					const rect = e.currentTarget.getBoundingClientRect();
					const before = e.originalEvent.clientY - rect.top < rect.height / 2;
					$el.find(".ftb-dest-item").removeClass("ftb-dest-drop-before ftb-dest-drop-after");
					$target.addClass(before ? "ftb-dest-drop-before" : "ftb-dest-drop-after");
				})
				.on("drop", (e) => {
					e.preventDefault();
					const targetId = $(e.currentTarget).attr("data-row");
					if (!dragId || targetId === dragId) return;
					const fromIndex = destinationRows.findIndex((r) => r.id === dragId);
					if (fromIndex === -1) return;
					const rect = e.currentTarget.getBoundingClientRect();
					const before = e.originalEvent.clientY - rect.top < rect.height / 2;
					const [moved] = destinationRows.splice(fromIndex, 1);
					let toIndex = destinationRows.findIndex((r) => r.id === targetId);
					destinationRows.splice(before ? toIndex : toIndex + 1, 0, moved);
					dragId = null;
					render_destinations();
				});
		};

		const dialog = new frappe.ui.Dialog({
			title: `${__("Registar Saída")} — ${vehicle.license_plate}`,
			fields,
			primary_action_label: __("Confirmar Saída"),
			primary_action: (values) => {
				if (canServeClient) {
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
				{
					fieldname: "remarks",
					fieldtype: "Small Text",
					label: __("Observações"),
					default: (destination && destination.remarks) || "",
				},
			],
			primary_action_label: __("Confirmar Entrega"),
			primary_action: (values) => {
				if (values.actual_delivery_date < vehicle.open_trip.departure_datetime) {
					frappe.msgprint(
						__("A Data de Entrega não pode ser anterior à Data de Saída ({0}).", [
							this.date(vehicle.open_trip.departure_datetime),
						])
					);
					return;
				}
				dialog.hide();
				frappe.call({
					method: "entre_fleet.entre_fleet.api.mark_trip_destination_delivered",
					args: {
						trip_log: vehicle.open_trip.name,
						destination_row: destinationRow,
						actual_delivery_date: values.actual_delivery_date,
						remarks: values.remarks,
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

		if (trip.trip_type === "Serviço a Cliente") {
			const pending = (trip.destinations || []).filter((d) => !d.actual_delivery_date);
			if (pending.length) {
				frappe.msgprint(
					__("Registe a Entrega de todos os destinos antes de concluir a viagem: {0}.", [
						pending.map((d) => d.destination).join(", "),
					])
				);
				return;
			}
		}

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
		];

		const isService = trip.trip_type === "Serviço a Cliente";
		if (isService) {
			// Every destination is already delivered by the time Registar
			// Chegada is reachable (see the guard above), so this is a real
			// suggestion, not a guess — but it's still a manual call: an
			// on-time delivery can still arrive damaged, for instance.
			const anyLate = (trip.destinations || []).some((d) => d.status === "Atrasado");
			fields.push({
				fieldname: "service_conformity",
				fieldtype: "Select",
				label: __("Conformidade do Serviço"),
				options: "Conforme\nNão Conforme",
				reqd: 1,
				default: anyLate ? "Não Conforme" : "Conforme",
			});
		}

		// Carga was already declared at Saída — no need to ask again on the
		// way back in.
		fields.push({
			fieldname: "remarks",
			fieldtype: "Small Text",
			label: __("Observações"),
			default: trip.remarks || "",
		});

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
			// Once every destination is delivered the truck is presumed to be
			// heading back — derived from delivery data, no separate action.
			nodes.push({
				label: __("A Regressar"),
				sub: "",
				state: destinations.every((d) => d.actual_delivery_date) ? "active" : "pending",
			});
			nodes.push({ label: __("Chegada"), sub: "", state: "pending" });
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
