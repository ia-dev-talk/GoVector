"""
Seed database with Casablanca FTTH sample data for development and testing.
Techs are Moroccan technicians, jobs are FTTH interventions.

v0.2.0 — Complete rewrite for stability:
  - All passwords = "mdp123"
  - Usernames: admin, chef, wahid, rachid, driss, hicham
  - 20 techs with auto-created accounts
  - Fully idempotent (safe to re-run)
"""
import asyncio
from datetime import datetime, timedelta, timezone

from backend.database.connection import AsyncSessionLocal
from backend.database.models import (
    Technician, Job, Assignment, User, Sector,
    FieldTeam, FieldTeamSector,
    TechnicianStatus, JobStatus, JobPriority, JobType, UserRole
)
from backend.auth.security import get_password_hash
from sqlalchemy import select

# ─── SECTEURS ───────────────────────────────────────────────────────────────
SECTORS = [
    {"name": "Secteur Est", "color": "#1F497D", "description": "Secteur Est de Casablanca — Ain Sebaâ, Hay Hassani, Ain Diab"},
    {"name": "Secteur Centre", "color": "#C00000", "description": "Secteur Centre de Casablanca — Maârif, Gauthier, Bourgogne"},
    {"name": "Secteur Nord", "color": "#00B050", "description": "Secteur Nord de Casablanca — Anfa, Polo, Mers Sultan"},
    {"name": "Secteur Sud", "color": "#FFC000", "description": "Secteur Sud de Casablanca — Sidi Maârouf, Oasis, Val d'Anfa"},
]

# ─── ORIENTEURS ────────────────────────────────────────────────────────────
ORIENTEURS = [
    {"name": "Wahid Benali", "username": "wahid", "email": "wahid.benali@fieldopt.ma", "phone": "+212 661-111111", "sector_name": "Secteur Est"},
    {"name": "Rachid El Fassi", "username": "rachid", "email": "rachid.elfassi@fieldopt.ma", "phone": "+212 661-222222", "sector_name": "Secteur Centre"},
    {"name": "Driss El Omari", "username": "driss", "email": "driss.elomari@fieldopt.ma", "phone": "+212 661-333333", "sector_name": "Secteur Nord"},
    {"name": "Hicham Tazi", "username": "hicham", "email": "hicham.tazi@fieldopt.ma", "phone": "+212 661-444444", "sector_name": "Secteur Sud"},
]

