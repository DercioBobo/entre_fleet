import frappe
from frappe import _

from entre_fleet.entre_fleet.doctype.fleet_document_tracker.fleet_document_tracker import (
	get_status_for_expiry,
)

HISTORY_LIMIT = 500

BUILT_IN_DOCUMENTS = (
	("insurance_expiry", "Seguro"),
	("inspection_expiry", "Inspecção"),
	("license_expiry", "Licença"),
)


@frappe.whitelist()
def list_vehicles():
	if not frappe.has_permission("Fleet Vehicle", "read"):
		frappe.throw(_("Não tem permissão para ver veículos."), frappe.PermissionError)

	return frappe.get_all(
		"Fleet Vehicle",
		fields=[
			"name",
			"license_plate",
			"brand",
			"model",
			"year",
			"status",
			"category",
			"fuel_type",
			"current_odometer",
			"assigned_driver",
			"assigned_driver.driver_name as assigned_driver_name",
			"insurance_expiry",
			"inspection_expiry",
			"license_expiry",
		],
		order_by="license_plate asc",
		limit_page_length=0,
	)


@frappe.whitelist()
def get_vehicle_dossier(vehicle):
	if not frappe.has_permission("Fleet Vehicle", "read", vehicle):
		frappe.throw(_("Não tem permissão para ver este veículo."), frappe.PermissionError)

	vehicle_doc = frappe.get_doc("Fleet Vehicle", vehicle)

	assignments = frappe.get_all(
		"Fleet Driver Assignment",
		filters={"vehicle": vehicle, "docstatus": ["!=", 2]},
		fields=[
			"name",
			"driver",
			"driver.driver_name as driver_name",
			"start_date",
			"end_date",
			"active",
			"docstatus",
		],
		order_by="start_date desc, `tabFleet Driver Assignment`.creation desc",
		limit_page_length=HISTORY_LIMIT,
	)

	trips = frappe.get_all(
		"Fleet Trip Log",
		filters={"vehicle": vehicle, "docstatus": ["!=", 2]},
		fields=[
			"name",
			"driver",
			"driver.driver_name as driver_name",
			"odometer_start",
			"odometer_end",
			"departure_datetime",
			"arrival_datetime",
			"route_purpose",
			"fuel_used",
			"docstatus",
		],
		order_by="departure_datetime desc, `tabFleet Trip Log`.creation desc",
		limit_page_length=HISTORY_LIMIT,
	)

	fuel_logs = frappe.get_all(
		"Fleet Fuel Log",
		filters={"vehicle": vehicle, "docstatus": ["!=", 2]},
		fields=[
			"name",
			"creation",
			"driver",
			"driver.driver_name as driver_name",
			"litres",
			"price_per_litre",
			"total_cost",
			"fuel_station",
			"odometer",
			"docstatus",
		],
		order_by="`tabFleet Fuel Log`.creation desc",
		limit_page_length=HISTORY_LIMIT,
	)

	maintenance_requests = frappe.get_all(
		"Fleet Maintenance Request",
		filters={"vehicle": vehicle},
		fields=["name", "status", "priority", "tipo_manutencao", "reported_issue", "opening_date"],
		order_by="opening_date desc, creation desc",
		limit_page_length=HISTORY_LIMIT,
	)

	job_cards = []
	mr_names = [mr.name for mr in maintenance_requests]
	if mr_names:
		job_cards = frappe.get_all(
			"Fleet Job Card",
			filters={"maintenance_request": ["in", mr_names], "docstatus": ["!=", 2]},
			fields=[
				"name",
				"maintenance_request",
				"workshop",
				"labor_cost",
				"total_cost",
				"status",
				"completion_date",
				"creation",
				"docstatus",
			],
			order_by="creation desc",
			limit_page_length=HISTORY_LIMIT,
		)

	tracked_documents = frappe.get_all(
		"Fleet Document Tracker",
		filters={"vehicle": vehicle},
		fields=["name", "document_type", "expiry_date", "status"],
		order_by="expiry_date asc",
		limit_page_length=HISTORY_LIMIT,
	)

	documents = _merge_documents(vehicle_doc, tracked_documents)

	schedules = frappe.get_all(
		"Fleet Maintenance Schedule",
		filters={"vehicle": vehicle},
		fields=["name", "maintenance_type", "interval_days", "last_done_date", "next_due_date", "status"],
		order_by="next_due_date asc",
		limit_page_length=HISTORY_LIMIT,
	)

	return {
		"vehicle": vehicle_doc.as_dict(),
		"assignments": assignments,
		"trips": trips,
		"fuel_logs": fuel_logs,
		"maintenance_requests": maintenance_requests,
		"job_cards": job_cards,
		"documents": documents,
		"schedules": schedules,
		"summary": _build_summary(trips, fuel_logs, maintenance_requests, job_cards, documents, schedules),
	}


def _merge_documents(vehicle_doc, tracked_documents):
	documents = []

	for fieldname, label in BUILT_IN_DOCUMENTS:
		expiry_date = vehicle_doc.get(fieldname)
		if not expiry_date:
			continue
		documents.append(
			{
				"name": None,
				"document_type": label,
				"expiry_date": expiry_date,
				"status": get_status_for_expiry(expiry_date),
				"source": "vehicle",
			}
		)

	for doc in tracked_documents:
		documents.append(
			{
				"name": doc.name,
				"document_type": doc.document_type,
				"expiry_date": doc.expiry_date,
				"status": doc.status,
				"source": "tracker",
			}
		)

	documents.sort(key=lambda d: d["expiry_date"])
	return documents


def _build_summary(trips, fuel_logs, maintenance_requests, job_cards, documents, schedules):
	total_km = 0
	for trip in trips:
		if trip.odometer_start and trip.odometer_end and trip.odometer_end > trip.odometer_start:
			total_km += trip.odometer_end - trip.odometer_start

	open_maintenance = [m for m in maintenance_requests if m.status in ("Aberto", "Em Andamento")]
	expiring_documents = [d for d in documents if d["status"] in ("A Expirar", "Expirado")]
	overdue_schedules = [s for s in schedules if s.status == "Vencido"]

	return {
		"trip_count": len(trips),
		"total_km": total_km,
		"total_fuel_litres": sum(f.litres or 0 for f in fuel_logs),
		"total_fuel_cost": sum(f.total_cost or 0 for f in fuel_logs),
		"total_maintenance_cost": sum(j.total_cost or 0 for j in job_cards),
		"open_maintenance_count": len(open_maintenance),
		"expiring_documents_count": len(expiring_documents),
		"next_maintenance_date": schedules[0].next_due_date if schedules else None,
		"overdue_maintenance_schedules_count": len(overdue_schedules),
	}
