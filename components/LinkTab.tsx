'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ProductData } from '@/lib/types';
import { analyzeIngredients, SugarShieldResult } from '@/lib/apiClient';
import { trackEvent } from '@/lib/analytics';
import SkeletonLoader from './SkeletonLoader';

function riskToVerdict(riskLevel: string): 'PASS' | 'WARN' | 'FAIL' {
  if (riskLevel === 'SAFE') return 'PASS';
  if (riskLevel === 'LOW' || riskLevel === 'MODERATE') return 'WARN';
  return 'FAIL';
}

interface LinkTabProps {
  onResult: (result: SugarShieldResult) => void;
  demoMode?: boolean;
}

export default function LinkTab({ onResult, demoMode }: LinkTabProps) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New state for fallback manual entry
  const [needsIngredients, setNeedsIngredients] = useState(false);
  const [manualIngredients, setManualIngredients] = useState('');

  // Handle Demo Mode
  useEffect(() => {
    if (demoMode) {
      setUrl('https://www.example.com/cola-soda');
      setNeedsIngredients(true);
      setManualIngredients('Carbonated Water, High Fructose Corn Syrup, Caramel Color, Phosphoric Acid, Natural Flavors, Caffeine.');
      setError(null);
    } else {
      // Reset if demo mode is turned off, or keep it? 
      // Better to reset to avoid confusion.
      setUrl('');
      setNeedsIngredients(false);
      setManualIngredients('');
    }
  }, [demoMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!url.trim()) {
      setError('Please enter a website address');
      return;
    }

    // specific check for manual entry flow
    if (needsIngredients) {
      await handleManualSubmit();
      return;
    }

    try {
      if (!demoMode) new URL(url); // Skip URL validation in demo mode
    } catch {
      setError('Invalid web address. Try copying from your browser.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setNeedsIngredients(false);

    try {
      const response = await fetch(`/api/link-extract?url=${encodeURIComponent(url)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to extract data');
      }

      // Check for NEED_INGREDIENTS status
      if (data.status === 'NEED_INGREDIENTS') {
        setNeedsIngredients(true);
        setError('We couldn’t reliably find the ingredients on this page. Please paste them below for an accurate analysis.');
        setIsLoading(false);
        return;
      }

      const productData: ProductData = data;

      if (!productData.ingredientsText) {
        setNeedsIngredients(true);
        setError('We couldn’t reliably find the ingredients on this page. Please paste them below for an accurate analysis.');
        setIsLoading(false);
        return;
      }

      const result = await analyzeIngredients(productData.ingredientsText, {
        productName: productData.name || undefined,
      });
      trackEvent('link', riskToVerdict(result.riskLevel));
      onResult({ ...result, ingredientsText: productData.ingredientsText, productName: productData.name || undefined });
    } catch (err: any) {
      console.error('Link extraction error:', err);
      // Fallback for demo if API isn't real/setup
      onResult({
        riskLevel: 'MODERATE',
        score: 40,
        containsAddedSugar: false,
        containsHiddenSugar: false,
        containsArtificialSweetener: false,
        containsNaturalSugar: false,
        detectedSugars: [],
        artificialSweeteners: [],
        confidence: 0.4,
        explanation: 'Link analysis failed. Try scanning, uploading, or pasting ingredients directly.',
        model: 'sugarshield-rules-v2',
        latencyMs: 0,
        mode: 'STRICT',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualIngredients.trim()) {
      setError('Please paste the ingredients list.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await analyzeIngredients(manualIngredients);
      trackEvent('link_manual', riskToVerdict(result.riskLevel));
      onResult({ ...result, ingredientsText: manualIngredients });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-center">
        <div className="w-10 h-10 border-4 border-cocoa/20 border-t-cocoa rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-cocoa">Reading product page...</p>
      </div>
    );
  }

  return (
    <div className="p-8 bg-paper">
      <div className="mb-6 text-center">
        <h2 className="text-lg font-bold text-ink mb-1">Paste Product Link</h2>
        <p className="text-sm text-zinc-500">
          Analyze products from Amazon, Walmart, or other online stores.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <input
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              // Reset state if user changes URL
              setNeedsIngredients(false);
              setError(null);
            }}
            placeholder="https://www.amazon.com/dp/..."
            className="w-full px-4 py-3 bg-subtle border border-black/5 rounded-xl text-ink text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-cocoa/20 focus:border-cocoa transition-all"
          />
        </div>

        {needsIngredients && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-2"
          >
            <label className="text-xs font-bold text-ink ml-1">Paste Ingredients List:</label>
            <textarea
              value={manualIngredients}
              onChange={(e) => setManualIngredients(e.target.value)}
              placeholder="e.g. Sugar, Corn Syrup, Water..."
              rows={4}
              className="w-full px-4 py-3 bg-white border border-amber-200 rounded-xl text-ink text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
            />
          </motion.div>
        )}

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`text-xs font-medium px-1 ${needsIngredients ? 'text-amber-600' : 'text-red-500'}`}
          >
            {error}
          </motion.p>
        )}

        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          type="submit"
          disabled={!url.trim()}
          className="w-full py-3.5 bg-cocoa text-white rounded-xl font-semibold shadow-sm hover:shadow-md hover:bg-cocoa/90 transition-all disabled:opacity-50 disabled:shadow-none active:scale-95 hover:-translate-y-px"
        >
          {needsIngredients ? 'Analyze Ingredients' : 'Analyze Link'}
        </motion.button>
      </form>

      <div className="mt-8 pt-6 border-t border-black/5">
        <div className="flex items-start gap-2.5 bg-amber-50 p-3 rounded-xl border border-amber-100">
          <span className="text-sm">💡</span>
          <p className="text-xs text-amber-800/80 leading-relaxed">
            <strong>Tip:</strong> Link extraction works best on major e-commerce sites.
            For best accuracy, verify with ingredients on the physical package.
          </p>
        </div>
      </div>
    </div>
  );
}
