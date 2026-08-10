"""Explicit request-to-model mappings for the current Job contract."""

from __future__ import annotations

from typing import Any


JOB_CREATE_UNSUPPORTED_FIELDS = frozenset(
    {
        "ticket_number", "panne_type", "manipulations_realisees",
        "ancien_operateur", "nouvel_operateur", "ancien_ont_serial",
        "ancien_router_serial", "port_source", "port_destination",
        "nombre_fibres", "boite_raccordement", "reserve_cable",
        "type_cable", "etat_pbo", "etat_pto", "etat_cable", "anomalies",
    }
)


JOB_CREATE_FIELD_MAPPING = {
    "customer_name": "customer_name", "customer_phone": "customer_phone",
    "customer_email": "customer_email", "service_address": "service_address",
    "service_city": "service_city", "service_zip": "service_zip",
    "job_number": "job_number", "job_type": "job_type",
    "latitude": "latitude", "longitude": "longitude",
    "required_skills": "required_skills", "route_criteria": "route_criteria",
    "priority": "priority", "scheduled_date": "scheduled_date",
    "time_slot_start": "time_slot_start", "time_slot_end": "time_slot_end",
    "estimated_duration": "estimated_duration", "description": "description",
    "notes": "notes", "special_instructions": "special_instructions",
    "equipment_type": "equipment_type", "serial_number": "serial_number",
    "client_signature": "client_signature",
    "real_duration_minutes": "real_duration_minutes",
    "assigned_technician_name": "assigned_technician_name",
    "client_organization_id": "client_organization_id",
    "operator": "operator", "nro": "nro_raw", "sro": "sro_raw",
    "pbo": "pbo_raw", "pto": "pto_raw", "splitter": "splitter_raw",
    "splitter_port": "splitter_port_raw",
    "optical_power_dbm": "optical_power_dbm",
    "cable_length_m": "cable_length_m", "ont_serial": "ont_serial",
    "router_serial": "router_serial", "mac_address": "mac_address",
}


TECH_FIELD_MODEL_MAPPING = {
    "wifi_box_serial": "wifi_box_serial", "ont_serial": "ont_serial",
    "router_serial": "router_serial", "mac_address": "mac_address",
    "gps_latitude": "gps_latitude", "gps_longitude": "gps_longitude",
    "coordinator_comments": "coordinator_comments",
    "before_photo": "before_photo", "after_photo": "after_photo",
    "client_signature": "client_signature",
    "optical_power_dbm": "optical_power_dbm",
    "cable_length_m": "cable_length_m", "nro": "nro_raw",
    "sro": "sro_raw", "pbo": "pbo_raw", "splitter": "splitter_raw",
    "splitter_port": "splitter_port_raw", "pto": "pto_raw",
    "real_duration_minutes": "real_duration_minutes",
}


def job_create_kwargs(payload: Any, *, orienteur_id: int | None) -> dict:
    data = payload.model_dump()
    mapped = {
        model_name: data[api_name]
        for api_name, model_name in JOB_CREATE_FIELD_MAPPING.items()
    }
    mapped["orienteur_id"] = orienteur_id
    return mapped


def technician_field_kwargs(data: dict[str, Any]) -> dict[str, Any]:
    mapped: dict[str, Any] = {}
    for api_name, value in data.items():
        model_name = TECH_FIELD_MODEL_MAPPING.get(api_name)
        if model_name is None:
            continue
        if isinstance(value, str):
            value = value.strip() or None
        if value is not None:
            mapped[model_name] = value
    return mapped
