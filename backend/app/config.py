from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_DIR / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = f"sqlite:///{BACKEND_DIR / 'storage' / 'spatial_brain.db'}"
    storage_dir: Path = BACKEND_DIR / "storage" / "uploads"
    cache_dir: Path = BACKEND_DIR / "storage" / "cache"

    session_secret: str = "dev-only-change-me"
    session_cookie: str = "spatial_session"

    # Mistral. Pinned rather than using -latest so demo behaviour does not drift
    # mid-rehearsal. Check both names with GET /api/integrations/mistral/verify,
    # since Mistral retires dated snapshots and a retired name fails the whole call.
    mistral_api_key: str = ""
    mistral_base_url: str = "https://api.mistral.ai/v1"
    mistral_ocr_model: str = "mistral-ocr-4-0"
    mistral_text_model: str = "mistral-medium-3-5"
    mistral_timeout_seconds: float = 120.0

    # Jira Cloud. Basic auth with an API token is enough for the demo path.
    jira_base_url: str = ""
    jira_email: str = ""
    jira_api_token: str = ""
    jira_project_key: str = ""
    jira_issue_type: str = "Task"

    # Optional notification sinks. Unset means log-only.
    slack_webhook_url: str = ""
    discord_webhook_url: str = ""

    # MCP agents authenticate with a static token rather than a user session.
    mcp_token: str = "dev-mcp-token"

    # Inbound webhook secrets (optional; empty skips verification for local demos).
    github_webhook_secret: str = ""
    jira_webhook_secret: str = "spatial-jira-demo"

    # Provisioned Mistral agent ids (filled by scripts/provision_agents.py).
    mistral_agent_coordinator: str = ""
    mistral_agent_sense: str = ""
    mistral_agent_data: str = ""
    mistral_agent_align: str = ""
    mistral_agent_present: str = ""
    mistral_agent_review: str = ""

    lineage_max_depth: int = 6
    lineage_max_nodes: int = 60

    @property
    def mistral_enabled(self) -> bool:
        return bool(self.mistral_api_key)

    @property
    def jira_enabled(self) -> bool:
        return bool(
            self.jira_base_url
            and self.jira_email
            and self.jira_api_token
            and self.jira_project_key
        )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    (BACKEND_DIR / "storage").mkdir(parents=True, exist_ok=True)
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    settings.cache_dir.mkdir(parents=True, exist_ok=True)
    return settings


settings = get_settings()