# ─── TECHNICIENS ────────────────────────────────────────────────────────────
TECHNICIANS = [
    {"name": "Amine Benali","employee_id": "AB001","phone": "+212 661-123456","email": "amine.benali@fieldopt.ma","home_latitude": 33.5892,"home_longitude": -7.6031,"home_address": "Maârif, Casablanca","skills": ["install","repair","maintenance","service_change"],"assigned_routes": ["CAS-MAARIF","CAS-GAUTHIER"],"shift_start": "08:00","shift_end": "17:00","max_jobs_per_day": 10,"status": TechnicianStatus.AVAILABLE,"speed_factor": 0.85,"skill_bonuses": {"install": 0.90,"service_change": 0.95}, "orienteur_name": "Wahid Benali"},
    {"name": "Youssef El Amrani","employee_id": "YA002","phone": "+212 662-234567","email": "youssef.elamrani@fieldopt.ma","home_latitude": 33.6015,"home_longitude": -7.6745,"home_address": "Sidi Maârouf, Casablanca","skills": ["install","repair","maintenance","inspection","service_change"],"assigned_routes": ["CAS-SIDI-MAAROUF","CAS-BOURGOGNE"],"shift_start": "08:00","shift_end": "18:00","max_jobs_per_day": 10,"status": TechnicianStatus.AVAILABLE,"speed_factor": 0.90,"skill_bonuses": {}, "orienteur_name": "Wahid Benali"},
    {"name": "Karim Tazi","employee_id": "KT003","phone": "+212 663-345678","email": "karim.tazi@fieldopt.ma","home_latitude": 33.5878,"home_longitude": -7.5823,"home_address": "Ain Diab, Casablanca","skills": ["install","disconnect","service_change"],"assigned_routes": ["CAS-AIN-DIAB","CAS-ANFAD"],"shift_start": "07:00","shift_end": "15:00","max_jobs_per_day": 9,"status": TechnicianStatus.AVAILABLE,"speed_factor": 0.88,"skill_bonuses": {}, "orienteur_name": "Wahid Benali"},
    {"name": "Tarik Chraibi","employee_id": "TC004","phone": "+212 664-456789","email": "tarik.chraibi@fieldopt.ma","home_latitude": 33.6102,"home_longitude": -7.5217,"home_address": "Ain Sebaâ, Casablanca","skills": ["install","repair","disconnect","inspection"],"assigned_routes": ["CAS-AIN-SEBAA","CAS-HAY-HASSANI"],"shift_start": "07:00","shift_end": "16:00","max_jobs_per_day": 8,"status": TechnicianStatus.AVAILABLE,"speed_factor": 0.95,"skill_bonuses": {}, "orienteur_name": "Wahid Benali"},
    {"name": "Rachid Bennani","employee_id": "RB005","phone": "+212 665-567890","email": "rachid.bennani@fieldopt.ma","home_latitude": 33.5708,"home_longitude": -7.5976,"home_address": "Bourgogne, Casablanca","skills": ["repair","maintenance","inspection"],"assigned_routes": ["CAS-BOURGOGNE","CAS-MAARIF"],"shift_start": "09:00","shift_end": "17:00","max_jobs_per_day": 7,"status": TechnicianStatus.AVAILABLE,"speed_factor": 0.92,"skill_bonuses": {}, "orienteur_name": "Rachid El Fassi"},
    {"name": "Omar Idrissi","employee_id": "OI006","phone": "+212 666-678901","email": "omar.idrissi@fieldopt.ma","home_latitude": 33.5567,"home_longitude": -7.5878,"home_address": "Roches Noires, Casablanca","skills": ["install","repair","maintenance","disconnect"],"assigned_routes": ["CAS-ROCHES-NOIRES","CAS-GAUTHIER"],"shift_start": "08:00","shift_end": "17:00","max_jobs_per_day": 9,"status": TechnicianStatus.AVAILABLE,"speed_factor": 0.87,"skill_bonuses": {}, "orienteur_name": "Rachid El Fassi"},
    {"name": "Hassan Fassi","employee_id": "HF007","phone": "+212 667-789012","email": "hassan.fassi@fieldopt.ma","home_latitude": 33.6124,"home_longitude": -7.6824,"home_address": "Bernoussi, Casablanca","skills": ["install","repair","maintenance","inspection","service_change"],"assigned_routes": ["CAS-BERNOUSSI","CAS-SIDI-MAAROUF"],"shift_start": "08:00","shift_end": "17:00","max_jobs_per_day": 10,"status": TechnicianStatus.AVAILABLE,"speed_factor": 0.91,"skill_bonuses": {}, "orienteur_name": "Rachid El Fassi"},
    {"name": "Mehdi Kettani","employee_id": "MK008","phone": "+212 668-890123","email": "mehdi.kettani@fieldopt.ma","home_latitude": 33.5945,"home_longitude": -7.6123,"home_address": "Hay Hassani, Casablanca","skills": ["install","repair","maintenance","service_change","inspection","disconnect"],"assigned_routes": ["CAS-HAY-HASSANI","CAS-AIN-DIAB"],"shift_start": "10:00","shift_end": "19:00","max_jobs_per_day": 8,"status": TechnicianStatus.AVAILABLE,"speed_factor": 0.84,"skill_bonuses": {"repair": 0.85,"install": 1.15}, "orienteur_name": "Rachid El Fassi"},
    {"name": "Nadia Berrada","employee_id": "NB009","phone": "+212 669-901234","email": "nadia.berrada@fieldopt.ma","home_latitude": 33.5981,"home_longitude": -7.6145,"home_address": "Gauthier, Casablanca","skills": ["install","repair","disconnect"],"assigned_routes": ["CAS-GAUTHIER","CAS-MAARIF"],"shift_start": "08:00","shift_end": "17:00","max_jobs_per_day": 8,"status": TechnicianStatus.OFF_DUTY,"speed_factor": 0.93,"skill_bonuses": {}, "orienteur_name": "Driss El Omari"},
    {"name": "Soufiane El Fasi","employee_id": "SF010","phone": "+212 670-012345","email": "soufiane.elfasi@fieldopt.ma","home_latitude": 33.6089,"home_longitude": -7.5312,"home_address": "Mers Sultan, Casablanca","skills": ["install","maintenance","repair","disconnect","service_change"],"assigned_routes": ["CAS-MERS-SULTAN","CAS-BOURGOGNE"],"shift_start": "06:00","shift_end": "15:00","max_jobs_per_day": 10,"status": TechnicianStatus.AVAILABLE,"speed_factor": 0.89,"skill_bonuses": {}, "orienteur_name": "Driss El Omari"},
    {"name": "Amina El Kadiri","employee_id": "AK011","phone": "+212 671-123456","email": "amina.elkadiri@fieldopt.ma","home_latitude": 33.5756,"home_longitude": -7.5912,"home_address": "Centre Ville, Casablanca","skills": ["install","repair","maintenance"],"assigned_routes": ["CAS-CENTRE-VILLE","CAS-MAARIF"],"shift_start": "09:00","shift_end": "17:00","max_jobs_per_day": 8,"status": TechnicianStatus.AVAILABLE,"speed_factor": 1.05,"skill_bonuses": {}, "orienteur_name": "Driss El Omari"},
    {"name": "Abdallah Zouiten","employee_id": "AZ012","phone": "+212 672-234567","email": "abdallah.zouiten@fieldopt.ma","home_latitude": 33.5903,"home_longitude": -7.5702,"home_address": "Anfa, Casablanca","skills": ["install","repair","maintenance","service_change"],"assigned_routes": ["CAS-ANFA","CAS-AIN-DIAB"],"shift_start": "10:00","shift_end": "18:00","max_jobs_per_day": 9,"status": TechnicianStatus.AVAILABLE,"speed_factor": 1.02,"skill_bonuses": {"service_change": 1.35}, "orienteur_name": "Driss El Omari"},
    {"name": "Leila Mansouri","employee_id": "LM013","phone": "+212 673-345678","email": "leila.mansouri@fieldopt.ma","home_latitude": 33.6034,"home_longitude": -7.5678,"home_address": "Polo, Casablanca","skills": ["install","repair","maintenance","inspection"],"assigned_routes": ["CAS-POLO","CAS-ANFAD"],"shift_start": "08:00","shift_end": "16:00","max_jobs_per_day": 8,"status": TechnicianStatus.AVAILABLE,"speed_factor": 0.96,"skill_bonuses": {"maintenance": 0.88,"inspection": 0.88}, "orienteur_name": "Hicham Tazi"},
    {"name": "Bilal El Mazizi","employee_id": "BE014","phone": "+212 674-456789","email": "bilal.elmazizi@fieldopt.ma","home_latitude": 33.5687,"home_longitude": -7.6056,"home_address": "Derb Ghallef, Casablanca","skills": ["install","repair","maintenance"],"assigned_routes": ["CAS-DERB-GHALLEF","CAS-MAARIF"],"shift_start": "08:00","shift_end": "17:00","max_jobs_per_day": 9,"status": TechnicianStatus.AVAILABLE,"speed_factor": 0.94,"skill_bonuses": {}, "orienteur_name": "Hicham Tazi"},
    {"name": "Salim Berrechid","employee_id": "SB015","phone": "+212 675-567890","email": "salim.berrechid@fieldopt.ma","home_latitude": 33.5812,"home_longitude": -7.6234,"home_address": "Oasis, Casablanca","skills": ["install","repair","inspection"],"assigned_routes": ["CAS-OASIS","CAS-AIN-SEBAA"],"shift_start": "08:00","shift_end": "17:00","max_jobs_per_day": 8,"status": TechnicianStatus.AVAILABLE,"speed_factor": 1.03,"skill_bonuses": {}, "orienteur_name": "Hicham Tazi"},
    {"name": "Rania Taoufiq","employee_id": "RT016","phone": "+212 676-678901","email": "rania.taoufiq@fieldopt.ma","home_latitude": 33.6156,"home_longitude": -7.5456,"home_address": "Mohammed V, Casablanca","skills": ["repair","maintenance","inspection"],"assigned_routes": ["CAS-MOHAMED-V","CAS-BERNOUSSI"],"shift_start": "09:00","shift_end": "18:00","max_jobs_per_day": 7,"status": TechnicianStatus.AVAILABLE,"speed_factor": 1.08,"skill_bonuses": {}, "orienteur_name": "Hicham Tazi"},
    {"name": "Hamza El Jayidi","employee_id": "HEJ017","phone": "+212 677-789012","email": "hamza.eljayidi@fieldopt.ma","home_latitude": 33.5702,"home_longitude": -7.5789,"home_address": "Belvedere, Casablanca","skills": ["install","repair","inspection"],"assigned_routes": ["CAS-BELVEDERE","CAS-ROCHES-NOIRES"],"shift_start": "08:00","shift_end": "16:00","max_jobs_per_day": 7,"status": TechnicianStatus.AVAILABLE,"speed_factor": 1.06,"skill_bonuses": {}, "orienteur_name": "Hicham Tazi"},
    {"name": "Khadija El Harti","employee_id": "KEH018","phone": "+212 678-890123","email": "khadija.elharti@fieldopt.ma","home_latitude": 33.5876,"home_longitude": -7.5867,"home_address": "Racine, Casablanca","skills": ["install","repair","maintenance","disconnect","service_change"],"assigned_routes": ["CAS-RACINE","CAS-CENTRE-VILLE"],"shift_start": "08:00","shift_end": "16:00","max_jobs_per_day": 8,"status": TechnicianStatus.AVAILABLE,"speed_factor": 0.97,"skill_bonuses": {}, "orienteur_name": "Hicham Tazi"},
    {"name": "Adil Benmoussa","employee_id": "ABM019","phone": "+212 679-901234","email": "adil.benmoussa@fieldopt.ma","home_latitude": 33.6023,"home_longitude": -7.6102,"home_address": "Founty, Casablanca","skills": ["install","repair","maintenance","inspection","service_change"],"assigned_routes": ["CAS-FOUNTY","CAS-AIN-DIAB"],"shift_start": "07:00","shift_end": "16:00","max_jobs_per_day": 10,"status": TechnicianStatus.AVAILABLE,"speed_factor": 0.93,"skill_bonuses": {}, "orienteur_name": "Hicham Tazi"},
    {"name": "Imane Rafiq","employee_id": "IR020","phone": "+212 680-012345","email": "imane.rafiq@fieldopt.ma","home_latitude": 33.5745,"home_longitude": -7.6012,"home_address": "Val d'Anfa, Casablanca","skills": ["install","repair","maintenance"],"assigned_routes": ["CAS-VAL-ANFA","CAS-ANFA"],"shift_start": "08:00","shift_end": "17:00","max_jobs_per_day": 9,"status": TechnicianStatus.AVAILABLE,"speed_factor": 1.10,"skill_bonuses": {}, "orienteur_name": "Hicham Tazi"},
]


