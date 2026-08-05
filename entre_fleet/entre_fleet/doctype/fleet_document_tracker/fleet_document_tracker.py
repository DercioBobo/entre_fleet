import frappe
from frappe.model.document import Document

from entre_fleet.entre_fleet.utils import classify_expiry

STATUS_LABEL = {
	"ok": "Válido",
	"warning": "A Expirar",
	"overdue": "Expirado",
}


def get_status_for_expiry(expiry_date):
	return STATUS_LABEL[classify_expiry(expiry_date)]


class FleetDocumentTracker(Document):
	def validate(self):
		self.status = get_status_for_expiry(self.expiry_date)


def update_expiry_status():
	"""Daily scheduled job (see hooks.py) that refreshes the status of every
	Fleet Document Tracker record based on its expiry_date."""
	for tracker in frappe.get_all("Fleet Document Tracker", fields=["name", "expiry_date"]):
		status = get_status_for_expiry(tracker.expiry_date)
		frappe.db.set_value("Fleet Document Tracker", tracker.name, "status", status)
