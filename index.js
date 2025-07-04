require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

const verifyToken = require('./middlewares/verifyToken');
const verifyAdmin = require('./middlewares/verifyAdmin');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: [
    'https://betar-demo.vercel.app',
    'https://betar-demo.netlify.app',
    'http://localhost:5173'
  ],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// MongoDB Setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ezhxw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let programsCollection, usersCollection, songsCollection;

const convertBengaliToEnglishNumbers = (numString) => {
  const eng = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const ben = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(numString).split('').map(d => ben.includes(d) ? eng[ben.indexOf(d)] : d).join('');
};

// Async start function to connect DB and setup collections
async function startServer() {
  try {
    await client.connect();
    const db = client.db("betar");
    programsCollection = db.collection("cue_programs");
    usersCollection = db.collection("users");
    songsCollection = db.collection("songs_metadata");

    // Import middleware AFTER collection init
    const verifyAdminMiddleware = verifyAdmin(usersCollection);

    // Routes
    app.get('/', (req, res) => {
      res.send('Hello World!');
      console.log(process.env.JWT_SECRET);
    });

    app.post('/jwt', (req, res) => {
      const { email, uid } = req.body;
      if (!email || !uid) return res.status(400).json({ message: 'Email and UID required.' });

      const token = jwt.sign({ email, uid }, process.env.JWT_SECRET, { expiresIn: '5h' });
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        maxAge: 5 * 60 * 60 * 1000,
      };
      res.cookie('token', token, cookieOptions).send({ success: true });
    });

    app.post('/api/logout', (req, res) => {
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
      }).send({ success: true });
    });

    // Users routes (public + protected)
    app.post('/users', verifyToken, async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        res.send({ message: 'User already exists', insertedId: null });
        return;
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get('/users/admin/:email', async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      res.send({ isAdmin: user?.role === 'admin' });
    });

    // Protected user routes — only admin can update roles or delete users
    app.get('/users', verifyToken, verifyAdminMiddleware, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    app.patch('/users/:id', verifyToken, verifyAdminMiddleware, async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role } }
      );
      res.send(result);
    });





    app.delete('/users/:id', verifyToken, verifyAdminMiddleware, async (req, res) => {
      const { id } = req.params;
      const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.get('/api/programs', async (req, res) => {
      const { day, shift } = req.query;
      if (!day || !shift) return res.status(400).json({ message: 'Day and Shift are required' });
      try {
        const programs = await programsCollection.find({ day, shift }).sort({ orderIndex: 1 }).toArray();
        res.json(programs);
      } catch (err) {
        console.error('Error fetching programs:', err);
        res.status(500).json({ message: 'Server error during program retrieval.' });
      }
    });

    app.get('/api/songs/byCdCut/:cdCut', async (req, res) => {
      try {
        const song = await programsCollection.findOne({ cdCut: req.params.cdCut });
        song ? res.json(song) : res.status(404).json({ message: 'Song not found' });
      } catch (err) {
        console.error('Error fetching song:', err);
        res.status(500).json({ message: 'Server error during song fetch' });
      }
    });

    // Programs routes with admin protection for add/update/delete
    app.post('/api/programs', verifyToken, verifyAdminMiddleware, async (req, res) => {
      const { serial, broadcastTime, programDetails, day, shift, period, programType, artist, lyricist, composer, cdCut, duration, orderIndex } = req.body;

      let missingFields = [];
      if (!programType) missingFields.push('programType');
      if (orderIndex === undefined || orderIndex === null) missingFields.push('orderIndex');

      if (programType === 'Song') {
        if (!artist) missingFields.push('artist');
      } else {
        if (!serial) missingFields.push('serial');
        if (!broadcastTime) missingFields.push('broadcastTime');
        if (!programDetails) missingFields.push('programDetails');
        if (!day) missingFields.push('day');
        if (!shift) missingFields.push('shift');
        if (!period) missingFields.push('period');
      }

      if (missingFields.length > 0) return res.status(400).json({ message: `Missing required fields: ${missingFields.join(', ')}` });

      try {
        const finalSerial = typeof serial === 'string' ? convertBengaliToEnglishNumbers(serial) : serial;
        const data = {
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
        if (programType === 'Song') {
          Object.assign(data, { artist: artist || '', lyricist: lyricist || '', composer: composer || '', cdCut: cdCut || '', duration: duration || '' });
        }
        const result = await programsCollection.insertOne(data);
        res.status(201).json({ ...data, _id: result.insertedId });
      } catch (err) {
        console.error('Error adding program:', err);
        res.status(500).json({ message: 'Server error during program creation.' });
      }
    });

    app.put('/api/programs/:id', verifyToken, verifyAdminMiddleware, async (req, res) => {
      try {
        const { _id, ...updateFields } = req.body;
        if (updateFields.serial && /^[০-৯]+$/.test(updateFields.serial)) {
          updateFields.serial = convertBengaliToEnglishNumbers(updateFields.serial);
        }
        if (updateFields.orderIndex !== undefined) {
          updateFields.orderIndex = parseInt(updateFields.orderIndex);
        }
        const result = await programsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: updateFields }
        );
        result.matchedCount === 0 ? res.status(404).json({ message: 'Not found or no permission' }) : res.json(result);
      } catch (err) {
        console.error('Error updating program:', err);
        res.status(500).json({ message: 'Server error during update' });
      }
    });

    app.delete('/api/programs/:id', verifyToken, verifyAdminMiddleware, async (req, res) => {
      try {
        const result = await programsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount === 0) {
          return res.status(404).json({ message: 'Program not found.' });
        }
        res.json({ message: 'Program deleted successfully.' });
      } catch (err) {
        console.error('Error deleting program:', err);
        res.status(500).json({ message: 'Server error during deletion.' });
      }
    });

    // Public song fetch route (no auth)
    app.get('/songs', async (req, res) => {
      try {
        const songs = await programsCollection
          .find({
            programType: 'Song',
            cdCut: { $nin: ['...', '', null] }
          })
          .sort({ cdCut: 1 })
          .toArray();

        res.status(200).json(songs);
      } catch (err) {
        console.error('Error fetching songs:', err);
        res.status(500).json({ message: 'Server error during songs fetch.' });
      }
    });

    // Delete song (admin only)
    app.delete('/songs/:id', verifyToken, verifyAdminMiddleware, async (req, res) => {
      try {
        const result = await programsCollection.deleteOne({ _id: new ObjectId(req.params.id) });

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: 'Song not found.' });
        }

        res.json({ message: 'Song deleted successfully.' });
      } catch (err) {
        console.error('Error deleting song:', err);
        res.status(500).json({ message: 'Server error during deletion.' });
      }
    });

    // Insert dummy songs if none exist
    const count = await songsCollection.countDocuments();
    if (count === 0) {
      await songsCollection.insertMany([
        { cdCut: "123-A", programDetails: "আমার সোনার বাংলা", artist: "রবীন্দ্রনাথ ঠাকুর", lyricist: "রবীন্দ্রনাথ ঠাকুর", composer: "রবীন্দ্রনাথ ঠাকুর", duration: "03:00", programType: "Song" },
        { cdCut: "456-B", programDetails: "ধন ধান্য পুষ্প ভরা", artist: "দ্বিজেন্দ্রলাল রায়", lyricist: "দ্বিজেন্দ্রলাল রায়", composer: "দ্বিজেন্দ্রলাল রায়", duration: "02:30", programType: "Song" },
        { cdCut: "789-C", programDetails: "মোরা একটি ফুলকে বাঁচাবো বলে", artist: "গোবিন্দ হালদার", lyricist: "গোবিন্দ হালদার", composer: "আপেল মাহমুদ", duration: "04:15", programType: "Song" }
      ]);
      console.log("✅ Dummy song data inserted.");
    }

    app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }
}

startServer().catch((error) => console.error('Failed to run server:', error));
