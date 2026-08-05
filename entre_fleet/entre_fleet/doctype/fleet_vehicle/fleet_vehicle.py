import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, getdate, today

EXPIRY_FIELDS = (
	("insurance_expiry", "Seguro"),
	("inspection_expiry", "Inspecção"),
	("license_expiry", "Licença"),
)
WARN_WITHIN_DAYS = 30


class FleetVehicle(Document):
	def validate(self):
		self.warn_on_expiring_documents()

	def warn_on_expiring_documents(self):
		warn_threshold = add_days(getdate(today()), WARN_WITHIN_DAYS)

		for fieldname, label in EXPIRY_FIELDS:
			expiry = self.get(fieldname)
			if not expiry:
				continue

			expiry = getdate(expiry)
			if expiry < getdate(today()):
				frappe.msgprint(_("{0} expirado em {1}.").format(_(label), expiry))
			elif expiry <= warn_threshold:
				frappe.msgprint(_("{0} expira em {1} (dentro de 30 dias).").format(_(label), expiry))
