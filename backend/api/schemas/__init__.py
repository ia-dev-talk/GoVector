"""
API Schemas
Pydantic models for request/response validation
"""
from backend.api.schemas.technicians import (
	TechnicianBase,
	TechnicianCreate,
	TechnicianUpdate,
	TechnicianLocationUpdate,
	TechnicianStatusUpdate,
	TechnicianResponse,
	TechnicianWorkload,
	MessageResponse
)

from backend.api.schemas.jobs import (
	JobBase,
	JobCreate,
	JobUpdate,
	JobStatusUpdate,
	JobResponse,
	JobSummary,
	CanDoResult,
    TechFieldData,
    TechFieldResponse,
    JobStatusTransition,
    JobFailureCreate,
    JobPostponementCreate,
    JobActivityLogResponse,
)

from backend.api.schemas.assignments import (
	AssignmentCreate,
	AssignmentResponse,
	UnassignRequest,
	ReassignRequest,
	BatchAssignRequest,
	BatchUnassignRequest,
	BatchResult,
)

from backend.api.schemas.routing import (
	AutoRouteRequest,
	AutoRouteResponse,
	BestTechResponse
)

from backend.api.schemas.orienteurs import (
	OrienteurCreate,
	OrienteurUpdate,
	OrienteurResponse,
	OrienteurListResponse,
	OrienteurSectorCreate,
	OrienteurSectorResponse,
	TechnicianBrief,
)

__all__ = [
	# Technician schemas
	"TechnicianBase",
	"TechnicianCreate",
	"TechnicianUpdate",
	"TechnicianLocationUpdate",
	"TechnicianStatusUpdate",
	"TechnicianResponse",
	"TechnicianWorkload",
	# Job schemas
	"JobBase",
	"JobCreate",
	"JobUpdate",
	"JobStatusUpdate",
	"JobResponse",
	"JobSummary",
	"CanDoResult",
	# Assignment schemas
	"AssignmentCreate",
	"AssignmentResponse",
	"UnassignRequest",
	"ReassignRequest",
	"BatchAssignRequest",
	"BatchUnassignRequest",
	"BatchResult",
	# Routing schemas
	"AutoRouteRequest",
	"AutoRouteResponse",
	"BestTechResponse",
	# Orienteur schemas
	"OrienteurCreate",
	"OrienteurUpdate",
	"OrienteurResponse",
	"OrienteurListResponse",
	"OrienteurSectorCreate",
	"OrienteurSectorResponse",
	"TechnicianBrief",
	# Technician Field schemas
	"TechFieldData",
	"TechFieldResponse",
	# Common
	"MessageResponse",
]