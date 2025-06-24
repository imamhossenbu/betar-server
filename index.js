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

let programsCollection;
let usersCollection;

async function run() {
  try {
    await client.connect();
    const db = client.db("betar");
    programsCollection = db.collection("cue_programs");
    usersCollection = db.collection("users");

    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}
run().catch(console.dir);

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.status(401).json({ message: 'Authentication token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.log('Token verification error:', err);
            return res.status(403).json({ message: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.post('/api/signup', async (req, res) => {
  const { email, username, password } = req.body;

  if (!email || !username || !password) {
    return res.status(400).json({ message: 'Please enter all fields' });
  }

  try {
    const existingUser = await usersCollection.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ message: 'User with that email or username already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

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

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Please enter username and password' });
  }

  try {
    const user = await usersCollection.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({ message: 'Logged in successfully', token, userId: user._id, username: user.username });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
});


app.post('/api/programs', authenticateToken, async (req, res) => {
  const { serial, broadcastTime, programDetails, day, date, shift, period, programType, artist, lyricist, composer, cdCut, duration } = req.body;
  const userId = req.user.id;

  // --- MODIFIED VALIDATION LOGIC ---
  let missingFields = [];

  if (!serial) missingFields.push('serial');
  if (!broadcastTime) missingFields.push('broadcastTime');
  if (!day) missingFields.push('day');
  if (!date) missingFields.push('date');
  if (!shift) missingFields.push('shift');
  if (!period) missingFields.push('period');
  if (!programType) missingFields.push('programType');

  // programDetails is conditionally required
  if (programType !== 'Song' && !programDetails) {
      missingFields.push('programDetails');
  }
  // For 'Song' type, artist is required
  if (programType === 'Song' && !artist) {
      missingFields.push('artist');
  }

  if (missingFields.length > 0) {
      return res.status(400).json({ message: `Missing required fields: ${missingFields.join(', ')}.` });
  }
  // --- END MODIFIED VALIDATION LOGIC ---

  try {
    const programData = {
      userId: new ObjectId(userId),
      serial,
      broadcastTime,
      programDetails: programDetails || '', // Ensure it's saved as empty string if not provided for Song
      day,
      date,
      shift,
      period,
      programType,
      createdAt: new Date(),
    };

    if (programType === 'Song') {
      programData.artist = artist || '';
      programData.lyricist = lyricist || '';
      programData.composer = composer || '';
      programData.cdCut = cdCut || '';
      programData.duration = duration || '';
    }

    const result = await programsCollection.insertOne(programData);

    res.status(201).json({ ...programData, _id: result.insertedId });
  } catch (err) {
    console.error('Error adding program:', err);
    res.status(500).json({ message: 'Server error during program creation.' });
  }
});

app.get('/api/programs', authenticateToken, async (req, res) => {
  const { day, shift } = req.query;
  const userId = req.user.id;

  if (!day || !shift ) {
    return res.status(400).json({ message: 'Day and Shift are required query parameters.' });
  }

  try {
    const programs = await programsCollection
      .find({ day, shift, userId: new ObjectId(userId) })
      .sort({ serial: 1 })
      .toArray();
    res.json(programs);
  } catch (err) {
    console.error('Error fetching programs:', err);
    res.status(500).json({ message: 'Server error during program retrieval.' });
  }
});
app.get('/api/songs/byCdCut/:cdCut', authenticateToken, async (req, res) => {
    const { cdCut } = req.params;
    // const userId = req.user.id; // Currently not filtering by user for song metadata lookup

    try {
        // Find a song in the songsCollection by its cdCut number
        const song = await programsCollection.findOne({ cdCut: cdCut });

        if (song) {
            res.json(song);
        } else {
            res.status(404).json({ message: 'Song not found for this CD Cut.' });
        }
    } catch (err) {
        console.error('Error fetching song by CD Cut:', err);
        res.status(500).json({ message: 'Server error during song retrieval by CD Cut.' });
    }
});

app.put('/api/programs/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  const userId = req.user.id;

  try {
    const { _id, ...fieldsToUpdate } = updateData;

    const result = await programsCollection.updateOne(
      { _id: new ObjectId(id), userId: new ObjectId(userId) },
      { $set: fieldsToUpdate }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Program not found or you do not have permission to update it.' });
    }
    res.json(result);
  } catch (err) {
    console.error('Error updating program:', err);
    res.status(500).json({ message: 'Server error during program update.' });
  }
});

app.delete('/api/programs/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const result = await programsCollection.deleteOne({ _id: new ObjectId(id), userId: new ObjectId(userId) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Program not found or you do not have permission to delete it.' });
    }
    res.json({ message: 'Program deleted successfully.' });
  } catch (err) {
    console.error('Error deleting program:', err);
    res.status(500).json({ message: 'Server error during program deletion.' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server listening on port ${port}`);
});
