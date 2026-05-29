import PunchReviewPanel from '../components/PunchReviewPanel';

/**
 * Standalone "Validation des pointages" page.
 * Took over the slot the (unused) Anomalies inbox used to occupy in the
 * HR menu. The panel is self-contained — own day/employee filters — so the
 * page is just a thin wrapper.
 */
export default function PunchReview() {
  return (
    <div className="space-y-6">
      <PunchReviewPanel />
    </div>
  );
}
