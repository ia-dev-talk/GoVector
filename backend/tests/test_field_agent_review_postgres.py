"""Real PostgreSQL contract for technician handoff and Agent terrain review."""

import asyncio
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.database.models import (
    Assignment,
    Base,
    FieldTeam,
    Job,
    JobStatus,
    JobType,
    JobVisit,
    Orienteur,
    StockConsumption,
    StockItem,
    StockMovement,
    Technician,
    TechnicianFieldAction,
    User,
    UserRole,
)
from backend.logic.field_agent_access import require_field_agent_team_job
from backend.logic.field_agent_review import FieldAgentReviewWorkflowEngine
from backend.logic import jobs as job_logic
from backend.logic.job_visits import sync_job_visit_transition
from backend.logic.technician_jobs import TechnicianJobMutationError
from backend.logic.workflow.engine import WorkflowEngine
from backend.tests.test_technician_field_stock_postgres_contract import (
    _admin_url,
    _create_database,
    _database_url,
    _drop_database,
    _sqlalchemy_url,
)


async def _exercise(database_url: str) -> dict:
    engine = create_async_engine(_sqlalchemy_url(database_url))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        async with factory() as db:
            owner = Orienteur(name="Agent review owner")
            db.add(owner)
            await db.flush()

            team = FieldTeam(name="Agent review team", orienteur_id=owner.id)
            db.add(team)
            await db.flush()

            technician = Technician(
                name="Tech review",
                employee_id="FIELD-REVIEW",
                home_latitude=33.58,
                home_longitude=-7.62,
                skills=[],
                assigned_routes=[],
                skill_bonuses={},
                team_id=team.id,
                orienteur_id=owner.id,
            )
            db.add(technician)
            await db.flush()

            technician_user = User(
                username="field-review-tech",
                email="field-review-tech@example.invalid",
                password_hash="not-used",
                role=UserRole.TECHNICIAN,
                is_active=True,
                technician_id=technician.id,
            )
            agent = User(
                username="field-review-agent",
                email="field-review-agent@example.invalid",
                password_hash="not-used",
                role=UserRole.CHEF_ORIENTEUR,
                is_active=True,
                orienteur_id=owner.id,
            )
            office = User(
                username="field-review-office",
                email="field-review-office@example.invalid",
                password_hash="not-used",
                role=UserRole.ORIENTEUR,
                is_active=True,
                orienteur_id=owner.id,
            )
            cable = StockItem(
                reference="FO64-AGENT-TEST",
                label="Câble FO64 Agent test",
                equipment_type="CABLE_FTTH",
                operator="ORANGE",
                unit="m",
                is_active=True,
            )
            db.add_all([technician_user, agent, office, cable])
            await db.flush()

            job = Job(
                job_number="FIELD-AGENT-REVIEW",
                job_type=JobType.INSTALLATION,
                status=JobStatus.IN_PROGRESS,
                customer_name="Client review",
                route_criteria="CAS-REVIEW",
                operator="ORANGE",
                required_skills=[],
                cable_length_m=92,
            )
            db.add(job)
            await db.flush()

            assignment = Assignment(job_id=job.id, technician_id=technician.id)
            db.add(assignment)
            await db.flush()

            now = datetime.now(timezone.utc)
            visit = JobVisit(
                job_id=job.id,
                attempt_number=1,
                primary_technician_id=technician.id,
                status=JobStatus.IN_PROGRESS.value,
                assigned_at=assignment.assigned_at or now,
                work_started_at=now,
            )
            db.add(visit)
            await db.flush()
            assignment.visit_id = visit.id

            # Immutable field history contains the original 100 m observation
            # and a later correction to 92 m for the same logical segment.
            db.add_all(
                [
                    TechnicianFieldAction(
                        event_id=str(uuid4()),
                        user_id=technician_user.id,
                        technician_id=technician.id,
                        job_id=job.id,
                        visit_id=visit.id,
                        action_type="cable_exit",
                        payload={
                            "cable_segment_id": "SEG-AGENT",
                            "cable_item_id": cable.id,
                            "cable_reference": cable.reference,
                            "cable_type_code": cable.reference,
                            "installation_mode_code": "CONDUITE_PEHD",
                            "computed_length_m": 100,
                        },
                        occurred_at=now,
                    ),
                    TechnicianFieldAction(
                        event_id=str(uuid4()),
                        user_id=technician_user.id,
                        technician_id=technician.id,
                        job_id=job.id,
                        visit_id=visit.id,
                        action_type="cable_exit",
                        payload={
                            "cable_segment_id": "SEG-AGENT",
                            "cable_item_id": cable.id,
                            "cable_reference": cable.reference,
                            "cable_type_code": cable.reference,
                            "installation_mode_code": "CONDUITE_PEHD",
                            "computed_length_m": 92,
                        },
                        occurred_at=now + timedelta(seconds=1),
                    ),
                ]
            )
            await db.commit()

            # Technician handoff: awaiting validation must keep the assignment
            # and visit open so the owning Agent can still review the dossier.
            job.status = JobStatus.EN_ATTENTE_VALIDATION
            job.validation_status = "TECHNICIAN_SUBMITTED"
            await sync_job_visit_transition(
                db,
                job=job,
                old_status=JobStatus.IN_PROGRESS,
                new_status=JobStatus.EN_ATTENTE_VALIDATION,
                technician_id=technician.id,
                metadata={"extra": {"source": "technician_submission"}},
            )
            await db.commit()
            await db.refresh(assignment)
            await db.refresh(visit)

            awaiting_assignment_open = assignment.ended_at is None
            awaiting_visit_open = visit.ended_at is None
            awaiting_completion_recorded = assignment.actual_completion is not None
            owned_while_awaiting = await require_field_agent_team_job(
                db,
                job_id=job.id,
                current_user=agent,
            )

            # Agent return: same passage resumes and remains assigned to the
            # technician; the dedicated engine is the only place where this
            # delivery-specific rework transition is enabled.
            review_engine = FieldAgentReviewWorkflowEngine(db)
            await review_engine.transition_job(
                job,
                JobStatus.IN_PROGRESS,
                technician_id=technician.id,
                metadata={
                    "extra": {
                        "source": "field_agent_return",
                        "reason": "Photo arrivée illisible",
                        "field_agent_user_id": agent.id,
                    }
                },
                broadcast=False,
            )
            await db.commit()
            await db.refresh(assignment)
            await db.refresh(visit)

            return_status = job.status
            return_assignment_open = assignment.ended_at is None
            return_visit_open = visit.ended_at is None

            # Technician resubmits. Stock is still preview-only here.
            job.status = JobStatus.EN_ATTENTE_VALIDATION
            job.validation_status = "TECHNICIAN_SUBMITTED"
            await sync_job_visit_transition(
                db,
                job=job,
                old_status=JobStatus.IN_PROGRESS,
                new_status=JobStatus.EN_ATTENTE_VALIDATION,
                technician_id=technician.id,
                metadata={"extra": {"source": "technician_resubmission"}},
            )
            await db.flush()
            pre_final_movements = await db.scalar(
                select(func.count(StockMovement.id)).where(
                    StockMovement.job_id == job.id,
                    StockMovement.technician_id == technician.id,
                )
            )

            # The Agent only marks the dossier as reviewed; it stays open and
            # keeps its assignment until the office Orienteur validates it.
            from backend.api.routes.orienteur_agent import submit_my_team_job_to_office

            agent_result = await submit_my_team_job_to_office(
                job_id=job.id,
                db=db,
                current_user=agent,
            )
            await db.refresh(job)
            await db.refresh(assignment)
            agent_submit_status = job.status.value
            agent_validation_marker = job.validation_status
            assignment_open_after_agent = assignment.ended_at is None

            await job_logic.complete_job(
                db,
                job.id,
                validated_by_user_id=office.id,
            )
            await db.refresh(assignment)
            await db.refresh(visit)

            movements = (
                await db.execute(
                    select(StockMovement)
                    .where(
                        StockMovement.job_id == job.id,
                        StockMovement.technician_id == technician.id,
                        StockMovement.item_id == cable.id,
                    )
                    .order_by(StockMovement.id.asc())
                )
            ).scalars().all()
            consumption_count = await db.scalar(
                select(func.count(StockConsumption.id)).where(
                    StockConsumption.job_id == job.id,
                    StockConsumption.technician_id == technician.id,
                )
            )

            denied_after_close = None
            try:
                await require_field_agent_team_job(
                    db,
                    job_id=job.id,
                    current_user=agent,
                )
            except TechnicianJobMutationError as exc:
                denied_after_close = exc.code

            return {
                "awaiting_assignment_open": awaiting_assignment_open,
                "awaiting_visit_open": awaiting_visit_open,
                "awaiting_completion_recorded": awaiting_completion_recorded,
                "owned_while_awaiting": owned_while_awaiting.job.id == job.id,
                "return_status": return_status.value,
                "return_assignment_open": return_assignment_open,
                "return_visit_open": return_visit_open,
                "pre_final_movements": pre_final_movements,
                "agent_decision": agent_result["decision"],
                "agent_submit_status": agent_submit_status,
                "agent_validation_marker": agent_validation_marker,
                "assignment_open_after_agent": assignment_open_after_agent,
                "final_status": job.status.value,
                "final_assignment_closed": assignment.ended_at is not None,
                "final_visit_closed": visit.ended_at is not None,
                "movement_quantities": [row.quantity for row in movements],
                "movement_authors": [row.created_by for row in movements],
                "consumption_count": consumption_count,
                "denied_after_close": denied_after_close,
            }
    finally:
        await engine.dispose()


