from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.security import hash_password
from app.core.dependencies import get_current_user


router = APIRouter(
    prefix="/users",
    tags=["Users"],
)


# =========================================================
# REQUEST MODELS
# =========================================================

class UserManagerUpdateRequest(BaseModel):
    manager_id: str | None = Field(
        default=None,
        description="Manager user ID. Use null to remove a Field Rep's manager.",
    )


# =========================================================
# HELPERS
# =========================================================

ALLOWED_ROLES = {"FIELD_REP", "MANAGER", "EXECUTIVE"}


def normalized_role(role: str | None) -> str:
    return str(role or "").strip().upper()


def require_management_role(current_user: dict) -> str:
    role = normalized_role(current_user.get("role"))

    if role not in {"MANAGER", "EXECUTIVE"}:
        raise HTTPException(
            status_code=403,
            detail="Only MANAGER or EXECUTIVE users can manage users.",
        )

    return role


def get_same_org_user(
    db: Session,
    user_id: str,
    organization_id: str,
):
    result = db.execute(
        text("""
            SELECT
                id,
                organization_id,
                full_name,
                email,
                role,
                phone,
                is_active,
                manager_id
            FROM users
            WHERE id = :user_id
              AND organization_id = :organization_id
            LIMIT 1
        """),
        {
            "user_id": user_id,
            "organization_id": organization_id,
        },
    )

    return result.mappings().first()


def get_manager_in_org(
    db: Session,
    manager_id: str,
    organization_id: str,
):
    result = db.execute(
        text("""
            SELECT
                id,
                organization_id,
                full_name,
                email,
                role,
                is_active
            FROM users
            WHERE id = :manager_id
              AND organization_id = :organization_id
              AND role = 'MANAGER'
              AND is_active = true
            LIMIT 1
        """),
        {
            "manager_id": manager_id,
            "organization_id": organization_id,
        },
    )

    return result.mappings().first()


# =========================================================
# CREATE USER
# =========================================================

@router.post("/")
def create_user(
    organization_id: str,
    full_name: str,
    email: str,
    role: str,
    password: str,
    phone: str | None = None,
    manager_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    actor_role = require_management_role(current_user)

    organization_id = str(organization_id).strip()
    full_name = full_name.strip()
    email = email.strip().lower()
    role = normalized_role(role)

    if not organization_id:
        raise HTTPException(
            status_code=400,
            detail="Organization ID is required.",
        )

    if organization_id != str(current_user["organization_id"]):
        raise HTTPException(
            status_code=403,
            detail="You can only manage users in your own organization.",
        )

    if not full_name:
        raise HTTPException(
            status_code=400,
            detail="Full name is required.",
        )

    if not email:
        raise HTTPException(
            status_code=400,
            detail="Email is required.",
        )

    if not password:
        raise HTTPException(
            status_code=400,
            detail="Password is required.",
        )

    if role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=400,
            detail="Invalid role. Use FIELD_REP, MANAGER, or EXECUTIVE.",
        )

    # Manager users can create Field Rep accounts only.
    # Executive users can create any supported role.
    if actor_role == "MANAGER" and role != "FIELD_REP":
        raise HTTPException(
            status_code=403,
            detail="Managers can create Field Rep users only.",
        )

    # Manager assignment is only valid for Field Reps.
    if role != "FIELD_REP" and manager_id:
        raise HTTPException(
            status_code=400,
            detail="Only FIELD_REP users can be assigned to a manager.",
        )

    # If a Manager creates a Field Rep, the Field Rep belongs to that Manager.
    if actor_role == "MANAGER" and role == "FIELD_REP":
        manager_id = str(current_user["id"])

    # Validate explicitly supplied manager.
    if manager_id:
        manager_id = str(manager_id).strip()

        if manager_id == str(current_user["id"]) and role != "FIELD_REP":
            raise HTTPException(
                status_code=400,
                detail="A user cannot be assigned to themselves.",
            )

        manager = get_manager_in_org(
            db,
            manager_id,
            organization_id,
        )

        if not manager:
            raise HTTPException(
                status_code=404,
                detail="Selected manager was not found in your organization.",
            )

    # Check organization exists.
    organization = db.execute(
        text("""
            SELECT id
            FROM organizations
            WHERE id = :organization_id
            LIMIT 1
        """),
        {"organization_id": organization_id},
    ).first()

    if not organization:
        raise HTTPException(
            status_code=404,
            detail="Organization not found.",
        )

    # Email is kept globally unique, matching the previous implementation.
    existing_user = db.execute(
        text("""
            SELECT id
            FROM users
            WHERE lower(email) = :email
            LIMIT 1
        """),
        {"email": email},
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="User with this email already exists.",
        )

    # Create user.
    result = db.execute(
        text("""
            INSERT INTO users (
                organization_id,
                full_name,
                email,
                role,
                phone,
                password_hash,
                is_active,
                manager_id
            )
            VALUES (
                :organization_id,
                :full_name,
                :email,
                :role,
                :phone,
                :password_hash,
                true,
                :manager_id
            )
            RETURNING
                id,
                organization_id,
                full_name,
                email,
                role,
                phone,
                is_active,
                manager_id,
                created_at,
                updated_at
        """),
        {
            "organization_id": organization_id,
            "full_name": full_name,
            "email": email,
            "role": role,
            "phone": phone.strip() if phone else None,
            "password_hash": hash_password(password),
            "manager_id": manager_id if role == "FIELD_REP" else None,
        },
    )

    user = result.mappings().first()

    if not user:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="User could not be created.",
        )

    db.commit()

    return {
        "status": "success",
        "message": "User created successfully.",
        "user": dict(user),
    }


