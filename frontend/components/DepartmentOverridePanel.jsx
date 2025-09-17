import React, { useState, useEffect } from 'react';

export default function DepartmentOverridePanel({ 
  ticketId, 
  currentDepartment, 
  currentDepartmentId,
  userRole, 
  userDept, 
  isOpen, 
  onClose, 
  onSubmit, 
  loading 
}) {
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [reason, setReason] = useState('');
  const [departments, setDepartments] = useState([]);
  const [loadingDepts, setLoadingDepts] = useState(false);

  // Fetch available departments when panel opens
  useEffect(() => {
    if (isOpen) {
      fetchDepartments();
    }
  }, [isOpen]);

  const fetchDepartments = async () => {
    setLoadingDepts(true);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const response = await fetch('/departments', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setDepartments(data.departments || data || []);
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
    } finally {
      setLoadingDepts(false);
    }
  };

  const getAvailableDepartments = () => {
    if (!departments.length) return [];

    // If user is from Helpdesk (dept 7), they can assign to any department
    if (userDept === 7) {
      return departments.filter(dept => dept.id !== currentDepartmentId);
    }
    
    // If user is a Manager from other departments, they can only send back to Helpdesk
    if (userRole === 'MANAGER' && userDept !== 7) {
      return departments.filter(dept => dept.id === 7); // Only Helpdesk
    }

    return [];
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!selectedDepartment) {
      alert('Please select a department');
      return;
    }

    if (!reason.trim()) {
      alert('Please provide a reason for the department change');
      return;
    }

    onSubmit({
      department_id: parseInt(selectedDepartment),
      reason: reason.trim()
    });
  };

  const getInstructions = () => {
    if (userDept === 7) {
      return "As a Helpdesk agent, you can route this ticket to any department.";
    } else if (userRole === 'MANAGER') {
      return "As a department manager, you can only send misrouted tickets back to Helpdesk.";
    }
    return "";
  };

  if (!isOpen) return null;

  const availableDepartments = getAvailableDepartments();

  return (
    <div className="department-override-panel">
      <div className="override-header">
        <h3>🏢 Change Department</h3>
        <button onClick={onClose} className="close-btn" disabled={loading}>✕</button>
      </div>

      <div className="override-content">
        <div className="current-info">
          <strong>Current Department:</strong> {currentDepartment || 'Unassigned'}
        </div>

        <div className="instructions">
          <em>{getInstructions()}</em>
        </div>

        {loadingDepts ? (
          <div className="loading">Loading departments...</div>
        ) : (
          <form onSubmit={handleSubmit} className="override-form">
            <div className="form-group">
              <label htmlFor="department-select">New Department:</label>
              <select
                id="department-select"
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                disabled={loading}
                required
              >
                <option value="">Select a department...</option>
                {availableDepartments.map(dept => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="reason-input">Reason for change:</label>
              <textarea
                id="reason-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this ticket needs to be moved..."
                rows={3}
                disabled={loading}
                required
              />
            </div>

            <div className="form-actions">
              <button 
                type="button" 
                onClick={onClose} 
                className="cancel-btn"
                disabled={loading}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="submit-btn"
                disabled={loading || !selectedDepartment || !reason.trim()}
              >
                {loading ? 'Changing...' : 'Change Department'}
              </button>
            </div>
          </form>
        )}

        {availableDepartments.length === 0 && !loadingDepts && (
          <div className="no-options">
            <p>No department change options available.</p>
            {userRole !== 'MANAGER' && userDept !== 7 && (
              <p><small>Only Helpdesk agents and Managers can change ticket departments.</small></p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}