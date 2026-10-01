import React, { useEffect, useState, useRef } from 'react';
import { motion, useScroll, useTransform, AnimatePresence, useSpring, useMotionValue } from 'motion/react';
import {
  ArrowUpRight, Database, LineChart, Terminal, Cpu, Linkedin, Github, Mail, Phone,
  Award, GraduationCap, Building2, BarChart3, GitBranch, Presentation, X,
  MapPin, Layers, CheckCircle2, Clock, ExternalLink, Sparkles,
} from 'lucide-react';
import { PhosphorBackground } from './components/ui/phosphor-30';
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
  { label: 'Contact', href: '#contact' },
];

export default function App() {
  const [loading, setLoading] = useState(true);

  return (
    <div className="bg-[#050505] min-h-screen text-[#f5f5f5] font-sans selection:bg-cyan-500/30 overflow-hidden relative">
      <CustomCursor />
      <AmbientOrbs />
      <NoiseOverlay />

      <AnimatePresence mode="wait">
        {loading ? (
          <Preloader key="preloader" onComplete={() => setLoading(false)} />
        ) : (
          <motion.div
            key="main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10"
          >
            <Navbar />
            <main>
              <HeroSection />
              <IntroSection />
              <CompetenciesSection />
              <SkillsSection />
              <ExperienceSection />
              <TrainingSection />
              <ProjectsSection />
              <DashboardGallery />
              <EducationSection />
            </main>
            <Footer />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*  Preloader                                                              */
/* ----------------------------------------------------------------------- */
function Preloader({ onComplete }: { onComplete: () => void }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let current = 0;
    const interval = setInterval(() => {
      current += 2;
      if (current >= 100) {
        setCount(100);
        clearInterval(interval);
        setTimeout(onComplete, 500);
      } else setCount(current);
    }, 40);
    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <motion.div
      exit={{ y: '-100%', opacity: 0 }}
      transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
      className="fixed inset-0 z-[100] bg-[#050505] flex flex-col items-center justify-center overflow-hidden"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-hero font-display font-bold text-white"
      >
        {count}%
      </motion.div>
      <div className="mt-8 flex items-center gap-6">
        <div className="w-16 h-[2px] bg-cyan-500 rounded-full" />
        <span className="font-mono text-sm md:text-base tracking-[0.4em] text-cyan-400 uppercase font-bold">
          {profile.name}
        </span>
        <div className="w-16 h-[2px] bg-cyan-500 rounded-full" />
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*  Ambient / background                                                   */
/* ----------------------------------------------------------------------- */
function AmbientOrbs() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      <motion.div
        animate={{ x: [0, 50, 0, -50, 0], y: [0, -50, 50, 0, 0], scale: [1, 1.1, 1, 1.2, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
        className="absolute top-[10%] left-[5%] w-[400px] h-[400px] md:w-[600px] md:h-[600px] bg-cyan-600/10 rounded-full blur-[110px] md:blur-[150px] mix-blend-screen"
      />
      <motion.div
        animate={{ x: [0, -50, 0, 50, 0], y: [0, 50, -50, 0, 0], scale: [1, 1.2, 1, 1.1, 1] }}
        transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
        className="absolute bottom-[5%] right-[5%] w-[500px] h-[500px] md:w-[800px] md:h-[800px] bg-blue-700/10 rounded-full blur-[130px] md:blur-[180px] mix-blend-screen"
      />
    </div>
  );
}

function CustomCursor() {
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  const springConfig = { damping: 25, stiffness: 700, mass: 0.5 };
  const cursorXSpring = useSpring(cursorX, springConfig);
  const cursorYSpring = useSpring(cursorY, springConfig);
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    const moveCursor = (e: MouseEvent) => { cursorX.set(e.clientX - 16); cursorY.set(e.clientY - 16); };
    const handleHover = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      setIsHovering(!!target.closest('a, button, .hover-target'));
    };
    window.addEventListener('mousemove', moveCursor);
    window.addEventListener('mouseover', handleHover);
    return () => {
      window.removeEventListener('mousemove', moveCursor);
      window.removeEventListener('mouseover', handleHover);
    };
  }, [cursorX, cursorY]);

  return (
    <motion.div
      className="fixed top-0 left-0 w-8 h-8 rounded-full bg-white mix-blend-difference pointer-events-none z-[9999] hidden md:block"
      style={{ x: cursorXSpring, y: cursorYSpring, scale: isHovering ? 2.5 : 1 }}
    />
  );
}

function NoiseOverlay() {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-[90] opacity-[0.03] mix-blend-overlay"
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
    />
  );
}

/* ----------------------------------------------------------------------- */
/*  Reusable                                                               */
/* ----------------------------------------------------------------------- */
function ZoomSection({ children, id, className = '' }: { children: React.ReactNode; id?: string; className?: string }) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-8% 0px -8% 0px' }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-14 md:mb-16">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-10 h-[2px] bg-cyan-500 rounded-full" />
        <span className="font-mono text-cyan-500 uppercase tracking-[0.3em] text-xs md:text-sm font-bold">{title}</span>
      </div>
      <h2 className="text-h2 font-display font-bold text-white drop-shadow-lg">{subtitle}</h2>
    </div>
  );
}

