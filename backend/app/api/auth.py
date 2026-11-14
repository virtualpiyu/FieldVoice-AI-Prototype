from fastapi import APIRouter, Depends, HTTPException, status
from app.core.dependencies import (
    get_current_user,
    require_role,
)
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.security import (
    verify_password,
    create_access_token,
)
from fastapi import Depends
from app.core.dependencies import get_current_user



from pydantic import BaseModel


class LoginPayload(BaseModel):
    email: str | None = None
    password: str | None = None


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


@router.post("/login")
def login(
    email: str | None = None,
    password: str | None = None,
    body: LoginPayload | None = None,
    db: Session = Depends(get_db),
):
    eff_email = (body.email if body and body.email else email) or ""
    eff_password = (body.password if body and body.password else password) or ""

    if not eff_email or not eff_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email and password are required.",
        )

    # Find user
    query = text("""
        SELECT
            id,
            organization_id,
            full_name,
            email,
            role,
            phone,
            is_active,
            password_hash
        FROM public.users
        WHERE LOWER(email) = LOWER(:email)
        LIMIT 1
    """)

    result = db.execute(
        query,
        {"email": eff_email},
    )

    user = result.mappings().first()

    # User does not exist
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    # Account disabled
    if not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive.",
        )

    # Password not configured
    if not user["password_hash"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Password is not configured for this user.",
        )

    # Verify password
    if not verify_password(
        eff_password,
        user["password_hash"],
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    # Create JWT
    access_token = create_access_token(
        user_id=str(user["id"]),
        organization_id=str(user["organization_id"]),
        role=user["role"],
    )

    return {
        "status": "success",
        "message": "Login successful.",
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(user["id"]),
            "organization_id": str(user["organization_id"]),
            "full_name": user["full_name"],
            "email": user["email"],
            "role": user["role"],
            "phone": user["phone"],
        },
    }


#AUTH ME
@router.get("/me")
def get_me(
    current_user: dict = Depends(get_current_user),
):
    return {
        "status": "success",
        "user": {
            "id": str(current_user["id"]),
            "organization_id": str(current_user["organization_id"]),
            "full_name": current_user["full_name"],
            "email": current_user["email"],
            "role": current_user["role"],
            "phone": current_user["phone"],
            "is_active": current_user["is_active"],
        },
    }


#Loging  Roles 

@router.get("/rep-area")
def rep_area(
    current_user: dict = Depends(
        require_role("FIELD_REP")
    ),
):
    return {
        "status": "success",
        "message": "FIELD_REP access granted.",
        "user": current_user["full_name"],
        "role": current_user["role"],
    }


@router.get("/manager-area")
def manager_area(
    current_user: dict = Depends(
        require_role("MANAGER")
    ),
):
    return {
        "status": "success",
        "message": "MANAGER access granted.",
        "user": current_user["full_name"],
        "role": current_user["role"],
    }


@router.get("/executive-area")
def executive_area(
    current_user: dict = Depends(
        require_role("EXECUTIVE")
    ),
):
    return {
        "status": "success",
        "message": "EXECUTIVE access granted.",
        "user": current_user["full_name"],
        "role": current_user["role"],
    }