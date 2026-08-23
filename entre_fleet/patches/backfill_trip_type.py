import frappe


def execute():
	"""Fleet Trip Log gained trip_type (default "Interno") when Fleet Service
	Order / multi-destination dispatch support was added — backfill it onto
	rows saved before the field existed, since Select defaults only apply on
	insert, not to existing data."""
	frappe.reload_doc("entre_fleet", "doctype", "fleet_trip_log")

	frappe.db.sql(
		"""update `tabFleet Trip Log` set trip_type = 'Interno'
		where trip_type is null or trip_type = ''"""
	)
	frappe.db.commit()