# =========================================================
# GET MANAGERS
# Used by Executive/team management UI.
# =========================================================

@router.get("/managers")
def get_managers(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    actor_role = require_management_role(current_user)
    organization_id = current_user["organization_id"]

    # Only Executive gets the full manager directory.
    # A Manager gets only themselves.
    if actor_role == "MANAGER":
        rows = db.execute(
            text("""
                SELECT
                    id,
                    organization_id,
                    full_name,
                    email,
                    role,
                    phone,
                    is_active,
                    created_at,
                    updated_at
                FROM users
                WHERE id = :user_id
                  AND organization_id = :organization_id
                  AND role = 'MANAGER'
                LIMIT 1
            """),
            {
                "user_id": current_user["id"],
                "organization_id": organization_id,
            },
        ).mappings().all()
    else:
        rows = db.execute(
            text("""
                SELECT
                    id,
                    organization_id,
                    full_name,
                    email,
                    role,
                    phone,
                    is_active,
                    created_at,
                    updated_at
                FROM users
                WHERE organization_id = :organization_id
                  AND role = 'MANAGER'
                ORDER BY full_name ASC
            """),
            {"organization_id": organization_id},
        ).mappings().all()

    managers = [dict(row) for row in rows]

    return {
        "status": "success",
        "count": len(managers),
        "managers": managers,
    }


# =========================================================
# GET USERS
#
# EXECUTIVE -> all users in organization
# MANAGER   -> self + direct Field Rep team
# FIELD_REP -> self only
# =========================================================

@router.get("/")
def get_users(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    organization_id = current_user["organization_id"]
    user_id = current_user["id"]
    role = normalized_role(current_user.get("role"))

    if role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Unsupported user role.",
        )

    query = """
        SELECT
            u.id,
            u.organization_id,
            u.full_name,
            u.email,
            u.role,
            u.phone,
            u.is_active,
            u.manager_id,
            u.created_at,
            u.updated_at,
            manager.full_name AS manager_name
        FROM users u
        LEFT JOIN users manager
            ON manager.id = u.manager_id
           AND manager.organization_id = u.organization_id
        WHERE u.organization_id = :organization_id
    """

    params = {
        "organization_id": organization_id,
        "user_id": user_id,
    }

    if role == "EXECUTIVE":
        query += """
            ORDER BY
                CASE u.role
                    WHEN 'MANAGER' THEN 1
                    WHEN 'FIELD_REP' THEN 2
                    WHEN 'EXECUTIVE' THEN 3
                    ELSE 4
                END,
                u.full_name ASC
        """

    elif role == "MANAGER":
        query += """
            AND (
                u.id = :user_id
                OR (
                    u.manager_id = :user_id
                    AND u.role = 'FIELD_REP'
                )
            )
            ORDER BY
                CASE WHEN u.id = :user_id THEN 0 ELSE 1 END,
                u.full_name ASC
        """

    else:
        query += """
            AND u.id = :user_id
            LIMIT 1
        """

    result = db.execute(text(query), params)

    users = [
        dict(row)
        for row in result.mappings().all()
    ]

    return {
        "status": "success",
        "count": len(users),
        "users": users,
    }


# =========================================================
# GET FIELD REP ACTIVITY
#
# MANAGER   -> only direct Field Reps assigned to that Manager
# EXECUTIVE -> any Field Rep in the organization
# FIELD_REP -> only their own activity
# =========================================================

@router.get("/{user_id}/activity")
def get_user_activity(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    organization_id = current_user["organization_id"]
    actor_id = current_user["id"]
    actor_role = normalized_role(current_user.get("role"))

    target = db.execute(
        text("""
            SELECT
                u.id,
                u.organization_id,
                u.full_name,
                u.email,
                u.role,
                u.phone,
                u.is_active,
                u.manager_id,
                manager.full_name AS manager_name,
                u.created_at,
                u.updated_at
            FROM users u
            LEFT JOIN users manager
                ON manager.id = u.manager_id
               AND manager.organization_id = u.organization_id
            WHERE u.id = :target_id
              AND u.organization_id = :organization_id
            LIMIT 1
        """),
        {
            "target_id": user_id,
            "organization_id": organization_id,
        },
    ).mappings().first()

    if not target:
        raise HTTPException(
            status_code=404,
            detail="User not found in your organization.",
        )

    target_role = normalized_role(target["role"])

    if target_role not in {"FIELD_REP", "SALESPERSON"}:
        raise HTTPException(
            status_code=400,
            detail="Activity view is available only for Field Rep users.",
        )

    # Enforce backend team scope.
    if actor_role == "FIELD_REP":
        if str(target["id"]) != str(actor_id):
            raise HTTPException(
                status_code=403,
                detail="You can only view your own activity.",
            )
    elif actor_role == "MANAGER":
        if str(target["manager_id"] or "") != str(actor_id):
            raise HTTPException(
                status_code=403,
                detail="You can only view activity for Field Reps assigned to your team.",
            )
    elif actor_role != "EXECUTIVE":
        raise HTTPException(
            status_code=403,
            detail="You are not allowed to view Field Rep activity.",
        )

    # Core metrics.
    visit_count = db.execute(
        text("""
            SELECT COUNT(*)
            FROM visits
            WHERE organization_id = :organization_id
              AND user_id = :target_id
        """),
        {
            "organization_id": organization_id,
            "target_id": user_id,
        },
    ).scalar_one()

    report_count = db.execute(
        text("""
            SELECT COUNT(*)
            FROM reports
            WHERE organization_id = :organization_id
              AND created_by = :target_id
        """),
        {
            "organization_id": organization_id,
            "target_id": user_id,
        },
    ).scalar_one()

    submitted_report_count = db.execute(
        text("""
            SELECT COUNT(*)
            FROM reports
            WHERE organization_id = :organization_id
              AND created_by = :target_id
              AND UPPER(status) = 'SUBMITTED'
        """),
        {
            "organization_id": organization_id,
            "target_id": user_id,
        },
    ).scalar_one()

    pending_action_count = db.execute(
        text("""
            SELECT COUNT(*)
            FROM action_items ai
            LEFT JOIN visits v
                ON v.id = ai.visit_id
               AND v.organization_id = ai.organization_id
            WHERE ai.organization_id = :organization_id
              AND (
                    ai.assigned_to = :target_id
                    OR v.user_id = :target_id
                  )
              AND UPPER(ai.status) = 'PENDING'
        """),
        {
            "organization_id": organization_id,
            "target_id": user_id,
        },
    ).scalar_one()

    open_alert_count = db.execute(
        text("""
            SELECT COUNT(*)
            FROM alerts a
            LEFT JOIN visits v
                ON v.id = a.visit_id
               AND v.organization_id = a.organization_id
            WHERE a.organization_id = :organization_id
              AND (
                    a.assigned_to = :target_id
                    OR v.user_id = :target_id
                  )
              AND UPPER(a.status) = 'OPEN'
        """),
        {
            "organization_id": organization_id,
            "target_id": user_id,
        },
    ).scalar_one()

    high_opportunity_count = db.execute(
        text("""
            SELECT COUNT(DISTINCT ai.visit_id)
            FROM ai_insights ai
            JOIN visits v
                ON v.id = ai.visit_id
               AND v.organization_id = ai.organization_id
            WHERE ai.organization_id = :organization_id
              AND v.user_id = :target_id
              AND UPPER(COALESCE(ai.opportunity_level, '')) = 'HIGH'
        """),
        {
            "organization_id": organization_id,
            "target_id": user_id,
        },
    ).scalar_one()

    high_risk_count = db.execute(
        text("""
            SELECT COUNT(DISTINCT ai.visit_id)
            FROM ai_insights ai
            JOIN visits v
                ON v.id = ai.visit_id
               AND v.organization_id = ai.organization_id
            WHERE ai.organization_id = :organization_id
              AND v.user_id = :target_id
              AND UPPER(COALESCE(ai.risk_level, '')) = 'HIGH'
        """),
        {
            "organization_id": organization_id,
            "target_id": user_id,
        },
    ).scalar_one()

    # Most recent AI insight for the rep.
    latest_insight = db.execute(
        text("""
            SELECT
                ai.summary,
                ai.sentiment,
                ai.opportunity_level,
                ai.risk_level,
                ai.created_at
            FROM ai_insights ai
            JOIN visits v
                ON v.id = ai.visit_id
               AND v.organization_id = ai.organization_id
            WHERE ai.organization_id = :organization_id
              AND v.user_id = :target_id
            ORDER BY ai.created_at DESC
            LIMIT 1
        """),
        {
            "organization_id": organization_id,
            "target_id": user_id,
        },
    ).mappings().first()

    # Recent visits with the latest AI signal for each visit.
    recent_visits_result = db.execute(
        text("""
            SELECT
                v.id,
                v.customer_id,
                c.name AS customer_name,
                v.user_id,
                u.full_name AS user_name,
                v.visit_date,
                v.status,
                v.visit_type,
                v.notes,
                v.latitude,
                v.longitude,
                insight.sentiment,
                insight.opportunity_level,
                insight.risk_level
            FROM visits v
            JOIN users u
                ON u.id = v.user_id
            JOIN customers c
                ON c.id = v.customer_id
            LEFT JOIN LATERAL (
                SELECT
                    ai.sentiment,
                    ai.opportunity_level,
                    ai.risk_level
                FROM ai_insights ai
                WHERE ai.visit_id = v.id
                  AND ai.organization_id = v.organization_id
                ORDER BY ai.created_at DESC
                LIMIT 1
            ) insight ON true
            WHERE v.organization_id = :organization_id
              AND v.user_id = :target_id
            ORDER BY v.visit_date DESC
            LIMIT 8
        """),
        {
            "organization_id": organization_id,
            "target_id": user_id,
        },
    )
    recent_visits = [dict(row) for row in recent_visits_result.mappings().all()]

    # Recent reports.
    recent_reports_result = db.execute(
        text("""
            SELECT
                r.id,
                r.title,
                c.name AS customer_name,
                r.status,
                r.created_at,
                r.submitted_at
            FROM reports r
            JOIN visits v
                ON v.id = r.visit_id
               AND v.organization_id = r.organization_id
            JOIN customers c
                ON c.id = v.customer_id
            WHERE r.organization_id = :organization_id
              AND r.created_by = :target_id
            ORDER BY r.created_at DESC
            LIMIT 8
        """),
        {
            "organization_id": organization_id,
            "target_id": user_id,
        },
    )
    recent_reports = [dict(row) for row in recent_reports_result.mappings().all()]

    # Recent action items. Include items explicitly assigned to the rep and
    # AI items created from the rep's own visits.
    action_items_result = db.execute(
        text("""
            SELECT
                ai.id,
                ai.title,
                ai.description,
                ai.priority,
                ai.status,
                ai.due_date,
                c.name AS customer_name,
                ai.visit_id,
                ai.source
            FROM action_items ai
            LEFT JOIN visits v
                ON v.id = ai.visit_id
               AND v.organization_id = ai.organization_id
            LEFT JOIN customers c
                ON c.id = ai.customer_id
            WHERE ai.organization_id = :organization_id
              AND (
                    ai.assigned_to = :target_id
                    OR v.user_id = :target_id
                  )
            ORDER BY ai.created_at DESC
            LIMIT 8
        """),
        {
            "organization_id": organization_id,
            "target_id": user_id,
        },
    )
    action_items = [dict(row) for row in action_items_result.mappings().all()]

    # Recent alerts. Include unassigned alerts generated by the rep's visits.
    alerts_result = db.execute(
        text("""
            SELECT
                a.id,
                a.severity,
                a.title,
                a.message,
                a.status,
                c.name AS customer_name,
                a.alert_type,
                a.created_at
            FROM alerts a
            LEFT JOIN visits v
                ON v.id = a.visit_id
               AND v.organization_id = a.organization_id
            LEFT JOIN customers c
                ON c.id = a.customer_id
            WHERE a.organization_id = :organization_id
              AND (
                    a.assigned_to = :target_id
                    OR v.user_id = :target_id
                  )
            ORDER BY a.created_at DESC
            LIMIT 8
        """),
        {
            "organization_id": organization_id,
            "target_id": user_id,
        },
    )
    alerts = [dict(row) for row in alerts_result.mappings().all()]

    return {
        "status": "success",
        "activity": {
            "user": dict(target),
            "metrics": {
                "visits": int(visit_count or 0),
                "reports": int(report_count or 0),
                "submitted_reports": int(submitted_report_count or 0),
                "pending_action_items": int(pending_action_count or 0),
                "open_alerts": int(open_alert_count or 0),
                "high_opportunities": int(high_opportunity_count or 0),
                "high_risks": int(high_risk_count or 0),
            },
            "latest_insight": dict(latest_insight) if latest_insight else None,
            "recent_visits": recent_visits,
            "recent_reports": recent_reports,
            "action_items": action_items,
            "alerts": alerts,
        },
    }


# =========================================================
# ASSIGN / REASSIGN FIELD REP TO MANAGER
# =========================================================

@router.patch("/{user_id}/manager")
def update_user_manager(
    user_id: str,
    payload: UserManagerUpdateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    actor_role = require_management_role(current_user)
    organization_id = current_user["organization_id"]

    target = get_same_org_user(
        db,
        user_id,
        organization_id,
    )

    if not target:
        raise HTTPException(
            status_code=404,
            detail="User not found in your organization.",
        )

    target_role = normalized_role(target["role"])

    # Manager can only manage Field Reps that belong to their team.
    if actor_role == "MANAGER":
        if target_role != "FIELD_REP":
            raise HTTPException(
                status_code=403,
                detail="Managers can assign managers only for Field Rep users.",
            )

        if str(target["id"]) != str(current_user["id"]):
            current_manager_id = target["manager_id"]

            if current_manager_id and str(current_manager_id) != str(current_user["id"]):
                raise HTTPException(
                    status_code=403,
                    detail="You can only manage Field Reps assigned to your team.",
                )

        # A Manager can assign/unassign their own Field Rep team members,
        # but cannot move them to another Manager.
        requested_manager_id = payload.manager_id

        if requested_manager_id is not None:
            requested_manager_id = str(requested_manager_id).strip()

            if requested_manager_id != str(current_user["id"]):
                raise HTTPException(
                    status_code=403,
                    detail="Managers can assign Field Reps only to themselves.",
                )

        manager_id = requested_manager_id

    # Executive can assign any Field Rep to any active Manager.
    else:
        if target_role != "FIELD_REP":
            raise HTTPException(
                status_code=400,
                detail="Only FIELD_REP users can be assigned to a manager.",
            )

        manager_id = payload.manager_id

        if manager_id is not None:
            manager_id = str(manager_id).strip()

            manager = get_manager_in_org(
                db,
                manager_id,
                organization_id,
            )

            if not manager:
                raise HTTPException(
                    status_code=404,
                    detail="Selected manager was not found in your organization.",
                )

    db.execute(
        text("""
            UPDATE users
            SET
                manager_id = :manager_id,
                updated_at = now()
            WHERE id = :user_id
              AND organization_id = :organization_id
        """),
        {
            "manager_id": manager_id,
            "user_id": user_id,
            "organization_id": organization_id,
        },
    )

    db.commit()

    updated_user = db.execute(
        text("""
            SELECT
                u.id,
                u.organization_id,
                u.full_name,
                u.email,
                u.role,
                u.phone,
                u.is_active,
                u.manager_id,
                u.created_at,
                u.updated_at,
                manager.full_name AS manager_name
            FROM users u
            LEFT JOIN users manager
                ON manager.id = u.manager_id
               AND manager.organization_id = u.organization_id
            WHERE u.id = :user_id
              AND u.organization_id = :organization_id
            LIMIT 1
        """),
        {
            "user_id": user_id,
            "organization_id": organization_id,
        },
    ).mappings().first()

    return {
        "status": "success",
        "message": (
            "Field Rep assigned successfully."
            if manager_id
            else "Field Rep manager assignment removed."
        ),
        "user": dict(updated_user) if updated_user else None,
    }
