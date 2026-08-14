import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days

from entre_fleet.entre_fleet.utils import STATUS_RANK, classify_expiry, classify_km_expiry

STATUS_LABEL = {
	"ok": "Agendado",
	"warning": "A Vencer",
	"overdue": "Vencido",
}


class FleetMaintenanceSchedule(Document):
	def validate(self):
		self.check_interval_given()
		self.check_duplicate()
		self.compute_next_due_date()
		self.compute_next_due_km()
		self.compute_status()
		self.compute_event_title()

	def check_interval_given(self):
		if not self.interval_days and not self.interval_km:
			frappe.throw(_("Indique um intervalo por dias e/ou por quilometragem."))

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
		self.next_due_date = (
			add_days(self.last_done_date, self.interval_days)
			if self.interval_days and self.last_done_date
			else None
		)

	def compute_next_due_km(self):
		self.next_due_km = ((self.last_done_odometer or 0) + self.interval_km) if self.interval_km else None

	def compute_status(self):
		classifications = []
		if self.next_due_date:
			classifications.append(classify_expiry(self.next_due_date))
		if self.next_due_km:
			current_odometer = frappe.db.get_value("Fleet Vehicle", self.vehicle, "current_odometer") or 0
			classifications.append(classify_km_expiry(current_odometer, self.next_due_km))

		worst = max(classifications, key=lambda c: STATUS_RANK[c]) if classifications else "ok"
		self.status = STATUS_LABEL[worst]

	def compute_event_title(self):
		plate = frappe.db.get_value("Fleet Vehicle", self.vehicle, "license_plate") or self.vehicle
		self.event_title = f"{plate} · {self.maintenance_type}"
