"""
Sushrutha Grid - Doctor Profiles Seeding Script
Populates the MongoDB 'doctors' collection with realistic Junior Doctors and Senior Doctors
across all 12 clinical hospital departments in accordance with National Medical Commission (NMC)
and Government Medical College hospital staffing norms.
"""

import sys
from datetime import datetime
from pathlib import Path

# Add backend directory to sys.path
backend_path = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(backend_path))

from app.database import get_database

DOCTORS_DATA = [
    # =========================================================================
    # 1. GENERAL MEDICINE
    # =========================================================================
    {
        "doctor_id": "DOC_MED_JR_01",
        "name": "Dr. Sneha Hegde",
        "department": "General Medicine",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident (MD Resident - 2nd Year)",
        "qualification": "MBBS",
        "experience_years": 2,
        "room_number": "OPD Desk 101",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.sneha.med@sushrutha.gov.in",
        "phone": "+91-9845110001",
        "status": "AVAILABLE",
        "max_active_patients": 15
    },
    {
        "doctor_id": "DOC_MED_JR_02",
        "name": "Dr. Karthik Sundaram",
        "department": "General Medicine",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident (MD Resident - 1st Year)",
        "qualification": "MBBS",
        "experience_years": 1,
        "room_number": "OPD Desk 102",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.karthik.med@sushrutha.gov.in",
        "phone": "+91-9845110002",
        "status": "AVAILABLE",
        "max_active_patients": 15
    },
    {
        "doctor_id": "DOC_MED_JR_03",
        "name": "Dr. Ananya Roy",
        "department": "General Medicine",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident (MD Resident - 3rd Year)",
        "qualification": "MBBS",
        "experience_years": 3,
        "room_number": "OPD Desk 103",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.ananya.med@sushrutha.gov.in",
        "phone": "+91-9845110003",
        "status": "AVAILABLE",
        "max_active_patients": 15
    },
    {
        "doctor_id": "DOC_MED_SR_01",
        "name": "Dr. Rajesh Sharma",
        "department": "General Medicine",
        "tier": "SENIOR_DOCTOR",
        "designation": "Senior Resident / Registrar",
        "qualification": "MBBS, MD (General Medicine)",
        "experience_years": 6,
        "room_number": "Chamber 104 (Senior Review)",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.rajesh.med@sushrutha.gov.in",
        "phone": "+91-9845110004",
        "status": "AVAILABLE",
        "max_active_patients": 12
    },
    {
        "doctor_id": "DOC_MED_SR_02",
        "name": "Prof. Dr. Meenakshi Rao",
        "department": "General Medicine",
        "tier": "SENIOR_DOCTOR",
        "designation": "Professor & Unit Chief",
        "qualification": "MBBS, MD (Medicine), FACP",
        "experience_years": 18,
        "room_number": "Chamber 105 (Consultant Clinic)",
        "opd_days": ["Monday", "Wednesday", "Friday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "prof.meenakshi@sushrutha.gov.in",
        "phone": "+91-9845110005",
        "status": "AVAILABLE",
        "max_active_patients": 10
    },

    # =========================================================================
    # 2. CARDIOLOGY
    # =========================================================================
    {
        "doctor_id": "DOC_CARD_JR_01",
        "name": "Dr. Arvind Menon",
        "department": "Cardiology",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident (DM Cardiology Fellow)",
        "qualification": "MBBS, MD (Medicine)",
        "experience_years": 3,
        "room_number": "Cardiac OPD Desk 201",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.arvind.card@sushrutha.gov.in",
        "phone": "+91-9845110006",
        "status": "AVAILABLE",
        "max_active_patients": 12
    },
    {
        "doctor_id": "DOC_CARD_JR_02",
        "name": "Dr. Deepa Nair",
        "department": "Cardiology",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident",
        "qualification": "MBBS",
        "experience_years": 2,
        "room_number": "Cardiac OPD Desk 202",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.deepa.card@sushrutha.gov.in",
        "phone": "+91-9845110007",
        "status": "AVAILABLE",
        "max_active_patients": 12
    },
    {
        "doctor_id": "DOC_CARD_SR_01",
        "name": "Dr. Vikramaditya Joshi",
        "department": "Cardiology",
        "tier": "SENIOR_DOCTOR",
        "designation": "Senior Interventional Cardiologist",
        "qualification": "MBBS, MD, DM (Cardiology)",
        "experience_years": 10,
        "room_number": "Chamber 204 (Cath Lab Review)",
        "opd_days": ["Monday", "Wednesday", "Friday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.vikram.card@sushrutha.gov.in",
        "phone": "+91-9845110008",
        "status": "AVAILABLE",
        "max_active_patients": 10
    },
    {
        "doctor_id": "DOC_CARD_SR_02",
        "name": "Dr. Sunita Patel",
        "department": "Cardiology",
        "tier": "SENIOR_DOCTOR",
        "designation": "Senior Resident / Assistant Professor",
        "qualification": "MBBS, MD, DNB (Cardiology)",
        "experience_years": 7,
        "room_number": "Chamber 205 (Arrhythmia Clinic)",
        "opd_days": ["Tuesday", "Thursday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.sunita.card@sushrutha.gov.in",
        "phone": "+91-9845110009",
        "status": "AVAILABLE",
        "max_active_patients": 10
    },

    # =========================================================================
    # 3. PULMONOLOGY & CHEST MEDICINE
    # =========================================================================
    {
        "doctor_id": "DOC_PULM_JR_01",
        "name": "Dr. Pranav Deshmukh",
        "department": "Pulmonology",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident (DTCD / MD)",
        "qualification": "MBBS",
        "experience_years": 2,
        "room_number": "Chest OPD Desk 301",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.pranav.pulm@sushrutha.gov.in",
        "phone": "+91-9845110010",
        "status": "AVAILABLE",
        "max_active_patients": 14
    },
    {
        "doctor_id": "DOC_PULM_JR_02",
        "name": "Dr. Ritu Verma",
        "department": "Pulmonology",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident",
        "qualification": "MBBS",
        "experience_years": 1,
        "room_number": "Chest OPD Desk 302",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.ritu.pulm@sushrutha.gov.in",
        "phone": "+91-9845110011",
        "status": "AVAILABLE",
        "max_active_patients": 14
    },
    {
        "doctor_id": "DOC_PULM_SR_01",
        "name": "Dr. Harish Kulkarni",
        "department": "Pulmonology",
        "tier": "SENIOR_DOCTOR",
        "designation": "Senior Pulmonologist / Associate Professor",
        "qualification": "MBBS, MD (Pulmonary Medicine)",
        "experience_years": 11,
        "room_number": "Chamber 304 (Asthma & COPD Clinic)",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.harish.pulm@sushrutha.gov.in",
        "phone": "+91-9845110012",
        "status": "AVAILABLE",
        "max_active_patients": 10
    },

    # =========================================================================
    # 4. NEUROLOGY
    # =========================================================================
    {
        "doctor_id": "DOC_NEUR_JR_01",
        "name": "Dr. Aditya Swamy",
        "department": "Neurology",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident (DM Neurology Fellow)",
        "qualification": "MBBS, MD",
        "experience_years": 3,
        "room_number": "Neuro Desk 401",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.aditya.neuro@sushrutha.gov.in",
        "phone": "+91-9845110013",
        "status": "AVAILABLE",
        "max_active_patients": 12
    },
    {
        "doctor_id": "DOC_NEUR_JR_02",
        "name": "Dr. Pooja Bhat",
        "department": "Neurology",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident",
        "qualification": "MBBS",
        "experience_years": 1,
        "room_number": "Neuro Desk 402",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.pooja.neuro@sushrutha.gov.in",
        "phone": "+91-9845110014",
        "status": "AVAILABLE",
        "max_active_patients": 12
    },
    {
        "doctor_id": "DOC_NEUR_SR_01",
        "name": "Dr. Vasanth Kumar",
        "department": "Neurology",
        "tier": "SENIOR_DOCTOR",
        "designation": "Senior Neurologist & Stroke Specialist",
        "qualification": "MBBS, MD, DM (Neurology)",
        "experience_years": 12,
        "room_number": "Chamber 404 (Epilepsy & Stroke Review)",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.vasanth.neuro@sushrutha.gov.in",
        "phone": "+91-9845110015",
        "status": "AVAILABLE",
        "max_active_patients": 10
    },

    # =========================================================================
    # 5. GASTROENTEROLOGY & GENERAL SURGERY
    # =========================================================================
    {
        "doctor_id": "DOC_GAST_JR_01",
        "name": "Dr. Rohan Gupta",
        "department": "Gastroenterology",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident (Surgical Post-Graduate)",
        "qualification": "MBBS",
        "experience_years": 2,
        "room_number": "Surgical OPD Desk 501",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.rohan.gastro@sushrutha.gov.in",
        "phone": "+91-9845110016",
        "status": "AVAILABLE",
        "max_active_patients": 14
    },
    {
        "doctor_id": "DOC_GAST_JR_02",
        "name": "Dr. Megha Sen",
        "department": "Gastroenterology",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident",
        "qualification": "MBBS",
        "experience_years": 1,
        "room_number": "Surgical OPD Desk 502",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.megha.gastro@sushrutha.gov.in",
        "phone": "+91-9845110017",
        "status": "AVAILABLE",
        "max_active_patients": 14
    },
    {
        "doctor_id": "DOC_GAST_SR_01",
        "name": "Dr. Alok Mukherjee",
        "department": "Gastroenterology",
        "tier": "SENIOR_DOCTOR",
        "designation": "Senior Surgical Specialist / Assistant Professor",
        "qualification": "MBBS, MS (General Surgery), MCh (Surgical Gastro)",
        "experience_years": 9,
        "room_number": "Chamber 504 (Endoscopy & Pre-Op)",
        "opd_days": ["Monday", "Wednesday", "Friday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.alok.gastro@sushrutha.gov.in",
        "phone": "+91-9845110018",
        "status": "AVAILABLE",
        "max_active_patients": 10
    },
    {
        "doctor_id": "DOC_GAST_SR_02",
        "name": "Dr. Shalini Prasad",
        "department": "Gastroenterology",
        "tier": "SENIOR_DOCTOR",
        "designation": "Senior Medical Gastroenterologist",
        "qualification": "MBBS, MD, DM (Gastroenterology)",
        "experience_years": 8,
        "room_number": "Chamber 505 (Hepatology Clinic)",
        "opd_days": ["Tuesday", "Thursday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.shalini.gastro@sushrutha.gov.in",
        "phone": "+91-9845110019",
        "status": "AVAILABLE",
        "max_active_patients": 10
    },

    # =========================================================================
    # 6. ORTHOPEDICS & TRAUMA
    # =========================================================================
    {
        "doctor_id": "DOC_ORTH_JR_01",
        "name": "Dr. Manoj Chettiar",
        "department": "Orthopedics",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident (MS Orthopedics Resident - 2nd Year)",
        "qualification": "MBBS",
        "experience_years": 2,
        "room_number": "Ortho Desk 601",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.manoj.ortho@sushrutha.gov.in",
        "phone": "+91-9845110020",
        "status": "AVAILABLE",
        "max_active_patients": 15
    },
    {
        "doctor_id": "DOC_ORTH_JR_02",
        "name": "Dr. Divya Aggarwal",
        "department": "Orthopedics",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident (MS Ortho Resident - 1st Year)",
        "qualification": "MBBS",
        "experience_years": 1,
        "room_number": "Ortho Desk 602",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.divya.ortho@sushrutha.gov.in",
        "phone": "+91-9845110021",
        "status": "AVAILABLE",
        "max_active_patients": 15
    },
    {
        "doctor_id": "DOC_ORTH_JR_03",
        "name": "Dr. Tanveer Ahmed",
        "department": "Orthopedics",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident (MS Ortho Resident - 3rd Year)",
        "qualification": "MBBS",
        "experience_years": 3,
        "room_number": "Ortho Desk 603",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.tanveer.ortho@sushrutha.gov.in",
        "phone": "+91-9845110022",
        "status": "AVAILABLE",
        "max_active_patients": 15
    },
    {
        "doctor_id": "DOC_ORTH_SR_01",
        "name": "Dr. Suresh Nanjappa",
        "department": "Orthopedics",
        "tier": "SENIOR_DOCTOR",
        "designation": "Senior Orthopedic Surgeon / Assistant Professor",
        "qualification": "MBBS, MS (Orthopedics), DNB",
        "experience_years": 9,
        "room_number": "Chamber 604 (Trauma & Fracture Clinic)",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.suresh.ortho@sushrutha.gov.in",
        "phone": "+91-9845110023",
        "status": "AVAILABLE",
        "max_active_patients": 10
    },
    {
        "doctor_id": "DOC_ORTH_SR_02",
        "name": "Prof. Dr. Balakrishna Shetty",
        "department": "Orthopedics",
        "tier": "SENIOR_DOCTOR",
        "designation": "Professor & Head of Orthopedic Surgery",
        "qualification": "MBBS, MS (Orthopedics), MCh (Ortho, UK)",
        "experience_years": 22,
        "room_number": "Chamber 605 (Joint Replacement & Spine)",
        "opd_days": ["Monday", "Thursday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "prof.shetty.ortho@sushrutha.gov.in",
        "phone": "+91-9845110024",
        "status": "AVAILABLE",
        "max_active_patients": 8
    },

    # =========================================================================
    # 7. UROLOGY & NEPHROLOGY
    # =========================================================================
    {
        "doctor_id": "DOC_UROL_JR_01",
        "name": "Dr. Nikhil Tiwari",
        "department": "Urology",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident (MCh Urology Resident)",
        "qualification": "MBBS, MS (Surgery)",
        "experience_years": 3,
        "room_number": "Uro Desk 701",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.nikhil.uro@sushrutha.gov.in",
        "phone": "+91-9845110025",
        "status": "AVAILABLE",
        "max_active_patients": 14
    },
    {
        "doctor_id": "DOC_UROL_JR_02",
        "name": "Dr. Shweta Kulkarni",
        "department": "Urology",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident",
        "qualification": "MBBS",
        "experience_years": 1,
        "room_number": "Uro Desk 702",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.shweta.uro@sushrutha.gov.in",
        "phone": "+91-9845110026",
        "status": "AVAILABLE",
        "max_active_patients": 14
    },
    {
        "doctor_id": "DOC_UROL_SR_01",
        "name": "Dr. Pradeep Channappa",
        "department": "Urology",
        "tier": "SENIOR_DOCTOR",
        "designation": "Senior Urological Surgeon / Associate Professor",
        "qualification": "MBBS, MS, MCh (Urology)",
        "experience_years": 11,
        "room_number": "Chamber 704 (Kidney Stone & Prostate)",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.pradeep.uro@sushrutha.gov.in",
        "phone": "+91-9845110027",
        "status": "AVAILABLE",
        "max_active_patients": 10
    },

    # =========================================================================
    # 8. ENT (OTORHINOLARYNGOLOGY)
    # =========================================================================
    {
        "doctor_id": "DOC_ENT_JR_01",
        "name": "Dr. Varun Reddy",
        "department": "ENT",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident (MS ENT Resident)",
        "qualification": "MBBS",
        "experience_years": 2,
        "room_number": "ENT Desk 801",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.varun.ent@sushrutha.gov.in",
        "phone": "+91-9845110028",
        "status": "AVAILABLE",
        "max_active_patients": 15
    },
    {
        "doctor_id": "DOC_ENT_JR_02",
        "name": "Dr. Shruti Malviya",
        "department": "ENT",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident",
        "qualification": "MBBS",
        "experience_years": 1,
        "room_number": "ENT Desk 802",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.shruti.ent@sushrutha.gov.in",
        "phone": "+91-9845110029",
        "status": "AVAILABLE",
        "max_active_patients": 15
    },
    {
        "doctor_id": "DOC_ENT_SR_01",
        "name": "Dr. Anupama Shastri",
        "department": "ENT",
        "tier": "SENIOR_DOCTOR",
        "designation": "Senior ENT Specialist & Vertigo Consultant",
        "qualification": "MBBS, MS (ENT), DLO",
        "experience_years": 9,
        "room_number": "Chamber 804 (Audiology & Vertigo Clinic)",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.anupama.ent@sushrutha.gov.in",
        "phone": "+91-9845110030",
        "status": "AVAILABLE",
        "max_active_patients": 10
    },

    # =========================================================================
    # 9. OPHTHALMOLOGY
    # =========================================================================
    {
        "doctor_id": "DOC_OPHT_JR_01",
        "name": "Dr. Tarun Ghosh",
        "department": "Ophthalmology",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident (MS Eye Resident)",
        "qualification": "MBBS",
        "experience_years": 2,
        "room_number": "Eye OPD Desk 901",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.tarun.eye@sushrutha.gov.in",
        "phone": "+91-9845110031",
        "status": "AVAILABLE",
        "max_active_patients": 15
    },
    {
        "doctor_id": "DOC_OPHT_JR_02",
        "name": "Dr. Snehalatha K.",
        "department": "Ophthalmology",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident",
        "qualification": "MBBS",
        "experience_years": 1,
        "room_number": "Eye OPD Desk 902",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.snehalatha.eye@sushrutha.gov.in",
        "phone": "+91-9845110032",
        "status": "AVAILABLE",
        "max_active_patients": 15
    },
    {
        "doctor_id": "DOC_OPHT_SR_01",
        "name": "Dr. Sudhir Gangadhar",
        "department": "Ophthalmology",
        "tier": "SENIOR_DOCTOR",
        "designation": "Senior Vitreo-Retinal Surgeon / Assistant Professor",
        "qualification": "MBBS, MS (Ophthalmology), FICO",
        "experience_years": 10,
        "room_number": "Chamber 904 (Retina & Glaucoma Clinic)",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.sudhir.eye@sushrutha.gov.in",
        "phone": "+91-9845110033",
        "status": "AVAILABLE",
        "max_active_patients": 10
    },

    # =========================================================================
    # 10. DERMATOLOGY & ALLERGY
    # =========================================================================
    {
        "doctor_id": "DOC_DERM_JR_01",
        "name": "Dr. Aakash Singhal",
        "department": "Dermatology",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident (MD Derma Resident)",
        "qualification": "MBBS",
        "experience_years": 2,
        "room_number": "Skin Desk 1001",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.aakash.derm@sushrutha.gov.in",
        "phone": "+91-9845110034",
        "status": "AVAILABLE",
        "max_active_patients": 15
    },
    {
        "doctor_id": "DOC_DERM_JR_02",
        "name": "Dr. Lavanya Murthy",
        "department": "Dermatology",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident",
        "qualification": "MBBS",
        "experience_years": 1,
        "room_number": "Skin Desk 1002",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.lavanya.derm@sushrutha.gov.in",
        "phone": "+91-9845110035",
        "status": "AVAILABLE",
        "max_active_patients": 15
    },
    {
        "doctor_id": "DOC_DERM_SR_01",
        "name": "Dr. Rashmi Gowda",
        "department": "Dermatology",
        "tier": "SENIOR_DOCTOR",
        "designation": "Senior Dermatologist & Leprologist",
        "qualification": "MBBS, MD (Dermatology, Venereology & Leprosy)",
        "experience_years": 8,
        "room_number": "Chamber 1004 (Allergy & Psoriasis Clinic)",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.rashmi.derm@sushrutha.gov.in",
        "phone": "+91-9845110036",
        "status": "AVAILABLE",
        "max_active_patients": 10
    },

    # =========================================================================
    # 11. OBSTETRICS & GYNECOLOGY (OB-GYN)
    # =========================================================================
    {
        "doctor_id": "DOC_OBGY_JR_01",
        "name": "Dr. Namrata Dixit",
        "department": "Obstetrics & Gynecology",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident (MS OB-GYN Resident)",
        "qualification": "MBBS",
        "experience_years": 2,
        "room_number": "Maternity OPD Desk 1101",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.namrata.obg@sushrutha.gov.in",
        "phone": "+91-9845110037",
        "status": "AVAILABLE",
        "max_active_patients": 14
    },
    {
        "doctor_id": "DOC_OBGY_JR_02",
        "name": "Dr. Bhavana Reddy",
        "department": "Obstetrics & Gynecology",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident",
        "qualification": "MBBS",
        "experience_years": 1,
        "room_number": "Maternity OPD Desk 1102",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.bhavana.obg@sushrutha.gov.in",
        "phone": "+91-9845110038",
        "status": "AVAILABLE",
        "max_active_patients": 14
    },
    {
        "doctor_id": "DOC_OBGY_SR_01",
        "name": "Dr. Geetha Narayanan",
        "department": "Obstetrics & Gynecology",
        "tier": "SENIOR_DOCTOR",
        "designation": "Senior Gynecological Surgeon / Associate Professor",
        "qualification": "MBBS, MS (OB-GYN), DGO",
        "experience_years": 13,
        "room_number": "Chamber 1104 (High-Risk Pregnancy & Infertility)",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.geetha.obg@sushrutha.gov.in",
        "phone": "+91-9845110039",
        "status": "AVAILABLE",
        "max_active_patients": 10
    },
    {
        "doctor_id": "DOC_OBGY_SR_02",
        "name": "Dr. Anuradha Deshpande",
        "department": "Obstetrics & Gynecology",
        "tier": "SENIOR_DOCTOR",
        "designation": "Senior Resident / Specialist",
        "qualification": "MBBS, DNB (OB-GYN)",
        "experience_years": 7,
        "room_number": "Chamber 1105 (Antenatal Care)",
        "opd_days": ["Monday", "Wednesday", "Friday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.anuradha.obg@sushrutha.gov.in",
        "phone": "+91-9845110040",
        "status": "AVAILABLE",
        "max_active_patients": 10
    },

    # =========================================================================
    # 12. ENDOCRINOLOGY & METABOLISM
    # =========================================================================
    {
        "doctor_id": "DOC_ENDO_JR_01",
        "name": "Dr. Chetan Bhagwat",
        "department": "Endocrinology",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident (Endocrine Fellow)",
        "qualification": "MBBS, MD",
        "experience_years": 2,
        "room_number": "Endo Desk 1201",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.chetan.endo@sushrutha.gov.in",
        "phone": "+91-9845110041",
        "status": "AVAILABLE",
        "max_active_patients": 14
    },
    {
        "doctor_id": "DOC_ENDO_JR_02",
        "name": "Dr. Samyukta Pillai",
        "department": "Endocrinology",
        "tier": "JUNIOR_DOCTOR",
        "designation": "Junior Resident",
        "qualification": "MBBS",
        "experience_years": 1,
        "room_number": "Endo Desk 1202",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.samyukta.endo@sushrutha.gov.in",
        "phone": "+91-9845110042",
        "status": "AVAILABLE",
        "max_active_patients": 14
    },
    {
        "doctor_id": "DOC_ENDO_SR_01",
        "name": "Dr. Madhavan Natarajan",
        "department": "Endocrinology",
        "tier": "SENIOR_DOCTOR",
        "designation": "Senior Endocrinologist & Diabetologist",
        "qualification": "MBBS, MD, DM (Endocrinology)",
        "experience_years": 12,
        "room_number": "Chamber 1204 (Diabetes & Thyroid Clinic)",
        "opd_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.madhavan.endo@sushrutha.gov.in",
        "phone": "+91-9845110043",
        "status": "AVAILABLE",
        "max_active_patients": 10
    }
]

def seed_doctors():
    db = get_database()
    doctors_col = db.doctors
    
    # Create unique index on doctor_id and email
    doctors_col.create_index("doctor_id", unique=True)
    doctors_col.create_index("email", unique=True)
    doctors_col.create_index([("department", 1), ("tier", 1)])
    
    inserted_count = 0
    updated_count = 0
    
    for doc in DOCTORS_DATA:
        doc_record = {
            **doc,
            "current_patient_id": None,
            "active_queue_count": 0,
            "total_consultations_today": 0,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }
        
        res = doctors_col.update_one(
            {"doctor_id": doc["doctor_id"]},
            {"$set": doc_record},
            upsert=True
        )
        if res.upserted_id:
            inserted_count += 1
        else:
            updated_count += 1
            
    total_docs = doctors_col.count_documents({})
    jr_count = doctors_col.count_documents({"tier": "JUNIOR_DOCTOR"})
    sr_count = doctors_col.count_documents({"tier": "SENIOR_DOCTOR"})
    depts = doctors_col.distinct("department")
    
    print("=" * 60)
    print("SUSHRUTHA GRID - DOCTOR DATABASE SEEDING COMPLETED")
    print(f"Total Doctors in DB: {total_docs}")
    print(f"Junior Doctors (JRs): {jr_count}")
    print(f"Senior Doctors (SRs / Consultants): {sr_count}")
    print(f"Departments Configured: {len(depts)}")
    print(f"Collections present in MongoDB: {db.list_collection_names()}")
    print("=" * 60)

if __name__ == "__main__":
    seed_doctors()
