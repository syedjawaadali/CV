import { experienceData } from '../data';
import { motion } from 'motion/react';

export default function ExperienceView({ isDark }: { isDark: boolean }) {
  const textMuted = isDark ? 'opacity-70' : 'text-slate-600';
  const borderDivider = isDark ? 'border-white/10' : 'border-black/10';

  return (
    <div className="flex-1 relative flex flex-col justify-start px-6 md:px-12 py-12 md:py-24 overflow-y-auto">
      <motion.div 
        className="max-w-3xl w-full mx-auto space-y-12 pb-20"
        initial="hidden"
        animate="show"
        variants={{
          hidden: { opacity: 0 },
          show: { opacity: 1, transition: { staggerChildren: 0.15 } }
        }}
      >
        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="space-y-2">
          <h3 className="text-2xl font-light tracking-tight">Professional Experience</h3>
          <p className="text-xs opacity-50 font-mono">5+ Years in Business Intelligence & Data Analytics</p>
        </motion.div>
        
        <div className={`space-y-10 border-l pl-6 ml-2 relative ${borderDivider}`}>
          {experienceData.map((exp, idx) => (
            <motion.div 
              key={idx} 
              variants={{ hidden: { opacity: 0, x: -20 }, show: { opacity: 1, x: 0 } }}
              className="relative group"
            >
              {/* Timeline dot */}
              <div className="absolute -left-[29px] top-1.5 w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)] group-hover:scale-150 transition-transform"></div>
              
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                  <h4 className="text-lg font-medium">{exp.role}</h4>
                  <span className="text-xs font-mono opacity-60 shrink-0">{exp.period}</span>
                </div>
                
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-light text-blue-500">{exp.company}</span>
                  <span className={`w-1 h-1 rounded-full ${isDark ? 'bg-white/30' : 'bg-black/30'}`}></span>
                  <span className="text-xs opacity-50">{exp.location}</span>
                </div>
                
                <ul className="space-y-2 mt-4">
                  {exp.description.map((desc, i) => (
                    <li key={i} className={`text-xs leading-relaxed flex items-start ${textMuted}`}>
                      <span className="mr-2 text-blue-500/50 mt-1.5 opacity-80 leading-none">›</span>
                      <span>{desc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
