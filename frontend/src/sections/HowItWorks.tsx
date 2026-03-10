import React from 'react';
import { Camera, Brain, MessageSquare } from 'lucide-react';

const steps = [
  {
    number: '01',
    icon: Camera,
    title: 'เปิดกล้อง',
    description: 'อนุญาตการเข้าถึงกล้องเว็บแคมหรืออัปโหลดวิดีโอเพื่อเริ่มการตรวจจับ',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/30'
  },
  {
    number: '02',
    icon: Brain,
    title: 'AI วิเคราะห์',
    description: 'ระบบ AI วิเคราะห์ท่าทางแบบเรียลไทม์ด้วย TensorFlow.js',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
    borderColor: 'border-purple-500/30'
  },
  {
    number: '03',
    icon: MessageSquare,
    title: 'แจ้งเตือนทันที',
    description: 'ส่งการแจ้งเตือนไปยัง LINE ของผู้ดูแลพร้อมภาพหน้าจอ',
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    borderColor: 'border-green-500/30'
  }
];

const HowItWorks: React.FC = () => {
  return (
    <section className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            วิธีการใช้งาน
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            ระบบตรวจจับการล้มที่ใช้งานง่าย เพียง 3 ขั้นตอน
          </p>
        </div>
        
        {/* Steps Grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className={`
                  relative group p-8 rounded-2xl border ${step.borderColor} 
                  ${step.bgColor} backdrop-blur-sm
                  hover:scale-105 hover:shadow-xl transition-all duration-300
                `}
                style={{ animationDelay: `${index * 0.2}s` }}
              >
                {/* Step Number */}
                <div className="absolute -top-4 -left-2 w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                  <span className="text-lg font-bold text-white">{step.number}</span>
                </div>
                
                {/* Icon */}
                <div className={`
                  w-16 h-16 rounded-xl ${step.bgColor} 
                  flex items-center justify-center mb-6
                  group-hover:animate-bounce
                `}>
                  <Icon className={`w-8 h-8 ${step.color}`} />
                </div>
                
                {/* Content */}
                <h3 className="text-xl font-bold text-white mb-3">
                  {step.title}
                </h3>
                <p className="text-slate-400 leading-relaxed">
                  {step.description}
                </p>
                
                {/* Connector Line (hidden on mobile) */}
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-0.5 bg-slate-700">
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-slate-500" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
