from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.core.dependencies import get_current_user, require_role

router = APIRouter(
    prefix="/visits",
    tags=["Visits"],
)


@router.post("/")
def create_visit(
    customer_id: str,
    territory_id: str | None = None,
    visit_date: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    location_accuracy_m: float | None = None,
    visit_type: str = "CUSTOMER_VISIT",
    status_value: str = "IN_PROGRESS",
    notes: str | None = None,
    current_user: dict = Depends(require_role("FIELD_REP", "MANAGER", "EXECUTIVE")),
    db: Session = Depends(get_db),
):
    organization_id = current_user["organization_id"]
    user_id = current_user["id"]

    # Verify customer belongs to the same organization
    customer = db.execute(
        text("""
            SELECT id, territory_id
            FROM customers
            WHERE id = :customer_id
              AND organization_id = :organization_id
            LIMIT 1
        """),
        {
            "customer_id": customer_id,
            "organization_id": organization_id,
        },
    ).mappings().first()

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found in your organization.",
        )

    # If territory is supplied, verify it belongs to the same organization
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

    # If no territory was supplied, use customer's territory
    final_territory_id = territory_id or customer["territory_id"]

    result = db.execute(
        text("""
            INSERT INTO visits (
                organization_id,
                customer_id,
                territory_id,
                user_id,
                visit_date,
                latitude,
                longitude,
                location_accuracy_m,
                visit_type,
                status,
                notes
            )
            VALUES (
                :organization_id,
                :customer_id,
                :territory_id,
                :user_id,
                COALESCE(CAST(:visit_date AS timestamptz), now()),
                :latitude,
                :longitude,
                :location_accuracy_m,
                :visit_type,
                :status,
                :notes
            )
            RETURNING
                id,
                organization_id,
                customer_id,
                territory_id,
                user_id,
                visit_date,
                latitude,
                longitude,
                location_accuracy_m,
                visit_type,
                status,
                notes,
                created_at,
                updated_at
        """),
        {
            "organization_id": organization_id,
            "customer_id": customer_id,
            "territory_id": final_territory_id,
            "user_id": user_id,
            "visit_date": visit_date,
            "latitude": latitude,
            "longitude": longitude,
            "location_accuracy_m": location_accuracy_m,
            "visit_type": visit_type,
            "status": status_value,
            "notes": notes,
        },
    )

    visit = result.mappings().first()
    db.commit()

    return {
        "status": "success",
        "visit": dict(visit),
    }


