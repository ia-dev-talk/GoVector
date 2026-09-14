import math


class ExcelValidator:

    # Pilot rule: an operational order may arrive incomplete and be enriched by
    # dispatch or the field later. Missing context is visible, not fabricated
    # and not blocking.
    REQUIRED_FIELDS = [
        "job_number",
        "job_type",
    ]

    SOFT_REQUIRED_FIELDS = [
        "customer_name",
        "service_address",
        "nro",
        "pbo",
        "scheduled_date",
    ]

    RELIABLE_GPS_SOURCES = {
        "GPS_PCO",
        "GPS_DERIVATION",
        "GPS_SPLITTER",
        "geocoded",
    }

    def __init__(self, jobs):

        self.jobs = jobs

    @staticmethod
    def _has_reliable_coordinates(job):

        if job.get("gps_source") not in ExcelValidator.RELIABLE_GPS_SOURCES:
            return False

        latitude = job.get("latitude")
        longitude = job.get("longitude")

        if (
            latitude is None
            or longitude is None
            or isinstance(latitude, bool)
            or isinstance(longitude, bool)
        ):
            return False

        try:
            latitude = float(latitude)
            longitude = float(longitude)
        except (TypeError, ValueError):
            return False

        return (
            math.isfinite(latitude)
            and math.isfinite(longitude)
            and -90 <= latitude <= 90
            and -180 <= longitude <= 180
        )

    @staticmethod
    def _unique_messages(messages):

        unique = []

        for message in messages:
            if (
                isinstance(message, str)
                and message
                and message not in unique
            ):
                unique.append(message)

        return unique

    def validate(self):

        annotated_jobs = []
        warnings = []
        valid_count = 0

        for index, job in enumerate(self.jobs):

            copy = dict(job)
            missing = []
            validation_errors = []
            soft_missing = []

            for field in self.REQUIRED_FIELDS:

                value = copy.get(field)

                if value is None or (
                    isinstance(value, str)
                    and value.strip() == ""
                ):
                    missing.append(field)

            for field in self.SOFT_REQUIRED_FIELDS:

                value = copy.get(field)

                if value is None or (
                    isinstance(value, str)
                    and value.strip() == ""
                ):
                    soft_missing.append(field)

            if not self._has_reliable_coordinates(copy):
                soft_missing.append("gps_coordinates")

            import_warnings = copy.get("import_warnings") or []
            if not isinstance(import_warnings, list):
                import_warnings = [str(import_warnings)]

            copy["import_warnings"] = self._unique_messages(
                import_warnings
            )
            copy["_valid"] = (
                len(missing) == 0
                and len(validation_errors) == 0
            )
            copy["_warnings"] = self._unique_messages(
                missing
                + validation_errors
                + [
                    f"soft:{field}"
                    for field in soft_missing
                ]
                + copy["import_warnings"]
            )
            copy["_selected"] = copy["_valid"]

            row = copy.get("_meta", {}).get(
                "row",
                index + 2,
            )

            if missing:

                warnings.append({
                    "row": row,
                    "type": "missing_fields",
                    "fields": missing,
                    "job": copy,
                })

            if validation_errors:

                warnings.append({
                    "row": row,
                    "type": "validation_errors",
                    "fields": validation_errors,
                    "job": copy,
                })

            if not missing and not validation_errors and soft_missing:

                warnings.append({
                    "row": row,
                    "type": "soft_missing",
                    "fields": soft_missing,
                    "job": copy,
                })

            if copy["_valid"]:
                valid_count += 1

            annotated_jobs.append(copy)

        return {
            "jobs": annotated_jobs,
            "warnings": warnings,
            "total": len(self.jobs),
            "valid": valid_count,
            "invalid": len(self.jobs) - valid_count,
        }
