import { motion } from 'motion/react';
import { useEffect } from 'react';

export default function LoadingScreen({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 2500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 text-white overflow-hidden"
      exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950"></div>
      
      <div className="relative flex flex-col items-center z-10">
        {/* Animated Dashboard Elements */}
        <div className="w-48 h-48 md:w-64 md:h-64 relative mb-12">
          {/* Circular rings */}
          <motion.div 
            className="absolute inset-0 rounded-full border-[1px] border-blue-500/30 border-t-blue-500"
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          />
          <motion.div 
            className="absolute inset-4 rounded-full border-[1px] border-purple-500/30 border-r-purple-500"
            animate={{ rotate: -360 }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          />
          <motion.div 
            className="absolute inset-8 rounded-full border-[1px] border-emerald-500/30 border-b-emerald-500"
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          />
          
          {/* Inner pulsating core */}
          <motion.div 
            className="absolute inset-0 m-auto w-12 h-12 md:w-16 md:h-16 bg-blue-500 rounded-full blur-[20px]"
            animate={{ scale: [1, 1.5, 1], opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Bar charts ascending */}
          <div className="absolute inset-0 flex items-end justify-center gap-1.5 md:gap-2 pb-12 md:pb-16">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <motion.div
                key={i}
                className="w-1.5 md:w-2 bg-gradient-to-t from-blue-600 to-purple-400 rounded-t-sm"
                initial={{ height: 0 }}
                animate={{ height: [0, Math.random() * 40 + 20, Math.random() * 40 + 20] }}
                transition={{ duration: 1.5, delay: i * 0.1, ease: "easeOut" }}
              />
            ))}
          </div>
        </div>

        {/* Name and Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="text-center"
        >
          <h1 className="text-3xl md:text-6xl font-light tracking-[0.2em] uppercase mb-2">
            Syed Jawaad <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">Ali</span>
          </h1>
          <motion.div 
            className="h-px bg-gradient-to-r from-transparent via-blue-500 to-transparent mx-auto mt-6"
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ duration: 1, delay: 1, ease: "circOut" }}
          />
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5, duration: 0.5 }}
            className="text-[10px] md:text-xs font-mono tracking-[0.4em] text-blue-400 mt-6"
          >
            INITIALIZING WORKSPACE...
          </motion.p>
        </motion.div>
      </div>
    </motion.div>
  );
}
