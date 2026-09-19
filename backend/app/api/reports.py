from sqlalchemy import text
from sqlalchemy.orm import Session

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.database import get_db
from app.core.dependencies import get_current_user


router = APIRouter(
    prefix="/reports",
    tags=["Reports"],
)


class ReportEditRequest(BaseModel):
    edited_report: str


def get_report_access(
    report_id: str,
    db: Session,
    current_user: dict,
):
    organization_id = current_user["organization_id"]
    user_id = current_user["id"]
    role = current_user["role"]

    query = """
        SELECT
            r.id,
            r.organization_id,
            r.visit_id,
            r.voice_note_id,
            r.created_by,
            r.title,
            r.ai_draft,
            r.edited_report,
            r.final_report,
            r.status,
            r.submitted_at,
            r.approved_at,
            r.approved_by,
            r.created_at,
            r.updated_at,
            c.name AS customer_name,
            u.full_name AS created_by_name
        FROM reports r
        JOIN visits v
            ON v.id = r.visit_id
        JOIN customers c
            ON c.id = v.customer_id
        JOIN users u
            ON u.id = r.created_by
        WHERE r.id = :report_id
          AND r.organization_id = :organization_id
    """

    params = {
        "report_id": report_id,
        "organization_id": organization_id,
    }

    if role == "FIELD_REP":
        query += """
            AND r.created_by = :user_id
        """
        params["user_id"] = user_id

    query += """
        LIMIT 1
    """

    result = db.execute(
        text(query),
        params,
    )

    return result.mappings().first()


# =========================================================
# CREATE AI DRAFT REPORT
# =========================================================

