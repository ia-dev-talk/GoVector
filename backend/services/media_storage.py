import hashlib
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile


class MediaStorageError(Exception):
    pass


@dataclass(frozen=True)
class StoredMedia:
    storage_key: str
    size_bytes: int
    sha256: str


class MediaStorage:
    async def store(
        self,
        upload: UploadFile,
        *,
        storage_key: str,
        expected_sha256: str | None,
        maximum_bytes: int,
    ) -> StoredMedia:
        raise NotImplementedError


class FileSystemMediaStorage(MediaStorage):
    """Streaming pilot storage replaceable by an object-store adapter."""

    def __init__(self, root: Path):
        self.root = root.resolve()

    async def store(
        self,
        upload: UploadFile,
        *,
        storage_key: str,
        expected_sha256: str | None,
        maximum_bytes: int,
    ) -> StoredMedia:
        final_path = (self.root / storage_key).resolve()
        if self.root not in final_path.parents:
            raise MediaStorageError("Clé de stockage invalide")
        final_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = final_path.with_name(
            f".{final_path.name}.{uuid4().hex}.part"
        )
        digest = hashlib.sha256()
        size = 0
        try:
            with temporary_path.open("xb") as output:
                while chunk := await upload.read(1024 * 1024):
                    size += len(chunk)
                    if size > maximum_bytes:
                        raise MediaStorageError("Fichier trop volumineux")
                    digest.update(chunk)
                    output.write(chunk)
            actual_hash = digest.hexdigest()
            if expected_sha256 is not None and actual_hash != expected_sha256.lower():
                raise MediaStorageError("Empreinte SHA-256 invalide")
            temporary_path.replace(final_path)
        except Exception:
            temporary_path.unlink(missing_ok=True)
            raise
        finally:
            await upload.close()

        return StoredMedia(
            storage_key=storage_key,
            size_bytes=size,
            sha256=actual_hash,
        )
