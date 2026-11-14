import os
from dotenv import load_dotenv

# Load .env file from backend root
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
load_dotenv(dotenv_path=dotenv_path)

PORT = int(os.getenv("PORT", 8000))
HOST = os.getenv("HOST", "127.0.0.1")
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "sushrutha_grid")
JWT_SECRET = os.getenv("JWT_SECRET", "sushrutha_super_secret_jwt_key_2026")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", 1440))
# Local Vite ports by default. For ngrok demo day set CORS_ORIGINS=* in backend/.env
_cors_raw = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
).strip()
CORS_ORIGINS = ["*"] if _cors_raw == "*" else [o.strip() for o in _cors_raw.split(",") if o.strip()]

# Email & SMTP Configuration (Supports Gmail App Passwords / Brevo / Local Simulation)
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "noreply@sushrutha.gov.in")
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "Sushrutha Grid Hospital Platform")

# Patient visit assistant (rule-gated LLM). Provider: openai | groq | xai | off
PATIENT_LLM_PROVIDER = (os.getenv("PATIENT_LLM_PROVIDER", "openai") or "openai").strip().lower()
PATIENT_LLM_MODEL = os.getenv("PATIENT_LLM_MODEL", "").strip()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").strip()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
XAI_API_KEY = os.getenv("XAI_API_KEY", "").strip()
XAI_BASE_URL = os.getenv("XAI_BASE_URL", "https://api.x.ai/v1").strip()
