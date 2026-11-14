from sqlalchemy import text
from sqlalchemy.orm import Session
import os
import uuid
import json
import time

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, Form

from app.database import get_db, SessionLocal
from app.core.dependencies import get_current_user
from app.services.transcription_service import transcribe_audio
from app.services.ai_analysis_service import analyze_transcription


router = APIRouter(
    prefix="/voice-notes",
    tags=["Voice Notes"],
)




def process_voice_note_background(voice_note_id: str, file_path: str):
    """Run Gemini transcription + analysis outside the HTTP request.

    The upload endpoint returns immediately after the audio is safely stored.
    This keeps Manager and Field Rep UX fast while preserving the existing
    transcription, AI analysis, insight, action-item, alert and lead pipeline.
    """
    db = SessionLocal()
    try:
        result = db.execute(
            text("""
                SELECT
                    voice_notes.id AS id,
                    voice_notes.visit_id AS visit_id,
                    voice_notes.organization_id AS organization_id,
                    voice_notes.user_id AS user_id,
                    visits.customer_id AS customer_id
                FROM voice_notes
                JOIN visits ON visits.id = voice_notes.visit_id
                WHERE voice_notes.id = :voice_note_id
                LIMIT 1
            """),
            {"voice_note_id": voice_note_id},
        )
        voice_note = result.mappings().first()
        if not voice_note:
            return

        # Resolve the visit/user/organization context once from the persisted
        # voice-note record. The background worker no longer receives these
        # request-scoped variables from the HTTP endpoint.
        visit_id = str(voice_note["visit_id"])
        organization_id = str(voice_note["organization_id"])
        user_id = str(voice_note["user_id"])
        customer_id = voice_note["customer_id"]

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
                        processing_status = 'PENDING',
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
        # IMPORTANT: AI generation and DB side-effects are deliberately separated.
        # A failure while creating a lead/action/alert must NEVER erase a valid
        # AI analysis or make the frontend think that Gemini failed.

        analysis_start = time.perf_counter()

        try:
            ai_analysis = analyze_transcription(transcription)
        except Exception as e:
            from app.services.ai_analysis_service import _local_fallback
            ai_analysis = _local_fallback(transcription)

        processing_time_ms = int(
            (time.perf_counter() - analysis_start) * 1000
        )

        # Normalize the AI payload before writing it to PostgreSQL. This guarantees
        # the frontend always receives arrays instead of null/string surprises.
        ai_analysis = {
            "summary": str(ai_analysis.get("summary") or "Field visit recorded.").strip(),
            "sentiment": str(ai_analysis.get("sentiment") or "NEUTRAL").upper(),
            "key_insights": [
                str(x).strip()
                for x in (ai_analysis.get("key_insights") or [])
                if str(x).strip()
            ],
            "action_items": [
                str(x).strip()
                for x in (ai_analysis.get("action_items") or [])
                if str(x).strip()
            ],
            "alerts": [
                str(x).strip()
                for x in (ai_analysis.get("alerts") or [])
                if str(x).strip()
            ],
            "opportunity_signal": str(
                ai_analysis.get("opportunity_signal") or "LOW"
            ).upper(),
            "risk_signal": str(
                ai_analysis.get("risk_signal") or "LOW"
            ).upper(),
        }

        # The AI service already has a transcript-grounded fallback. This is an
        # additional safety net so the product never displays an empty Key Insights
        # section for a non-empty transcript.
        if transcription.strip() and not ai_analysis["key_insights"]:
            ai_analysis["key_insights"] = [
                "The field visit transcript was analyzed, but no separate insight was explicitly extracted."
            ]

        ai_insight_id = None
        lead_id = None
        lead_created = False
        persistence_error = None
        side_effect_errors = []

        # -----------------------------------------
        # SAVE AI INSIGHT FIRST
        # -----------------------------------------
        # Persist the actual Gemini result. Reuse an existing insight for the
        # same voice note when present so retries never create a second insight.
        try:
            existing_insight = db.execute(
                text("""
                    SELECT id
                    FROM ai_insights
                    WHERE voice_note_id = :voice_note_id
                      AND organization_id = :organization_id
                    ORDER BY created_at DESC
                    LIMIT 1
                """),
                {
                    "voice_note_id": voice_note["id"],
                    "organization_id": organization_id,
                },
            ).mappings().first()

            payload = {
                "summary": ai_analysis["summary"],
                "sentiment": ai_analysis["sentiment"],
                "key_insights": json.dumps(ai_analysis["key_insights"]),
                "opportunity_level": ai_analysis["opportunity_signal"],
                "risk_level": ai_analysis["risk_signal"],
                "model_name": "gemini-3.8-flash",
                "processing_time_ms": processing_time_ms,
                "voice_note_id": voice_note["id"],
                "visit_id": visit_id,
                "organization_id": organization_id,
            }

            if existing_insight:
                ai_insight_id = existing_insight["id"]
                db.execute(
                    text("""
                        UPDATE ai_insights
                        SET
                            visit_id = :visit_id,
                            summary = :summary,
                            sentiment = :sentiment,
                            key_insights = CAST(:key_insights AS jsonb),
                            opportunity_level = :opportunity_level,
                            risk_level = :risk_level,
                            model_name = :model_name,
                            processing_time_ms = :processing_time_ms,
                            updated_at = now()
                        WHERE id = :ai_insight_id
                          AND organization_id = :organization_id
                    """),
                    {**payload, "ai_insight_id": ai_insight_id},
                )
            else:
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
                    payload,
                )
                row = insight_result.mappings().first()
                if not row:
                    raise RuntimeError("AI insight insert returned no row.")
                ai_insight_id = row["id"]

            db.commit()
        except Exception as e:
            db.rollback()
            persistence_error = str(e)
            print(f"[voice-notes] AI insight persistence failed for {voice_note_id}: {e}")

            # Do not claim COMPLETED when the actual intelligence was not saved.
            db.execute(
                text("""
                    UPDATE voice_notes
                    SET processing_status = 'FAILED', updated_at = now()
                    WHERE id = :voice_note_id
                """),
                {"voice_note_id": voice_note_id},
            )
            db.commit()
            return

        # -----------------------------------------
        # OPTIONAL CRM SIDE EFFECTS
        # -----------------------------------------
        # Each group is isolated. A failure here is reported separately but never
        # changes the successful AI result returned to the frontend.
        if ai_insight_id:
            opportunity_signal = ai_analysis["opportunity_signal"]

            # Automatic lead creation for HIGH opportunity.
            if opportunity_signal == "HIGH":
                try:
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
                            "customer_id": customer_id,
                        },
                    ).mappings().first()

                    if not existing_lead:
                        customer = db.execute(
                            text("""
                                SELECT id, name, territory_id
                                FROM customers
                                WHERE id = :customer_id
                                  AND organization_id = :organization_id
                                LIMIT 1
                            """),
                            {
                                "customer_id": customer_id,
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
                                    "description": ai_analysis["summary"],
                                },
                            )
                            new_lead = lead_result.mappings().first()
                            if new_lead:
                                lead_id = new_lead["id"]

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
                                db.commit()
                                lead_created = True
                except Exception as e:
                    db.rollback()
                    side_effect_errors.append(f"lead_creation: {e}")

            # AI action items.
            for action in ai_analysis["action_items"]:
                try:
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
                            "customer_id": customer_id,
                            "assigned_to": user_id,
                            "title": action,
                            "description": "AI-generated action item from field visit.",
                        },
                    )
                    db.commit()
                except Exception as e:
                    db.rollback()
                    side_effect_errors.append(f"action_item: {e}")

            # AI alerts.
            for alert in ai_analysis["alerts"]:
                try:
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
                                NULL,
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
                            "customer_id": customer_id,
                            "ai_insight_id": ai_insight_id,
                            "message": alert,
                        },
                    )
                    db.commit()
                except Exception as e:
                    db.rollback()
                    side_effect_errors.append(f"alert: {e}")

        # AI pipeline is fully complete only after transcription, analysis,
        # insight persistence, action items, alerts and lead side effects finish.
        db.execute(
            text("""
                UPDATE voice_notes
                SET processing_status = 'COMPLETED', updated_at = now()
                WHERE id = :voice_note_id
            """),
            {"voice_note_id": voice_note["id"]},
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
                JOIN users u ON u.id = vn.user_id
                WHERE vn.id = :voice_note_id
                LIMIT 1
            """),
            {"voice_note_id": voice_note["id"]},
        )
        updated_voice_note = updated_result.mappings().first() or voice_note

        response = {
            "status": "success",
            "message": "Voice note uploaded, transcribed, and analyzed successfully.",
            "voice_note": dict(updated_voice_note),
            "transcription": transcription,
            "ai_analysis": ai_analysis,
            "ai_insight_id": ai_insight_id,
            "ai_insight_persisted": bool(ai_insight_id),
            "lead_created": lead_created,
            "lead_id": lead_id,
        }

        if persistence_error:
            response["ai_insight_persisted"] = False
            response["analysis_persistence_error"] = persistence_error
            response["message"] = "Voice note and AI analysis completed, but the AI insight could not be saved to the database."

        if side_effect_errors:
            response["side_effect_errors"] = side_effect_errors

        return response
    except Exception as e:
        try:
            db.rollback()
            db.execute(
                text("""
                    UPDATE voice_notes
                    SET processing_status = 'FAILED', updated_at = now()
                    WHERE id = :voice_note_id
                """),
                {"voice_note_id": voice_note_id},
            )
            db.commit()
        except Exception:
            db.rollback()
    finally:
        db.close()


@router.post("/upload")
async def upload_voice_note(
    background_tasks: BackgroundTasks,
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

    # FIELD_REP / MANAGER can only upload voice notes to their own visits.
    # Managers can see team visits, but their voice workflow is personal.
    role = str(current_user.get("role") or "").strip().upper()
    if role in {"FIELD_REP", "SALESPERSON", "MANAGER"} and str(visit["user_id"]) != str(user_id):
        raise HTTPException(
            status_code=403,
            detail="You can only upload voice notes to your own visits.",
        )

    # Allowed audio formats.
    # Browsers may append codec information, for example:
    # audio/webm;codecs=opus
    # Normalize the MIME type before validating it.
    allowed_types = {
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "audio/wav": ".wav",
        "audio/wave": ".wav",
        "audio/x-wav": ".wav",
        "audio/mp4": ".m4a",
        "audio/m4a": ".m4a",
        "audio/x-m4a": ".m4a",
        "audio/webm": ".webm",
        "audio/ogg": ".ogg",
        "audio/aac": ".aac",
        "audio/flac": ".flac",
    }

    raw_content_type = (audio_file.content_type or "").strip().lower()

    # Convert values such as "audio/webm;codecs=opus"
    # to the base MIME type "audio/webm".
    content_type = raw_content_type.split(";", 1)[0].strip()

    # Some clients may omit the MIME type. Fall back to the filename extension.
    if not content_type and audio_file.filename:
        filename = audio_file.filename.lower()
        extension_types = {
            ".mp3": "audio/mpeg",
            ".wav": "audio/wav",
            ".m4a": "audio/mp4",
            ".mp4": "audio/mp4",
            ".webm": "audio/webm",
            ".ogg": "audio/ogg",
            ".aac": "audio/aac",
            ".flac": "audio/flac",
        }
        for extension, detected_type in extension_types.items():
            if filename.endswith(extension):
                content_type = detected_type
                break

    if content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format: {raw_content_type or content_type or 'unknown'}",
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

    # ---------------------------------------------------------
    # FAST RESPONSE: queue Gemini work in FastAPI background task
    # ---------------------------------------------------------
    # The audio file and DB row are already durable at this point. Do not make
    # the browser wait for Gemini Files API + transcription + analysis.
    background_tasks.add_task(
        process_voice_note_background,
        str(voice_note["id"]),
        file_path,
    )

    return {
        "status": "processing",
        "message": "Voice note uploaded. AI processing started in background.",
        "voice_note": dict(voice_note),
        "transcription": None,
        "ai_analysis": None,
        "processing": True,
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


@router.get("/{voice_note_id}/status")
def get_voice_note_status(
    voice_note_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = db.execute(
        text("""
            SELECT
                vn.id,
                vn.visit_id,
                vn.processing_status,
                vn.transcription,
                ai.summary AS ai_summary,
                ai.sentiment AS ai_sentiment,
                ai.key_insights AS ai_key_insights,
                ai.opportunity_level AS ai_opportunity_level,
                ai.risk_level AS ai_risk_level
            FROM voice_notes vn
            LEFT JOIN ai_insights ai
              ON ai.voice_note_id = vn.id
             AND ai.organization_id = vn.organization_id
            WHERE vn.id = :voice_note_id
              AND vn.organization_id = :organization_id
            ORDER BY ai.created_at DESC NULLS LAST
            LIMIT 1
        """),
        {"voice_note_id": voice_note_id, "organization_id": current_user["organization_id"]},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Voice note not found.")
    return {
        "status": "success",
        "processing_status": row["processing_status"],
        "voice_note": {
            "id": row["id"], "visit_id": row["visit_id"],
            "processing_status": row["processing_status"],
            "transcription": row["transcription"],
        },
        "ai_analysis": {
            "summary": row["ai_summary"],
            "sentiment": row["ai_sentiment"],
            "key_insights": row["ai_key_insights"] or [],
            "opportunity_signal": row["ai_opportunity_level"],
            "risk_signal": row["ai_risk_level"],
        } if row["ai_summary"] is not None else None,
        "action_items": [
            dict(item) for item in db.execute(
                text("""
                    SELECT id, title, description, priority, status, assigned_to
                    FROM action_items
                    WHERE visit_id = :visit_id
                      AND organization_id = :organization_id
                    ORDER BY created_at ASC
                """),
                {
                    "visit_id": row["visit_id"],
                    "organization_id": current_user["organization_id"],
                },
            ).mappings().all()
        ],
        "alerts": [
            dict(item) for item in db.execute(
                text("""
                    SELECT id, alert_type, severity, title, message, status, assigned_to
                    FROM alerts
                    WHERE visit_id = :visit_id
                      AND organization_id = :organization_id
                    ORDER BY created_at ASC
                """),
                {
                    "visit_id": row["visit_id"],
                    "organization_id": current_user["organization_id"],
                },
            ).mappings().all()
        ],
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