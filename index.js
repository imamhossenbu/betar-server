require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs'); // Import bcryptjs for password hashing
const jwt = require('jsonwebtoken'); // Import jsonwebtoken for creating tokens

const port = process.env.PORT || 3000;

// Middlewares
// CORS configuration: Ensure the origin matches your frontend URL exactly
app.use(cors({ origin: ['https://betar-demo.vercel.app', 'https://betar-demo.netlify.app', 'http://localhost:5173'], credentials: true }));
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

const authenticateToken = (req, res, next) => {
  const token = req.cookies?.token; // Read from HTTP-only cookie

  if (!token) {
    return res.status(401).json({ message: 'Authentication token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.log('Token verification error:', err);
      return res.status(403).json({ message: 'Invalid or expired token' });
    }

    req.user = user; // Store user data from token
    next();
  });
};


// Define Routes - OUTSIDE of the run() function
app.get('/', (req, res) => {
  res.send('Hello World!');
});

// app.post('/api/signup', async (req, res) => {
//   const { email, username, password } = req.body;

//   if (!email || !username || !password) {
//     return res.status(400).json({ message: 'Please enter all fields' });
//   }

//   try {
//     const existingUser = await usersCollection.findOne({ $or: [{ email }, { username }] });
//     if (existingUser) {
//       return res.status(400).json({ message: 'User with that email or username already exists' });
//     }

//     const salt = await bcrypt.genSalt(10);
//     const hashedPassword = await bcrypt.hash(password, salt);

//     const result = await usersCollection.insertOne({
//       email,
//       username,
//       password: hashedPassword,
//       createdAt: new Date(),
//     });

//     res.status(201).json({ message: 'User registered successfully', userId: result.insertedId });
//   } catch (err) {
//     console.error('Signup error:', err);
//     res.status(500).json({ message: 'Server error during signup' });
//   }
// });

// JWT Token Endpoint
app.post('/jwt', (req, res) => {
  try {
    const email = req.body;
    const token = jwt.sign(email, process.env.JWT_SECRET, { expiresIn: '5h' });
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    }).send({ success: true });
  } catch (error) {
    res.status(500).send({ message: 'Error generating token' });
  }
});

app.post('/api/logout', (req, res) => {
  res
    .clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    })
    .json({ message: 'Logged out successfully' });
});

// POST /api/user
app.post('/api/user', async (req, res) => {
  const { uid, email, displayName } = req.body;

  if (!uid || !email) {
    return res.status(400).json({ message: 'UID and email are required' });
  }

  try {
    // Check if user exists by Firebase UID or email
    const existingUser = await usersCollection.findOne({ uid });

    if (!existingUser) {
      // Insert new user
      const result = await usersCollection.insertOne({
        uid,
        email,
        displayName: displayName || '',
        createdAt: new Date(),
        lastLoginAt: new Date(),
      });
      return res.status(201).json({ message: 'User added', userId: result.insertedId });
    } else {
      // Update lastLoginAt or displayName if needed
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


// app.post('/api/login', async (req, res) => {
//   const { username, password } = req.body;

//   if (!username || !password) {
//     return res.status(400).json({ message: 'Please enter username and password' });
//   }

//   try {
//     const user = await usersCollection.findOne({ username });
//     if (!user) {
//       return res.status(400).json({ message: 'Invalid credentials' });
//     }

//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) {
//       return res.status(400).json({ message: 'Invalid credentials' });
//     }

//     const token = jwt.sign(
//       { id: user._id, username: user.username },
//       process.env.JWT_SECRET,
//       { expiresIn: '1h' }
//     );

//     res.json({ message: 'Logged in successfully', token, userId: user._id, username: user.username });
//   } catch (err) {
//     console.error('Login error:', err);
//     res.status(500).json({ message: 'Server error during login' });
//   }
// });


app.post('/api/programs', authenticateToken, async (req, res) => {
  const {
    serial, broadcastTime, programDetails,
    day, shift, period, programType,
    artist, lyricist, composer, cdCut, duration,
    orderIndex
  } = req.body;

  const userId = req.user.id;
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
      userId: new ObjectId(userId),
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
      // Send a generic success message even if user not found to prevent email enumeration
      return res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });
    }

    // In a real application, you would generate a unique token, save it to the user
    // document with an expiry, and send an email with a reset link.
    // Example:
    // const resetToken = crypto.randomBytes(32).toString('hex');
    // const tokenExpiry = Date.now() + 3600000; // 1 hour
    // await usersCollection.updateOne({ _id: user._id }, { $set: { resetToken, resetTokenExpiry } });
    //
    // const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    //
    // // Send email using Nodemailer, SendGrid, Mailgun etc.
    // await sendEmail(user.email, 'Password Reset Request', `Click here to reset your password: ${resetLink}`);

    res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });

  } catch (err) {
    console.error('Forgot password backend error:', err);
    res.status(500).json({ message: 'Server error during password reset request.' });
  }
});



app.get('/api/programs', authenticateToken, async (req, res) => {
  const { day, shift } = req.query;
  const userId = req.user.id;

  if (!day || !shift) {
    return res.status(400).json({ message: 'Day and Shift are required query parameters.' });
  }
  const stringIdDocs = await programsCollection.find({ userId: { $type: 'string' } }).toArray();

  for (const doc of stringIdDocs) {
    const validId = doc.userId;
    await programsCollection.updateOne(
      { _id: doc._id },
      { $set: { userId: new ObjectId(validId) } }
    );
  }

  try {
    const programs = await programsCollection
      .find({ day, shift, userId: new ObjectId(userId) })
      .sort({ orderIndex: 1 }) // Sorting by orderIndex for persistent ordering
      .toArray();
    res.json(programs);
    console.log(programs);
  } catch (err) {
    console.error('Error fetching programs:', err);
    res.status(500).json({ message: 'Server error during program retrieval.' });
  }
});

// New API endpoint for fetching song data by CD Cut
app.get('/api/songs/byCdCut/:cdCut', authenticateToken, async (req, res) => {
  const { cdCut } = req.params;

  try {
    // Corrected: Use songsCollection for song metadata lookup
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

    const bengaliNumericRegex = /^[\u09E৬-\u09EF]+$/;
    if (fieldsToUpdate.serial && typeof fieldsToUpdate.serial === 'string' && bengaliNumericRegex.test(fieldsToUpdate.serial)) {
      fieldsToUpdate.serial = convertBengaliToEnglishNumbers(fieldsToUpdate.serial);
    }
    if (fieldsToUpdate.serial === '') {
      fieldsToUpdate.serial = '';
    }

    if (fieldsToUpdate.orderIndex !== undefined) {
      fieldsToUpdate.orderIndex = parseInt(fieldsToUpdate.orderIndex);
    }

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
