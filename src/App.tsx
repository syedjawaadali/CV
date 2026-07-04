/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import HomeView from './components/HomeView';
import ProjectsView from './components/ProjectsView';
import ExperienceView from './components/ExperienceView';
import AboutView from './components/AboutView';
import { Sun, Moon } from 'lucide-react';
import { motion, useMotionValue, useSpring, AnimatePresence } from 'motion/react';

import ParticleBackground from './components/ParticleBackground';
import LoadingScreen from './components/LoadingScreen';

const TABS = ['home', 'projects', 'experience', 'about'];

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isLoading, setIsLoading] = useState(true);
  const isDark = theme === 'dark';
  
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 30, stiffness: 100, mass: 1 };
  const smoothX = useSpring(mouseX, springConfig);
  const smoothY = useSpring(mouseY, springConfig);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Normalize mouse coordinates from -1 to 1
      const normalizedX = (e.clientX / window.innerWidth) * 2 - 1;
      const normalizedY = (e.clientY / window.innerHeight) * 2 - 1;
      mouseX.set(normalizedX);
      mouseY.set(normalizedY);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  const handleWheel = (e: React.WheelEvent) => {
    // Only handle global scrolling if we are not scrolling inside a scrollable container
    const target = e.target as HTMLElement;
    const scrollableContainer = target.closest('.overflow-y-auto');
    
    if (scrollableContainer) {
      const { scrollTop, scrollHeight, clientHeight } = scrollableContainer;
      const isAtTop = scrollTop === 0;
      const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) <= 1;

      // Only allow global navigation if they are at the boundaries and trying to scroll past them
      if (!(isAtTop && e.deltaY < 0) && !(isAtBottom && e.deltaY > 0)) {
        return; // Let the container handle the scroll
      }
    }

    if (scrollTimeout.current) return;

    if (e.deltaY > 50) {
      // Scroll down -> next tab
      setActiveTab((prev) => {
        const idx = TABS.indexOf(prev);
        return idx < TABS.length - 1 ? TABS[idx + 1] : prev;
      });
      scrollTimeout.current = setTimeout(() => { scrollTimeout.current = null; }, 1000);
    } else if (e.deltaY < -50) {
      // Scroll up -> prev tab
      setActiveTab((prev) => {
        const idx = TABS.indexOf(prev);
        return idx > 0 ? TABS[idx - 1] : prev;
      });
      scrollTimeout.current = setTimeout(() => { scrollTimeout.current = null; }, 1000);
    }
  };

  const bgClass = isDark ? 'bg-[#050505]' : 'bg-slate-50';
  const textClass = isDark ? 'text-white' : 'text-slate-900';
  const borderLightClass = isDark ? 'border-white/10' : 'border-black/10';
  const mutedTextClass = isDark ? 'text-white/60' : 'text-slate-500';

  return (
    <div 
      className={`w-full h-[100dvh] ${bgClass} ${textClass} font-sans flex flex-col overflow-hidden relative transition-colors duration-500`}
      onWheel={handleWheel}
    >
      <AnimatePresence>
        {isLoading && <LoadingScreen onComplete={() => setIsLoading(false)} />}
      </AnimatePresence>

      {/* Background Atmosphere with Parallax */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <ParticleBackground isDark={isDark} />
        <motion.div 
          className={`absolute top-[-10%] left-[-10%] w-[600px] h-[600px] md:w-[800px] md:h-[800px] ${isDark ? 'bg-purple-900/30' : 'bg-purple-300/40'} rounded-full blur-[120px] md:blur-[150px] transition-colors duration-500`}
          style={{ x: smoothX, y: smoothY, translateX: '-20px', translateY: '-20px' }}
        />
        <motion.div 
          className={`absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] md:w-[800px] md:h-[800px] ${isDark ? 'bg-blue-900/30' : 'bg-blue-300/40'} rounded-full blur-[120px] md:blur-[150px] transition-colors duration-500`}
          style={{ x: smoothX, y: smoothY, translateX: '20px', translateY: '20px', scaleX: -1, scaleY: -1 }}
        />
        <div className={`absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] ${isDark ? 'opacity-30' : 'opacity-10'} transition-opacity duration-500`}></div>
      </div>

      {/* Navigation Bar */}
      <nav className="relative z-20 flex items-center justify-between px-6 md:px-12 py-6 shrink-0">
        <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => setActiveTab('home')}>
          <div className={`w-10 h-10 border-2 ${isDark ? 'border-white group-hover:bg-white group-hover:text-black' : 'border-slate-900 group-hover:bg-slate-900 group-hover:text-white'} flex items-center justify-center font-bold tracking-tighter italic transition-colors`}>SA</div>
          <span className={`hidden sm:inline text-xs uppercase tracking-[0.3em] font-medium ${mutedTextClass} group-hover:opacity-100 transition-opacity`}>Portfolio / 2026</span>
        </div>
        <div className={`flex items-center space-x-3 md:space-x-8 text-[10px] md:text-xs uppercase tracking-widest font-semibold`}>
          {TABS.slice(1).map((tab) => (
            <div key={tab} className="relative group">
              <button 
                onClick={() => setActiveTab(tab)} 
                className={`hover:text-blue-500 transition-colors py-2 ${activeTab === tab ? 'text-blue-500' : ''}`}
              >
                {tab.toUpperCase()}
              </button>
              {/* Hover Tooltip/Popout Indicator */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-1 h-1 rounded-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </div>
          ))}
          <div className={`hidden md:block h-4 w-px ${isDark ? 'bg-white/20' : 'bg-black/20'}`}></div>
          <button 
            className={`p-2 rounded-full border ${isDark ? 'border-white/20 bg-white/5 hover:bg-white/10' : 'border-black/20 bg-black/5 hover:bg-black/10'} transition-colors cursor-pointer z-50`} 
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            title="Toggle Theme"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </nav>

      {/* Main Content Viewport */}
      <main className="relative z-10 flex-1 flex flex-col md:flex-row">
        {/* Left HUD: Technical Profile (Hidden on small screens to save space) */}
        <aside className="hidden md:flex w-72 pl-12 flex-col justify-center space-y-12 shrink-0">
          <motion.div className="space-y-4" whileHover={{ x: 10 }} transition={{ duration: 0.3 }}>
            <p className="text-[10px] uppercase tracking-[0.4em] text-blue-500 font-bold">Identity_01</p>
            <h2 className="text-4xl font-light leading-tight cursor-pointer hover:text-blue-500 transition-colors" onClick={() => setActiveTab('home')}>Syed Jawaad<br/>Ali</h2>
            <p className={`text-xs ${mutedTextClass} font-mono leading-relaxed`}>Business Intelligence & Data Analytics Expert specializing in Tableau, Power BI, and ETL Automation.</p>
          </motion.div>

          <motion.div className="space-y-6" whileHover={{ x: 10 }} transition={{ duration: 0.3 }}>
            <div>
              <p className={`text-[10px] uppercase tracking-widest ${mutedTextClass} mb-2`}>Status</p>
              <div className="flex items-center space-x-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                <span className="text-[11px] font-mono">Available for Hire</span>
              </div>
            </div>
            <div>
              <p className={`text-[10px] uppercase tracking-widest ${mutedTextClass} mb-2`}>Location</p>
              <span className="text-[11px] font-mono">Karachi, Pakistan</span>
            </div>
          </motion.div>
        </aside>

        {/* Dynamic Center View */}
        <div className="flex-1 relative min-w-0 min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 flex flex-col"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={(e: any, info: any) => {
                const swipeThreshold = 50;
                if (info.offset.x < -swipeThreshold) {
                  // Swipe left -> Next tab
                  const currentIndex = TABS.indexOf(activeTab);
                  if (currentIndex < TABS.length - 1) setActiveTab(TABS[currentIndex + 1]);
                } else if (info.offset.x > swipeThreshold) {
                  // Swipe right -> Previous tab
                  const currentIndex = TABS.indexOf(activeTab);
                  if (currentIndex > 0) setActiveTab(TABS[currentIndex - 1]);
                }
              }}
            >
              {activeTab === 'home' && <HomeView isDark={isDark} />}
              {activeTab === 'projects' && <ProjectsView isDark={isDark} />}
              {activeTab === 'experience' && <ExperienceView isDark={isDark} />}
              {activeTab === 'about' && <AboutView isDark={isDark} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right: Navigation Rail (Hidden on small screens) */}
        <aside className="hidden md:flex w-24 pr-12 flex-col items-end justify-center shrink-0">
          <div className="rotate-90 origin-right translate-x-12 space-x-12 flex items-center">
            <span className={`text-[10px] uppercase tracking-[0.5em] ${textClass} whitespace-nowrap transition-colors duration-500`}>
              {activeTab === 'home' ? 'Scroll To Explore' : activeTab.toUpperCase()}
            </span>
            <div className={`w-24 h-px ${borderLightClass} transition-colors duration-500`}></div>
          </div>
        </aside>
      </main>

      {/* Bottom Bar: Tech Stack & Contact */}
      <footer className="relative z-10 px-6 md:px-12 py-6 md:py-8 flex flex-col sm:flex-row sm:items-end justify-between shrink-0 gap-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-12">
          <div className="space-y-2">
            <p className={`text-[9px] uppercase tracking-widest ${mutedTextClass}`}>Visualization</p>
            <p className="text-[10px] md:text-xs font-mono">Tableau / Power BI / Excel</p>
          </div>
          <div className="space-y-2">
            <p className={`text-[9px] uppercase tracking-widest ${mutedTextClass}`}>Data Engineering</p>
            <p className="text-[10px] md:text-xs font-mono">SQL / Snowflake / Python</p>
          </div>
          <div className="space-y-2 hidden md:block">
            <p className={`text-[9px] uppercase tracking-widest ${mutedTextClass}`}>Industries</p>
            <p className="text-[10px] md:text-xs font-mono">Telecom / Healthcare / Finance</p>
          </div>
          <div className="space-y-2 hidden md:block">
            <p className={`text-[9px] uppercase tracking-widest ${mutedTextClass}`}>Experience</p>
            <p className="text-[10px] md:text-xs font-mono">5+ Years</p>
          </div>
        </div>

        <div className="flex items-center space-x-4 md:space-x-6">
          <div className="text-right">
            <p className={`text-[9px] md:text-[10px] uppercase tracking-widest ${mutedTextClass}`}>Get in touch</p>
            <a href="mailto:syedjawaadali@gmail.com" className="text-sm md:text-lg font-light hover:text-blue-500 transition-colors">syedjawaadali@gmail.com</a>
          </div>
          <a href="https://linkedin.com/in/syedjawaadali" target="_blank" rel="noreferrer" className="w-10 h-10 md:w-16 md:h-16 rounded-full bg-blue-600 flex items-center justify-center text-white hover:bg-blue-500 transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)] shrink-0">
            <svg className="w-4 h-4 md:w-6 md:h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
          </a>
        </div>
      </footer>

      {/* Pagination Indicators */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center space-x-6 z-20">
        {TABS.map((tab) => (
          <div key={tab} className="relative group">
            {/* Hit area for easier hovering */}
            <div 
              className="absolute inset-[-10px] cursor-pointer"
              onClick={() => setActiveTab(tab)}
            ></div>
            <div 
              className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full transition-all duration-300 ${activeTab === tab ? (isDark ? 'bg-white scale-150' : 'bg-blue-600 scale-150') : (isDark ? 'bg-white/20 group-hover:bg-white/60' : 'bg-black/20 group-hover:bg-black/60')}`}
            ></div>
            {/* Popout Window */}
            <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-3 py-1.5 rounded-md ${isDark ? 'bg-white/10 border-white/20 text-white' : 'bg-slate-900 border-slate-800 text-white'} border backdrop-blur-md text-[10px] font-medium tracking-widest uppercase opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none whitespace-nowrap shadow-xl translate-y-2 group-hover:translate-y-0 flex items-center space-x-2`}>
              {activeTab === tab && <div className="w-1 h-1 rounded-full bg-blue-500 animate-pulse"></div>}
              <span>{tab.toUpperCase()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
