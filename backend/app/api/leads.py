from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.database import get_db
from app.core.dependencies import get_current_user


router = APIRouter(
    prefix="/leads",
    tags=["Leads"],
)


# =========================================================
# REQUEST MODELS
# =========================================================

class LeadCreateRequest(BaseModel):
    customer_id: str | None = None
    territory_id: str | None = None
    assigned_to: str | None = None
    title: str
    description: str | None = None
    stage: str = "NEW"
    value: float | None = None
    probability: float | None = None
    source: str = "MANUAL"
    expected_close_date: datetime | None = None
    notes: str | None = None


class LeadStageUpdate(BaseModel):
    stage: str
    notes: str | None = None


# =========================================================
# CREATE LEAD
# =========================================================

@router.post("/")
def create_lead(
    payload: LeadCreateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    organization_id = current_user["organization_id"]
    user_id = current_user["id"]
    role = current_user["role"]

    allowed_stages = {
        "NEW",
        "QUALIFIED",
        "PROPOSAL",
        "NEGOTIATION",
        "WON",
        "LOST",
    }

    allowed_sources = {
        "FIELD_VISIT",
        "AI_DETECTED",
        "MANUAL",
        "REFERRAL",
        "OTHER",
    }

    stage = payload.stage.upper()
    source = payload.source.upper()

    if stage not in allowed_stages:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid stage. Allowed values: {', '.join(sorted(allowed_stages))}",
        )

    if source not in allowed_sources:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid source. Allowed values: {', '.join(sorted(allowed_sources))}",
        )

    if payload.probability is not None and not 0 <= payload.probability <= 100:
        raise HTTPException(
            status_code=400,
            detail="Probability must be between 0 and 100.",
        )

    # FIELD_REP cannot assign a lead to another user
    assigned_to = payload.assigned_to or user_id

    if role == "FIELD_REP" and str(assigned_to) != str(user_id):
        raise HTTPException(
            status_code=403,
            detail="Field reps can only assign leads to themselves.",
        )

    # Validate customer
    if payload.customer_id:
        customer = db.execute(
            text("""
                SELECT id
                FROM customers
                WHERE id = :customer_id
                  AND organization_id = :organization_id
                LIMIT 1
            """),
            {
                "customer_id": payload.customer_id,
                "organization_id": organization_id,
            },
        ).mappings().first()

        if not customer:
            raise HTTPException(
                status_code=404,
                detail="Customer not found in your organization.",
            )

    # Validate territory
    if payload.territory_id:
        territory = db.execute(
            text("""
                SELECT id
                FROM territories
                WHERE id = :territory_id
                  AND organization_id = :organization_id
                LIMIT 1
            """),
            {
                "territory_id": payload.territory_id,
                "organization_id": organization_id,
            },
        ).mappings().first()

        if not territory:
            raise HTTPException(
                status_code=404,
                detail="Territory not found in your organization.",
            )

    # Validate assigned user
    assigned_user = db.execute(
        text("""
            SELECT id
            FROM users
            WHERE id = :assigned_to
              AND organization_id = :organization_id
              AND is_active = true
            LIMIT 1
        """),
        {
            "assigned_to": assigned_to,
            "organization_id": organization_id,
        },
    ).mappings().first()

    if not assigned_user:
        raise HTTPException(
            status_code=404,
            detail="Assigned user not found or inactive.",
        )

    result = db.execute(
        text("""
            INSERT INTO leads (
                organization_id,
                customer_id,
                territory_id,
                assigned_to,
                title,
                description,
                stage,
                value,
                probability,
                source,
                expected_close_date,
                notes
            )
            VALUES (
                :organization_id,
                :customer_id,
                :territory_id,
                :assigned_to,
                :title,
                :description,
                :stage,
                :value,
                :probability,
                :source,
                :expected_close_date,
                :notes
            )
            RETURNING
                id,
                organization_id,
                customer_id,
                territory_id,
                assigned_to,
                title,
                description,
                stage,
                value,
                probability,
                source,
                expected_close_date,
                notes,
                created_at,
                updated_at
        """),
        {
            "organization_id": organization_id,
            "customer_id": payload.customer_id,
            "territory_id": payload.territory_id,
            "assigned_to": assigned_to,
            "title": payload.title,
            "description": payload.description,
            "stage": stage,
            "value": payload.value,
            "probability": payload.probability,
            "source": source,
            "expected_close_date": payload.expected_close_date,
            "notes": payload.notes,
        },
    )

    lead = result.mappings().first()

    db.execute(
        text("""
            INSERT INTO lead_stage_history (
                lead_id,
                organization_id,
                from_stage,
                to_stage,
                changed_by,
                notes
            )
            VALUES (
                :lead_id,
                :organization_id,
                NULL,
                :stage,
                :changed_by,
                'Initial lead creation'
            )
        """),
        {
            "lead_id": lead["id"],
            "organization_id": organization_id,
            "stage": stage,
            "changed_by": user_id,
        },
    )

    db.commit()

    return {
        "status": "success",
        "message": "Lead created successfully.",
        "lead": dict(lead),
    }


