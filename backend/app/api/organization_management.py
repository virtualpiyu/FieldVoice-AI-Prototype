from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.core.security import hash_password
from app.database import get_db


router = APIRouter(
    prefix="/org-management",
    tags=["Organization Management"],
)

SUPPORTED_EMPLOYEE_ROLES = {"FIELD_REP", "MANAGER"}


def role_of(user: dict) -> str:
    return str(user.get("role") or "").strip().upper()


def require_exec_or_manager(user: dict) -> str:
    role = role_of(user)
    if role not in {"EXECUTIVE", "MANAGER"}:
        raise HTTPException(status_code=403, detail="Only Executive or Manager users are allowed.")
    return role


def require_exec(user: dict) -> None:
    if role_of(user) != "EXECUTIVE":
        raise HTTPException(status_code=403, detail="Only Executive users are allowed.")


def same_org_user(db: Session, user_id: str, organization_id: str):
    return db.execute(
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
                u.territory_id,
                manager.full_name AS manager_name,
                t.name AS territory_name
            FROM users u
            LEFT JOIN users manager
                ON manager.id = u.manager_id
               AND manager.organization_id = u.organization_id
            LEFT JOIN territories t
                ON t.id = u.territory_id
               AND t.organization_id = u.organization_id
            WHERE u.id = :user_id
              AND u.organization_id = :organization_id
            LIMIT 1
        """),
        {"user_id": user_id, "organization_id": organization_id},
    ).mappings().first()


def get_region(db: Session, territory_id: str, organization_id: str):
    return db.execute(
        text("""
            SELECT id, organization_id, name, description, city, state,
                   country, latitude, longitude, radius_km, is_active,
                   created_at, updated_at
            FROM territories
            WHERE id = :territory_id
              AND organization_id = :organization_id
            LIMIT 1
        """),
        {"territory_id": territory_id, "organization_id": organization_id},
    ).mappings().first()


def manager_manages_region(db: Session, manager_id: str, territory_id: str, organization_id: str) -> bool:
    row = db.execute(
        text("""
            SELECT 1
            FROM manager_region_assignments
            WHERE organization_id = :organization_id
              AND manager_id = :manager_id
              AND territory_id = :territory_id
              AND is_active = true
            LIMIT 1
        """),
        {
            "organization_id": organization_id,
            "manager_id": manager_id,
            "territory_id": territory_id,
        },
    ).first()
    return row is not None


def manager_managed_regions(db: Session, manager_id: str, organization_id: str) -> list[str]:
    rows = db.execute(
        text("""
            SELECT territory_id
            FROM manager_region_assignments
            WHERE organization_id = :organization_id
              AND manager_id = :manager_id
              AND is_active = true
        """),
        {"organization_id": organization_id, "manager_id": manager_id},
    ).scalars().all()
    return [str(x) for x in rows]


def accessible_region_ids(db: Session, current_user: dict) -> list[str] | None:
    role = role_of(current_user)
    if role == "EXECUTIVE":
        return None
    if role != "MANAGER":
        return []
    return manager_managed_regions(db, str(current_user["id"]), str(current_user["organization_id"]))


class ManagerRegionRequest(BaseModel):
    manager_id: str
    territory_id: str


class UserRegionRequest(BaseModel):
    territory_id: str | None = None


class CustomerAssignmentRequest(BaseModel):
    assigned_to: str | None = None
    territory_id: str | None = None


class EmployeeCreateRequest(BaseModel):
    full_name: str = Field(min_length=1)
    email: str = Field(min_length=3)
    password: str = Field(min_length=4)
    role: str
    phone: str | None = None
    manager_id: str | None = None
    territory_id: str | None = None
    region_ids: list[str] = Field(default_factory=list)


class RoleUpdateRequest(BaseModel):
    role: str


class ActiveUpdateRequest(BaseModel):
    is_active: bool


# =========================================================
# REGION DIRECTORY / ORGANIZATION TREE
# =========================================================

@router.get("/regions")
def get_region_directory(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    role = require_exec_or_manager(current_user)
    organization_id = str(current_user["organization_id"])
    allowed_ids = accessible_region_ids(db, current_user)

    params: dict[str, Any] = {"organization_id": organization_id}
    region_filter = ""
    if allowed_ids is not None:
        if not allowed_ids:
            return {"status": "success", "count": 0, "regions": []}
        region_filter = """
            AND EXISTS (
                SELECT 1
                FROM manager_region_assignments mra_filter
                WHERE mra_filter.organization_id = t.organization_id
                  AND mra_filter.territory_id = t.id
                  AND mra_filter.manager_id = :current_manager_id
                  AND mra_filter.is_active = true
            )
        """
        params["current_manager_id"] = str(current_user["id"])

    result = db.execute(
        text(f"""
            SELECT
                t.id,
                t.name,
                t.description,
                t.city,
                t.state,
                t.country,
                t.is_active,
                t.created_at,
                (
                    SELECT COUNT(DISTINCT mra.manager_id)
                    FROM manager_region_assignments mra
                    WHERE mra.organization_id = t.organization_id
                      AND mra.territory_id = t.id
                      AND mra.is_active = true
                ) AS manager_count,
                (
                    SELECT COUNT(*)
                    FROM users u
                    WHERE u.organization_id = t.organization_id
                      AND u.territory_id = t.id
                      AND u.role = 'FIELD_REP'
                ) AS rep_count,
                (
                    SELECT COUNT(*)
                    FROM customers c
                    WHERE c.organization_id = t.organization_id
                      AND c.territory_id = t.id
                ) AS customer_count,
                (
                    SELECT COUNT(*)
                    FROM visits v
                    WHERE v.organization_id = t.organization_id
                      AND v.territory_id = t.id
                ) AS visit_count
            FROM territories t
            WHERE t.organization_id = :organization_id
              {region_filter}
            ORDER BY t.name ASC
        """),
        params,
    )

    regions = [dict(row) for row in result.mappings().all()]
    return {"status": "success", "count": len(regions), "regions": regions}


@router.get("/tree")
def get_organization_tree(
    region_id: str | None = Query(default=None),
    manager_id: str | None = Query(default=None),
    search: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    role = require_exec_or_manager(current_user)
    organization_id = str(current_user["organization_id"])
    current_id = str(current_user["id"])

    if region_id and not get_region(db, region_id, organization_id):
        raise HTTPException(status_code=404, detail="Region not found in your organization.")

    if role == "MANAGER":
        if manager_id and manager_id != current_id:
            raise HTTPException(status_code=403, detail="Managers can only view their own organization scope.")
        if region_id and not manager_manages_region(db, current_id, region_id, organization_id):
            raise HTTPException(status_code=403, detail="The selected region is not assigned to you.")
        manager_id = current_id

    params: dict[str, Any] = {"organization_id": organization_id}
    manager_clause = ""
    region_clause = ""
    search_clause = ""
    search_clause_manager = ""

    if manager_id:
        manager_clause = "AND m.id = :manager_id"
        params["manager_id"] = manager_id
    if region_id:
        region_clause = "AND mra.territory_id = :region_id"
        params["region_id"] = region_id
    if search:
        search_clause_manager = """
            AND (
                LOWER(m.full_name) LIKE LOWER(:search)
                OR LOWER(m.email) LIKE LOWER(:search)
                OR EXISTS (
                    SELECT 1
                    FROM users rep_search
                    WHERE rep_search.organization_id = m.organization_id
                      AND rep_search.manager_id = m.id
                      AND rep_search.role = 'FIELD_REP'
                      AND (
                          LOWER(rep_search.full_name) LIKE LOWER(:search)
                          OR LOWER(rep_search.email) LIKE LOWER(:search)
                      )
                )
            )
        """
        search_clause = "AND (LOWER(rep.full_name) LIKE LOWER(:search) OR LOWER(rep.email) LIKE LOWER(:search))"
        params["search"] = f"%{search.strip()}%"

    managers_result = db.execute(
        text(f"""
            SELECT DISTINCT
                m.id,
                m.full_name,
                m.email,
                m.phone,
                m.is_active,
                m.created_at
            FROM users m
            LEFT JOIN manager_region_assignments mra
              ON mra.manager_id = m.id
             AND mra.organization_id = m.organization_id
             AND mra.is_active = true
            WHERE m.organization_id = :organization_id
              AND m.role = 'MANAGER'
              {manager_clause}
              {region_clause}
              {search_clause_manager}
            ORDER BY m.full_name ASC
        """),
        params,
    )
    manager_rows = [dict(row) for row in managers_result.mappings().all()]

    manager_ids = [str(row["id"]) for row in manager_rows]
    if not manager_ids:
        return {
            "status": "success",
            "filters": {"region_id": region_id, "manager_id": manager_id, "search": search},
            "managers": [],
        }

    rep_params = dict(params)
    rep_params["manager_ids"] = manager_ids
    rep_region_clause = "AND rep.territory_id = :region_id" if region_id else ""
    rep_manager_clause = "AND rep.manager_id = ANY(CAST(:manager_ids AS uuid[]))"

    reps_result = db.execute(
        text(f"""
            SELECT
                rep.id,
                rep.full_name,
                rep.email,
                rep.phone,
                rep.is_active,
                rep.manager_id,
                rep.territory_id,
                manager.full_name AS manager_name,
                t.name AS territory_name,
                COUNT(DISTINCT v.id) AS visit_count,
                COUNT(DISTINCT r.id) AS report_count
            FROM users rep
            JOIN users manager
              ON manager.id = rep.manager_id
             AND manager.organization_id = rep.organization_id
            LEFT JOIN territories t
              ON t.id = rep.territory_id
             AND t.organization_id = rep.organization_id
            LEFT JOIN visits v
              ON v.user_id = rep.id
             AND v.organization_id = rep.organization_id
            LEFT JOIN reports r
              ON r.created_by = rep.id
             AND r.organization_id = rep.organization_id
            WHERE rep.organization_id = :organization_id
              AND rep.role = 'FIELD_REP'
              {rep_manager_clause}
              {rep_region_clause}
              {search_clause}
            GROUP BY
                rep.id, rep.full_name, rep.email, rep.phone, rep.is_active,
                rep.manager_id, rep.territory_id, manager.full_name, t.name
            ORDER BY rep.full_name ASC
        """),
        rep_params,
    )
    reps = [dict(row) for row in reps_result.mappings().all()]

    regions_result = db.execute(
        text("""
            SELECT
                mra.manager_id,
                t.id AS territory_id,
                t.name AS territory_name,
                mra.assigned_at,
                mra.is_active
            FROM manager_region_assignments mra
            JOIN territories t
              ON t.id = mra.territory_id
             AND t.organization_id = mra.organization_id
            WHERE mra.organization_id = :organization_id
              AND mra.manager_id = ANY(CAST(:manager_ids AS uuid[]))
              AND mra.is_active = true
            ORDER BY t.name ASC
        """),
        {"organization_id": organization_id, "manager_ids": manager_ids},
    )
    regions_by_manager: dict[str, list[dict[str, Any]]] = {mid: [] for mid in manager_ids}
    for row in regions_result.mappings().all():
        regions_by_manager[str(row["manager_id"])].append(dict(row))

    reps_by_manager: dict[str, list[dict[str, Any]]] = {mid: [] for mid in manager_ids}
    for rep in reps:
        reps_by_manager.setdefault(str(rep["manager_id"]), []).append(rep)

    managers = []
    for manager in manager_rows:
        mid = str(manager["id"])
        manager_payload = dict(manager)
        manager_payload["regions"] = regions_by_manager.get(mid, [])
        manager_payload["field_reps"] = reps_by_manager.get(mid, [])
        manager_payload["field_rep_count"] = len(manager_payload["field_reps"])
        managers.append(manager_payload)

    return {
        "status": "success",
        "filters": {"region_id": region_id, "manager_id": manager_id, "search": search},
        "managers": managers,
    }


# =========================================================
# MANAGER <-> REGION
# =========================================================

@router.get("/manager-regions/{manager_id}")
def get_manager_regions(
    manager_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    role = require_exec_or_manager(current_user)
    organization_id = str(current_user["organization_id"])

    if role == "MANAGER" and str(current_user["id"]) != str(manager_id):
        raise HTTPException(status_code=403, detail="Managers can only view their own region assignments.")

    manager = same_org_user(db, manager_id, organization_id)
    if not manager or role_of(manager) != "MANAGER":
        raise HTTPException(status_code=404, detail="Manager not found in your organization.")

    rows = db.execute(
        text("""
            SELECT
                mra.id,
                mra.manager_id,
                mra.territory_id,
                t.name AS territory_name,
                t.city,
                t.state,
                mra.assigned_by,
                mra.assigned_at,
                mra.is_active
            FROM manager_region_assignments mra
            JOIN territories t
              ON t.id = mra.territory_id
             AND t.organization_id = mra.organization_id
            WHERE mra.organization_id = :organization_id
              AND mra.manager_id = :manager_id
              AND mra.is_active = true
            ORDER BY t.name ASC
        """),
        {"organization_id": organization_id, "manager_id": manager_id},
    )
    regions = [dict(row) for row in rows.mappings().all()]
    return {"status": "success", "manager_id": manager_id, "regions": regions}


@router.post("/manager-regions")
def assign_manager_region(
    payload: ManagerRegionRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_exec(current_user)
    organization_id = str(current_user["organization_id"])

    manager = same_org_user(db, payload.manager_id, organization_id)
    if not manager or role_of(manager) != "MANAGER" or not manager["is_active"]:
        raise HTTPException(status_code=404, detail="Active Manager not found in your organization.")

    region = get_region(db, payload.territory_id, organization_id)
    if not region or not region["is_active"]:
        raise HTTPException(status_code=404, detail="Active region not found in your organization.")

    result = db.execute(
        text("""
            INSERT INTO manager_region_assignments (
                organization_id,
                manager_id,
                territory_id,
                assigned_by,
                is_active
            )
            VALUES (
                :organization_id,
                :manager_id,
                :territory_id,
                :assigned_by,
                true
            )
            ON CONFLICT (manager_id, territory_id)
            DO UPDATE SET
                organization_id = EXCLUDED.organization_id,
                assigned_by = EXCLUDED.assigned_by,
                assigned_at = now(),
                is_active = true,
                updated_at = now()
            RETURNING id, organization_id, manager_id, territory_id, assigned_by,
                      assigned_at, is_active, created_at, updated_at
        """),
        {
            "organization_id": organization_id,
            "manager_id": payload.manager_id,
            "territory_id": payload.territory_id,
            "assigned_by": current_user["id"],
        },
    )
    assignment = result.mappings().first()
    db.commit()

    return {"status": "success", "message": "Manager assigned to region successfully.", "assignment": dict(assignment)}


@router.delete("/manager-regions/{manager_id}/{territory_id}")
def remove_manager_region(
    manager_id: str,
    territory_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_exec(current_user)
    organization_id = str(current_user["organization_id"])

    result = db.execute(
        text("""
            UPDATE manager_region_assignments
            SET is_active = false,
                updated_at = now()
            WHERE organization_id = :organization_id
              AND manager_id = :manager_id
              AND territory_id = :territory_id
              AND is_active = true
        """),
        {
            "organization_id": organization_id,
            "manager_id": manager_id,
            "territory_id": territory_id,
        },
    )

    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(status_code=404, detail="Active manager-region assignment not found.")

    db.commit()
    return {"status": "success", "message": "Manager-region assignment removed."}


# =========================================================
# USER / REP REGION ASSIGNMENT
# =========================================================

@router.patch("/users/{user_id}/region")
def assign_user_region(
    user_id: str,
    payload: UserRegionRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    actor_role = require_exec_or_manager(current_user)
    organization_id = str(current_user["organization_id"])
    target = same_org_user(db, user_id, organization_id)

    if not target:
        raise HTTPException(status_code=404, detail="User not found in your organization.")

    target_role = role_of(target)
    if target_role not in {"FIELD_REP", "MANAGER"}:
        raise HTTPException(status_code=400, detail="Region assignment is available for Managers and Field Reps.")

    if actor_role == "MANAGER":
        if target_role != "FIELD_REP":
            raise HTTPException(status_code=403, detail="Managers can assign regions only to Field Reps.")
        if str(target["manager_id"] or "") != str(current_user["id"]):
            raise HTTPException(status_code=403, detail="The Field Rep is not assigned to your team.")
        if payload.territory_id and not manager_manages_region(db, str(current_user["id"]), payload.territory_id, organization_id):
            raise HTTPException(status_code=403, detail="You can only assign Field Reps to your managed regions.")

    if payload.territory_id:
        region = get_region(db, payload.territory_id, organization_id)
        if not region or not region["is_active"]:
            raise HTTPException(status_code=404, detail="Active region not found in your organization.")

    db.execute(
        text("""
            UPDATE users
            SET territory_id = :territory_id,
                updated_at = now()
            WHERE id = :user_id
              AND organization_id = :organization_id
        """),
        {
            "territory_id": payload.territory_id,
            "user_id": user_id,
            "organization_id": organization_id,
        },
    )
    db.commit()

    updated = same_org_user(db, user_id, organization_id)
    return {"status": "success", "message": "User region updated successfully.", "user": dict(updated) if updated else None}


# =========================================================
# CUSTOMER ASSIGNMENT
# =========================================================

@router.patch("/customers/{customer_id}/assignment")
def assign_customer(
    customer_id: str,
    payload: CustomerAssignmentRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    actor_role = require_exec_or_manager(current_user)
    organization_id = str(current_user["organization_id"])

    customer = db.execute(
        text("""
            SELECT id, organization_id, territory_id, assigned_to, name
            FROM customers
            WHERE id = :customer_id
              AND organization_id = :organization_id
            LIMIT 1
        """),
        {"customer_id": customer_id, "organization_id": organization_id},
    ).mappings().first()

    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found in your organization.")

    territory_id = payload.territory_id or customer["territory_id"]
    assigned_to = payload.assigned_to

    if territory_id:
        region = get_region(db, territory_id, organization_id)
        if not region or not region["is_active"]:
            raise HTTPException(status_code=404, detail="Active region not found in your organization.")
        if actor_role == "MANAGER" and not manager_manages_region(db, str(current_user["id"]), territory_id, organization_id):
            raise HTTPException(status_code=403, detail="You can only assign customers within your managed regions.")

    if assigned_to:
        assignee = same_org_user(db, assigned_to, organization_id)
        if not assignee or not assignee["is_active"] or role_of(assignee) != "FIELD_REP":
            raise HTTPException(status_code=404, detail="Active Field Rep assignee not found in your organization.")

        if actor_role == "MANAGER":
            if str(assignee["manager_id"] or "") != str(current_user["id"]):
                raise HTTPException(status_code=403, detail="You can only assign customers to your Field Rep team.")
            if territory_id and not manager_manages_region(db, str(current_user["id"]), territory_id, organization_id):
                raise HTTPException(status_code=403, detail="The selected customer region is outside your management scope.")

    db.execute(
        text("""
            UPDATE customers
            SET territory_id = :territory_id,
                assigned_to = :assigned_to,
                updated_at = now()
            WHERE id = :customer_id
              AND organization_id = :organization_id
        """),
        {
            "territory_id": territory_id,
            "assigned_to": assigned_to,
            "customer_id": customer_id,
            "organization_id": organization_id,
        },
    )
    db.commit()

    updated = db.execute(
        text("""
            SELECT
                c.id,
                c.name,
                c.territory_id,
                t.name AS territory_name,
                c.assigned_to,
                u.full_name AS assigned_user_name,
                c.updated_at
            FROM customers c
            LEFT JOIN territories t
              ON t.id = c.territory_id
             AND t.organization_id = c.organization_id
            LEFT JOIN users u
              ON u.id = c.assigned_to
             AND u.organization_id = c.organization_id
            WHERE c.id = :customer_id
              AND c.organization_id = :organization_id
            LIMIT 1
        """),
        {"customer_id": customer_id, "organization_id": organization_id},
    ).mappings().first()

    return {"status": "success", "message": "Customer assignment updated successfully.", "customer": dict(updated) if updated else None}


# =========================================================
# EMPLOYEE ACCOUNT PROVISIONING
# =========================================================

@router.post("/employees")
def create_employee(
    payload: EmployeeCreateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    actor_role = require_exec_or_manager(current_user)
    organization_id = str(current_user["organization_id"])
    role = str(payload.role or "").strip().upper()

    if role not in SUPPORTED_EMPLOYEE_ROLES:
        raise HTTPException(status_code=400, detail="Prototype roles are FIELD_REP and MANAGER.")

    if actor_role == "MANAGER" and role != "FIELD_REP":
        raise HTTPException(status_code=403, detail="Managers can create Field Rep accounts only.")

    email = payload.email.strip().lower()
    full_name = payload.full_name.strip()
    if not full_name or not email:
        raise HTTPException(status_code=400, detail="Full name and email are required.")

    exists = db.execute(
        text("SELECT id FROM users WHERE lower(email) = :email LIMIT 1"),
        {"email": email},
    ).first()
    if exists:
        raise HTTPException(status_code=409, detail="A user with this email already exists.")

    manager_id = payload.manager_id
    territory_id = payload.territory_id
    requested_region_ids = [str(x).strip() for x in payload.region_ids if str(x).strip()]
    if territory_id and territory_id not in requested_region_ids:
        requested_region_ids.insert(0, territory_id)

    if actor_role == "MANAGER":
        manager_id = str(current_user["id"])
        if territory_id and not manager_manages_region(db, manager_id, territory_id, organization_id):
            raise HTTPException(status_code=403, detail="You can only create Field Reps in your managed regions.")
    elif manager_id:
        manager = same_org_user(db, manager_id, organization_id)
        if not manager or role_of(manager) != "MANAGER" or not manager["is_active"]:
            raise HTTPException(status_code=404, detail="Active Manager not found in your organization.")

    if requested_region_ids:
        for requested_region_id in requested_region_ids:
            region = get_region(db, requested_region_id, organization_id)
            if not region or not region["is_active"]:
                raise HTTPException(status_code=404, detail=f"Active region {requested_region_id} not found in your organization.")
            if actor_role == "MANAGER" and not manager_manages_region(db, str(current_user["id"]), requested_region_id, organization_id):
                raise HTTPException(status_code=403, detail="You can only create Field Reps in your managed regions.")

    # A manager account cannot simultaneously be a direct report to another manager.
    if role == "MANAGER":
        manager_id = None

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
                manager_id,
                territory_id
            )
            VALUES (
                :organization_id,
                :full_name,
                :email,
                :role,
                :phone,
                :password_hash,
                true,
                :manager_id,
                :territory_id
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
                territory_id,
                created_at,
                updated_at
        """),
        {
            "organization_id": organization_id,
            "full_name": full_name,
            "email": email,
            "role": role,
            "phone": payload.phone.strip() if payload.phone else None,
            "password_hash": hash_password(payload.password),
            "manager_id": manager_id,
            "territory_id": territory_id,
        },
    )
    user = result.mappings().first()
    if not user:
        db.rollback()
        raise HTTPException(status_code=500, detail="Employee account could not be created.")

    # Managers can cover multiple regions. Store every requested assignment.
    if role == "MANAGER":
        for requested_region_id in requested_region_ids:
            db.execute(
                text("""
                    INSERT INTO manager_region_assignments (
                        organization_id, manager_id, territory_id, assigned_by, is_active
                    )
                    VALUES (:organization_id, :manager_id, :territory_id, :assigned_by, true)
                    ON CONFLICT (manager_id, territory_id)
                    DO UPDATE SET
                        organization_id = EXCLUDED.organization_id,
                        assigned_by = EXCLUDED.assigned_by,
                        assigned_at = now(),
                        is_active = true,
                        updated_at = now()
                """),
                {
                    "organization_id": organization_id,
                    "manager_id": user["id"],
                    "territory_id": requested_region_id,
                    "assigned_by": current_user["id"],
                },
            )

    db.commit()
    return {
        "status": "success",
        "message": "Employee account created successfully.",
        "user": dict(user),
        "credentials": {
            "email": email,
            "temporary_password": payload.password,
            "region_ids": requested_region_ids,
            "note": "Prototype only. Production should use an invitation and password setup flow.",
        },
    }


