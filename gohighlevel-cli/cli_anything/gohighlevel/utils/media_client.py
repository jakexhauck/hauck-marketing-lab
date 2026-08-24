"""GHL media storage client (public LeadConnector v2 medias API).

The /medias/files endpoint requires a non-obvious param set discovered by
probing 2026-08-23: besides locationId it demands altId/altType (the storage
scope), sortBy, and type. Requests must carry a browser User-Agent or
Cloudflare rejects non-browser TLS stacks with error 1010.
"""
from __future__ import annotations

import base64
import mimetypes
from typing import Any

import requests

BASE_URL = "https://services.leadconnectorhq.com"
API_VERSION = "2021-07-28"

CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


class MediaClient:
    """List, upload, and delete files in a location's media library."""

    def __init__(self, api_key: str, location_id: str):
        self.api_key = api_key
        self.location_id = location_id

    def _headers(self, extra: dict | None = None) -> dict:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Version": API_VERSION,
            "Accept": "application/json",
            "User-Agent": CHROME_UA,
        }
        if extra:
            headers.update(extra)
        return headers

    def list_files(
        self,
        num_results: int = 50,
        offset: int = 0,
        type_filter: str = "file",
        sort_by: str = "dateAdded",
        sort_order: str = "desc",
    ) -> dict[str, Any]:
        """List media files. Returns {'files': [...], 'count': n}.

        type_filter must be a concrete type ('file', 'image', 'video',
        'audio'): the API accepts 'all' but returns an empty result set.
        """
        params = {
            "locationId": self.location_id,
            "altId": self.location_id,
            "altType": "location",
            "numResults": num_results,
            "offset": offset,
            "sortBy": sort_by,
            "sortOrder": sort_order,
            "type": type_filter,
        }
        r = requests.get(
            f"{BASE_URL}/medias/files",
            headers=self._headers(),
            params=params,
            timeout=30,
        )
        r.raise_for_status()
        return r.json()

    def upload_file(self, path: str, name: str | None = None) -> dict[str, Any]:
        """Upload a local file into the location's media library.

        The endpoint only accepts multipart/form-data; a JSON body gets
        UPLOAD_UNSUPPORTED_CONTENT_TYPE.
        """
        import os

        if not os.path.isfile(path):
            raise FileNotFoundError(path)
        file_name = name or os.path.basename(path)
        mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
        with open(path, "rb") as f:
            payload = f.read()
        form = {
            "name": (None, file_name),
            "locationId": (None, self.location_id),
            "altId": (None, self.location_id),
            "altType": (None, "location"),
        }
        files = {"file": (file_name, payload, mime)}
        r = requests.post(
            f"{BASE_URL}/medias/upload-file",
            headers=self._headers(),
            data=form,
            files=files,
            timeout=60,
        )
        if not r.ok:
            detail = ""
            try:
                detail = str(r.json())[:400]
            except Exception:
                detail = r.text[:400]
            raise RuntimeError(f"upload failed ({r.status_code}): {detail}")
        return r.json()

    def delete_file(self, file_id: str) -> dict[str, Any]:
        """Delete a media file by id."""
        r = requests.delete(
            f"{BASE_URL}/medias/{file_id}",
            headers=self._headers(),
            params={
                "locationId": self.location_id,
                "altId": self.location_id,
                "altType": "location",
            },
            timeout=30,
        )
        r.raise_for_status()
        try:
            return r.json()
        except ValueError:
            return {"status": "deleted", "statusCode": r.status_code}
