import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.database import get_db
from app.models.product import Event
from app.utils.rbac import require_roles

router = APIRouter(prefix="/events", tags=["events"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


# ── Schemas ───────────────────────────────────────────────────

class EventOut(BaseModel):
    event_id: uuid.UUID
    title: str
    description: str
    image_url: Optional[str]
    register_url: str
    event_date: Optional[datetime]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Helpers ───────────────────────────────────────────────────

async def _save_event_image(file: UploadFile, event_id: uuid.UUID) -> str:
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=422, detail="Only JPEG/PNG/WEBP images allowed")
    content = await file.read()
    if len(content) > settings.MAX_IMAGE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=422, detail=f"Image exceeds {settings.MAX_IMAGE_SIZE_MB}MB")
    ext = file.content_type.split("/")[-1].replace("jpeg", "jpg")
    filename = f"{uuid.uuid4()}.{ext}"
    dir_path = os.path.join(settings.UPLOAD_DIR, "events")
    os.makedirs(dir_path, exist_ok=True)
    async with aiofiles.open(os.path.join(dir_path, filename), "wb") as f:
        await f.write(content)
    return f"/static/products/events/{filename}"


# ── Routes ────────────────────────────────────────────────────

@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def create_event(
    title: str = Form(..., min_length=3, max_length=200),
    description: str = Form(..., min_length=10),
    register_url: str = Form(...),
    event_date: Optional[str] = Form(default=None),
    is_active: bool = Form(default=True),
    image: Optional[UploadFile] = File(default=None),
    admin=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    image_url = None
    if image and image.filename:
        image_url = await _save_event_image(image, uuid.uuid4())

    parsed_date = None
    if event_date:
        try:
            parsed_date = datetime.fromisoformat(event_date.replace("Z", "+00:00"))
        except ValueError:
            pass

    event = Event(
        title=title,
        description=description,
        image_url=image_url,
        register_url=register_url,
        event_date=parsed_date,
        is_active=is_active,
        created_by=admin.user_id,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


@router.get("", response_model=List[EventOut])
async def list_events(
    active_only: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
):
    q = select(Event).order_by(Event.created_at.desc())
    if active_only:
        q = q.where(Event.is_active == True)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/{event_id}", response_model=EventOut)
async def get_event(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Event).where(Event.event_id == event_id))
    ev = result.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    return ev


@router.patch("/{event_id}", response_model=EventOut)
async def update_event(
    event_id: uuid.UUID,
    title: Optional[str] = Form(default=None),
    description: Optional[str] = Form(default=None),
    register_url: Optional[str] = Form(default=None),
    event_date: Optional[str] = Form(default=None),
    is_active: Optional[bool] = Form(default=None),
    image: Optional[UploadFile] = File(default=None),
    _=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Event).where(Event.event_id == event_id))
    ev = result.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")

    if title is not None:
        ev.title = title
    if description is not None:
        ev.description = description
    if register_url is not None:
        ev.register_url = register_url
    if is_active is not None:
        ev.is_active = is_active
    if event_date is not None:
        try:
            ev.event_date = datetime.fromisoformat(event_date.replace("Z", "+00:00"))
        except ValueError:
            pass
    if image and image.filename:
        ev.image_url = await _save_event_image(image, event_id)

    ev.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(ev)
    return ev


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: uuid.UUID,
    _=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Event).where(Event.event_id == event_id))
    ev = result.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    await db.delete(ev)
    await db.commit()
