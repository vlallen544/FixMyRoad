// =========================================================
//                   GLOBAL HELPER FUNCTIONS
// =========================================================

function getSeverityLabel(severity) {
    const labels = { '1': '🟡 Mild', '2': '🟠 Moderate', '3': '🔴 Severe' };
    return labels[String(severity)] || severity;
}

function getStatusBadge(status) {
    let colorClass = '';
    if (status === 'Submitted') colorClass = 'status-submitted';
    else if (status === 'Assigned') colorClass = 'status-in-progress';
    else if (status === 'Resolved') colorClass = 'status-resolved';
    return `<span class="status-badge ${colorClass}">${status}</span>`;
}

function removeFromLocalHistory(refIdToRemove) {
    const key = 'fmrComplaints';
    const data = JSON.parse(localStorage.getItem(key) || '[]');
    const updatedData = data.filter(c => (c.refId || c.refid) !== refIdToRemove);
    localStorage.setItem(key, JSON.stringify(updatedData));
    if (document.getElementById('historyBody')) renderComplaintHistory();
}

// =========================================================
//              DASHBOARD STATS INTEGRATION
// =========================================================

async function fetchDashboardStats() {
    const successRateEl = document.getElementById('successRatePct');
    const roadsFixedEl = document.getElementById('roadsFixedCount');
    if (!successRateEl || !roadsFixedEl) return;

    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        if (data.success) {
            successRateEl.textContent = `${data.successRate}%`;
            roadsFixedEl.textContent = data.roadsFixed.toLocaleString();
        }
    } catch (err) { console.error("Stats Error:", err); }
}

// =========================================================
//                   CORE APP LOGIC
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    fetchDashboardStats();
    if (document.getElementById('historyBody')) renderComplaintHistory();
    if (document.getElementById('moderatorBody')) fetchAllComplaints();

    // Setup Severity Toggle
    document.querySelectorAll('.severity-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.severity-option').forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            document.getElementById('severity').value = this.dataset.severity;
        });
    });

    // Highlight active nav item
    document.querySelectorAll('.nav-menu a').forEach(link => {
        link.addEventListener('click', function () {
            document.querySelectorAll('.nav-menu a').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
        });
    });
});

// --- Public History Helpers ---