# =========================================================
# GET LEADS
# =========================================================

@router.get("/")
def get_leads(
    stage: str | None = None,
    assigned_to: str | None = None,
    customer_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    organization_id = current_user["organization_id"]
    user_id = current_user["id"]
    role = current_user["role"]

    query = """
        SELECT
            l.id,
            l.organization_id,
            l.customer_id,
            l.territory_id,
            l.assigned_to,
            l.title,
            l.description,
            l.stage,
            l.value,
            l.probability,
            l.source,
            l.expected_close_date,
            l.notes,
            l.created_at,
            l.updated_at,
            c.name AS customer_name,
            t.name AS territory_name,
            u.full_name AS assigned_user_name
        FROM leads l
        LEFT JOIN customers c
            ON c.id = l.customer_id
        LEFT JOIN territories t
            ON t.id = l.territory_id
        LEFT JOIN users u
            ON u.id = l.assigned_to
        WHERE l.organization_id = :organization_id
    """

    params = {
        "organization_id": organization_id,
    }

    if role == "FIELD_REP":
        query += """
            AND l.assigned_to = :user_id
        """
        params["user_id"] = user_id

    if stage:
        query += """
            AND l.stage = :stage
        """
        params["stage"] = stage.upper()

    if assigned_to:
        query += """
            AND l.assigned_to = :assigned_to
        """
        params["assigned_to"] = assigned_to

    if customer_id:
        query += """
            AND l.customer_id = :customer_id
        """
        params["customer_id"] = customer_id

    query += """
        ORDER BY l.created_at DESC
    """

    result = db.execute(
        text(query),
        params,
    )

    leads = [
        dict(row)
        for row in result.mappings().all()
    ]

    return {
        "status": "success",
        "count": len(leads),
        "leads": leads,
    }


# =========================================================
# GET SINGLE LEAD
# =========================================================

@router.get("/{lead_id}")
def get_lead(
    lead_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    organization_id = current_user["organization_id"]
    user_id = current_user["id"]
    role = current_user["role"]

    query = """
        SELECT
            l.id,
            l.organization_id,
            l.customer_id,
            l.territory_id,
            l.assigned_to,
            l.title,
            l.description,
            l.stage,
            l.value,
            l.probability,
            l.source,
            l.expected_close_date,
            l.notes,
            l.created_at,
            l.updated_at,
            c.name AS customer_name,
            t.name AS territory_name,
            u.full_name AS assigned_user_name
        FROM leads l
        LEFT JOIN customers c
            ON c.id = l.customer_id
        LEFT JOIN territories t
            ON t.id = l.territory_id
        LEFT JOIN users u
            ON u.id = l.assigned_to
        WHERE l.id = :lead_id
          AND l.organization_id = :organization_id
    """

    params = {
        "lead_id": lead_id,
        "organization_id": organization_id,
    }

    if role == "FIELD_REP":
        query += """
            AND l.assigned_to = :user_id
        """
        params["user_id"] = user_id

    query += """
        LIMIT 1
    """

    result = db.execute(
        text(query),
        params,
    )

    lead = result.mappings().first()

    if not lead:
        raise HTTPException(
            status_code=404,
            detail="Lead not found or access denied.",
        )

    return {
        "status": "success",
        "lead": dict(lead),
    }


# =========================================================
# UPDATE LEAD STAGE
# =========================================================

@router.patch("/{lead_id}/stage")
def update_lead_stage(
    lead_id: str,
    payload: LeadStageUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    organization_id = current_user["organization_id"]
    user_id = current_user["id"]
    role = current_user["role"]

    allowed_stages = {
        "NEW",
        "QUALIFIED",
        "PROPOSAL",
        "NEGOTIATION",
        "WON",
        "LOST",
    }

    new_stage = payload.stage.upper()

    if new_stage not in allowed_stages:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid stage. Allowed values: {', '.join(sorted(allowed_stages))}",
        )

    query = """
        SELECT
            id,
            stage,
            assigned_to
        FROM leads
        WHERE id = :lead_id
          AND organization_id = :organization_id
    """

    params = {
        "lead_id": lead_id,
        "organization_id": organization_id,
    }

    if role == "FIELD_REP":
        query += """
            AND assigned_to = :user_id
        """
        params["user_id"] = user_id

    query += """
        LIMIT 1
    """

    lead = db.execute(
        text(query),
        params,
    ).mappings().first()

    if not lead:
        raise HTTPException(
            status_code=404,
            detail="Lead not found or access denied.",
        )

    old_stage = lead["stage"]

    if old_stage == new_stage:
        raise HTTPException(
            status_code=400,
            detail="Lead is already in this stage.",
        )

    db.execute(
        text("""
            UPDATE leads
            SET
                stage = :new_stage,
                updated_at = now()
            WHERE id = :lead_id
              AND organization_id = :organization_id
        """),
        {
            "new_stage": new_stage,
            "lead_id": lead_id,
            "organization_id": organization_id,
        },
    )

    db.execute(
        text("""
            INSERT INTO lead_stage_history (
                lead_id,
                organization_id,
                from_stage,
                to_stage,
                changed_by,
                notes
            )
            VALUES (
                :lead_id,
                :organization_id,
                :from_stage,
                :to_stage,
                :changed_by,
                :notes
            )
        """),
        {
            "lead_id": lead_id,
            "organization_id": organization_id,
            "from_stage": old_stage,
            "to_stage": new_stage,
            "changed_by": user_id,
            "notes": payload.notes,
        },
    )

    db.commit()

    return {
        "status": "success",
        "message": "Lead stage updated successfully.",
        "lead_id": lead_id,
        "from_stage": old_stage,
        "to_stage": new_stage,
    }


# =========================================================
# GET LEAD STAGE HISTORY
# =========================================================

@router.get("/{lead_id}/history")
def get_lead_history(
    lead_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    organization_id = current_user["organization_id"]
    user_id = current_user["id"]
    role = current_user["role"]

    query = """
        SELECT
            h.id,
            h.lead_id,
            h.organization_id,
            h.from_stage,
            h.to_stage,
            h.changed_by,
            h.notes,
            h.created_at,
            u.full_name AS changed_by_name
        FROM lead_stage_history h
        LEFT JOIN users u
            ON u.id = h.changed_by
        WHERE h.lead_id = :lead_id
          AND h.organization_id = :organization_id
    """

    params = {
        "lead_id": lead_id,
        "organization_id": organization_id,
    }

    if role == "FIELD_REP":
        query += """
            AND h.changed_by = :user_id
        """
        params["user_id"] = user_id

    query += """
        ORDER BY h.created_at ASC
    """

    result = db.execute(
        text(query),
        params,
    )

    history = [
        dict(row)
        for row in result.mappings().all()
    ]

    if not history:
        raise HTTPException(
            status_code=404,
            detail="Lead history not found.",
        )

    return {
        "status": "success",
        "count": len(history),
        "history": history,
    }