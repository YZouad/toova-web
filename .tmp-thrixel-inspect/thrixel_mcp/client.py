"""Thin async HTTP client for the Thrixel API.

Deliberately dumb: it attaches auth, retries what is safe to retry, and turns
failures into agent-readable text.  All business logic lives in the backend —
anything this client could decide that the API cannot is a design defect,
because API users would not get it.
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx

from .config import Config
from .errors import ThrixelError, translate, translate_transport

# Per-request ceiling.  Distinct from Config.timeout_s, which bounds a whole
# submit-and-wait cycle; individual API calls are fast (submit returns as soon
# as the row is written) and a slow one means something is wrong.
REQUEST_TIMEOUT_S = 60.0

# Downloads carry the mesh payload, which can be tens of MB.
DOWNLOAD_TIMEOUT_S = 300.0

_RETRY_BACKOFF_S = (1.0, 3.0)


class ThrixelClient:
    """Async wrapper around the Thrixel REST API."""

    def __init__(self, config: Config):
        self._config = config
        self._client = httpx.AsyncClient(
            base_url=f"{config.api_base}/api/v1",
            headers={
                "Authorization": f"Bearer {config.api_key}",
                "User-Agent": "thrixel-mcp",
            },
            timeout=REQUEST_TIMEOUT_S,
            follow_redirects=True,
        )

    @property
    def config(self) -> Config:
        return self._config

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "ThrixelClient":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.aclose()

    # ── core request ────────────────────────────────────────────────────

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        files: dict[str, Any] | None = None,
        timeout: float | None = None,
        retry_transient: bool = True,
    ) -> httpx.Response:
        """Issue one request, retrying transient failures.

        Retries only on transport errors and 5xx — never on 4xx, which are
        deterministic and would just burn the caller's quota.  429 is retryable
        in principle but is left to the caller: the wait is job-length, not
        milliseconds, and the agent should be told rather than blocked.
        """
        attempts = len(_RETRY_BACKOFF_S) + 1 if retry_transient else 1
        last: ThrixelError | None = None

        for attempt in range(attempts):
            try:
                response = await self._client.request(
                    method, path, json=json, params=params, files=files,
                    timeout=timeout,
                )
            except Exception as exc:  # httpx transport-level failure
                last = translate_transport(exc, self._config.api_base)
            else:
                if response.is_success:
                    return response
                last = translate(response)
                if response.status_code < 500:
                    raise last

            if attempt < attempts - 1:
                await asyncio.sleep(_RETRY_BACKOFF_S[attempt])

        assert last is not None
        raise last

    # ── json helpers ────────────────────────────────────────────────────

    async def get_json(self, path: str, **params: Any) -> dict[str, Any]:
        clean = {k: v for k, v in params.items() if v is not None}
        response = await self._request("GET", path, params=clean or None)
        return response.json()

    async def post_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        """POST a body, dropping None values so server defaults apply.

        Omitting a key and sending null are different to the backend: `seed`
        omitted means "pick a random one", while an explicit null would be a
        validation error on required fields.
        """
        body = {k: v for k, v in payload.items() if v is not None}
        response = await self._request("POST", path, json=body)
        return response.json()

    async def patch_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        """PATCH a body, dropping None values - same rule as post_json.

        Partial update is the whole point of the verb here: sending only the
        field the caller named leaves everything else on the record alone.
        """
        body = {k: v for k, v in payload.items() if v is not None}
        response = await self._request("PATCH", path, json=body)
        return response.json()

    async def delete_json(self, path: str) -> dict[str, Any]:
        response = await self._request("DELETE", path)
        return response.json()

    async def post_upload(
        self,
        path: str,
        *,
        filename: str,
        fileobj: Any,
        mime: str = "application/zip",
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """POST one large binary file as multipart/form-data, streamed.

        Unlike post_file this takes an open file object, because its one
        caller (publish) uploads a zip it just assembled itself in a temp
        location - the read-sandbox concern behind post_file's content-only
        signature does not apply to bytes this package wrote.
        """
        clean = {k: v for k, v in (params or {}).items() if v is not None}
        response = await self._request(
            "POST", path,
            params=clean or None,
            files={"file": (filename, fileobj, mime)},
            retry_transient=False,   # a retried upload is a duplicate, not a fix
        )
        return response.json()

    async def post_file(
        self, path: str, *, filename: str, content: str, mime: str = "text/markdown",
    ) -> dict[str, Any]:
        """POST one text file as multipart/form-data.

        Takes the CONTENT, not a path on disk. The server-side reason is that
        this is what the API wants either way; the client-side reason is the
        one that matters: reading an arbitrary path would let a prompt walk the
        user's filesystem into our service, and this package has a write
        sandbox (files.resolve_dest) but deliberately no read sandbox. An agent
        authoring a style guide already holds the text.
        """
        response = await self._request(
            "POST", path,
            files={"file": (filename, content.encode("utf-8"), mime)},
            retry_transient=False,   # a retried upload is a duplicate, not a fix
        )
        return response.json()

    # ── binary ──────────────────────────────────────────────────────────

    async def get_bytes(self, path: str, **params: Any) -> tuple[bytes, str]:
        """Fetch a binary asset. Returns (content, content_type)."""
        clean = {k: v for k, v in params.items() if v is not None}
        response = await self._request(
            "GET", path, params=clean or None, timeout=DOWNLOAD_TIMEOUT_S
        )
        return response.content, response.headers.get("content-type", "")

    async def try_get_bytes(self, path: str, **params: Any) -> tuple[bytes, str] | None:
        """Same as get_bytes but returns None instead of raising on 4xx.

        For optional assets — a thumbnail that hasn't rendered yet should not
        fail an otherwise-successful generation.
        """
        try:
            return await self.get_bytes(path, **params)
        except ThrixelError as exc:
            if exc.status is not None and exc.status < 500:
                return None
            raise