@router.post("/draft")
def create_report_draft(
    visit_id: str,
    voice_note_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    organization_id = current_user["organization_id"]
    user_id = current_user["id"]
    role = current_user["role"]

    # Verify visit
    visit = db.execute(
        text("""
            SELECT
                v.id,
                v.user_id,
                v.customer_id,
                c.name AS customer_name
            FROM visits v
            JOIN customers c
                ON c.id = v.customer_id
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
            status_code=404,
            detail="Visit not found in your organization.",
        )

    # FIELD_REP can create reports only for their own visits
    if (
        role == "FIELD_REP"
        and str(visit["user_id"]) != str(user_id)
    ):
        raise HTTPException(
            status_code=403,
            detail="You can only create reports for your own visits.",
        )

    # Find voice note
    if voice_note_id:
        voice_note = db.execute(
            text("""
                SELECT
                    id,
                    transcription
                FROM voice_notes
                WHERE id = :voice_note_id
                  AND visit_id = :visit_id
                  AND organization_id = :organization_id
                LIMIT 1
            """),
            {
                "voice_note_id": voice_note_id,
                "visit_id": visit_id,
                "organization_id": organization_id,
            },
        ).mappings().first()
    else:
        voice_note = db.execute(
            text("""
                SELECT
                    id,
                    transcription
                FROM voice_notes
                WHERE visit_id = :visit_id
                  AND organization_id = :organization_id
                  AND transcription IS NOT NULL
                ORDER BY recorded_at DESC
                LIMIT 1
            """),
            {
                "visit_id": visit_id,
                "organization_id": organization_id,
            },
        ).mappings().first()

    if not voice_note:
        raise HTTPException(
            status_code=404,
            detail="No transcribed voice note found for this visit.",
        )

    # Find latest AI insight
    insight = db.execute(
        text("""
            SELECT
                id,
                summary,
                sentiment,
                key_insights,
                opportunity_level,
                risk_level
            FROM ai_insights
            WHERE visit_id = :visit_id
              AND organization_id = :organization_id
            ORDER BY created_at DESC
            LIMIT 1
        """),
        {
            "visit_id": visit_id,
            "organization_id": organization_id,
        },
    ).mappings().first()

    if not insight:
        raise HTTPException(
            status_code=404,
            detail="No AI insight found for this visit.",
        )

    # Get action items
    action_result = db.execute(
        text("""
            SELECT
                title,
                priority,
                status
            FROM action_items
            WHERE visit_id = :visit_id
              AND organization_id = :organization_id
            ORDER BY created_at ASC
        """),
        {
            "visit_id": visit_id,
            "organization_id": organization_id,
        },
    )

    action_items = action_result.mappings().all()

    # Build report draft
    key_insights = insight["key_insights"] or []

    draft_lines = [
        f"Customer: {visit['customer_name']}",
        "",
        "Visit Summary:",
        insight["summary"] or "No summary available.",
        "",
        f"Customer Sentiment: {insight['sentiment'] or 'N/A'}",
        f"Opportunity Level: {insight['opportunity_level'] or 'N/A'}",
        f"Risk Level: {insight['risk_level'] or 'N/A'}",
        "",
        "Key Insights:",
    ]

    if key_insights:
        for item in key_insights:
            draft_lines.append(f"- {item}")
    else:
        draft_lines.append("- No key insights identified.")

    draft_lines.extend([
        "",
        "Action Items:",
    ])

    if action_items:
        for item in action_items:
            draft_lines.append(
                f"- {item['title']} "
                f"(Priority: {item['priority']}, Status: {item['status']})"
            )
    else:
        draft_lines.append("- No action items identified.")

    draft_lines.extend([
        "",
        "Original Field Voice Note:",
        voice_note["transcription"] or "No transcription available.",
    ])

    ai_draft = "\n".join(draft_lines)

    # Insert report
    result = db.execute(
        text("""
            INSERT INTO reports (
                organization_id,
                visit_id,
                voice_note_id,
                created_by,
                title,
                ai_draft,
                status
            )
            VALUES (
                :organization_id,
                :visit_id,
                :voice_note_id,
                :created_by,
                'Field Visit Report',
                :ai_draft,
                'DRAFT'
            )
            RETURNING
                id,
                organization_id,
                visit_id,
                voice_note_id,
                created_by,
                title,
                ai_draft,
                edited_report,
                final_report,
                status,
                submitted_at,
                approved_at,
                approved_by,
                created_at,
                updated_at
        """),
        {
            "organization_id": organization_id,
            "visit_id": visit_id,
            "voice_note_id": voice_note["id"],
            "created_by": user_id,
            "ai_draft": ai_draft,
        },
    )

    report = result.mappings().first()

    db.commit()

    return {
        "status": "success",
        "message": "AI draft report created successfully.",
        "report": dict(report),
    }


# =========================================================
# GET REPORTS
# =========================================================

@router.get("/")
def get_reports(
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    organization_id = current_user["organization_id"]
    user_id = current_user["id"]
    role = current_user["role"]

    query = """
        SELECT
            r.id,
            r.organization_id,
            r.visit_id,
            r.voice_note_id,
            r.created_by,
            r.title,
            r.ai_draft,
            r.edited_report,
            r.final_report,
            r.status,
            r.submitted_at,
            r.approved_at,
            r.approved_by,
            r.created_at,
            r.updated_at,
            c.name AS customer_name,
            u.full_name AS created_by_name
        FROM reports r
        JOIN visits v
            ON v.id = r.visit_id
        JOIN customers c
            ON c.id = v.customer_id
        JOIN users u
            ON u.id = r.created_by
        WHERE r.organization_id = :organization_id
    """

    params = {
        "organization_id": organization_id,
    }

    if role == "FIELD_REP":
        query += """
            AND r.created_by = :user_id
        """
        params["user_id"] = user_id

    if status:
        query += """
            AND r.status = :status
        """
        params["status"] = status

    query += """
        ORDER BY r.created_at DESC
    """

    result = db.execute(
        text(query),
        params,
    )

    reports = [
        dict(row)
        for row in result.mappings().all()
    ]

    return {
        "status": "success",
        "count": len(reports),
        "reports": reports,
    }


# =========================================================
# GET SINGLE REPORT
# =========================================================

@router.get("/{report_id}")
def get_report(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    report = get_report_access(
        report_id,
        db,
        current_user,
    )

    if not report:
        raise HTTPException(
            status_code=404,
            detail="Report not found or access denied.",
        )

    return {
        "status": "success",
        "report": dict(report),
    }


# =========================================================
# EDIT REPORT
# =========================================================

@router.patch("/{report_id}/edit")
def edit_report(
    report_id: str,
    payload: ReportEditRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    report = get_report_access(
        report_id,
        db,
        current_user,
    )

    if not report:
        raise HTTPException(
            status_code=404,
            detail="Report not found or access denied.",
        )

    if report["status"] in {
        "SUBMITTED",
        "APPROVED",
    }:
        raise HTTPException(
            status_code=400,
            detail="This report can no longer be edited.",
        )

    if not payload.edited_report.strip():
        raise HTTPException(
            status_code=400,
            detail="Edited report cannot be empty.",
        )

    db.execute(
        text("""
            UPDATE reports
            SET
                edited_report = :edited_report,
                status = 'EDITED',
                updated_at = now()
            WHERE id = :report_id
              AND organization_id = :organization_id
        """),
        {
            "edited_report": payload.edited_report,
            "report_id": report_id,
            "organization_id": current_user["organization_id"],
        },
    )

    db.commit()

    updated_report = get_report_access(
        report_id,
        db,
        current_user,
    )

    return {
        "status": "success",
        "message": "Report edited successfully.",
        "report": dict(updated_report),
    }


# =========================================================
# SUBMIT REPORT
# =========================================================

@router.post("/{report_id}/submit")
def submit_report(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    report = get_report_access(
        report_id,
        db,
        current_user,
    )

    if not report:
        raise HTTPException(
            status_code=404,
            detail="Report not found or access denied.",
        )

    if report["status"] not in {
        "DRAFT",
        "EDITED",
    }:
        raise HTTPException(
            status_code=400,
            detail="Only DRAFT or EDITED reports can be submitted.",
        )

    final_report = (
        report["edited_report"]
        if report["edited_report"]
        else report["ai_draft"]
    )

    db.execute(
        text("""
            UPDATE reports
            SET
                final_report = :final_report,
                status = 'SUBMITTED',
                submitted_at = now(),
                updated_at = now()
            WHERE id = :report_id
              AND organization_id = :organization_id
        """),
        {
            "final_report": final_report,
            "report_id": report_id,
            "organization_id": current_user["organization_id"],
        },
    )

    db.commit()

    updated_report = get_report_access(
        report_id,
        db,
        current_user,
    )

    return {
        "status": "success",
        "message": "Report submitted successfully.",
        "report": dict(updated_report),
    }


# =========================================================
# APPROVE REPORT
# =========================================================

@router.post("/{report_id}/approve")
def approve_report(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    role = current_user["role"]

    if role not in {
        "MANAGER",
        "EXECUTIVE",
    }:
        raise HTTPException(
            status_code=403,
            detail="Only MANAGER or EXECUTIVE can approve reports.",
        )

    report = get_report_access(
        report_id,
        db,
        current_user,
    )

    if not report:
        raise HTTPException(
            status_code=404,
            detail="Report not found or access denied.",
        )

    if report["status"] != "SUBMITTED":
        raise HTTPException(
            status_code=400,
            detail="Only SUBMITTED reports can be approved.",
        )

    db.execute(
        text("""
            UPDATE reports
            SET
                status = 'APPROVED',
                approved_by = :approved_by,
                approved_at = now(),
                updated_at = now()
            WHERE id = :report_id
              AND organization_id = :organization_id
        """),
        {
            "approved_by": current_user["id"],
            "report_id": report_id,
            "organization_id": current_user["organization_id"],
        },
    )

    db.commit()

    updated_report = get_report_access(
        report_id,
        db,
        current_user,
    )

    return {
        "status": "success",
        "message": "Report approved successfully.",
        "report": dict(updated_report),
    }


# =========================================================
# REJECT REPORT
# =========================================================

@router.post("/{report_id}/reject")
def reject_report(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    role = current_user["role"]

    if role not in {
        "MANAGER",
        "EXECUTIVE",
    }:
        raise HTTPException(
            status_code=403,
            detail="Only MANAGER or EXECUTIVE can reject reports.",
        )

    report = get_report_access(
        report_id,
        db,
        current_user,
    )

    if not report:
        raise HTTPException(
            status_code=404,
            detail="Report not found or access denied.",
        )

    if report["status"] != "SUBMITTED":
        raise HTTPException(
            status_code=400,
            detail="Only SUBMITTED reports can be rejected.",
        )

    db.execute(
        text("""
            UPDATE reports
            SET
                status = 'REJECTED',
                updated_at = now()
            WHERE id = :report_id
              AND organization_id = :organization_id
        """),
        {
            "report_id": report_id,
            "organization_id": current_user["organization_id"],
        },
    )

    db.commit()

    updated_report = get_report_access(
        report_id,
        db,
        current_user,
    )

    return {
        "status": "success",
        "message": "Report rejected successfully.",
        "report": dict(updated_report),
    }