import frappe
from frappe import _
from frappe.model.document import Document


class FleetJobCard(Document):
	def validate(self):
		self.calculate_totals()

	def calculate_totals(self):
		items_total = 0
		for item in self.items:
			item.amount = (item.qty or 0) * (item.rate or 0)
			items_total += item.amount

		self.total_cost = (self.labor_cost or 0) + items_total

	def before_submit(self):
		if self.status != "Concluído":
			frappe.throw(_("Só é possível submeter uma Ordem de Serviço com Estado 'Concluído'."))
