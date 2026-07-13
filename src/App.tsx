import React, { useEffect, useState, useRef } from 'react';
import { motion, useScroll, useTransform, AnimatePresence, useSpring, useMotionValue } from 'motion/react';
import { ArrowUpRight, Database, LineChart, Terminal, Code2, Linkedin, Github, Mail, Layers, Cpu, Compass, BookOpen, Camera, Award, GraduationCap, Building2 } from 'lucide-react';

export default function App() {
  const [loading, setLoading] = useState(true);

  return (
    <div className="bg-[#050505] min-h-screen text-[#f5f5f5] font-sans selection:bg-cyan-500/30 overflow-hidden relative">
      <CustomCursor />
      <AnimatedBackground />
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
              <SkillsSection />
              <ExperienceSection />
              <ProjectsSection />
              <EducationCertifications />
              <HobbiesSection />
            </main>
            <Footer />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Cinematic Preloader ---
function Preloader({ onComplete }: { onComplete: () => void }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let current = 0;
    const interval = setInterval(() => {
      current += 2;
      if (current >= 100) {
        setCount(100);
        clearInterval(interval);
        setTimeout(onComplete, 500); // Total 3 seconds (2500ms + 500ms)
      } else {
        setCount(current);
      }
    }, 50);
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
        <div className="w-16 h-[2px] bg-cyan-500 rounded-full"></div>
        <span className="font-mono text-sm md:text-base tracking-[0.4em] text-cyan-400 uppercase font-bold">SYED JAWAAD ALI</span>
        <div className="w-16 h-[2px] bg-cyan-500 rounded-full"></div>
      </div>
    </motion.div>
  );
}

// --- Background Orbs (3D-like depth) ---
function AnimatedBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      <motion.div 
        animate={{ 
          x: [0, 50, 0, -50, 0],
          y: [0, -50, 50, 0, 0],
          scale: [1, 1.1, 1, 1.2, 1]
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="absolute top-[10%] left-[5%] w-[400px] h-[400px] md:w-[600px] md:h-[600px] bg-cyan-600/10 rounded-full blur-[100px] md:blur-[150px] mix-blend-screen"
      />
      <motion.div 
        animate={{ 
          x: [0, -50, 0, 50, 0],
          y: [0, 50, -50, 0, 0],
          scale: [1, 1.2, 1, 1.1, 1]
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        className="absolute bottom-[5%] right-[5%] w-[500px] h-[500px] md:w-[800px] md:h-[800px] bg-blue-700/10 rounded-full blur-[120px] md:blur-[180px] mix-blend-screen"
      />
    </div>
  );
}

// --- Custom Fluid Cursor ---
function CustomCursor() {
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  const springConfig = { damping: 25, stiffness: 700, mass: 0.5 };
  const cursorXSpring = useSpring(cursorX, springConfig);
  const cursorYSpring = useSpring(cursorY, springConfig);
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    const moveCursor = (e: MouseEvent) => {
      cursorX.set(e.clientX - 16);
      cursorY.set(e.clientY - 16);
    };
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

// --- Noise Overlay ---
function NoiseOverlay() {
  return (
    <div 
      className="fixed inset-0 pointer-events-none z-[90] opacity-[0.03] mix-blend-overlay"
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
    />
  );
}

// --- Zoom Section Wrapper for Scroll Animation ---
function ZoomSection({ children, id, className = "" }: { children: React.ReactNode, id?: string, className?: string }) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, scale: 0.9, y: 50 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px -10% 0px" }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

// --- Navbar ---
function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-8 mix-blend-difference text-white pointer-events-none">
      <div className="font-display font-bold text-lg md:text-2xl tracking-tighter pointer-events-auto hover-target uppercase">
        <a href="#">Syed Jawaad Ali</a>
      </div>
      <div className="hidden lg:flex space-x-8 text-sm font-mono uppercase tracking-[0.2em] pointer-events-auto font-medium">
        {['About', 'Skills', 'Experience', 'Projects'].map((item) => (
          <a key={item} href={`#${item.toLowerCase()}`} className="hover-target hover:text-cyan-400 transition-colors">{item}</a>
        ))}
      </div>
    </nav>
  );
}

// --- Hero Section ---
function HeroSection() {
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 1000], [0, 200]);
  const opacity = useTransform(scrollY, [0, 500], [1, 0]);

  return (
    <section className="relative min-h-screen flex flex-col justify-center px-6 md:px-12 pt-24 pb-12 overflow-hidden">
      <motion.div style={{ y: y1, opacity }} className="relative z-10 mt-auto">
        <div className="mb-8 flex items-center gap-4">
          <div className="w-12 h-[2px] bg-cyan-400"></div>
          <span className="font-mono text-cyan-400 uppercase tracking-widest text-sm md:text-base font-bold">Syed Jawaad Ali</span>
        </div>
        
        <h1 className="text-display font-display font-bold mb-8 select-none drop-shadow-2xl">
          BUSINESS <br />
          <span className="text-gradient italic pr-4 hover-target">INTELLIGENCE</span> <br />
          EXPERT
        </h1>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-t border-white/20 pt-8 mt-12">
          <p className="text-subhead text-zinc-200 max-w-3xl font-light">
            I architect scalable data pipelines and craft intuitive BI dashboards that turn complex datasets into actionable strategic insights.
          </p>
          <div className="flex flex-col items-start md:items-end font-mono text-sm text-zinc-400 uppercase tracking-widest">
            <span>Based in</span>
            <span className="text-white mt-1 font-bold">Karachi, Pakistan</span>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

// --- Shared Header ---
function SectionHeader({ title, subtitle }: { title: string, subtitle: string }) {
  return (
    <div className="mb-16">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-10 h-[2px] bg-cyan-500 rounded-full"></div>
        <span className="font-mono text-cyan-500 uppercase tracking-[0.3em] text-xs md:text-sm font-bold">{title}</span>
      </div>
      <h2 className="text-h2 font-display font-bold text-white drop-shadow-lg">{subtitle}</h2>
    </div>
  );
}

// --- Intro / About ---
function IntroSection() {
  return (
    <ZoomSection id="about" className="py-24 md:py-40 px-6 md:px-12 relative">
      <SectionHeader title="01 // Profile" subtitle="Professional Summary." />
      <div className="max-w-5xl">
        <p className="text-lead font-light text-zinc-300 drop-shadow-md">
          With <span className="text-white font-medium bg-white/5 px-2 rounded-lg">5+ years of experience</span> designing and automating data-driven dashboards across Telecom, Healthcare, Banking, and E-Commerce.
          I have a proven track record of translating complex datasets into <span className="text-gradient italic font-display font-medium">actionable insights</span> that drive strategic decision-making.
        </p>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-20 border-t border-white/20 pt-16">
          <StatBox value="5+" label="Years Experience" />
          <StatBox value="100+" label="Dashboards Built" />
          <StatBox value="4" label="Industries Served" />
          <StatBox value="∞" label="Data Curiosity" />
        </div>
      </div>
    </ZoomSection>
  );
}

function StatBox({ value, label }: { value: string, label: string }) {
  return (
    <div className="flex flex-col hover-target group">
      <span className="text-stat font-display font-bold text-white mb-2 drop-shadow-lg group-hover:text-cyan-400 transition-colors">{value}</span>
      <span className="text-sm font-mono text-zinc-400 uppercase tracking-widest font-medium">{label}</span>
    </div>
  );
}

// --- Skills / Capabilities ---
function SkillsSection() {
  const skills = [
    { category: "Programming & Scripting", items: "SQL, VBA (Excel Automation), Python (Intermediate)", icon: <Terminal className="w-8 h-8 text-cyan-400" /> },
    { category: "Data Visualization", items: "Tableau, Power BI, Looker Studio, Grafana, Excel", icon: <LineChart className="w-8 h-8 text-blue-500" /> },
    { category: "Data Processing & ETL", items: "Tableau Prep, Power Query, SSIS, Snowflake, BigQuery", icon: <Database className="w-8 h-8 text-indigo-400" /> },
    { category: "Tools & Platforms", items: "GCP, GitHub, Automations, Microsoft Office Suite", icon: <Cpu className="w-8 h-8 text-purple-400" /> }
  ];

  return (
    <ZoomSection id="skills" className="py-24 md:py-40 px-6 md:px-12 relative bg-black/40 border-y border-white/5 backdrop-blur-xl">
      <SectionHeader title="02 // Arsenal" subtitle="Technical Expertise." />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-16 max-w-7xl">
        {skills.map((skill, i) => (
          <TiltBlock key={i} className="h-full">
            <div className="glass-panel p-8 md:p-12 rounded-3xl h-full flex flex-col shadow-2xl border border-white/10 bg-white/[0.02]">
              <div className="mb-6 p-4 rounded-2xl bg-white/5 inline-block w-fit backdrop-blur-md border border-white/10">
                {skill.icon}
              </div>
              <h3 className="text-h3 font-display font-bold mb-6 text-white drop-shadow-md">{skill.category}</h3>
              <div className="flex flex-wrap gap-3 mt-auto">
                {skill.items.split(', ').map(item => (
                  <span key={item} className="px-4 py-2 rounded-full border border-white/20 bg-black/40 text-sm md:text-base font-medium text-zinc-200 backdrop-blur-md shadow-inner">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </TiltBlock>
        ))}
      </div>
    </ZoomSection>
  );
}

// --- 3D Tilt Wrapper for elements ---
function TiltBlock({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouseXSpring = useSpring(x, { stiffness: 300, damping: 30 });
  const mouseYSpring = useSpring(y, { stiffness: 300, damping: 30 });

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["5deg", "-5deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-5deg", "5deg"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (typeof window !== 'undefined' && window.matchMedia("(pointer: coarse)").matches) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX, rotateY }}
      className={`w-full ${className}`}
    >
      <div className={`w-full transition-transform duration-300 md:hover:scale-[1.02] ${className.includes('h-full') ? 'h-full' : ''}`}>
        {children}
      </div>
    </motion.div>
  );
}

// --- Experience ---
function ExperienceSection() {
  const experiences = [
    { 
      role: "Assistant Manager – BI Reporting, Planning & Analytics", 
      company: "Telenor Pakistan", loc: "Karachi, Pakistan", date: "Dec 2024 – Present",
      bullets: [
        "Designed and automated Power BI and Excel dashboards integrating telecom performance data.",
        "Developed KPI frameworks, optimized SQL-based data models, and implemented reporting governance standards.",
        "Collaborated with executives to translate business needs into BI solutions driving growth and efficiency."
      ]
    },
    { 
      role: "Marketing Data Analyst", 
      company: "DM Clinical Research", loc: "Remote, USA", date: "Aug 2024 – Nov 2024",
      bullets: [
        "Automated reporting and dashboards to enable real-time decision-making across sectors, including healthcare.",
        "Analyzed clinical trial data and automated reports to drive marketing strategy, segmentation, and positioning."
      ]
    },
    { 
      role: "Lead Data Analyst", 
      company: "TGD Services DMCC", loc: "Dubai, UAE", date: "Dec 2023 – Jul 2024",
      bullets: [
        "Collected, cleaned, validated, and automated data extraction from multiple sources using Excel, Python, and MySQL.",
        "Built automated Tableau dashboards and reports to support data storytelling.",
        "Utilized GIS tools to analyze geospatial data, conduct spatial analysis, and create maps."
      ]
    },
    { 
      role: "Assistant Manager – MIS and Analytics", 
      company: "Habib Bank Limited", loc: "Karachi, Pakistan", date: "Feb 2023 – Aug 2023",
      bullets: [
        "Developed and automated daily productivity reports shared with stakeholders.",
        "Automated MIS processes for hiring and salary processing, along with reports for senior management."
      ]
    },
    { 
      role: "Lead, Data Analytics and Business Intelligence", 
      company: "The Tech Wave", loc: "Karachi, Pakistan", date: "Nov 2021 – Jan 2023",
      bullets: [
        "Led product engineering for data tools, ensuring performance, scalability, and seamless integration.",
        "Designed interactive dashboards using Power BI, Tableau, and Excel."
      ]
    }
  ];

  return (
    <ZoomSection id="experience" className="py-24 md:py-40 px-6 md:px-12 relative">
      <SectionHeader title="03 // Trajectory" subtitle="Professional Experience." />
      
      <div className="mt-16 max-w-5xl">
        {experiences.map((exp, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            key={i} 
            className="mb-12 glass-panel p-8 md:p-10 rounded-3xl group hover-target border border-white/5 hover:border-cyan-500/30 transition-all duration-500 shadow-xl"
          >
            <div className="flex flex-col md:flex-row justify-between md:items-start mb-6 gap-4">
              <div>
                <h3 className="text-h3 font-display font-bold text-white group-hover:text-cyan-400 transition-colors drop-shadow-md">{exp.role}</h3>
                <div className="text-lg md:text-xl text-zinc-400 mt-3 flex items-center gap-2 font-medium">
                  <Building2 className="w-5 h-5 text-cyan-500" /> {exp.company}
                </div>
              </div>
              <div className="flex flex-col md:items-end text-sm font-mono tracking-widest text-zinc-400 uppercase font-medium shrink-0">
                <span className="text-cyan-100 bg-cyan-900/30 border border-cyan-500/30 px-4 py-1.5 rounded-full mb-2 backdrop-blur-md">{exp.date}</span>
                <span>{exp.loc}</span>
              </div>
            </div>
            <ul className="space-y-3 mt-8">
              {exp.bullets.map((b, idx) => (
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

// --- Intuitive 3D Projects Grid ---
function ProjectsSection() {
  const projects = [
    { title: "Automation of Sales Performance Dashboard", client: "Telenor Pakistan", tech: "Power Query, Power BI, SQL Server, Python", desc: "Developed a daily KPI dashboard, automating data integration and reporting; reduced reporting time by 70% and optimized sales strategies." },
    { title: "Call Complaints & Marketing Performance System", client: "TGD Services DMCC", tech: "Tableau SDK, SQL, MySQL, ETL, API", desc: "Built an embedded analytics dashboard to track marketing campaign performance and customer complaints, delivering real-time insights." },
    { title: "New Zealand Economy Digitalization Project", client: "Govt. of New Zealand (Freelance)", tech: "Tableau Prep, Server, SQL, Snowflake", desc: "Developed 50+ dashboards tracking economic KPIs and trends; automated reporting to improve decision-making and reduce manual effort." },
    { title: "Discord Alerting System for AI Bots", client: "AI Call Center (Freelance)", tech: "Discord Webhook, BigQuery, Python, GCP", desc: "Built an automated alert system to monitor AI bot performance and notify CSRs of KPI breaches, eliminating manual effort." },
    { title: "ETL Sales Pipeline Automation", client: "AI Call Center (Freelance)", tech: "ETL, API, Python, Google BigQuery", desc: "Designed a real-time ETL pipeline processing and loading sales data every 5 seconds, enabling real-time reporting." },
    { title: "Agent Performance System", client: "Habib Bank Limited", tech: "Advanced Excel, Power Query, Power BI", desc: "Developed a dashboard to monitor customer service metrics, improving ticket resolution times and enhancing customer satisfaction." }
  ];

  return (
    <ZoomSection id="projects" className="py-24 md:py-40 px-6 md:px-12 relative bg-black/40 border-y border-white/5 backdrop-blur-xl">
      <SectionHeader title="04 // Case Studies" subtitle="Key Projects." />
      
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 mt-16 max-w-[1400px]">
        {projects.map((p, i) => (
          <ProjectCard key={i} project={p} index={i} />
        ))}
      </div>
    </ZoomSection>
  );
}

function ProjectCard({ project, index }: { project: any, index: number }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouseXSpring = useSpring(x, { stiffness: 300, damping: 30 });
  const mouseYSpring = useSpring(y, { stiffness: 300, damping: 30 });

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["8deg", "-8deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-8deg", "8deg"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (typeof window !== 'undefined' && window.matchMedia("(pointer: coarse)").matches) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      className="w-full h-full"
    >
      <motion.div
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ rotateX, rotateY }}
        className="w-full h-full min-h-[450px] glass-panel rounded-[2rem] p-8 md:p-10 flex flex-col justify-between group hover-target relative overflow-hidden shadow-2xl border border-white/10 hover:border-white/30 transition-all duration-300 md:hover:scale-[1.02]"
      >
        {/* Animated Glow inside card */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/20 blur-[60px] rounded-full group-hover:bg-blue-500/40 transition-colors duration-700 pointer-events-none"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/10 blur-[60px] rounded-full group-hover:bg-cyan-500/20 transition-colors duration-700 pointer-events-none"></div>
        
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-8">
            <span className="px-4 py-2 rounded-full bg-white/10 border border-white/10 text-xs font-mono tracking-widest uppercase text-white font-medium shadow-sm backdrop-blur-md">
              {project.client}
            </span>
            <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center bg-black/40 backdrop-blur-xl group-hover:bg-white group-hover:text-black transition-colors">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-h3 font-display font-bold mb-6 text-white drop-shadow-md">{project.title}</h3>
          <p className="text-zinc-300 text-body font-medium">{project.desc}</p>
        </div>
        
        <div className="mt-8 border-t border-white/20 pt-6 relative z-10">
          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block mb-2 font-bold">Technologies</span>
          <p className="text-cyan-300 font-bold text-sm md:text-base drop-shadow-sm">{project.tech}</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

// --- Education & Certifications ---
function EducationCertifications() {
  const certs = [
    "IBM Data Science Professional Certificate",
    "Google Business Intelligence Specialization",
    "Business Intelligence for Consultants",
    "Prompt Engineering for Professionals"
  ];

  return (
    <ZoomSection className="py-24 md:py-40 px-6 md:px-12 relative">
      <SectionHeader title="05 // Background" subtitle="Education & Certs." />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 mt-16 max-w-6xl">
        {/* Education */}
        <div className="space-y-8">
          <TiltBlock>
            <div className="flex flex-col md:flex-row items-start gap-6 group hover-target glass-panel p-8 rounded-3xl border border-white/10">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 group-hover:bg-cyan-500/20 transition-colors shadow-lg">
                <GraduationCap className="w-8 h-8 text-cyan-400" />
              </div>
              <div>
                <h3 className="text-h3 font-display font-bold mb-3 text-white drop-shadow-md">M.S. in Data Engineering & Information Management</h3>
                <p className="text-zinc-300 mb-4 font-medium text-lg">NED University of Engineering and Technology</p>
                <div className="flex flex-wrap gap-4 text-xs font-mono uppercase tracking-widest text-zinc-400 font-bold">
                  <span className="text-cyan-300 bg-cyan-900/30 px-3 py-1 rounded-md border border-cyan-500/30">CGPA: 3.4</span>
                  <span className="bg-white/10 px-3 py-1 rounded-md border border-white/10">2021 – 2024</span>
                </div>
              </div>
            </div>
          </TiltBlock>
          
          <TiltBlock>
            <div className="flex flex-col md:flex-row items-start gap-6 group hover-target glass-panel p-8 rounded-3xl border border-white/10">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 group-hover:bg-cyan-500/20 transition-colors shadow-lg">
                <GraduationCap className="w-8 h-8 text-cyan-400" />
              </div>
              <div>
                <h3 className="text-h3 font-display font-bold mb-3 text-white drop-shadow-md">B.S. in Economics and Finance</h3>
                <p className="text-zinc-300 mb-4 font-medium text-lg">NED University of Engineering and Technology</p>
                <div className="flex flex-wrap gap-4 text-xs font-mono uppercase tracking-widest text-zinc-400 font-bold">
                  <span className="text-cyan-300 bg-cyan-900/30 px-3 py-1 rounded-md border border-cyan-500/30">CGPA: 3.3</span>
                  <span className="bg-white/10 px-3 py-1 rounded-md border border-white/10">2016 – 2020</span>
                </div>
              </div>
            </div>
          </TiltBlock>
        </div>

        {/* Certifications */}
        <TiltBlock className="h-full">
          <div className="glass-panel p-8 md:p-12 rounded-3xl border border-white/10 h-full shadow-2xl relative overflow-hidden hover-target">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-600/10 blur-[80px] rounded-full pointer-events-none"></div>
            <div className="flex items-center gap-4 mb-10 relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-lg">
                <Award className="w-7 h-7 text-cyan-400" />
              </div>
              <h3 className="text-h3 font-display font-bold text-white drop-shadow-md">Certifications</h3>
            </div>
            <ul className="space-y-6 relative z-10">
              {certs.map((c, i) => (
                <li key={i} className="flex items-start gap-4 text-body text-zinc-200 font-medium">
                  <div className="w-2.5 h-2.5 bg-cyan-500 rounded-full mt-2.5 shrink-0 shadow-[0_0_10px_rgba(6,182,212,0.8)]"></div>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </TiltBlock>
      </div>
    </ZoomSection>
  );
}

// --- Hobbies & Interests ---
function HobbiesSection() {
  const hobbies = [
    { name: "Reading", icon: <BookOpen className="w-12 h-12" /> },
    { name: "Traveling", icon: <Compass className="w-12 h-12" /> },
    { name: "Tech Exploration", icon: <Cpu className="w-12 h-12" /> },
    { name: "Photography", icon: <Camera className="w-12 h-12" /> }
  ];

  return (
    <ZoomSection id="hobbies" className="py-24 md:py-40 px-6 md:px-12 relative bg-black/40 border-t border-white/5 backdrop-blur-xl">
      <SectionHeader title="06 // Beyond Data" subtitle="Interests & Hobbies." />
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-16 max-w-6xl">
        {hobbies.map((h, i) => (
          <TiltBlock key={i} className="h-full">
            <div className="glass-panel aspect-square rounded-3xl flex flex-col items-center justify-center gap-6 group hover-target border border-white/10 shadow-lg h-full">
              <div className="text-zinc-400 group-hover:text-cyan-400 transition-colors duration-300 transform group-hover:scale-110 drop-shadow-md">
                {h.icon}
              </div>
              <span className="font-mono text-sm tracking-widest uppercase text-zinc-300 font-bold group-hover:text-white transition-colors">{h.name}</span>
            </div>
          </TiltBlock>
        ))}
      </div>
    </ZoomSection>
  );
}

// --- Footer Section ---
function Footer() {
  return (
    <footer className="py-32 px-6 md:px-12 border-t border-white/10 bg-[#020202] flex flex-col items-center justify-center relative overflow-hidden">
      {/* Top Accent Line */}
      <div className="absolute top-0 w-full h-[2px] bg-gradient-to-r from-transparent via-cyan-500/80 to-transparent"></div>
      
      <h2 className="text-hero font-display font-bold text-stroke opacity-60 mb-16 hover:opacity-100 transition-all duration-700 select-none cursor-default hover-target text-center">
        LET'S TALK.
      </h2>
      
      <div className="flex flex-wrap justify-center gap-8 md:gap-16 z-10 mb-24">
        <SocialLink href="mailto:syedjawaadali@gmail.com" icon={<Mail className="w-8 h-8" />} label="Email" />
        <SocialLink href="https://linkedin.com/in/syedjawaadali" icon={<Linkedin className="w-8 h-8" />} label="LinkedIn" />
        <SocialLink href="https://novypro.com/profile/syedjawaadali" icon={<LineChart className="w-8 h-8" />} label="NovyPro" />
        <SocialLink href="https://github.com/syedjawaadali" icon={<Github className="w-8 h-8" />} label="GitHub" />
      </div>
      
      <div className="w-full flex flex-col md:flex-row items-center justify-between text-xs font-mono text-zinc-500 tracking-widest uppercase gap-4 text-center md:text-left font-bold">
        <p>© 2026 SYED JAWAAD ALI</p>
        <p>DATA ENGINEERING & ANALYTICS.</p>
      </div>
    </footer>
  );
}

function SocialLink({ href, icon, label }: { href: string, icon: React.ReactNode, label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="group flex flex-col items-center hover:text-cyan-400 transition-colors hover-target">
      <div className="w-24 h-24 rounded-full border border-white/10 flex items-center justify-center group-hover:border-cyan-400 mb-6 transition-all duration-300 glass-panel group-hover:bg-cyan-900/30 group-hover:shadow-[0_0_30px_rgba(6,182,212,0.3)] group-hover:scale-110">
        <div className="text-zinc-300 group-hover:text-cyan-400 transition-colors">
          {icon}
        </div>
      </div>
      <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-zinc-400 group-hover:text-cyan-400 transition-colors font-bold">
        {label}
      </span>
    </a>
  );
}
