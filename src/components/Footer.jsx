const iconClass = 'h-5 w-5 shrink-0 text-violet-300';

function GitHubIcon() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.3-.4 6.8-1.6 6.8-7A5.5 5.5 0 0 0 19.3 3 5.1 5.1 0 0 0 19.1 0S18 0 15 1.7a15.4 15.4 0 0 0-8 0C4 0 2.9 0 2.9 0a5.1 5.1 0 0 0-.2 3A5.5 5.5 0 0 0 1.2 7.5c0 5.4 3.5 6.6 6.8 7A4.8 4.8 0 0 0 7 18v4M7 19c-3 .9-3-1.5-4-2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m8 9-3 3 3 3m8-6 3 3-3 3m-2.5-8-3 10"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TelescopeIcon() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m7.5 14.5 7.9-4.2m-5.9 7.2 3-1.6m1.5-8.2 4.3-2.3 2.4 4.5-4.3 2.3M5.8 12.4l3.5 6.5-3.1 1.7-3.5-6.5 3.1-1.7Zm8.7 2.6 2.2 5M12.6 16l-2 5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="m4 7 8 6 8-6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const linkClass =
  'group flex w-fit items-center gap-3 text-[0.95rem] text-[#eeeef2] transition-colors hover:text-violet-300';

export default function Footer() {
  return (
    <footer className="relative z-1 mx-auto mt-8 mb-5 w-full max-w-340 px-4 sm:px-6 lg:px-10">
      <div className="rounded-[28px] border border-white/5 bg-[#101018] px-6 py-9 shadow-[0_20px_70px_rgba(0,0,0,0.18)] sm:px-9 sm:py-11 lg:px-12">
        <div>
          <a
            href="/"
            className="font-serif text-[clamp(2.35rem,4vw,3.25rem)] leading-none tracking-[-0.035em] text-violet-300"
          >
            Parallax
          </a>
          <p className="mt-4 text-base text-[#aaa7b8] sm:text-lg">
            A different perspective on a changing universe.
          </p>
        </div>

        <div className="mt-9 grid gap-10 md:grid-cols-2 md:gap-16">
          <section aria-labelledby="footer-resources">
            <h2 id="footer-resources" className="text-lg font-semibold text-[#f1f1f4]">
              Resources
            </h2>
            <nav className="mt-5 space-y-4" aria-label="Footer resources">
              <a
                className={linkClass}
                href="https://github.com/jamaltey/parallax"
                target="_blank"
                rel="noreferrer"
              >
                <GitHubIcon />
                <span>GitHub</span>
              </a>
              <a className={linkClass} href="/developers">
                <CodeIcon />
                <span>API Documentation</span>
              </a>
              <a
                className={linkClass}
                href="https://irsa.ipac.caltech.edu/Missions/spherex.html"
                target="_blank"
                rel="noreferrer"
              >
                <TelescopeIcon />
                <span>NASA SPHEREx</span>
              </a>
            </nav>
          </section>

          <section aria-labelledby="footer-contact">
            <h2 id="footer-contact" className="text-lg font-semibold text-[#f1f1f4]">
              Contact
            </h2>
            <p className="mt-4 text-base text-[#aaa7b8] sm:text-lg">
              Questions, feedback, or collaboration?
            </p>
            <a
              className="mt-4 flex w-fit items-center gap-3 text-base text-violet-300 transition-colors hover:text-violet-200 sm:text-lg"
              href="mailto:parallaxcephei@gmail.com"
            >
              <MailIcon />
              <span className="break-all">parallaxcephei@gmail.com</span>
            </a>
          </section>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-white/15 pt-7 text-sm text-[#aaa7b8] sm:flex-row sm:items-center sm:justify-between sm:text-base">
          <p>© 2026 Delta Cephei</p>
          <p>NASA Space Apps Challenge 2026</p>
        </div>
      </div>
    </footer>
  );
}
