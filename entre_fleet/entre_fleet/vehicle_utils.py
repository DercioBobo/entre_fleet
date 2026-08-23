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


def get_latest_fuel_price(fuel_type):
	"""Most recent price_per_litre paid for this fuel_type, fleet-wide —
	used to estimate a trip's fuel cost without asking anyone to type a
	price in twice. Sourced from real (submitted) Fleet Fuel Log purchases,
	not vehicle-specific since fuel price tracks the market, not the truck."""
	if not fuel_type:
		return None

	row = frappe.db.sql(
		"""select fl.price_per_litre
		from `tabFleet Fuel Log` fl
		inner join `tabFleet Vehicle` v on v.name = fl.vehicle
		where v.fuel_type = %s and fl.docstatus = 1
		order by fl.creation desc
		limit 1""",
		fuel_type,
	)
	return row[0][0] if row else None
