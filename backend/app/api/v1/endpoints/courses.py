from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import CurrentUserDep, DbDep, require_roles
from app.models.user import Role, User
from app.schemas.courses import CourseCreateIn, CourseOut, CourseUpdateIn, to_course_out
from app.services import course_service
from app.services.course_service import CourseError, CourseForbidden, CourseNotFound

router = APIRouter(prefix="/courses", tags=["courses"])

TeacherWriteDep = Annotated[User, Depends(require_roles(Role.admin, Role.teacher))]


@router.post("", status_code=status.HTTP_201_CREATED, response_model=CourseOut)
async def create_course(db: DbDep, actor: TeacherWriteDep, data: CourseCreateIn) -> CourseOut:
    try:
        course = await course_service.create_course(db, actor, data)
    except CourseError as e:
        raise HTTPException(status_code=400, detail=e.message) from None
    return to_course_out(course)


@router.get("", response_model=list[CourseOut])
async def list_courses(db: DbDep, _user: CurrentUserDep) -> list[CourseOut]:
    # Permissive reads until ticket 04 wires the approved-enrollment gate.
    courses = await course_service.list_courses(db)
    return [to_course_out(c) for c in courses]


@router.get("/{course_id}", response_model=CourseOut)
async def get_course(db: DbDep, _user: CurrentUserDep, course_id: str) -> CourseOut:
    try:
        course = await course_service.get_course(db, course_id)
    except CourseNotFound as e:
        raise HTTPException(status_code=404, detail=e.message) from None
    return to_course_out(course)


@router.put("/{course_id}", response_model=CourseOut)
async def update_course(
    db: DbDep, user: CurrentUserDep, course_id: str, data: CourseUpdateIn
) -> CourseOut:
    try:
        course = await course_service.update_course(db, user, course_id, data)
    except CourseNotFound as e:
        raise HTTPException(status_code=404, detail=e.message) from None
    except CourseForbidden as e:
        raise HTTPException(status_code=403, detail=e.message) from None
    except CourseError as e:
        raise HTTPException(status_code=400, detail=e.message) from None
    return to_course_out(course)


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(db: DbDep, user: CurrentUserDep, course_id: str) -> None:
    try:
        await course_service.delete_course(db, user, course_id)
    except CourseNotFound as e:
        raise HTTPException(status_code=404, detail=e.message) from None
    except CourseForbidden as e:
        raise HTTPException(status_code=403, detail=e.message) from None
    except CourseError as e:
        raise HTTPException(status_code=400, detail=e.message) from None
