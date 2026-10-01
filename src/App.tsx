import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mail, Phone, Linkedin, Github, ArrowRight, ArrowUpRight, ExternalLink,
  Database, LineChart, Terminal, Cpu, Award, GraduationCap, Building2,
  MapPin, Presentation, Layers, CheckCircle2, Clock, GitBranch, Sparkles,
  BarChart3, X,
} from 'lucide-react';
import {
  profile, stats, coreCompetencies, skillGroups, experienceData, trainingData,
  courseModules, clientProjects, githubProjects, dashboards, education,
  finalYearProject, certifications, certificationsInProgress, additionalInfo,
} from './data';

const NAV = [
  { label: 'About', href: '#about' },
  { label: 'Skills', href: '#skills' },
  { label: 'Experience', href: '#experience' },
  { label: 'Training', href: '#training' },
  { label: 'Projects', href: '#projects' },
  { label: 'Dashboards', href: '#dashboards' },
];

const HERO_IMG = dashboards.find((d) => d.title.startsWith('Regional Sales')) ?? dashboards[0];

export default function App() {
  return (
    <div className="min-h-screen text-[#e7e9ee] font-sans antialiased">
      <Header />
      <main>
        <Hero />
        <Stats />
        <Competencies />
        <Skills />
        <Experience />
        <Training />
        <Projects />
        <Gallery />
        <EducationBlock />
      </main>
      <Footer />
    </div>
  );
}

