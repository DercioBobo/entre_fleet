import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


class FleetDriverAssignment(Document):
	def validate(self):
		if self.end_date and getdate(self.end_date) < getdate(self.start_date):
			frappe.throw(_("Data Fim não pode ser anterior à Data Início."))

	def on_update(self):
		if self.active:
			self.deactivate_other_assignments()
			frappe.db.set_value("Fleet Vehicle", self.vehicle, "assigned_driver", self.driver)
		elif frappe.db.get_value("Fleet Vehicle", self.vehicle, "assigned_driver") == self.driver:
			frappe.db.set_value("Fleet Vehicle", self.vehicle, "assigned_driver", None)

	def deactivate_other_assignments(self):
		other_assignments = frappe.get_all(
			"Fleet Driver Assignment",
			filters={"vehicle": self.vehicle, "active": 1, "name": ["!=", self.name]},
			pluck="name",
		)
		for assignment in other_assignments:
			frappe.db.set_value(
				"Fleet Driver Assignment",
				assignment,
				{"active": 0, "end_date": frappe.utils.today()},
			)
