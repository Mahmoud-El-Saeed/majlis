from pydantic import BaseModel

from app.schemas.courses import CourseOut
from app.schemas.enrollments import EnrollmentOut


class DashboardItem(BaseModel):
    """One dashboard card: the course, how I relate to it, and lesson counts.

    enrollment_status is one of: owner (I teach it), admin (admin view),
    approved, pending, rejected, blocked. Lesson counts are 0 for non-approved
    rows so pending students see a waiting state without content leaks.
    For approved students lesson_count == ready_count (draft lessons are
    hidden); owners/admins see true totals.
    """

    course: CourseOut
    enrollment_status: str
    enrollment: EnrollmentOut | None = None
    lesson_count: int = 0
    ready_count: int = 0


class DashboardOut(BaseModel):
    items: list[DashboardItem]
