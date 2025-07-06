require('dotenv').config();
console.log('JWT_SECRET:', process.env.JWT_SECRET);

const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['https://betar-demo.netlify.app', 'http://localhost:5173', 'https://equesheet.com']
}));

app.use(express.json());

// MongoDB Setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ezhxw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let programsCollection, usersCollection, songsCollection, specialProgramsCollection; // Declared globally

// Helper function to convert Bengali numbers to English numbers
const convertBengaliToEnglishNumbers = (numString) => {
  const eng = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const ben = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(numString).split('').map(d => ben.includes(d) ? eng[ben.indexOf(d)] : d).join('');
};

// Async function to connect to DB and setup collections
async function startServer() {
  try {
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    const db = client.db("betar");
    programsCollection = db.collection("cue_programs");
    usersCollection = db.collection("users");
    songsCollection = db.collection("songs_metadata");
    specialProgramsCollection = db.collection("special_programs"); // Initialize the global variable

    // Middleware to verify if the authenticated user is an admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.user?.email; // User info comes from verifyToken middleware
      if (!email) {
        console.log('Forbidden: No user info in request for admin check');
        return res.status(403).json({ message: 'Forbidden: No user info' });
      }

      try {
        const user = await usersCollection.findOne({ email });
        if (user?.role !== 'admin') {
          console.log(`Forbidden: User ${email} is not an admin`);
          return res.status(403).json({ message: 'Forbidden: Admins only' });
        }
        next(); // User is an admin, proceed
      } catch (err) {
        console.error('Admin check error:', err);
        res.status(500).json({ message: 'Server error during role check' });
      }
    };

    // Routes
    app.get('/', (req, res) => {
      res.send('Hello World!');
    });

    // JWT token creation endpoint for login/signup
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '5h' });
      res.send({ token })
    })

    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        res.status(401).send({ message: 'Token not found' })
        return;
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
          res.status(403).send({ message: 'Unauthorized access' })
          return;
        }
        req.user = decoded;
        next();
      })
    }


    // Users routes (public + protected)
    // Endpoint to create a new user or acknowledge existing user
    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        res.send({ message: 'User already exists', insertedId: null });
        return;
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    })


    // Endpoint to check if a user is an admin (public access, but role check is client-side)
    app.get('/users/admin/:email', async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      res.send({ isAdmin: user?.role === 'admin' });
    });

    // Protected user routes — only admin can view all users, update roles or delete users
    // Get all users (Admin only)
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    // Update user role (Admin only)
    app.patch('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role } }
      );
      res.send(result);
    });

    // Delete user (Admin only)
    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Get programs for a specific day and shift (Public access)
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

    // api for get special collection data
    app.get('/api/special', async (req, res) => {
      try {
        const programs = await specialProgramsCollection.find().sort({ orderIndex: 1 }).toArray();
        res.json(programs);
      } catch (err) {
        console.error('Error fetching special programs:', err);
        res.status(500).json({ message: 'Server error during special program retrieval.' });
      }
    });

    // Get song by cdCut (Public access)
    app.get('/api/songs/byCdCut/:cdCut', async (req, res) => {
      try {
        const song = await programsCollection.findOne({ cdCut: req.params.cdCut });
        song ? res.json(song) : res.status(404).json({ message: 'Song not found' });
      } catch (err) {
        console.error('Error fetching song:', err);
        res.status(500).json({ message: 'Server error during song fetch' });
      }
    });


    // get special song by cdCut
    app.get('/api/specialSongs/byCdCut/:cdCut', async (req, res) => {
      try {
        const song = await specialProgramsCollection.findOne({ cdCut: req.params.cdCut });
        song ? res.json(song) : res.status(404).json({ message: 'Song not found' });
      } catch (err) {
        console.error('Error fetching special song:', err);
        res.status(500).json({ message: 'Server error during special song fetch' });
      }
    });

    // Programs routes with admin protection for add/update/delete
    // Add a new program (Admin only)
    app.post('/api/programs', verifyToken, verifyAdmin, async (req, res) => {
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


    // post special data
    app.post('/api/special', verifyToken, verifyAdmin, async (req, res) => {
      const {
        serial,
        broadcastTime,
        programDetails,
        programType,
        artist,
        lyricist,
        composer,
        cdCut,
        duration,
        orderIndex
      } = req.body;

      // Validation for special programs: day, shift are NOT required.
      const missingFields = [];

      if (!programType) missingFields.push('programType');
      if (orderIndex === undefined || orderIndex === null) missingFields.push('orderIndex');

      if (programType === 'Song') {
        if (!artist) missingFields.push('artist');
      } else {
        if (!serial) missingFields.push('serial');
        if (!broadcastTime) missingFields.push('broadcastTime');
        if (!programDetails) missingFields.push('programDetails');
        // period is NOT required for special General programs, but will be stored if provided.
      }

      if (missingFields.length > 0) {
        return res.status(400).json({
          message: `Missing required fields for special program: ${missingFields.join(', ')}`
        });
      }

      try {
        const finalSerial = typeof serial === 'string' ? convertBengaliToEnglishNumbers(serial) : serial;

        // Constructing data for special programs
        const data = {
          serial: programType === 'Song' ? '' : finalSerial || '',
          broadcastTime: programType === 'Song' ? '' : broadcastTime || '',
          programDetails: programType === 'Song' ? '' : programDetails || '',
          day: '', // Always empty for special programs
          shift: '', // Always empty for special programs
          period: programType === 'Song' ? '' : req.body.period || '', // period is empty for Song, otherwise use provided or empty
          programType,
          orderIndex: parseInt(orderIndex),
          createdAt: new Date()
        };

        // Add Song fields if applicable
        if (programType === 'Song') {
          Object.assign(data, {
            artist: artist || '',
            lyricist: lyricist || '',
            composer: composer || '',
            cdCut: cdCut || '',
            duration: duration || ''
          });
        }

        const result = await specialProgramsCollection.insertOne(data); // Use specialProgramsCollection
        res.status(201).json({ ...data, _id: result.insertedId });

      } catch (err) {
        console.error('Error adding special program:', err);
        res.status(500).json({ message: 'Server error during special program creation.' });
      }
    });


    // Update an existing program (Admin only)
    app.put('/api/programs/:id', verifyToken, verifyAdmin, async (req, res) => {
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

    // update special data
    app.put('/api/special/:id', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { _id, ...updateFields } = req.body;

        // Convert Bengali serial to English if present
        if (updateFields.serial && /^[০-৯]+$/.test(updateFields.serial)) {
          updateFields.serial = convertBengaliToEnglishNumbers(updateFields.serial);
        }
        // Parse orderIndex if present
        if (updateFields.orderIndex !== undefined) {
          updateFields.orderIndex = parseInt(updateFields.orderIndex);
        }

        // Ensure day and shift are always empty for special programs
        updateFields.day = '';
        updateFields.shift = '';

        // Handle period based on programType for special programs
        // If programType is Song, period should be empty. Otherwise, use provided or empty.
        if (updateFields.programType === 'Song') {
          updateFields.period = '';
          // Clear general program details if it's a song
          updateFields.serial = '';
          updateFields.broadcastTime = '';
          updateFields.programDetails = '';
        } else {
          updateFields.period = updateFields.period || '';
        }

        const result = await specialProgramsCollection.updateOne( // Use specialProgramsCollection
          { _id: new ObjectId(req.params.id) },
          { $set: updateFields }
        );
        result.matchedCount === 0 ? res.status(404).json({ message: 'Not found or no permission' }) : res.json(result);
      } catch (err) {
        console.error('Error updating special program:', err);
        res.status(500).json({ message: 'Server error during special program update' });
      }
    });

    // Delete a program (Admin only)
    app.delete('/api/programs/:id', verifyToken, verifyAdmin, async (req, res) => {
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

    // delete special data
    app.delete('/api/special/:id', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await specialProgramsCollection.deleteOne({ _id: new ObjectId(req.params.id) }); // Use specialProgramsCollection
        if (result.deletedCount === 0) {
          return res.status(404).json({ message: 'Special program not found.' });
        }
        res.json({ message: 'Special program deleted successfully.' });
      } catch (err) {
        console.error('Error deleting special program:', err);
        res.status(500).json({ message: 'Server error during special program deletion.' });
      }
    });

    // Public song fetch route (no auth) - fetches songs from programsCollection
    app.get('/songs', async (req, res) => {
      try {
        const songs = await programsCollection
          .find({
            programType: 'Song',
            cdCut: { $nin: ['...', '', null] } // Filter out songs without a valid cdCut
          })
          .sort({ cdCut: 1 }) // Sort by cdCut
          .toArray();

        res.status(200).json(songs);
      } catch (err) {
        console.error('Error fetching songs:', err);
        res.status(500).json({ message: 'Server error during songs fetch.' });
      }
    });

    // get special song
    app.get('/api/specialSongs', async (req, res) => {
      try {
        const songs = await specialProgramsCollection
          .find({
            programType: 'Song',
            cdCut: { $nin: ['...', '', null] } // Filter out songs without a valid cdCut
          })
          .sort({ cdCut: 1 }) // Sort by cdCut
          .toArray();

        res.status(200).json(songs);
      } catch (err) {
        console.error('Error fetching special songs:', err);
        res.status(500).json({ message: 'Server error during special songs fetch.' });
      }
    });

    // Delete song (Admin only) - deletes song from programsCollection
    app.delete('/songs/:id', verifyToken, verifyAdmin, async (req, res) => {
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

    // delete special song
    app.delete('/specialSongs/:id', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await specialProgramsCollection.deleteOne({ _id: new ObjectId(req.params.id) });

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: 'Special song not found.' });
        }

        res.json({ message: 'Special song deleted successfully.' });
      } catch (err) {
        console.error('Error deleting special song:', err);
        res.status(500).json({ message: 'Server error during deletion.' });
      }
    });

    // Insert dummy songs into songsCollection if none exist
    const count = await songsCollection.countDocuments();
    if (count === 0) {
      await songsCollection.insertMany([
        { cdCut: "123-A", programDetails: "আমার সোনার বাংলা", artist: "রবীন্দ্রনাথ ঠাকুর", lyricist: "রবীন্দ্রনাথ ঠাকুর", composer: "রবীন্দ্রনাথ ঠাকুর", duration: "03:00", programType: "Song" },
        { cdCut: "456-B", programDetails: "ধন ধান্য পুষ্প ভরা", artist: "দ্বিজেন্দ্রলাল রায়", lyricist: "দ্বিজেন্দ্রলাল রায়", composer: "দ্বিজেন্দ্রলাল রায়", duration: "02:30", programType: "Song" },
        { cdCut: "789-C", programDetails: "মোরা একটি ফুলকে বাঁচাবো বলে", artist: "গোবিন্দ হালদার", lyricist: "গোবিন্দ হালদার", composer: "আপেল মাহমুদ", duration: "04:15", programType: "Song" }
      ]);
      console.log("✅ Dummy song data inserted into songs_metadata collection.");
    }

    // Start the Express server
    app.listen(port, () => console.log(`🚀 Server running on port ${port}`));

  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1); // Exit the process if DB connection fails
  }
}

// Call the startServer function and catch any unhandled errors
startServer().catch((error) => console.error('Failed to run server:', error));
