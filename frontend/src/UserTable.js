import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const UserTable = () => {
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editIndex, setEditIndex] = useState(null);
  const [editedHostname, setEditedHostname] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'hostname', direction: 'asc' });
  const [selectedProfile, setSelectedProfile] = useState(''); 
  const navigate = useNavigate();
  const role = localStorage.getItem('role');

  const API_BASE_URL = `http://${window.location.hostname}:5000`;

  // ✅ Dropdown mapping friendly names
  const profileOptions = {
    "IDM_aaa_prof": "Spatium",
    "ISAKU_aaa_prof": "iSaku",
    "K5_aaa_prof": "K5",
    "GUEST_aaa_prof": "Guest",
    "SUPPORT_aaa_prof": "Support",
    "A5_aaa_prof": "A5"
  };

  const handleLogout = () => {
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    window.location.href = '/';
  };

  useEffect(() => {
    if (!selectedProfile) return;

    const fetchData = () => {
      fetch(`${API_BASE_URL}/users?profile=${selectedProfile}`)
        .then(res => res.json())
        .then(data => {
          setUsers(data);

          // 🔄 Auto refresh if no data
          if (!data || data.length === 0) {
            console.warn("No data found. Refreshing page in 2 seconds...");
            setTimeout(() => {
              window.location.reload();
            }, 2000);
          }
        })
        .catch(err => console.error(err));
    };

    fetchData();
    const interval = setInterval(fetchData, 55000);
    return () => clearInterval(interval);
  }, [API_BASE_URL, selectedProfile]);


  const calculateConnectedAt = (duration) => {
    if (!duration) return 'Unknown';
    const now = new Date();
    const parts = duration.split(':').map(Number);

    let days = 0, hours = 0, minutes = 0;
    if (parts.length === 3) [days, hours, minutes] = parts;
    else if (parts.length === 2) [hours, minutes] = parts;
    else return 'Invalid format';

    const totalMinutes = (days * 24 * 60) + (hours * 60) + minutes;
    const connectedAt = new Date(now.getTime() - totalMinutes * 60 * 1000);

    return connectedAt.toLocaleString('en-US', {
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  };

  const extractFloor = (apName) => {
    const match = apName?.match(/LT(\d{2})/);
    return match ? parseInt(match[1], 10) : null;
  };

  const filteredUsers = users.filter(user =>
    Object.values(user).some(value =>
      value && value.toString().toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    let aVal, bVal;
    if (sortConfig.key === 'hostname') {
      aVal = (a.hostname || '').toLowerCase();
      bVal = (b.hostname || '').toLowerCase();
    } else if (sortConfig.key === 'floor') {
      aVal = extractFloor(a.ap_name) || 0;
      bVal = extractFloor(b.ap_name) || 0;
    }
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const startEditing = (index) => {
    if (role !== 'admin') return;
    setEditIndex(index);
    setEditedHostname(sortedUsers[index].hostname || '');
  };
  const cancelEditing = () => { setEditIndex(null); setEditedHostname(''); };
  const saveHostname = async (index) => {
    const user = sortedUsers[index];
    if (!editedHostname.trim()) return alert('Hostname cannot be empty');
    try {
      const res = await fetch(`${API_BASE_URL}/edit-hostname`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: user.ip, hostname: editedHostname.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        return alert('Error: ' + (err.error || 'Failed to save'));
      }
      setUsers(prev => {
        const idx = prev.findIndex(u => u.ip === user.ip);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], hostname: editedHostname.trim() };
        return updated;
      });
      cancelEditing();
    } catch (error) { alert('Error saving hostname: ' + error.message); }
  };

  const handleAddWhitelist = async (ip) => {
    if (role !== 'admin') return;
    if (!window.confirm(`Add ${ip} to whitelist?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/add-whitelist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      });
      if (!res.ok) { const err = await res.json(); return alert('Failed: ' + (err.error || 'Unknown')); }
      setUsers(prev => {
        const updated = [...prev];
        const idx = prev.findIndex(u => u.ip === ip);
        if (idx !== -1) updated[idx].health = '✅';
        return updated;
      });
    } catch (error) { alert('Error adding to whitelist: ' + error.message); }
  };

  // ✅ New: remove from whitelist
  const handleRemoveWhitelist = async (ip) => {
    if (role !== 'admin') return;
    if (!window.confirm(`Remove ${ip} from whitelist?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/unwhitelist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      });
      if (!res.ok) { const err = await res.json(); return alert('Failed: ' + (err.error || 'Unknown')); }
      setUsers(prev => {
        const updated = [...prev];
        const idx = prev.findIndex(u => u.ip === ip);
        if (idx !== -1) updated[idx].health = '❌';
        return updated;
      });
    } catch (error) { alert('Error removing from whitelist: ' + error.message); }
  };

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h2 className="text-primary">Monitoring Wi-Fi</h2>
        <button className="btn btn-danger" onClick={handleLogout}>Logout</button>
      </div>

      {/* ✅ Dropdown below the header with bold */}
      <div className="mb-3 mt-2">
        <label className="fw-bold text-primary">Select Wi-Fi:</label>
        <select
          className="form-select w-auto mt-1"
          value={selectedProfile}
          onChange={(e) => setSelectedProfile(e.target.value)}
        >
          <option value="">-- Select Wi-Fi --</option>
          {Object.entries(profileOptions).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      <input
        type="text"
        placeholder="Search by Hostname or IP"
        className="form-control mb-3"
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
      />

      <table className="table table-hover table-bordered table-striped align-middle shadow-sm rounded">
        <thead className="table-primary">
          <tr>
            <th onClick={() => requestSort('hostname')} style={{ cursor: 'pointer' }}>
              Hostname {sortConfig.key === 'hostname' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th>IP</th>
            <th>Band</th>
            <th>SSID</th>
            <th>AP Name</th>
            <th onClick={() => requestSort('floor')} style={{ cursor: 'pointer' }}>
              Floor {sortConfig.key === 'floor' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th>Connected At</th>
            <th>Duration (d:h:m)</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {sortedUsers.map((user, index) => (
            <tr key={index} className={user.health === '✅' ? '' : 'table-danger'}>
              <td>
                {editIndex === index ? (
                  <input
                    type="text"
                    className="form-control"
                    value={editedHostname}
                    onChange={e => setEditedHostname(e.target.value)}
                  />
                ) : (
                  <>
                    {user.hostname}{' '}
                    <span
                      role="button"
                      onClick={() => {
                        if (role !== 'admin') return;
                        if (user.health === '✅') {
                          handleRemoveWhitelist(user.ip);
                        } else {
                          handleAddWhitelist(user.ip);
                        }
                      }}
                      className={`ms-2 ${user.health === '✅' ? 'text-success' : 'text-danger'}`}
                      style={{ cursor: role === 'admin' ? 'pointer' : 'not-allowed', opacity: role === 'admin' ? 1 : 0.4 }}
                      title={role !== 'admin' ? 'Only admin can whitelist/unwhitelist' : ''}
                    >
                      {user.health}
                    </span>
                  </>
                )}
              </td>
              <td>{user.ip}</td>
              <td>{user.band}</td>
              <td>{user.ssid?.split('/')[0]}</td>
              <td>{user.ap_name}</td>
              <td>{extractFloor(user.ap_name) ? `${extractFloor(user.ap_name)}th floor` : '-'}</td>
              <td>{calculateConnectedAt(user.duration)}</td>
              <td>{user.duration}</td>
              <td>
                {editIndex === index ? (
                  <div className="d-flex justify-content-between gap-2" style={{ maxWidth: '140px' }}>
                    <button className="btn btn-sm btn-success" onClick={() => saveHostname(index)}>Save</button>
                    <button className="btn btn-sm btn-secondary" onClick={cancelEditing}>Cancel</button>
                  </div>
                ) : (
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => startEditing(index)}
                    disabled={role !== 'admin'}
                    title={role !== 'admin' ? 'Only admin can edit' : ''}
                  >
                    Edit
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default UserTable;