def test_technician_handoff_agent_return_and_final_close_share_one_passage():
    admin_url = _admin_url()
    database_name = f"bluevector_agent_review_{uuid4().hex}"
    asyncio.run(_create_database(admin_url, database_name))
    database_url = _database_url(admin_url, database_name)
    try:
        result = asyncio.run(_exercise(database_url))
    finally:
        asyncio.run(_drop_database(admin_url, database_name))

    assert result["awaiting_assignment_open"] is True
    assert result["awaiting_visit_open"] is True
    assert result["awaiting_completion_recorded"] is True
    assert result["owned_while_awaiting"] is True
    assert result["return_status"] == JobStatus.IN_PROGRESS.value
    assert result["return_assignment_open"] is True
    assert result["return_visit_open"] is True
    assert result["pre_final_movements"] == 0
    assert result["agent_decision"] == "submitted_to_office"
    assert result["agent_submit_status"] == JobStatus.EN_ATTENTE_VALIDATION.value
    assert result["agent_validation_marker"] == "FIELD_AGENT_VERIFIED"
    assert result["assignment_open_after_agent"] is True
    assert result["final_status"] == JobStatus.COMPLETED.value
    assert result["final_assignment_closed"] is True
    assert result["final_visit_closed"] is True
    assert result["movement_quantities"] == [-92]
    assert len(result["movement_authors"]) == 1
    assert result["movement_authors"][0] is not None
    assert result["consumption_count"] == 1
    assert result["denied_after_close"] == "field_agent_team_forbidden"
