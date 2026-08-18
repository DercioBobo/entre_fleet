frappe.provide("entre_fleet");

frappe.pages["fleet-maintenance-plan"].on_page_load = function (wrapper) {
	wrapper.fleet_maintenance_plan = new entre_fleet.FleetMaintenancePlan(wrapper);
};

frappe.pages["fleet-maintenance-plan"].on_page_show = function (wrapper) {
	wrapper.fleet_maintenance_plan && wrapper.fleet_maintenance_plan.load_data();
};

const MP_REQUEST_STATUS_COLOR = {
	Aberto: "amber",
	"Em Andamento": "amber",
	Parado: "red",
	Concluído: "green",
	Cancelado: "gray",
};

const MP_SCHEDULE_STATUS_COLOR = {
	Agendado: "green",
	"A Vencer": "amber",
	Vencido: "red",
};

const MP_STATUS_COLUMNS = ["Aberto", "Em Andamento", "Parado", "Concluído", "Cancelado"];

const MP_WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const MP_MONTHS = [
	"Janeiro",
	"Fevereiro",
	"Março",
	"Abril",
	"Maio",
	"Junho",
	"Julho",
	"Agosto",
	"Setembro",
	"Outubro",
	"Novembro",
	"Dezembro",
];

entre_fleet.FleetMaintenancePlan = class FleetMaintenancePlan {
	constructor(wrapper) {
		this.wrapper = wrapper;

		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Plano e Registo de Manutenção"),
			single_column: true,
		});

		this.$container = $('<div class="mp-page">').appendTo(this.page.body);

		this.view = "table";
		this.filter_status = "all";
		this.search_term = "";

		const today = new Date();
		this.calMonth = today.getMonth();
		this.calYear = today.getFullYear();
		this.selectedDate = frappe.datetime.get_today();

		this.load_data();
	}

	load_data() {
		this.$container.html(`<p class="mp-empty">${__("A carregar plano de manutenção...")}</p>`);
		frappe.call({ method: "entre_fleet.entre_fleet.api.get_maintenance_plan" }).then((r) => {
			this.data = r.message || { requests: [], schedules: [], vehicles: [], technicians: [], summary: {} };
			this.render();
		});
	}

	// ---- shell ---------------------------------------------------------

	render() {
		this.$container.html(`
			${this.render_toolbar()}
			${this.render_stats()}
			${this.render_filter_chips()}
			<div class="mp-content"></div>
		`);

		this.$container.find(".mp-search").on("input", (e) => {
			this.search_term = e.currentTarget.value;
			this.render_content();
		});

		this.$container.find("[data-view]").on("click", (e) => {
			this.switch_view($(e.currentTarget).attr("data-view"));
		});

		this.$container.find("[data-status-filter]").on("click", (e) => {
			this.filter_status = $(e.currentTarget).attr("data-status-filter");
			this.$container.find("[data-status-filter]").removeClass("active");
			$(e.currentTarget).addClass("active");
			this.render_content();
		});

		this.$container.find(".mp-new-btn").on("click", () => this.open_create_dialog());

		this.render_content();
	}

	render_toolbar() {
		return `
			<div class="mp-toolbar">
				<input
					type="text"
					class="mp-search"
					placeholder="${this.text(__("Pesquisar por matrícula, marca, responsável ou descrição..."))}"
					value="${this.text(this.search_term)}"
				/>
				<div class="mp-view-switch">
					<button type="button" class="mp-view-btn ${this.view === "table" ? "active" : ""}" data-view="table">
						${__("Tabela")}
					</button>
					<button type="button" class="mp-view-btn ${this.view === "calendar" ? "active" : ""}" data-view="calendar">
						${__("Calendário")}
					</button>
					<button type="button" class="mp-view-btn ${this.view === "cards" ? "active" : ""}" data-view="cards">
						${__("Cartões")}
					</button>
				</div>
				<button type="button" class="btn btn-sm btn-primary mp-new-btn">${__("+ Novo Registo")}</button>
			</div>
		`;
	}

	render_stats() {
		const s = this.data.summary || {};
		const counts = s.status_counts || {};
		const tiles = [
			[__("Total"), s.total || 0],
			[__("Abertos"), counts["Aberto"] || 0],
			[__("Em Andamento"), counts["Em Andamento"] || 0],
			[__("Parados"), counts["Parado"] || 0],
			[__("Concluídos"), counts["Concluído"] || 0],
			[__("Planos Vencidos"), s.overdue_schedules || 0],
		];
		return `
			<div class="mp-stats">
				${tiles
					.map(
						([label, value]) => `
							<div class="mp-stat">
								<div class="mp-stat-value">${this.text(value)}</div>
								<div class="mp-stat-label">${this.text(label)}</div>
							</div>
						`
					)
					.join("")}
			</div>
		`;
	}

	render_filter_chips() {
		const requests = this.data.requests || [];
		const counts = { all: requests.length };
		MP_STATUS_COLUMNS.forEach((s) => (counts[s] = 0));
		requests.forEach((r) => {
			if (counts[r.status] !== undefined) counts[r.status]++;
		});

		const chips = [["all", __("Todos")], ...MP_STATUS_COLUMNS.map((s) => [s, s])]
			.map(
				([key, label]) => `
					<button
						type="button"
						class="mp-filter-chip mp-filter-chip-${this.status_color(key)} ${key === this.filter_status ? "active" : ""}"
						data-status-filter="${key}"
					>
						${this.text(label)} <span class="mp-filter-count">${counts[key] || 0}</span>
					</button>
				`
			)
			.join("");

		return `<div class="mp-filter-chips">${chips}</div>`;
	}

	switch_view(view) {
		this.view = view;
		this.$container.find("[data-view]").removeClass("active");
		this.$container.find(`[data-view="${view}"]`).addClass("active");
		this.render_content();
	}

	render_content() {
		const $mount = this.$container.find(".mp-content");
		if (this.view === "table") return this.render_table_view($mount);
		if (this.view === "calendar") return this.render_calendar_view($mount);
		return this.render_cards_view($mount);
	}

	// ---- data helpers ----------------------------------------------------

	filtered_requests() {
		const requests = this.data.requests || [];
		const term = (this.search_term || "").trim().toLowerCase();

		return requests.filter((r) => {
			if (this.filter_status !== "all" && r.status !== this.filter_status) return false;
			if (!term) return true;

			return [r.license_plate, r.brand, r.model, r.vehicle_type, r.responsavel, r.reported_issue]
				.filter(Boolean)
				.some((field) => field.toLowerCase().includes(term));
		});
	}

	status_color(status) {
		if (status === "all") return "navy";
		return MP_REQUEST_STATUS_COLOR[status] || "gray";
	}

	// ---- table view --------------------------------------------------------

	render_table_view($mount) {
		const rows = this.filtered_requests();

		if (!rows.length) {
			$mount.html(`<p class="mp-empty">${__("Sem registos de manutenção correspondentes.")}</p>`);
			return;
		}

		const thead = [
			"Nº",
			__("Veículo"),
			__("Tipo"),
			__("Descrição da Manutenção"),
			__("Responsável"),
			__("Periodicidade"),
			__("Data Requisição"),
			__("Última Manutenção"),
			__("Km Actual"),
			__("Km p/ Manutenção"),
			__("Estado"),
			__("Observações"),
		]
			.map((h) => `<th>${this.text(h)}</th>`)
			.join("");

		const tbody = rows
			.map(
				(r, i) => `
					<tr class="mp-table-row" data-name="${this.text(r.name)}">
						<td>${i + 1}</td>
						<td>
							<div class="mp-cell-vehicle">
								<strong>${this.text(r.license_plate || r.vehicle || "—")}</strong>
								<span>${this.text([r.brand, r.model].filter(Boolean).join(" ") || "—")}</span>
							</div>
						</td>
						<td>${this.badge(r.tipo_manutencao, r.tipo_manutencao === "Preventiva" ? "teal" : "amber")}</td>
						<td class="mp-cell-wrap">${this.text(r.reported_issue)}</td>
						<td>${this.text(r.responsavel || "—")}</td>
						<td>${r.periodicity_km ? `${this.text(r.periodicity_km)} km` : "—"}</td>
						<td>${this.date(r.opening_date)}</td>
						<td>${this.date(r.completion_date)}</td>
						<td>${r.odometer_at_request ? `${this.text(r.odometer_at_request)} km` : "—"}</td>
						<td>${r.next_due_km ? `${this.text(r.next_due_km)} km` : "—"}</td>
						<td>${this.badge(r.status, this.status_color(r.status))}</td>
						<td class="mp-cell-wrap">${this.text(r.remarks || "—")}</td>
					</tr>
				`
			)
			.join("");

		$mount.html(`
			<div class="mp-table-wrap">
				<table class="mp-table">
					<thead><tr>${thead}</tr></thead>
					<tbody>${tbody}</tbody>
				</table>
			</div>
		`);

		$mount.find(".mp-table-row").on("click", (e) => {
			this.open_request($(e.currentTarget).attr("data-name"));
		});
	}

	// ---- card / kanban view ------------------------------------------------

	render_cards_view($mount) {
		const rows = this.filtered_requests();
		const byStatus = {};
		MP_STATUS_COLUMNS.forEach((s) => (byStatus[s] = []));
		rows.forEach((r) => {
			if (!byStatus[r.status]) byStatus[r.status] = [];
			byStatus[r.status].push(r);
		});

		const columns = MP_STATUS_COLUMNS.map((status) => {
			const items = byStatus[status] || [];
			return `
				<div class="mp-board-col">
					<div class="mp-board-col-header mp-board-col-header-${this.status_color(status)}">
						<span>${this.text(status)}</span>
						<span class="mp-board-col-count">${items.length}</span>
					</div>
					<div class="mp-board-col-body">
						${
							items.length
								? items.map((r) => this.render_card(r)).join("")
								: `<p class="mp-board-empty">${__("Sem registos.")}</p>`
						}
					</div>
				</div>
			`;
		}).join("");

		$mount.html(`<div class="mp-board">${columns}</div>`);

		$mount.find(".mp-card").on("click", (e) => {
			if ($(e.target).is("select, option")) return;
			this.open_request($(e.currentTarget).attr("data-name"));
		});

		$mount.find(".mp-card-status-select").on("click", (e) => e.stopPropagation());
		$mount.find(".mp-card-status-select").on("change", (e) => {
			e.stopPropagation();
			const $select = $(e.currentTarget);
			const name = $select.attr("data-name");
			const status = $select.val();
			frappe.call({
				method: "entre_fleet.entre_fleet.api.set_maintenance_status",
				args: { name, status },
				freeze: true,
			}).then(() => {
				frappe.show_alert({ message: __("Estado actualizado."), indicator: "green" });
				this.load_data();
			});
		});
	}

	render_card(r) {
		const statusOptions = MP_STATUS_COLUMNS.map(
			(s) => `<option value="${this.text(s)}" ${s === r.status ? "selected" : ""}>${this.text(s)}</option>`
		).join("");

		return `
			<div class="mp-card mp-card-${this.status_color(r.status)}" data-name="${this.text(r.name)}">
				<div class="mp-card-top">
					<span class="mp-card-plate">${this.text(r.license_plate || r.vehicle || "—")}</span>
					${this.badge(r.tipo_manutencao, r.tipo_manutencao === "Preventiva" ? "teal" : "amber")}
				</div>
				<div class="mp-card-vehicle">${this.text([r.brand, r.model].filter(Boolean).join(" ") || "—")}</div>
				<div class="mp-card-desc">${this.text(r.reported_issue || "—")}</div>
				<div class="mp-card-meta">
					${r.responsavel ? `<span>&#128100; ${this.text(r.responsavel)}</span>` : ""}
					${r.opening_date ? `<span>&#128197; ${this.date(r.opening_date)}</span>` : ""}
					${r.odometer_at_request ? `<span>&#128663; ${this.text(r.odometer_at_request)} km</span>` : ""}
				</div>
				<select class="mp-card-status-select" data-name="${this.text(r.name)}">${statusOptions}</select>
			</div>
		`;
	}

	// ---- calendar view -------------------------------------------------

	render_calendar_view($mount) {
		const events = this.build_calendar_events();

		const firstOfMonth = new Date(this.calYear, this.calMonth, 1);
		const startOffset = firstOfMonth.getDay();
		const daysInMonth = new Date(this.calYear, this.calMonth + 1, 0).getDate();
		const daysInPrevMonth = new Date(this.calYear, this.calMonth, 0).getDate();
		const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

		const todayStr = frappe.datetime.get_today();

		let cells = "";
		for (let i = 0; i < totalCells; i++) {
			const dayNum = i - startOffset + 1;
			let cellDate, muted;
			if (dayNum < 1) {
				cellDate = new Date(this.calYear, this.calMonth - 1, daysInPrevMonth + dayNum);
				muted = true;
			} else if (dayNum > daysInMonth) {
				cellDate = new Date(this.calYear, this.calMonth + 1, dayNum - daysInMonth);
				muted = true;
			} else {
				cellDate = new Date(this.calYear, this.calMonth, dayNum);
				muted = false;
			}
			const dateStr = this.to_date_str(cellDate);
			const dayEvents = events[dateStr] || [];
			const isToday = dateStr === todayStr;
			const isSelected = dateStr === this.selectedDate;

			const dots = dayEvents
				.slice(0, 3)
				.map((ev) => `<span class="mp-cal-dot mp-cal-dot-${ev.color}" title="${this.text(ev.label)}"></span>`)
				.join("");
			const more = dayEvents.length > 3 ? `<span class="mp-cal-more">+${dayEvents.length - 3}</span>` : "";

			cells += `
				<div
					class="mp-cal-day ${muted ? "mp-cal-day-muted" : ""} ${isToday ? "mp-cal-day-today" : ""} ${
				isSelected ? "mp-cal-day-selected" : ""
			}"
					data-date="${dateStr}"
				>
					<span class="mp-cal-day-number">${cellDate.getDate()}</span>
					<span class="mp-cal-day-events">${dots}${more}</span>
				</div>
			`;
		}

		const weekdayHeader = MP_WEEKDAYS.map((w) => `<div class="mp-cal-weekday">${w}</div>`).join("");

		$mount.html(`
			<div class="mp-cal">
				<div class="mp-cal-nav">
					<button type="button" class="mp-cal-nav-btn" data-cal-nav="-1">&larr;</button>
					<div class="mp-cal-title">${MP_MONTHS[this.calMonth]} ${this.calYear}</div>
					<button type="button" class="mp-cal-nav-btn" data-cal-nav="1">&rarr;</button>
					<button type="button" class="btn btn-xs btn-default mp-cal-today-btn">${__("Hoje")}</button>
				</div>
				<div class="mp-cal-grid">
					${weekdayHeader}
					${cells}
				</div>
				<div class="mp-cal-legend">
					<span class="mp-cal-legend-item"><span class="mp-cal-dot mp-cal-dot-amber"></span>${__("Registo — Aberto/Em Andamento")}</span>
					<span class="mp-cal-legend-item"><span class="mp-cal-dot mp-cal-dot-red"></span>${__("Registo — Parado")}</span>
					<span class="mp-cal-legend-item"><span class="mp-cal-dot mp-cal-dot-green"></span>${__("Registo — Concluído")}</span>
					<span class="mp-cal-legend-item"><span class="mp-cal-dot mp-cal-dot-teal"></span>${__("Plano — Próxima Manutenção Agendada")}</span>
				</div>
				<div class="mp-cal-panel">${this.render_calendar_panel(events)}</div>
			</div>
		`);

		$mount.find("[data-cal-nav]").on("click", (e) => {
			const delta = parseInt($(e.currentTarget).attr("data-cal-nav"), 10);
			this.calMonth += delta;
			if (this.calMonth < 0) {
				this.calMonth = 11;
				this.calYear--;
			} else if (this.calMonth > 11) {
				this.calMonth = 0;
				this.calYear++;
			}
			this.render_calendar_view($mount);
		});

		$mount.find(".mp-cal-today-btn").on("click", () => {
			const today = new Date();
			this.calMonth = today.getMonth();
			this.calYear = today.getFullYear();
			this.selectedDate = frappe.datetime.get_today();
			this.render_calendar_view($mount);
		});

		$mount.find(".mp-cal-day").on("click", (e) => {
			this.selectedDate = $(e.currentTarget).attr("data-date");
			this.render_calendar_view($mount);
		});

		$mount.find("[data-open-ref]").on("click", (e) => {
			e.stopPropagation();
			const $el = $(e.currentTarget);
			this.open_request_or_schedule($el.attr("data-open-ref"), $el.attr("data-open-kind"));
		});
	}

	render_calendar_panel(events) {
		const items = events[this.selectedDate] || [];
		const title = `${__("Eventos em")} ${frappe.datetime.str_to_user(this.selectedDate)}`;

		if (!items.length) {
			return `
				<div class="mp-cal-panel-title">${this.text(title)}</div>
				<p class="mp-empty">${__("Sem eventos nesta data.")}</p>
			`;
		}

		const rows = items
			.map(
				(ev) => `
					<div class="mp-cal-panel-item" data-open-ref="${this.text(ev.ref)}" data-open-kind="${ev.kind}">
						<span class="mp-cal-dot mp-cal-dot-${ev.color}"></span>
						<span class="mp-cal-panel-label">${this.text(ev.label)}</span>
						<span class="mp-cal-panel-sub">${this.text(ev.sub)}</span>
					</div>
				`
			)
			.join("");

		return `
			<div class="mp-cal-panel-title">${this.text(title)}</div>
			${rows}
		`;
	}

	build_calendar_events() {
		const events = {};
		const push = (dateStr, ev) => {
			if (!dateStr) return;
			if (!events[dateStr]) events[dateStr] = [];
			events[dateStr].push(ev);
		};

		this.filtered_requests().forEach((r) => {
			if (!r.opening_date) return;
			push(r.opening_date, {
				kind: "request",
				ref: r.name,
				color: this.status_color(r.status),
				label: `${r.license_plate || r.vehicle} — ${r.reported_issue || r.status}`,
				sub: `${__("Registo")} · ${r.status}`,
			});
		});

		(this.data.schedules || []).forEach((s) => {
			if (!s.next_due_date) return;
			push(s.next_due_date, {
				kind: "schedule",
				ref: s.name,
				color: "teal",
				label: `${s.license_plate || s.vehicle} — ${s.maintenance_type}`,
				sub: `${__("Plano")} · ${s.status}`,
			});
		});

		return events;
	}

	to_date_str(date) {
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, "0");
		const d = String(date.getDate()).padStart(2, "0");
		return `${y}-${m}-${d}`;
	}

	// ---- navigation ------------------------------------------------------

	open_request(name) {
		frappe.set_route("Form", "Fleet Maintenance Request", name);
	}

	open_request_or_schedule(ref, kind) {
		if (kind === "schedule") {
			frappe.set_route("Form", "Fleet Maintenance Schedule", ref);
		} else {
			this.open_request(ref);
		}
	}

	// ---- create dialog -----------------------------------------------------

	open_create_dialog() {
		const dialog = new frappe.ui.Dialog({
			title: __("Novo Registo de Manutenção"),
			size: "large",
			fields: [
				{
					fieldname: "vehicle",
					fieldtype: "Link",
					options: "Fleet Vehicle",
					label: __("Veículo"),
					reqd: 1,
					onchange: () => {
						const vehicle = dialog.get_value("vehicle");
						const v = (this.data.vehicles || []).find((x) => x.name === vehicle);
						if (v) dialog.set_value("odometer_at_request", v.current_odometer || 0);
					},
				},
				{
					fieldname: "tipo_manutencao",
					fieldtype: "Select",
					options: "Preventiva\nCorretiva",
					label: __("Tipo de Manutenção"),
					default: "Corretiva",
					reqd: 1,
				},
				{ fieldname: "column_break_type", fieldtype: "Column Break" },
				{
					fieldname: "status",
					fieldtype: "Select",
					options: MP_STATUS_COLUMNS.join("\n"),
					label: __("Estado"),
					default: "Aberto",
				},
				{
					fieldname: "responsavel",
					fieldtype: "Data",
					label: __("Responsável"),
				},
				{ fieldname: "section_break_dates", fieldtype: "Section Break" },
				{
					fieldname: "opening_date",
					fieldtype: "Date",
					label: __("Data de Requisição"),
					default: frappe.datetime.get_today(),
				},
				{ fieldname: "column_break_dates", fieldtype: "Column Break" },
				{
					fieldname: "completion_date",
					fieldtype: "Date",
					label: __("Data da Última Manutenção"),
				},
				{ fieldname: "section_break_km", fieldtype: "Section Break", label: __("Quilometragem") },
				{
					fieldname: "odometer_at_request",
					fieldtype: "Float",
					label: __("Km Actual"),
				},
				{
					fieldname: "periodicity_km",
					fieldtype: "Int",
					label: __("Periodicidade (Km)"),
				},
				{ fieldname: "column_break_km", fieldtype: "Column Break" },
				{
					fieldname: "next_due_km",
					fieldtype: "Float",
					label: __("Km para Manutenção"),
				},
				{ fieldname: "section_break_desc", fieldtype: "Section Break", label: __("Descrição") },
				{
					fieldname: "reported_issue",
					fieldtype: "Small Text",
					label: __("Descrição da Manutenção"),
					reqd: 1,
				},
				{
					fieldname: "required_parts",
					fieldtype: "Small Text",
					label: __("Peças Necessárias"),
				},
				{
					fieldname: "remarks",
					fieldtype: "Small Text",
					label: __("Observações"),
				},
			],
			primary_action_label: __("Criar Registo"),
			primary_action: (values) => {
				dialog.hide();
				frappe.call({
					method: "entre_fleet.entre_fleet.api.create_maintenance_request",
					args: values,
					freeze: true,
					freeze_message: __("A criar registo..."),
				}).then(() => {
					frappe.show_alert({ message: __("Registo de manutenção criado."), indicator: "green" });
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

	date(value) {
		return value ? frappe.datetime.str_to_user(value) : "—";
	}

	badge(label, color) {
		if (!label) return "—";
		return `<span class="mp-badge mp-badge-${color}">${this.text(label)}</span>`;
	}
};
