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
