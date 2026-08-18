import frappe
from frappe import _
from frappe.model.document import Document

from entre_fleet.entre_fleet.vehicle_utils import recompute_current_odometer


class FleetTripLog(Document):
	def validate(self):
		if self.odometer_end and self.odometer_end <= self.odometer_start:
			frappe.throw(_("Odómetro Final deve ser maior que o Odómetro Inicial."))
		self.check_single_open_trip()
		self.validate_cargo()

	def validate_cargo(self):
		"""Cargo is mandatory for every vehicle type except Administrativo —
		enforced here (not just via mandatory_depends_on) so it also holds for
		trips created straight from the Trip Board dialogs, which bypass the
		standard form's client-side fetch_from."""
		if not self.vehicle:
			return

		vehicle_type = frappe.db.get_value("Fleet Vehicle", self.vehicle, "vehicle_type")
		if vehicle_type and vehicle_type != "Administrativo" and not self.cargo:
			frappe.throw(
				_("Indique a Carga transportada (obrigatório para viaturas do tipo {0}).").format(vehicle_type)
			)

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

	def on_submit(self):
		recompute_current_odometer(self.vehicle)

	def on_cancel(self):
		recompute_current_odometer(self.vehicle)
