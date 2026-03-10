import React from 'react';
import { Zap, Shield, MessageCircle, Gift } from 'lucide-react';

const features = [
  {
    icon: Zap,
    title: 'ตรวจจับแบบ Real-time',
    description: 'วิเคราะห์วิดีโอ 30 FPS ด้วย TensorFlow.js บนเบราว์เซอร์ ไม่ต้องส่งข้อมูลไปเซิร์ฟเวอร์',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20',
    borderColor: 'border-yellow-500/30'
  },
  {
    icon: MessageCircle,
    title: 'แจ้งเตือน LINE',
    description: 'ส่งข้อความและภาพหน้าจอไปยัง LINE ของผู้ดูแลทันทีที่ตรวจพบการล้ม',
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    borderColor: 'border-green-500/30'
  },
  {
    icon: Shield,
    title: 'ความเป็นส่วนตัว',
    description: 'ประมวลผลทั้งหมดบนเบราว์เซอร์ ไม่มีการส่งวิดีโอหรือภาพไปยังเซิร์ฟเวอร์ภายนอก',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/30'
  },
  {
    icon: Gift,
    title: 'ใช้งานฟรี',
    description: 'ไม่มีค่าใช้จ่าย ไม่ต้องสมัครบริการ ใช้ LINE Notify API ฟรีได้ 1000 ข้อความ/เดือน',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
    borderColor: 'border-purple-500/30'
  }
];

const Features: React.FC = () => {
  return (
    <section className="py-20 px-4 bg-slate-800/30">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            ฟีเจอร์หลัก
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            เทคโนโลยี AI ทันสมัยสำหรับการดูแลผู้สูงอายุ
          </p>
        </div>
        
        {/* Features Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className={`
                  group p-6 rounded-2xl border ${feature.borderColor}
                  bg-slate-800/50 backdrop-blur-sm
                  hover:${feature.bgColor} hover:border-opacity-50
                  transition-all duration-300
                `}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`
                    flex-shrink-0 w-14 h-14 rounded-xl ${feature.bgColor}
                    flex items-center justify-center
                    group-hover:scale-110 transition-transform
                  `}>
                    <Icon className={`w-7 h-7 ${feature.color}`} />
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-white mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-slate-400 text-sm leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Tech Stack */}
        <div className="mt-16 text-center">
          <p className="text-slate-500 text-sm mb-4">Powered by</p>
          <div className="flex flex-wrap justify-center gap-4">
            {['TensorFlow.js', 'MoveNet', 'LINE Notify API', 'React'].map((tech) => (
              <span
                key={tech}
                className="px-4 py-2 rounded-full bg-slate-800 text-slate-400 text-sm border border-slate-700"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Features;
