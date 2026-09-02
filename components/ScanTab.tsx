'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { SugarShieldResult, getStoredMode } from '@/lib/apiClient';

interface ScanTabProps {
  onResult: (result: SugarShieldResult) => void;
  demoMode?: boolean;
}

export default function ScanTab({ onResult, demoMode }: ScanTabProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let currentStream: MediaStream | null = null;

    async function startCamera() {
      // If in demo mode, don't request camera to avoid permission prompts
      if (demoMode) return;

      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        currentStream = s;
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      } catch (err: any) {
        console.error('Camera error:', err);
        setError('Camera access denied. Please check permissions.');
      }
    }

    startCamera();

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [demoMode]);

  async function capturePhoto() {
    if (!videoRef.current || scanning) return;
    const video = videoRef.current;

    setScanning(true);
    setError('');

    try {
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to create canvas context');

      ctx.drawImage(video, 0, 0, w, h);
      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.85);

      const res = await fetch('/api/vision-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl, mode: getStoredMode() }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || 'Vision parse failed');
      }

      onResult({ ...data, ingredientsText: data?.extracted?.ingredientsText });
    } catch (e: any) {
      console.error(e);
      const msg = String(e?.message ?? e);
      setError(msg);
      // Fallback result so user isn't stuck
      onResult({
        riskLevel: 'MODERATE',
        score: 40,
        containsAddedSugar: false,
        containsHiddenSugar: false,
        containsArtificialSweetener: false,
        containsNaturalSugar: false,
        detectedSugars: [],
        artificialSweeteners: [],
        confidence: 0.2,
        explanation: 'Scan process failed: ' + msg,
        model: 'sugarshield-rules-v2',
        latencyMs: 0,
        mode: getStoredMode(),
      } as SugarShieldResult);
    } finally {
      setScanning(false);
    }
  }

  const runDemoScan = () => {
    setScanning(true);
    setTimeout(() => {
      onResult({
        riskLevel: 'VERY_HIGH',
        score: 90,
        containsAddedSugar: true,
        containsHiddenSugar: true,
        containsArtificialSweetener: false,
        containsNaturalSugar: true,
        detectedSugars: ['high fructose corn syrup', 'dextrose', 'fruit juice concentrate'],
        artificialSweeteners: [],
        confidence: 0.92,
        explanation: '3 added sugar sources detected (high fructose corn syrup, dextrose, fruit juice concentrate); includes a sugar source not obviously named "sugar".',
        model: 'sugarshield-rules-v2',
        latencyMs: 4,
        mode: getStoredMode(),
        productName: 'Generic Orange Juice (Demo)',
        ingredientsText: 'Water, High Fructose Corn Syrup, Dextrose, Orange Juice Concentrate, Natural Flavors, Ascorbic Acid.',
      } as SugarShieldResult);
      setScanning(false);
    }, 1500); // Fake delay for realism
  };

  return (
    <div className="relative w-full aspect-[3/4] max-h-[60vh] bg-zinc-900 overflow-hidden group">
      {/* Demo Mode Overlay */}
      {demoMode && (
        <div className="absolute inset-0 z-30 bg-zinc-900 flex flex-col items-center justify-center p-6 text-center">
          <div className="mb-6 opacity-50">
            <span className="text-4xl">📱</span>
          </div>
          <h3 className="text-white font-bold text-lg mb-2">Demo Mode Active</h3>
          <p className="text-zinc-400 text-sm mb-8 max-w-[240px]">
            Camera is disabled. Tap below to simulate scanning a product label.
          </p>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={runDemoScan}
            disabled={scanning}
            className="px-6 py-3 bg-white text-ink font-bold rounded-full shadow-lg flex items-center gap-2"
          >
            {scanning ? (
              <>
                <svg className="animate-spin h-4 w-4 text-ink" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Analyzing...
              </>
            ) : (
              <>
                <span>📸</span> Simulate Scan
              </>
            )}
          </motion.button>
        </div>
      )}

      {error && !demoMode && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6 bg-cream/90 backdrop-blur text-center">
          <div className="text-cocoa">
            <p className="mb-2 text-2xl">📷🚫</p>
            <p className="text-sm font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Video Feed (only if not demo mode) */}
      {!demoMode && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Crosshair / Focus Frame (only if not demo) */}
      {!demoMode && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="w-64 h-40 border border-white/30 rounded-lg relative">
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-white rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-white rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-white rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-white rounded-br-lg" />
          </div>
        </div>
      )}

      {/* Instructions Pill (only if not demo) */}
      {!demoMode && (
        <div className="absolute top-6 left-0 right-0 z-10 flex justify-center">
          <div className="px-4 py-2 rounded-full bg-black/30 backdrop-blur-md border border-white/10 shadow-lg">
            <p className="text-xs font-medium text-white/90">Point at ingredient label</p>
          </div>
        </div>
      )}

      {/* Controls (only if not demo) */}
      {!demoMode && (
        <div className="absolute bottom-8 left-0 right-0 z-20 flex justify-center">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={capturePhoto}
            disabled={!!error || scanning}
            className={`
            w-18 h-18 rounded-full border-4 p-1 transition-all duration-300 transition-transform active:scale-95 hover:-translate-y-px
            ${scanning
                ? 'border-zinc-400 bg-transparent'
                : 'border-white bg-transparent hover:scale-105'
              }
          `}
          >
            <div className={`w-full h-full rounded-full transition-all duration-300 ${scanning ? 'bg-zinc-400 scale-90' : 'bg-white'}`} />
          </motion.button>
        </div>
      )}
    </div>
  );
}
