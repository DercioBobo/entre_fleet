import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days

from entre_fleet.entre_fleet.utils import classify_expiry

STATUS_LABEL = {
	"ok": "Agendado",
	"warning": "A Vencer",
	"overdue": "Vencido",
}


class FleetMaintenanceSchedule(Document):
	def validate(self):
		self.check_duplicate()
		self.compute_next_due_date()
		self.compute_status()
		self.compute_event_title()

	def check_duplicate(self):
		duplicate = frappe.db.exists(
			"Fleet Maintenance Schedule",
			{
				"vehicle": self.vehicle,
				"maintenance_type": self.maintenance_type,
				"name": ["!=", self.name or ""],
			},
		)
		if duplicate:
			frappe.throw(
				_("Já existe um plano de '{0}' para este veículo ({1}).").format(
					self.maintenance_type, duplicate
				)
			)

	def compute_next_due_date(self):
		self.next_due_date = add_days(self.last_done_date, self.interval_days)

	def compute_status(self):
		self.status = STATUS_LABEL[classify_expiry(self.next_due_date)]

	def compute_event_title(self):
		plate = frappe.db.get_value("Fleet Vehicle", self.vehicle, "license_plate") or self.vehicle
		self.event_title = f"{plate} · {self.maintenance_type}"
