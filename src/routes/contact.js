const express = require("express");
const ContactMessage = require("../models/ContactMessage");
const { protect: auth, adminOnly } = require("../middleware/auth");

const router = express.Router();

// POST /api/contact - Submit a contact message (public)
router.post("/", async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    // Validation
    if (!name || !email || !message) {
      return res.status(400).json({ message: "Name, email, and message are required" });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Please provide a valid email address" });
    }

    // Create contact message
    const contactMessage = new ContactMessage({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: subject || "General Inquiry",
      message: message.trim(),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await contactMessage.save();

    res.status(201).json({
      success: true,
      message: "Thank you! Your message has been sent successfully.",
    });
  } catch (error) {
    console.error("Contact form error:", error);
    res.status(500).json({ message: "Failed to send message. Please try again later." });
  }
});

// GET /api/contact - Get all contact messages (admin only)
router.get("/", auth, adminOnly, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (status && ["new", "read", "replied", "archived"].includes(status)) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const messages = await ContactMessage.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ContactMessage.countDocuments(query);
    const unreadCount = await ContactMessage.countDocuments({ status: "new" });

    res.json({
      success: true,
      messages,
      total,
      unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Get contact messages error:", error);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
});

// PATCH /api/contact/:id - Update message status (admin only)
router.patch("/:id", auth, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!["new", "read", "replied", "archived"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const message = await ContactMessage.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    res.json({
      success: true,
      message: "Status updated successfully",
      data: message,
    });
  } catch (error) {
    console.error("Update message status error:", error);
    res.status(500).json({ message: "Failed to update status" });
  }
});

// DELETE /api/contact/:id - Delete a message (admin only)
router.delete("/:id", auth, adminOnly, async (req, res) => {
  try {
    const message = await ContactMessage.findByIdAndDelete(req.params.id);
    
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    res.json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    console.error("Delete message error:", error);
    res.status(500).json({ message: "Failed to delete message" });
  }
});

module.exports = router;
