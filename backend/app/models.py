"""React API contract. Reject unexpected fields and coercion at the boundary."""

from typing import Annotated, Literal, Union
from pydantic import BaseModel, ConfigDict, Field

Id = Annotated[str, Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")]
Name = Annotated[str, Field(min_length=1, max_length=50)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Login(StrictModel):
    id: Annotated[str, Field(min_length=1, max_length=128)]
    password: Annotated[str, Field(min_length=1, max_length=256)]


class Row(StrictModel):
    id: Id
    date: Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$")]
    start: Annotated[str, Field(pattern=r"^(?:[01]\d|2[0-3]):(?:00|15|30|45)$")]
    end: Annotated[str, Field(pattern=r"^(?:[01]\d|2[0-3]):(?:00|15|30|45)$")]
    floorId: Id
    note: Annotated[str, Field(max_length=500)] = ""


class ShiftInput(Row):
    employeeId: Id


class Floor(StrictModel):
    id: Id
    name: Name
    color: Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]


class Employee(StrictModel):
    id: Id
    name: Name
    floorIds: Annotated[list[Id], Field(max_length=100)]


class CommandBase(StrictModel):
    period: Annotated[str, Field(pattern=r"^\d{4}-\d{2}-(?:01|16)$")]
    expectedRevision: Annotated[int, Field(ge=0)]


class SaveDraft(CommandBase):
    type: Literal["saveDraft"]
    rows: Annotated[list[Row], Field(max_length=500)]
    note: Annotated[str, Field(max_length=1000)] = ""


class Submit(CommandBase):
    type: Literal["submit"]
    acknowledgeOverlap: bool = False


class SaveShift(CommandBase):
    type: Literal["saveShift"]
    shift: ShiftInput
    acknowledgeOverlap: bool = False


class DeleteShift(CommandBase):
    type: Literal["deleteShift"]
    id: Id


class SetStatus(CommandBase):
    type: Literal["setStatus"]
    ids: Annotated[list[Id], Field(min_length=1, max_length=5000)]
    status: Literal["pending", "confirmed", "declined"]


class SetDeadline(CommandBase):
    type: Literal["setDeadline"]
    deadline: Annotated[str, Field(min_length=1, max_length=50)]


class SaveFloor(CommandBase):
    type: Literal["saveFloor"]
    floor: Floor


class SaveEmployee(CommandBase):
    type: Literal["saveEmployee"]
    employee: Employee


Command = Annotated[
    Union[
        SaveDraft,
        Submit,
        SaveShift,
        DeleteShift,
        SetStatus,
        SetDeadline,
        SaveFloor,
        SaveEmployee,
    ],
    Field(discriminator="type"),
]
