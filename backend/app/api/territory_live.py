from __future__ import annotations

from datetime import datetime, timezone
from math import isfinite
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db


router = APIRouter(
    prefix="/territory-live",
    tags=["Territory Live Intelligence"],
)


# MVP-only in-memory live-location store.
# This intentionally requires no database migration and does not alter the
# existing FieldVoice schema/workflows. It is suitable for the single-process
# prototype/demo server. Production should move this to Redis/WebSocket state.
_LOCATION_LOCK = Lock()
_LOCATIONS: dict[tuple[str, str], dict] = {}


class LiveLocationUpdate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy: float | None = Field(default=None, ge=0)
    active_customer_id: str | None = None
    activity: str | None = None



def _role(user: dict) -> str:
    return str(user.get("role") or "").strip().upper()


@router.post("/location")
def update_live_location(
    payload: LiveLocationUpdate,
    current_user: dict = Depends(get_current_user),
):
    actor_role = _role(current_user)

    if actor_role != "FIELD_REP":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Field Rep users can publish live location.",
        )

    if not isfinite(payload.latitude) or not isfinite(payload.longitude):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid GPS coordinates.",
        )

    now = datetime.now(timezone.utc)
    key = (str(current_user["organization_id"]), str(current_user["id"]))

    with _LOCATION_LOCK:
        _LOCATIONS[key] = {
            "user_id": str(current_user["id"]),
            "organization_id": str(current_user["organization_id"]),
            "latitude": float(payload.latitude),
            "longitude": float(payload.longitude),
            "accuracy": float(payload.accuracy) if payload.accuracy is not None else None,
            "active_customer_id": payload.active_customer_id,
            "activity": payload.activity or "FIELD ACTIVE",
            "updated_at": now.isoformat(),
        }

    return {
        "status": "success",
        "message": "Live location updated.",
        "updated_at": now.isoformat(),
    }


@router.get("/locations")
def get_live_locations(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    organization_id = str(current_user["organization_id"])
    current_id = str(current_user["id"])
    actor_role = _role(current_user)

    if actor_role not in {"FIELD_REP", "MANAGER", "EXECUTIVE"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not allowed to view live field locations.",
        )

    # Keep the existing organizational hierarchy as the source of truth.
    # Executive -> all Field Reps
    # Manager   -> direct Field Rep team
    # Field Rep -> self
    params = {"organization_id": organization_id, "current_id": current_id}
    scope_clause = ""

    if actor_role == "FIELD_REP":
        scope_clause = "AND u.id = :current_id"
    elif actor_role == "MANAGER":
        scope_clause = "AND u.manager_id = :current_id"
    else:
        scope_clause = ""

    rows = db.execute(
        text(f"""
            SELECT
                u.id AS user_id,
                u.full_name,
                u.role,
                u.manager_id,
                manager.full_name AS manager_name,
                u.territory_id,
                territory.name AS territory_name
            FROM users u
            LEFT JOIN users manager
              ON manager.id = u.manager_id
             AND manager.organization_id = u.organization_id
            LEFT JOIN territories territory
              ON territory.id = u.territory_id
             AND territory.organization_id = u.organization_id
            WHERE u.organization_id = :organization_id
              AND u.role = 'FIELD_REP'
              AND u.is_active = true
              {scope_clause}
            ORDER BY u.full_name ASC
        """),
        params,
    ).mappings().all()

    now = datetime.now(timezone.utc)
    output = []

    with _LOCATION_LOCK:
        for row in rows:
            key = (organization_id, str(row["user_id"]))
            stored = dict(_LOCATIONS.get(key, {}))

            updated_at = stored.get("updated_at")
            age_seconds = None
            if updated_at:
                try:
                    parsed = datetime.fromisoformat(str(updated_at).replace("Z", "+00:00"))
                    age_seconds = max(0.0, (now - parsed).total_seconds())
                except ValueError:
                    age_seconds = None

            if age_seconds is None:
                live_status = "OFFLINE"
            elif age_seconds <= 45:
                live_status = "LIVE"
            elif age_seconds <= 180:
                live_status = "STALE"
            else:
                live_status = "OFFLINE"

            output.append({
                "user_id": str(row["user_id"]),
                "full_name": row["full_name"],
                "role": row["role"],
                "manager_id": str(row["manager_id"]) if row["manager_id"] else None,
                "manager_name": row["manager_name"],
                "territory_id": str(row["territory_id"]) if row["territory_id"] else None,
                "territory_name": row["territory_name"],
                "latitude": stored.get("latitude"),
                "longitude": stored.get("longitude"),
                "accuracy": stored.get("accuracy"),
                "updated_at": stored.get("updated_at"),
                "status": live_status,
                "has_location": bool(stored.get("latitude") is not None and stored.get("longitude") is not None),
                "activity": stored.get("activity"),
                "active_customer_id": stored.get("active_customer_id"),
            })

    return {
        "status": "success",
        "count": len(output),
        "locations": output,
        "server_time": now.isoformat(),
    }
