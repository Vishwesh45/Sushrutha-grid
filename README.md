# Sushrutha Grid

**Intelligent Real-Time Government Hospital Workflow and Patient Coordination Platform**

Sushrutha Grid is an intelligent hospital workflow platform designed for government-hospital environments, bridging patient intake, clinical consultation, queue management, and real-time operational coordination.

---

## Architecture Overview

```text
React Frontend (Vite)
       |
       | REST API / WebSocket
       ↓
FastAPI Backend
       |
       ├── Authentication (JWT + RBAC)
       ├── Patient Module
       ├── Speech-to-Text (Whisper)
       ├── NLP Layer (Symptom & Context Extraction)
       ├── Decision Engine (Explainable Rules)
       ├── Queue Management
       ├── Doctor & Nurse Modules
       ├── Real-Time Event Processing
       ├── Admin Monitoring
       └── Machine Learning (Waiting-Time Prediction & Demand Forecasting)
       |
       ↓
MongoDB (PyMongo)
```

---

## Project Structure

```text
sushrutha/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI application entrypoint
│   │   ├── config.py        # Environment and app configuration
│   │   ├── database.py      # MongoDB connection and utilities
│   │   ├── routes/          # API route definitions
│   │   └── ...
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── ...
│   └── package.json
└── README.md
```

---

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- MongoDB Server running locally on port 27017
- FFmpeg (for audio processing)

### Backend Setup
1. Create and activate virtual environment:
   ```bash
   py -3.11 -m venv venv
   .\venv\Scripts\activate
   ```
2. Install dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```
3. Run FastAPI backend:
   ```bash
   cd backend
   python -m uvicorn app.main:app --reload --port 8000
   ```
   Or from root:
   ```bash
   $env:PYTHONPATH="backend"; .\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
   ```

### Frontend Setup
1. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```
2. Start development server:
   ```bash
   npm run dev
   ```
