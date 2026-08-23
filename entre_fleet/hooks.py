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

app_include_css = "/assets/entre_fleet/css/entre_fleet.css"
app_include_js = ["/assets/entre_fleet/js/entre_fleet.js"]

# Scheduled Tasks
# ---------------

scheduler_events = {
    "daily": [
        "entre_fleet.entre_fleet.doctype.fleet_document_tracker.fleet_document_tracker.update_expiry_status",
    ],
}
