import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { analyzeIngredientsText, EvalMode } from '@/lib/riskEngine';

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not set on server' }, { status: 500 });
    }

    // Instantiated lazily (not at module scope) so the build and every other
    // API route keep working in environments/previews with no OpenAI key set.
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const body = await req.json().catch(() => ({}));
    const imageDataUrl = String(body?.imageDataUrl ?? '').trim();
    const mode: EvalMode = body?.mode === 'LENIENT' ? 'LENIENT' : 'STRICT';

    if (!imageDataUrl.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Missing/invalid imageDataUrl' }, { status: 400 });
    }

    const prompt = `
Extract the INGREDIENTS line and (if visible) sugar grams per serving from the label image.

Return JSON ONLY:
{
  "ingredientsText": string,
  "sugarGramsPerServing": number | null,
  "servingSize": string | null
}

Rules:
- ingredientsText must be ONLY the ingredients string (no extra commentary).
- If ingredients are not visible, return "".
- If sugar per serving not visible, return null.
- No extra keys.
`;

    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You extract structured label data from images.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
    });

    const content = resp.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content);

    const ingredientsText = String(parsed?.ingredientsText ?? '').trim();
    const sugarGramsPerServing =
      parsed?.sugarGramsPerServing === null || parsed?.sugarGramsPerServing === undefined
        ? null
        : Number(parsed?.sugarGramsPerServing);

    const servingSize =
      parsed?.servingSize === null || parsed?.servingSize === undefined
        ? null
        : String(parsed?.servingSize);

    // If OCR couldn't find ingredients, return a meaningful low-confidence result
    if (!ingredientsText) {
      return NextResponse.json({
        riskLevel: 'MODERATE',
        score: 40,
        containsAddedSugar: false,
        containsHiddenSugar: false,
        containsArtificialSweetener: false,
        containsNaturalSugar: false,
        detectedSugars: [],
        artificialSweeteners: [],
        confidence: 0.2,
        explanation: 'Could not detect an ingredients list in the image. Try a clearer photo: flat, well-lit, and zoomed on the ingredients section.',
        model: 'sugarshield-rules-v2',
        latencyMs: 0,
        mode,
        extracted: { ingredientsText, sugarGramsPerServing, servingSize },
      });
    }

    const result = analyzeIngredientsText(ingredientsText, { source: 'PASTED', mode });

    return NextResponse.json({
      riskLevel: result.riskLevel,
      score: Math.round(result.score),
      containsAddedSugar: result.containsAddedSugar,
      containsHiddenSugar: result.containsHiddenSugar,
      containsArtificialSweetener: result.containsArtificialSweetener,
      containsNaturalSugar: result.containsNaturalSugar,
      detectedSugars: result.detectedSugars,
      artificialSweeteners: result.artificialSweeteners,
      confidence: Math.round(result.confidence * 100) / 100,
      explanation: result.explanation,
      model: 'sugarshield-rules-v2',
      latencyMs: 0,
      mode,
      extracted: { ingredientsText, sugarGramsPerServing, servingSize },
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: 'vision-parse failed', detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
