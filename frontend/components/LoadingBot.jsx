import React, { useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';

export default function LoadingBot() {
  const [clicks, setClicks] = useState(0);
  const [wave, setWave] = useState(false);
  const handleClick = () => {
    setClicks(c => c + 1);
    setWave(true);
    setTimeout(() => setWave(false), 700);
  };
  let icon = 'bi-robot';
  let text = 'Loading tickets…';
  if (wave && clicks < 3) {
    icon = 'bi-hand-thumbs-up';
    text = 'Hi!';
  } else if (clicks >= 3) {
    icon = 'bi-emoji-frown';
    text = 'Why so many clicks?';
  }
  return (
    <div className="flex flex-col items-center justify-center select-none">
      <div className="relative w-24 h-24 mb-4">
        <div className="absolute left-0 top-0 w-24 h-24 animate-bot-walk cursor-pointer" onClick={handleClick} title="Click me!">
          <i className={`bi ${icon} text-indigo-500 text-7xl`} style={{ filter: 'drop-shadow(0 2px 4px #6366f1)' }} />
        </div>
      </div>
      <span className="text-2xl font-extrabold tracking-wide bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent drop-shadow-lg animate-pulse">
        {text}
      </span>
      <style>{`
        @keyframes bot-walk {
          0%   { left: 0; }
          50%  { left: 48px; }
          100% { left: 0; }
        }
        .animate-bot-walk {
          position: absolute;
          animation: bot-walk 1.6s infinite linear;
        }
      `}</style>
    </div>
  );
}
