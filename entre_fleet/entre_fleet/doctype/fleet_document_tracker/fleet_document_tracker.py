import frappe
from frappe.model.document import Document
from frappe.utils import add_days, getdate, today

WARN_WITHIN_DAYS = 30


def get_status_for_expiry(expiry_date):
	expiry_date = getdate(expiry_date)
	if expiry_date < getdate(today()):
		return "Expirado"
	if expiry_date <= add_days(getdate(today()), WARN_WITHIN_DAYS):
		return "A Expirar"
	return "Válido"


class FleetDocumentTracker(Document):
	def validate(self):
		self.status = get_status_for_expiry(self.expiry_date)


def update_expiry_status():
	"""Daily scheduled job (see hooks.py) that refreshes the status of every
	Fleet Document Tracker record based on its expiry_date."""
	for tracker in frappe.get_all("Fleet Document Tracker", fields=["name", "expiry_date"]):
		status = get_status_for_expiry(tracker.expiry_date)
		frappe.db.set_value("Fleet Document Tracker", tracker.name, "status", status)
