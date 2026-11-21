"""Minimal Together AI client (plain HTTP, see https://docs.together.ai).

Endpoints used:
  POST /v1/chat/completions      - JSON answers (intent extraction, plain-language rewrite, suggestions)
  POST /v1/audio/transcriptions  - speech to text (multipart upload)
  POST /v1/audio/speech          - text to speech (binary audio in the response body)
"""
from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from typing import Any

import httpx

from ..config import Settings

log = logging.getLogger("sbb_backend.ai")

RETRY_STATUS = {429, 503, 504}
MAX_RETRIES = 2
AUDIO_TYPES = {"mp3": "audio/mpeg", "wav": "audio/wav", "raw": "application/octet-stream"}


class AIError(Exception):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


class AIDisabled(AIError):
    pass


@dataclass
class SpeechResult:
    audio: bytes
    content_type: str
    format: str


_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)
_THINK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def parse_json_content(content: str) -> Any:
    """Parse model output as JSON, tolerating code fences and <think> blocks."""
    text = _THINK.sub("", content or "").strip()
    text = _FENCE.sub("", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            return json.loads(text[start:end + 1])
        raise


class TogetherClient:
    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None):
        self.settings = settings
        self._client = httpx.Client(
            base_url=settings.together_base_url.rstrip("/"),
            timeout=settings.together_timeout_s,
            transport=transport,
        )

    @property
    def enabled(self) -> bool:
        return bool(self.settings.together_api_key)

    def close(self) -> None:
        self._client.close()

    # ------------------------------------------------------------------ HTTP

    def _headers(self) -> dict[str, str]:
        if not self.enabled:
            raise AIDisabled("TOGETHER_API_KEY is not set, so AI features are off", status=503)
        return {"Authorization": f"Bearer {self.settings.together_api_key}"}

    def _post(self, path: str, **kwargs: Any) -> httpx.Response:
        headers = self._headers()
        for attempt in range(MAX_RETRIES + 1):
            try:
                resp = self._client.post(path, headers=headers, **kwargs)
            except httpx.HTTPError as exc:
                if attempt < MAX_RETRIES:
                    time.sleep(0.5 * 2 ** attempt)
                    continue
                raise AIError(f"Together AI request failed: {exc}", status=502) from exc
            if resp.status_code in RETRY_STATUS and attempt < MAX_RETRIES:
                time.sleep(0.5 * 2 ** attempt)
                continue
            if resp.status_code >= 400:
                raise AIError(f"Together AI error {resp.status_code}: {_error_message(resp)}", status=resp.status_code)
            return resp
        raise AIError("Together AI request failed after retries", status=502)  # pragma: no cover

    # ------------------------------------------------------------------ chat

    def chat(self, messages: list[dict[str, str]], *, max_tokens: int = 600, temperature: float = 0.2,
             response_format: dict | None = None) -> str:
        body: dict[str, Any] = {
            "model": self.settings.together_chat_model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if self.settings.together_disable_reasoning:
            body["reasoning"] = {"enabled": False}
        if response_format is not None:
            body["response_format"] = response_format
        data = self._post("/chat/completions", json=body).json()
        try:
            choice = data["choices"][0]
            content = choice["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise AIError(f"Unexpected chat response: {str(data)[:300]}", status=502) from exc
        if choice.get("finish_reason") == "length":
            raise AIError("The model ran out of tokens before finishing its answer", status=502)
        return content or ""

    def chat_json(self, system: str, user: str, schema: dict, name: str = "answer", max_tokens: int = 600) -> Any:
        """Ask for JSON matching `schema`. Falls back to json_object mode if json_schema is rejected."""
        messages = [
            {"role": "system", "content": system + "\nRespond only with a JSON object, no other text."},
            {"role": "user", "content": user},
        ]
        formats = [
            {"type": "json_schema", "json_schema": {"name": name, "schema": schema}},
            {"type": "json_object"},
        ]
        last_error: Exception | None = None
        for fmt in formats:
            try:
                content = self.chat(messages, max_tokens=max_tokens, temperature=0, response_format=fmt)
                return parse_json_content(content)
            except AIError as exc:
                if exc.status == 400:
                    last_error = exc
                    continue
                raise
            except (json.JSONDecodeError, ValueError) as exc:
                last_error = exc
                continue
        raise AIError(f"Could not get valid JSON from the model: {last_error}", status=502)

    # ------------------------------------------------------------------ audio

    def transcribe(self, audio: bytes, filename: str, content_type: str | None = None,
                   language: str | None = None, prompt: str | None = None) -> str:
        # The docs ask for `model` before `file` in multipart uploads; httpx sends `data` fields first.
        data = {"model": self.settings.together_stt_model, "response_format": "json"}
        if language:
            data["language"] = language
        if prompt:
            data["prompt"] = prompt  # vocabulary hint (Whisper models use it, others ignore it)
        files = {"file": (filename or "audio.wav", audio, content_type or "application/octet-stream")}
        payload = self._post("/audio/transcriptions", data=data, files=files).json()
        text = payload.get("text") if isinstance(payload, dict) else None
        if text is None:
            raise AIError(f"Unexpected transcription response: {str(payload)[:300]}", status=502)
        return text.strip()

    def speak(self, text: str, *, voice: str | None = None, language: str | None = None,
              fmt: str = "mp3") -> SpeechResult:
        if fmt not in AUDIO_TYPES:
            raise AIError(f"Unsupported audio format {fmt!r}; use one of {sorted(AUDIO_TYPES)}", status=400)
        body: dict[str, Any] = {
            "model": self.settings.together_tts_model,
            "input": text,
            "voice": voice or self.settings.together_tts_voice,
            "response_format": fmt,
            "stream": False,
        }
        if language and language != "en":
            body["language"] = language
        resp = self._post("/audio/speech", json=body)
        ctype = resp.headers.get("content-type", "")
        if ctype.startswith("application/json"):
            raise AIError(f"Expected audio, got JSON: {resp.text[:300]}", status=502)
        return SpeechResult(resp.content, AUDIO_TYPES[fmt], fmt)


def _error_message(resp: httpx.Response) -> str:
    try:
        data = resp.json()
        if isinstance(data, dict) and isinstance(data.get("error"), dict):
            return str(data["error"].get("message") or data["error"])
        return str(data)[:300]
    except ValueError:
        return resp.text[:300]
