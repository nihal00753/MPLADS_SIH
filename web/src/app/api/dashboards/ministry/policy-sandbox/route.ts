import { NextRequest, NextResponse } from 'next/server';
import { MOCK_WORKS } from '@/app/api/_mock/data';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { tenderThresholdLakh = 25, benchmarkMultiplier = 1.4, geotagToleranceMeters = 500 } = await req.json();
  const thresholdAmt = tenderThresholdLakh * 100000;
  const affectedUnderThreshold = MOCK_WORKS.filter(w => w.sanction_amount <= thresholdAmt && w.sanction_amount >= thresholdAmt * 0.75).length;
  const affectedOverruns = MOCK_WORKS.filter(w => w.sanction_amount > w.category_benchmark_max * benchmarkMultiplier).length;
  const estimatedSavingsCr = parseFloat(((affectedUnderThreshold * 8.5 + affectedOverruns * 14.2) / 100).toFixed(2));

  return NextResponse.json({
    inputs: { tenderThresholdLakh, benchmarkMultiplier, geotagToleranceMeters },
    simulationResults: {
      splitInvoicingImpactCases: affectedUnderThreshold,
      costOverrunCasesCaptured: affectedOverruns,
      totalHistoricalCasesSubjectToReview: affectedUnderThreshold + affectedOverruns,
      estimatedAnnualSavingsCr: estimatedSavingsCr,
      complianceVelocityImpact: '-1.4 days average clearance delay',
      policyRecommendation: tenderThresholdLakh < 20
        ? 'High administrative burden: lowering threshold below ₹20L increases tender processing volume by 42%.'
        : 'Optimal threshold: achieves 86% anomaly capture with minimal compliance friction.',
    },
  });
}