function Tilt({ children, className = '', intensity = 5 }: { children: React.ReactNode; className?: string; intensity?: number }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mx = useSpring(x, { stiffness: 300, damping: 30 });
  const my = useSpring(y, { stiffness: 300, damping: 30 });
  const rotateX = useTransform(my, [-0.5, 0.5], [`${intensity}deg`, `-${intensity}deg`]);
  const rotateY = useTransform(mx, [-0.5, 0.5], [`-${intensity}deg`, `${intensity}deg`]);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) return;
    const rect = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  };
  const onLeave = () => { x.set(0); y.set(0); };

  return (
    <motion.div onMouseMove={onMove} onMouseLeave={onLeave} style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }} className={`w-full ${className}`}>
      <div className={`w-full transition-transform duration-300 md:hover:scale-[1.02] ${className.includes('h-full') ? 'h-full' : ''}`}>
        {children}
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*  Navbar                                                                 */
/* ----------------------------------------------------------------------- */
function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-6 md:py-8 mix-blend-difference text-white pointer-events-none">
      <div className="font-display font-bold text-lg md:text-2xl tracking-tighter pointer-events-auto hover-target uppercase">
        <a href="#">{profile.name}</a>
      </div>
      <div className="hidden lg:flex space-x-7 text-sm font-mono uppercase tracking-[0.18em] pointer-events-auto font-medium">
        {NAV.map((item) => (
          <a key={item.label} href={item.href} className="hover-target hover:text-cyan-400 transition-colors">{item.label}</a>
        ))}
      </div>
    </nav>
  );
}

