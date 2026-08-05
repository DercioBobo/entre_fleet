import frappe
from frappe import _
from frappe.model.document import Document

from entre_fleet.entre_fleet.vehicle_utils import recompute_current_odometer


class FleetFuelLog(Document):
	def validate(self):
		self.calculate_total_cost()

	def calculate_total_cost(self):
		self.total_cost = (self.litres or 0) * (self.price_per_litre or 0)

	def before_submit(self):
		vehicle_odometer = frappe.db.get_value("Fleet Vehicle", self.vehicle, "current_odometer")
		if vehicle_odometer and self.odometer < vehicle_odometer:
			frappe.throw(
				_("Odómetro ({0}) não pode ser inferior ao odómetro actual do veículo ({1}).").format(
					self.odometer, vehicle_odometer
				)
			)

	def on_submit(self):
		recompute_current_odometer(self.vehicle)

	def on_cancel(self):
		recompute_current_odometer(self.vehicle)
