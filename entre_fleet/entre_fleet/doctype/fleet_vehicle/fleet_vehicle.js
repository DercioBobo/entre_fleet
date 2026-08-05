frappe.ui.form.on("Fleet Vehicle", {
	refresh(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__("Ver Ficha Completa"), () => {
				frappe.set_route("fleet-vehicle-dossier", frm.doc.name);
			});
		}
	},
});
