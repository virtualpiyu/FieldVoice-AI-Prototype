from sqlalchemy import text
from sqlalchemy.orm import Session

from fastapi import APIRouter, Depends

from app.database import get_db
from app.core.dependencies import get_current_user


router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"],
)


@router.get("/overview")
def get_dashboard_overview(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    organization_id = current_user["organization_id"]
    user_id = current_user["id"]
    role = current_user["role"]

    # -----------------------------------------
    # ROLE FILTER
    # -----------------------------------------

    user_filter_visits = ""
    user_filter_insights = ""
    user_filter_actions = ""
    user_filter_alerts = ""
    user_filter_leads = ""

    params = {
        "organization_id": organization_id,
    }

    if role == "FIELD_REP":

        user_filter_visits = """
            AND v.user_id = :user_id
        """

        user_filter_insights = """
            AND v.user_id = :user_id
        """

        user_filter_actions = """
            AND ai.assigned_to = :user_id
        """

        user_filter_alerts = """
            AND (
                a.assigned_to = :user_id
                OR a.assigned_to IS NULL
            )
        """

        user_filter_leads = """
            AND l.assigned_to = :user_id
        """

        params["user_id"] = user_id

    # -----------------------------------------
    # BASIC COUNTS
    # -----------------------------------------

    visit_count = db.execute(
        text(f"""
            SELECT COUNT(*) AS count
            FROM visits v
            WHERE v.organization_id = :organization_id
            {user_filter_visits}
        """),
        params,
    ).scalar()

    customer_count = db.execute(
        text("""
            SELECT COUNT(*) AS count
            FROM customers
            WHERE organization_id = :organization_id
        """),
        params,
    ).scalar()

    action_count = db.execute(
        text(f"""
            SELECT COUNT(*) AS count
            FROM action_items ai
            WHERE ai.organization_id = :organization_id
              AND ai.status = 'PENDING'
              {user_filter_actions}
        """),
        params,
    ).scalar()

    open_alert_count = db.execute(
        text(f"""
            SELECT COUNT(*) AS count
            FROM alerts a
            WHERE a.organization_id = :organization_id
              AND a.status = 'OPEN'
              {user_filter_alerts}
        """),
        params,
    ).scalar()

    lead_count = db.execute(
        text(f"""
            SELECT COUNT(*) AS count
            FROM leads l
            WHERE l.organization_id = :organization_id
            {user_filter_leads}
        """),
        params,
    ).scalar()

    # -----------------------------------------
    # PIPELINE VALUE
    # -----------------------------------------

    pipeline_value = db.execute(
        text(f"""
            SELECT COALESCE(SUM(l.value), 0)
            FROM leads l
            WHERE l.organization_id = :organization_id
              AND l.stage NOT IN ('WON', 'LOST')
              {user_filter_leads}
        """),
        params,
    ).scalar()

    won_value = db.execute(
        text(f"""
            SELECT COALESCE(SUM(l.value), 0)
            FROM leads l
            WHERE l.organization_id = :organization_id
              AND l.stage = 'WON'
              {user_filter_leads}
        """),
        params,
    ).scalar()

    # -----------------------------------------
    # AI OPPORTUNITIES
    # -----------------------------------------

    high_opportunity_count = db.execute(
        text(f"""
            SELECT COUNT(*)
            FROM ai_insights ai
            JOIN visits v
                ON v.id = ai.visit_id
            WHERE ai.organization_id = :organization_id
              AND ai.opportunity_level = 'HIGH'
              {user_filter_insights}
        """),
        params,
    ).scalar()

    high_risk_count = db.execute(
        text(f"""
            SELECT COUNT(*)
            FROM ai_insights ai
            JOIN visits v
                ON v.id = ai.visit_id
            WHERE ai.organization_id = :organization_id
              AND ai.risk_level = 'HIGH'
              {user_filter_insights}
        """),
        params,
    ).scalar()

    # -----------------------------------------
    # SENTIMENT DISTRIBUTION
    # -----------------------------------------

    sentiment_result = db.execute(
        text(f"""
            SELECT
                ai.sentiment,
                COUNT(*) AS count
            FROM ai_insights ai
            JOIN visits v
                ON v.id = ai.visit_id
            WHERE ai.organization_id = :organization_id
              {user_filter_insights}
            GROUP BY ai.sentiment
            ORDER BY count DESC
        """),
        params,
    )

    sentiment = [
        {
            "sentiment": row["sentiment"],
            "count": row["count"],
        }
        for row in sentiment_result.mappings().all()
    ]

    # -----------------------------------------
    # LEAD PIPELINE DISTRIBUTION
    # -----------------------------------------

    pipeline_result = db.execute(
        text(f"""
            SELECT
                l.stage,
                COUNT(*) AS count,
                COALESCE(SUM(l.value), 0) AS value
            FROM leads l
            WHERE l.organization_id = :organization_id
              {user_filter_leads}
            GROUP BY l.stage
            ORDER BY
                CASE l.stage
                    WHEN 'NEW' THEN 1
                    WHEN 'QUALIFIED' THEN 2
                    WHEN 'PROPOSAL' THEN 3
                    WHEN 'NEGOTIATION' THEN 4
                    WHEN 'WON' THEN 5
                    WHEN 'LOST' THEN 6
                    ELSE 7
                END
        """),
        params,
    )

    pipeline = [
        {
            "stage": row["stage"],
            "count": row["count"],
            "value": float(row["value"] or 0),
        }
        for row in pipeline_result.mappings().all()
    ]

    # -----------------------------------------
    # RECENT VISITS
    # -----------------------------------------

    recent_visits_result = db.execute(
        text(f"""
            SELECT
                v.id,
                v.visit_date,
                v.status,
                v.visit_type,
                c.name AS customer_name,
                u.full_name AS rep_name,
                ai.sentiment,
                ai.opportunity_level,
                ai.risk_level
            FROM visits v
            JOIN customers c
                ON c.id = v.customer_id
            JOIN users u
                ON u.id = v.user_id
            LEFT JOIN LATERAL (
                SELECT
                    sentiment,
                    opportunity_level,
                    risk_level
                FROM ai_insights ai
                WHERE ai.visit_id = v.id
                  AND ai.organization_id = v.organization_id
                ORDER BY ai.created_at DESC
                LIMIT 1
            ) ai ON TRUE
            WHERE v.organization_id = :organization_id
            {user_filter_visits}
            ORDER BY v.visit_date DESC
            LIMIT 10
        """),
        params,
    )

    recent_visits = [
        dict(row)
        for row in recent_visits_result.mappings().all()
    ]

    # -----------------------------------------
    # FINAL RESPONSE
    # -----------------------------------------

    return {
        "status": "success",
        "role": role,
        "overview": {
            "total_visits": visit_count,
            "total_customers": customer_count,
            "pending_action_items": action_count,
            "open_alerts": open_alert_count,
            "total_leads": lead_count,
            "pipeline_value": float(pipeline_value or 0),
            "won_value": float(won_value or 0),
            "high_opportunities": high_opportunity_count,
            "high_risks": high_risk_count,
        },
        "sentiment": sentiment,
        "pipeline": pipeline,
        "recent_visits": recent_visits,
    }