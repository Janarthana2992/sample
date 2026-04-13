from datetime import datetime, timezone
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.models.product import Review, ReviewReply
from app.schemas.review import PaginatedReviews, ReviewCreate, ReviewOut, ReviewUpdate, ReviewReplyCreate, ReviewReplyOut
from app.services.product_service import refresh_product_rating
from app.utils.rbac import get_current_user, require_roles, require_permission

router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.post("", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
async def create_review(
    payload: ReviewCreate,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify user has a delivered/confirmed order containing this product
    purchase_check = await db.execute(
        text("""
            SELECT 1
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.order_id
            WHERE o.user_id = :user_id
              AND o.order_id = :order_id
              AND oi.product_id = :product_id
              AND o.status IN ('delivered')
            LIMIT 1
        """),
        {
            "user_id": user.user_id,
            "order_id": payload.order_id,
            "product_id": payload.product_id,
        }
    )
    if not purchase_check.fetchone():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only review products you have ordered"
        )

    # One review per product-order combo
    existing = await db.execute(
        select(Review).where(
            Review.product_id == payload.product_id,
            Review.user_id == user.user_id,
            Review.order_id == payload.order_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Review already submitted for this order")

    review = Review(
        product_id=payload.product_id,
        user_id=user.user_id,
        order_id=payload.order_id,
        rating=payload.rating,
        review_text=payload.review_text,
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)
    await refresh_product_rating(db, payload.product_id)
    await db.commit()
    return review


@router.get("", response_model=PaginatedReviews)
async def list_reviews(
    product_id: Optional[uuid.UUID] = Query(default=None),
    min_rating: Optional[int] = Query(default=None, ge=1, le=5),
    has_reply: Optional[bool] = Query(default=None),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    q = select(Review).options(selectinload(Review.reply))
    if product_id:
        q = q.where(Review.product_id == product_id)
    if min_rating:
        q = q.where(Review.rating >= min_rating)

    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar()

    q = q.order_by(Review.created_at.desc()).offset((page - 1) * size).limit(size)
    items = (await db.execute(q)).scalars().all()
    return PaginatedReviews(items=items, total=total, page=page, size=size)


@router.post("/{review_id}/reply", response_model=ReviewReplyOut, status_code=status.HTTP_201_CREATED)
async def reply_to_review(
    review_id: uuid.UUID,
    payload: ReviewReplyCreate,
    user=Depends(require_permission("reply_reviews")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Review).where(Review.review_id == review_id).options(selectinload(Review.reply)))
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    if review.reply and not review.reply.is_retracted:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Reply already exists")

    if review.reply:
        # Reopen retracted reply
        review.reply.reply_text = payload.reply_text
        review.reply.is_retracted = False
        review.reply.replied_by = user.user_id
        review.reply.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(review.reply)
        return review.reply

    reply = ReviewReply(
        review_id=review_id,
        replied_by=user.user_id,
        reply_text=payload.reply_text,
    )
    db.add(reply)
    await db.commit()
    await db.refresh(reply)
    return reply


@router.patch("/{review_id}/reply", response_model=ReviewReplyOut)
async def edit_reply(
    review_id: uuid.UUID,
    payload: ReviewReplyCreate,
    user=Depends(require_permission("reply_reviews")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ReviewReply).where(ReviewReply.review_id == review_id)
    )
    reply = result.scalar_one_or_none()
    if not reply:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No reply found")
    reply.reply_text = payload.reply_text
    reply.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(reply)
    return reply


@router.delete("/{review_id}/reply", status_code=status.HTTP_204_NO_CONTENT)
async def retract_reply(
    review_id: uuid.UUID,
    user=Depends(require_permission("reply_reviews")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ReviewReply).where(ReviewReply.review_id == review_id))
    reply = result.scalar_one_or_none()
    if not reply:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No reply found")
    reply.is_retracted = True
    reply.updated_at = datetime.now(timezone.utc)
    await db.commit()


@router.patch("/{review_id}", response_model=ReviewOut)
async def update_review(
    review_id: uuid.UUID,
    payload: ReviewUpdate,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Review).where(Review.review_id == review_id).options(selectinload(Review.reply))
    )
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    if review.user_id != user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only edit your own reviews")
    if payload.rating is not None:
        review.rating = payload.rating
    if payload.review_text is not None:
        review.review_text = payload.review_text
    review.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(review)
    await refresh_product_rating(db, review.product_id)
    await db.commit()
    return review


@router.delete("/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review(
    review_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Review).where(Review.review_id == review_id))
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    # Admin can delete any; customer can only delete their own
    if user.role != "admin" and review.user_id != user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    product_id = review.product_id
    await db.delete(review)
    await db.commit()
    await refresh_product_rating(db, product_id)
    await db.commit()
