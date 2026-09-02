'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { getStoredMode } from '@/lib/apiClient';

type Props = { onResult: (result: any) => void };

export default function UploadTab({ onResult }: Props) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState<string>('');

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setErr('');
    setLoading(true);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const imageDataUrl = String(reader.result || '');
        setPreview(imageDataUrl);

        const res = await fetch('/api/vision-parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageDataUrl, mode: getStoredMode() }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setErr(data?.error || 'Vision parse failed');
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
            explanation: data?.error || 'Vision parse failed',
            model: 'sugarshield-rules-v2',
            latencyMs: 0,
            mode: getStoredMode(),
          });
          return;
        }

        onResult({ ...data, ingredientsText: data?.extracted?.ingredientsText });
      } catch (e: any) {
        setErr(String(e?.message ?? e));
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
          explanation: String(e?.message ?? e),
          model: 'sugarshield-rules-v2',
          latencyMs: 0,
          mode: getStoredMode(),
        });
      } finally {
        setLoading(false);
      }
    };

    reader.readAsDataURL(file);
  }

  return (
    <div className="p-8 text-center bg-paper">
      <label className="group relative flex flex-col items-center justify-center w-full aspect-[3/2] border-2 border-dashed border-cocoa/20 rounded-2xl bg-cream/30 hover:bg-cream/60 hover:border-cocoa/40 transition-all duration-200 cursor-pointer overflow-hidden active:scale-95 hover:-translate-y-px">
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.08] pointer-events-none">
          <svg width="120" height="120" viewBox="0 0 24 24" fill="currentColor" className="text-cocoa">
            <path d="M19 5H5C3.89543 5 3 5.89543 3 7V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V7C21 5.89543 20.1046 5 19 5Z" />
          </svg>
        </div>
        <input type="file" accept="image/*" onChange={handleFile} className="hidden" />

        {loading ? (
          <div className="flex flex-col items-center gap-3 relative z-10">
            <div className="w-8 h-8 rounded-full border-2 border-cocoa/20 border-t-cocoa animate-spin" />
            <p className="text-sm font-medium text-cocoa">Analyzing...</p>
          </div>
        ) : preview ? (
          <img src={preview} alt="Uploaded" className="absolute inset-0 w-full h-full object-contain p-4 z-10" />
        ) : (
          <div className="flex flex-col items-center gap-2 relative z-10">
            <span className="text-3xl text-cocoa/50 group-hover:scale-110 transition-transform duration-300">📤</span>
            <p className="text-sm font-semibold text-cocoa/80">Tap to Upload Label</p>
            <p className="text-xs text-zinc-400">JPG • PNG • HEIC</p>
          </div>
        )}
      </label>

      {err && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-3 rounded-lg bg-red-50 text-red-600 text-xs font-medium border border-red-100"
        >
          {err}
        </motion.div>
      )}
    </div>
  );
}
