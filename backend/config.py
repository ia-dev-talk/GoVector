"""
Magellan Configuration
Manages environment variables and application settings
"""
import os
from pathlib import Path
from typing import Optional
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
	"""Application settings loaded from environment variables"""

	# Application
	APP_NAME: str = "Magellan"
	APP_VERSION: str = "0.0.8"
	DEBUG: bool = True
	ENVIRONMENT: str = "development"
	IS_DEMO: bool = False  # Enable simulation engine and /simulation/* endpoints

	# Database - PostgreSQL
	DATABASE_URL: str = "postgresql://fieldopt:fieldopt@localhost:5432/fieldopt"
	DATABASE_ECHO: bool = False  # Set to True to see SQL queries in console

	# API
	API_HOST: str = "0.0.0.0"
	API_PORT: int = 8000
	API_RELOAD: bool = True
	API_V1_PREFIX: str = "/api/v1"
	TECHNICIAN_MEDIA_ROOT: str = "uploads/technician_media"
	TECHNICIAN_PHOTO_MAX_BYTES: int = 25 * 1024 * 1024
	TECHNICIAN_DOCUMENT_MAX_BYTES: int = 50 * 1024 * 1024
	TECHNICIAN_VIDEO_MAX_BYTES: int = 250 * 1024 * 1024

	# JWT Authentication
	SECRET_KEY: str = "CHANGE_ME_SUPER_SECRET_KEY"
	ALGORITHM: str = "HS256"
	ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

	# CORS
	CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

	# Geocoding (Nominatim / OpenStreetMap)
	GEOCODING_ENABLED: bool = True
	NOMINATIM_URL: str = "https://nominatim.openstreetmap.org/search"
	GEOCODING_COUNTRY: str = "Morocco"
	GEOCODING_COUNTRY_CODE: str = "ma"
	GEOCODING_USER_AGENT: str = "Magellan-FTTH/1.0"
	GEOCODING_TIMEOUT: float = 10.0
	GEOCODING_DELAY_SECONDS: float = 0.05

	# Excel import
	IMPORT_BATCH_SIZE: int = 100

	# Routing Constants
	DEFAULT_TRAVEL_SPEED_MPH: float = 30.0  # Average speed for travel time calculations
	MAX_JOBS_PER_TECH: int = 8  # Maximum jobs per technician per day
	WORK_DAY_START_HOUR: int = 8  # 8 AM
	WORK_DAY_END_HOUR: int = 21  # 9 PM

	# Job Duration Estimates (in minutes)
	DEFAULT_JOB_DURATION: int = 60
	INSTALL_DURATION: int = 90
	REPAIR_DURATION: int = 45
	MAINTENANCE_DURATION: int = 30
	INSPECTION_DURATION: int = 30

	# Distance Calculation
	MILES_PER_DEGREE_LAT: float = 69.0  # Approximate miles per degree latitude
	MILES_PER_DEGREE_LON: float = 54.6  # Approximate miles per degree longitude (at 40° latitude)

	class Config:
		env_file = ".env"
		case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
	"""Get cached settings instance"""
	return Settings()
