const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public')); 

// =========================================================
//               MONGODB ATLAS CONNECTION
// =========================================================

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://vlallen544_db_user:PRRfMslF3kW50tWF@fixmyroad.ktu7yey.mongodb.net/FixMyRoad?retryWrites=true&w=majority&appName=FixMyRoad";

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas: FixMyRoad'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- MongoDB Schema & Model ---
const complaintSchema = new mongoose.Schema({
    refId: { type: String, required: true, unique: true },
    phone: String,
    area: String,
    location: String,
    severity: String,
    description: String,
    status: { type: String, default: 'Submitted' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const Complaint = mongoose.model('Complaint', complaintSchema);

// =========================================================
//               DYNAMIC STATUS HISTORY HELPERS
// =========================================================

function timeAgo(timestamp) {
    if (!timestamp) return 'N/A';
    const past = new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now - past) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    return past.toLocaleDateString('en-IN');
}

function getDynamicStatusHistory(status, createdAt, updatedAt) {
    const baseTimeline = [
        { text: 'Submitted', time: timeAgo(createdAt), class: 'status-submitted' }
    ];

    if (status === 'Submitted') return baseTimeline;

    if (status === 'Assigned') {
        return baseTimeline.concat([
            { text: 'BBMP Assigned', time: timeAgo(updatedAt), class: 'status-in-progress' }
        ]);
    }

    if (status === 'Resolved') {
        const assignedTimeMs = new Date(createdAt).getTime() + (new Date(updatedAt).getTime() - new Date(createdAt).getTime()) / 2;
        return baseTimeline.concat([
            { text: 'BBMP Assigned', time: timeAgo(new Date(assignedTimeMs)), class: 'status-in-progress' },
            { text: 'Work Completed', time: timeAgo(updatedAt), class: 'status-resolved' }
        ]);
    }
    return baseTimeline;
}

// =========================================================
//                MODERATOR LOGIN (NEW)
// =========================================================

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    // Authorized credentials
    if (username === "moderator" && password === "BBMP@2025") {
        res.json({ success: true, message: "Authorized" });
    } else {
        res.status(401).json({ success: false, message: "Invalid username or password" });
    }
});

// =========================================================
//                     API ENDPOINTS 
// =========================================================

// POST: Save complaint
app.post('/api/complaints', async (req, res) => {
    try {
        const { phone, area, location, severity, description } = req.body;
        const refId = `FMR-2025-${Math.floor(Math.random() * 90000) + 10000}`;
        
        const newComplaint = new Complaint({
            refId, phone, area, location, severity, description
        });

        await newComplaint.save();
        res.json({ success: true, refId });
    } catch (err) {
        console.error('Insert error:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// GET: Single complaint for tracking
app.get('/api/complaints/:refId', async (req, res) => {
    try {
        const complaint = await Complaint.findOne({ refId: req.params.refId });
        if (!complaint) return res.status(404).json({ success: false, error: 'Not found' });

        res.json({
            success: true,
            refId: complaint.refId,
            status: complaint.status,
            timeline: getDynamicStatusHistory(complaint.status, complaint.createdAt, complaint.updatedAt)
        });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// GET: Dashboard Stats
app.get('/api/stats', async (req, res) => {
    try {
        const total = await Complaint.countDocuments();
        const resolved = await Complaint.countDocuments({ status: 'Resolved' });
        const successRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

        res.json({ success: true, roadsFixed: resolved, successRate });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// GET: All complaints (Moderator)
app.get('/api/all-complaints', async (req, res) => {
    try {
        const complaints = await Complaint.find().sort({ createdAt: -1 });
        res.json({ success: true, complaints });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// POST: Update status (Moderator)
app.post('/api/update-status', async (req, res) => {
    try {
        const { refId, newStatus } = req.body;
        const result = await Complaint.findOneAndUpdate(
            { refId }, 
            { status: newStatus, updatedAt: Date.now() },
            { new: true }
        );
        if (!result) return res.status(404).json({ success: false });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// DELETE: Remove complaint (Moderator)
app.delete('/api/delete-complaint/:refId', async (req, res) => {
    try {
        const result = await Complaint.deleteOne({ refId: req.params.refId });
        if (result.deletedCount === 0) return res.status(404).json({ success: false });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// =========================================================
//                  SERVER LISTENER
// =========================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 FixMyRoad Server live on port ${PORT}`);
});