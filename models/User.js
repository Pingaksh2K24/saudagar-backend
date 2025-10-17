import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  phone: {
    type: String,
    required: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  role: {
    type: String,
    required: true
  },
  businessName: {
    type: String
  },
  address: {
    type: Object
  },
  status: {
    type: String,
    default: 'active'
  },
  user_id: {
    type: String
  }
}, {
  timestamps: true
});

export default mongoose.model('User', userSchema, 'ser');