from fastapi import APIRouter

from app.api.dependencies import CurrentUserDep, DbDep
from app.schemas.dashboard import DashboardOut
from app.services import dashboard_service

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardOut)
async def get_dashboard(db: DbDep, user: CurrentUserDep) -> DashboardOut:
    """Student dashboard in one call: my courses with enrollment status and
    lesson counts, plus pending rows for the waiting state. Usable any time
    (the Join-with-code box posts to /enrollments/join separately)."""
    return await dashboard_service.get_dashboard(db, user)
