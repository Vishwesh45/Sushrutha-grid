from functools import lru_cache
from pathlib import Path
import time


@lru_cache(maxsize=1)
def get_whisper_model():
    """
    Loads and caches the Whisper model in memory.
    Uses 'base' for optimal balance of speed and transcription quality.
    Optional dependency: not required for core API deploy (Render free tier).
    """
    try:
        import whisper
    except ImportError as exc:
        raise RuntimeError(
            "Speech-to-text is not installed on this server. "
            "Install openai-whisper locally, or use typed intake on cloud."
        ) from exc

    print("Loading Whisper base model...")
    model = whisper.load_model("base")
    print("Whisper model loaded successfully.")
    return model


def transcribe_audio(audio_file_path: str) -> dict:
    """
    Transcribes the given audio file using Whisper.
    Returns the recognized text, detected language, and latency.
    """
    start_time = time.time()
    model = get_whisper_model()

    result = model.transcribe(
        str(audio_file_path),
        fp16=False,
        task="transcribe",
    )

    latency = round(time.time() - start_time, 3)
    text = result.get("text", "").strip()
    language = result.get("language", "en")

    return {
        "text": text,
        "language": language,
        "latency_seconds": latency,
    }
