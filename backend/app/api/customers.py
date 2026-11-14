from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user, require_role


from pydantic import BaseModel


class CustomerCreatePayload(BaseModel):
    name: str | None = None
    territory_id: str | None = None
    contact_person: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = "India"
    latitude: float | None = None
    longitude: float | None = None
    industry: str | None = None
    status_value: str | None = "ACTIVE"
    notes: str | None = None


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
    name: str | None = None,
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
    body: CustomerCreatePayload | None = None,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    eff_name = (body.name if body and body.name else name) or ""
    if not eff_name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Customer name is required.",
        )
    name = eff_name
    territory_id = (body.territory_id if body and body.territory_id else territory_id)
    contact_person = (body.contact_person if body and body.contact_person else contact_person)
    email = (body.email if body and body.email else email)
    phone = (body.phone if body and body.phone else phone)
    address = (body.address if body and body.address else address)
    city = (body.city if body and body.city else city)
    state = (body.state if body and body.state else state)
    country = (body.country if body and body.country else country)
    latitude = (body.latitude if body and body.latitude is not None else latitude)
    longitude = (body.longitude if body and body.longitude is not None else longitude)
    industry = (body.industry if body and body.industry else industry)
    status_value = (body.status_value if body and body.status_value else status_value)
    notes = (body.notes if body and body.notes else notes)

    organization_id = str(current_user["organization_id"])
    current_user_id = str(current_user["id"])
    actor_role = str(current_user.get("role") or "").strip().upper()

    # -----------------------------------------------------
    # FIELD REP WORKFLOW
    #
    # Field Rep does not choose a region manually.
    # The system uses the Field Rep's assigned territory.
    #
    # The newly created customer is also automatically
    # assigned to the logged-in Field Rep.
    # -----------------------------------------------------

    final_territory_id = territory_id
    final_assigned_to = None

    if actor_role == "FIELD_REP":
        rep = db.execute(
            text("""
                SELECT
                    id,
                    organization_id,
                    role,
                    is_active,
                    territory_id,
                    manager_id
                FROM users
                WHERE id = :user_id
                  AND organization_id = :organization_id
                LIMIT 1
            """),
            {
                "user_id": current_user_id,
                "organization_id": organization_id,
            },
        ).mappings().first()

        if not rep:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Field Rep account not found in your organization.",
            )

        if not rep["is_active"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your Field Rep account is inactive.",
            )

        if str(rep["role"] or "").strip().upper() != "FIELD_REP":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Field Rep users can use the Field Rep customer workflow.",
            )

        # A Field Rep must have a region assigned.
        if not rep["territory_id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No region is assigned to your Field Rep account. Contact your Manager.",
            )

        assigned_territory_id = str(rep["territory_id"])

        # Security:
        # even if frontend sends another territory_id,
        # the Field Rep cannot create outside their territory.
        if territory_id and str(territory_id) != assigned_territory_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only create customers inside your assigned region.",
            )

        final_territory_id = assigned_territory_id
        final_assigned_to = current_user_id

    elif actor_role not in {"MANAGER", "EXECUTIVE"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not allowed to create customers.",
        )

    # -----------------------------------------------------
    # Verify territory belongs to the same organization
    # -----------------------------------------------------

    if final_territory_id:
        territory = db.execute(
            text("""
                SELECT id
                FROM territories
                WHERE id = :territory_id
                  AND organization_id = :organization_id
                LIMIT 1
            """),
            {
                "territory_id": final_territory_id,
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
    #
    # FIELD_REP:
    #   territory_id = Field Rep's assigned territory
    #   assigned_to  = logged-in Field Rep
    #
    # MANAGER / EXECUTIVE:
    #   Existing behavior preserved.
    #   assigned_to remains NULL unless assigned later
    #   through the existing management workflow.
    # -----------------------------------------------------

    result = db.execute(
        text("""
            INSERT INTO customers (
                organization_id,
                territory_id,
                assigned_to,
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
                :assigned_to,
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
                assigned_to,
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
            "territory_id": final_territory_id,
            "assigned_to": final_assigned_to,
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
#
# MANAGER / EXECUTIVE:
#   Existing organization-wide behavior remains.
#
# FIELD_REP:
#   Only customers inside the Field Rep's assigned
#   territory are returned.
# ---------------------------------------------------------

@router.get("/")
def get_customers(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    organization_id = str(current_user["organization_id"])
    current_user_id = str(current_user["id"])
    actor_role = str(current_user.get("role") or "").strip().upper()

    # -----------------------------------------------------
    # FIELD REP -> only their assigned territory
    # -----------------------------------------------------

    if actor_role == "FIELD_REP":
        rep = db.execute(
            text("""
                SELECT
                    territory_id
                FROM users
                WHERE id = :user_id
                  AND organization_id = :organization_id
                  AND role = 'FIELD_REP'
                  AND is_active = true
                LIMIT 1
            """),
            {
                "user_id": current_user_id,
                "organization_id": organization_id,
            },
        ).mappings().first()

        if not rep:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Field Rep account is not available or is inactive.",
            )

        if not rep["territory_id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No region is assigned to your Field Rep account. Contact your Manager.",
            )

        result = db.execute(
            text("""
                SELECT
                    id,
                    organization_id,
                    territory_id,
                    assigned_to,
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
                  AND territory_id = :territory_id
                ORDER BY created_at DESC
            """),
            {
                "organization_id": organization_id,
                "territory_id": str(rep["territory_id"]),
            },
        )

    # -----------------------------------------------------
    # MANAGER / EXECUTIVE -> existing behavior
    # -----------------------------------------------------

    elif actor_role in {"MANAGER", "EXECUTIVE"}:
        result = db.execute(
            text("""
                SELECT
                    id,
                    organization_id,
                    territory_id,
                    assigned_to,
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

    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not allowed to view customers.",
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
#
# MANAGER / EXECUTIVE:
#   Existing organization scope remains.
#
# FIELD_REP:
#   Can only open customers inside their assigned region.
# ---------------------------------------------------------

@router.get("/{customer_id}")
def get_customer(
    customer_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    organization_id = str(current_user["organization_id"])
    current_user_id = str(current_user["id"])
    actor_role = str(current_user.get("role") or "").strip().upper()

    params = {
        "customer_id": customer_id,
        "organization_id": organization_id,
    }

    scope_clause = ""

    # -----------------------------------------------------
    # FIELD REP SCOPE
    # -----------------------------------------------------

    if actor_role == "FIELD_REP":
        rep = db.execute(
            text("""
                SELECT
                    territory_id
                FROM users
                WHERE id = :user_id
                  AND organization_id = :organization_id
                  AND role = 'FIELD_REP'
                  AND is_active = true
                LIMIT 1
            """),
            {
                "user_id": current_user_id,
                "organization_id": organization_id,
            },
        ).mappings().first()

        if not rep:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Field Rep account is not available or is inactive.",
            )

        if not rep["territory_id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No region is assigned to your Field Rep account. Contact your Manager.",
            )

        scope_clause = "AND territory_id = :territory_id"
        params["territory_id"] = str(rep["territory_id"])

    elif actor_role not in {"MANAGER", "EXECUTIVE"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not allowed to view customers.",
        )

    # -----------------------------------------------------
    # GET CUSTOMER
    # -----------------------------------------------------

    result = db.execute(
        text(f"""
            SELECT
                id,
                organization_id,
                territory_id,
                assigned_to,
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
              {scope_clause}
            LIMIT 1
        """),
        params,
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