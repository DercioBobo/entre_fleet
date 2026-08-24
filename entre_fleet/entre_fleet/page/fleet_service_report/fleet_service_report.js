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

const FSR_MONTHS = [
	["01", __("Janeiro")],
	["02", __("Fevereiro")],
	["03", __("Março")],
	["04", __("Abril")],
	["05", __("Maio")],
	["06", __("Junho")],
	["07", __("Julho")],
	["08", __("Agosto")],
	["09", __("Setembro")],
	["10", __("Outubro")],
	["11", __("Novembro")],
	["12", __("Dezembro")],
];

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
		this.filter_month = "all";
		this.filter_year = "all";
		this.search_term = "";
		this.view_mode = "cards";
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

		this.$container.find(".fsr-month-select").on("change", (e) => {
			this.filter_month = e.currentTarget.value;
			this.render_list();
		});

		this.$container.find(".fsr-year-select").on("change", (e) => {
			this.filter_year = e.currentTarget.value;
			this.render_list();
		});

		this.$container.find("[data-view]").on("click", (e) => {
			this.view_mode = $(e.currentTarget).attr("data-view");
			this.$container.find("[data-view]").removeClass("active");
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

		const monthOptions = [`<option value="all">${__("Mês")}</option>`]
			.concat(
				FSR_MONTHS.map(
					([value, label]) =>
						`<option value="${value}" ${this.filter_month === value ? "selected" : ""}>${label}</option>`
				)
			)
			.join("");

		const years = this.years_from_data();
		const yearOptions = [`<option value="all">${__("Ano")}</option>`]
			.concat(
				years.map((y) => `<option value="${y}" ${this.filter_year === y ? "selected" : ""}>${y}</option>`)
			)
			.join("");

		return `
			<div class="fsr-toolbar">
				<input
					type="text"
					class="fsr-search"
					placeholder="${this.text(__("Pesquisar por cliente, pedido ou referência..."))}"
					value="${this.text(this.search_term)}"
				/>
				<select class="fsr-month-select">${monthOptions}</select>
				<select class="fsr-year-select">${yearOptions}</select>
				<div class="fsr-filter-chips">${chips}</div>
				<div class="fsr-view-toggle">
					<button type="button" class="fsr-view-btn ${this.view_mode === "cards" ? "active" : ""}" data-view="cards">
						${__("Cartões")}
					</button>
					<button type="button" class="fsr-view-btn ${this.view_mode === "table" ? "active" : ""}" data-view="table">
						${__("Tabela")}
					</button>
				</div>
			</div>
		`;
	}

	years_from_data() {
		const years = new Set();
		(this.data || []).forEach((o) => {
			if (o.order_date) years.add(o.order_date.slice(0, 4));
		});
		return Array.from(years).sort().reverse();
	}

	render_list() {
		const orders = this.filtered_sorted_orders();
		const $list = this.$container.find(".fsr-list");

		if (!orders.length) {
			$list.html(`<p class="fsr-empty">${__("Sem pedidos correspondentes.")}</p>`);
			return;
		}

		$list.html(
			this.view_mode === "table"
				? this.render_table_view(orders)
				: orders.map((o) => this.render_order(o)).join("")
		);
	}

	filtered_sorted_orders() {
		const term = (this.search_term || "").trim().toLowerCase();
		return (this.data || []).filter((o) => {
			if (this.filter_status !== "all" && o.status !== this.filter_status) return false;
			if (this.filter_year !== "all" || this.filter_month !== "all") {
				if (!o.order_date) return false;
				const orderYear = o.order_date.slice(0, 4);
				const orderMonth = o.order_date.slice(5, 7);
				if (this.filter_year !== "all" && orderYear !== this.filter_year) return false;
				if (this.filter_month !== "all" && orderMonth !== this.filter_month) return false;
			}
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

	// One row per trip — an order with no trips dispatched yet still gets a
	// row (fields blank) so it doesn't just disappear from the table.
	render_table_view(orders) {
		const rows = [];
		orders.forEach((order) => {
			if (!order.trips || !order.trips.length) {
				rows.push([order, null]);
			} else {
				order.trips.forEach((trip) => rows.push([order, trip]));
			}
		});

		const columns = [
			__("Pedido"),
			__("Cliente"),
			__("Data do Pedido"),
			__("Veículo"),
			__("Tipo"),
			__("Capacidade"),
			__("Condutor"),
			__("Local de Carregamento"),
			__("Data de Carregamento"),
			__("Data de Saída"),
			__("Data de Chegada"),
			__("Destinos"),
			__("Conformidade"),
			__("Estado"),
		];

		const thead = columns.map((c) => `<th>${this.text(c)}</th>`).join("");
		const tbody = rows
			.map(([order, trip]) => {
				const cells = [
					this.text(order.name),
					this.text(order.customer_name || order.customer || "—"),
					this.date(order.order_date),
					trip ? this.text(trip.license_plate || trip.vehicle || "—") : "—",
					trip ? this.text(trip.vehicle_type || "—") : "—",
					trip && trip.load_capacity ? `${this.text(trip.load_capacity)} t` : "—",
					trip ? this.text(trip.driver_name || trip.driver || "—") : "—",
					trip ? this.text(trip.loading_location || "—") : "—",
					trip ? this.date(trip.loading_date) : "—",
					trip ? this.date(trip.departure_datetime) : "—",
					trip ? this.date(trip.arrival_datetime) : "—",
					this.render_destinations_cell(trip),
					trip && trip.service_conformity
						? this.badge(trip.service_conformity, FSR_STATUS_COLOR[trip.service_conformity] || "gray")
						: "—",
					trip ? this.docstatus_badge(trip.docstatus) : this.badge(order.status, FSR_STATUS_COLOR[order.status] || "gray"),
				];
				return `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
			})
			.join("");

		return `
			<div class="fsr-table-wrap">
				<table class="fsr-table">
					<thead><tr>${thead}</tr></thead>
					<tbody>${tbody}</tbody>
				</table>
			</div>
		`;
	}

	// Each stop as its own colour-coded chip (by delivery status) rather than
	// just a count — the table cell wraps its own content so this doesn't
	// force the whole row to balloon in width.
	render_destinations_cell(trip) {
		const destinations = (trip && trip.destinations) || [];
		if (!destinations.length) return "—";

		const chips = destinations
			.map((d) => {
				const statusClass = FSR_DEST_STATUS_CLASS[d.status] || "pending";
				return `<span class="fsr-table-dest fsr-table-dest-${statusClass}" title="${this.text(
					d.status || "Pendente"
				)}">${this.text(d.destination)}</span>`;
			})
			.join("");

		return `<div class="fsr-table-dest-wrap">${chips}</div>`;
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
