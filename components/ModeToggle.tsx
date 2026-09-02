'use client';

import { useState, useEffect } from 'react';
import { EvalMode } from '@/lib/riskEngine';
import { getStoredMode, setStoredMode } from '@/lib/apiClient';

export default function ModeToggle() {
  const [mode, setMode] = useState<EvalMode>('STRICT');
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    setMode(getStoredMode());
  }, []);

  const handleChange = (next: EvalMode) => {
    setMode(next);
    setStoredMode(next);
  };

  return (
    <div className="bg-white border border-zinc-100 rounded-xl p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="bg-black/5 p-1 rounded-lg flex text-xs font-semibold">
          <button
            onClick={() => handleChange('STRICT')}
            className={`px-3 py-1 rounded-md transition-all ${mode === 'STRICT' ? 'bg-white shadow-sm text-ink' : 'text-zinc-500'}`}
          >
            Strict
          </button>
          <button
            onClick={() => handleChange('LENIENT')}
            className={`px-3 py-1 rounded-md transition-all ${mode === 'LENIENT' ? 'bg-white shadow-sm text-ink' : 'text-zinc-500'}`}
          >
            Lenient
          </button>
        </div>
        <button
          onClick={() => setShowInfo((s) => !s)}
          className="text-xs text-zinc-400 hover:text-zinc-600 font-medium underline-offset-2 hover:underline"
        >
          {showInfo ? 'Hide' : 'Why differ?'}
        </button>
      </div>

      {showInfo && (
        <p className="text-xs text-zinc-500 leading-relaxed mt-2 pt-2 border-t border-zinc-100">
          {mode === 'STRICT'
            ? 'Strict mode is safety-first: it weighs artificial sweeteners and sugar alcohols heavily so hidden sugar is never missed, at the cost of flagging some borderline products more often.'
            : 'Lenient mode still catches every added and hidden sugar, but weighs debated ingredients (stevia, monk fruit, erythritol, diet soda) much less, so it warns less on products where the science is unsettled.'}
        </p>
      )}
    </div>
  );
}
