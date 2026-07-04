import { skillsData } from '../data';
import { motion } from 'motion/react';

export default function AboutView({ isDark }: { isDark: boolean }) {
  const borderDivider = isDark ? 'border-white/10' : 'border-black/10';
  const cardBg = isDark ? 'bg-white/5 border-white/5' : 'bg-black/5 border-black/5';
  const pillBg = isDark ? 'bg-white/5 border-white/10 text-white/80' : 'bg-black/5 border-black/10 text-slate-700';

  return (
    <div className="flex-1 relative flex flex-col justify-start px-6 md:px-12 py-12 md:py-24 overflow-y-auto">
      <motion.div 
        className="max-w-3xl w-full mx-auto space-y-12 pb-20"
        initial="hidden"
        animate="show"
        variants={{
          hidden: { opacity: 0 },
          show: { opacity: 1, transition: { staggerChildren: 0.1 } }
        }}
      >
        
        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-2xl font-light tracking-tight">About Me</h3>
            <p className="text-[10px] uppercase tracking-widest text-blue-500">Syed Jawaad Ali</p>
          </div>
          
          <div className="text-sm opacity-80 leading-relaxed space-y-4 font-light">
            <p>
              Business Intelligence and Data Analytics professional with 5+ years of experience designing and automating data-driven dashboards and reporting systems across Telecom, Healthcare, Banking, and E-Commerce.
            </p>
            <p>
              Proven track record of translating complex datasets into actionable insights that drive strategic decision-making. Proficient in SQL, Excel, and leading visualization platforms (Tableau, Power BI), with intermediate Python skills and a strong focus on ETL automation, data governance, and KPI reporting frameworks.
            </p>
          </div>
        </motion.div>

        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className={`space-y-6 pt-6 border-t ${borderDivider}`}>
          <h3 className="text-sm uppercase tracking-widest opacity-60">Education</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <motion.div whileHover={{ y: -5 }} className={`p-4 rounded-lg border transition-transform ${cardBg}`}>
              <p className="text-sm font-medium">M.S. Data Engineering and Information Management</p>
              <p className="text-xs text-blue-500 mt-1">NED University of Engineering and Technology</p>
              <div className="flex justify-between items-center mt-3">
                <span className="text-[10px] uppercase tracking-widest opacity-50">CGPA 3.4</span>
                <span className="text-xs font-mono opacity-50">2021 – 2024</span>
              </div>
            </motion.div>
            <motion.div whileHover={{ y: -5 }} className={`p-4 rounded-lg border transition-transform ${cardBg}`}>
              <p className="text-sm font-medium">B.S. Economics and Finance</p>
              <p className="text-xs text-blue-500 mt-1">NED University of Engineering and Technology</p>
              <div className="flex justify-between items-center mt-3">
                <span className="text-[10px] uppercase tracking-widest opacity-50">CGPA 3.3</span>
                <span className="text-xs font-mono opacity-50">2016 – 2020</span>
              </div>
            </motion.div>
          </div>
        </motion.div>

        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className={`space-y-6 pt-6 border-t ${borderDivider}`}>
          <h3 className="text-sm uppercase tracking-widest opacity-60">Technical Skills</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
            
            <div>
              <p className="text-[10px] uppercase tracking-widest text-blue-500 mb-3">Programming & Scripting</p>
              <div className="flex flex-wrap gap-2">
                {skillsData.programming.map((skill, i) => (
                  <motion.span whileHover={{ scale: 1.05 }} key={i} className={`px-2.5 py-1 text-[11px] font-mono border rounded cursor-default ${pillBg}`}>{skill}</motion.span>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-blue-500 mb-3">Data Visualization</p>
              <div className="flex flex-wrap gap-2">
                {skillsData.visualization.map((skill, i) => (
                  <motion.span whileHover={{ scale: 1.05 }} key={i} className={`px-2.5 py-1 text-[11px] font-mono border rounded cursor-default ${pillBg}`}>{skill}</motion.span>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-blue-500 mb-3">Data Processing & ETL</p>
              <div className="flex flex-wrap gap-2">
                {skillsData.etl.map((skill, i) => (
                  <motion.span whileHover={{ scale: 1.05 }} key={i} className={`px-2.5 py-1 text-[11px] font-mono border rounded cursor-default ${pillBg}`}>{skill}</motion.span>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-blue-500 mb-3">Tools & Platforms</p>
              <div className="flex flex-wrap gap-2">
                {skillsData.platforms.map((skill, i) => (
                  <motion.span whileHover={{ scale: 1.05 }} key={i} className={`px-2.5 py-1 text-[11px] font-mono border rounded cursor-default ${pillBg}`}>{skill}</motion.span>
                ))}
              </div>
            </div>

          </div>
        </motion.div>

      </motion.div>
    </div>
  );
}
