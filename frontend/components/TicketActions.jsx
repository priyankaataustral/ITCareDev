// TicketActions.jsx - Professional action buttons with confirmations
const TicketActions = ({ ticket, onAction, loading }) => {
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [archiveReason, setArchiveReason] = useState('');

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Close Button - Only for open/escalated tickets */}
      <Gate roles={["L2", "L3", "MANAGER"]}>
        {(ticket?.status === 'open' || ticket?.status === 'escalated') && (
          <button
            onClick={() => setShowCloseConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            🚫 Close Ticket
          </button>
        )}
      </Gate>

      {/* Archive Button - Only for closed/resolved tickets */}
      <Gate roles={["L2", "L3", "MANAGER"]}>
        {(ticket?.status === 'closed' || ticket?.status === 'resolved') && !ticket?.archived && (
          <button
            onClick={() => setShowArchiveConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            📦 Archive
          </button>
        )}
      </Gate>

      {/* Unarchive Button - Only for archived tickets */}
      <Gate roles={["L2", "L3", "MANAGER"]}>
        {ticket?.archived && (
          <button
            onClick={() => onAction('unarchive')}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            📤 Unarchive
          </button>
        )}
      </Gate>
    </div>
  );
};