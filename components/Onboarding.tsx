'use client';

import { motion } from 'framer-motion';

export default function Onboarding() {
    return (
        <div className="py-8 px-4 text-center">
            <div className="mb-6 flex justify-center">
                {/* Subtle sugar cube animation */}
                <div className="relative w-16 h-16">
                    <motion.div
                        initial={{ opacity: 0, y: 10, rotate: 0 }}
                        animate={{ opacity: 1, y: 0, rotate: 10 }}
                        transition={{ duration: 2, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
                        className="absolute top-0 left-0 w-8 h-8 bg-paper border border-black/5 rounded shadow-sm z-10"
                    />
                    <motion.div
                        initial={{ opacity: 0, y: 10, rotate: 0 }}
                        animate={{ opacity: 0.8, y: 4, rotate: -5 }}
                        transition={{ delay: 0.5, duration: 2.5, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
                        className="absolute top-4 left-4 w-8 h-8 bg-paper border border-black/5 rounded shadow-sm"
                    />
                </div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <h2 className="text-lg font-semibold text-ink mb-2">See beyond the label.</h2>
                <p className="text-sm text-zinc-500 max-w-xs mx-auto leading-relaxed">
                    Added sugars often hide behind names you don&apos;t recognize.
                    <br /><span className="text-cocoa font-medium">SugarShield helps you spot them instantly.</span>
                </p>
            </motion.div>
        </div>
    );
}