@router.get("/")
def get_visits(
    territory_id: str | None = None,
    manager_id: str | None = None,
    user_id: str | None = None,
    status_value: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    search: str | None = None,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return organization visits with role-aware region/team filters."""
    organization_id = str(current_user["organization_id"])
    current_id = str(current_user["id"])
    role = str(current_user.get("role") or "").strip().upper()

    params = {"organization_id": organization_id, "current_id": current_id}
    filters = ["v.organization_id = :organization_id"]

    if role == "FIELD_REP":
        filters.append("v.user_id = :current_id")
    elif role == "MANAGER":
        filters.append("(v.user_id = :current_id OR rep.manager_id = :current_id)")

    if territory_id:
        # Managers can only query their own managed regions.
        if role == "MANAGER":
            allowed = db.execute(
                text("""
                    SELECT 1
                    FROM manager_region_assignments
                    WHERE organization_id = :organization_id
                      AND manager_id = :current_id
                      AND territory_id = :territory_id
                      AND is_active = true
                    LIMIT 1
                """),
                {"organization_id": organization_id, "current_id": current_id, "territory_id": territory_id},
            ).first()
            if not allowed:
                raise HTTPException(status_code=403, detail="The selected region is not assigned to you.")
        filters.append("v.territory_id = :territory_id")
        params["territory_id"] = territory_id

    if manager_id:
        if role == "MANAGER" and manager_id != current_id:
            raise HTTPException(status_code=403, detail="Managers can only query their own team.")
        filters.append("rep.manager_id = :manager_id")
        params["manager_id"] = manager_id

    if user_id:
        if role == "FIELD_REP" and user_id != current_id:
            raise HTTPException(status_code=403, detail="You can only query your own visits.")
        if role == "MANAGER":
            check = db.execute(
                text("""
                    SELECT 1
                    FROM users
                    WHERE id = :user_id
                      AND organization_id = :organization_id
                      AND (id = :current_id OR manager_id = :current_id)
                      AND role IN ('FIELD_REP', 'MANAGER')
                    LIMIT 1
                """),
                {"user_id": user_id, "organization_id": organization_id, "current_id": current_id},
            ).first()
            if not check:
                raise HTTPException(status_code=403, detail="The selected user is outside your team scope.")
        filters.append("v.user_id = :user_id")
        params["user_id"] = user_id

    if status_value:
        allowed_statuses = {"IN_PROGRESS", "COMPLETED", "CANCELLED"}
        normalized = status_value.strip().upper()
        if normalized not in allowed_statuses:
            raise HTTPException(status_code=400, detail="Invalid visit status filter.")
        filters.append("UPPER(v.status) = :status_value")
        params["status_value"] = normalized

    def normalize_date(value: str | None, name: str) -> str | None:
        if not value:
            return None
        raw = value.strip()
        try:
            datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid {name}. Use an ISO date/time.") from exc
        return raw

    date_from = normalize_date(date_from, "date_from")
    date_to = normalize_date(date_to, "date_to")
    if date_from:
        filters.append("v.visit_date >= CAST(:date_from AS timestamptz)")
        params["date_from"] = date_from
    if date_to:
        filters.append("v.visit_date <= CAST(:date_to AS timestamptz)")
        params["date_to"] = date_to

    if search:
        filters.append("(LOWER(c.name) LIKE LOWER(:search) OR LOWER(rep.full_name) LIKE LOWER(:search))")
        params["search"] = f"%{search.strip()}%"

    result = db.execute(
        text(f"""
            SELECT
                v.id,
                v.organization_id,
                v.customer_id,
                c.name AS customer_name,
                v.territory_id,
                t.name AS region_name,
                v.user_id,
                rep.full_name AS user_name,
                rep.manager_id,
                manager.full_name AS manager_name,
                v.visit_date,
                v.latitude,
                v.longitude,
                v.location_accuracy_m,
                v.visit_type,
                v.status,
                v.notes,
                v.created_at,
                v.updated_at
            FROM visits v
            JOIN customers c
              ON c.id = v.customer_id
            JOIN users rep
              ON rep.id = v.user_id
            LEFT JOIN users manager
              ON manager.id = rep.manager_id
             AND manager.organization_id = rep.organization_id
            LEFT JOIN territories t
              ON t.id = v.territory_id
             AND t.organization_id = v.organization_id
            WHERE {' AND '.join(filters)}
            ORDER BY v.visit_date DESC
        """),
        params,
    )

    visits = [dict(row) for row in result.mappings().all()]

    return {
        "status": "success",
        "count": len(visits),
        "filters": {
            "territory_id": territory_id,
            "manager_id": manager_id,
            "user_id": user_id,
            "status": status_value.upper() if status_value else None,
            "date_from": date_from,
            "date_to": date_to,
            "search": search,
        },
        "visits": visits,
    }


class VisitUpdateRequest(BaseModel):
    status: str | None = None
    notes: str | None = None


@router.patch("/{visit_id}")
def update_visit(
    visit_id: str,
    payload: VisitUpdateRequest,
    current_user: dict = Depends(
        require_role("FIELD_REP", "MANAGER", "EXECUTIVE")
    ),
    db: Session = Depends(get_db),
):
    """
    Update a visit within the authenticated user's organization.

    FIELD_REP:
        Own visits only.

    MANAGER:
        Own visits and visits belonging to directly assigned Field Reps.

    EXECUTIVE:
        Any visit in the organization.

    The primary workflow is report submission -> visit completion.
    """
    organization_id = current_user["organization_id"]
    user_id = str(current_user["id"])
    role = str(current_user["role"] or "").strip().upper()

    visit = db.execute(
        text("""
            SELECT
                v.id,
                v.organization_id,
                v.user_id,
                v.status,
                v.notes
            FROM visits v
            WHERE v.id = :visit_id
              AND v.organization_id = :organization_id
            LIMIT 1
        """),
        {
            "visit_id": visit_id,
            "organization_id": organization_id,
        },
    ).mappings().first()

    if not visit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Visit not found.",
        )

    visit_user_id = str(visit["user_id"])

    if role == "FIELD_REP":
        allowed = visit_user_id == user_id
    elif role == "MANAGER":
        allowed = visit_user_id == user_id or db.execute(
            text("""
                SELECT 1
                FROM users
                WHERE id = :field_rep_id
                  AND organization_id = :organization_id
                  AND manager_id = :manager_id
                  AND role = 'FIELD_REP'
                LIMIT 1
            """),
            {
                "field_rep_id": visit_user_id,
                "organization_id": organization_id,
                "manager_id": user_id,
            },
        ).first() is not None
    else:
        allowed = True

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to update this visit.",
        )

    next_status = (
        str(payload.status).strip().upper()
        if payload.status is not None
        else str(visit["status"] or "").strip().upper()
    )
    allowed_statuses = {"IN_PROGRESS", "COMPLETED", "CANCELLED"}

    if next_status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Invalid visit status. Allowed values: "
                "IN_PROGRESS, COMPLETED, CANCELLED."
            ),
        )

    next_notes = payload.notes if payload.notes is not None else visit["notes"]

    result = db.execute(
        text("""
            UPDATE visits
            SET
                status = :status,
                notes = :notes,
                updated_at = now()
            WHERE id = :visit_id
              AND organization_id = :organization_id
        """),
        {
            "status": next_status,
            "notes": next_notes,
            "visit_id": visit_id,
            "organization_id": organization_id,
        },
    )

    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The visit changed before it could be updated.",
        )

    db.commit()

    updated = db.execute(
        text("""
            SELECT
                v.id,
                v.organization_id,
                v.customer_id,
                c.name AS customer_name,
                v.territory_id,
                v.user_id,
                u.full_name AS user_name,
                v.visit_date,
                v.latitude,
                v.longitude,
                v.location_accuracy_m,
                v.visit_type,
                v.status,
                v.notes,
                v.created_at,
                v.updated_at
            FROM visits v
            JOIN customers c
                ON c.id = v.customer_id
            JOIN users u
                ON u.id = v.user_id
            WHERE v.id = :visit_id
              AND v.organization_id = :organization_id
            LIMIT 1
        """),
        {
            "visit_id": visit_id,
            "organization_id": organization_id,
        },
    ).mappings().first()

    return {
        "status": "success",
        "message": "Visit updated successfully.",
        "visit": dict(updated),
    }


@router.get("/{visit_id}")
def get_visit(
    visit_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    organization_id = current_user["organization_id"]

    result = db.execute(
        text("""
            SELECT
                v.id,
                v.organization_id,
                v.customer_id,
                c.name AS customer_name,
                v.territory_id,
                v.user_id,
                u.full_name AS user_name,
                v.visit_date,
                v.latitude,
                v.longitude,
                v.location_accuracy_m,
                v.visit_type,
                v.status,
                v.notes,
                v.created_at,
                v.updated_at
            FROM visits v
            JOIN customers c
                ON c.id = v.customer_id
            JOIN users u
                ON u.id = v.user_id
            WHERE v.id = :visit_id
              AND v.organization_id = :organization_id
            LIMIT 1
        """),
        {
            "visit_id": visit_id,
            "organization_id": organization_id,
        },
    )

    visit = result.mappings().first()

    if not visit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Visit not found.",
        )

    return {
        "status": "success",
        "visit": dict(visit),
    }