from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Postgres in production, e.g. postgresql+psycopg://user:pass@localhost:5432/leads
    # SQLite default so the app runs with zero setup.
    database_url: str = "sqlite:///./leads.db"
    cors_origins: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000"
    # Hamming distance <= this => near-duplicate. Tuned on short posts: light edits measured 6-12,
    # genuinely different posts built on the same template measured 24+.
    simhash_max_distance: int = 12

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
