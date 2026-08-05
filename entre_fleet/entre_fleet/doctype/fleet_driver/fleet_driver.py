import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, today


class FleetDriver(Document):
	def validate(self):
		self.warn_on_expired_license()

	def warn_on_expired_license(self):
		if self.license_expiry and getdate(self.license_expiry) < getdate(today()):
			frappe.msgprint(_("Carta de Condução expirada em {0}.").format(getdate(self.license_expiry)))
