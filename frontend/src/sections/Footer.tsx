import React from 'react';
import { Activity, Heart } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="py-12 px-4 border-t border-slate-800">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-white font-bold">FallGuard AI</h3>
              <p className="text-slate-500 text-sm">AI Fall Detection System</p>
            </div>
          </div>
          
          {/* Credits */}
          <div className="text-center md:text-right">
            <p className="text-slate-400 text-sm flex items-center gap-1 justify-center md:justify-end">
              พัฒนาด้วย <Heart className="w-4 h-4 text-red-500 fill-red-500" /> สำหรับ Mini Project
            </p>
            <p className="text-slate-500 text-xs mt-1">
              Powered by TensorFlow.js, LINE Notify API & React
            </p>
          </div>
        </div>
        
        {/* Copyright */}
        <div className="mt-8 pt-8 border-t border-slate-800 text-center">
          <p className="text-slate-600 text-sm">
            © 2025 FallGuard - Mini Project for Educational Purpose
          </p>
          <p className="text-slate-700 text-xs mt-2">
            โปรเจกต์นี้จัดทำขึ้นเพื่อการศึกษาเท่านั้น | This project is for educational purposes only
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