DEFAULT_PASSWORD = get_password_hash("mdp123")


def make_jobs():
    today = datetime.now(timezone.utc).replace(hour=8, minute=0, second=0, microsecond=0)
    tomorrow = today + timedelta(days=1)
    return [
        {"customer_name": "Marjane Market Maarif","service_address": "123 Bd Zerktouni","service_city": "Casablanca","service_zip": "20100","latitude": 33.5892,"longitude": -7.6031,"job_type": JobType.INSTALLATION,"required_skills": ["install"],"route_criteria": "CAS-MAARIF","priority": JobPriority.URGENT,"scheduled_date": today,"time_slot_start": "08:00","time_slot_end": "12:00","estimated_duration": 90,"description": "Installation FTTH - supermarche Marjane"},
        {"customer_name": "Boutique SAV Maarif","service_address": "45 Rue Idrissi","service_city": "Casablanca","service_zip": "20100","latitude": 33.5910,"longitude": -7.6045,"job_type": JobType.SAV,"required_skills": ["repair","service_change"],"route_criteria": "CAS-MAARIF","priority": JobPriority.HAUTE,"scheduled_date": today,"time_slot_start": "08:00","time_slot_end": "12:00","estimated_duration": 60,"description": "Depannage ligne FTTH - coupure client"},
        {"customer_name": "Residence Gauthier","service_address": "12 Bd Gauthier","service_city": "Casablanca","service_zip": "20110","latitude": 33.5980,"longitude": -7.6120,"job_type": JobType.INSTALLATION,"required_skills": ["install"],"route_criteria": "CAS-GAUTHIER","priority": JobPriority.NORMALE,"scheduled_date": today,"time_slot_start": "13:00","time_slot_end": "17:00","estimated_duration": 120,"description": "Installation FTTH - residence 12 appartements"},
        {"customer_name": "Cafe Sidi Maarouf","service_address": "78 Bd Sidi Maarouf","service_city": "Casablanca","service_zip": "20200","latitude": 33.6015,"longitude": -7.6745,"job_type": JobType.DEPANNAGE,"required_skills": ["repair"],"route_criteria": "CAS-SIDI-MAAROUF","priority": JobPriority.HAUTE,"scheduled_date": today,"time_slot_start": "08:00","time_slot_end": "12:00","estimated_duration": 45,"description": "Panne modem ONT - remplacement"},
        {"customer_name": "Villa Bourgogne","service_address": "23 Rue Bourgogne","service_city": "Casablanca","service_zip": "20120","latitude": 33.5708,"longitude": -7.5976,"job_type": JobType.MAINTENANCE,"required_skills": ["maintenance","inspection"],"route_criteria": "CAS-BOURGOGNE","priority": JobPriority.FAIBLE,"scheduled_date": today,"time_slot_start": "09:00","time_slot_end": "13:00","estimated_duration": 30,"description": "Verification ligne fibre - demande client"},
        {"customer_name": "Hotel Ain Diab","service_address": "100 Corniche Ain Diab","service_city": "Casablanca","service_zip": "20250","latitude": 33.5878,"longitude": -7.5823,"job_type": JobType.INSTALLATION,"required_skills": ["install","disconnect"],"route_criteria": "CAS-AIN-DIAB","priority": JobPriority.URGENT,"scheduled_date": today,"time_slot_start": "14:00","time_slot_end": "18:00","estimated_duration": 150,"description": "Installation FTTH hotel - 30 chambres"},
        {"customer_name": "Pharmacie Anfa","service_address": "56 Ave Anfa","service_city": "Casablanca","service_zip": "20150","latitude": 33.5903,"longitude": -7.5702,"job_type": JobType.SAV,"required_skills": ["repair"],"route_criteria": "CAS-ANFA","priority": JobPriority.HAUTE,"scheduled_date": today,"time_slot_start": "10:00","time_slot_end": "14:00","estimated_duration": 60,"description": "Coupure ligne - priorite client VIP"},
        {"customer_name": "Ecole Roches Noires","service_address": "10 Rue Roches Noires","service_city": "Casablanca","service_zip": "20130","latitude": 33.5567,"longitude": -7.5878,"job_type": JobType.INSTALLATION,"required_skills": ["install"],"route_criteria": "CAS-ROCHES-NOIRES","priority": JobPriority.NORMALE,"scheduled_date": today,"time_slot_start": "08:00","time_slot_end": "12:00","estimated_duration": 90,"description": "Installation salle informatique"},
        {"customer_name": "Supermarche Bernoussi","service_address": "200 Bd Bernoussi","service_city": "Casablanca","service_zip": "20240","latitude": 33.6124,"longitude": -7.6824,"job_type": JobType.DEPANNAGE,"required_skills": ["repair","service_change"],"route_criteria": "CAS-BERNOUSSI","priority": JobPriority.HAUTE,"scheduled_date": today,"time_slot_start": "15:00","time_slot_end": "19:00","estimated_duration": 75,"description": "Panne reseau - caisse bloquee"},
        {"customer_name": "Villa Hay Hassani","service_address": "34 Ave Hay Hassani","service_city": "Casablanca","service_zip": "20260","latitude": 33.5945,"longitude": -7.6123,"job_type": JobType.INSTALLATION,"required_skills": ["install"],"route_criteria": "CAS-HAY-HASSANI","priority": JobPriority.NORMALE,"scheduled_date": today,"time_slot_start": "08:00","time_slot_end": "12:00","estimated_duration": 60,"description": "Nouvelle installation fibre domicile"},
        {"customer_name": "Clinique Centre Ville","service_address": "15 Place de la Resistance","service_city": "Casablanca","service_zip": "20100","latitude": 33.5756,"longitude": -7.5912,"job_type": JobType.MAINTENANCE,"required_skills": ["maintenance","inspection"],"route_criteria": "CAS-CENTRE-VILLE","priority": JobPriority.URGENT,"scheduled_date": today,"time_slot_start": "09:00","time_slot_end": "13:00","estimated_duration": 45,"description": "Maintenance urgente - liaison critique"},
        {"customer_name": "Restaurant Mers Sultan","service_address": "88 Blvd Mers Sultan","service_city": "Casablanca","service_zip": "20180","latitude": 33.6089,"longitude": -7.5312,"job_type": JobType.SAV,"required_skills": ["disconnect","install"],"route_criteria": "CAS-MERS-SULTAN","priority": JobPriority.NORMALE,"scheduled_date": today,"time_slot_start": "14:00","time_slot_end": "18:00","estimated_duration": 60,"description": "Demenagement - transfert ligne"},
        {"customer_name": "Banque Polo","service_address": "5 Ave Polo","service_city": "Casablanca","service_zip": "20140","latitude": 33.6034,"longitude": -7.5678,"job_type": JobType.INSTALLATION,"required_skills": ["install","inspection"],"route_criteria": "CAS-POLO","priority": JobPriority.HAUTE,"scheduled_date": today,"time_slot_start": "10:00","time_slot_end": "14:00","estimated_duration": 90,"description": "Installation liaison dediee"},
        {"customer_name": "Boutique Derb Ghallef","service_address": "120 Derb Ghallef","service_city": "Casablanca","service_zip": "20190","latitude": 33.5687,"longitude": -7.6056,"job_type": JobType.DEPANNAGE,"required_skills": ["repair"],"route_criteria": "CAS-DERB-GHALLEF","priority": JobPriority.HAUTE,"scheduled_date": today,"time_slot_start": "11:00","time_slot_end": "15:00","estimated_duration": 45,"description": "Panne connexion - boutique"},
        {"customer_name": "Villa Oasis","service_address": "7 Rue Oasis","service_city": "Casablanca","service_zip": "20270","latitude": 33.5812,"longitude": -7.6234,"job_type": JobType.MAINTENANCE,"required_skills": ["maintenance"],"route_criteria": "CAS-OASIS","priority": JobPriority.FAIBLE,"scheduled_date": today,"time_slot_start": "16:00","time_slot_end": "18:00","estimated_duration": 30,"description": "Verification equipement client"},
        {"customer_name": "Hotel Mohammed V","service_address": "45 Ave Mohammed V","service_city": "Casablanca","service_zip": "20160","latitude": 33.6156,"longitude": -7.5456,"job_type": JobType.INSTALLATION,"required_skills": ["install","disconnect"],"route_criteria": "CAS-MOHAMED-V","priority": JobPriority.URGENT,"scheduled_date": today,"time_slot_start": "08:00","time_slot_end": "12:00","estimated_duration": 120,"description": "Renovation complete - 50 chambres"},
        {"customer_name": "Cafe Belvedere","service_address": "23 Rue Belvedere","service_city": "Casablanca","service_zip": "20170","latitude": 33.5702,"longitude": -7.5789,"job_type": JobType.SAV,"required_skills": ["repair","service_change"],"route_criteria": "CAS-BELVEDERE","priority": JobPriority.HAUTE,"scheduled_date": today,"time_slot_start": "13:00","time_slot_end": "17:00","estimated_duration": 60,"description": "Coupure ligne - etablissement public"},
        {"customer_name": "Residence Racine","service_address": "67 Blvd Racine","service_city": "Casablanca","service_zip": "20110","latitude": 33.5876,"longitude": -7.5867,"job_type": JobType.INSTALLATION,"required_skills": ["install"],"route_criteria": "CAS-RACINE","priority": JobPriority.NORMALE,"scheduled_date": tomorrow,"time_slot_start": "08:00","time_slot_end": "12:00","estimated_duration": 90,"description": "Nouvelle residence - 20 appartements"},
        {"customer_name": "Villa Founty","service_address": "12 Ave Founty","service_city": "Casablanca","service_zip": "20230","latitude": 33.6023,"longitude": -7.6102,"job_type": JobType.INSTALLATION,"required_skills": ["install","inspection"],"route_criteria": "CAS-FOUNTY","priority": JobPriority.NORMALE,"scheduled_date": tomorrow,"time_slot_start": "14:00","time_slot_end": "18:00","estimated_duration": 60,"description": "Installation villa - controle acces"},
        {"customer_name": "Hotel Val d'Anfa","service_address": "100 Corniche Val d'Anfa","service_city": "Casablanca","service_zip": "20250","latitude": 33.5745,"longitude": -7.6012,"job_type": JobType.MAINTENANCE,"required_skills": ["maintenance"],"route_criteria": "CAS-VAL-ANFA","priority": JobPriority.FAIBLE,"scheduled_date": tomorrow,"time_slot_start": "09:00","time_slot_end": "13:00","estimated_duration": 45,"description": "Maintenance preventive equipements"},
        {"customer_name": "Centre Commercial Anfa","service_address": "45 Ave de l'Anfa","service_city": "Casablanca","service_zip": "20150","latitude": 33.5903,"longitude": -7.5702,"job_type": JobType.DEPANNAGE,"required_skills": ["repair"],"route_criteria": "CAS-ANFA","priority": JobPriority.HAUTE,"scheduled_date": tomorrow,"time_slot_start": "10:00","time_slot_end": "14:00","estimated_duration": 60,"description": "Panne generale centre commercial"},
        {"customer_name": "Ecole Polo","service_address": "10 Rue Polo","service_city": "Casablanca","service_zip": "20140","latitude": 33.6034,"longitude": -7.5678,"job_type": JobType.INSTALLATION,"required_skills": ["install"],"route_criteria": "CAS-POLO","priority": JobPriority.NORMALE,"scheduled_date": tomorrow,"time_slot_start": "15:00","time_slot_end": "19:00","estimated_duration": 75,"description": "Installation reseau salle classe"},
        {"customer_name": "Clinique Anfac","service_address": "22 Blvd Anfac","service_city": "Casablanca","service_zip": "20200","latitude": 33.6015,"longitude": -7.6745,"job_type": JobType.MAINTENANCE,"required_skills": ["inspection","maintenance"],"route_criteria": "CAS-SIDI-MAAROUF","priority": JobPriority.URGENT,"scheduled_date": tomorrow,"time_slot_start": "08:00","time_slot_end": "12:00","estimated_duration": 60,"description": "Verification equipements critiques"},
        {"customer_name": "Restaurant Bourgogne","service_address": "15 Rue Bourgogne","service_city": "Casablanca","service_zip": "20120","latitude": 33.5708,"longitude": -7.5976,"job_type": JobType.DEPANNAGE,"required_skills": ["repair"],"route_criteria": "CAS-BOURGOGNE","priority": JobPriority.NORMALE,"scheduled_date": tomorrow,"time_slot_start": "13:00","time_slot_end": "17:00","estimated_duration": 45,"description": "Coupure reseau restaurant"},
        {"customer_name": "Villa Ain Diab","service_address": "5 Corniche Ain Diab","service_city": "Casablanca","service_zip": "20250","latitude": 33.5878,"longitude": -7.5823,"job_type": JobType.INSTALLATION,"required_skills": ["install"],"route_criteria": "CAS-AIN-DIAB","priority": JobPriority.NORMALE,"scheduled_date": tomorrow,"time_slot_start": "09:00","time_slot_end": "13:00","estimated_duration": 60,"description": "Installation domicile particulier"},
        {"customer_name": "Supermarche Ain Sebaa","service_address": "150 Bd Ain Sebaa","service_city": "Casablanca","service_zip": "20280","latitude": 33.6102,"longitude": -7.5217,"job_type": JobType.SAV,"required_skills": ["disconnect","install"],"route_criteria": "CAS-AIN-SEBAA","priority": JobPriority.HAUTE,"scheduled_date": tomorrow,"time_slot_start": "10:00","time_slot_end": "14:00","estimated_duration": 90,"description": "Demenagement surface commerciale"},
        {"customer_name": "Hotel Hay Hassani","service_address": "80 Ave Hay Hassani","service_city": "Casablanca","service_zip": "20260","latitude": 33.5945,"longitude": -7.6123,"job_type": JobType.INSTALLATION,"required_skills": ["install"],"route_criteria": "CAS-HAY-HASSANI","priority": JobPriority.NORMALE,"scheduled_date": tomorrow,"time_slot_start": "14:00","time_slot_end": "18:00","estimated_duration": 100,"description": "Installation WiFi public - hall"},
        {"customer_name": "Boutique Gauthier","service_address": "33 Bd Gauthier","service_city": "Casablanca","service_zip": "20110","latitude": 33.5980,"longitude": -7.6120,"job_type": JobType.DEPANNAGE,"required_skills": ["repair"],"route_criteria": "CAS-GAUTHIER","priority": JobPriority.HAUTE,"scheduled_date": tomorrow,"time_slot_start": "11:00","time_slot_end": "15:00","estimated_duration": 45,"description": "Ponte - ligne internet"},
        {"customer_name": "Residence Maarif","service_address": "100 Bd Zerktouni","service_city": "Casablanca","service_zip": "20100","latitude": 33.5892,"longitude": -7.6031,"job_type": JobType.INSTALLATION,"required_skills": ["install"],"route_criteria": "CAS-MAARIF","priority": JobPriority.NORMALE,"scheduled_date": tomorrow,"time_slot_start": "08:00","time_slot_end": "12:00","estimated_duration": 120,"description": "Installation fibre - 25 appartements"},
        {"customer_name": "Clinique Sidi Maarouf","service_address": "45 Rd Sidi Maarouf","service_city": "Casablanca","service_zip": "20200","latitude": 33.6015,"longitude": -7.6745,"job_type": JobType.MAINTENANCE,"required_skills": ["maintenance"],"route_criteria": "CAS-SIDI-MAAROUF","priority": JobPriority.URGENT,"scheduled_date": tomorrow,"time_slot_start": "15:00","time_slot_end": "19:00","estimated_duration": 60,"description": "Maintenance urgente equipements"},
    ]


