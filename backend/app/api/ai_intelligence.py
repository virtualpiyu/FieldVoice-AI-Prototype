from sqlalchemy import text
from sqlalchemy.orm import Session

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.database import get_db
from app.core.dependencies import get_current_user


router = APIRouter(
    tags=["AI Intelligence"],
)
class ActionItemStatusUpdate(BaseModel):
    status: str

class AlertStatusUpdate(BaseModel):
    status: str
# =========================================================
# AI INSIGHTS
# =========================================================

@router.get("/ai-insights/")
def get_ai_insights(
    visit_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    organization_id = current_user["organization_id"]
    user_id = current_user["id"]
    role = current_user["role"]

    query = """
        SELECT
            ai.id,
            ai.voice_note_id,
            ai.visit_id,
            ai.organization_id,
            ai.summary,
            ai.sentiment,
            ai.sentiment_score,
            ai.key_insights,
            ai.opportunity_level,
            ai.risk_level,
            ai.customer_reaction,
            ai.competitor_mentions,
            ai.ai_confidence,
            ai.model_name,
            ai.processing_time_ms,
            ai.created_at,
            ai.updated_at,
            c.name AS customer_name,
            u.full_name AS rep_name
        FROM ai_insights ai
        JOIN visits v
            ON v.id = ai.visit_id
        JOIN customers c
            ON c.id = v.customer_id
        JOIN users u
            ON u.id = v.user_id
        WHERE ai.organization_id = :organization_id
    """

    params = {
        "organization_id": organization_id,
    }

    # Field reps see their own AI insights, their territory, or demo insights
    if role == "FIELD_REP":
        query += """
            AND (
                v.user_id = :user_id 
                OR :user_id = '33333333-3333-3333-3333-333333333336'
                OR v.territory_id = (SELECT territory_id FROM users WHERE id = :user_id)
            )
        """
        params["user_id"] = user_id

    if visit_id:
        query += """
            AND ai.visit_id = :visit_id
        """
        params["visit_id"] = visit_id

    query += """
        ORDER BY ai.created_at DESC
    """

    result = db.execute(
        text(query),
        params,
    )

    insights = [
        dict(row)
        for row in result.mappings().all()
    ]

    return {
        "status": "success",
        "count": len(insights),
        "ai_insights": insights,
    }


@router.get("/ai-insights/{ai_insight_id}")
def get_ai_insight(
    ai_insight_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    organization_id = current_user["organization_id"]
    user_id = current_user["id"]
    role = current_user["role"]

    query = """
        SELECT
            ai.id,
            ai.voice_note_id,
            ai.visit_id,
            ai.organization_id,
            ai.summary,
            ai.sentiment,
            ai.sentiment_score,
            ai.key_insights,
            ai.opportunity_level,
            ai.risk_level,
            ai.customer_reaction,
            ai.competitor_mentions,
            ai.ai_confidence,
            ai.model_name,
            ai.processing_time_ms,
            ai.created_at,
            ai.updated_at,
            c.id AS customer_id,
            c.name AS customer_name,
            u.id AS rep_id,
            u.full_name AS rep_name
        FROM ai_insights ai
        JOIN visits v
            ON v.id = ai.visit_id
        JOIN customers c
            ON c.id = v.customer_id
        JOIN users u
            ON u.id = v.user_id
        WHERE ai.id = :ai_insight_id
          AND ai.organization_id = :organization_id
    """

    params = {
        "ai_insight_id": ai_insight_id,
        "organization_id": organization_id,
    }

    if role == "FIELD_REP":
        query += """
            AND v.user_id = :user_id
        """
        params["user_id"] = user_id

    query += """
        LIMIT 1
    """

    result = db.execute(
        text(query),
        params,
    )

    insight = result.mappings().first()

    if not insight:
        raise HTTPException(
            status_code=404,
            detail="AI insight not found.",
        )

    return {
        "status": "success",
        "ai_insight": dict(insight),
    }


# =========================================================
# ACTION ITEMS
# =========================================================

@router.get("/action-items/")
def get_action_items(
    visit_id: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    organization_id = current_user["organization_id"]
    user_id = current_user["id"]
    role = current_user["role"]

    query = """
        SELECT
            ai.id,
            ai.organization_id,
            ai.visit_id,
            ai.ai_insight_id,
            ai.customer_id,
            ai.assigned_to,
            ai.title,
            ai.description,
            ai.priority,
            ai.status,
            ai.due_date,
            ai.completed_at,
            ai.source,
            ai.created_at,
            ai.updated_at,
            c.name AS customer_name,
            u.full_name AS assigned_user_name
        FROM action_items ai
        LEFT JOIN customers c
            ON c.id = ai.customer_id
        LEFT JOIN users u
            ON u.id = ai.assigned_to
        WHERE ai.organization_id = :organization_id
    """

    params = {
        "organization_id": organization_id,
    }

    if role == "FIELD_REP":
        query += """
            AND (
                ai.assigned_to = :user_id 
                OR ai.assigned_to IS NULL 
                OR ai.visit_id IN (SELECT id FROM visits WHERE user_id = :user_id)
                OR :user_id = '33333333-3333-3333-3333-333333333336'
            )
        """
        params["user_id"] = user_id

    if visit_id:
        query += """
            AND ai.visit_id = :visit_id
        """
        params["visit_id"] = visit_id

    if status:
        query += """
            AND ai.status = :status
        """
        params["status"] = status

    query += """
        ORDER BY ai.created_at DESC
    """

    result = db.execute(
        text(query),
        params,
    )

    action_items = [
        dict(row)
        for row in result.mappings().all()
    ]

    return {
        "status": "success",
        "count": len(action_items),
        "action_items": action_items,
    }


class ActionItemCreate(BaseModel):
    title: str
    description: str | None = None
    priority: str = "MEDIUM"
    status: str = "PENDING"
    customer_id: str | None = None
    visit_id: str | None = None
    assigned_to: str | None = None
    due_date: str | None = None


@router.post("/action-items/")
def create_action_item(
    payload: ActionItemCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    organization_id = current_user["organization_id"]
    assigned = payload.assigned_to or current_user["id"]

    result = db.execute(
        text("""
            INSERT INTO action_items (
                organization_id,
                visit_id,
                customer_id,
                assigned_to,
                title,
                description,
                priority,
                status,
                due_date,
                source
            )
            VALUES (
                :organization_id,
                :visit_id,
                :customer_id,
                :assigned_to,
                :title,
                :description,
                :priority,
                :status,
                :due_date,
                'USER'
            )
            RETURNING id, organization_id, visit_id, customer_id, assigned_to, title, description, priority, status, due_date, created_at
        """),
        {
            "organization_id": organization_id,
            "visit_id": payload.visit_id,
            "customer_id": payload.customer_id,
            "assigned_to": assigned,
            "title": payload.title,
            "description": payload.description or "Manual follow-up task",
            "priority": payload.priority.upper(),
            "status": payload.status.upper(),
            "due_date": payload.due_date,
        },
    )
    db.commit()
    item = result.mappings().first()
    return {
        "status": "success",
        "action_item": dict(item) if item else None,
    }


@router.patch("/action-items/{action_item_id}")
def update_action_item_status(
    action_item_id: str,
    payload: ActionItemStatusUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    organization_id = current_user["organization_id"]
    user_id = current_user["id"]
    role = current_user["role"]

    allowed_statuses = {
        "PENDING",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
    }

    status = payload.status.upper()

    if status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Allowed values: {', '.join(sorted(allowed_statuses))}",
        )

    # FIELD_REP can update their assigned action items or demo account
    if role == "FIELD_REP":
        action_item = db.execute(
            text("""
                SELECT id
                FROM action_items
                WHERE id = :action_item_id
                  AND organization_id = :organization_id
                  AND (assigned_to = :user_id OR assigned_to IS NULL OR :user_id = '33333333-3333-3333-3333-333333333336')
                LIMIT 1
            """),
            {
                "action_item_id": action_item_id,
                "organization_id": organization_id,
                "user_id": user_id,
            },
        ).mappings().first()

    else:
        # MANAGER / EXECUTIVE can update action items
        # inside their organization
        action_item = db.execute(
            text("""
                SELECT id
                FROM action_items
                WHERE id = :action_item_id
                  AND organization_id = :organization_id
                LIMIT 1
            """),
            {
                "action_item_id": action_item_id,
                "organization_id": organization_id,
            },
        ).mappings().first()

    if not action_item:
        raise HTTPException(
            status_code=404,
            detail="Action item not found or access denied.",
        )

    db.execute(
        text("""
            UPDATE action_items
            SET
                status = :status,
                completed_at = CASE
                    WHEN :status = 'COMPLETED' THEN now()
                    ELSE NULL
                END,
                updated_at = now()
            WHERE id = :action_item_id
              AND organization_id = :organization_id
        """),
        {
            "status": status,
            "action_item_id": action_item_id,
            "organization_id": organization_id,
        },
    )

    db.commit()

    result = db.execute(
        text("""
            SELECT
                ai.id,
                ai.organization_id,
                ai.visit_id,
                ai.ai_insight_id,
                ai.customer_id,
                ai.assigned_to,
                ai.title,
                ai.description,
                ai.priority,
                ai.status,
                ai.due_date,
                ai.completed_at,
                ai.source,
                ai.created_at,
                ai.updated_at,
                c.name AS customer_name,
                u.full_name AS assigned_user_name
            FROM action_items ai
            LEFT JOIN customers c
                ON c.id = ai.customer_id
            LEFT JOIN users u
                ON u.id = ai.assigned_to
            WHERE ai.id = :action_item_id
              AND ai.organization_id = :organization_id
            LIMIT 1
        """),
        {
            "action_item_id": action_item_id,
            "organization_id": organization_id,
        },
    )

    updated_action_item = result.mappings().first()

    return {
        "status": "success",
        "message": "Action item status updated successfully.",
        "action_item": dict(updated_action_item),
    }
# =========================================================
# ALERTS
# =========================================================
@router.patch("/alerts/{alert_id}")
def update_alert_status(
    alert_id: str,
    payload: AlertStatusUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    organization_id = current_user["organization_id"]
    user_id = current_user["id"]
    role = current_user["role"]

    allowed_statuses = {
        "OPEN",
        "ACKNOWLEDGED",
        "RESOLVED",
        "DISMISSED",
    }

    status = payload.status.upper()

    if status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Allowed values: {', '.join(sorted(allowed_statuses))}",
        )

    if role == "FIELD_REP":
        alert = db.execute(
            text("""
                SELECT id
                FROM alerts
                WHERE id = :alert_id
                  AND organization_id = :organization_id
                  AND (
                      assigned_to = :user_id
                      OR assigned_to IS NULL
                  )
                LIMIT 1
            """),
            {
                "alert_id": alert_id,
                "organization_id": organization_id,
                "user_id": user_id,
            },
        ).mappings().first()

    elif role == "MANAGER":
        alert = db.execute(
            text("""
                SELECT a.id
                FROM alerts a
                LEFT JOIN visits v
                  ON v.id = a.visit_id
                 AND v.organization_id = a.organization_id
                LEFT JOIN users rep
                  ON rep.id = v.user_id
                 AND rep.organization_id = a.organization_id
                WHERE a.id = :alert_id
                  AND a.organization_id = :organization_id
                  AND (
                    v.user_id = :user_id
                    OR rep.manager_id = :user_id
                  )
                LIMIT 1
            """),
            {
                "alert_id": alert_id,
                "organization_id": organization_id,
                "user_id": user_id,
            },
        ).mappings().first()
    else:
        alert = db.execute(
            text("""
                SELECT id
                FROM alerts
                WHERE id = :alert_id
                  AND organization_id = :organization_id
                LIMIT 1
            """),
            {
                "alert_id": alert_id,
                "organization_id": organization_id,
            },
        ).mappings().first()

    if not alert:
        raise HTTPException(
            status_code=404,
            detail="Alert not found or access denied.",
        )

    db.execute(
        text("""
            UPDATE alerts
            SET
                status = :status,
                acknowledged_at = CASE
                    WHEN :status IN ('ACKNOWLEDGED', 'RESOLVED')
                    THEN COALESCE(acknowledged_at, now())
                    ELSE acknowledged_at
                END,
                resolved_at = CASE
                    WHEN :status = 'RESOLVED'
                    THEN COALESCE(resolved_at, now())
                    ELSE NULL
                END,
                updated_at = now()
            WHERE id = :alert_id
              AND organization_id = :organization_id
        """),
        {
            "status": status,
            "alert_id": alert_id,
            "organization_id": organization_id,
        },
    )

    db.commit()

    result = db.execute(
        text("""
            SELECT
                a.id,
                a.organization_id,
                a.visit_id,
                a.customer_id,
                a.ai_insight_id,
                a.assigned_to,
                a.alert_type,
                a.severity,
                a.title,
                a.message,
                a.status,
                a.acknowledged_at,
                a.resolved_at,
                a.created_at,
                a.updated_at,
                c.name AS customer_name
            FROM alerts a
            LEFT JOIN customers c
                ON c.id = a.customer_id
            WHERE a.id = :alert_id
              AND a.organization_id = :organization_id
            LIMIT 1
        """),
        {
            "alert_id": alert_id,
            "organization_id": organization_id,
        },
    )

    updated_alert = result.mappings().first()

    return {
        "status": "success",
        "message": "Alert status updated successfully.",
        "alert": dict(updated_alert),
    }


@router.get("/alerts/")
def get_alerts(
    visit_id: str | None = None,
    status: str | None = None,
    territory_id: str | None = None,
    manager_id: str | None = None,
    field_rep_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    organization_id = str(current_user["organization_id"])
    user_id = str(current_user["id"])
    role = str(current_user["role"] or "").upper()

    query = """
        SELECT
            a.id,
            a.organization_id,
            a.visit_id,
            a.customer_id,
            a.ai_insight_id,
            a.assigned_to,
            a.alert_type,
            a.severity,
            a.title,
            a.message,
            a.status,
            a.acknowledged_at,
            a.resolved_at,
            a.created_at,
            a.updated_at,
            c.name AS customer_name,
            v.territory_id,
            t.name AS region_name,
            v.user_id AS rep_id,
            rep.full_name AS rep_name,
            rep.manager_id,
            manager.full_name AS manager_name
        FROM alerts a
        LEFT JOIN customers c ON c.id = a.customer_id
        LEFT JOIN visits v
          ON v.id = a.visit_id
         AND v.organization_id = a.organization_id
        LEFT JOIN territories t
          ON t.id = v.territory_id
         AND t.organization_id = v.organization_id
        LEFT JOIN users rep
          ON rep.id = v.user_id
         AND rep.organization_id = v.organization_id
        LEFT JOIN users manager
          ON manager.id = rep.manager_id
         AND manager.organization_id = rep.organization_id
        WHERE a.organization_id = :organization_id
    """
    params = {"organization_id": organization_id, "user_id": user_id}

    if role == "FIELD_REP":
        query += " AND (a.assigned_to = :user_id OR a.assigned_to IS NULL) AND v.user_id = :user_id"
    elif role == "MANAGER":
        query += """
          AND (
            v.user_id = :user_id
            OR EXISTS (
              SELECT 1 FROM users direct_rep
              WHERE direct_rep.id = v.user_id
                AND direct_rep.organization_id = :organization_id
                AND direct_rep.manager_id = :user_id
                AND direct_rep.role = 'FIELD_REP'
            )
          )
        """

    if visit_id:
        query += " AND a.visit_id = :visit_id"
        params["visit_id"] = visit_id
    if status:
        query += " AND a.status = :status"
        params["status"] = status
    if territory_id:
        query += " AND v.territory_id = :territory_id"
        params["territory_id"] = territory_id
    if manager_id:
        query += " AND rep.manager_id = :manager_id"
        params["manager_id"] = manager_id
    if field_rep_id:
        query += " AND v.user_id = :field_rep_id"
        params["field_rep_id"] = field_rep_id

    query += " ORDER BY a.created_at DESC"

    result = db.execute(text(query), params)
    alerts = [dict(row) for row in result.mappings().all()]
    return {"status": "success", "count": len(alerts), "alerts": alerts}

