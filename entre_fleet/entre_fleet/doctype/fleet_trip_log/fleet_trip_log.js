frappe.ui.form.on("Fleet Trip Log", {
	setup(frm) {
		frm.set_query("vehicle", () => ({
			query: "entre_fleet.entre_fleet.doctype.fleet_trip_log.fleet_trip_log.vehicle_query",
			filters: { trip_log: frm.doc.name },
		}));

		frm.set_query("driver", () => ({
			query: "entre_fleet.entre_fleet.doctype.fleet_trip_log.fleet_trip_log.driver_query",
			filters: { trip_log: frm.doc.name },
		}));

		// Once an order is Concluída/Não Conforme it's done — keep it out of the
		// picker for new dispatches, but a trip already linked to one keeps showing it.
		// Cliente and Pedido de Serviço narrow each other: whichever is picked
		// first, the other's picker is filtered down to just its matches.
		frm.set_query("service_order", () => {
			const filters = { status: ["in", ["Aberta", "Em Andamento"]] };
			if (frm.doc.customer) filters.customer = frm.doc.customer;
			return { filters };
		});
	},

	customer(frm) {
		if (!frm.doc.customer || !frm.doc.service_order) return;
		frappe.db.get_value("Fleet Service Order", frm.doc.service_order, "customer").then((r) => {
			if (r.message.customer && r.message.customer !== frm.doc.customer) {
				// The order on file belongs to a different client — clear it
				// rather than leave a trip whose order and customer disagree.
				frm.set_value("service_order", "");
			}
		});
	},

	service_order(frm) {
		if (!frm.doc.service_order) return;
		frappe.db.get_value("Fleet Service Order", frm.doc.service_order, "customer").then((r) => {
			if (r.message.customer) frm.set_value("customer", r.message.customer);
		});
	},

	refresh(frm) {
		// The Trip Board has a dedicated "Registar Chegada" action; a trip opened
		// straight from its form had none — just two fields sitting there and the
		// generic Submit button, easy to forget or fill in half-way. Give it the
		// same guided, single-call flow (sets arrival + odometer, then submits).
		if (frm.is_new() || frm.doc.docstatus !== 0 || frm.doc.arrival_datetime) return;

		frm.add_custom_button(__("Registar Chegada"), () => open_chegada_dialog(frm)).addClass("btn-primary");
	},
});

function open_chegada_dialog(frm) {
	const isService = frm.doc.trip_type === "Serviço a Cliente";
	const needsCargo = frm.doc.vehicle_type && frm.doc.vehicle_type !== "Administrativo";

	if (isService) {
		const pending = (frm.doc.destinations || []).filter((d) => !d.actual_delivery_date);
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
			description: __("Odómetro inicial: {0} km", [frm.doc.odometer_start]),
		},
	];

	if (needsCargo) {
		fields.push({
			fieldname: "cargo",
			fieldtype: "Data",
			label: __("Carga"),
			reqd: 1,
			default: frm.doc.cargo,
		});
	}

	fields.push({
		fieldname: "remarks",
		fieldtype: "Small Text",
		label: __("Observações"),
		default: frm.doc.remarks || "",
	});

	const dialog = new frappe.ui.Dialog({
		title: __("Registar Chegada"),
		fields,
		primary_action_label: __("Confirmar Chegada"),
		primary_action: (values) => {
			if (values.odometer_end <= frm.doc.odometer_start) {
				frappe.msgprint(
					__("Odómetro Final deve ser maior que o Odómetro Inicial ({0} km).", [frm.doc.odometer_start])
				);
				return;
			}
			dialog.hide();
			frappe.call({
				method: "entre_fleet.entre_fleet.api.end_trip",
				args: { trip_log: frm.doc.name, ...values },
				freeze: true,
				freeze_message: __("A registar chegada..."),
			}).then(() => {
				frappe.show_alert({ message: __("Chegada registada. Viagem concluída."), indicator: "green" });
				frm.reload_doc();
			});
		},
	});
	dialog.show();
}
