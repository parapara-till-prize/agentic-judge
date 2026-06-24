"""SQLModel models + SQLite engine.

Attempt is the per-run record: its `history` JSON column is the agent's full OpenAI
message list, restored on each /messages call and saved back. Submission is one graded
result, used for the leaderboard and solved-rate.
"""
from typing import Optional

from sqlmodel import JSON, Column, Field, SQLModel, create_engine

DB_URL = "sqlite:///arena.db"
engine = create_engine(DB_URL, connect_args={"check_same_thread": False})


class Attempt(SQLModel, table=True):
    id: str = Field(primary_key=True)
    problem_id: str
    user: str
    history: list = Field(default_factory=list, sa_column=Column(JSON))
    turns: int = 0
    tokens: int = 0


class Submission(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    attempt_id: str
    problem_id: str
    user: str
    passed: int = 0
    total: int = 0
    score: int = 0
    turns: int = 0
    tokens: int = 0


def init_db():
    SQLModel.metadata.create_all(engine)
