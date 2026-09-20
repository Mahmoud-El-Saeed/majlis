import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.user import Role, User
from app.repositories.course_repository import course_repository
from app.repositories.user_repository import user_repository
from app.schemas.courses import CourseCreateIn, CourseUpdateIn


class CourseError(Exception):
    def __init__(self, message: str):
        self.message = message


class CourseNotFound(CourseError):
    pass


class CourseForbidden(CourseError):
    pass


def can_write(user: User, course: Course) -> bool:
    """Admin passes every gate; otherwise only the owner-teacher."""
    if user.role == Role.admin:
        return True
    return course.created_by is not None and course.created_by == user.id


async def create_course(db: AsyncSession, actor: User, data: CourseCreateIn) -> Course:
    owner_id: uuid.UUID | None = actor.id
    if actor.role == Role.admin and data.owner_id is not None:
        owner = await user_repository.get_by_id(db, str(data.owner_id))
        if owner is None:
            raise CourseError("Owner account not found.")
        owner_id = owner.id
    course = Course(
        title=data.title.strip(),
        description=data.description,
        book_title=data.book_title,
        organization_id=data.organization_id,
        created_by=owner_id,
    )
    return await course_repository.save(db, course)


async def list_courses(db: AsyncSession) -> list[Course]:
    return await course_repository.list_all(db)


async def get_course(db: AsyncSession, course_id: str) -> Course:
    course = await course_repository.get_by_id(db, course_id)
    if course is None:
        raise CourseNotFound("Course not found.")
    return course


async def update_course(
    db: AsyncSession, actor: User, course_id: str, data: CourseUpdateIn
) -> Course:
    course = await get_course(db, course_id)
    if not can_write(actor, course):
        raise CourseForbidden("Not authorized.")
    if data.title is not None:
        course.title = data.title.strip()
    if data.description is not None:
        course.description = data.description
    if data.book_title is not None:
        course.book_title = data.book_title
    if data.organization_id is not None:
        course.organization_id = data.organization_id
    await db.flush()
    await db.refresh(course)
    return course


async def delete_course(db: AsyncSession, actor: User, course_id: str) -> None:
    course = await get_course(db, course_id)
    if not can_write(actor, course):
        raise CourseForbidden("Not authorized.")
    await course_repository.delete(db, course)
