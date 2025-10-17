import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, 'your-secret-key');
      
      const result = await pool.query('SELECT id, full_name, email, role FROM users WHERE id = $1 AND deleted_by IS NULL', [decoded.id]);
      if (result.rows.length === 0) {
        return res.status(401).json({ message: 'User not found' });
      }
      
      req.user = result.rows[0];
      next();
    } catch (error) {
      res.status(401).json({ message: 'Not authorized' });
    }
  } else {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

export { protect };