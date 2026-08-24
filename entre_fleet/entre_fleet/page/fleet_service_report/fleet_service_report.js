frappe.provide("entre_fleet");

frappe.pages["fleet-service-report"].on_page_load = function (wrapper) {
	wrapper.fleet_service_report = new entre_fleet.FleetServiceReport(wrapper);
};

frappe.pages["fleet-service-report"].on_page_show = function (wrapper) {
	wrapper.fleet_service_report && wrapper.fleet_service_report.load_data();
};

const FSR_STATUS_COLOR = {
	Aberta: "gray",
	"Em Andamento": "amber",
	Concluída: "teal",
	"Não Conforme": "red",
	Conforme: "teal",
};

const FSR_FILTERS = [
	["all", __("Todos")],
	["Aberta", __("Aberta")],
	["Em Andamento", __("Em Andamento")],
	["Concluída", __("Concluída")],
	["Não Conforme", __("Não Conforme")],
];

const FSR_DEST_STATUS_CLASS = {
	Pendente: "pending",
	"No Prazo": "ontime",
	Atrasado: "late",
};

entre_fleet.FleetServiceReport = class FleetServiceReport {
	constructor(wrapper) {
		this.wrapper = wrapper;

		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Relatório de Serviços"),
			single_column: true,
		});

		this.$container = $('<div class="fsr-report">').appendTo(this.page.body);
		this.filter_status = "all";
		this.search_term = "";
		this.load_data();
	}

	load_data() {
		this.$container.html(`<p class="fsr-empty">${__("A carregar...")}</p>`);
		frappe.call({ method: "entre_fleet.entre_fleet.api.get_service_report" }).then((r) => {
			this.data = r.message || [];
			this.render_shell();
		});
	}

	// ---- rendering ---------------------------------------------------

	render_shell() {
		this.$container.html(`
			${this.render_toolbar()}
			<div class="fsr-list"></div>
		`);

		this.$container.find(".fsr-search").on("input", (e) => {
			this.search_term = e.currentTarget.value;
			this.render_list();
		});

		this.$container.find("[data-filter]").on("click", (e) => {
			this.filter_status = $(e.currentTarget).attr("data-filter");
			this.$container.find("[data-filter]").removeClass("active");
			$(e.currentTarget).addClass("active");
			this.render_list();
		});

		this.render_list();
	}

	render_toolbar() {
		const counts = { all: this.data.length };
		this.data.forEach((o) => {
			counts[o.status] = (counts[o.status] || 0) + 1;
		});

		const chips = FSR_FILTERS.map(
			([key, label]) => `
				<button
					type="button"
					class="fsr-chip ${key === this.filter_status ? "active" : ""}"
					data-filter="${key}"
				>
					${label} <span class="fsr-chip-count">${counts[key] || 0}</span>
				</button>
			`
		).join("");

		return `
			<div class="fsr-toolbar">
				<input
					type="text"
					class="fsr-search"
					placeholder="${this.text(__("Pesquisar por cliente, pedido ou referência..."))}"
					value="${this.text(this.search_term)}"
				/>
				<div class="fsr-filter-chips">${chips}</div>
			</div>
		`;
	}

	render_list() {
		const orders = this.filtered_sorted_orders();
		const $list = this.$container.find(".fsr-list");

		if (!orders.length) {
			$list.html(`<p class="fsr-empty">${__("Sem pedidos correspondentes.")}</p>`);
			return;
		}

		$list.html(orders.map((o) => this.render_order(o)).join(""));
	}

	filtered_sorted_orders() {
		const term = (this.search_term || "").trim().toLowerCase();
		return (this.data || []).filter((o) => {
			if (this.filter_status !== "all" && o.status !== this.filter_status) return false;
			if (!term) return true;
			return [o.name, o.customer_name, o.customer, o.service_reference]
				.filter(Boolean)
				.some((f) => f.toLowerCase().includes(term));
		});
	}

	render_order(order) {
		const trips = order.trips || [];
		const requested = order.vehicles_requested || 0;

		return `
			<details class="fsr-order" open>
				<summary class="fsr-order-summary">
					<div class="fsr-order-id">
						<span class="fsr-order-name">${this.text(order.name)}</span>
						<span class="fsr-order-customer">${this.text(order.customer_name || order.customer || "—")}</span>
					</div>
					<div class="fsr-order-meta">
						<span class="fsr-order-fact">${__("Pedido")}: ${this.date(order.order_date)}</span>
						<span class="fsr-order-fact">${__("Veículos")}: ${trips.length}${
			requested ? ` / ${requested}` : ""
		}</span>
						${this.badge(order.status, FSR_STATUS_COLOR[order.status] || "gray")}
					</div>
				</summary>
				<div class="fsr-order-body">
					${
						order.service_reference
							? `<div class="fsr-order-ref">${__("Referência")}: ${this.text(order.service_reference)}</div>`
							: ""
					}
					${
						trips.length
							? trips.map((t) => this.render_trip(t)).join("")
							: `<p class="fsr-empty">${__("Ainda sem viagens despachadas para este pedido.")}</p>`
					}
				</div>
			</details>
		`;
	}

	render_trip(trip) {
		return `
			<div class="fsr-trip">
				<div class="fsr-trip-head">
					<span class="fsr-trip-plate">${this.text(trip.license_plate || trip.vehicle || "—")}</span>
					<span class="fsr-trip-type">${this.text(trip.vehicle_type || "—")}</span>
					${trip.load_capacity ? `<span class="fsr-trip-capacity">${this.text(trip.load_capacity)} t</span>` : ""}
					<span class="fsr-trip-spacer"></span>
					${trip.service_conformity ? this.badge(trip.service_conformity, FSR_STATUS_COLOR[trip.service_conformity] || "gray") : ""}
					${this.docstatus_badge(trip.docstatus)}
				</div>
				<div class="fsr-trip-grid">
					<div class="fsr-trip-fact"><span>${__("Condutor")}</span><strong>${this.text(
			trip.driver_name || trip.driver || "—"
		)}</strong></div>
					<div class="fsr-trip-fact"><span>${__("Local de Carregamento")}</span><strong>${this.text(
			trip.loading_location || "—"
		)}</strong></div>
					<div class="fsr-trip-fact"><span>${__("Data de Carregamento")}</span><strong>${this.date(trip.loading_date)}</strong></div>
					<div class="fsr-trip-fact"><span>${__("Data de Saída")}</span><strong>${this.date(trip.departure_datetime)}</strong></div>
					<div class="fsr-trip-fact"><span>${__("Data de Chegada")}</span><strong>${this.date(trip.arrival_datetime)}</strong></div>
					<div class="fsr-trip-fact"><span>${__("Odómetro")}</span><strong>${this.text(
			trip.odometer_start
		)} → ${this.text(trip.odometer_end || "—")} km</strong></div>
					${
						trip.cargo
							? `<div class="fsr-trip-fact"><span>${__("Carga")}</span><strong>${this.text(trip.cargo)}</strong></div>`
							: ""
					}
					${
						trip.delay_reason
							? `<div class="fsr-trip-fact fsr-trip-fact-warn"><span>${__("Motivo do Atraso")}</span><strong>${this.text(
									trip.delay_reason
							  )}</strong></div>`
							: ""
					}
				</div>
				${this.render_destinations(trip.destinations)}
				${
					trip.remarks
						? `<div class="fsr-trip-remarks"><span>${__("Observações")}</span>${this.text(trip.remarks)}</div>`
						: ""
				}
			</div>
		`;
	}

	render_destinations(destinations) {
		if (!destinations || !destinations.length) return "";

		const rows = destinations
			.map((d) => {
				const statusClass = FSR_DEST_STATUS_CLASS[d.status] || "pending";
				return `
					<div class="fsr-dest fsr-dest-${statusClass}">
						<span class="fsr-dest-dot"></span>
						<span class="fsr-dest-name">${this.text(d.destination)}</span>
						<span class="fsr-dest-eta">${d.eta ? this.date(d.eta) : "—"}</span>
						<span class="fsr-dest-status fsr-dest-status-${statusClass}">${this.text(d.status || "Pendente")}</span>
						<span class="fsr-dest-done">${d.actual_delivery_date ? this.date(d.actual_delivery_date) : "—"}</span>
						${d.remarks ? `<span class="fsr-dest-remarks">${this.text(d.remarks)}</span>` : ""}
					</div>
				`;
			})
			.join("");

		return `<div class="fsr-dest-list">${rows}</div>`;
	}

	// ---- formatting ----------------------------------------------------

	badge(label, color) {
		return `<span class="fsr-badge fsr-badge-${color}">${this.text(label)}</span>`;
	}

	docstatus_badge(docstatus) {
		const map = {
			0: [__("Em Curso"), "amber"],
			1: [__("Concluída"), "teal"],
			2: [__("Cancelada"), "red"],
		};
		const [label, color] = map[docstatus] || map[0];
		return this.badge(label, color);
	}

	text(value) {
		return frappe.utils.escape_html(value === null || value === undefined ? "" : String(value));
	}

	date(value) {
		return value ? frappe.datetime.str_to_user(value) : "—";
	}
};
