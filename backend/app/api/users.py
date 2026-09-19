#python -m uvicorn app.main:app --reload


from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.security import hash_password

router = APIRouter(
    prefix="/users",
    tags=["Users"],
)


@router.post("/")
def create_user(
    organization_id: str,
    full_name: str,
    email: str,
    role: str,
    password: str,
    phone: str | None = None,
    db: Session = Depends(get_db),
):
    # Validate role
    allowed_roles = {"FIELD_REP", "MANAGER", "EXECUTIVE"}

    role = role.upper()

    if role not in allowed_roles:
        raise HTTPException(
            status_code=400,
            detail="Invalid role. Use REP, MANAGER, or EXECUTIVE.",
        )

    # Check organization exists
    org_query = text("""
        SELECT id
        FROM organizations
        WHERE id = :organization_id
    """)

    organization = db.execute(
        org_query,
        {"organization_id": organization_id},
    ).first()

    if not organization:
        raise HTTPException(
            status_code=404,
            detail="Organization not found.",
        )

    # Check email is not already registered
    email_query = text("""
        SELECT id
        FROM users
        WHERE email = :email
    """)

    existing_user = db.execute(
        email_query,
        {"email": email},
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="User with this email already exists.",
        )

    # Create user
    query = text("""
        INSERT INTO users (
            organization_id,
            full_name,
            email,
            role,
            phone,
            password_hash,
            is_active
        )
        VALUES (
            :organization_id,
            :full_name,
            :email,
            :role,
            :phone,
            :password_hash,
            true
        )
        RETURNING
            id,
            organization_id,
            full_name,
            email,
            role,
            phone,
            is_active,
            created_at,
            updated_at
    """)

    result = db.execute(
        query,
        {
            "organization_id": organization_id,
            "full_name": full_name,
            "email": email,
            "role": role,
            "phone": phone,
            "password_hash": hash_password(password),
        },
    )

    user = result.mappings().first()

    db.commit()

    return {
        "status": "success",
        "user": dict(user),
    }


@router.get("/")
def get_users(
    db: Session = Depends(get_db),
):
    query = text("""
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
        ORDER BY created_at DESC
    """)

    result = db.execute(query)

    users = [
        dict(row)
        for row in result.mappings().all()
    ]

    return {
        "status": "success",
        "count": len(users),
        "users": users,
    }