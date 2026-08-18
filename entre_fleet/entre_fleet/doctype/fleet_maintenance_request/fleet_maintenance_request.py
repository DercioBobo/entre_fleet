import frappe
from frappe.model.document import Document
from frappe.utils import today


class FleetMaintenanceRequest(Document):
	def on_update(self):
		if self.status == "Concluído" and self.maintenance_schedule:
			self.push_schedule_completion()

	def push_schedule_completion(self):
		schedule = frappe.get_doc("Fleet Maintenance Schedule", self.maintenance_schedule)
		if schedule.interval_days:
			schedule.last_done_date = self.completion_date or self.opening_date or today()
		if schedule.interval_km:
			schedule.last_done_odometer = frappe.db.get_value("Fleet Vehicle", self.vehicle, "current_odometer")
		schedule.save()
