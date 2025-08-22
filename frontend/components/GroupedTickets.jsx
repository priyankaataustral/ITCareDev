// components/GroupedTickets.jsx

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function GroupedTickets({ threads, selectedId, onSelect }) {
  // For demo: treat all except selected as unread
  const getUnread = t => selectedId !== t.id;
  const [openTeam, setOpenTeam] = useState(null);
  const [openCat, setOpenCat]   = useState({});

  // Group threads by team → category
  const grouped = threads.reduce((acc, t) => {
    acc[t.assigned_team] = acc[t.assigned_team] || {};
    acc[t.assigned_team][t.predicted_category] =
      acc[t.assigned_team][t.predicted_category] || [];
    acc[t.assigned_team][t.predicted_category].push(t);
    return acc;
  }, {});

  // Simple team/category icons
  const teamIcons = {
    'L1-Password-Team': '🔑',
    'L1-Network-Team': '🌐',
    'L1-Software-Team': '💻',
    'L1-Hardware-Team': '🖥️',
    'General-Support': '🛠️',
  };

  return (
    <div className="w-full h-full overflow-y-auto p-2">
      {Object.entries(grouped).map(([team, cats]) => (
        <motion.div
          key={team}
          layout
          className="mb-4 rounded-2xl shadow bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800"
        >
          <button
            className="w-full flex items-center gap-2 px-4 py-3 text-left font-semibold text-lg rounded-t-2xl transition hover:bg-[#ADC1CC]/40 dark:hover:bg-[#ADC1CC]/20"
            style={{ borderColor: '#ADC1CC' }}
            onClick={() => setOpenTeam(openTeam === team ? null : team)}
            aria-expanded={openTeam === team}
          >
            <span className="text-2xl dark:text-white">{teamIcons[team] || '👥'}</span>
            <span className="dark:text-white">{team}</span>
            <span className="ml-auto px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-full">{Object.values(cats).flat().length} tickets</span>
            <span className="ml-2 text-gray-400">{openTeam === team ? '▲' : '▼'}</span>
          </button>
          <AnimatePresence initial={false}>
            {openTeam === team && (
              <motion.div
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="pl-2 pb-2"
              >
                {Object.entries(cats).map(([cat, tickets]) => (
                  <motion.div
                    key={cat}
                    layout
                    className="mb-2 rounded-xl border border-[#ADC1CC] bg-gray-50 dark:bg-gray-800 shadow-sm"
                  >
                    <button
                      className="w-full flex items-center gap-2 px-4 py-2 text-left text-base font-medium italic rounded-t-xl transition hover:bg-[#ADC1CC]/30 dark:hover:bg-[#ADC1CC]/10"
                    //   style={{ borderColor: '#ADC1CC' }}
                      onClick={() =>
                        setOpenCat(prev => ({
                          ...prev,
                          [team]: prev[team] === cat ? null : cat
                        }))
                      }
                      aria-expanded={openCat[team] === cat}
                    >
                      <span className="text-lg dark:text-white">📂</span>
                      <span className="dark:text-white">{cat}</span>
                      <span className="ml-auto px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-full">{tickets.length}</span>
                      <span className="ml-2 text-gray-400">{openCat[team] === cat ? '▲' : '▼'}</span>
                    </button>
                    <AnimatePresence initial={false}>
                      {openCat[team] === cat && (
                        <motion.ul
                          layout
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="pl-4 py-2 space-y-1 list-none"
                        >
                          {tickets.map(t => (
                            <li key={t.id}>
                              <button
                                className={`w-full text-left text-sm px-3 py-2 rounded-xl transition font-medium flex items-center gap-2 ${
                                  selectedId === t.id
                                    ? 'bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 shadow border border-blue-400 font-bold'
                                    : getUnread(t)
                                      ? 'font-bold text-gray-900 dark:text-gray-100 relative'
                                      : 'text-gray-800 dark:text-gray-200'
                                }`}
                                onClick={() => onSelect(t.id)}
                                aria-current={selectedId === t.id ? 'true' : undefined}
                              >
                                <span className="font-mono text-xs text-gray-500 dark:text-gray-400 mr-2">#{t.id}</span>
                                <span>{t.text.slice(0, 32)}…</span>
                              </button>
                            </li>
                          ))}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  );
}
