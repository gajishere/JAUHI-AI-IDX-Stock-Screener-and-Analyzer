// Cosmoq cosmic atmosphere — a starfield + drifting aurora pinned behind every
// page. Mounted once at the app root (like GlassFilter). The look lives entirely
// in CSS (`.cosmic-backdrop` / `.cosmic-stars` / `.cosmic-aurora` in index.css)
// and is theme-aware via tokens; this component is just the mount point. It is
// the faintest whisper on the white reading room and opens into deep space at
// night. aria-hidden — pure decoration, never announced.
export default function CosmicBackdrop() {
  return (
    <div className="cosmic-backdrop" aria-hidden="true">
      <div className="cosmic-aurora" />
      <div className="cosmic-stars" />
    </div>
  );
}
