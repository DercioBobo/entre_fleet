import datetime

import frappe
from frappe import _

from entre_fleet.entre_fleet.doctype.fleet_document_tracker.fleet_document_tracker import (
	get_status_for_expiry,
)

HISTORY_LIMIT = 500

SCHEDULE_STATUS_RANK = {"Vencido": 0, "A Vencer": 1, "Agendado": 2}
FAR_FUTURE_DATE = datetime.date.max

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
			"vehicle_type",
			"brand",
			"model",
			"year",
			"status",
			"category",
			"fuel_type",
			"current_odometer",
			"insurance_expiry",
			"inspection_expiry",
			"license_expiry",
		],
		order_by="license_plate asc",
		limit_page_length=0,
	)


@frappe.whitelist()
def get_trip_board():
	if not frappe.has_permission("Fleet Trip Log", "read"):
		frappe.throw(_("Não tem permissão para ver viagens."), frappe.PermissionError)

	vehicles = frappe.get_all(
		"Fleet Vehicle",
		filters={"status": ["!=", "Abatido"]},
		fields=[
			"name",
			"license_plate",
			"vehicle_type",
			"brand",
			"model",
			"status",
			"current_odometer",
		],
		order_by="license_plate asc",
		limit_page_length=0,
	)

	open_trips = frappe.get_all(
		"Fleet Trip Log",
		filters={"docstatus": 0, "arrival_datetime": ["is", "not set"]},
		fields=[
			"name",
			"vehicle",
			"driver",
			"driver.driver_name as driver_name",
			"departure_datetime",
			"odometer_start",
			"route",
			"cargo",
		],
	)
	open_trip_by_vehicle = {t.vehicle: t for t in open_trips}

	for vehicle in vehicles:
		vehicle["open_trip"] = open_trip_by_vehicle.get(vehicle.name)

	drivers = frappe.get_all(
		"Fleet Driver",
		filters={"status": "Activo"},
		fields=["name", "driver_name"],
		order_by="driver_name asc",
		limit_page_length=0,
	)

	return {"vehicles": vehicles, "drivers": drivers}


@frappe.whitelist()
def start_trip(vehicle, driver, odometer_start, departure_datetime=None, route=None, cargo=None):
	if not frappe.has_permission("Fleet Trip Log", "create"):
		frappe.throw(_("Não tem permissão para registar viagens."), frappe.PermissionError)

	trip = frappe.new_doc("Fleet Trip Log")
	trip.vehicle = vehicle
	trip.driver = driver
	trip.odometer_start = frappe.utils.flt(odometer_start)
	trip.departure_datetime = departure_datetime or frappe.utils.now_datetime()
	trip.route = route
	trip.cargo = cargo
	trip.insert()
	return trip.name


@frappe.whitelist()
def end_trip(trip_log, arrival_datetime, odometer_end, fuel_used=None, route=None, cargo=None):
	if not frappe.has_permission("Fleet Trip Log", "submit"):
		frappe.throw(_("Não tem permissão para concluir viagens."), frappe.PermissionError)

	trip = frappe.get_doc("Fleet Trip Log", trip_log)
	trip.arrival_datetime = arrival_datetime
	trip.odometer_end = frappe.utils.flt(odometer_end)
	if fuel_used:
		trip.fuel_used = frappe.utils.flt(fuel_used)
	if route:
		trip.route = route
	if cargo:
		trip.cargo = cargo
	trip.save()
	trip.submit()
	return trip.name


MAINTENANCE_PLAN_OPEN_STATUSES = ("Aberto", "Em Andamento", "Parado")


@frappe.whitelist()
def get_maintenance_plan():
	if not frappe.has_permission("Fleet Maintenance Request", "read"):
		frappe.throw(_("Não tem permissão para ver o plano de manutenção."), frappe.PermissionError)

	requests = frappe.get_all(
		"Fleet Maintenance Request",
		fields=[
			"name",
			"vehicle",
			"vehicle.license_plate as license_plate",
			"vehicle.brand as brand",
			"vehicle.model as model",
			"vehicle.vehicle_type as vehicle_type",
			"tipo_manutencao",
			"maintenance_schedule",
			"status",
			"priority",
			"responsavel",
			"opening_date",
			"completion_date",
			"periodicity_km",
			"odometer_at_request",
			"next_due_km",
			"reported_issue",
			"required_parts",
			"remarks",
		],
		order_by="opening_date desc, `tabFleet Maintenance Request`.creation desc",
		limit_page_length=0,
	)

	schedules = frappe.get_all(
		"Fleet Maintenance Schedule",
		fields=[
			"name",
			"vehicle",
			"vehicle.license_plate as license_plate",
			"vehicle.brand as brand",
			"vehicle.model as model",
			"maintenance_type",
			"status",
			"interval_days",
			"interval_km",
			"last_done_date",
			"last_done_odometer",
			"next_due_date",
			"next_due_km",
		],
		order_by="next_due_date asc",
		limit_page_length=0,
	)

	vehicles = frappe.get_all(
		"Fleet Vehicle",
		filters={"status": ["!=", "Abatido"]},
		fields=["name", "license_plate", "brand", "model", "vehicle_type"],
		order_by="license_plate asc",
		limit_page_length=0,
	)

	technicians = frappe.get_all(
		"Fleet Maintenance Request",
		filters={"responsavel": ["is", "set"]},
		fields=["responsavel"],
		distinct=True,
		order_by="responsavel asc",
		pluck="responsavel",
	)

	status_counts = {"Aberto": 0, "Em Andamento": 0, "Parado": 0, "Concluído": 0, "Cancelado": 0}
	for r in requests:
		if r.status in status_counts:
			status_counts[r.status] += 1

	overdue_schedules = len([s for s in schedules if s.status == "Vencido"])
	due_soon_schedules = len([s for s in schedules if s.status == "A Vencer"])

	return {
		"requests": requests,
		"schedules": schedules,
		"vehicles": vehicles,
		"technicians": technicians,
		"summary": {
			"total": len(requests),
			"status_counts": status_counts,
			"open_count": sum(status_counts[s] for s in MAINTENANCE_PLAN_OPEN_STATUSES),
			"overdue_schedules": overdue_schedules,
			"due_soon_schedules": due_soon_schedules,
		},
	}


