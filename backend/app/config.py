import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit


@dataclass(frozen=True)
class Settings:
    db_path: str = "./data/safety.sqlite3"
    delivery_mode: str = "demo"
    run_worker: bool = True
    poll_seconds: float = 2
    lease_seconds: int = 120
    max_attempts: int = 8
    retry_base_seconds: int = 5
    session_seconds: int = 86400
    public_base_url: str = "http://localhost:8000"
    cors_origins: tuple[str, ...] = ("http://localhost:3000", "http://localhost:5173")
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_tls: str = "starttls"
    smtp_timeout: float = 10

    def validate(self):
        if self.delivery_mode not in {"demo", "smtp"}:
            raise ValueError("DELIVERY_MODE must be demo or smtp")
        if self.poll_seconds <= 0 or self.max_attempts < 1 or self.retry_base_seconds < 1:
            raise ValueError("Invalid worker settings")
        if not 0 < self.smtp_timeout <= 20 or self.lease_seconds < 120:
            raise ValueError("SMTP timeout must be 0..20 seconds and lease at least 120 seconds")
        if self.delivery_mode == "smtp":
            if not self.smtp_host or not self.smtp_from or self.smtp_tls not in {"starttls", "ssl"}:
                raise ValueError("SMTP requires host, sender, and starttls or ssl encryption")
            if bool(self.smtp_user) != bool(self.smtp_password):
                raise ValueError("Set both SMTP_USER and SMTP_PASSWORD, or neither")
        url = urlsplit(self.public_base_url)
        if url.scheme not in {"http", "https"} or not url.netloc or url.query or url.fragment:
            raise ValueError("PUBLIC_BASE_URL must be an absolute http(s) URL")
        if self.delivery_mode == "smtp" and url.scheme != "https":
            raise ValueError("Real-email contact consent requires an HTTPS PUBLIC_BASE_URL")
        if self.db_path == ":memory:":
            raise ValueError("Use a file database; connections must share durable state")

    @classmethod
    def from_env(cls):
        return cls(
            db_path=os.getenv("DB_PATH", "./data/safety.sqlite3"),
            delivery_mode=os.getenv("DELIVERY_MODE", "demo"),
            run_worker=os.getenv("RUN_WORKER", "true").lower() == "true",
            poll_seconds=float(os.getenv("POLL_SECONDS", "2")),
            public_base_url=os.getenv("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/"),
            cors_origins=tuple(
                x.strip()
                for x in os.getenv(
                    "CORS_ORIGINS", "http://localhost:3000,http://localhost:5173"
                ).split(",")
                if x.strip()
            ),
            smtp_host=os.getenv("SMTP_HOST", ""),
            smtp_port=int(os.getenv("SMTP_PORT", "587")),
            smtp_user=os.getenv("SMTP_USER", ""),
            smtp_password=os.getenv("SMTP_PASSWORD", ""),
            smtp_from=os.getenv("SMTP_FROM", ""),
            smtp_tls=os.getenv("SMTP_TLS", "starttls"),
            smtp_timeout=float(os.getenv("SMTP_TIMEOUT", "10")),
        )

    def prepare_directory(self):
        target = Path(self.db_path).resolve()
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        target.touch(mode=0o600, exist_ok=True)
        target.chmod(0o600)
