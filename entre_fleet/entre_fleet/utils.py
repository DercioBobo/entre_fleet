from frappe.utils import add_days, getdate, today

WARN_WITHIN_DAYS = 30


def classify_expiry(date, warn_within_days=WARN_WITHIN_DAYS):
	"""Classify a date as "overdue" (in the past), "warning" (within
	warn_within_days from today), or "ok" (further out than that)."""
	date = getdate(date)
	if date < getdate(today()):
		return "overdue"
	if date <= add_days(getdate(today()), warn_within_days):
		return "warning"
	return "ok"
