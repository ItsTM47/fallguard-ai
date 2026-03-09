import { Toaster } from '@/components/ui/sonner';
import Hero from '@/sections/Hero';
import AppSection from '@/sections/AppSection';
import HowItWorks from '@/sections/HowItWorks';
import Features from '@/sections/Features';
import Footer from '@/sections/Footer';
import './App.css';

function App() {
  return (
    <div className="min-h-screen bg-slate-900">
      {/* Toast Notifications */}
      <Toaster 
        position="top-right"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#f8fafc',
            border: '1px solid #334155',
          },
        }}
      />
      
      {/* Hero Section */}
      <Hero />
      
      {/* How It Works */}
      <div id="how-it-works">
        <HowItWorks />
      </div>
      
      {/* Features */}
      <Features />
      
      {/* Main App Section */}
      <AppSection />
      
      {/* Footer */}
      <Footer />
    </div>
  );
}

export default App;
