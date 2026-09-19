from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user, require_role


router = APIRouter(
    prefix="/territories",
    tags=["Territories"],
)


# ---------------------------------------------------------
# CREATE TERRITORY
# Manager and Executive only
# ---------------------------------------------------------

@router.post("/")
def create_territory(
    name: str,
    description: str | None = None,
    city: str | None = None,
    state: str | None = None,
    country: str = "India",
    latitude: float | None = None,
    longitude: float | None = None,
    radius_km: float | None = None,
    current_user: dict = Depends(
        require_role("MANAGER", "EXECUTIVE")
    ),
    db: Session = Depends(get_db),
):
    organization_id = current_user["organization_id"]

    # Verify organization exists
    organization = db.execute(
        text("""
            SELECT id
            FROM organizations
            WHERE id = :organization_id
            LIMIT 1
        """),
        {
            "organization_id": organization_id,
        },
    ).mappings().first()

    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found.",
        )

    # Create territory
    result = db.execute(
        text("""
            INSERT INTO territories (
                organization_id,
                name,
                description,
                city,
                state,
                country,
                latitude,
                longitude,
                radius_km
            )
            VALUES (
                :organization_id,
                :name,
                :description,
                :city,
                :state,
                :country,
                :latitude,
                :longitude,
                :radius_km
            )
            RETURNING
                id,
                organization_id,
                name,
                description,
                city,
                state,
                country,
                latitude,
                longitude,
                radius_km,
                is_active,
                created_at,
                updated_at
        """),
        {
            "organization_id": organization_id,
            "name": name,
            "description": description,
            "city": city,
            "state": state,
            "country": country,
            "latitude": latitude,
            "longitude": longitude,
            "radius_km": radius_km,
        },
    )

    territory = result.mappings().first()

    db.commit()

    return {
        "status": "success",
        "territory": dict(territory),
    }


# ---------------------------------------------------------
# GET TERRITORIES
# Authenticated users can view their organization's
# territories
# ---------------------------------------------------------

@router.get("/")
def get_territories(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    organization_id = current_user["organization_id"]

    result = db.execute(
        text("""
            SELECT
                id,
                organization_id,
                name,
                description,
                city,
                state,
                country,
                latitude,
                longitude,
                radius_km,
                is_active,
                created_at,
                updated_at
            FROM territories
            WHERE organization_id = :organization_id
            ORDER BY created_at DESC
        """),
        {
            "organization_id": organization_id,
        },
    )

    territories = [
        dict(row)
        for row in result.mappings().all()
    ]

    return {
        "status": "success",
        "count": len(territories),
        "territories": territories,
    }


# ---------------------------------------------------------
# GET SINGLE TERRITORY
# ---------------------------------------------------------

@router.get("/{territory_id}")
def get_territory(
    territory_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    organization_id = current_user["organization_id"]

    result = db.execute(
        text("""
            SELECT
                id,
                organization_id,
                name,
                description,
                city,
                state,
                country,
                latitude,
                longitude,
                radius_km,
                is_active,
                created_at,
                updated_at
            FROM territories
            WHERE id = :territory_id
              AND organization_id = :organization_id
            LIMIT 1
        """),
        {
            "territory_id": territory_id,
            "organization_id": organization_id,
        },
    )

    territory = result.mappings().first()

    if not territory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Territory not found.",
        )

    return {
        "status": "success",
        "territory": dict(territory),
    }