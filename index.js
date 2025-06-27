require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken'); // Import jsonwebtoken for creating tokens

const port = process.env.PORT || 3000;

// Middlewares
// CORS configuration: Ensure the origin matches your frontend URL exactly
app.use(cors({ origin: ['https://betar-demo.vercel.app', 'https://betar-demo.netlify.app', 'http://localhost:5173'], credentials: true, optionsSuccessStatus: 200 }));
// Adjusted: Removed trailing slash
app.use(express.json());
app.use(cookieParser());

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
let songsCollection;

// Utility function to convert Bengali numbers to English numbers for backend processing
const convertBengaliToEnglishNumbers = (numString) => {
  const englishNumbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const bengaliNumbers = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(numString).split('').map(digit => {
    const index = bengaliNumbers.indexOf(digit);
    return index !== -1 ? englishNumbers[index] : digit;
  }).join('');
};

// Authentication Middleware - UPDATED to use 'uid' from JWT
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) return res.status(401).send({ message: 'unauthorized' })
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'unauthorized' })
    }
    req.user = decoded;

    next();
  })

}


// Define Routes - OUTSIDE of the run() function
app.get('/', (req, res) => {
  res.send('Hello World!');
});






// JWT Token Endpoint
app.post('/jwt', (req, res) => {
  try {
    const { email, uid } = req.body;

    if (!email || !uid) {
      return res.status(400).json({ message: 'Email and UID required.' });
    }

    const token = jwt.sign({ email, uid }, process.env.JWT_SECRET, { expiresIn: '5h' });

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 5 * 60 * 60 * 1000,
    };

    res.cookie('token', token, cookieOptions).send({ success: true });
  } catch (error) {
    console.error('JWT Error:', error);
    res.status(500).send({ message: 'Error generating token' });
  }
});


app.post('/api/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  }).send({ success: true });
});


app.get('/api/debug', (req, res) => {
  console.log("✅ /api/debug was hit");
  res.send("Debug success");
});


// POST /api/user - This endpoint is good for syncing Firebase user data to MongoDB
app.post('/api/user', async (req, res) => {
  const { uid, email, displayName } = req.body;

  if (!uid || !email) {
    return res.status(400).json({ message: 'UID and email are required' });
  }

  try {
    const existingUser = await usersCollection.findOne({ email });

    if (!existingUser) {
      const result = await usersCollection.insertOne({
        uid,
        email,
        displayName: displayName || '',
        createdAt: new Date(),
        lastLoginAt: new Date(),
      });
      return res.status(201).json({ message: 'User added', userId: result.insertedId });
    } else {
      await usersCollection.updateOne(
        { uid },
        { $set: { displayName: displayName || existingUser.displayName, lastLoginAt: new Date() } }
      );
      return res.json({ message: 'User updated' });
    }
  } catch (err) {
    console.error('Error syncing user:', err);
    res.status(500).json({ message: 'Server error syncing user' });
  }
});


app.post('/api/programs', verifyToken, async (req, res) => {
  const {
    serial, broadcastTime, programDetails,
    day, shift, period, programType,
    artist, lyricist, composer, cdCut, duration,
    orderIndex
  } = req.body;

  // Use req.user.uid (Firebase UID) as userId
  const userId = req.user?.uid;
  let missingFields = [];

  // Validate orderIndex and programType for all types
  if (!programType) missingFields.push('programType');
  if (orderIndex === undefined || orderIndex === null) missingFields.push('orderIndex');

  if (programType === 'Song') {
    // Only validate Song-specific required fields
    if (!artist) missingFields.push('artist');
    // day, shift, serial, period, broadcastTime, programDetails are OPTIONAL for Song
  } else {
    // General or other program types
    if (!serial) missingFields.push('serial');
    if (!broadcastTime) missingFields.push('broadcastTime');
    if (!programDetails) missingFields.push('programDetails');
    if (!day) missingFields.push('day');
    if (!shift) missingFields.push('shift');
    if (!period) missingFields.push('period');
  }

  if (missingFields.length > 0) {
    return res.status(400).json({ message: `Missing required fields: ${missingFields.join(', ')}.` });
  }

  try {
    let finalSerial = serial;

    // Convert Bengali digits to English if present
    const bengaliNumericRegex = /^[\u09E৬-\u09EF]+$/;
    if (typeof serial === 'string' && bengaliNumericRegex.test(serial)) {
      finalSerial = convertBengaliToEnglishNumbers(serial);
    }

    // Core program data
    const programData = {
      userId: userId, // Use the string UID directly
      serial: finalSerial || '',
      broadcastTime: broadcastTime || '',
      programDetails: programDetails || '',
      day: day || '',
      shift: shift || '',
      period: period || '',
      programType,
      orderIndex: parseInt(orderIndex),
      createdAt: new Date(),
    };

    // Add Song-specific fields if it's a song
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


app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  try {
    const user = await usersCollection.findOne({ email });

    if (!user) {
      return res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });
    }

    res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });

  } catch (err) {
    console.error('Forgot password backend error:', err);
    res.status(500).json({ message: 'Server error during password reset request.' });
  }
});


