import math
from datetime import datetime
from typing import List, Dict, Any, Optional
from backend.database.models import Job, JobPriority, Technician, TechnicianStatus

class DispatchScoringEngine:
    def __init__(self, base_speed_kmh: float = 40.0):
        """
        Initializes the scoring engine with a default urban driving speed.
        """
        self.base_speed_kmh = base_speed_kmh

    @staticmethod
    def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """
        Calculates the great-circle distance between two points in kilometers.
        """
        R = 6371.0  # Earth's radius in kilometers

        d_lat = math.radians(lat2 - lat1)
        d_lon = math.radians(lon2 - lon1)

        a = (math.sin(d_lat / 2) ** 2 +
             math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

        return R * c

    def estimate_travel_time_minutes(self, distance_km: float, tech: Technician) -> int:
        """
        Estimates travel time accounting for the technician's unique speed multiplier.
        """
        speed = self.base_speed_kmh * getattr(tech, "speed_factor", 1.0)
        if speed <= 0:
            speed = self.base_speed_kmh

        hours = distance_km / speed
        return max(1, int(hours * 60))

    def compute_skill_match(self, tech: Technician, job: Job) -> float:
        """
        Returns a modifier based on skill compatibility.
        Returns 0.0 if the technician lacks absolute prerequisites.
        """
        tech_skills = set(tech.skills if tech.skills else [])
        required_skills = set(job.required_skills if job.required_skills else [])

        if required_skills and not required_skills.issubset(tech_skills):
            return 0.0  # Incompatible: Lacks required skills

        # Calculate a competency bonus if applicable
        bonus = 1.0
        if hasattr(tech, "skill_bonuses") and tech.skill_bonuses:
            for skill in required_skills:
                bonus += tech.skill_bonuses.get(skill, 0.0)

        return bonus

    def score_assignment(self, tech: Technician, job: Job) -> Dict[str, Any]:
        """
        Scores a potential technician-to-job pairing.
        Higher score = Better Match. Returns score <= 0 if completely invalid.
        """
        # 1. Quick Status Check
        if tech.status == TechnicianStatus.OFF_DUTY or not tech.is_active:
            return {"score": 0.0, "distance_km": 0.0, "travel_time_min": 0, "feasible": False}

        # 2. Skill Validation
        skill_modifier = self.compute_skill_match(tech, job)
        if skill_modifier == 0.0:
            return {"score": 0.0, "distance_km": 0.0, "travel_time_min": 0, "feasible": False}

        # 3. Location & Distance Tracking
        # Fallback to technician's home base coordinates if their live GPS tracking is missing
        tech_lat = tech.current_latitude if tech.current_latitude is not None else tech.home_latitude
        tech_lon = tech.current_longitude if tech.current_longitude is not None else tech.home_longitude

        distance_km = self.calculate_haversine_distance(tech_lat, tech_lon, job.latitude, job.longitude)
        travel_time_min = self.estimate_travel_time_minutes(distance_km, tech)

        # 4. Core Weights Calculation
        # Distance Penalty (Closer is significantly better)
        distance_score = max(0.0, 100.0 - (distance_km * 2.5))

        # Priority Bonus Weights
        priority_bonuses = {
            JobPriority.URGENT: 150.0,
            JobPriority.HAUTE: 80.0,
            JobPriority.NORMALE: 20.0,
            JobPriority.FAIBLE: 0.0
        }
        priority_score = priority_bonuses.get(job.priority, 20.0)

        # 5. Aggregate final composite score
        final_score = (distance_score + priority_score) * skill_modifier

        return {
            "score": round(final_score, 2),
            "distance_km": round(distance_km, 2),
            "travel_time_min": travel_time_min,
            "feasible": True
        }

    def find_best_technician(self, job: Job, technicians: List[Technician]) -> Optional[Dict[str, Any]]:
        """
        Iterates over all candidate technicians to find the top scoring candidate.
        """
        best_candidate = None
        highest_score = -1.0

        for tech in technicians:
            metrics = self.score_assignment(tech, job)
            if metrics["feasible"] and metrics["score"] > highest_score:
                highest_score = metrics["score"]
                best_candidate = {
                    "technician": tech,
                    "technician_id": tech.id,
                    "metrics": metrics
                }

        return best_candidate
