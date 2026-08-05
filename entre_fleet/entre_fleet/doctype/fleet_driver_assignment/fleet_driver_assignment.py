import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


class FleetDriverAssignment(Document):
	def validate(self):
		if self.end_date and getdate(self.end_date) < getdate(self.start_date):
			frappe.throw(_("Data Fim não pode ser anterior à Data Início."))

	def on_submit(self):
		if self.active:
			self.deactivate_other_assignments()
			frappe.db.set_value("Fleet Vehicle", self.vehicle, "assigned_driver", self.driver)

	def on_cancel(self):
		if frappe.db.get_value("Fleet Vehicle", self.vehicle, "assigned_driver") != self.driver:
			return

		next_active = frappe.get_all(
			"Fleet Driver Assignment",
			filters={
				"vehicle": self.vehicle,
				"active": 1,
				"docstatus": 1,
				"name": ["!=", self.name],
			},
			fields=["driver"],
			order_by="start_date desc",
			limit_page_length=1,
		)
		new_driver = next_active[0].driver if next_active else None
		frappe.db.set_value("Fleet Vehicle", self.vehicle, "assigned_driver", new_driver)

	def deactivate_other_assignments(self):
		other_assignments = frappe.get_all(
			"Fleet Driver Assignment",
			filters={"vehicle": self.vehicle, "active": 1, "docstatus": 1, "name": ["!=", self.name]},
			pluck="name",
		)
		for assignment in other_assignments:
			frappe.db.set_value(
				"Fleet Driver Assignment",
				assignment,
				{"active": 0, "end_date": frappe.utils.today()},
			)
