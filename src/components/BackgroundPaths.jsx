// Flowing "Background Paths" field — adapted from a framer-motion / shadcn snippet
// to this JS + Vite + Tailwind project WITHOUT pulling in framer-motion.
//
// 60fps note: the source animated each path's `stroke-dashoffset` (a comet of
// light travelling along the curve). That repaints the whole SVG on the main
// thread every frame — measured at ~25fps here, vs ~165fps with it off — and the
// cost is the painted AREA, so no path count is low enough to hold 60fps. So the
// woven lines are now STATIC (drawn once, ~free), and the motion is a pair of
// soft GPU-composited light-sweeps (see `.bg-paths-glint` in index.css) that
// translate across the weave — visibly moving, and never touching the main-thread
// raster. Because the lines are free now, the weave is dense again (28/field).
// Decorative (aria-hidden), tinted via `.bg-paths-field`, frozen under reduced-motion.

function FloatingPaths({ position }) {
  // Nested bezier family fanned by `position` (±1 mirrors). Static now, so the
  // count is back up for a rich weave at no per-frame cost.
  const paths = Array.from({ length: 28 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
    opacity: Math.min(0.1 + i * 0.016, 0.45),
  }));

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg
        className="h-full w-full"
        viewBox="0 0 696 316"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        {paths.map((p) => (
          <path
            key={p.id}
            className="bg-path"
            d={p.d}
            stroke="currentColor"
            strokeWidth={p.width}
            style={{ '--op': p.opacity }}
          />
        ))}
      </svg>
    </div>
  );
}

// The full background: two mirrored static weaves + two composited light-sweeps
// that carry the motion. Drop it as an absolutely-positioned child of a
// `relative` container (e.g. the hero), behind the content.
export default function BackgroundPaths() {
  return (
    <div className="bg-paths-field absolute inset-0" aria-hidden="true">
      <FloatingPaths position={1} />
      <FloatingPaths position={-1} />
      {/* GPU-composited light-sweeps — the visible motion. */}
      <div className="bg-paths-glint" />
      <div className="bg-paths-glint bg-paths-glint-2" />
    </div>
  );
}
