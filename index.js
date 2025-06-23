const express = require('express');
const app = express();
require('dotenv').config();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs'); // Import bcryptjs for password hashing
const jwt = require('jsonwebtoken'); // Import jsonwebtoken for creating tokens

const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ezhxw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// MongoDB client setup
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let cueSheetsCollection;
let programsCollection;
let usersCollection; // New: Collection for users

// Connect to MongoDB
async function run() {
  try {
    await client.connect();
    const db = client.db("betar");
    cueSheetsCollection = db.collection("cue_sheets");
    programsCollection = db.collection("cue_programs");
    usersCollection = db.collection("users"); // Initialize users collection

    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}
run().catch(console.dir);

// =======================
// AUTHENTICATION MIDDLEWARE
// =======================
// This middleware will protect routes that require authentication
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

    if (token == null) {
        return res.status(401).json({ message: 'Authentication token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.log('Token verification error:', err);
            return res.status(403).json({ message: 'Invalid or expired token' });
        }
        req.user = user; // Attach user information from token to the request
        next();
    });
};

// =======================
// API ROUTES
// =======================

// Test route
app.get('/', (req, res) => {
  res.send('Hello World!');
});

// ====== User Authentication Routes ======

// User Signup
app.post('/api/signup', async (req, res) => {
  const { email, username, password } = req.body;

  if (!email || !username || !password) {
    return res.status(400).json({ message: 'Please enter all fields' });
  }

  try {
    // Check if user already exists
    const existingUser = await usersCollection.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ message: 'User with that email or username already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Save user to database
    const result = await usersCollection.insertOne({
      email,
      username,
      password: hashedPassword,
      createdAt: new Date(),
    });

    res.status(201).json({ message: 'User registered successfully', userId: result.insertedId });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Server error during signup' });
  }
});

// User Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Please enter username and password' });
  }

  try {
    // Find user by username
    const user = await usersCollection.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Compare provided password with hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // User is authenticated, create a JWT token
    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '1h' } // Token expires in 1 hour
    );

    res.json({ message: 'Logged in successfully', token, userId: user._id, username: user.username });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
});


// ====== Cue Sheet Routes ======
// Apply authentication middleware to routes that require a logged-in user
app.post('/api/cue-sheets', authenticateToken, async (req, res) => {
  const { date, shift, day } = req.body; // <-- Now accepting 'day'
  const userId = req.user.id; // Get userId from the authenticated token
  try {
    const result = await cueSheetsCollection.insertOne({ userId: new ObjectId(userId), day, date, shift, createdAt: new Date() }); // Save 'day'
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Fetch cue sheet by day, shift AND userId (PROTECTED)
app.get('/api/cue-sheets', authenticateToken, async (req, res) => { // <-- Added authenticateToken
  const { day, shift } = req.query; // Query by day and shift
  const userId = req.user.id; // <-- Crucial: Filter by logged-in user's ID
  try {
    const sheet = await cueSheetsCollection.findOne({ day, shift, userId: new ObjectId(userId) }); // Filter by userId
    if (!sheet) return res.status(404).json({ message: 'Cue sheet not found' });
    res.json(sheet);
  } catch (err) {
    console.error('Error fetching cue sheet:', err); // Added error log
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/test-all-programs', async (req, res) => {
  try {
    const programs = await programsCollection.find({}).toArray();
    res.json(programs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ====== Program Routes ======
// This route is PROTECTED and filters by userId
app.post('/api/programs', authenticateToken, async (req, res) => {
  const { cueSheetId, serial, broadcastTime, programDetails, artist, lyricist, composer, cdCut, duration, shift } = req.body;
  const userId = req.user.id; // Get userId from the authenticated token

  try {
    // Verify cueSheetId belongs to the user for extra security
    const cueSheet = await cueSheetsCollection.findOne({ _id: new ObjectId(cueSheetId), userId: new ObjectId(userId) });
    if (!cueSheet) {
        return res.status(403).json({ message: 'Cue sheet not found or does not belong to user.' });
    }

    const result = await programsCollection.insertOne({
      cueSheetId: new ObjectId(cueSheetId),
      userId: new ObjectId(userId), // Also store userId with program
      serial,
      broadcastTime,
      programDetails,
      artist,
      lyricist,
      composer,
      cdCut,
      duration,
      shift,
    });
    // Return the inserted data along with its new _id
    res.status(201).json({ ...req.body, _id: result.insertedId });
  } catch (err) {
    console.error('Error adding program:', err); // Added error log
    res.status(500).json({ message: err.message });
  }
});

// This route is PROTECTED and filters by userId
app.get('/api/programs', authenticateToken, async (req, res) => { // <-- Reverted to PROTECTED version
  const { cueSheetId } = req.query;
  const userId = req.user.id; // Get userId from the authenticated token

  if (!cueSheetId) {
      return res.status(400).json({ message: 'cueSheetId is required' });
  }

  try {
    const programs = await programsCollection
      .find({ cueSheetId: new ObjectId(cueSheetId), userId: new ObjectId(userId) }) // Filter by userId
      .sort({ serial: 1 })
      .toArray();
    res.json(programs);
  } catch (err) {
    console.error('Error fetching programs:', err); // Added error log
    res.status(500).json({ message: err.message });
  }
});

app.put('/api/programs/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  const userId = req.user.id; // Get userId from the authenticated token

  try {
    // Ensure the program being updated belongs to the logged-in user
    const result = await programsCollection.updateOne(
      { _id: new ObjectId(id), userId: new ObjectId(userId) },
      { $set: updateData }
    );
    if (result.matchedCount === 0) {
        return res.status(404).json({ message: 'Program not found or you do not have permission to update it.' });
    }
    res.json(result);
  } catch (err) {
    console.error('Error updating program:', err); // Added error log
    res.status(500).json({ message: err.message });
  }
});

app.delete('/api/programs/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id; // Get userId from the authenticated token

  try {
    // Ensure the program being deleted belongs to the logged-in user
    const result = await programsCollection.deleteOne({ _id: new ObjectId(id), userId: new ObjectId(userId) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Program not found or you do not have permission to delete it.' });
    }
    res.json({ message: 'Program deleted' });
  } catch (err) {
    console.error('Error deleting program:', err); // Added error log
    res.status(500).json({ message: err.message });
  }
});

// =======================
// Start Server
// =======================
app.listen(port, () => {
  console.log(`🚀 Server listening on port ${port}`);
});
