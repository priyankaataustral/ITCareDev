// import { useEffect, useState } from "react";
// import { useRouter } from "next/router";
// import { getThread } from "../../lib/apiClient";
// import { Ticket } from "../../lib/types";
// import TicketHeader from "../../components/tickets/TicketHeader";
// import Tabs from "../../components/ui/Tabs";
// import { useAuth } from '../components/AuthContext';

// export default function TicketDetailPage() {
//   const router = useRouter();
//   const { id } = router.query;
//   const { agent } = useAuth();
//   const [ticket, setTicket] = useState<Ticket | null>(null);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     if (!id) return;
//     setLoading(true);
//     getThread(id as string)
//       .then(setTicket)
//       .catch(() => setTicket(null))
//       .finally(() => setLoading(false));
//   }, [id]);

//   if (loading) return <div>Loading…</div>;
//   if (!ticket) return <div>Ticket not found.</div>;

//   return (
//     <div className="max-w-3xl mx-auto p-4">
//       <TicketHeader ticket={ticket} agent={agent} />
//       <Tabs
//         tabs={[
//           { label: "Conversation", content: <div>TODO: ChatThread</div> },
//           { label: "Email", content: <div>TODO: EmailPanel</div> },
//           { label: "Timeline", content: <div>TODO: Timeline</div> },
//         ]}
//       />
//     </div>
//   );
// }
