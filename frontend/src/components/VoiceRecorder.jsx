import React, { useState, useRef } from 'react';
import { Mic, Square, Loader2, Sparkles, CheckCircle2, AlertCircle, RotateCw, Trash2 } from 'lucide-react';
import api from '../services/api';

export default function VoiceRecorder({ onTranscriptionComplete, onClearTranscription }) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcriptionInfo, setTranscriptionInfo] = useState(null);
  const [audioError, setAudioError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const startRecording = async () => {
    setAudioError(null);
    setTranscriptionInfo(null);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await uploadAudio(audioBlob);
      };

      mediaRecorder.start();
      setRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access failed:', err);
      setAudioError('Microphone access denied or unavailable. You can type your symptoms directly.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      clearInterval(timerRef.current);
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const handleClearTranscription = () => {
    const lastText = transcriptionInfo?.text;
    setTranscriptionInfo(null);
    setAudioError(null);
    if (onClearTranscription) {
      onClearTranscription(lastText);
    }
  };

  const uploadAudio = async (blob) => {
    setTranscribing(true);
    const formData = new FormData();
    formData.append('file', blob, 'patient_recording.webm');

    try {
      const res = await api.post('/speech/transcribe', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const { text, language, latency_seconds } = res.data;
      setTranscriptionInfo({ text, language, latency_seconds });

      if (text && onTranscriptionComplete) {
        onTranscriptionComplete(text);
      }
    } catch (err) {
      console.error('Speech transcription error:', err);
      setAudioError(err.response?.data?.detail || 'Transcription failed. Please try speaking again.');
    } finally {
      setTranscribing(false);
    }
  };

  const formatSeconds = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="voice-recorder-card">
      <div className="voice-card-header">
        <div className="voice-header-title">
          <div className="voice-pulse-ring">
            <Mic className="icon-mic-head" size={16} />
          </div>
          <div>
            <h4>Voice Symptom Dictation (Whisper STT)</h4>
            <p>Speak in Kannada, English, or Hindi — local Whisper translates & transcribes automatically.</p>
          </div>
        </div>
      </div>

      <div className="voice-recorder-body">
        {!recording && !transcribing && (
          <button
            type="button"
            className="btn-voice-start"
            onClick={startRecording}
          >
            <span className="mic-circle-btn">
              <Mic size={18} />
            </span>
            <span>{transcriptionInfo ? 'Record New Voice Dictation' : 'Record Patient Voice Complaint'}</span>
          </button>
        )}

        {recording && (
          <div className="recording-active-container">
            <div className="rec-info-cluster">
              <span className="rec-pulsing-dot"></span>
              <span className="rec-clock">{formatSeconds(recordingTime)}</span>
              <div className="audio-wave-bars">
                <span className="wave-bar bar-1"></span>
                <span className="wave-bar bar-2"></span>
                <span className="wave-bar bar-3"></span>
                <span className="wave-bar bar-4"></span>
                <span className="wave-bar bar-5"></span>
              </div>
            </div>

            <button
              type="button"
              className="btn-voice-stop"
              onClick={stopRecording}
            >
              <Square size={16} fill="currentColor" />
              <span>Stop & Transcribe with Whisper</span>
            </button>
          </div>
        )}

        {transcribing && (
          <div className="transcribing-status-panel">
            <Loader2 className="spinner-icon animate-spin" size={20} />
            <div className="transcribing-text-cluster">
              <strong>Transcribing Patient Voice Stream...</strong>
              <span>Processing via local OpenAI Whisper base model</span>
            </div>
          </div>
        )}
      </div>

      {audioError && (
        <div className="voice-error-toast">
          <div className="voice-error-content">
            <AlertCircle size={16} />
            <span>{audioError}</span>
          </div>
          <button
            type="button"
            className="btn-voice-retry"
            onClick={startRecording}
            title="Retry recording"
          >
            <RotateCw size={13} />
            <span>Retry</span>
          </button>
        </div>
      )}

      {transcriptionInfo && (
        <div className="voice-success-chip">
          <div className="voice-chip-meta">
            <span className="meta-badge-success">
              <CheckCircle2 size={13} /> Whisper Transcribed
            </span>
            <span className="meta-stats">
              Lang: <strong>{transcriptionInfo.language.toUpperCase()}</strong> • Latency: <strong>{transcriptionInfo.latency_seconds}s</strong>
            </span>
          </div>
          <p className="voice-transcript-text">"{transcriptionInfo.text}"</p>

          <div className="voice-chip-actions">
            <button
              type="button"
              className="btn-voice-action rerecord"
              onClick={startRecording}
              title="Record voice again"
            >
              <RotateCw size={13} />
              <span>Re-record Voice</span>
            </button>
            <button
              type="button"
              className="btn-voice-action clear"
              onClick={handleClearTranscription}
              title="Clear this transcription"
            >
              <Trash2 size={13} />
              <span>Clear Transcription</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
