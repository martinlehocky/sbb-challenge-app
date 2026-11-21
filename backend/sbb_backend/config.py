"""Runtime settings, read from environment variables (and an optional backend/.env file)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent


def _load_dotenv(path: Path) -> None:
    """Minimal KEY=VALUE loader. Existing environment variables always win."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv(BACKEND_DIR / ".env")


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    return value if value not in (None, "") else default


def _env_bool(name: str, default: bool) -> bool:
    value = _env(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    # Folder holding Daten.zip, the service-point CSVs and the gtfs_*.zip files.
    data_dir: Path = field(default_factory=lambda: Path(_env("SBB_DATA_DIR", str(REPO_DIR.parent))))
    # SQLite file built by `python -m sbb_backend.ingest`.
    db_path: Path = field(default_factory=lambda: Path(_env("SBB_DB_PATH", str(BACKEND_DIR / "data" / "sbb.db"))))
    # Optional explicit GTFS zip; default = newest gtfs_*.zip in data_dir.
    gtfs_zip: str | None = field(default_factory=lambda: _env("SBB_GTFS_ZIP"))

    # Planner tuning.
    default_transfer_seconds: int = field(default_factory=lambda: int(_env("SBB_DEFAULT_TRANSFER_SECONDS", "180")))
    # A disruption point closer than this to a train's path counts as "on the path".
    disruption_radius_m: float = field(default_factory=lambda: float(_env("SBB_DISRUPTION_RADIUS_M", "600")))

    # Together AI (https://docs.together.ai). Everything AI-related is optional.
    together_api_key: str | None = field(default_factory=lambda: _env("TOGETHER_API_KEY"))
    together_base_url: str = field(default_factory=lambda: _env("TOGETHER_BASE_URL", "https://api.together.ai/v1"))
    together_chat_model: str = field(default_factory=lambda: _env("TOGETHER_CHAT_MODEL", "Qwen/Qwen3.5-9B"))
    # The Together docs call Qwen3.5 with reasoning disabled; set to false for models without that option.
    together_disable_reasoning: bool = field(default_factory=lambda: _env_bool("TOGETHER_DISABLE_REASONING", True))
    together_stt_model: str = field(default_factory=lambda: _env("TOGETHER_STT_MODEL", "openai/whisper-large-v3"))
    together_tts_model: str = field(default_factory=lambda: _env("TOGETHER_TTS_MODEL", "canopylabs/orpheus-3b-0.1-ft"))
    together_tts_voice: str = field(default_factory=lambda: _env("TOGETHER_TTS_VOICE", "tara"))
    # Optional voice per language (e.g. TOGETHER_TTS_VOICE_DE), for multilingual TTS models such as cartesia/sonic-2.
    together_tts_voices: dict[str, str] = field(default_factory=lambda: {
        lang: voice for lang in ("en", "de", "fr", "it")
        if (voice := _env(f"TOGETHER_TTS_VOICE_{lang.upper()}"))
    })
    together_timeout_s: float = field(default_factory=lambda: float(_env("TOGETHER_TIMEOUT_S", "60")))

    # Google Places API (New): real places near the station, with photos, for the wait-idea screens. Optional.
    google_maps_api_key: str | None = field(default_factory=lambda: _env("GOOGLE_MAPS_API_KEY"))
    google_places_base_url: str = field(default_factory=lambda: _env("GOOGLE_PLACES_BASE_URL", "https://places.googleapis.com/v1"))

    @property
    def places_enabled(self) -> bool:
        return bool(self.google_maps_api_key)

    @property
    def ai_enabled(self) -> bool:
        return bool(self.together_api_key)

    def resolve_gtfs_zip(self) -> Path:
        if self.gtfs_zip:
            return Path(self.gtfs_zip)
        candidates = sorted(self.data_dir.glob("gtfs_*.zip"))
        if not candidates:
            raise FileNotFoundError(f"No gtfs_*.zip found in {self.data_dir}")
        return candidates[-1]  # names end in the snapshot date, so the last one is the newest


def get_settings() -> Settings:
    return Settings()
