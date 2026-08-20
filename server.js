const express = require('express');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (HTML, CSS, images)
app.use(express.static(path.join(__dirname, 'public')));

// Sitemap Route (Directly before any static handlers)
app.get('/sitemap.xml', (req, res) => {
  res.setHeader('Content-Type', 'text/xml; charset=ytf-8');
  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://kumaon-travels.vercel.app/</loc>
    <lastmod>2026-08-19</lastmod>
    <priority>1.0</priority>
  </url>
</urlset>`);
});

// Route root URL to index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Database Connection Pool (Lazy initialization)
let db;
function getDbPool() {
  if (!db) {
    db = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'kumaon_travels',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }
  return db;
}

// Email Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.ADMIN_EMAIL,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

// 1. Submit Quick Booking API
app.post('/api/bookings', async (req, res) => {
  const { name, phone, pickup, drop, tripType, vehicle, travelDate } = req.body;

  if (!pickup || !drop || !tripType || !vehicle || !travelDate || !phone) {
    return res.status(400).json({ 
      success: false, 
      message: 'All booking fields including phone number are required.' 
    });
  }

  try {
    const pool = getDbPool();
    const sql = `
      INSERT INTO bookings (customer_name, customer_phone, pickup_location, drop_location, trip_type, vehicle_type, travel_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const [result] = await pool.execute(sql, [
      name || 'Guest User',
      phone,
      pickup,
      drop,
      tripType,
      vehicle,
      travelDate
    ]);

    const bookingId = result.insertId;

    // Send instant email alert to admin/owner
    const mailOptions = {
      from: process.env.ADMIN_EMAIL,
      to: process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL,
      subject: `🚖 New Booking Alert #${bookingId} - Kumaon Travels`,
      html: `
        <h2>New Ride Enquiry from Website</h2>
        <p><strong>Booking ID:</strong> #${bookingId}</p>
        <p><strong>Customer Name:</strong> ${name || 'N/A'}</p>
        <p><strong>Phone:</strong> <a href="tel:${phone}">${phone}</a></p>
        <hr/>
        <p><strong>Pickup:</strong> ${pickup}</p>
        <p><strong>Drop/Tour:</strong> ${drop}</p>
        <p><strong>Trip Type:</strong> ${tripType}</p>
        <p><strong>Vehicle:</strong> ${vehicle}</p>
        <p><strong>Travel Date:</strong> ${travelDate}</p>
      `
    };

    transporter.sendMail(mailOptions).catch(err => console.error("Email error:", err));

    return res.status(201).json({
      success: true,
      message: 'Booking enquiry received successfully. Our team will contact you shortly.',
      bookingId: bookingId
    });

  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error while processing booking. Please try again or call directly.' 
    });
  }
});

// 2. Admin API: View All Bookings
app.get('/api/admin/bookings', async (req, res) => {
  try {
    const pool = getDbPool();
    const [rows] = await pool.execute('SELECT * FROM bookings ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Local development listener
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Kumaon Travels Backend running on http://localhost:${PORT}`);
  });
}

// Required for Vercel Serverless
module.exports = app;