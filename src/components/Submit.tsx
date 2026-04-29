export function Submit() {
  const links = [
    {
      label: 'HOST A SHOW',
      url: 'https://forms.gle/LcJ1PEZyekyekgw4A'
    },
    {
      label: 'BECOME A VOLUNTEER',
      url: 'https://forms.gle/uf8Zcx3p9jNyA1jUA'
    },
    {
      label: 'MIX SUBMISSION',
      url: 'https://forms.gle/BW1aTuUsKTXyEyaP9'
    },
    {
      label: 'TRACK SUBMISSION',
      url: 'https://forms.gle/M7LDEhBhCuhGdQH77'
    }
  ];

  return (
    <section id="submit" className="py-12 sm:py-16 px-4 sm:px-6 border-b border-white/10">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-xl sm:text-2xl font-light text-white tracking-wide mb-6 sm:mb-8">Submit</h2>

        <div className="max-w-3xl space-y-6 sm:space-y-8">
          <div className="space-y-3 sm:space-y-4">
            <p className="text-white/60 text-sm leading-relaxed">
              We welcome residents, volunteers, and supporters who share our vision. Whether you want to host a show, contribute to our operations, submit tracks or mixes, there are many ways to get involved with Samewave Radio.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 pt-2">
              {links.map((link) => (
                <a
                  key={link.label}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-white/5 border border-white/10 text-white text-xs sm:text-sm tracking-wide hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
