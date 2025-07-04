const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const token = req.cookies?.token;

    if (!token) {
        return res.status(401).json({ message: 'Unauthorized: Token missing' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        console.log(process.env.JWT_SECRET);
        if (err) return res.status(401).json({ message: 'Unauthorized: Invalid token' });

        req.user = decoded; // contains email, uid
        next();
    });
};

module.exports = verifyToken;
