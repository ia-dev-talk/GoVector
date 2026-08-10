class ExcelPreview:

    def __init__(self, validation, info: dict | None = None):

        self.validation = validation
        self.info = info or {}

    def build(self):

        jobs = self.validation["jobs"]
        warnings = self.validation["warnings"]

        detected_columns = set()
        detected_colors = set()
        preview = []

        for job in jobs[:100]:

            preview.append(job)

            for key, value in job.items():

                if key.startswith("_"):
                    continue

                if value is not None:
                    detected_columns.add(key)

        for warning in warnings:

            color = warning.get("color")

            if color:
                detected_colors.add(color)

            meta = warning.get("job", {}).get("_meta", {})
            color_status = meta.get("color_status")

            if color_status:
                detected_colors.add(color_status)

        statistics = {
            "total_jobs": self.validation["total"],
            "valid_jobs": self.validation["valid"],
            "invalid_jobs": self.validation["invalid"],
            "selected_jobs": sum(
                1 for job in jobs if job.get("_selected")
            ),
        }

        return {
            "success": True,
            "info": self.info,
            "preview": preview,
            "jobs": jobs,
            "warnings": warnings,
            "statistics": statistics,
            "summary": {
                "total_jobs": statistics["total_jobs"],
                "valid_jobs": statistics["valid_jobs"],
                "errors": statistics["invalid_jobs"],
            },
            "detected_columns": sorted(detected_columns),
            "detected_colors": sorted(detected_colors),
        }
