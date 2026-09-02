'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsDrawer({ isOpen, onClose }: SettingsDrawerProps) {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  useEffect(() => {
    setHasApiKey(null);
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-cream border-l border-black/5 z-50 overflow-y-auto shadow-2xl"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold text-ink tracking-tight">Settings</h2>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 transition-colors text-zinc-500"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6">
                <div className="bg-paper rounded-2xl p-5 shadow-sm border border-black/5">
                  <h3 className="text-sm font-semibold text-ink mb-2">OpenAI Integration</h3>
                  <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
                    SugarShield uses OpenAI only to read the ingredients text out of a photo (OCR). All sugar-risk
                    scoring is done by SugarShield&apos;s own deterministic engine, not a third-party model — barcode
                    scanning and pasted-link analysis work fully without this key.
                  </p>
                  <div className="bg-subtle rounded-xl p-3 border border-black/5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-zinc-500">OPENAI_API_KEY</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-zinc-200 rounded text-zinc-600 font-medium">
                        Server-side
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400">
                      Configured in .env.local
                    </p>
                  </div>
                </div>

                <div className="bg-paper rounded-2xl p-5 shadow-sm border border-black/5">
                  <h3 className="text-sm font-semibold text-cocoa mb-3">Privacy & Safety</h3>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-2 text-xs text-zinc-600">
                      <span className="text-cocoa mt-0.5">shield</span>
                      <span>No images stored on servers</span>
                    </li>
                    <li className="flex items-start gap-2 text-xs text-zinc-600">
                      <span className="text-cocoa mt-0.5">lock</span>
                      <span>Analytics are local-device only</span>
                    </li>
                  </ul>
                </div>

                <div className="pt-6 border-t border-black/5">
                  <p className="text-xs text-zinc-400 text-center">
                    SugarShield 2.0 • Designed for Health
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
