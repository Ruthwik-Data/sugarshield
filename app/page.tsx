'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ScanTab from '@/components/ScanTab';
import UploadTab from '@/components/UploadTab';
import LinkTab from '@/components/LinkTab';
import ResultCard from '@/components/ResultCard';
import TopHeader from '@/components/TopHeader';
import SegmentedTabs from '@/components/SegmentedTabs';
import DisclaimerCard from '@/components/DisclaimerCard';
import ExamplesStrip from '@/components/ExamplesStrip';
import Onboarding from '@/components/Onboarding';
import ModeToggle from '@/components/ModeToggle';
import { SugarShieldResult } from '@/lib/apiClient';

type Tab = 'scan' | 'upload' | 'link';

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('scan');
  const [result, setResult] = useState<SugarShieldResult | null>(null);

  return (
    <div className="min-h-screen sugar-bg text-ink pb-24">
      <TopHeader />

      <main className="max-w-xl mx-auto px-4 py-8 space-y-6">

        <Onboarding />

        {/* PRIMARY SURFACE CALLOUT: the Chrome extension is where SugarShield
            is meant to be used — at the shelf or while shopping online, not
            by copy-pasting into a web page. This app is the manual
            analyzer, benchmark dashboard, and technical-transparency layer
            behind it, sharing the same /api/analyze contract. */}
        <section className="bg-cocoa/5 border border-cocoa/15 rounded-2xl p-5 shadow-sm space-y-2">
          <p className="text-xs font-semibold text-cocoa uppercase tracking-wider">Best used as a Chrome extension</p>
          <p className="text-sm text-zinc-600 leading-relaxed">
            SugarShield&apos;s primary surface is a Chrome extension that scans product pages on Amazon, Walmart, and
            Target automatically while you shop, plus a manual paste-and-analyze form that works anywhere. This web
            app is the secondary surface — a manual analyzer, the benchmark dashboard, and the technical-transparency
            record behind the same detection engine.
          </p>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Not yet on the Chrome Web Store — load it unpacked in two minutes: <code className="bg-white px-1 py-0.5 rounded border border-zinc-200">chrome://extensions</code> →
            enable Developer mode → Load unpacked → select the <code className="bg-white px-1 py-0.5 rounded border border-zinc-200">extension/</code> folder.
            Full steps in <code className="bg-white px-1 py-0.5 rounded border border-zinc-200">extension/README.md</code>.
          </p>
        </section>

        {/* 1. PROBLEM → 2. VALUE PROP → 3. HEADLINE */}
        <section className="bg-white border border-zinc-100 rounded-2xl p-5 shadow-sm space-y-4">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">The problem</p>
          <p className="text-sm text-zinc-500 leading-relaxed">
            Food labels hide sugar under dozens of ingredient names, making it hard to know what you&apos;re actually buying.
          </p>

          <p className="text-base font-semibold text-zinc-700 leading-relaxed">
            Turns label confusion into a clear decision in three seconds at the shelf.
          </p>

          <h1 className="text-3xl md:text-4xl font-semibold leading-tight text-zinc-900">
            Scan food. Instantly know if it&apos;s safe for your sugar levels.
          </h1>
        </section>

        {/* 4. WHO IT'S FOR */}
        <section className="bg-white border border-zinc-100 rounded-2xl p-5 shadow-sm space-y-2">
          <h3 className="text-sm font-semibold text-zinc-700">Who this is for</h3>
          <ul className="text-sm text-zinc-500 list-disc pl-5 space-y-1">
            <li>Parents buying snacks for their kids</li>
            <li>People managing pre-diabetes</li>
            <li>Fitness-focused shoppers tracking sugar intake</li>
          </ul>
        </section>

        {/* 5. PRODUCT DECISION */}
        <section className="bg-amber-50 border border-amber-100 rounded-2xl p-5 shadow-sm space-y-1">
          <h3 className="text-sm font-semibold text-zinc-700">Our product decision</h3>
          <p className="text-sm text-zinc-500 leading-relaxed">
            We designed SugarShield to be conservative on false negatives because, for these users, missing hidden sugar is riskier than over-flagging it. The product is intentionally designed to minimize false negatives.
          </p>
        </section>

        {/* 6. REAL EXAMPLE */}
        <section className="bg-zinc-50 border border-zinc-100 rounded-2xl p-5 shadow-sm">
          <p className="text-sm text-zinc-500 leading-relaxed">
            Example: A product listed &quot;corn syrup solids&quot; instead of sugar.
            A keyword-based system would miss it. SugarShield flags this as hidden sugar risk.
          </p>
        </section>

        {/* 7. HOW IT WORKS */}
        <section className="bg-white border border-zinc-100 rounded-2xl p-5 shadow-sm space-y-2">
          <h3 className="text-sm font-semibold text-zinc-700">How it works</h3>
          <ol className="text-sm text-zinc-500 list-decimal pl-5 space-y-1">
            <li>Scan or input a product</li>
            <li>Analyze ingredients and nutrition data</li>
            <li>Get a clear Safe / Caution / Avoid decision</li>
          </ol>
        </section>

        {/* 8. ACCURACY / LIMITS */}
        <section className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 shadow-sm space-y-1">
          <h3 className="text-sm font-semibold text-zinc-700">Model Evaluation</h3>
          <p className="text-sm text-zinc-500 leading-relaxed">
            0 false negatives on our current test set. Built to minimize missed hidden sugars.
          </p>
          <Link href="/eval" className="text-xs font-semibold text-emerald-700 hover:underline mt-1 inline-block">
            View evaluation →
          </Link>
        </section>

        <DisclaimerCard />

        {/* 9. TOOL / CTA */}
        <div className="space-y-4">
          <ModeToggle />

          <SegmentedTabs activeTab={activeTab} onChange={setActiveTab} />

          {!result && <ExamplesStrip onSelect={setResult} />}

          <div className="bg-white rounded-2xl border border-zinc-100 p-4 shadow-sm">
            {activeTab === 'scan' && <ScanTab onResult={setResult} />}
            {activeTab === 'upload' && <UploadTab onResult={setResult} />}
            {activeTab === 'link' && <LinkTab onResult={setResult} />}
          </div>
        </div>

        {result && <ResultCard result={result} />}

      </main>
    </div>
  );
}
