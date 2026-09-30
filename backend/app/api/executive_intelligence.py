from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import require_role


router = APIRouter(
    prefix="/executive",
    tags=["Executive Intelligence"],
)


def _rows(result):
    return [dict(row) for row in result.mappings().all()]


@router.get("/intelligence")
def get_executive_intelligence(
    days: int = Query(
        default=7,
        ge=1,
        le=90,
        description="Look-back window for recent field activity and reporting.",
    ),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("EXECUTIVE")),
):
    """
    Server-side organization intelligence for Executive users.

    All queries are scoped to the authenticated user's organization.
    Field activity, AI signals, and field reports are attributed to FIELD_REP
    users so executive/admin activity does not appear as field execution.
    """
    organization_id = current_user["organization_id"]
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    params = {
        "organization_id": organization_id,
        "cutoff": cutoff,
    }

    people = db.execute(
        text("""
            SELECT
                COUNT(*) AS total_people,
                COUNT(*) FILTER (
                    WHERE role = 'MANAGER' AND is_active = true
                ) AS active_managers,
                COUNT(*) FILTER (
                    WHERE role = 'FIELD_REP' AND is_active = true
                ) AS active_reps,
                COUNT(*) FILTER (
                    WHERE role = 'FIELD_REP' AND manager_id IS NULL
                ) AS unassigned_reps
            FROM users
            WHERE organization_id = :organization_id
        """),
        params,
    ).mappings().one()

    field_activity = db.execute(
        text("""
            SELECT
                COUNT(*) AS visits_lookback,
                COUNT(DISTINCT v.user_id) AS active_reps_in_field,
                COUNT(DISTINCT v.customer_id) AS customers_visited
            FROM visits v
            JOIN users u
              ON u.id = v.user_id
             AND u.organization_id = v.organization_id
            WHERE v.organization_id = :organization_id
              AND u.role = 'FIELD_REP'
              AND v.visit_date >= :cutoff
        """),
        params,
    ).mappings().one()

    report_activity = db.execute(
        text("""
            SELECT
                COUNT(*) AS reports_created,
                COUNT(*) FILTER (WHERE r.status = 'SUBMITTED') AS submitted,
                COUNT(*) FILTER (WHERE r.status = 'APPROVED') AS approved,
                COUNT(*) FILTER (WHERE r.status = 'REJECTED') AS rejected
            FROM reports r
            JOIN users u
              ON u.id = r.created_by
             AND u.organization_id = r.organization_id
            WHERE r.organization_id = :organization_id
              AND u.role = 'FIELD_REP'
              AND r.created_at >= :cutoff
        """),
        params,
    ).mappings().one()

    report_flow = db.execute(
        text("""
            SELECT
                COUNT(*) FILTER (
                    WHERE status IN ('DRAFT', 'EDITED')
                ) AS draft_or_other,
                COUNT(*) FILTER (
                    WHERE status = 'SUBMITTED'
                ) AS submitted,
                COUNT(*) FILTER (
                    WHERE status = 'APPROVED'
                ) AS approved,
                COUNT(*) FILTER (
                    WHERE status = 'REJECTED'
                ) AS rejected
            FROM reports
            WHERE organization_id = :organization_id
        """),
        params,
    ).mappings().one()

    workload = db.execute(
        text("""
            SELECT
                COUNT(*) FILTER (WHERE status = 'OPEN') AS open_alerts
            FROM alerts
            WHERE organization_id = :organization_id
        """),
        params,
    ).mappings().one()

    followups = db.execute(
        text("""
            SELECT
                COUNT(*) FILTER (
                    WHERE status IN ('PENDING', 'IN_PROGRESS')
                ) AS pending_followups
            FROM action_items
            WHERE organization_id = :organization_id
        """),
        params,
    ).mappings().one()

    signals = db.execute(
        text("""
            SELECT
                COUNT(*) FILTER (
                    WHERE ai.opportunity_level = 'HIGH'
                ) AS high_opportunities,
                COUNT(*) FILTER (
                    WHERE ai.risk_level = 'HIGH'
                ) AS high_risks
            FROM ai_insights ai
            JOIN visits v
              ON v.id = ai.visit_id
             AND v.organization_id = ai.organization_id
            JOIN users u
              ON u.id = v.user_id
             AND u.organization_id = v.organization_id
            WHERE ai.organization_id = :organization_id
              AND u.role = 'FIELD_REP'
        """),
        params,
    ).mappings().one()

    sentiment = _rows(
        db.execute(
            text("""
                SELECT
                    COALESCE(NULLIF(ai.sentiment, ''), 'UNKNOWN') AS sentiment,
                    COUNT(*) AS count
                FROM ai_insights ai
                JOIN visits v
                  ON v.id = ai.visit_id
                 AND v.organization_id = ai.organization_id
                JOIN users u
                  ON u.id = v.user_id
                 AND u.organization_id = v.organization_id
                WHERE ai.organization_id = :organization_id
                  AND u.role = 'FIELD_REP'
                GROUP BY COALESCE(NULLIF(ai.sentiment, ''), 'UNKNOWN')
                ORDER BY count DESC, sentiment ASC
            """),
            params,
        )
    )

    leads = db.execute(
        text("""
            SELECT
                COUNT(*) AS total_leads,
                COUNT(*) FILTER (
                    WHERE stage NOT IN ('WON', 'LOST')
                ) AS open_leads,
                COALESCE(
                    SUM(value) FILTER (
                        WHERE stage NOT IN ('WON', 'LOST')
                    ),
                    0
                ) AS open_pipeline_value
            FROM leads
            WHERE organization_id = :organization_id
        """),
        params,
    ).mappings().one()

    management = _rows(
        db.execute(
            text("""
                SELECT
                    manager.id AS manager_id,
                    manager.full_name AS manager_name,
                    COUNT(rep.id) FILTER (
                        WHERE rep.role = 'FIELD_REP'
                          AND rep.is_active = true
                    ) AS assigned_reps,
                    COUNT(DISTINCT rep.id) FILTER (
                        WHERE rep.role = 'FIELD_REP'
                          AND rep.is_active = true
                          AND EXISTS (
                              SELECT 1
                              FROM visits v
                              WHERE v.user_id = rep.id
                                AND v.organization_id = :organization_id
                                AND v.visit_date >= :cutoff
                          )
                    ) AS reps_active_in_field
                FROM users manager
                LEFT JOIN users rep
                  ON rep.manager_id = manager.id
                 AND rep.organization_id = manager.organization_id
                WHERE manager.organization_id = :organization_id
                  AND manager.role = 'MANAGER'
                GROUP BY manager.id, manager.full_name
                ORDER BY manager.full_name ASC
            """),
            params,
        )
    )

    for manager in management:
        manager_id = str(manager["manager_id"])
        manager_metrics = db.execute(
            text("""
                SELECT
                    (
                        SELECT COUNT(*)
                        FROM visits v
                        JOIN users rep
                          ON rep.id = v.user_id
                        WHERE v.organization_id = :organization_id
                          AND rep.organization_id = :organization_id
                          AND rep.role = 'FIELD_REP'
                          AND rep.manager_id = :manager_id
                          AND v.visit_date >= :cutoff
                    ) AS visits_lookback,
                    (
                        SELECT COUNT(*)
                        FROM reports r
                        JOIN users rep
                          ON rep.id = r.created_by
                        WHERE r.organization_id = :organization_id
                          AND rep.organization_id = :organization_id
                          AND rep.role = 'FIELD_REP'
                          AND rep.manager_id = :manager_id
                          AND r.created_at >= :cutoff
                    ) AS reports_lookback,
                    (
                        SELECT COUNT(*)
                        FROM action_items ai
                        JOIN users rep
                          ON rep.id = ai.assigned_to
                        WHERE ai.organization_id = :organization_id
                          AND rep.organization_id = :organization_id
                          AND rep.role = 'FIELD_REP'
                          AND rep.manager_id = :manager_id
                          AND ai.status IN ('PENDING', 'IN_PROGRESS')
                    ) AS pending_followups
            """),
            {
                "organization_id": organization_id,
                "manager_id": manager_id,
                "cutoff": cutoff,
            },
        ).mappings().one()
        manager.update(dict(manager_metrics))

    field_signal_watch = _rows(
        db.execute(
            text("""
                SELECT
                    rep.id AS rep_id,
                    rep.full_name AS rep_name,
                    rep.manager_id,
                    manager.full_name AS manager_name,
                    latest.summary,
                    latest.sentiment,
                    latest.opportunity_level,
                    latest.risk_level,
                    latest.created_at
                FROM users rep
                LEFT JOIN users manager
                  ON manager.id = rep.manager_id
                 AND manager.organization_id = rep.organization_id
                LEFT JOIN LATERAL (
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
                      AND v.user_id = rep.id
                    ORDER BY ai.created_at DESC
                    LIMIT 1
                ) latest ON TRUE
                WHERE rep.organization_id = :organization_id
                  AND rep.role = 'FIELD_REP'
                ORDER BY
                    CASE WHEN latest.created_at IS NULL THEN 1 ELSE 0 END,
                    latest.created_at DESC,
                    rep.full_name ASC
            """),
            params,
        )
    )

    recent_field_activity = _rows(
        db.execute(
            text("""
                SELECT
                    v.id,
                    v.visit_date,
                    v.status,
                    v.visit_type,
                    v.customer_id,
                    c.name AS customer_name,
                    v.user_id,
                    u.full_name AS rep_name,
                    u.manager_id,
                    manager.full_name AS manager_name,
                    ai.sentiment,
                    ai.opportunity_level,
                    ai.risk_level
                FROM visits v
                JOIN customers c
                  ON c.id = v.customer_id
                JOIN users u
                  ON u.id = v.user_id
                 AND u.organization_id = v.organization_id
                LEFT JOIN users manager
                  ON manager.id = u.manager_id
                 AND manager.organization_id = u.organization_id
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
                  AND u.role = 'FIELD_REP'
                ORDER BY v.visit_date DESC
                LIMIT 10
            """),
            params,
        )
    )

    attention_alerts = _rows(
        db.execute(
            text("""
                SELECT
                    a.id,
                    a.title,
                    a.message,
                    a.severity,
                    a.status,
                    a.customer_id,
                    c.name AS customer_name,
                    a.assigned_to,
                    assigned.full_name AS assigned_user_name,
                    a.created_at,
                    a.visit_id
                FROM alerts a
                LEFT JOIN customers c
                  ON c.id = a.customer_id
                LEFT JOIN users assigned
                  ON assigned.id = a.assigned_to
                 AND assigned.organization_id = a.organization_id
                WHERE a.organization_id = :organization_id
                  AND a.status = 'OPEN'
                ORDER BY
                    CASE UPPER(a.severity)
                        WHEN 'CRITICAL' THEN 1
                        WHEN 'HIGH' THEN 1
                        WHEN 'MEDIUM' THEN 2
                        ELSE 3
                    END,
                    a.created_at DESC
                LIMIT 10
            """),
            params,
        )
    )

    attention_actions = _rows(
        db.execute(
            text("""
                SELECT
                    ai.id,
                    ai.title,
                    ai.description,
                    ai.priority,
                    ai.status,
                    ai.due_date,
                    ai.customer_id,
                    c.name AS customer_name,
                    ai.assigned_to,
                    assigned.full_name AS assigned_user_name,
                    ai.created_at,
                    ai.visit_id
                FROM action_items ai
                LEFT JOIN customers c
                  ON c.id = ai.customer_id
                LEFT JOIN users assigned
                  ON assigned.id = ai.assigned_to
                 AND assigned.organization_id = ai.organization_id
                WHERE ai.organization_id = :organization_id
                  AND ai.status IN ('PENDING', 'IN_PROGRESS')
                ORDER BY
                    CASE UPPER(ai.priority)
                        WHEN 'CRITICAL' THEN 1
                        WHEN 'HIGH' THEN 1
                        WHEN 'MEDIUM' THEN 2
                        ELSE 3
                    END,
                    ai.due_date ASC NULLS LAST,
                    ai.created_at DESC
                LIMIT 10
            """),
            params,
        )
    )

    return {
        "status": "success",
        "role": "EXECUTIVE",
        "organization_id": str(organization_id),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "lookback_days": days,
        "overview": {
            "total_people": int(people["total_people"] or 0),
            "active_managers": int(people["active_managers"] or 0),
            "active_reps": int(people["active_reps"] or 0),
            "unassigned_reps": int(people["unassigned_reps"] or 0),
            "visits_lookback": int(field_activity["visits_lookback"] or 0),
            "active_reps_in_field": int(field_activity["active_reps_in_field"] or 0),
            "customers_visited": int(field_activity["customers_visited"] or 0),
            "reports_lookback": int(report_activity["reports_created"] or 0),
        },
        "report_flow_lookback": {
            "submitted": int(report_activity["submitted"] or 0),
            "approved": int(report_activity["approved"] or 0),
            "rejected": int(report_activity["rejected"] or 0),
        },
        "report_flow": {
            "draft_or_other": int(report_flow["draft_or_other"] or 0),
            "submitted": int(report_flow["submitted"] or 0),
            "approved": int(report_flow["approved"] or 0),
            "rejected": int(report_flow["rejected"] or 0),
        },
        "attention": {
            "open_alerts": int(workload["open_alerts"] or 0),
            "pending_followups": int(followups["pending_followups"] or 0),
        },
        "signals": {
            "high_opportunities": int(signals["high_opportunities"] or 0),
            "high_risks": int(signals["high_risks"] or 0),
            "total_leads": int(leads["total_leads"] or 0),
            "open_leads": int(leads["open_leads"] or 0),
            "open_pipeline_value": float(leads["open_pipeline_value"] or 0),
            "sentiment": sentiment,
        },
        "management_coverage": management,
        "field_signal_watch": field_signal_watch,
        "recent_field_activity": recent_field_activity,
        "attention_queue": {
            "alerts": attention_alerts,
            "action_items": attention_actions,
        },
    }
