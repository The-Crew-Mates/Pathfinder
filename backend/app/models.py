import math
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, EmailStr, Field, field_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Register(Input):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=12, max_length=128)

    # Global string trimming must never alter passwords.
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value):
        if not value.strip():
            raise ValueError("Name cannot be blank")
        return value.strip()


class Login(Input):
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=1, max_length=128)
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)


class ContactCreate(Input):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr = Field(max_length=254)


class Consent(Input):
    token: str = Field(min_length=30, max_length=200)


class Route(Input):
    type: Literal["LineString"] = "LineString"
    coordinates: list[tuple[float, float]] = Field(min_length=2, max_length=5000)

    @field_validator("coordinates")
    @classmethod
    def valid_coordinates(cls, value):
        for lon, lat in value:
            if not math.isfinite(lon) or not math.isfinite(lat):
                raise ValueError("Coordinates must be finite")
            if not -180 <= lon <= 180 or not -90 <= lat <= 90:
                raise ValueError("Coordinates must be [longitude, latitude] in WGS84")
        return value


class TripCreate(Input):
    title: str = Field(min_length=1, max_length=120)
    route: Route
    notes: str = Field(default="", max_length=2000)
    expected_return_at: AwareDatetime
    grace_minutes: int = Field(default=15, ge=0, le=120, strict=True)
    contact_ids: list[str] = Field(min_length=1, max_length=5)

    @field_validator("contact_ids")
    @classmethod
    def unique_contacts(cls, value):
        if len(set(value)) != len(value):
            raise ValueError("Contact ids must be unique")
        return value


class Position(Input):
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    source: Literal["manual", "landmark", "gps_untrusted"]
    accuracy_m: float | None = Field(default=None, gt=0, le=100000, allow_inf_nan=False)


class CheckIn(Input):
    event_id: str = Field(min_length=8, max_length=128)
    kind: Literal["progress", "returned"]
    note: str = Field(default="", max_length=1000)
    position: Position | None = None
    recorded_at: AwareDatetime | None = None


class ReturnTimeUpdate(Input):
    expected_return_at: AwareDatetime