app.get('/api/programs', async (req, res) => {
  const { day, shift } = req.query;

  if (!day || !shift) {
    return res.status(400).json({ message: 'Day and Shift are required query parameters.' });
  }

  try {
    // Find programs using the string UID
    const programs = await programsCollection
      .find({ day, shift })
      .sort({ orderIndex: 1 })
      .toArray();
    res.json(programs);
    console.log(programs);
  } catch (err) {
    console.error('Error fetching programs:', err);
    res.status(500).json({ message: 'Server error during program retrieval.' });
  }
});

// New API endpoint for fetching song data by CD Cut
app.get('/api/songs/byCdCut/:cdCut', verifyToken, async (req, res) => {
  const { cdCut } = req.params;

  try {
    // Corrected: Use songsCollection for song metadata lookup if it's meant for general song data
    // If this should retrieve a program that IS a song, then programsCollection is correct.
    // Assuming it's a song entry within programsCollection
    const song = await programsCollection.findOne({ cdCut: cdCut, programType: "Song" }); // Added programType filter

    if (song) {
      res.json(song);
    } else {
      res.status(404).json({ message: 'Song program not found for this CD Cut.' });
    }
  } catch (err) {
    console.error('Error fetching song by CD Cut:', err);
    res.status(500).json({ message: 'Server error during song retrieval by CD Cut.' });
  }
});


app.put('/api/programs/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  // Use req.user.uid (Firebase UID) as userId
  const userId = req.user.uid;

  try {
    const { _id, ...fieldsToUpdate } = updateData;

    const bengaliNumericRegex = /^[\u09E৬-\u09EF]+$/;
    if (fieldsToUpdate.serial && typeof fieldsToUpdate.serial === 'string' && bengaliNumericRegex.test(fieldsToUpdate.serial)) {
      fieldsToUpdate.serial = convertBengaliToEnglishNumbers(fieldsToUpdate.serial);
    }
    if (fieldsToUpdate.serial === '') { // Allow clearing serial
      fieldsToUpdate.serial = '';
    }

    if (fieldsToUpdate.orderIndex !== undefined) {
      fieldsToUpdate.orderIndex = parseInt(fieldsToUpdate.orderIndex);
    }

    // Update using the string UID
    const result = await programsCollection.updateOne(
      { _id: new ObjectId(id), userId: userId },
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


app.delete('/api/programs/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  // Use req.user.uid (Firebase UID) as userId
  const userId = req.user?.uid;

  try {
    // Delete using the string UID
    const result = await programsCollection.deleteOne({ _id: new ObjectId(id), userId: userId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Program not found or you do not have permission to delete it.' });
    }
    res.json({ message: 'Program deleted successfully.' });
  } catch (err) {
    console.error('Error deleting program:', err);
    res.status(500).json({ message: 'Server error during program deletion.' });
  }
});

// Run the MongoDB connection and start the server
async function startServer() {
  try {
    await client.connect();
    const db = client.db("betar");
    programsCollection = db.collection("cue_programs");
    usersCollection = db.collection("users");
    songsCollection = db.collection("songs_metadata");

    // Insert dummy data only if the collection is empty
    const songCount = await songsCollection.countDocuments();
    if (songCount === 0) {
      const dummySongs = [
        {
          cdCut: "123-A",
          programDetails: "আমার সোনার বাংলা",
          artist: "রবীন্দ্রনাথ ঠাকুর",
          lyricist: "রবীন্দ্রনাথ ঠাকুর",
          composer: "রবীন্দ্রনাথ ঠাকুর",
          duration: "03:00",
          programType: "Song"
        },
        {
          cdCut: "456-B",
          programDetails: "ধন ধান্য পুষ্প ভরা",
          artist: "দ্বিজেন্দ্রলাল রায়",
          lyricist: "দ্বিজেন্দ্রলাল রায়",
          composer: "দ্বিজেন্দ্রলাল রায়",
          duration: "02:30",
          programType: "Song"
        },
        {
          cdCut: "789-C",
          programDetails: "মোরা একটি ফুলকে বাঁচাবো বলে",
          artist: "গোবিন্দ হালদার",
          lyricist: "গোবিন্দ হালদার",
          composer: "আপেল মাহমুদ",
          duration: "04:15",
          programType: "Song"
        }
      ];
      await songsCollection.insertMany(dummySongs);
      console.log("✅ Dummy song data inserted.");
    }

    console.log("✅ MongoDB connected");

    // Start the Express server AFTER MongoDB is connected and collections are initialized
    app.listen(port, () => {
      console.log(`🚀 Server listening on port ${port}`);
    });

  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    // Exit process if DB connection fails, as the app cannot function without it
    process.exit(1);
  }
}

// Call the function to start the server
startServer().catch(console.dir);
