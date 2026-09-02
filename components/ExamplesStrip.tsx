'use client';

import { motion } from 'framer-motion';
import { SugarShieldResult } from '@/lib/apiClient';

interface ExamplesStripProps {
    onSelect: (result: SugarShieldResult) => void;
}

const BASE = { model: 'sugarshield-rules-v2', latencyMs: 3, mode: 'STRICT' as const };

export default function ExamplesStrip({ onSelect }: ExamplesStripProps) {
    const examples: { id: string; label: string; icon: string; result: SugarShieldResult }[] = [
        {
            id: 'cola',
            label: 'Cola Can',
            icon: '🥤',
            result: {
                ...BASE,
                riskLevel: 'VERY_HIGH',
                score: 88,
                containsAddedSugar: true,
                containsHiddenSugar: false,
                containsArtificialSweetener: false,
                containsNaturalSugar: false,
                detectedSugars: ['high fructose corn syrup'],
                artificialSweeteners: [],
                confidence: 0.95,
                explanation: '1 added sugar source detected (high fructose corn syrup), prominently placed near the top of the ingredient list.',
                productName: 'Classic Cola',
                ingredientsText: 'Carbonated Water, High Fructose Corn Syrup, Caramel Color, Phosphoric Acid, Natural Flavors, Caffeine.',
            },
        },
        {
            id: 'cookies',
            label: 'Oat Cookies',
            icon: '🍪',
            result: {
                ...BASE,
                riskLevel: 'HIGH',
                score: 65,
                containsAddedSugar: true,
                containsHiddenSugar: true,
                containsArtificialSweetener: false,
                containsNaturalSugar: false,
                detectedSugars: ['brown rice syrup', 'cane sugar'],
                artificialSweeteners: [],
                confidence: 0.85,
                explanation: '2 added sugar sources detected (brown rice syrup, cane sugar); includes a sugar source not obviously named "sugar".',
                productName: '"Healthy" Oat Cookies',
                ingredientsText: 'Whole Grain Oats, Brown Rice Syrup, Cane Sugar, Palm Oil, Raisins.',
            },
        },
        {
            id: 'yogurt',
            label: 'Greek Yogurt',
            icon: '🥣',
            result: {
                ...BASE,
                riskLevel: 'SAFE',
                score: 0,
                containsAddedSugar: false,
                containsHiddenSugar: false,
                containsArtificialSweetener: false,
                containsNaturalSugar: true,
                detectedSugars: [],
                artificialSweeteners: [],
                confidence: 0.7,
                explanation: 'No added sugar or artificial sweeteners detected. Naturally occurring sugars (e.g. lactose) may be present.',
                productName: 'Plain Greek Yogurt',
                ingredientsText: 'Cultured Pasteurized Nonfat Milk.',
            },
        },
    ];

    return (
        <div className="py-4 border-t border-black/5">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3 px-1">
                Try Examples
            </h3>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {examples.map((ex) => (
                    <motion.button
                        key={ex.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => onSelect(ex.result)}
                        className="flex items-center gap-2.5 px-3 py-2 bg-paper border border-black/5 rounded-xl shadow-sm hover:shadow-md transition-all shrink-0"
                    >
                        <span className="text-lg">{ex.icon}</span>
                        <span className="text-sm font-medium text-ink">{ex.label}</span>
                    </motion.button>
                ))}
            </div>
        </div>
    );
}
