import { projectsData } from '../data';
import { motion } from 'motion/react';

export default function ProjectsView({ isDark }: { isDark: boolean }) {
  const cardBg = isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-black/5 border-black/10 hover:bg-black/10';
  const textMuted = isDark ? 'opacity-70' : 'text-slate-600';
  const textFaint = isDark ? 'opacity-40' : 'text-slate-400';
  const borderDivider = isDark ? 'border-white/10' : 'border-black/10';

  return (
    <div className="flex-1 relative flex flex-col justify-start px-6 md:px-12 py-12 md:py-24 overflow-y-auto">
      <motion.div 
        className="max-w-4xl w-full mx-auto space-y-8 pb-20"
        initial="hidden"
        animate="show"
        variants={{
          hidden: { opacity: 0 },
          show: { opacity: 1, transition: { staggerChildren: 0.1 } }
        }}
      >
        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="space-y-2">
          <h3 className="text-2xl font-light tracking-tight">Key Projects</h3>
          <p className="text-xs opacity-50 font-mono">Data Engineering / BI / Analytics</p>
        </motion.div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {projectsData.map((project, idx) => (
            <motion.div 
              key={idx} 
              variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
              whileHover={{ y: -5 }}
              className={`p-6 border rounded-lg transition-colors group ${cardBg}`}
            >
              <p className="text-[10px] uppercase tracking-widest text-blue-500 mb-2">{project.client}</p>
              <h4 className="text-lg font-medium leading-tight mb-3 group-hover:text-blue-500 transition-colors">{project.title}</h4>
              <p className={`text-xs leading-relaxed mb-4 ${textMuted}`}>{project.description}</p>
              <div className={`pt-4 border-t ${borderDivider}`}>
                <p className={`text-[9px] uppercase tracking-widest mb-1 ${textFaint}`}>Technologies</p>
                <p className="text-xs font-mono opacity-80">{project.tech}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
