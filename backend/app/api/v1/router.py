from fastapi import APIRouter

from app.api.v1.endpoints import auth, courses, invites, lessons

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(invites.router)
api_router.include_router(courses.router)
api_router.include_router(lessons.router)
