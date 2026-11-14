import { useState, useEffect, useRef, useCallback } from 'react';

// Pure Web Audio API two-tone chime for hospital announcements
export const playHospitalChime = (type = 'call') => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'call') {
      // Standard airport/hospital two-tone attention chime (A5 -> E5)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(659.25, now + 0.28);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
      osc.start(now);
      osc.stop(now + 0.85);
    } else if (type === 'prescription') {
      // Ascending triple chime (C5 -> E5 -> G5)
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.16);
      osc.frequency.setValueAtTime(783.99, now + 0.32);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      osc.start(now);
      osc.stop(now + 0.9);
    }
  } catch (err) {
    // Graceful fallback if audio context blocked before user interaction
    console.debug('Audio chime silent fallback:', err);
  }
};

/**
 * Build WS URL from the same base as REST (VITE_API_URL).
 * Local default stays ws://127.0.0.1:8000/ws/hospital.
 * Tunnel / ngrok / https → wss://<same-host>/ws/hospital.
 */
export function resolveHospitalWsUrl() {
  const apiBase = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';
  try {
    const u = new URL(apiBase, typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8000');
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${u.host}/ws/hospital`;
  } catch {
    return 'ws://127.0.0.1:8000/ws/hospital';
  }
}

/**
 * Hook to connect to Sushrutha Hospital WebSocket Event Bus
 */
export function useHospitalWebSocket(onEventReceived) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const callbackRef = useRef(onEventReceived);

  // Keep latest callback reference
  useEffect(() => {
    callbackRef.current = onEventReceived;
  }, [onEventReceived]);

  const connect = useCallback(() => {
    // Clear any existing connection
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {}
    }

    const wsUrl = resolveHospitalWsUrl();

    try {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setIsConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          setLastEvent(payload);
          if (callbackRef.current) {
            callbackRef.current(payload);
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      socket.onclose = () => {
        setIsConnected(false);
        // Automatic reconnection attempt after 3s
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      socket.onerror = () => {
        setIsConnected(false);
      };
    } catch (err) {
      setIsConnected(false);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 4000);
    }
  }, []);

  useEffect(() => {
    connect();

    // Ping every 25 seconds to keep connection alive
    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'PING' }));
      }
    }, 25000);

    return () => {
      clearInterval(pingInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (e) {}
      }
    };
  }, [connect]);

  return { isConnected, lastEvent };
}
