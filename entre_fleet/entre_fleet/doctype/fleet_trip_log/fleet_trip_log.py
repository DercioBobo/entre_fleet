import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate

from entre_fleet.entre_fleet.vehicle_utils import get_latest_fuel_price, recompute_current_odometer


class FleetTripLog(Document):
	def validate(self):
		if self.odometer_end and self.odometer_end <= self.odometer_start:
			frappe.throw(_("Odómetro Final deve ser maior que o Odómetro Inicial."))
		self.check_single_open_trip()
		self.validate_service_trip()
		self.compute_service_conformity()
		self.compute_fuel_estimate()

	def validate_service_trip(self):
		"""A service trip must be tied back to the client's order (one
		Fleet Service Order can be fulfilled by several trips/vehicles) and
		carry at least one destination — otherwise it's indistinguishable
		from an Interno trip and nothing gets tracked."""
		if self.trip_type != "Serviço a Cliente":
			return
		if not self.service_order:
			frappe.throw(_("Indique o Pedido de Serviço para uma viagem do tipo Serviço a Cliente."))
		if not self.get("destinations"):
			frappe.throw(_("Adicione pelo menos um destino para uma viagem do tipo Serviço a Cliente."))

	def compute_service_conformity(self):
		"""Per-destination status (and the overall conformity) is derived
		from eta vs actual_delivery_date, not hand-picked — mirrors what a
		dispatcher used to type into the "Conformidade do Serviço" cell by
		eye, now computed the same way every time."""
		if self.trip_type != "Serviço a Cliente" or not self.get("destinations"):
			self.service_conformity = ""
			return

		for row in self.destinations:
			if row.actual_delivery_date:
				on_time = not row.eta or getdate(row.actual_delivery_date) <= getdate(row.eta)
				row.status = "No Prazo" if on_time else "Atrasado"
			else:
				row.status = "Pendente"

		statuses = [row.status for row in self.destinations]
		if any(s == "Atrasado" for s in statuses):
			self.service_conformity = "Não Conforme"
		elif all(s == "No Prazo" for s in statuses):
			self.service_conformity = "Conforme"
		else:
			self.service_conformity = ""

	def compute_fuel_estimate(self):
		"""Replaces manual "Combustível Usado" entry: litres = distance /
		vehicle's avg_consumption (Km/L), cost = litres * the most recent
		real price paid for that fuel_type (Fleet Fuel Log). Both need real
		inputs to exist — an unset consumption or no fuel purchase history
		yet just leaves the estimate blank rather than guessing further."""
		self.estimated_fuel_used = None
		self.estimated_fuel_cost = None

		if not self.odometer_end or not self.vehicle:
			return

		distance = self.odometer_end - self.odometer_start
		if distance <= 0:
			return

		vehicle = frappe.db.get_value(
			"Fleet Vehicle", self.vehicle, ["avg_consumption", "fuel_type"], as_dict=True
		)
		if not vehicle or not vehicle.avg_consumption:
			return

		self.estimated_fuel_used = distance / vehicle.avg_consumption

		price = get_latest_fuel_price(vehicle.fuel_type)
		if price:
			self.estimated_fuel_cost = self.estimated_fuel_used * price

	def check_single_open_trip(self):
		"""A vehicle can only have one trip 'em curso' (departed, not yet
		returned) at a time — otherwise the Trip Board can't tell whether a
		vehicle is available."""
		if self.docstatus != 0 or self.arrival_datetime:
			return

		other_open = frappe.db.exists(
			"Fleet Trip Log",
			{
				"vehicle": self.vehicle,
				"docstatus": 0,
				"arrival_datetime": ["is", "not set"],
				"name": ["!=", self.name or "new"],
			},
		)
		if other_open:
			frappe.throw(
				_("Já existe uma viagem em curso para este veículo ({0}).").format(other_open)
			)

	def before_submit(self):
		if not self.arrival_datetime or not self.odometer_end:
			frappe.throw(_("Registe a Chegada (data/hora e odómetro final) antes de submeter a viagem."))

		vehicle_odometer = frappe.db.get_value("Fleet Vehicle", self.vehicle, "current_odometer")
		if vehicle_odometer and self.odometer_start < vehicle_odometer:
			frappe.throw(
				_("Odómetro Inicial ({0}) não pode ser inferior ao odómetro actual do veículo ({1}).").format(
					self.odometer_start, vehicle_odometer
				)
			)

	def on_update(self):
		self.sync_service_order_status()

	def on_submit(self):
		recompute_current_odometer(self.vehicle)
		self.sync_service_order_status()

	def on_cancel(self):
		recompute_current_odometer(self.vehicle)
		self.sync_service_order_status()

	def sync_service_order_status(self):
		if not self.service_order:
			return
		from entre_fleet.entre_fleet.doctype.fleet_service_order.fleet_service_order import (
			recompute_status,
		)

		recompute_status(self.service_order)


def _open_trip_names(fieldname, exclude_trip_log):
	"""Vehicles/drivers tied up on a trip that has departed but not yet
	returned — excluded from the New Fleet Trip Log pickers so dispatchers
	can't double-book them. The trip being edited is excluded from its own
	check, same as check_single_open_trip."""
	return frappe.get_all(
		"Fleet Trip Log",
		filters={
			"docstatus": 0,
			"arrival_datetime": ["is", "not set"],
			"name": ["!=", exclude_trip_log or "new"],
		},
		pluck=fieldname,
	)


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def vehicle_query(doctype, txt, searchfield, start, page_len, filters):
	busy = _open_trip_names("vehicle", (filters or {}).get("trip_log"))
	values = {"txt": f"%{txt}%", "status": "Activo", "start": start, "page_len": page_len}
	condition = ""
	if busy:
		values["busy"] = busy
		condition = "and name not in %(busy)s"

	return frappe.db.sql(
		f"""select name, license_plate
		from `tabFleet Vehicle`
		where status = %(status)s
		and ({searchfield} like %(txt)s or license_plate like %(txt)s)
		{condition}
		order by license_plate
		limit %(page_len)s offset %(start)s""",
		values,
	)


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def driver_query(doctype, txt, searchfield, start, page_len, filters):
	busy = _open_trip_names("driver", (filters or {}).get("trip_log"))
	values = {"txt": f"%{txt}%", "status": "Activo", "start": start, "page_len": page_len}
	condition = ""
	if busy:
		values["busy"] = busy
		condition = "and name not in %(busy)s"

	return frappe.db.sql(
		f"""select name, driver_name
		from `tabFleet Driver`
		where status = %(status)s
		and ({searchfield} like %(txt)s or driver_name like %(txt)s)
		{condition}
		order by driver_name
		limit %(page_len)s offset %(start)s""",
		values,
	)
