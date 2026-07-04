import { useState, useRef } from 'react';
import { motion, useAnimationFrame, useMotionValue, useSpring, useTransform } from 'motion/react';

const coreSkills = [
  {
    name: 'Excel',
    color: 'rgba(34, 197, 94, 0.6)',
    category: 'Spreadsheets',
    radius: 170,
    speed: 1.1,
    subSkills: ['Power Query', 'Power Pivot', 'VBA', 'Macros', 'Pivot Tables']
  },
  {
    name: 'Tableau',
    color: 'rgba(59, 130, 246, 0.6)',
    category: 'Data Viz',
    radius: 240,
    speed: 0.85,
    subSkills: ['Desktop', 'Server', 'Prep', 'Dashboards']
  },
  {
    name: 'Power BI',
    color: 'rgba(234, 179, 8, 0.6)',
    category: 'BI',
    radius: 310,
    speed: 0.6,
    subSkills: ['DAX', 'Data Modeling', 'Power Query']
  },
  {
    name: 'SQL',
    color: 'rgba(156, 163, 175, 0.6)',
    category: 'Databases',
    radius: 190,
    speed: -0.9,
    subSkills: ['MySQL', 'SQL Server', 'Snowflake']
  },
  {
    name: 'Python',
    color: 'rgba(236, 72, 153, 0.6)',
    category: 'Data Engineering',
    radius: 260,
    speed: -0.7,
    subSkills: ['Pandas', 'NumPy', 'APIs']
  },
  {
    name: 'Snowflake',
    color: 'rgba(14, 165, 233, 0.6)',
    category: 'Cloud Data',
    radius: 330,
    speed: -0.5,
    subSkills: ['Data Warehousing', 'SnowSQL']
  },
  {
    name: 'GCP',
    color: 'rgba(239, 68, 68, 0.6)',
    category: 'Cloud Services',
    radius: 280,
    speed: 0.75,
    subSkills: ['BigQuery', 'Data Studio', 'Storage']
  },
  {
    name: 'Looker',
    color: 'rgba(168, 85, 247, 0.6)',
    category: 'Analytics',
    radius: 220,
    speed: -0.85,
    subSkills: ['LookML', 'Dashboards']
  },
  {
    name: 'Airflow',
    color: 'rgba(249, 115, 22, 0.6)',
    category: 'Orchestration',
    radius: 290,
    speed: -0.65,
    subSkills: ['DAGs', 'Scheduling', 'Pipelines']
  },
  {
    name: 'dbt',
    color: 'rgba(244, 63, 94, 0.6)',
    category: 'Transformations',
    radius: 250,
    speed: 0.95,
    subSkills: ['Jinja', 'Testing', 'Docs']
  },
  {
    name: 'Alteryx',
    color: 'rgba(14, 165, 233, 0.6)',
    category: 'Data Prep',
    radius: 210,
    speed: 1.05,
    subSkills: ['Workflows', 'Macros']
  }
];

