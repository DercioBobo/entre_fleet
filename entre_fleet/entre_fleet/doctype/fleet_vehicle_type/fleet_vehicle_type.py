import frappe
from frappe import _
from frappe.model.document import Document


class FleetVehicleType(Document):
	def validate(self):
		if self.code:
			self.code = self.code.strip().upper()
			if not self.code.isalnum():
				frappe.throw(_("Código deve conter apenas letras e números."))
