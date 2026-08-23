import frappe
from frappe.model.document import Document


class FleetServiceOrder(Document):
	pass


def recompute_status(service_order_name):
	"""Roll the order's status up from its linked Fleet Trip Log dispatches.

	One client reference can be served by several vehicles/trips, each with
	its own destinations, so the order is only "Concluída" once every trip
	has returned and every destination has been delivered — and "Não
	Conforme" if any destination ended up late. Called from Fleet Trip Log
	whenever a trip or one of its destinations changes.
	"""
	if not service_order_name:
		return

	trips = frappe.get_all(
		"Fleet Trip Log",
		filters={"service_order": service_order_name, "docstatus": ["!=", 2]},
		fields=["name", "arrival_datetime"],
	)

	if not trips:
		status = "Aberta"
	else:
		destinations = frappe.get_all(
			"Fleet Trip Destination",
			filters={"parent": ["in", [t.name for t in trips]]},
			fields=["status"],
		)
		any_open_trip = any(not t.arrival_datetime for t in trips)
		any_pending = any((d.status or "Pendente") == "Pendente" for d in destinations)
		any_late = any(d.status == "Atrasado" for d in destinations)

		if any_open_trip or any_pending:
			status = "Em Andamento"
		elif any_late:
			status = "Não Conforme"
		else:
			status = "Concluída"

	frappe.db.set_value("Fleet Service Order", service_order_name, "status", status)
