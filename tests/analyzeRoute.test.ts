import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/analyze/route';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/analyze', () => {
  it('returns the full SugarShield contract for a product with added sugar', async () => {
    const res = await POST(
      makeRequest({
        productName: 'Classic Cola',
        ingredients: 'Carbonated Water, High Fructose Corn Syrup, Caramel Color, Phosphoric Acid',
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toMatchObject({
      riskLevel: expect.any(String),
      score: expect.any(Number),
      containsAddedSugar: true,
      containsHiddenSugar: expect.any(Boolean),
      containsArtificialSweetener: expect.any(Boolean),
      containsNaturalSugar: expect.any(Boolean),
      detectedSugars: expect.arrayContaining(['high fructose corn syrup']),
      artificialSweeteners: expect.any(Array),
      confidence: expect.any(Number),
      explanation: expect.any(String),
      model: 'sugarshield-rules-v2',
      mode: 'STRICT',
    });
    expect(typeof body.latencyMs).toBe('number');
  });

  it('rejects a request with no ingredients', async () => {
    const res = await POST(makeRequest({ productName: 'Mystery Product', ingredients: '' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('respects the requested lenient mode', async () => {
    const res = await POST(
      makeRequest({
        ingredients: 'Filtered Water, Organic Stevia Leaf Extract, Natural Flavors.',
        mode: 'LENIENT',
      })
    );
    const body = await res.json();
    expect(body.mode).toBe('LENIENT');
  });
});
