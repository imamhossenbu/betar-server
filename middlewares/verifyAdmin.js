const { ObjectId } = require('mongodb');

// assumes `usersCollection` is injected from the route file
const verifyAdmin = (usersCollection) => {
    return async (req, res, next) => {
        const email = req.user?.email;
        if (!email) return res.status(403).json({ message: 'Forbidden: No user info' });

        try {
            const user = await usersCollection.findOne({ email });
            if (user?.role !== 'admin') {
                return res.status(403).json({ message: 'Forbidden: Admins only' });
            }
            next();
        } catch (err) {
            console.error('Admin check error:', err);
            res.status(500).json({ message: 'Server error during role check' });
        }
    };
};

module.exports = verifyAdmin;