/* --------------------------------------------------------------------- */
/*  Primitives                                                           */
/* --------------------------------------------------------------------- */
function Container({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-6 ${className}`}>{children}</div>;
}

function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: 'easeOut', delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SectionHead({ eyebrow, title, intro }: { eyebrow: string; title: string; intro?: string }) {
  return (
    <div className="mb-10 md:mb-14 max-w-3xl">
      <div className="flex items-center gap-3 mb-3">
        <span className="h-px w-8 bg-sky-400/80" />
        <span className="font-mono text-xs uppercase tracking-[0.25em] text-sky-400">{eyebrow}</span>
      </div>
      <h2 className="text-h2 font-display font-bold text-white">{title}</h2>
      {intro && <p className="text-body text-zinc-400 mt-4">{intro}</p>}
    </div>
  );
}

function Section({ id, children, className = '' }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`py-20 md:py-28 ${className}`}>
      <Container>{children}</Container>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/*  Header                                                               */
/* --------------------------------------------------------------------- */
function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`fixed top-0 inset-x-0 z-50 transition-colors duration-300 ${scrolled ? 'glass border-b border-white/5' : ''}`}>
      <Container className="flex items-center justify-between h-16">
        <a href="#" className="font-display font-bold tracking-tight text-white text-base sm:text-lg">
          Syed Jawaad Ali
        </a>
        <nav className="hidden md:flex items-center gap-7 text-sm text-zinc-400">
          {NAV.map((n) => (
            <a key={n.label} href={n.href} className="hover:text-white transition-colors">{n.label}</a>
          ))}
        </nav>
        <a
          href={`mailto:${profile.email}`}
          className="inline-flex items-center gap-2 rounded-full bg-sky-500 hover:bg-sky-400 text-[#06121b] font-semibold text-sm px-4 py-2 transition-colors"
        >
          <Mail className="w-4 h-4" /> <span className="hidden sm:inline">Contact</span>
        </a>
      </Container>
    </header>
  );
}

/* --------------------------------------------------------------------- */
/*  Hero                                                                 */
/* --------------------------------------------------------------------- */
function Hero() {
  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden">
      <Container className="grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-10 items-center">
        {/* Left */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-mono text-zinc-300 mb-6"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Available for BI & analytics roles
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.05 }}
            className="text-display font-display font-bold text-white"
          >
            Data & <span className="text-gradient">Business Intelligence</span> Leader
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.12 }}
            className="text-lead text-zinc-300 mt-6 max-w-xl"
          >
            I turn messy, multi-source data into governed pipelines and executive dashboards leadership can actually trust — across telecom, banking, healthcare and retail.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.18 }}
            className="flex flex-wrap items-center gap-3 mt-8"
          >
            <a href="#projects" className="inline-flex items-center gap-2 rounded-full bg-white text-black font-semibold text-sm px-5 py-2.5 hover:bg-zinc-200 transition-colors">
              View work <ArrowRight className="w-4 h-4" />
            </a>
            <a href={profile.linkedin} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/15 text-white font-medium text-sm px-5 py-2.5 hover:bg-white/5 transition-colors">
              <Linkedin className="w-4 h-4" /> LinkedIn
            </a>
            <a href={profile.github} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/15 text-white font-medium text-sm px-5 py-2.5 hover:bg-white/5 transition-colors">
              <Github className="w-4 h-4" /> GitHub
            </a>
          </motion.div>

          <div className="mt-8 flex items-center gap-2 text-sm text-zinc-500">
            <MapPin className="w-4 h-4" /> {profile.location}
          </div>
        </div>

        {/* Right — CSS 3D dashboard panel */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="scene hidden sm:block"
        >
          <div className="relative">
            <div className="tilt-3d relative rounded-2xl border border-white/10 bg-white/[0.03] p-2 shadow-[0_30px_80px_-20px_rgba(2,8,23,0.9)]">
              <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-sky-500/20 to-indigo-500/20 blur-2xl" />
              <img
                src={HERO_IMG.thumb}
                alt="Business intelligence dashboard"
                width={820} height={512}
                className="rounded-xl w-full h-auto"
                loading="eager" decoding="async"
              />
            </div>
            {/* floating depth chips */}
            <div className="float-chip absolute -left-4 bottom-10 rounded-xl glass border border-white/10 px-4 py-3 shadow-xl">
              <div className="text-xl font-display font-bold text-white">70%</div>
              <div className="text-[11px] text-zinc-400">faster reporting</div>
            </div>
            <div className="float-chip absolute -right-3 -top-3 rounded-xl glass border border-white/10 px-4 py-3 shadow-xl" style={{ animationDelay: '1.2s' }}>
              <div className="text-xl font-display font-bold text-white">100+</div>
              <div className="text-[11px] text-zinc-400">dashboards shipped</div>
            </div>
          </div>
        </motion.div>
      </Container>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/*  Stats                                                                */
/* --------------------------------------------------------------------- */
function Stats() {
  return (
    <section id="about" className="border-y border-white/5 bg-white/[0.015]">
      <Container className="grid grid-cols-2 md:grid-cols-4 divide-x divide-white/5">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.05} className="py-8 px-5 text-center md:text-left">
            <div className="text-stat font-display font-bold text-white">{s.value}</div>
            <div className="text-xs font-mono uppercase tracking-wider text-zinc-500 mt-1">{s.label}</div>
          </Reveal>
        ))}
      </Container>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/*  About / Summary + Competencies                                      */
/* --------------------------------------------------------------------- */
function Competencies() {
  return (
    <Section>
      <SectionHead eyebrow="01 — Profile" title="What I bring to the table" intro={profile.summary} />
      <div className="grid md:grid-cols-2 gap-4">
        {coreCompetencies.map((c, i) => (
          <Reveal key={c.area} delay={(i % 2) * 0.05}>
            <div className="card card-hover h-full p-6">
              <div className="flex items-center gap-2.5 mb-2">
                <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
                <h3 className="text-h3 font-display font-semibold text-white">{c.area}</h3>
              </div>
              <p className="text-body text-zinc-400">{c.detail}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* --------------------------------------------------------------------- */
/*  Skills                                                               */
/* --------------------------------------------------------------------- */
const SKILL_ICONS: Record<string, React.ReactNode> = {
  chart: <LineChart className="w-5 h-5" />,
  database: <Database className="w-5 h-5" />,
  terminal: <Terminal className="w-5 h-5" />,
  cpu: <Cpu className="w-5 h-5" />,
};

function Skills() {
  return (
    <Section id="skills">
      <SectionHead eyebrow="02 — Toolkit" title="Technical expertise" />
      <div className="grid sm:grid-cols-2 gap-4">
        {skillGroups.map((g, i) => (
          <Reveal key={g.category} delay={(i % 2) * 0.05}>
            <div className="card card-hover h-full p-6">
              <div className="flex items-center gap-3 mb-5">
                <span className="grid place-items-center w-10 h-10 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  {SKILL_ICONS[g.icon]}
                </span>
                <h3 className="text-h3 font-display font-semibold text-white">{g.category}</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {g.items.map((item) => (
                  <span key={item} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-sm text-zinc-300">{item}</span>
                ))}
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* --------------------------------------------------------------------- */
/*  Experience                                                           */
/* --------------------------------------------------------------------- */
function Experience() {
  return (
    <Section id="experience">
      <SectionHead eyebrow="03 — Trajectory" title="Professional experience" />
      <div className="space-y-4">
        {experienceData.map((exp, i) => (
          <Reveal key={i} delay={Math.min(i * 0.04, 0.2)}>
            <div className="card card-hover p-6 md:p-7">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-h3 font-display font-semibold text-white">{exp.role}</h3>
                  <div className="flex items-center gap-2 text-zinc-400 mt-1.5 text-sm">
                    <Building2 className="w-4 h-4 text-sky-400" /> {exp.company}
                  </div>
                </div>
                <div className="flex flex-col md:items-end gap-1.5 shrink-0">
                  <span className="rounded-full border border-sky-500/25 bg-sky-500/10 text-sky-200 text-xs font-mono px-3 py-1">{exp.period}</span>
                  <span className="text-xs text-zinc-500 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {exp.location}</span>
                </div>
              </div>
              <ul className="space-y-2">
                {exp.description.map((b, idx) => (
                  <li key={idx} className="text-body text-zinc-300 flex gap-3">
                    <span className="text-sky-400 mt-2 h-1 w-1 rounded-full bg-sky-400 shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* --------------------------------------------------------------------- */
/*  Training                                                             */
/* --------------------------------------------------------------------- */
function Training() {
  return (
    <Section id="training">
      <SectionHead eyebrow="04 — Capability building" title="Training & teaching" intro="I don't just build — I upskill teams. Instructor-led programs plus hands-on mentoring, in English and Urdu." />
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {trainingData.map((t, i) => (
            <Reveal key={i} delay={Math.min(i * 0.04, 0.15)}>
              <div className="card card-hover p-6">
                <div className="flex items-start gap-4">
                  <span className="grid place-items-center w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 shrink-0">
                    <Presentation className="w-5 h-5" />
                  </span>
                  <div className="flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                      <h3 className="text-h3 font-display font-semibold text-white">{t.role}</h3>
                      <span className="text-xs font-mono text-sky-300 shrink-0">{t.period}</span>
                    </div>
                    <p className="text-sm text-zinc-500 mb-3">{t.org} · {t.location}</p>
                    <ul className="space-y-1.5">
                      {t.points.map((p, idx) => (
                        <li key={idx} className="text-sm text-zinc-300 flex gap-2.5">
                          <span className="text-sky-400 mt-1.5 h-1 w-1 rounded-full bg-sky-400 shrink-0" />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.1}>
          <div className="card h-full p-6">
            <div className="flex items-center gap-2.5 mb-5">
              <Layers className="w-5 h-5 text-sky-400" />
              <h3 className="text-h3 font-display font-semibold text-white">Modules I teach</h3>
            </div>
            <ul className="space-y-3">
              {courseModules.map((m, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-zinc-300">
                  <CheckCircle2 className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* --------------------------------------------------------------------- */
/*  Projects                                                             */
/* --------------------------------------------------------------------- */
function Projects() {
  return (
    <Section id="projects">
      <SectionHead eyebrow="05 — Selected work" title="Flagship projects" />
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clientProjects.map((p, i) => (
          <Reveal key={p.title} delay={(i % 3) * 0.05}>
            <div className="card card-hover h-full p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <span className="rounded-full bg-white/5 border border-white/10 text-[11px] font-mono uppercase tracking-wide text-zinc-300 px-2.5 py-1">{p.client}</span>
                <BarChart3 className="w-4 h-4 text-sky-400" />
              </div>
              <h3 className="text-h3 font-display font-semibold text-white mb-2">{p.title}</h3>
              <p className="text-sm text-zinc-400 flex-1">{p.description}</p>
              <p className="text-sm text-sky-300 mt-3 flex gap-2">
                <Sparkles className="w-4 h-4 mt-0.5 shrink-0" /> {p.impact}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-white/5">
                {p.tech.map((t) => (
                  <span key={t} className="text-[11px] font-mono rounded-full bg-sky-500/10 border border-sky-500/15 text-sky-200 px-2 py-0.5">{t}</span>
                ))}
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <div className="mt-14">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <GitBranch className="w-5 h-5 text-sky-400" />
            <h3 className="text-h3 font-display font-semibold text-white">Open-source & code</h3>
          </div>
          <a href={profile.github} target="_blank" rel="noreferrer" className="text-sm text-sky-400 hover:text-sky-300 flex items-center gap-1.5">
            github.com/syedjawaadali <ExternalLink className="w-4 h-4" />
          </a>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {githubProjects.map((g, i) => (
            <Reveal key={g.name} delay={(i % 3) * 0.04}>
              <a href={g.url} target="_blank" rel="noreferrer" className="card card-hover block h-full p-5 group">
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-2 font-mono text-sky-300 text-sm font-medium"><Github className="w-4 h-4" /> {g.name}</span>
                  <ArrowUpRight className="w-4 h-4 text-zinc-500 group-hover:text-sky-400 transition-colors" />
                </div>
                <p className="text-sm text-zinc-400">{g.description}</p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {g.tech.map((t) => (
                    <span key={t} className="text-[11px] font-mono rounded-full bg-white/5 border border-white/10 text-zinc-300 px-2 py-0.5">{t}</span>
                  ))}
                </div>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* --------------------------------------------------------------------- */
/*  Dashboard gallery                                                    */
/* --------------------------------------------------------------------- */
function Gallery() {
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActive(null); };
    if (active !== null) {
      window.addEventListener('keydown', onKey);
      document.body.style.overflow = 'hidden';
    }
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [active]);

  return (
    <Section id="dashboards" className="border-y border-white/5 bg-white/[0.015]">
      <SectionHead
        eyebrow="06 — Visual proof"
        title="BI dashboard gallery"
        intro="A selection of production Power BI & Tableau dashboards across telecom, retail, HR, public sector and finance. Tap any to enlarge."
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {dashboards.map((d, i) => (
          <Reveal key={d.title} delay={(i % 3) * 0.04}>
            <button
              onClick={() => setActive(i)}
              className="group block w-full text-left rounded-xl overflow-hidden border border-white/10 hover:border-sky-500/40 transition-colors card-hover"
            >
              <div className="aspect-[16/10] overflow-hidden bg-black/40">
                <img
                  src={d.thumb}
                  alt={d.title}
                  width={820} height={512}
                  loading="lazy" decoding="async"
                  className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="flex items-center justify-between gap-2 p-4">
                <div className="min-w-0">
                  <h3 className="font-display font-semibold text-white text-sm truncate">{d.title}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-mono uppercase tracking-wide text-sky-300">{d.tool}</span>
                    <span className="text-[10px] font-mono uppercase tracking-wide text-zinc-500">{d.tags[0]}</span>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-zinc-500 group-hover:text-sky-400 transition-colors shrink-0" />
              </div>
            </button>
          </Reveal>
        ))}
      </div>

      <AnimatePresence>
        {active !== null && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setActive(null)}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-8"
          >
            <button onClick={() => setActive(null)} className="absolute top-5 right-5 w-11 h-11 grid place-items-center rounded-full bg-white/10 border border-white/20 text-white hover:bg-white hover:text-black transition-colors z-10" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.25 }} onClick={(e) => e.stopPropagation()}
              className="max-w-5xl w-full"
            >
              <img src={dashboards[active].src} alt={dashboards[active].title} className="w-full rounded-xl border border-white/10 max-h-[78vh] object-contain bg-black" />
              <div className="flex flex-wrap items-center gap-3 mt-4">
                <span className="text-xs font-mono uppercase tracking-wide rounded-full bg-sky-500/15 border border-sky-400/25 text-sky-200 px-3 py-1">{dashboards[active].tool}</span>
                <h3 className="font-display font-semibold text-white">{dashboards[active].title}</h3>
                <div className="ml-auto flex gap-2">
                  {dashboards[active].tags.map((t) => (
                    <span key={t} className="text-[11px] font-mono uppercase tracking-wide text-zinc-400 border border-white/10 rounded-full px-2.5 py-1">{t}</span>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Section>
  );
}

/* --------------------------------------------------------------------- */
/*  Education + FYP + Certs                                              */
/* --------------------------------------------------------------------- */
function EducationBlock() {
  return (
    <Section>
      <SectionHead eyebrow="07 — Background" title="Education & credentials" />
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Education + FYP */}
        <div className="space-y-4">
          {education.map((e) => (
            <Reveal key={e.degree}>
              <div className="card card-hover p-6 flex gap-4">
                <span className="grid place-items-center w-12 h-12 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
                  <GraduationCap className="w-6 h-6" />
                </span>
                <div>
                  <h3 className="text-h3 font-display font-semibold text-white">{e.degree}</h3>
                  <p className="text-sm text-zinc-400 mt-1">{e.school}</p>
                  <div className="flex flex-wrap gap-2 mt-3 text-xs font-mono">
                    <span className="rounded bg-sky-500/10 border border-sky-500/20 text-sky-200 px-2 py-0.5">{e.grade}</span>
                    <span className="rounded bg-white/5 border border-white/10 text-zinc-400 px-2 py-0.5">{e.period}</span>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
          <Reveal>
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-2">
                <Award className="w-5 h-5 text-indigo-300" />
                <span className="text-xs font-mono uppercase tracking-[0.2em] text-indigo-300">Final year project</span>
              </div>
              <h3 className="text-h3 font-display font-semibold text-white mb-2">{finalYearProject.title}</h3>
              <p className="text-body text-zinc-400">{finalYearProject.summary}</p>
              <div className="flex flex-wrap gap-1.5 mt-4">
                {finalYearProject.tech.map((t) => (
                  <span key={t} className="text-[11px] font-mono rounded-full bg-white/5 border border-white/10 text-zinc-300 px-2 py-0.5">{t}</span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>

        {/* Certs */}
        <div className="space-y-4">
          <Reveal>
            <div className="card p-6">
              <div className="flex items-center gap-2.5 mb-5">
                <Award className="w-5 h-5 text-sky-400" />
                <h3 className="text-h3 font-display font-semibold text-white">Certifications</h3>
              </div>
              <ul className="space-y-3">
                {certifications.map((c, i) => (
                  <li key={i} className="flex gap-3 text-body text-zinc-300">
                    <CheckCircle2 className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" /> {c}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={0.05}>
            <div className="card p-6">
              <div className="flex items-center gap-2.5 mb-4">
                <Clock className="w-5 h-5 text-amber-400" />
                <h3 className="text-h3 font-display font-semibold text-white">In progress</h3>
              </div>
              <ul className="space-y-2.5">
                {certificationsInProgress.map((c, i) => (
                  <li key={i} className="flex gap-3 text-sm text-zinc-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400/80 mt-1.5 shrink-0" /> {c}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="card p-6">
              <h3 className="text-xs font-mono uppercase tracking-[0.2em] text-sky-400 mb-3">Also worth knowing</h3>
              <p className="text-sm text-zinc-300 mb-2"><span className="text-white font-medium">Languages:</span> {additionalInfo.languages}</p>
              <p className="text-sm text-zinc-300"><span className="text-white font-medium">Sectors:</span> {additionalInfo.sectors}</p>
            </div>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}

/* --------------------------------------------------------------------- */
/*  Footer                                                               */
/* --------------------------------------------------------------------- */
function Footer() {
  return (
    <footer id="contact" className="border-t border-white/5 py-20 md:py-24">
      <Container>
        <div className="max-w-2xl">
          <span className="font-mono text-xs uppercase tracking-[0.25em] text-sky-400">08 — Get in touch</span>
          <h2 className="text-h2 font-display font-bold text-white mt-3">Let's build something data-driven.</h2>
          <p className="text-body text-zinc-400 mt-4">Open to BI, analytics and data-engineering roles, consulting engagements, and training programs.</p>
        </div>

        <div className="flex flex-wrap gap-3 mt-8">
          <a href={`mailto:${profile.email}`} className="inline-flex items-center gap-2 rounded-full bg-sky-500 hover:bg-sky-400 text-[#06121b] font-semibold text-sm px-5 py-2.5 transition-colors">
            <Mail className="w-4 h-4" /> {profile.email}
          </a>
          <a href={`tel:${profile.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-2 rounded-full border border-white/15 text-white text-sm px-5 py-2.5 hover:bg-white/5 transition-colors">
            <Phone className="w-4 h-4" /> {profile.phone}
          </a>
          <a href={profile.linkedin} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/15 text-white text-sm px-5 py-2.5 hover:bg-white/5 transition-colors">
            <Linkedin className="w-4 h-4" /> LinkedIn
          </a>
          <a href={profile.github} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/15 text-white text-sm px-5 py-2.5 hover:bg-white/5 transition-colors">
            <Github className="w-4 h-4" /> GitHub
          </a>
        </div>

        <div className="mt-16 pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-3 text-xs font-mono text-zinc-600 uppercase tracking-wider">
          <span>© 2026 {profile.name}</span>
          <span>{profile.location}</span>
          <span>Data Engineering & Analytics</span>
        </div>
      </Container>
    </footer>
  );
}
