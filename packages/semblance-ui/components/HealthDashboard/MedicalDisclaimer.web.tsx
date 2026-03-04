import './MedicalDisclaimer.css';

export function MedicalDisclaimer() {
  return (
    <div className="medical-disclaimer" role="note" aria-label="Medical disclaimer">
      <p className="medical-disclaimer__text">
        Semblance identifies statistical patterns in your data. This is not medical advice,
        diagnosis, or treatment. Correlations are observations, not causation. Always consult
        a healthcare professional for medical decisions.
      </p>
    </div>
  );
}
