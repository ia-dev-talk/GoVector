def create_job(row):
    """Retired legacy factory that fabricated required operational data.

    Imports must use the validated preview/confirmation pipeline, which keeps
    unknown values nullable and refuses persistence until the database-required
    identity, address and coordinates have been supplied.
    """
    raise RuntimeError(
        "Legacy Excel job factory retired: use the validated import pipeline"
    )
