from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.security import decode_access_token
from fastapi import Depends, HTTPException, status

security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    token = credentials.credentials

    try:
        payload = decode_access_token(token)

        user_id = payload.get("sub")

        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token.",
            )

    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
        )

    query = text("""
        SELECT
            id,
            organization_id,
            full_name,
            email,
            role,
            phone,
            is_active
        FROM public.users
        WHERE id = :user_id
        LIMIT 1
    """)

    user = db.execute(
        query,
        {"user_id": user_id},
    ).mappings().first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists.",
        )

    if not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive.",
        )

    return dict(user)
def require_role(*allowed_roles: str):
    """
    Require the authenticated user to have one of the allowed roles.
    """

    def role_checker(
        current_user: dict = Depends(get_current_user),
    ):
        user_role = current_user["role"]

        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource.",
            )

        return current_user

    return role_checker