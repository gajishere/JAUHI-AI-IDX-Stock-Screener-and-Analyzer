// Three-dot progress rail shown above the guided input stages.
export function Stepper({ steps, current }) {
  return (
    <ol className="mx-auto flex items-center justify-center gap-3" aria-label="Progress">
      {steps.map((label, i) => {
        const step = i + 1;
        const state = step < current ? 'done' : step === current ? 'active' : 'todo';
        return (
          <li key={label} className="flex items-center gap-3">
            <span
              className={`flex items-center gap-2 text-xs font-medium transition-colors ${
                state === 'todo' ? 'text-ink-muted/60' : 'text-ink'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold transition-colors ${
                  state === 'active'
                    ? 'bg-brand text-white'
                    : state === 'done'
                      ? 'bg-pos-tint text-pos'
                      : 'bg-well text-ink-muted'
                }`}
              >
                {state === 'done' ? '✓' : step}
              </span>
              <span className={state === 'active' ? '' : 'hidden sm:inline'}>{label}</span>
            </span>
            {step < steps.length && <span className="h-px w-6 bg-line" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
