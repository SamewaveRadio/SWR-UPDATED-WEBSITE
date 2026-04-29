export function About() {
  return (
    <section id="about" className="py-12 sm:py-16 px-4 sm:px-6 border-b border-white/10">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-xl sm:text-2xl font-light text-white tracking-wide mb-6 sm:mb-8">About</h2>

        <div className="max-w-3xl space-y-6 sm:space-y-8">
          <div className="space-y-3 sm:space-y-4">
            <h3 className="text-white text-base sm:text-lg font-light">Our Mission</h3>
            <p className="text-white/60 text-sm leading-relaxed">
              Samewave Radio is an independent, community-driven online radio station dedicated to showcasing diverse voices, underground sounds, and experimental music from around the world. We believe in the power of radio as a platform for creative expression and cultural exchange.
            </p>
          </div>

          <div className="space-y-3 sm:space-y-4">
            <h3 className="text-white text-base sm:text-lg font-light">Community Radio</h3>
            <p className="text-white/60 text-sm leading-relaxed">
              Founded by music lovers and cultural enthusiasts, Samewave Radio operates as a nonprofit organization committed to providing an open platform for emerging and established artists, DJs, and producers. Our programming spans genres from ambient and experimental electronic to jazz, world music, and beyond.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
