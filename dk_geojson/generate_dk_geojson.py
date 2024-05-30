from collections import defaultdict
import sys
from sqlalchemy import create_engine, text
from shapely import wkt
from prometheus_api_client import PrometheusConnect
from time import time
import json
import pynetbox
import os

prom = PrometheusConnect(url="https://prometheus.monitoring.emf.camp")

NETBOX_URL = "https://netbox.noc.emfcamp.org/"

netbox = pynetbox.api(
    NETBOX_URL,
    token=os.environ["NETBOX_API_TOKEN"],
)
locations = {
    rack["name"].lower().replace("-", " "): rack for rack in netbox.dcim.locations.all()
}
engine = create_engine(os.environ.get("DB_URL"))
conn = engine.connect()

features = []


def get_monitoring_data():
    data = prom.get_current_metric_value(metric_name="up")
    result = {}
    for row in data:
        if row["value"][1] == "1" and row["value"][0] > time() - 300:
            result[row["metric"]["job"]] = True
        else:
            result[row["metric"]["job"]] = False

    return result


# monitoring_data = get_monitoring_data()
monitoring_data = {}


def device_info(device):
    info = {
        "name": device.name,
        "type": device.device_type.display,
        "url": f"{NETBOX_URL}dcim/devices/{device.id}",
        "status": device.status.label,
        "alive": False,
    }

    # if device.name in monitoring_data:
    #    info["alive"] = monitoring_data[device.name]

    return info


for row in conn.execute(
    text(
        """SELECT switch, ST_AsText(ST_Transform(wkb_geometry, 4326)) AS location
            FROM site_plan
            WHERE lower(layer) = 'noc ... switch'
            AND ST_GeometryType(wkb_geometry) = 'ST_Point'
            """
    )
):
    switch_name = row[0]
    location = locations.get(switch_name.lower())
    if not location:
        print(f"Location not found: '{switch_name}'")
        continue

    devices = list(netbox.dcim.devices.filter(location_id=location["id"]))
    racks = list(netbox.dcim.racks.filter(location_id=location["id"]))

    active = len(devices) > 0 and all(
        dev["status"]["label"] == "Active" for dev in devices
    )
    pos = wkt.loads(row[1])

    props = {
        "name": location["name"],
        "dk": location["name"][:2] == "DK",
        "netbox_url": f"{NETBOX_URL}/dcim/locations/{location.id}/",
        "devices": sorted(
            (device_info(device) for device in devices), key=lambda x: x["type"]
        ),
        "racks": [
            {
                "name": rack.name,
                "url": f"{NETBOX_URL}/dcim/racks/{rack.id}",
            }
            for rack in racks
        ],
        "active": active,
    }

    props["alive"] = all(dev["alive"] for dev in props["devices"] if "alive" in dev)

    features.append(
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": pos.coords[0]},
            "properties": props,
        }
    )


geojson = {"type": "FeatureCollection", "features": features}

with open(sys.argv[1] + "/dk.json", "w", encoding="utf-8") as f:
    json.dump(geojson, f)
