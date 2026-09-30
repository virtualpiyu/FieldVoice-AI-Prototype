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


# =========================================================
# REQUEST MODELS
# =========================================================

class ReportEditRequest(BaseModel):
    edited_report: str


class ReportRejectRequest(BaseModel):
    rejection_reason: str


# =========================================================
# SHARED HELPERS
# =========================================================

def normalized_role(current_user: dict) -> str:
    """Return the authenticated role in a predictable uppercase form."""
    return str(current_user.get("role") or "").strip().upper()


def get_report_access(
    report_id: str,
    db: Session,
    current_user: dict,
):
    """
    Fetch one report only when it belongs to the authenticated user's
    organization.

    FIELD_REP / SALESPERSON:
        Can only access reports they created.

    MANAGER / EXECUTIVE:
        Can access reports across their organization.

    Approval/rejection actor names are returned through LEFT JOINs so
    old reports with NULL approval/rejection metadata remain readable.
    """
    organization_id = current_user["organization_id"]
    user_id = current_user["id"]
    role = normalized_role(current_user)

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
            approved_user.full_name AS approved_by_name,
            r.rejected_at,
            r.rejected_by,
            rejected_user.full_name AS rejected_by_name,
            r.rejection_reason,
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
        LEFT JOIN users approved_user
            ON approved_user.id = r.approved_by
        LEFT JOIN users rejected_user
            ON rejected_user.id = r.rejected_by
        WHERE r.id = :report_id
          AND r.organization_id = :organization_id
    """

    params = {
        "report_id": report_id,
        "organization_id": organization_id,
    }

    if role in {"FIELD_REP", "SALESPERSON"}:
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


def require_manager(current_user: dict) -> None:
    """Approval workflow is intentionally Manager-only."""
    role = normalized_role(current_user)

    if role != "MANAGER":
        raise HTTPException(
            status_code=403,
            detail="Only MANAGER users can approve or reject reports.",
        )


def require_field_rep(current_user: dict) -> None:
    """Editing/resubmission is intentionally Field-Rep-only."""
    role = normalized_role(current_user)

    if role not in {"FIELD_REP", "SALESPERSON"}:
        raise HTTPException(
            status_code=403,
            detail="Only FIELD_REP users can edit or resubmit reports.",
        )


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
    role = normalized_role(current_user)

    # Verify visit.
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

    # FIELD_REP / SALESPERSON can create reports only for their own visits.
    if (
        role in {"FIELD_REP", "SALESPERSON"}
        and str(visit["user_id"]) != str(user_id)
    ):
        raise HTTPException(
            status_code=403,
            detail="You can only create reports for your own visits.",
        )

    # Find requested voice note, or the latest transcribed note for the visit.
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

    # Find latest AI insight.
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

    # Get action items.
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

    # Build report draft.
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

    # Insert report.
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

    # Return a complete API shape where possible.
    created_report = get_report_access(
        str(report["id"]),
        db,
        current_user,
    )

    return {
        "status": "success",
        "message": "AI draft report created successfully.",
        "report": dict(created_report or report),
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
    role = normalized_role(current_user)

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
            approved_user.full_name AS approved_by_name,
            r.rejected_at,
            r.rejected_by,
            rejected_user.full_name AS rejected_by_name,
            r.rejection_reason,
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
        LEFT JOIN users approved_user
            ON approved_user.id = r.approved_by
        LEFT JOIN users rejected_user
            ON rejected_user.id = r.rejected_by
        WHERE r.organization_id = :organization_id
    """

    params = {
        "organization_id": organization_id,
    }

    if role in {"FIELD_REP", "SALESPERSON"}:
        query += """
            AND r.created_by = :user_id
        """
        params["user_id"] = user_id

    if status:
        normalized_status = status.strip().upper()

        allowed_statuses = {
            "DRAFT",
            "EDITED",
            "SUBMITTED",
            "APPROVED",
            "REJECTED",
        }

        if normalized_status not in allowed_statuses:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Invalid report status. Allowed values: "
                    "DRAFT, EDITED, SUBMITTED, APPROVED, REJECTED."
                ),
            )

        query += """
            AND r.status = :status
        """
        params["status"] = normalized_status

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
    require_field_rep(current_user)

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

    if not payload.edited_report.strip():
        raise HTTPException(
            status_code=400,
            detail="Edited report cannot be empty.",
        )

    current_status = str(report["status"] or "").upper()

    # A Field Rep may edit only their own DRAFT / EDITED / REJECTED report.
    if current_status not in {"DRAFT", "EDITED", "REJECTED"}:
        raise HTTPException(
            status_code=400,
            detail=(
                "Only DRAFT, EDITED, or REJECTED reports can be edited. "
                "Submitted and approved reports are locked."
            ),
        )

    db.execute(
        text("""
            UPDATE reports
            SET
                edited_report = :edited_report,
                status = 'EDITED',
                approved_by = NULL,
                approved_at = NULL,
                rejected_by = NULL,
                rejected_at = NULL,
                rejection_reason = NULL,
                updated_at = now()
            WHERE id = :report_id
              AND organization_id = :organization_id
              AND created_by = :created_by
              AND status IN ('DRAFT', 'EDITED', 'REJECTED')
        """),
        {
            "edited_report": payload.edited_report.strip(),
            "report_id": report_id,
            "organization_id": current_user["organization_id"],
            "created_by": current_user["id"],
        },
    )

    db.commit()

    updated_report = get_report_access(
        report_id,
        db,
        current_user,
    )

    if not updated_report:
        raise HTTPException(
            status_code=404,
            detail="Report could not be retrieved after editing.",
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
    require_field_rep(current_user)

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

    current_status = str(report["status"] or "").upper()

    if current_status not in {
        "DRAFT",
        "EDITED",
    }:
        raise HTTPException(
            status_code=400,
            detail="Only DRAFT or EDITED reports can be submitted.",
        )

    final_report = (
        str(report["edited_report"]).strip()
        if report["edited_report"]
        and str(report["edited_report"]).strip()
        else str(report["ai_draft"] or "").strip()
    )

    if not final_report:
        raise HTTPException(
            status_code=400,
            detail="Report content is empty and cannot be submitted.",
        )

    report_visit_id = str(report["visit_id"])

    update_result = db.execute(
        text("""
            UPDATE reports
            SET
                final_report = :final_report,
                status = 'SUBMITTED',
                submitted_at = now(),
                approved_by = NULL,
                approved_at = NULL,
                rejected_by = NULL,
                rejected_at = NULL,
                rejection_reason = NULL,
                updated_at = now()
            WHERE id = :report_id
              AND organization_id = :organization_id
              AND created_by = :created_by
              AND status IN ('DRAFT', 'EDITED')
        """),
        {
            "final_report": final_report,
            "report_id": report_id,
            "organization_id": current_user["organization_id"],
            "created_by": current_user["id"],
        },
    )

    if update_result.rowcount != 1:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="The report changed before it could be submitted. Please refresh and try again.",
        )

    # A successful Field Rep report submission completes the associated visit
    # in the same transaction as the report status change.
    visit_update = db.execute(
        text("""
            UPDATE visits
            SET
                status = 'COMPLETED',
                updated_at = now()
            WHERE id = :visit_id
              AND organization_id = :organization_id
              AND user_id = :created_by
        """),
        {
            "visit_id": report_visit_id,
            "organization_id": current_user["organization_id"],
            "created_by": current_user["id"],
        },
    )

    if visit_update.rowcount != 1:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="The report could not complete its associated visit. Please refresh and retry.",
        )

    db.commit()

    updated_report = get_report_access(
        report_id,
        db,
        current_user,
    )

    if not updated_report:
        raise HTTPException(
            status_code=404,
            detail="Report could not be retrieved after submission.",
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
    require_manager(current_user)

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

    if str(report["status"] or "").upper() != "SUBMITTED":
        raise HTTPException(
            status_code=400,
            detail="Only SUBMITTED reports can be approved.",
        )

    # Prevent a manager from approving their own report.
    if str(report["created_by"]) == str(current_user["id"]):
        raise HTTPException(
            status_code=403,
            detail="You cannot approve a report created by your own account.",
        )

    update_result = db.execute(
        text("""
            UPDATE reports
            SET
                status = 'APPROVED',
                approved_by = :approved_by,
                approved_at = now(),
                rejected_by = NULL,
                rejected_at = NULL,
                rejection_reason = NULL,
                updated_at = now()
            WHERE id = :report_id
              AND organization_id = :organization_id
              AND status = 'SUBMITTED'
              AND created_by <> :approved_by
        """),
        {
            "approved_by": current_user["id"],
            "report_id": report_id,
            "organization_id": current_user["organization_id"],
        },
    )

    if update_result.rowcount != 1:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="The report was already changed. Refresh the report and try again.",
        )

    db.commit()

    updated_report = get_report_access(
        report_id,
        db,
        current_user,
    )

    if not updated_report:
        raise HTTPException(
            status_code=404,
            detail="Report could not be retrieved after approval.",
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
    payload: ReportRejectRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    require_manager(current_user)

    reason = payload.rejection_reason.strip()

    if not reason:
        raise HTTPException(
            status_code=400,
            detail="Rejection reason is required.",
        )

    if len(reason) > 2000:
        raise HTTPException(
            status_code=400,
            detail="Rejection reason cannot exceed 2000 characters.",
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

    if str(report["status"] or "").upper() != "SUBMITTED":
        raise HTTPException(
            status_code=400,
            detail="Only SUBMITTED reports can be rejected.",
        )

    # Prevent a manager from rejecting their own report.
    if str(report["created_by"]) == str(current_user["id"]):
        raise HTTPException(
            status_code=403,
            detail="You cannot reject a report created by your own account.",
        )

    update_result = db.execute(
        text("""
            UPDATE reports
            SET
                status = 'REJECTED',
                rejected_by = :rejected_by,
                rejected_at = now(),
                rejection_reason = :rejection_reason,
                approved_by = NULL,
                approved_at = NULL,
                updated_at = now()
            WHERE id = :report_id
              AND organization_id = :organization_id
              AND status = 'SUBMITTED'
              AND created_by <> :rejected_by
        """),
        {
            "rejected_by": current_user["id"],
            "rejection_reason": reason,
            "report_id": report_id,
            "organization_id": current_user["organization_id"],
        },
    )

    if update_result.rowcount != 1:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="The report was already changed. Refresh the report and try again.",
        )

    db.commit()

    updated_report = get_report_access(
        report_id,
        db,
        current_user,
    )

    if not updated_report:
        raise HTTPException(
            status_code=404,
            detail="Report could not be retrieved after rejection.",
        )

    return {
        "status": "success",
        "message": "Report rejected successfully.",
        "report": dict(updated_report),
    }
