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
		self.sync_tyre_positions()
		self.sync_battery_positions()

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

	def sync_tyre_positions(self):
		labels = []
		for axle in range(1, (self.axle_count or 0) + 1):
			labels.append(f"{axle}º Eixo Esquerdo")
			labels.append(f"{axle}º Eixo Direito")
		self._sync_position_table("tyres", labels)

	def sync_battery_positions(self):
		labels = [f"Bateria {n}" for n in range(1, (self.battery_count or 0) + 1)]
		self._sync_position_table("batteries", labels)

	def _sync_position_table(self, fieldname, expected_labels):
		current_labels = [row.position_label for row in self.get(fieldname)]
		if current_labels == expected_labels:
			return

		existing_state = {
			row.position_label: {"condition": row.condition, "last_changed_date": row.last_changed_date}
			for row in self.get(fieldname)
		}
		self.set(fieldname, [])
		for label in expected_labels:
			state = existing_state.get(label, {})
			self.append(
				fieldname,
				{
					"position_label": label,
					"condition": state.get("condition"),
					"last_changed_date": state.get("last_changed_date"),
				},
			)