/* ----------------------------------------------------------------------- */
/*  Hero — phosphor shader background                                       */
/* ----------------------------------------------------------------------- */
function HeroSection() {
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 1000], [0, 200]);
  const opacity = useTransform(scrollY, [0, 600], [1, 0]);

  return (
    <section className="relative min-h-screen flex flex-col justify-center px-6 md:px-12 pt-24 pb-12 overflow-hidden">
      {/* Animated WebGL shader background */}
      <div className="absolute inset-0 z-0">
        <PhosphorBackground pixelRatio={1.4} />
        {/* legibility overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/40 to-[#050505]/70" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#050505]/80 via-transparent to-transparent" />
      </div>

      <motion.div style={{ y: y1, opacity }} className="relative z-10 mt-auto">
        <div className="mb-8 flex items-center gap-4">
          <div className="w-12 h-[2px] bg-cyan-400" />
          <span className="font-mono text-cyan-400 uppercase tracking-widest text-sm md:text-base font-bold">{profile.name}</span>
        </div>

        <h1 className="text-display font-display font-bold mb-8 select-none drop-shadow-2xl">
          BUSINESS <br />
          <span className="text-gradient italic pr-4 hover-target">INTELLIGENCE</span> <br />
          LEADER
        </h1>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-t border-white/20 pt-8 mt-10">
          <p className="text-subhead text-zinc-200 max-w-3xl font-light">
            I architect governed data pipelines and craft executive BI dashboards that turn complex datasets into a single, trusted source of strategic insight.
          </p>
          <div className="flex flex-col items-start md:items-end font-mono text-sm text-zinc-400 uppercase tracking-widest">
            <span>Based in</span>
            <span className="text-white mt-1 font-bold">{profile.location}</span>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

/* ----------------------------------------------------------------------- */
/*  Intro + stats                                                          */
/* ----------------------------------------------------------------------- */
function IntroSection() {
  return (
    <ZoomSection id="about" className="py-24 md:py-40 px-6 md:px-12 relative">
      <SectionHeader title="01 // Profile" subtitle="Professional Summary." />
      <div className="max-w-5xl">
        <p className="text-lead font-light text-zinc-300 drop-shadow-md">
          {profile.summary.split('—')[0]}—{' '}
          <span className="text-gradient italic font-display font-medium">a single, trusted source</span> of institutional information for leadership.
        </p>
        <p className="text-body text-zinc-400 mt-8 max-w-4xl">{profile.summaryLong}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-16 border-t border-white/20 pt-14">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col hover-target group">
              <span className="text-stat font-display font-bold text-white mb-2 drop-shadow-lg group-hover:text-cyan-400 transition-colors">{s.value}</span>
              <span className="text-sm font-mono text-zinc-400 uppercase tracking-widest font-medium">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </ZoomSection>
  );
}

/* ----------------------------------------------------------------------- */
/*  Core competencies                                                      */
/* ----------------------------------------------------------------------- */
function CompetenciesSection() {
  return (
    <ZoomSection className="py-24 md:py-32 px-6 md:px-12 relative">
      <SectionHeader title="02 // Strengths" subtitle="Core Competencies." />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-6xl">
        {coreCompetencies.map((c, i) => (
          <motion.div
            key={c.area}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, delay: i * 0.06 }}
            className={`glass-panel rounded-3xl p-7 md:p-8 border border-white/10 hover:border-cyan-500/30 transition-colors group ${i === 4 ? 'md:col-span-2' : ''}`}
          >
            <div className="flex items-center gap-3 mb-3">
              <Sparkles className="w-5 h-5 text-cyan-400 shrink-0" />
              <h3 className="text-h3 font-display font-bold text-white group-hover:text-cyan-300 transition-colors">{c.area}</h3>
            </div>
            <p className="text-body text-zinc-400">{c.detail}</p>
          </motion.div>
        ))}
      </div>
    </ZoomSection>
  );
}

/* ----------------------------------------------------------------------- */
/*  Skills                                                                 */
/* ----------------------------------------------------------------------- */
const SKILL_ICONS: Record<string, React.ReactNode> = {
  chart: <LineChart className="w-8 h-8 text-cyan-400" />,
  database: <Database className="w-8 h-8 text-blue-500" />,
  terminal: <Terminal className="w-8 h-8 text-indigo-400" />,
  cpu: <Cpu className="w-8 h-8 text-purple-400" />,
};

