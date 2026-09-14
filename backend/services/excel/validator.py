import math


class ExcelValidator:

    # An operational order may arrive incomplete and be enriched by dispatch
    # or the field later. Missing business context is visible, never fabricated
    # and only the true import contract below is blocking.
    REQUIRED_FIELDS = [
        "job_number",
        "job_type",
    ]

    SOFT_REQUIRED_FIELDS = [
        "customer_name",
        "service_address",
        "service_city",
        "nro",
        "pbo",
        "scheduled_date",
        "source_technician_name",
    ]

    RELIABLE_GPS_SOURCES = {
        "GPS_PCO",
        "GPS_DERIVATION",
        "GPS_SPLITTER",
        "geocoded",
    }

    BLOCKING_MESSAGES = {
        "job_number": "Référence / COMMANDE obligatoire.",
        "job_type": (
            "Type d’intervention obligatoire. Choisissez un type du référentiel "
            "pour ce lot ou corrigez le mapping."
        ),
    }

    ADVISORY_MESSAGES = {
        "customer_name": "Client non renseigné.",
        "service_address": "Adresse non renseignée.",
        "service_city": "Ville non renseignée.",
        "nro": "NRO non renseigné.",
        "pbo": "PBO non renseigné.",
        "scheduled_date": "Date planifiée non renseignée.",
        "source_technician_name": "Technicien source non renseigné.",
        "gps_coordinates": "Coordonnées GPS non renseignées ou non fiables.",
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

    @staticmethod
    def _diagnostic(code, message, *, field=None, source=None):
        diagnostic = {
            "code": code,
            "message": message,
        }
        if field:
            diagnostic["field"] = field
        if source:
            diagnostic["source"] = source
        return diagnostic

    def validate(self):
        annotated_jobs = []
        warnings = []
        blocking_errors = []
        advisories = []
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
            copy["import_warnings"] = self._unique_messages(import_warnings)

            row = copy.get("_meta", {}).get("row", index + 2)
            row_blocking = [
                self._diagnostic(
                    field,
                    self.BLOCKING_MESSAGES.get(field, f"Champ obligatoire manquant : {field}."),
                    field=field,
                )
                for field in missing
            ]
            row_blocking.extend(
                self._diagnostic("validation_error", message)
                for message in validation_errors
            )

            row_advisories = [
                self._diagnostic(
                    f"soft:{field}",
                    self.ADVISORY_MESSAGES.get(field, f"Information non renseignée : {field}."),
                    field=field,
                )
                for field in soft_missing
            ]
            row_advisories.extend(
                self._diagnostic(
                    "source_warning",
                    message,
                    source="import",
                )
                for message in copy["import_warnings"]
            )

            copy["_valid"] = len(row_blocking) == 0
            copy["_blocking_errors"] = row_blocking
            copy["_advisories"] = row_advisories
            # Backward-compatible diagnostic codes. UI must prefer the French
            # messages above; the technical codes remain useful for tests/logs.
            copy["_warnings"] = self._unique_messages(
                missing
                + validation_errors
                + [f"soft:{field}" for field in soft_missing]
                + copy["import_warnings"]
            )
            copy["_selected"] = copy["_valid"]

            if row_blocking:
                blocking_errors.append({
                    "row": row,
                    "type": "blocking_errors",
                    "items": row_blocking,
                    "job": copy,
                })
                # Legacy response shape kept during the transition.
                warnings.append({
                    "row": row,
                    "type": "missing_fields" if missing else "validation_errors",
                    "fields": missing or validation_errors,
                    "job": copy,
                })

            if row_advisories:
                advisories.append({
                    "row": row,
                    "type": "advisories",
                    "items": row_advisories,
                    "job": copy,
                })
                if not row_blocking and soft_missing:
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
            "blocking_errors": blocking_errors,
            "advisories": advisories,
            "total": len(self.jobs),
            "valid": valid_count,
            "invalid": len(self.jobs) - valid_count,
        }
