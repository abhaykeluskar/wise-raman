from datetime import timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.dependencies import (
    pwd_context, get_password_hash, verify_password,
    create_access_token, get_current_user, ACCESS_TOKEN_EXPIRE_MINUTES
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

class UserCreate(BaseModel):
    email: str
    password: str
    name: str

class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    current_password: Optional[str] = None

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: Optional[str] = None

@router.post("/register")
def register(user: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    db_user = User(
        email=user.email,
        name=user.name,
        password_hash=get_password_hash(user.password)
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(db_user.id)}, expires_delta=access_token_expires
    )
    return {
        "message": "User registered successfully",
        "token": access_token,
        "user": {"id": str(db_user.id), "email": db_user.email, "name": db_user.name}
    }

@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": str(user.id),
        "user": {"id": str(user.id), "email": user.email, "name": user.name}
    }

@router.get("/me")
def get_me(current_user = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "name": current_user.name,
        "created_at": str(current_user.created_at) if current_user.created_at else None
    }

user_router = APIRouter(prefix="/api/user", tags=["User Profile"])

@user_router.put("/profile")
def update_user_profile(
    profile_data: ProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    import re
    # 1. Validate and update Name
    if profile_data.name is not None:
        name_clean = profile_data.name.strip()
        if len(name_clean) < 2:
            raise HTTPException(status_code=400, detail="Name must be at least 2 characters long")
        if len(name_clean) > 100:
            raise HTTPException(status_code=400, detail="Name cannot exceed 100 characters")
        current_user.name = name_clean

    # 2. Validate and update Email
    if profile_data.email is not None:
        new_email = profile_data.email.strip().lower()
        if new_email != current_user.email.lower():
            email_pattern = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
            if not re.match(email_pattern, new_email):
                raise HTTPException(status_code=400, detail="Please provide a valid email address")
            
            if not profile_data.current_password:
                raise HTTPException(
                    status_code=400,
                    detail="Current password is required to change your account email address"
                )
            if not verify_password(profile_data.current_password, current_user.password_hash):
                raise HTTPException(
                    status_code=400,
                    detail="Incorrect current password"
                )
            
            existing = db.query(User).filter(User.email.ilike(new_email), User.id != current_user.id).first()
            if existing:
                raise HTTPException(
                    status_code=400,
                    detail="This email address is already in use by another account"
                )
            
            current_user.email = new_email

    db.commit()
    db.refresh(current_user)

    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "name": current_user.name
    }

@user_router.put("/password")
def change_user_password(
    password_data: PasswordChangeRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    if not verify_password(password_data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=400,
            detail="Incorrect current password"
        )
    
    if password_data.confirm_password is not None and password_data.confirm_password != password_data.new_password:
        raise HTTPException(
            status_code=400,
            detail="New password and confirmation password do not match"
        )
    
    new_pw = password_data.new_password
    if len(new_pw) < 8:
        raise HTTPException(
            status_code=400,
            detail="New password must be at least 8 characters long"
        )
    if new_pw == password_data.current_password:
        raise HTTPException(
            status_code=400,
            detail="New password cannot be the same as your current password"
        )
    
    current_user.password_hash = get_password_hash(new_pw)
    db.commit()

    return {"message": "Password updated successfully"}
