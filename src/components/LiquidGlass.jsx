// Apple-style "Liquid Glass" material, scoped to a handful of floating-chrome
// elements only (see DESIGN intent: never the content/report layer). The look
// itself lives in CSS (`.glass-surface`, `.glass-accent`, `.glass-card` in
// index.css) so it can be applied either through this wrapper or as a class on
// an existing container (modals, popovers). This component is the convenience
// wrapper for the cases where wrapping is clean (the green CTA, the option
// cards); the variant maps 1:1 to those classes.
//
// `GlassFilter` mounts the single SVG displacement filter that gives the frosted
// surfaces their subtle refraction (real lensing, not just blur). It must be
// present once in the tree — mounted at the app root.

const VARIANT_CLASS = {
  surface: 'glass-surface',
  accent: 'glass-accent',
  card: 'glass-card',
};

export function LiquidGlass({ as: Tag = 'div', variant = 'surface', className = '', children, ...props }) {
  const variantClass = VARIANT_CLASS[variant] ?? VARIANT_CLASS.surface;
  return (
    <Tag className={`${variantClass} ${className}`} {...props}>
      {children}
    </Tag>
  );
}

// Single, lightweight refraction filter shared by every frosted glass surface.
// Tuned well below the showy reference (scale 28, no specular-lighting pass) so
// it reads as a gentle lens behind the fill without distorting text or janking
// on scroll. Sits behind the translucent fill, so content above stays crisp.
export function GlassFilter() {
  return (
    <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }}>
      <filter id="glass-distortion" x="-20%" y="-20%" width="140%" height="140%" filterUnits="objectBoundingBox">
        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="42" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="2" result="blurred" />
        <feDisplacementMap in="SourceGraphic" in2="blurred" scale="28" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
