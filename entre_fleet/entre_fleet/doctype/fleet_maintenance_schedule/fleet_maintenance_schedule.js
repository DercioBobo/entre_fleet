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
});