def technician_seed_rows():
    """Return fresh technician templates without mutating TECHNICIANS."""
    return [dict(row) for row in TECHNICIANS]


async def seed_all(*, include_jobs: bool = True):
    async with AsyncSessionLocal() as session:
        from sqlalchemy import text
        from backend.database.models import Orienteur
        import random
        print("\n🌱 Seeding FieldOpt with Casablanca data...\n")

        # ── Nettoyage des données volatiles ─────────────────────
        await session.execute(text("DELETE FROM assignments"))
        await session.execute(text("DELETE FROM jobs"))
        await session.execute(text("DELETE FROM import_history"))
        await session.execute(text("DELETE FROM incidents"))
        await session.execute(text("DELETE FROM equipment_inventory"))
        await session.execute(text("DELETE FROM ports"))
        await session.execute(text("DELETE FROM splitters"))
        await session.execute(text("DELETE FROM pto"))
        await session.execute(text("DELETE FROM pbo"))
        await session.execute(text("DELETE FROM sro"))
        await session.execute(text("DELETE FROM nro"))
        await session.commit()
        print("  Volatile data cleared")

        # ── 1. Créer les secteurs (SKIP si existe déjà) ─────────
        sector_map = {}
        for s_data in SECTORS:
            existing = await session.execute(
                select(Sector).where(Sector.name == s_data["name"])
            )
            sector = existing.scalar_one_or_none()
            if sector:
                sector_map[s_data["name"]] = sector.id
                print(f"    ⚠ Secteur '{s_data['name']}' existe déjà, ignoré")
                continue
            sector = Sector(**s_data)
            session.add(sector)
            await session.flush()
            sector_map[s_data["name"]] = sector.id
        await session.commit()
        print(f"  {len(SECTORS)} secteurs OK")

        # ── 2. Créer les orienteurs avec leur secteur ──────────
        orienteur_map = {}
        orienteur_username_map = {}
        for o_data in ORIENTEURS:
            orienteur_name = o_data["name"]
            existing = await session.execute(
                select(Orienteur).where(Orienteur.email == o_data["email"])
            )
            orienteur = existing.scalar_one_or_none()
            if orienteur:
                orienteur_map[orienteur_name] = orienteur.id
                orienteur_username_map[o_data["username"]] = orienteur.id
                print(f"    ⚠ Orienteur '{orienteur_name}' existe déjà, ignoré")
                continue
            orienteur = Orienteur(
                name=orienteur_name,
                email=o_data["email"],
                phone=o_data["phone"],
                sector_id=sector_map.get(o_data["sector_name"]),
                is_active=True,
            )
            session.add(orienteur)
            await session.flush()
            orienteur_map[orienteur_name] = orienteur.id
            orienteur_username_map[o_data["username"]] = orienteur.id
        await session.commit()
        print(f"  {len(ORIENTEURS)} orienteurs OK")

        # ── 3. Initialiser les équipes et leur secteur canonique ─
        team_map = {}
        primary_sector_by_orienteur = {}
        for o_data in ORIENTEURS:
            orienteur_name = o_data["name"]
            orienteur_id = orienteur_map[orienteur_name]
            sector_id = sector_map[o_data["sector_name"]]

            existing = await session.execute(
                select(FieldTeam).where(
                    FieldTeam.orienteur_id == orienteur_id
                )
            )
            team = existing.scalar_one_or_none()

            if team is None:
                team = FieldTeam(
                    name=f"Équipe {orienteur_name}",
                    code=f"TEAM-{o_data['username'].upper()}",
                    orienteur_id=orienteur_id,
                    is_active=True,
                )
                session.add(team)
                await session.flush()

            team_map[orienteur_name] = team.id
            primary_sector_by_orienteur[orienteur_name] = sector_id

            sector_link = await session.execute(
                select(FieldTeamSector).where(
                    FieldTeamSector.team_id == team.id,
                    FieldTeamSector.sector_id == sector_id,
                )
            )
            if sector_link.scalar_one_or_none() is None:
                session.add(
                    FieldTeamSector(
                        team_id=team.id,
                        sector_id=sector_id,
                    )
                )

        await session.commit()
        print(f"  {len(team_map)} équipes opérationnelles OK")

        # ── 4. Créer les techniciens avec leur équipe ──────────
        tech_ids = []
        technician_primary_sector = {}
        for tech_data in technician_seed_rows():
            orienteur_name = tech_data.pop("orienteur_name", None)
            tech_email = tech_data["email"]
            existing = await session.execute(
                select(Technician).where(
                    (Technician.email == tech_email) | (Technician.employee_id == tech_data["employee_id"])
                )
            )
            tech = existing.scalar_one_or_none()
            if tech:
                if orienteur_name:
                    tech.orienteur_id = orienteur_map.get(orienteur_name)
                    tech.team_id = team_map.get(orienteur_name)
                tech_ids.append(tech.id)
                if orienteur_name:
                    technician_primary_sector[tech.id] = (
                        primary_sector_by_orienteur[orienteur_name]
                    )
                print(f"    ⚠ Tech '{tech_data['name']}' existe déjà (id={tech.id}), ignoré")
                continue
            tech = Technician(
                **tech_data,
                current_latitude=tech_data["home_latitude"],
                current_longitude=tech_data["home_longitude"],
                orienteur_id=orienteur_map.get(orienteur_name) if orienteur_name else None,
                team_id=team_map.get(orienteur_name) if orienteur_name else None,
            )
            session.add(tech)
            await session.flush()
            tech_ids.append(tech.id)
            if orienteur_name:
                technician_primary_sector[tech.id] = (
                    primary_sector_by_orienteur[orienteur_name]
                )
        await session.commit()
        print(f"  {len(TECHNICIANS)} techniciens OK")

        # La table de compatibilité alimente les écrans Secteurs/Personnel.
        # Préserver une configuration existante ; initialiser uniquement les
        # techniciens qui n'ont encore aucun secteur explicite.
        technician_sector_links_created = 0
        for technician_id, sector_id in technician_primary_sector.items():
            result = await session.execute(
                text(
                    """
                    INSERT INTO technician_sectors (
                        technician_id,
                        sector_id,
                        is_primary
                    )
                    SELECT :technician_id, :sector_id, TRUE
                    WHERE NOT EXISTS (
                        SELECT 1
                        FROM technician_sectors
                        WHERE technician_id = :technician_id
                    )
                    RETURNING id
                    """
                ),
                {
                    "technician_id": technician_id,
                    "sector_id": sector_id,
                },
            )
            if result.scalar_one_or_none() is not None:
                technician_sector_links_created += 1

        await session.commit()
        print(
            f"  {technician_sector_links_created} "
            "affectations secteur technicien créées"
        )

        # ── 5. Créer automatiquement les comptes mobiles pour chaque technicien ──
        tech_users_created = 0
        for idx, tech_data in enumerate(technician_seed_rows()):
            if idx >= len(tech_ids):
                break
            tech_id = tech_ids[idx]
            tech_email = tech_data["email"]
            tech_name = tech_data["name"]

            # Générer le username : prenom.nom en minuscules
            parts = tech_name.lower().split()
            if len(parts) >= 2:
                username = f"{parts[0]}.{parts[-1]}"
            else:
                username = tech_name.lower().replace(" ", ".")

            existing = await session.execute(
                select(User).where(
                    (User.username == username) | (User.email == tech_email)
                )
            )
            if existing.scalar_one_or_none():
                print(f"    ⚠ Compte tech '{username}' existe déjà, ignoré")
                continue

            user = User(
                username=username,
                email=tech_email,
                password_hash=DEFAULT_PASSWORD,
                role=UserRole.TECHNICIAN,
                is_active=True,
                technician_id=tech_id,
            )
            session.add(user)
            tech_users_created += 1

        await session.commit()
        print(f"  {tech_users_created} comptes mobiles créés pour les techniciens")

        # ── 5. Créer les utilisateurs manuels ──────────────────
        USERS = [
            # ADMIN
            {"username": "admin", "email": "admin@fieldopt.ma", "password_hash": DEFAULT_PASSWORD, "role": UserRole.ADMIN},
            # CHEF ORIENTEUR
            {
                "username": "chef",
                "email": "chef.orienteur@fieldopt.ma",
                "password_hash": DEFAULT_PASSWORD,
                "role": UserRole.CHEF_ORIENTEUR,
                "orienteur_id": orienteur_username_map.get("wahid"),
            },
        ]

        for user_data in USERS:
            existing = await session.execute(
                select(User).where(User.username == user_data["username"])
            )
            existing_user = existing.scalar_one_or_none()
            if existing_user:
                if (
                    user_data["username"] == "chef"
                    and existing_user.orienteur_id is None
                ):
                    existing_user.orienteur_id = orienteur_username_map.get("wahid")
                    await session.commit()
                    print("    ✓ Compte pilote 'chef' lié à l'équipe Wahid Benali")
                print(f"    ⚠ Utilisateur '{user_data['username']}' existe déjà, ignoré")
                continue
            user = User(**user_data)
            session.add(user)

        await session.commit()
        print(f"  {len(USERS)} utilisateurs (admin, chef) OK")

        # ── 6. Créer les comptes orienteurs ─────────────────────
        orienteur_accounts_created = 0
        for o_data in ORIENTEURS:
            username = o_data["username"]
            orienteur_id = orienteur_username_map.get(username)
            existing = await session.execute(
                select(User).where(User.username == username)
            )
            if existing.scalar_one_or_none():
                print(f"    ⚠ Compte orienteur '{username}' existe déjà, ignoré")
                continue
            user = User(
                username=username,
                email=o_data["email"],
                password_hash=DEFAULT_PASSWORD,
                role=UserRole.ORIENTEUR,
                is_active=True,
                orienteur_id=orienteur_id,
            )
            session.add(user)
            orienteur_accounts_created += 1

        await session.commit()
        print(f"  {orienteur_accounts_created} comptes orienteurs créés (wahid, rachid, driss, hicham)")

        if not include_jobs:
            print(
                "\n✅ Seed de référence terminé "
                "(sans interventions ni affectations).\n"
            )
            return

        # ── 7. Créer les jobs ──────────────────────────────────
        jobs_data = make_jobs()
        for job_data in jobs_data:
            job = Job(**job_data)
            session.add(job)
        await session.commit()
        print(f"  {len(jobs_data)} jobs créés")

        # ── 8. Assigner les techniciens aux jobs aléatoirement ─
        result = await session.execute(select(Job))
        all_jobs = result.scalars().all()
        assignments_count = 0
        for job in all_jobs[:20]:
            assignment = None
            if tech_ids:
                tech_id = random.choice(tech_ids)
                assignment = Assignment(
                    job_id=job.id,
                    technician_id=tech_id,
                    assigned_at=datetime.now(timezone.utc),
                )
                session.add(assignment)
                job.status = JobStatus.ASSIGNED
                assignments_count += 1

        await session.commit()
        print(f"  {assignments_count} assignations créées")

        print("\n✅ Seed terminé ! Données Casablanca FTTH chargées.\n")


if __name__ == "__main__":
    asyncio.run(seed_all())
