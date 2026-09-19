from sqlalchemy import text
from sqlalchemy.orm import Session
import os
import uuid
import json
import time

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form

from app.database import get_db
from app.core.dependencies import get_current_user
from app.services.transcription_service import transcribe_audio
from app.services.ai_analysis_service import analyze_transcription


router = APIRouter(
    prefix="/voice-notes",
    tags=["Voice Notes"],
)


@router.post("/upload")
async def upload_voice_note(
    visit_id: str = Form(...),
    duration_seconds: float | None = Form(None),
    recorded_at: str | None = Form(None),
    audio_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    organization_id = current_user["organization_id"]
    user_id = current_user["id"]

    # Verify visit belongs to the user's organization
    visit = db.execute(
        text("""
            SELECT
                id,
                user_id,
                customer_id
            FROM visits
            WHERE id = :visit_id
              AND organization_id = :organization_id
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

    # FIELD_REP can only upload to their own visit
    if (
        current_user["role"] == "FIELD_REP"
        and str(visit["user_id"]) != str(user_id)
    ):
        raise HTTPException(
            status_code=403,
            detail="You can only upload voice notes to your own visits.",
        )

    # Allowed audio formats
    allowed_types = {
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/mp4": ".m4a",
        "audio/x-m4a": ".m4a",
        "audio/webm": ".webm",
    }

    content_type = audio_file.content_type or ""

    if content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format: {content_type}",
        )

    # Read file
    file_content = await audio_file.read()

    if not file_content:
        raise HTTPException(
            status_code=400,
            detail="Uploaded audio file is empty.",
        )

    # 25 MB prototype limit
    max_file_size = 25 * 1024 * 1024

    if len(file_content) > max_file_size:
        raise HTTPException(
            status_code=400,
            detail="Audio file must be smaller than 25 MB.",
        )

    # Create local upload directory
    upload_directory = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "uploads",
        "voice_notes",
    )

    os.makedirs(upload_directory, exist_ok=True)

    # Generate unique filename
    extension = allowed_types[content_type]

    unique_filename = f"{uuid.uuid4()}{extension}"

    file_path = os.path.join(
        upload_directory,
        unique_filename,
    )

    # Save audio file
    with open(file_path, "wb") as file:
        file.write(file_content)

    # Store relative path in database
    file_url = f"/uploads/voice_notes/{unique_filename}"

    result = db.execute(
        text("""
            INSERT INTO voice_notes (
                visit_id,
                organization_id,
                user_id,
                file_url,
                file_name,
                file_type,
                file_size_bytes,
                duration_seconds,
                recorded_at,
                processing_status
            )
            VALUES (
                :visit_id,
                :organization_id,
                :user_id,
                :file_url,
                :file_name,
                :file_type,
                :file_size_bytes,
                :duration_seconds,
                COALESCE(
                    CAST(:recorded_at AS timestamptz),
                    now()
                ),
                'PENDING'
            )
            RETURNING
                id,
                visit_id,
                organization_id,
                user_id,
                file_url,
                file_name,
                file_type,
                file_size_bytes,
                duration_seconds,
                transcription,
                processing_status,
                transcription_confidence,
                recorded_at,
                created_at,
                updated_at
        """),
        {
            "visit_id": visit_id,
            "organization_id": organization_id,
            "user_id": user_id,
            "file_url": file_url,
            "file_name": audio_file.filename,
            "file_type": content_type,
            "file_size_bytes": len(file_content),
            "duration_seconds": duration_seconds,
            "recorded_at": recorded_at,
        },
    )

    voice_note = result.mappings().first()

    db.commit()

    # -----------------------------------------
    # AI TRANSCRIPTION
    # -----------------------------------------

    try:
        transcription = transcribe_audio(file_path)

        db.execute(
            text("""
                UPDATE voice_notes
                SET
                    transcription = :transcription,
                    processing_status = 'COMPLETED',
                    updated_at = now()
                WHERE id = :voice_note_id
            """),
            {
                "transcription": transcription,
                "voice_note_id": voice_note["id"],
            },
        )

        db.commit()

    except Exception as e:

        db.execute(
            text("""
                UPDATE voice_notes
                SET
                    processing_status = 'FAILED',
                    updated_at = now()
                WHERE id = :voice_note_id
            """),
            {
                "voice_note_id": voice_note["id"],
            },
        )

        db.commit()

        return {
            "status": "success",
            "message": "Voice note uploaded, but transcription failed.",
            "voice_note": dict(voice_note),
            "transcription_error": str(e),
        }

    # -----------------------------------------
    # AI ANALYSIS
    # -----------------------------------------

    try:

        analysis_start = time.perf_counter()

        ai_analysis = analyze_transcription(
            transcription
        )

        processing_time_ms = int(
            (time.perf_counter() - analysis_start) * 1000
        )

        # -----------------------------------------
        # SAVE AI INSIGHT
        # -----------------------------------------

        insight_result = db.execute(
            text("""
                INSERT INTO ai_insights (
                    voice_note_id,
                    visit_id,
                    organization_id,
                    summary,
                    sentiment,
                    key_insights,
                    opportunity_level,
                    risk_level,
                    model_name,
                    processing_time_ms
                )
                VALUES (
                    :voice_note_id,
                    :visit_id,
                    :organization_id,
                    :summary,
                    :sentiment,
                    CAST(:key_insights AS jsonb),
                    :opportunity_level,
                    :risk_level,
                    :model_name,
                    :processing_time_ms
                )
                RETURNING id
            """),
            {
                "voice_note_id": voice_note["id"],
                "visit_id": visit_id,
                "organization_id": organization_id,
                "summary": ai_analysis.get("summary"),
                "sentiment": ai_analysis.get("sentiment"),
                "key_insights": json.dumps(
                    ai_analysis.get("key_insights", [])
                ),
                "opportunity_level": ai_analysis.get(
                    "opportunity_signal"
                ),
                "risk_level": ai_analysis.get(
                    "risk_signal"
                ),
                "model_name": "gemini-3.8-flash",
                "processing_time_ms": processing_time_ms,
            },
        )

        ai_insight = insight_result.mappings().first()

        ai_insight_id = ai_insight["id"]

        # -----------------------------------------
        # AUTOMATIC AI LEAD CREATION
        # -----------------------------------------

        lead_id = None
        lead_created = False

        opportunity_signal = (
            ai_analysis.get("opportunity_signal") or ""
        ).upper()

        if opportunity_signal == "HIGH":

            # Check whether this customer already has
            # an active lead in the organization
            existing_lead = db.execute(
                text("""
                    SELECT id
                    FROM leads
                    WHERE organization_id = :organization_id
                      AND customer_id = :customer_id
                      AND stage NOT IN ('WON', 'LOST')
                    ORDER BY created_at DESC
                    LIMIT 1
                """),
                {
                    "organization_id": organization_id,
                    "customer_id": visit["customer_id"],
                },
            ).mappings().first()

            if not existing_lead:

                customer = db.execute(
                    text("""
                        SELECT
                            id,
                            name,
                            territory_id
                        FROM customers
                        WHERE id = :customer_id
                          AND organization_id = :organization_id
                        LIMIT 1
                    """),
                    {
                        "customer_id": visit["customer_id"],
                        "organization_id": organization_id,
                    },
                ).mappings().first()

                if customer:

                    lead_result = db.execute(
                        text("""
                            INSERT INTO leads (
                                organization_id,
                                customer_id,
                                territory_id,
                                assigned_to,
                                title,
                                description,
                                stage,
                                source,
                                notes
                            )
                            VALUES (
                                :organization_id,
                                :customer_id,
                                :territory_id,
                                :assigned_to,
                                :title,
                                :description,
                                'NEW',
                                'AI_DETECTED',
                                'Automatically created from HIGH AI opportunity signal.'
                            )
                            RETURNING id
                        """),
                        {
                            "organization_id": organization_id,
                            "customer_id": customer["id"],
                            "territory_id": customer["territory_id"],
                            "assigned_to": user_id,
                            "title": f"{customer['name']} Opportunity",
                            "description": ai_analysis.get("summary"),
                        },
                    )

                    new_lead = lead_result.mappings().first()

                    lead_id = new_lead["id"]
                    lead_created = True

                    # Record initial pipeline stage
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
                                'NEW',
                                :changed_by,
                                'Lead automatically created from AI opportunity detection.'
                            )
                        """),
                        {
                            "lead_id": lead_id,
                            "organization_id": organization_id,
                            "changed_by": user_id,
                        },
                    )

        # -----------------------------------------
        # SAVE ACTION ITEMS
        # -----------------------------------------

        for action in ai_analysis.get("action_items", []):

            if not action:
                continue

            db.execute(
                text("""
                    INSERT INTO action_items (
                        organization_id,
                        visit_id,
                        ai_insight_id,
                        customer_id,
                        assigned_to,
                        title,
                        description,
                        priority,
                        status,
                        source
                    )
                    VALUES (
                        :organization_id,
                        :visit_id,
                        :ai_insight_id,
                        :customer_id,
                        :assigned_to,
                        :title,
                        :description,
                        'MEDIUM',
                        'PENDING',
                        'AI'
                    )
                """),
                {
                    "organization_id": organization_id,
                    "visit_id": visit_id,
                    "ai_insight_id": ai_insight_id,
                    "customer_id": visit["customer_id"],
                    "assigned_to": user_id,
                    "title": str(action),
                    "description": "AI-generated action item from field visit.",
                },
            )

        # -----------------------------------------
        # SAVE ALERTS
        # -----------------------------------------

        for alert in ai_analysis.get("alerts", []):

            if not alert:
                continue

            db.execute(
                text("""
                    INSERT INTO alerts (
                        organization_id,
                        visit_id,
                        customer_id,
                        ai_insight_id,
                        assigned_to,
                        alert_type,
                        severity,
                        title,
                        message,
                        status
                    )
                    VALUES (
                        :organization_id,
                        :visit_id,
                        :customer_id,
                        :ai_insight_id,
                        :assigned_to,
                        'OTHER',
                        'MEDIUM',
                        'AI Field Sales Alert',
                        :message,
                        'OPEN'
                    )
                """),
                {
                    "organization_id": organization_id,
                    "visit_id": visit_id,
                    "customer_id": visit["customer_id"],
                    "ai_insight_id": ai_insight_id,
                    "assigned_to": None,
                    "message": str(alert),
                },
            )

        db.commit()

        # -----------------------------------------
        # FETCH COMPLETE VOICE NOTE
        # -----------------------------------------

        updated_result = db.execute(
            text("""
                SELECT
                    vn.id,
                    vn.visit_id,
                    vn.organization_id,
                    vn.user_id,
                    u.full_name AS user_name,
                    vn.file_url,
                    vn.file_name,
                    vn.file_type,
                    vn.file_size_bytes,
                    vn.duration_seconds,
                    vn.transcription,
                    vn.processing_status,
                    vn.transcription_confidence,
                    vn.recorded_at,
                    vn.created_at,
                    vn.updated_at
                FROM voice_notes vn
                JOIN users u
                    ON u.id = vn.user_id
                WHERE vn.id = :voice_note_id
                LIMIT 1
            """),
            {
                "voice_note_id": voice_note["id"],
            },
        )

        updated_voice_note = updated_result.mappings().first()

        return {
            "status": "success",
            "message": "Voice note uploaded, transcribed, and analyzed successfully.",
            "voice_note": dict(updated_voice_note),
            "ai_analysis": ai_analysis,
            "ai_insight_id": ai_insight_id,
            "lead_created": lead_created,
            "lead_id": lead_id,
        }

    except Exception as e:

        db.rollback()

        return {
            "status": "success",
            "message": "Voice note uploaded and transcribed, but AI analysis failed.",
            "voice_note": dict(voice_note),
            "transcription": transcription,
            "analysis_error": str(e),
        }


@router.get("/")
def get_voice_notes(
    visit_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    organization_id = current_user["organization_id"]

    if visit_id:
        result = db.execute(
            text("""
                SELECT
                    vn.id,
                    vn.visit_id,
                    vn.organization_id,
                    vn.user_id,
                    u.full_name AS user_name,
                    vn.file_url,
                    vn.file_name,
                    vn.file_type,
                    vn.file_size_bytes,
                    vn.duration_seconds,
                    vn.transcription,
                    vn.processing_status,
                    vn.transcription_confidence,
                    vn.recorded_at,
                    vn.created_at,
                    vn.updated_at
                FROM voice_notes vn
                JOIN users u
                    ON u.id = vn.user_id
                WHERE vn.organization_id = :organization_id
                  AND vn.visit_id = :visit_id
                ORDER BY vn.recorded_at DESC
            """),
            {
                "organization_id": organization_id,
                "visit_id": visit_id,
            },
        )
    else:
        result = db.execute(
            text("""
                SELECT
                    vn.id,
                    vn.visit_id,
                    vn.organization_id,
                    vn.user_id,
                    u.full_name AS user_name,
                    vn.file_url,
                    vn.file_name,
                    vn.file_type,
                    vn.file_size_bytes,
                    vn.duration_seconds,
                    vn.transcription,
                    vn.processing_status,
                    vn.transcription_confidence,
                    vn.recorded_at,
                    vn.created_at,
                    vn.updated_at
                FROM voice_notes vn
                JOIN users u
                    ON u.id = vn.user_id
                WHERE vn.organization_id = :organization_id
                ORDER BY vn.recorded_at DESC
            """),
            {
                "organization_id": organization_id,
            },
        )

    voice_notes = [
        dict(row)
        for row in result.mappings().all()
    ]

    return {
        "status": "success",
        "count": len(voice_notes),
        "voice_notes": voice_notes,
    }


@router.get("/{voice_note_id}")
def get_voice_note(
    voice_note_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    organization_id = current_user["organization_id"]

    result = db.execute(
        text("""
            SELECT
                vn.id,
                vn.visit_id,
                vn.organization_id,
                vn.user_id,
                u.full_name AS user_name,
                vn.file_url,
                vn.file_name,
                vn.file_type,
                vn.file_size_bytes,
                vn.duration_seconds,
                vn.transcription,
                vn.processing_status,
                vn.transcription_confidence,
                vn.recorded_at,
                vn.created_at,
                vn.updated_at
            FROM voice_notes vn
            JOIN users u
                ON u.id = vn.user_id
            WHERE vn.id = :voice_note_id
              AND vn.organization_id = :organization_id
            LIMIT 1
        """),
        {
            "voice_note_id": voice_note_id,
            "organization_id": organization_id,
        },
    )

    voice_note = result.mappings().first()

    if not voice_note:
        raise HTTPException(
            status_code=404,
            detail="Voice note not found.",
        )

    return {
        "status": "success",
        "voice_note": dict(voice_note),
    }