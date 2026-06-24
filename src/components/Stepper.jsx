import { useT } from '../lib/i18n';

// Three-dot progress rail shown above the guided input stages.
export function Stepper({ steps, current }) {
  const t = useT();
  return (
    <ol className="mx-auto flex items-center justify-center gap-2 sm:gap-3" aria-label={t('Progress', 'Progres')}>
      {steps.map((label, i) => {
        const step = i + 1;
        const state = step < current ? 'done' : step === current ? 'active' : 'todo';
        return (
          <li key={label} className="flex items-center gap-2.5 sm:gap-3">
            <span
              className={`spring-color flex items-center gap-2 text-xs font-medium ${
                state === 'todo' ? 'text-ink-muted/60' : 'text-ink'
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold transition-[background-color,color,transform] sm:h-5 sm:w-5 ${
                  state === 'active'
                    ? 'scale-105 bg-brand text-on-brand'
                    : state === 'done'
                      ? 'bg-pos-tint text-pos'
                      : 'bg-well text-ink-muted'
                }`}
                style={{
                  transitionTimingFunction: 'var(--spring-settle)',
                  transitionDuration: 'var(--spring-settle-dur)',
                }}
              >
                {state === 'done' ? (
                  <span key="check" className="checkmark-pop" aria-hidden="true">✓</span>
                ) : (
                  step
                )}
              </span>
              <span className={state === 'active' ? '' : 'hidden sm:inline'}>{label}</span>
            </span>
            {step < steps.length && <span className="h-px w-5 bg-line sm:w-6" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
