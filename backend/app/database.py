import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

LOCAL_DB_FALLBACK = "postgresql://postgres@127.0.0.1:5433/postgres"

# In the cloud DATABASE_URL must be set. We only use the localhost fallback
# when it is NOT set at all (local development), so a typo in production
# fails loudly instead of silently pointing at a database that doesn't exist.
DATABASE_URL = os.getenv("DATABASE_URL") or LOCAL_DB_FALLBACK

# Some hosts hand out "postgres://", which SQLAlchemy 1.4+ rejects.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args={"connect_timeout": 10} if DATABASE_URL.startswith("postgresql") else {},
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
