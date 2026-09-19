from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db


router = APIRouter(
    prefix="/organizations",
    tags=["Organizations"],
)


@router.post("/")
def create_organization(
    name: str,
    industry: str | None = None,
    db: Session = Depends(get_db),
):
    query = text("""
        INSERT INTO organizations (name, industry)
        VALUES (:name, :industry)
        RETURNING id, name, industry, created_at
    """)

    result = db.execute(
        query,
        {
            "name": name,
            "industry": industry,
        },
    )

    organization = result.mappings().first()

    db.commit()

    return {
        "status": "success",
        "organization": dict(organization),
    }


@router.get("/")
def get_organizations(
    db: Session = Depends(get_db),
):
    query = text("""
        SELECT id, name, industry, created_at
        FROM organizations
        ORDER BY created_at DESC
    """)

    result = db.execute(query)

    organizations = [
        dict(row)
        for row in result.mappings().all()
    ]

    return {
        "status": "success",
        "count": len(organizations),
        "organizations": organizations,
    }