from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from app.database import get_database
from app.utils.security import decode_access_token

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Extracts the Bearer token, validates the JWT, and retrieves
    the user record from the MongoDB 'users' collection.
    """
    token = credentials.credentials
    payload = decode_access_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload is missing user identification.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    db = get_database()
    try:
        user = db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        user = None

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account associated with this token was not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Convert ObjectId to string for easy JSON serializability
    user["id"] = str(user["_id"])
    sess_id = payload.get("session_id")
    user["session_id"] = sess_id
    if sess_id:
        sess_doc = db.user_sessions.find_one({"session_id": sess_id})
        if sess_doc and sess_doc.get("status") == "terminated":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session has been terminated. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
    return user


def require_roles(*allowed_roles: str):
    """
    Dependency factory that checks whether the authenticated user possesses
    one of the required roles. Supports both require_roles("admin", "doctor")
    and require_roles(["admin", "doctor"]).
    """
    roles_set = set()
    for r in allowed_roles:
        if isinstance(r, (list, tuple, set)):
            roles_set.update(r)
        else:
            roles_set.add(r)

    def role_checker(current_user: dict = Depends(get_current_user)) -> dict:
        user_role = current_user.get("role")
        if user_role not in roles_set:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires one of roles: {list(roles_set)}. Your role is '{user_role}'."
            )
        return current_user

    return role_checker
