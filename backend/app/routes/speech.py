from fastapi import APIRouter, UploadFile, File, HTTPException, status
from fastapi.responses import JSONResponse
from pathlib import Path
import shutil
import tempfile
from datetime import datetime
from app.database import get_database
from app.services.speech_service import transcribe_audio

router = APIRouter(prefix="/api/speech", tags=["Speech-to-Text Module"])

@router.post("/transcribe")
def transcribe_uploaded_audio(file: UploadFile = File(...)):
    """
    Receives an audio file (e.g. from browser MediaRecorder or upload),
    transcribes it using Whisper, and logs the transcription event.
    """
    # Accept standard audio mime types or audio file extensions
    allowed_extensions = {".wav", ".webm", ".mp3", ".ogg", ".m4a", ".mp4", ".flac"}
    file_ext = Path(file.filename).suffix.lower() if file.filename else ".webm"
    
    if not file.content_type.startswith("audio/") and file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type '{file.content_type}'. Please upload an audio recording."
        )

    temp_path = None
    try:
        # Create a temporary file preserving audio extension
        suffix = file_ext if file_ext else ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_path = Path(temp_file.name)
            shutil.copyfileobj(file.file, temp_file)

        # Transcribe audio using Whisper
        transcription_result = transcribe_audio(str(temp_path))

        # Log operational event for Experiment 1 evaluation
        try:
            db = get_database()
            db.hospital_events.insert_one({
                "event_type": "VOICE_TRANSCRIBED",
                "language": transcription_result["language"],
                "latency_seconds": transcription_result["latency_seconds"],
                "transcription_length": len(transcription_result["text"]),
                "timestamp": datetime.utcnow().isoformat()
            })
        except Exception as db_err:
            print(f"Warning: could not log voice event: {db_err}")

        return {
            "success": True,
            "text": transcription_result["text"],
            "language": transcription_result["language"],
            "latency_seconds": transcription_result["latency_seconds"]
        }

    except RuntimeError as e:
        # Whisper not installed on lean cloud images — typed intake still works
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Speech transcription failed: {str(e)}"
        )

    finally:
        file.file.close()
        if temp_path and temp_path.exists():
            temp_path.unlink(missing_ok=True)
