import io
import wave
import struct
import math
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_database

client = TestClient(app)

def create_synthetic_wav() -> bytes:
    """Generates a 1-second silent/sine wav audio in memory for pipeline testing."""
    sample_rate = 16000
    duration_sec = 1.0
    num_samples = int(sample_rate * duration_sec)
    
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        
        # Generate silence/low tone
        data = bytearray()
        for i in range(num_samples):
            value = int(500 * math.sin(2 * math.pi * 440 * (i / sample_rate)))
            data.extend(struct.pack("<h", value))
            
        wav_file.writeframes(data)
    
    return buffer.getvalue()

def test_speech_transcription_endpoint():
    wav_bytes = create_synthetic_wav()
    
    files = {
        "file": ("test_intake.wav", io.BytesIO(wav_bytes), "audio/wav")
    }
    
    response = client.post("/api/speech/transcribe", files=files)
    assert response.status_code == 200, f"Speech transcription failed: {response.text}"
    
    data = response.json()
    assert data["success"] is True
    assert "text" in data
    assert "language" in data
    assert "latency_seconds" in data
    assert isinstance(data["latency_seconds"], (int, float))
    
    # Verify event logged in MongoDB
    db = get_database()
    logged_event = db.hospital_events.find_one({"event_type": "VOICE_TRANSCRIBED"})
    assert logged_event is not None
    assert "latency_seconds" in logged_event
    
    print(f"Speech transcription tested successfully! Detected language: '{data['language']}', Latency: {data['latency_seconds']}s")

if __name__ == "__main__":
    test_speech_transcription_endpoint()
