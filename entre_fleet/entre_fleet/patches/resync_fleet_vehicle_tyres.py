import frappe


def execute():
	"""Backfill axle_number/side on Fleet Vehicle Tyre rows for vehicles saved
	before those fields existed, and apply dual_rear_tyres to any vehicle that
	already has it set. Fleet Vehicle.validate() -> sync_tyre_positions()
	does the actual work; this just forces every vehicle through a save."""
	frappe.reload_doc("entre_fleet", "doctype", "fleet_vehicle_tyre")
	frappe.reload_doc("entre_fleet", "doctype", "fleet_vehicle")

	for vehicle_name in frappe.get_all("Fleet Vehicle", pluck="name"):
		try:
			vehicle = frappe.get_doc("Fleet Vehicle", vehicle_name)
			vehicle.flags.ignore_mandatory = True
			vehicle.flags.ignore_permissions = True
			vehicle.save()
		except Exception:
			frappe.log_error(
				title=f"Fleet Vehicle tyre resync failed for {vehicle_name}",
				message=frappe.get_traceback(),
			)

	frappe.db.commit()