function SkillsSection() {
  return (
    <ZoomSection id="skills" className="py-24 md:py-40 px-6 md:px-12 relative bg-black/40 border-y border-white/5 backdrop-blur-xl">
      <SectionHeader title="03 // Arsenal" subtitle="Technical Expertise." />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-7xl">
        {skillGroups.map((skill, i) => (
          <Tilt key={i} className="h-full">
            <div className="glass-panel p-8 md:p-10 rounded-3xl h-full flex flex-col shadow-2xl border border-white/10 bg-white/[0.02]">
              <div className="mb-6 p-4 rounded-2xl bg-white/5 inline-block w-fit backdrop-blur-md border border-white/10">
                {SKILL_ICONS[skill.icon]}
              </div>
              <h3 className="text-h3 font-display font-bold mb-6 text-white drop-shadow-md">{skill.category}</h3>
              <div className="flex flex-wrap gap-3 mt-auto">
                {skill.items.map((item) => (
                  <span key={item} className="px-4 py-2 rounded-full border border-white/20 bg-black/40 text-sm md:text-base font-medium text-zinc-200 backdrop-blur-md shadow-inner">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </Tilt>
        ))}
      </div>
    </ZoomSection>
  );
}

/* ----------------------------------------------------------------------- */
/*  Experience                                                             */
/* ----------------------------------------------------------------------- */
function ExperienceSection() {
  return (
    <ZoomSection id="experience" className="py-24 md:py-40 px-6 md:px-12 relative">
      <SectionHeader title="04 // Trajectory" subtitle="Professional Experience." />
      <div className="max-w-5xl">
        {experienceData.map((exp, i) => (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            key={i}
            className="mb-8 glass-panel p-8 md:p-10 rounded-3xl group hover-target border border-white/5 hover:border-cyan-500/30 transition-all duration-500 shadow-xl"
          >
            <div className="flex flex-col md:flex-row justify-between md:items-start mb-5 gap-4">
              <div>
                <h3 className="text-h3 font-display font-bold text-white group-hover:text-cyan-400 transition-colors drop-shadow-md">{exp.role}</h3>
                <div className="text-lg md:text-xl text-zinc-400 mt-3 flex items-center gap-2 font-medium">
                  <Building2 className="w-5 h-5 text-cyan-500" /> {exp.company}
                </div>
              </div>
              <div className="flex flex-col md:items-end text-sm font-mono tracking-widest text-zinc-400 uppercase font-medium shrink-0">
                <span className="text-cyan-100 bg-cyan-900/30 border border-cyan-500/30 px-4 py-1.5 rounded-full mb-2 backdrop-blur-md">{exp.period}</span>
                <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {exp.location}</span>
              </div>
            </div>
            <ul className="space-y-3 mt-6">
              {exp.description.map((b, idx) => (
                <li key={idx} className="text-zinc-200 text-body flex items-start gap-4">
                  <span className="text-cyan-500 mt-1.5 opacity-80 text-sm">◆</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </ZoomSection>
  );
}

/* ----------------------------------------------------------------------- */
/*  Training & Teaching                                                    */
/* ----------------------------------------------------------------------- */
function TrainingSection() {
  return (
    <ZoomSection id="training" className="py-24 md:py-40 px-6 md:px-12 relative bg-black/40 border-y border-white/5 backdrop-blur-xl">
      <SectionHeader title="05 // Capability Building" subtitle="Training & Teaching." />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-7xl">
        {/* Training timeline */}
        <div className="lg:col-span-2 space-y-6">
          {trainingData.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className="glass-panel p-7 md:p-8 rounded-3xl border border-white/10 hover:border-cyan-500/30 transition-colors group"
            >
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 group-hover:bg-cyan-500/20 transition-colors">
                  <Presentation className="w-5 h-5 text-cyan-400" />
                </div>
                <div className="flex-1">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1.5 mb-2">
                    <h3 className="text-lg md:text-xl font-display font-bold text-white group-hover:text-cyan-300 transition-colors">{t.role}</h3>
                    <span className="text-xs font-mono uppercase tracking-widest text-cyan-200/80 shrink-0">{t.period}</span>
                  </div>
                  <p className="text-sm text-zinc-400 font-medium mb-4">{t.org} · {t.location}</p>
                  <ul className="space-y-2">
                    {t.points.map((p, idx) => (
                      <li key={idx} className="text-zinc-300 text-sm md:text-base flex items-start gap-3">
                        <span className="text-cyan-500 mt-1 text-xs">◆</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Course modules */}
        <Tilt className="h-full" intensity={4}>
          <div className="glass-panel p-8 rounded-3xl border border-white/10 h-full shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-600/10 blur-[80px] rounded-full pointer-events-none" />
            <div className="flex items-center gap-3 mb-8 relative z-10">
              <Layers className="w-6 h-6 text-cyan-400" />
              <h3 className="text-h3 font-display font-bold text-white">Modules I Teach</h3>
            </div>
            <ul className="space-y-4 relative z-10">
              {courseModules.map((m, i) => (
                <li key={i} className="flex items-start gap-3 text-sm md:text-base text-zinc-200">
                  <CheckCircle2 className="w-4 h-4 text-cyan-500 mt-1 shrink-0" />
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </div>
        </Tilt>
      </div>
    </ZoomSection>
  );
}

/* ----------------------------------------------------------------------- */
/*  Projects — client delivery + GitHub                                    */
/* ----------------------------------------------------------------------- */
function ProjectsSection() {
  return (
    <ZoomSection id="projects" className="py-24 md:py-40 px-6 md:px-12 relative">
      <SectionHeader title="06 // Case Studies" subtitle="Flagship Projects." />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-[1400px]">
        {clientProjects.map((p, i) => (
          <ClientCard key={i} project={p} index={i} />
        ))}
      </div>

      {/* GitHub projects */}
      <div className="mt-20 md:mt-24">
        <div className="flex items-center gap-3 mb-10">
          <GitBranch className="w-6 h-6 text-cyan-400" />
          <h3 className="text-h3 font-display font-bold text-white">Open-Source & Code</h3>
          <a href={profile.github} target="_blank" rel="noreferrer" className="ml-auto text-sm font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 hover-target">
            github.com/syedjawaadali <ExternalLink className="w-4 h-4" />
          </a>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 max-w-[1400px]">
          {githubProjects.map((g, i) => (
            <motion.a
              key={g.name}
              href={g.url}
              target="_blank"
              rel="noreferrer"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: (i % 3) * 0.06 }}
              className="glass-panel rounded-2xl p-6 border border-white/10 hover:border-cyan-500/40 transition-all group hover-target flex flex-col"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 font-mono text-cyan-300 font-bold text-sm md:text-base">
                  <Github className="w-4 h-4" /> {g.name}
                </div>
                <ArrowUpRight className="w-4 h-4 text-zinc-500 group-hover:text-cyan-400 transition-colors" />
              </div>
              <p className="text-sm text-zinc-400 flex-1">{g.description}</p>
              <div className="flex flex-wrap gap-2 mt-4">
                {g.tech.map((t) => (
                  <span key={t} className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-300">{t}</span>
                ))}
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </ZoomSection>
  );
}

function ClientCard({ project, index }: { project: typeof clientProjects[number]; index: number }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mx = useSpring(x, { stiffness: 300, damping: 30 });
  const my = useSpring(y, { stiffness: 300, damping: 30 });
  const rotateX = useTransform(my, [-0.5, 0.5], ['7deg', '-7deg']);
  const rotateY = useTransform(mx, [-0.5, 0.5], ['-7deg', '7deg']);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) return;
    const rect = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  };
  const onLeave = () => { x.set(0); y.set(0); };

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.6, delay: index * 0.08 }}
      className="w-full h-full"
    >
      <motion.div
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        style={{ rotateX, rotateY }}
        className="w-full h-full min-h-[420px] glass-panel rounded-[2rem] p-8 md:p-9 flex flex-col justify-between group hover-target relative overflow-hidden shadow-2xl border border-white/10 hover:border-white/30 transition-all duration-300 md:hover:scale-[1.02]"
      >
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/20 blur-[60px] rounded-full group-hover:bg-blue-500/40 transition-colors duration-700 pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/10 blur-[60px] rounded-full group-hover:bg-cyan-500/20 transition-colors duration-700 pointer-events-none" />

        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
            <span className="px-4 py-2 rounded-full bg-white/10 border border-white/10 text-xs font-mono tracking-widest uppercase text-white font-medium shadow-sm backdrop-blur-md">
              {project.client}
            </span>
            <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center bg-black/40 backdrop-blur-xl group-hover:bg-white group-hover:text-black transition-colors">
              <BarChart3 className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-h3 font-display font-bold mb-4 text-white drop-shadow-md">{project.title}</h3>
          <p className="text-zinc-300 text-body font-medium">{project.description}</p>
          <p className="mt-4 text-sm text-cyan-300/90 flex items-start gap-2">
            <Sparkles className="w-4 h-4 mt-0.5 shrink-0" /> {project.impact}
          </p>
        </div>

        <div className="mt-8 border-t border-white/20 pt-5 relative z-10">
          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block mb-2.5 font-bold">Stack</span>
          <div className="flex flex-wrap gap-2">
            {project.tech.map((t) => (
              <span key={t} className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-cyan-900/20 border border-cyan-500/20 text-cyan-200">{t}</span>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*  Dashboard gallery (lightbox)                                           */
/* ----------------------------------------------------------------------- */
function DashboardGallery() {
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActive(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <ZoomSection id="dashboards" className="py-24 md:py-40 px-6 md:px-12 relative bg-black/40 border-y border-white/5 backdrop-blur-xl">
      <SectionHeader title="07 // Visual Proof" subtitle="BI Dashboard Gallery." />
      <p className="text-body text-zinc-400 max-w-3xl -mt-8 mb-14">
        A selection of production Power BI & Tableau dashboards across telecom, retail, HR, public sector and finance. Click any dashboard to view in detail.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-[1500px]">
        {dashboards.map((d, i) => (
          <motion.button
            key={d.title}
            onClick={() => setActive(i)}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4, delay: (i % 3) * 0.06 }}
            className="group relative rounded-2xl overflow-hidden border border-white/10 hover:border-cyan-500/50 transition-all hover-target text-left bg-black/50"
          >
            <div className="aspect-[16/10] overflow-hidden">
              <img
                src={d.src}
                alt={d.title}
                loading="lazy"
                className="w-full h-full object-cover object-top opacity-85 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent pointer-events-none" />
            <div className="absolute bottom-0 left-0 right-0 p-5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/30 text-cyan-200">{d.tool}</span>
                {d.tags.slice(0, 1).map((t) => (
                  <span key={t} className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">{t}</span>
                ))}
              </div>
              <h3 className="font-display font-bold text-white text-base md:text-lg">{d.title}</h3>
            </div>
            <div className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 border border-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md">
              <ArrowUpRight className="w-4 h-4 text-white" />
            </div>
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {active !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActive(null)}
            className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 md:p-10 cursor-pointer"
          >
            <button
              onClick={() => setActive(null)}
              className="absolute top-6 right-6 w-12 h-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white hover:text-black transition-colors z-10"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-6xl w-full cursor-default"
            >
              <img src={dashboards[active].src} alt={dashboards[active].title} className="w-full rounded-2xl border border-white/10 shadow-2xl max-h-[78vh] object-contain bg-black" />
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span className="text-xs font-mono uppercase tracking-widest px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/30 text-cyan-200">{dashboards[active].tool}</span>
                <h3 className="font-display font-bold text-white text-xl">{dashboards[active].title}</h3>
                <div className="flex gap-2 ml-auto">
                  {dashboards[active].tags.map((t) => (
                    <span key={t} className="text-[11px] font-mono uppercase tracking-widest text-zinc-400 border border-white/10 px-2.5 py-1 rounded-full">{t}</span>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ZoomSection>
  );
}

/* ----------------------------------------------------------------------- */
/*  Education + FYP + Certifications                                       */
/* ----------------------------------------------------------------------- */
function EducationSection() {
  return (
    <ZoomSection className="py-24 md:py-40 px-6 md:px-12 relative">
      <SectionHeader title="08 // Background" subtitle="Education & Credentials." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 max-w-6xl">
        {/* Education + FYP */}
        <div className="space-y-6">
          {education.map((e) => (
            <Tilt key={e.degree}>
              <div className="flex flex-col md:flex-row items-start gap-6 group hover-target glass-panel p-8 rounded-3xl border border-white/10">
                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 group-hover:bg-cyan-500/20 transition-colors shadow-lg">
                  <GraduationCap className="w-8 h-8 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-h3 font-display font-bold mb-2 text-white drop-shadow-md">{e.degree}</h3>
                  <p className="text-zinc-300 mb-4 font-medium text-lg">{e.school}</p>
                  <div className="flex flex-wrap gap-4 text-xs font-mono uppercase tracking-widest text-zinc-400 font-bold">
                    <span className="text-cyan-300 bg-cyan-900/30 px-3 py-1 rounded-md border border-cyan-500/30">{e.grade}</span>
                    <span className="bg-white/10 px-3 py-1 rounded-md border border-white/10">{e.period}</span>
                  </div>
                </div>
              </div>
            </Tilt>
          ))}

          {/* Final Year Project */}
          <Tilt>
            <div className="glass-panel p-8 rounded-3xl border border-white/10 group hover-target relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-600/10 blur-[70px] rounded-full pointer-events-none" />
              <div className="flex items-center gap-3 mb-3 relative z-10">
                <Award className="w-6 h-6 text-indigo-400" />
                <span className="text-xs font-mono uppercase tracking-[0.25em] text-indigo-300 font-bold">Final Year Project</span>
              </div>
              <h3 className="text-h3 font-display font-bold mb-3 text-white relative z-10">{finalYearProject.title}</h3>
              <p className="text-body text-zinc-400 relative z-10">{finalYearProject.summary}</p>
              <div className="flex flex-wrap gap-2 mt-5 relative z-10">
                {finalYearProject.tech.map((t) => (
                  <span key={t} className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-300">{t}</span>
                ))}
              </div>
            </div>
          </Tilt>
        </div>

        {/* Certifications */}
        <div className="space-y-6">
          <div className="glass-panel p-8 md:p-10 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden hover-target">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-600/10 blur-[80px] rounded-full pointer-events-none" />
            <div className="flex items-center gap-4 mb-8 relative z-10">
              <Award className="w-7 h-7 text-cyan-400" />
              <h3 className="text-h3 font-display font-bold text-white">Certifications</h3>
            </div>
            <ul className="space-y-5 relative z-10">
              {certifications.map((c, i) => (
                <li key={i} className="flex items-start gap-4 text-body text-zinc-200 font-medium">
                  <CheckCircle2 className="w-5 h-5 text-cyan-500 mt-0.5 shrink-0" />
                  {c}
                </li>
              ))}
            </ul>
          </div>

          <div className="glass-panel p-8 rounded-3xl border border-white/10 hover-target">
            <div className="flex items-center gap-3 mb-6">
              <Clock className="w-6 h-6 text-amber-400" />
              <h3 className="text-xl font-display font-bold text-white">In Progress</h3>
            </div>
            <ul className="space-y-4">
              {certificationsInProgress.map((c, i) => (
                <li key={i} className="flex items-start gap-3 text-zinc-300">
                  <span className="w-2 h-2 rounded-full bg-amber-400/80 mt-2 shrink-0" />
                  {c}
                </li>
              ))}
            </ul>
          </div>

          <div className="glass-panel p-8 rounded-3xl border border-white/10">
            <h3 className="text-sm font-mono uppercase tracking-widest text-cyan-400 mb-4 font-bold">Also worth knowing</h3>
            <p className="text-sm text-zinc-300 mb-3"><span className="text-white font-medium">Languages:</span> {additionalInfo.languages}</p>
            <p className="text-sm text-zinc-300"><span className="text-white font-medium">Sectors:</span> {additionalInfo.sectors}</p>
          </div>
        </div>
      </div>
    </ZoomSection>
  );
}

/* ----------------------------------------------------------------------- */
/*  Footer / contact                                                       */
/* ----------------------------------------------------------------------- */
function Footer() {
  return (
    <footer id="contact" className="py-28 md:py-32 px-6 md:px-12 border-t border-white/10 bg-[#020202] flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute top-0 w-full h-[2px] bg-gradient-to-r from-transparent via-cyan-500/80 to-transparent" />

      <span className="font-mono text-cyan-500 uppercase tracking-[0.3em] text-xs md:text-sm font-bold mb-8">09 // Get in touch</span>
      <h2 className="text-hero font-display font-bold text-stroke opacity-60 mb-14 hover:opacity-100 transition-all duration-700 select-none cursor-default hover-target text-center">
        LET'S TALK.
      </h2>

      <div className="flex flex-wrap justify-center gap-7 md:gap-14 z-10 mb-20">
        <SocialLink href={`mailto:${profile.email}`} icon={<Mail className="w-7 h-7" />} label="Email" />
        <SocialLink href={`tel:${profile.phone.replace(/\s/g, '')}`} icon={<Phone className="w-7 h-7" />} label="Call" />
        <SocialLink href={profile.linkedin} icon={<Linkedin className="w-7 h-7" />} label="LinkedIn" />
        <SocialLink href={profile.github} icon={<Github className="w-7 h-7" />} label="GitHub" />
      </div>

      <div className="w-full max-w-5xl flex flex-col md:flex-row items-center justify-between text-xs font-mono text-zinc-500 tracking-widest uppercase gap-4 text-center md:text-left font-bold">
        <p>© 2026 {profile.name.toUpperCase()}</p>
        <p>{profile.location} · {profile.email}</p>
        <p>Data Engineering & Analytics</p>
      </div>
    </footer>
  );
}

function SocialLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="group flex flex-col items-center hover:text-cyan-400 transition-colors hover-target">
      <div className="w-20 h-20 md:w-24 md:h-24 rounded-full border border-white/10 flex items-center justify-center group-hover:border-cyan-400 mb-5 transition-all duration-300 glass-panel group-hover:bg-cyan-900/30 group-hover:shadow-[0_0_30px_rgba(6,182,212,0.3)] group-hover:scale-110">
        <div className="text-zinc-300 group-hover:text-cyan-400 transition-colors">{icon}</div>
      </div>
      <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-zinc-400 group-hover:text-cyan-400 transition-colors font-bold">{label}</span>
    </a>
  );
}
