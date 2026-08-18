import frappe

DEFAULT_VEHICLE_TYPES = (
	("Administrativo", "M"),
	("Consolidados", "MG"),
	("Carga Geral", "MV"),
)


def execute():
	frappe.reload_doc("entre_fleet", "doctype", "fleet_vehicle_type")

	for type_name, code in DEFAULT_VEHICLE_TYPES:
		if frappe.db.exists("Fleet Vehicle Type", type_name):
			continue

		frappe.get_doc(
			{
				"doctype": "Fleet Vehicle Type",
				"type_name": type_name,
				"code": code,
				"active": 1,
			}
		).insert(ignore_permissions=True)
