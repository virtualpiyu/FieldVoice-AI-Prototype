from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user, require_role


router = APIRouter(
    prefix="/customers",
    tags=["Customers"],
)


# ---------------------------------------------------------
# CREATE CUSTOMER
# FIELD_REP, MANAGER and EXECUTIVE
# ---------------------------------------------------------

@router.post("/")
def create_customer(
    name: str,
    territory_id: str | None = None,
    contact_person: str | None = None,
    email: str | None = None,
    phone: str | None = None,
    address: str | None = None,
    city: str | None = None,
    state: str | None = None,
    country: str = "India",
    latitude: float | None = None,
    longitude: float | None = None,
    industry: str | None = None,
    status_value: str = "ACTIVE",
    notes: str | None = None,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    organization_id = current_user["organization_id"]

    # -----------------------------------------------------
    # Verify territory belongs to the same organization
    # -----------------------------------------------------

    if territory_id:
        territory = db.execute(
            text("""
                SELECT id
                FROM territories
                WHERE id = :territory_id
                  AND organization_id = :organization_id
                LIMIT 1
            """),
            {
                "territory_id": territory_id,
                "organization_id": organization_id,
            },
        ).mappings().first()

        if not territory:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Territory not found in your organization.",
            )

    # -----------------------------------------------------
    # Create customer
    # -----------------------------------------------------

    result = db.execute(
        text("""
            INSERT INTO customers (
                organization_id,
                territory_id,
                name,
                contact_person,
                email,
                phone,
                address,
                city,
                state,
                country,
                latitude,
                longitude,
                industry,
                status,
                notes
            )
            VALUES (
                :organization_id,
                :territory_id,
                :name,
                :contact_person,
                :email,
                :phone,
                :address,
                :city,
                :state,
                :country,
                :latitude,
                :longitude,
                :industry,
                :status,
                :notes
            )
            RETURNING
                id,
                organization_id,
                territory_id,
                name,
                contact_person,
                email,
                phone,
                address,
                city,
                state,
                country,
                latitude,
                longitude,
                industry,
                status,
                notes,
                created_at,
                updated_at
        """),
        {
            "organization_id": organization_id,
            "territory_id": territory_id,
            "name": name,
            "contact_person": contact_person,
            "email": email,
            "phone": phone,
            "address": address,
            "city": city,
            "state": state,
            "country": country,
            "latitude": latitude,
            "longitude": longitude,
            "industry": industry,
            "status": status_value,
            "notes": notes,
        },
    )

    customer = result.mappings().first()

    db.commit()

    return {
        "status": "success",
        "customer": dict(customer),
    }


# ---------------------------------------------------------
# GET CUSTOMERS
# Authenticated users can view customers belonging
# to their organization.
# ---------------------------------------------------------

@router.get("/")
def get_customers(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    organization_id = current_user["organization_id"]

    result = db.execute(
        text("""
            SELECT
                id,
                organization_id,
                territory_id,
                name,
                contact_person,
                email,
                phone,
                address,
                city,
                state,
                country,
                latitude,
                longitude,
                industry,
                status,
                notes,
                created_at,
                updated_at
            FROM customers
            WHERE organization_id = :organization_id
            ORDER BY created_at DESC
        """),
        {
            "organization_id": organization_id,
        },
    )

    customers = [
        dict(row)
        for row in result.mappings().all()
    ]

    return {
        "status": "success",
        "count": len(customers),
        "customers": customers,
    }


# ---------------------------------------------------------
# GET SINGLE CUSTOMER
# ---------------------------------------------------------

@router.get("/{customer_id}")
def get_customer(
    customer_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    organization_id = current_user["organization_id"]

    result = db.execute(
        text("""
            SELECT
                id,
                organization_id,
                territory_id,
                name,
                contact_person,
                email,
                phone,
                address,
                city,
                state,
                country,
                latitude,
                longitude,
                industry,
                status,
                notes,
                created_at,
                updated_at
            FROM customers
            WHERE id = :customer_id
              AND organization_id = :organization_id
            LIMIT 1
        """),
        {
            "customer_id": customer_id,
            "organization_id": organization_id,
        },
    )

    customer = result.mappings().first()

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found.",
        )

    return {
        "status": "success",
        "customer": dict(customer),
    }