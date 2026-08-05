import frappe
from frappe import _
from frappe.model.document import Document

from entre_fleet.entre_fleet.vehicle_utils import recompute_current_odometer


class FleetTripLog(Document):
	def validate(self):
		if self.odometer_end and self.odometer_end <= self.odometer_start:
			frappe.throw(_("Odómetro Final deve ser maior que o Odómetro Inicial."))

	def before_submit(self):
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
