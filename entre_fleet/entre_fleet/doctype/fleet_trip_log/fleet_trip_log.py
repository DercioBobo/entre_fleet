import frappe
from frappe import _
from frappe.model.document import Document


class FleetTripLog(Document):
	def validate(self):
		self.validate_odometer()
		self.update_vehicle_odometer()

	def validate_odometer(self):
		if self.odometer_end and self.odometer_end <= self.odometer_start:
			frappe.throw(_("Odómetro Final deve ser maior que o Odómetro Inicial."))

		vehicle_odometer = frappe.db.get_value("Fleet Vehicle", self.vehicle, "current_odometer")
		if vehicle_odometer and self.odometer_start < vehicle_odometer:
			frappe.throw(
				_("Odómetro Inicial ({0}) não pode ser inferior ao odómetro actual do veículo ({1}).").format(
					self.odometer_start, vehicle_odometer
				)
			)

	def update_vehicle_odometer(self):
		latest_reading = self.odometer_end or self.odometer_start
		frappe.db.set_value("Fleet Vehicle", self.vehicle, "current_odometer", latest_reading)