# =========================================================
# EXECUTIVE ROLE / ACTIVE STATUS MANAGEMENT
# =========================================================

@router.patch("/users/{user_id}/role")
def change_user_role(
    user_id: str,
    payload: RoleUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_exec(current_user)
    organization_id = str(current_user["organization_id"])
    target = same_org_user(db, user_id, organization_id)
    new_role = str(payload.role or "").strip().upper()

    if not target:
        raise HTTPException(status_code=404, detail="User not found in your organization.")
    if str(target["id"]) == str(current_user["id"]):
        raise HTTPException(status_code=400, detail="You cannot change your own Executive role.")
    if new_role not in {"FIELD_REP", "MANAGER", "EXECUTIVE"}:
        raise HTTPException(status_code=400, detail="Allowed roles: FIELD_REP, MANAGER, EXECUTIVE.")

    current_role = role_of(target)
    if current_role == "MANAGER" and new_role != "MANAGER":
        active_reports = db.execute(
            text("""
                SELECT COUNT(*)
                FROM users
                WHERE organization_id = :organization_id
                  AND manager_id = :manager_id
                  AND role = 'FIELD_REP'
                  AND is_active = true
            """),
            {"organization_id": organization_id, "manager_id": user_id},
        ).scalar_one()
        if int(active_reports or 0) > 0:
            raise HTTPException(
                status_code=409,
                detail="Reassign or deactivate the Manager's active Field Rep team before demotion.",
            )

    manager_id = target["manager_id"] if new_role == "FIELD_REP" else None

    db.execute(
        text("""
            UPDATE users
            SET role = :role,
                manager_id = :manager_id,
                updated_at = now()
            WHERE id = :user_id
              AND organization_id = :organization_id
        """),
        {
            "role": new_role,
            "manager_id": manager_id,
            "user_id": user_id,
            "organization_id": organization_id,
        },
    )
    db.commit()

    updated = same_org_user(db, user_id, organization_id)
    return {"status": "success", "message": "User role updated successfully.", "user": dict(updated) if updated else None}


@router.patch("/users/{user_id}/status")
def change_user_status(
    user_id: str,
    payload: ActiveUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_exec(current_user)
    organization_id = str(current_user["organization_id"])

    if str(user_id) == str(current_user["id"]):
        raise HTTPException(status_code=400, detail="You cannot deactivate your own Executive account.")

    target = same_org_user(db, user_id, organization_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found in your organization.")

    db.execute(
        text("""
            UPDATE users
            SET is_active = :is_active,
                updated_at = now()
            WHERE id = :user_id
              AND organization_id = :organization_id
        """),
        {
            "is_active": payload.is_active,
            "user_id": user_id,
            "organization_id": organization_id,
        },
    )
    db.commit()

    updated = same_org_user(db, user_id, organization_id)
    return {
        "status": "success",
        "message": "User activated successfully." if payload.is_active else "User deactivated successfully.",
        "user": dict(updated) if updated else None,
    }


# =========================================================
# REPORTING / PERFORMANCE DIRECTORY
# =========================================================

@router.get("/performance")
def get_performance_directory(
    region_id: str | None = Query(default=None),
    manager_id: str | None = Query(default=None),
    search: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    role = require_exec_or_manager(current_user)
    organization_id = str(current_user["organization_id"])
    actor_id = str(current_user["id"])

    if role == "MANAGER":
        if manager_id and manager_id != actor_id:
            raise HTTPException(status_code=403, detail="Managers can only view their own team performance.")
        manager_id = actor_id
        if region_id and not manager_manages_region(db, actor_id, region_id, organization_id):
            raise HTTPException(status_code=403, detail="The selected region is not assigned to you.")

    params: dict[str, Any] = {"organization_id": organization_id}
    filters = ["u.organization_id = :organization_id"]
    if region_id:
        filters.append("u.territory_id = :region_id")
        params["region_id"] = region_id
    if manager_id:
        filters.append("u.manager_id = :manager_id")
        params["manager_id"] = manager_id
    if search:
        filters.append("(LOWER(u.full_name) LIKE LOWER(:search) OR LOWER(u.email) LIKE LOWER(:search))")
        params["search"] = f"%{search.strip()}%"
    if role == "MANAGER":
        filters.append("u.role = 'FIELD_REP'")
    else:
        filters.append("u.role IN ('FIELD_REP', 'MANAGER')")

    result = db.execute(
        text(f"""
            SELECT
                u.id,
                u.full_name,
                u.email,
                u.role,
                u.is_active,
                u.manager_id,
                manager.full_name AS manager_name,
                u.territory_id,
                t.name AS territory_name,
                COUNT(DISTINCT v.id) AS visits,
                COUNT(DISTINCT r.id) AS reports,
                COUNT(DISTINCT CASE WHEN UPPER(r.status) = 'SUBMITTED' THEN r.id END) AS submitted_reports,
                COUNT(DISTINCT CASE WHEN UPPER(r.status) = 'APPROVED' THEN r.id END) AS approved_reports,
                COUNT(DISTINCT CASE WHEN UPPER(ai.status) IN ('PENDING', 'IN_PROGRESS') THEN ai.id END) AS pending_action_items,
                COUNT(DISTINCT CASE WHEN UPPER(a.status) = 'OPEN' THEN a.id END) AS open_alerts
            FROM users u
            LEFT JOIN users manager
              ON manager.id = u.manager_id
             AND manager.organization_id = u.organization_id
            LEFT JOIN territories t
              ON t.id = u.territory_id
             AND t.organization_id = u.organization_id
            LEFT JOIN visits v
              ON v.user_id = u.id
             AND v.organization_id = u.organization_id
            LEFT JOIN reports r
              ON r.created_by = u.id
             AND r.organization_id = u.organization_id
            LEFT JOIN action_items ai
              ON ai.organization_id = u.organization_id
             AND ai.assigned_to = u.id
            LEFT JOIN alerts a
              ON a.organization_id = u.organization_id
             AND a.assigned_to = u.id
            WHERE {' AND '.join(filters)}
            GROUP BY
                u.id, u.full_name, u.email, u.role, u.is_active,
                u.manager_id, manager.full_name, u.territory_id, t.name
            ORDER BY
                CASE u.role WHEN 'MANAGER' THEN 1 ELSE 2 END,
                u.full_name ASC
        """),
        params,
    )
    rows = [dict(row) for row in result.mappings().all()]
    return {"status": "success", "count": len(rows), "people": rows}
