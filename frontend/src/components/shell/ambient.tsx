/**
 * Soft, slowly drifting color behind the top of every page. Purely
 * decorative: pointer events off, hidden from assistive tech, and frozen
 * when the OS asks for reduced motion (see globals.css).
 */
export function AmbientGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] overflow-hidden [mask-image:linear-gradient(to_bottom,black,transparent)]"
    >
      <div className="absolute -left-[10%] -top-[30%] h-[520px] w-[520px] animate-drift rounded-full will-change-transform bg-accent/20 blur-[90px] dark:bg-accent/30" />
      <div
        className="absolute -top-[35%] left-[35%] h-[460px] w-[460px] animate-drift rounded-full will-change-transform bg-sys-blue/12 blur-[100px] dark:bg-sys-blue/20"
        style={{ animationDelay: '-7s', animationDuration: '26s' }}
      />
      <div
        className="absolute -right-[8%] -top-[25%] h-[420px] w-[420px] animate-drift rounded-full will-change-transform bg-sys-teal/12 blur-[90px] dark:bg-sys-teal/15"
        style={{ animationDelay: '-13s', animationDuration: '30s' }}
      />
    </div>
  );
}
