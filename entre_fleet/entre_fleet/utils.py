from frappe.utils import add_days, getdate, today

WARN_WITHIN_DAYS = 30
WARN_WITHIN_KM = 1000

STATUS_RANK = {"ok": 0, "warning": 1, "overdue": 2}


def classify_expiry(date, warn_within_days=WARN_WITHIN_DAYS):
	"""Classify a date as "overdue" (in the past), "warning" (within
	warn_within_days from today), or "ok" (further out than that)."""
	date = getdate(date)
	if date < getdate(today()):
		return "overdue"
	if date <= add_days(getdate(today()), warn_within_days):
		return "warning"
	return "ok"


def classify_km_expiry(current_odometer, due_odometer, warn_within_km=WARN_WITHIN_KM):
	"""Classify a due odometer reading as "overdue" (already passed), "warning"
	(within warn_within_km from the current odometer), or "ok" (further out)."""
	current_odometer = current_odometer or 0
	if current_odometer >= due_odometer:
		return "overdue"
	if current_odometer >= due_odometer - warn_within_km:
		return "warning"
	return "ok"
