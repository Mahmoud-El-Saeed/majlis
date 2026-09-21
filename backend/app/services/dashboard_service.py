from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enrollment import EnrollmentStatus
from app.models.user import User
from app.repositories.course_repository import course_repository
from app.repositories.enrollment_repository import enrollment_repository
from app.repositories.lesson_repository import lesson_repository
from app.schemas.courses import to_course_out
from app.schemas.dashboard import DashboardItem, DashboardOut
from app.schemas.enrollments import to_enrollment_out
from app.services.course_service import can_write, list_courses


async def get_dashboard(db: AsyncSession, user: User) -> DashboardOut:
    """Single-call student dashboard (ticket 06).

    Merges the approved/owned course list with the caller's pending /
    rejected / blocked enrollments so one request renders course cards plus
    the waiting state. Lesson counts are included only for content-visible
    rows (owner/admin/approved); other rows report 0 to avoid leaking.
    """
    accessible = await list_courses(db, user)
    my_rows = await enrollment_repository.list_for_user(db, user.id)
    by_course_id = {str(r.course_id): r for r in my_rows}
    counts = await lesson_repository.counts_for_courses(db, [c.id for c in accessible])

    items: list[DashboardItem] = []
    seen: set[str] = set()

    for course in accessible:
        cid = str(course.id)
        seen.add(cid)
        row = by_course_id.get(cid)
        lesson_counts = counts.get(cid, {"total": 0, "ready": 0})
        if can_write(user, course):
            status = "owner" if course.created_by == user.id else "admin"
            enrollment_out = to_enrollment_out(row) if row else None
            lesson_count = lesson_counts["total"]
        else:
            status = row.status.value if row is not None else EnrollmentStatus.approved.value
            enrollment_out = to_enrollment_out(row) if row else None
            # Approved students see ready counts only: draft (non-ready)
            # lessons are not content and must not leak via totals.
            lesson_count = lesson_counts["ready"]
        items.append(
            DashboardItem(
                course=to_course_out(course),
                enrollment_status=status,
                enrollment=enrollment_out,
                lesson_count=lesson_count,
                ready_count=lesson_counts["ready"],
            )
        )

    # Pending/rejected/blocked courses the course list omits: show the
    # waiting state without lesson content (one batched fetch, not N).
    pending_rows = [r for r in my_rows if str(r.course_id) not in seen]
    pending_courses = {
        str(c.id): c
        for c in await course_repository.list_by_ids(db, [r.course_id for r in pending_rows])
    }
    for row in pending_rows:
        cid = str(row.course_id)
        course = pending_courses.get(cid)
        if course is None:
            continue
        seen.add(cid)
        items.append(
            DashboardItem(
                course=to_course_out(course),
                enrollment_status=row.status.value,
                enrollment=to_enrollment_out(row),
                lesson_count=0,
                ready_count=0,
            )
        )

    return DashboardOut(items=items)
