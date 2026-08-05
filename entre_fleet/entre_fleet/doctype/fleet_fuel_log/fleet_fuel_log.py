import frappe
from frappe import _
from frappe.model.document import Document


class FleetFuelLog(Document):
	def validate(self):
		self.calculate_total_cost()
		self.validate_odometer()
		self.update_vehicle_odometer()

	def calculate_total_cost(self):
		self.total_cost = (self.litres or 0) * (self.price_per_litre or 0)

	def validate_odometer(self):
		vehicle_odometer = frappe.db.get_value("Fleet Vehicle", self.vehicle, "current_odometer")
		if vehicle_odometer and self.odometer < vehicle_odometer:
			frappe.throw(
				_("Odómetro ({0}) não pode ser inferior ao odómetro actual do veículo ({1}).").format(
					self.odometer, vehicle_odometer
				)
			)

	def update_vehicle_odometer(self):
		frappe.db.set_value("Fleet Vehicle", self.vehicle, "current_odometer", self.odometer)
