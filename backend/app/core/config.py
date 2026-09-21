from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://majlis:majlis@localhost:5432/majlis"
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str = "dev-only-insecure-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    VERIFICATION_TOKEN_EXPIRE_HOURS: int = 24
    RESET_TOKEN_EXPIRE_HOURS: int = 1
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 1025
    SMTP_FROM: str = "Majlis <no-reply@majlis.local>"
    FRONTEND_URL: str = "http://localhost:8080"
    RATE_LIMIT_SIGNUP_PER_MIN: int = 10
    RATE_LIMIT_LOGIN_PER_MIN: int = 10
    RATE_LIMIT_RESET_PER_MIN: int = 5
    RATE_LIMIT_INVITE_PER_MIN: int = 10
    RATE_LIMIT_JOIN_PER_MIN: int = 10
    INVITE_TOKEN_EXPIRE_HOURS: int = 72
    CODE_DEFAULT_LENGTH: int = 8
    CODE_DEFAULT_EXPIRE_DAYS: int = 7
    CODE_DEFAULT_MAX_USES: int = 50
    CODE_MAX_ACTIVE_PER_COURSE: int = 5
    S3_ENDPOINT_URL: str | None = None
    S3_REGION: str = "auto"
    S3_ACCESS_KEY_ID: str | None = None
    S3_SECRET_ACCESS_KEY: str | None = None
    S3_BUCKET: str = "majlis-media"
    S3_UPLOAD_EXPIRE_SEC: int = 900
    S3_PLAY_EXPIRE_SEC: int = 3600
    ADMIN_EMAIL: str | None = None
    ADMIN_PASSWORD: str | None = None


def get_settings() -> Settings:
    return Settings()
