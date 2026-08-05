import frappe


def recompute_current_odometer(vehicle):
	"""Recompute Fleet Vehicle.current_odometer as the max reading across all
	submitted Trip Log / Fuel Log entries for this vehicle. Called from both
	doctypes' on_submit/on_cancel so the result is always correct regardless
	of the order records get submitted, cancelled, or amended in."""
	trip_max = frappe.db.sql(
		"""select max(coalesce(odometer_end, odometer_start))
		from `tabFleet Trip Log`
		where vehicle=%s and docstatus=1""",
		vehicle,
	)[0][0] or 0

	fuel_max = frappe.db.sql(
		"""select max(odometer)
		from `tabFleet Fuel Log`
		where vehicle=%s and docstatus=1""",
		vehicle,
	)[0][0] or 0

	frappe.db.set_value("Fleet Vehicle", vehicle, "current_odometer", max(trip_max, fuel_max))