function renderComplaintHistory() {
    const data = JSON.parse(localStorage.getItem('fmrComplaints') || '[]');
    const tbody = document.getElementById('historyBody');
    const empty = document.getElementById('historyEmpty');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (data.length === 0) {
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';

    data.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${c.refId || c.refid}</td> 
            <td>${c.location}</td> 
            <td>${getSeverityLabel(c.severity)}</td>
            <td>${c.status}</td> 
            <td>${new Date(c.updatedAt).toLocaleString('en-IN')}</td>
        `;
        tbody.appendChild(tr);
    });
}

function updateHistoryStatus(refId, newStatus) {
    const data = JSON.parse(localStorage.getItem('fmrComplaints') || '[]');
    const idx = data.findIndex(c => (c.refId || c.refid) === refId);
    if (idx !== -1) {
        data[idx].status = newStatus;
        data[idx].updatedAt = new Date().toISOString();
        localStorage.setItem('fmrComplaints', JSON.stringify(data));
        renderComplaintHistory();
    }
}

// --- API Handlers ---

document.getElementById('potholeForm')?.addEventListener('submit', async function (e) {
    e.preventDefault();
    const submitBtn = document.getElementById('submitBtn');
    const successMsg = document.getElementById('successMsg');
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting to Atlas...';

    const formData = {
        phone: document.getElementById('phone').value,
        area: document.getElementById('area').value,
        location: document.getElementById('location').value,
        severity: document.getElementById('severity').value,
        description: document.getElementById('description').value || ''
    };

    try {
        const res = await fetch('/api/complaints', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('refId').textContent = data.refId;
            successMsg.classList.add('show');
            submitBtn.textContent = '✅ Success! Reset Form';
            
            const historyObj = { 
                refId: data.refId, 
                location: formData.location, 
                severity: formData.severity, 
                status: 'Submitted', 
                updatedAt: new Date().toISOString() 
            };
            const existing = JSON.parse(localStorage.getItem('fmrComplaints') || '[]');
            existing.unshift(historyObj);
            localStorage.setItem('fmrComplaints', JSON.stringify(existing));
            renderComplaintHistory();
        }
    } catch (err) { 
        submitBtn.disabled = false;
        submitBtn.textContent = 'Retry Submission';
    }
});

window.resetComplaintForm = function() {
    const form = document.getElementById('potholeForm');
    if (form) form.reset();
    document.getElementById('successMsg').classList.remove('show');
    const btn = document.getElementById('submitBtn');
    btn.disabled = false;
    btn.textContent = '🚀 Send Complaint to BBMP';
};

window.trackComplaint = async function() { 
    const trackId = document.getElementById('trackId').value.trim();
    if (!trackId) return;

    try {
        const res = await fetch(`/api/complaints/${trackId}`);
        const data = await res.json();
        const resultDiv = document.getElementById('statusResult');

        if (data.success) {
            resultDiv.style.display = 'block';
            resultDiv.scrollIntoView({ behavior: 'smooth' });
            document.getElementById('currentStatus').textContent = data.status;
            document.getElementById('statusTimeline').innerHTML = data.timeline.map(s =>
                `<div class="status-badge ${s.class}">${s.text} • ${s.time}</div>` 
            ).join('');
            updateHistoryStatus(trackId, data.status);
        } else {
            alert("Reference ID not found. It may have been removed by a moderator.");
            removeFromLocalHistory(trackId);
        }
    } catch (err) { console.error(err); }
}

// --- Moderator Functions ---

let allComplaints = [];

async function fetchAllComplaints() {
    try {
        const res = await fetch('/api/all-complaints');
        const data = await res.json();
        const tbody = document.getElementById('moderatorBody');
        if (!tbody || !data.success) return;

        allComplaints = data.complaints;
        renderModeratorTable(allComplaints);
        fetchDashboardStats();
    } catch (err) { console.error(err); }
}

function renderModeratorTable(dataArray) {
    const tbody = document.getElementById('moderatorBody');
    tbody.innerHTML = dataArray.map(c => `
        <tr>
            <td>${c.refId}</td> 
            <td>${new Date(c.createdAt).toLocaleDateString()}</td> 
            <td>${c.location} (${c.area})</td>
            <td>${getSeverityLabel(c.severity)}</td>
            <td>${c.phone}</td>
            <td>${getStatusBadge(c.status)}</td>
            <td>
                <select onchange="updateComplaintStatus('${c.refId}', this.value)">
                    <option value="">Update...</option>
                    <option value="Submitted">Submitted</option>
                    <option value="Assigned">Assigned</option>
                    <option value="Resolved">Resolved</option>
                </select>
            </td>
            <td><button class="btn-delete" onclick="deleteComplaint('${c.refId}')">🗑️</button></td>
        </tr>
    `).join('');
}

window.filterTable = function() {
    const val = document.getElementById('statusFilter').value;
    const filtered = val ? allComplaints.filter(c => c.status === val) : allComplaints;
    renderModeratorTable(filtered);
}

async function updateComplaintStatus(refId, newStatus) {
    if (!newStatus || !confirm(`Set ${refId} to ${newStatus}?`)) return;
    const res = await fetch('/api/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refId, newStatus })
    });
    const result = await res.json();
    if (result.success) {
        fetchAllComplaints();
        updateHistoryStatus(refId, newStatus);
    }
}

async function deleteComplaint(refId) {
    if (!confirm('Permanently delete this record?')) return;
    const res = await fetch(`/api/delete-complaint/${refId}`, { method: 'DELETE' });
    if ((await res.json()).success) {
        removeFromLocalHistory(refId);
        fetchAllComplaints();
    }
}