function SkillBubble({ 
  skill, index, total, isSelected, hasSelection, onSelect, isDark 
}: { 
  skill: typeof coreSkills[0], index: number, total: number, isSelected: boolean, hasSelection: boolean, onSelect: (e: React.MouseEvent) => void, isDark: boolean 
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const z = useMotionValue(0);
  
  const smoothScale = useSpring(1, { damping: 25, stiffness: 200 });
  const smoothOpacity = useSpring(1, { damping: 25, stiffness: 200 });
  const zIndex = useTransform(z, (latestZ) => Math.round(latestZ) + (isSelected ? 1000 : 0));
  
  const timeRef = useRef(0);
  const isHidden = hasSelection && !isSelected;

  useAnimationFrame((t, delta) => {
    // Delta cap to prevent large jumps if tab is inactive
    const d = Math.min(delta, 50);

    if (isSelected) {
      x.set(x.get() + (0 - x.get()) * 0.1);
      y.set(y.get() + (0 - y.get()) * 0.1);
      z.set(z.get() + (150 - z.get()) * 0.1);
      
      smoothScale.set(1.5);
      smoothOpacity.set(1);
    } else {
      timeRef.current += d * 0.0004 * skill.speed;
      const baseAngle = (index / total) * Math.PI * 2;
      const angle = baseAngle + timeRef.current;
      
      const targetX = Math.cos(angle) * skill.radius;
      const targetZ = Math.sin(angle) * skill.radius;
      const targetY = Math.sin(angle * 2) * skill.radius * 0.4;
      
      x.set(x.get() + (targetX - x.get()) * 0.1);
      y.set(y.get() + (targetY - y.get()) * 0.1);
      z.set(z.get() + (targetZ - z.get()) * 0.1);
      
      const maxRadius = 330;
      const normalizedZ = targetZ / maxRadius; // -1 to 1
      
      const bgScale = 0.85 + (normalizedZ * 0.15); // ranges from 0.7 to 1.0
      const baseOpacity = 0.7 + (normalizedZ * 0.3); // ranges from 0.4 to 1.0
      
      smoothScale.set(bgScale);
      smoothOpacity.set(isHidden ? baseOpacity * 0.15 : baseOpacity);
    }
  });

  return (
    <motion.div
      onClick={onSelect}
      style={{ x, y, z, scale: smoothScale, opacity: smoothOpacity, zIndex }}
      className={`absolute flex flex-col items-center justify-center rounded-full backdrop-blur-md cursor-pointer ${!isSelected && 'hover:scale-110 group'}`}
      initial={false}
      animate={{
        width: isSelected ? 240 : 96,
        height: isSelected ? 240 : 96,
        background: isDark ? (isSelected ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.03)') : (isSelected ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.03)'),
        border: `1px solid ${isDark ? (isSelected ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.15)') : (isSelected ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.1)')}`,
        boxShadow: isSelected ? `0 0 50px ${skill.color}, inset 0 0 30px ${skill.color}` : `inset 0 0 20px ${skill.color}, 0 10px 30px rgba(0,0,0,0.1)`,
      }}
      transition={{ duration: 0.5 }}
    >
       <span className={`font-semibold tracking-wider text-center leading-tight transition-all duration-500 ${isDark ? 'text-white' : 'text-gray-900'} drop-shadow-md ${isSelected ? 'text-lg md:text-xl mb-3' : 'text-[10px] md:text-xs'}`}>
         {skill.name}
       </span>
       
       {isSelected && (
         <motion.div 
           initial={{ opacity: 0, scale: 0.8 }}
           animate={{ opacity: 1, scale: 1 }}
           transition={{ delay: 0.2, duration: 0.3 }}
           className="flex flex-wrap items-center justify-center gap-2 px-4 mt-2"
         >
           {skill.subSkills.map((sub, i) => (
             <span key={i} className={`text-[8px] md:text-[9px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full border ${isDark ? 'bg-white/10 border-white/20 text-white' : 'bg-black/5 border-black/10 text-black'} shadow-sm`}>
               {sub}
             </span>
           ))}
         </motion.div>
       )}

       {/* Popout Tooltip for Skill (only when not selected) */}
       {!isSelected && (
         <div className="absolute top-full left-1/2 -translate-x-1/2 mt-4 px-4 py-2 rounded-lg bg-black/90 backdrop-blur border border-white/10 text-white text-[10px] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all duration-150 pointer-events-none whitespace-nowrap shadow-2xl translate-y-2 group-hover:translate-y-0 z-50 flex flex-col items-center">
           <span className="text-blue-400 mb-1">{skill.category}</span>
           <span>Click to expand</span>
         </div>
       )}
    </motion.div>
  );
}

export default function HomeView({ isDark }: { isDark: boolean }) {
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);

  return (
    <div className="flex-1 relative flex items-center justify-center" style={{ perspective: '1200px' }} onClick={() => setSelectedSkill(null)}>
      <div className="relative w-full h-full flex items-center justify-center preserve-3d scale-75 md:scale-100" style={{ transformStyle: 'preserve-3d' }}>
        
        {/* Core Glow */}
        <div className={`absolute w-32 h-32 rounded-full blur-2xl ${isDark ? 'bg-blue-500/30' : 'bg-blue-400/40'} animate-pulse transition-opacity duration-500 ${selectedSkill ? 'opacity-0' : 'opacity-100'}`}></div>
        <div className={`absolute w-16 h-16 rounded-full blur-xl ${isDark ? 'bg-purple-500/50' : 'bg-purple-400/60'} transition-opacity duration-500 ${selectedSkill ? 'opacity-0' : 'opacity-100'}`}></div>

        {/* Orbiting Skills */}
        {coreSkills.map((skill, index) => (
          <SkillBubble
            key={skill.name}
            skill={skill}
            index={index}
            total={coreSkills.length}
            isSelected={selectedSkill === skill.name}
            hasSelection={selectedSkill !== null}
            onSelect={(e) => {
              e.stopPropagation();
              setSelectedSkill(selectedSkill === skill.name ? null : skill.name);
            }}
            isDark={isDark}
          />
        ))}
        
        {/* 3D Rings */}
        <motion.div 
          className={`absolute w-[320px] h-[320px] rounded-full border ${isDark ? 'border-white/10' : 'border-black/10'} transition-opacity duration-700 pointer-events-none ${selectedSkill ? 'opacity-0' : 'opacity-100'}`} 
          animate={{ rotateZ: 360 }} 
          style={{ rotateX: 75 }} 
          transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
        />
        <motion.div 
          className={`absolute w-[500px] h-[500px] rounded-full border border-dashed ${isDark ? 'border-blue-500/20' : 'border-blue-500/40'} transition-opacity duration-700 pointer-events-none ${selectedSkill ? 'opacity-0' : 'opacity-100'}`} 
          animate={{ rotateZ: -360 }} 
          style={{ rotateX: 65, rotateY: 15 }} 
          transition={{ repeat: Infinity, duration: 25, ease: "linear" }}
        />
        <motion.div 
          className={`absolute w-[680px] h-[680px] rounded-full border ${isDark ? 'border-purple-500/10' : 'border-purple-500/20'} transition-opacity duration-700 pointer-events-none ${selectedSkill ? 'opacity-0' : 'opacity-100'}`} 
          animate={{ rotateZ: 360 }} 
          style={{ rotateX: 80, rotateY: -10 }} 
          transition={{ repeat: Infinity, duration: 30, ease: "linear" }}
        />
      </div>
    </div>
  );
}
