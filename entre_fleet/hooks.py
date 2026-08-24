app_name = "entre_fleet"
app_title = "Entre Fleet"
app_publisher = "Entretech"
app_description = "Gestao de Frotas - Entretech"
app_email = "info@entretech.co.mz"
app_license = "MIT"

# Apps
# ------------------
# erpnext: Fleet Service Order links its "customer" field to ERPNext's own
# Customer doctype rather than duplicating a client list inside this app.
required_apps = ["erpnext"]

# Includes in <head>
# ------------------

app_include_css = "entre_fleet.bundle.css"
app_include_js = "entre_fleet.bundle.js"

# Scheduled Tasks
# ---------------

scheduler_events = {
    "daily": [
        "entre_fleet.entre_fleet.doctype.fleet_document_tracker.fleet_document_tracker.update_expiry_status",
    ],
}
