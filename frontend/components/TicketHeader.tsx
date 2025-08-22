// import React from "react";
// import { Ticket } from "../../lib/types";
// import { useAuth } from '../components/AuthContext';

// interface TicketHeaderProps {
//   ticket: Ticket;
//   agent: any;
// }

// const levelLabel = (level: number) => {
//   if (level === 1) return "L1";
//   if (level === 2) return "L2";
//   if (level === 3) return "L3";
//   return `L${level}`;
// };

// export default function TicketHeader({ ticket, agent }: TicketHeaderProps) {
//   return (
//     <div className="flex flex-wrap items-center gap-3 mb-4">
//       <h1 className="text-xl font-bold flex-1">{ticket.subject}</h1>
//       <span className="px-2 py-1 rounded bg-blue-100 text-blue-800 text-xs font-semibold">
//         {ticket.status}
//       </span>
//       {ticket.department && (
//         <span className="px-2 py-1 rounded bg-green-100 text-green-800 text-xs font-semibold">
//           {ticket.department.name}
//         </span>
//       )}
//       <span className="px-2 py-1 rounded bg-gray-100 text-gray-800 text-xs font-semibold">
//         {levelLabel(ticket.level)}
//       </span>
//       {/* TODO: Override Department button for L2/L3/MANAGER */}
//     </div>
//   );
// }
