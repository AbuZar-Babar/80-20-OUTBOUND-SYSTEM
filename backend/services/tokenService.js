const jwt = require('jsonwebtoken');

const generateToken = (userId) => {
  const secret = process.env.JWT_SECRET || 'super_secret_jwt_key_change_in_production';
  return jwt.sign({ id: userId }, secret, {
    expiresIn: '7d'
  });
};

const verifyToken = (token) => {
  const secret = process.env.JWT_SECRET || 'super_secret_jwt_key_change_in_production';
  return jwt.verify(token, secret);
};

module.exports = { generateToken, verifyToken };
