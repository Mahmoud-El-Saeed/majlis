from fastapi import APIRouter

from app.api.v1.endpoints import (
    attachments,
    attempts,
    auth,
    courses,
    dashboard,
    enrollments,
    exams,
    invites,
    lesson_media,
    lessons,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(invites.router)
api_router.include_router(dashboard.router)
api_router.include_router(courses.router)
api_router.include_router(lessons.router)
api_router.include_router(lesson_media.router)
api_router.include_router(attachments.router)
api_router.include_router(enrollments.router)
api_router.include_router(exams.router)
api_router.include_router(attempts.router)