@frappe.whitelist()
def create_maintenance_request(
	vehicle,
	tipo_manutencao,
	reported_issue,
	maintenance_schedule=None,
	status=None,
	priority=None,
	responsavel=None,
	opening_date=None,
	completion_date=None,
	periodicity_km=None,
	odometer_at_request=None,
	next_due_km=None,
	required_parts=None,
	remarks=None,
):
	if not frappe.has_permission("Fleet Maintenance Request", "create"):
		frappe.throw(_("Não tem permissão para criar pedidos de manutenção."), frappe.PermissionError)

	doc = frappe.new_doc("Fleet Maintenance Request")
	doc.vehicle = vehicle
	doc.tipo_manutencao = tipo_manutencao
	doc.reported_issue = reported_issue
	doc.maintenance_schedule = maintenance_schedule
	doc.priority = priority
	doc.responsavel = responsavel
	doc.required_parts = required_parts
	doc.remarks = remarks
	if status:
		doc.status = status
	if opening_date:
		doc.opening_date = opening_date
	if completion_date:
		doc.completion_date = completion_date
	if periodicity_km:
		doc.periodicity_km = frappe.utils.cint(periodicity_km)
	if odometer_at_request:
		doc.odometer_at_request = frappe.utils.flt(odometer_at_request)
	if next_due_km:
		doc.next_due_km = frappe.utils.flt(next_due_km)
	doc.insert()
	return doc.name


@frappe.whitelist()
def create_maintenance_schedule(
	vehicle,
	maintenance_type,
	interval_days=None,
	last_done_date=None,
	interval_km=None,
	last_done_odometer=None,
):
	if not frappe.has_permission("Fleet Maintenance Schedule", "create"):
		frappe.throw(_("Não tem permissão para criar planos de manutenção."), frappe.PermissionError)

	doc = frappe.new_doc("Fleet Maintenance Schedule")
	doc.vehicle = vehicle
	doc.maintenance_type = maintenance_type
	if interval_days:
		doc.interval_days = frappe.utils.cint(interval_days)
	if last_done_date:
		doc.last_done_date = last_done_date
	if interval_km:
		doc.interval_km = frappe.utils.cint(interval_km)
	if last_done_odometer:
		doc.last_done_odometer = frappe.utils.flt(last_done_odometer)
	doc.insert()
	return doc.name


@frappe.whitelist()
def set_maintenance_status(name, status):
	if not frappe.has_permission("Fleet Maintenance Request", "write", name):
		frappe.throw(_("Não tem permissão para alterar este pedido."), frappe.PermissionError)

	doc = frappe.get_doc("Fleet Maintenance Request", name)
	doc.status = status
	if status == "Concluído" and not doc.completion_date:
		doc.completion_date = frappe.utils.today()
	doc.save()
	return doc.status


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
			"route",
			"cargo",
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
		fields=[
			"name",
			"status",
			"priority",
			"tipo_manutencao",
			"responsavel",
			"reported_issue",
			"required_parts",
			"remarks",
			"opening_date",
			"completion_date",
			"periodicity_km",
			"odometer_at_request",
			"next_due_km",
		],
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
		fields=[
			"name",
			"maintenance_type",
			"interval_days",
			"last_done_date",
			"next_due_date",
			"interval_km",
			"last_done_odometer",
			"next_due_km",
			"status",
		],
		limit_page_length=HISTORY_LIMIT,
	)
	schedules.sort(key=lambda s: (SCHEDULE_STATUS_RANK.get(s.status, 9), s.next_due_date or FAR_FUTURE_DATE))

	inspections = frappe.get_all(
		"Fleet Vehicle Inspection",
		filters={"vehicle": vehicle, "docstatus": ["!=", 2]},
		fields=[
			"name",
			"inspection_date",
			"driver",
			"driver.driver_name as driver_name",
			"overall_status",
			"non_conformities_count",
			"docstatus",
		],
		order_by="inspection_date desc, `tabFleet Vehicle Inspection`.creation desc",
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
		"inspections": inspections,
		"summary": _build_summary(
			trips, fuel_logs, maintenance_requests, job_cards, documents, schedules, inspections
		),
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


def _build_summary(trips, fuel_logs, maintenance_requests, job_cards, documents, schedules, inspections):
	total_km = 0
	for trip in trips:
		if trip.odometer_start and trip.odometer_end and trip.odometer_end > trip.odometer_start:
			total_km += trip.odometer_end - trip.odometer_start

	open_maintenance = [m for m in maintenance_requests if m.status in ("Aberto", "Em Andamento", "Parado")]
	expiring_documents = [d for d in documents if d["status"] in ("A Expirar", "Expirado")]
	overdue_schedules = [s for s in schedules if s.status == "Vencido"]
	non_conforming_inspections = [i for i in inspections if i.overall_status == "Não Conforme"]

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
		"inspection_count": len(inspections),
		"non_conforming_inspections_count": len(non_conforming_inspections),
	}
