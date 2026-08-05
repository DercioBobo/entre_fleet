frappe.ui.form.on("Fleet Maintenance Schedule", {
	refresh(frm) {
		if (!frm.is_new() && ["A Vencer", "Vencido"].includes(frm.doc.status)) {
			frm.add_custom_button(__("Criar Pedido de Manutenção"), () => {
				frappe.new_doc("Fleet Maintenance Request", {
					vehicle: frm.doc.vehicle,
					tipo_manutencao: "Preventiva",
					maintenance_schedule: frm.doc.name,
				});
			});
		}
	},
	maintenance_type(frm) {
		if (!frm.doc.maintenance_type || frm.doc.interval_days) return;

		frappe.db.get_value(
			"Fleet Maintenance Type",
			frm.doc.maintenance_type,
			"default_interval_days"
		).then(({ message }) => {
			if (message && message.default_interval_days) {
				frm.set_value("interval_days", message.default_interval_days);
			}
		});
	},
});
