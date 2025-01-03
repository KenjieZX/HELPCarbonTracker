const mongoose = require('mongoose');
const UserSchema = mongoose.Schema({
    username: {type: String, required: true, unique: true},
    password: {type: String, required: true},
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
   
    lifetimeCarbonFootprint: {
      total: { type: Number, default: 0 },
      breakdown: {
          transport: {
              car: { value: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
              bus: { value: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
              bike: { value: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
              train: { value: { type: Number, default: 0 }, count: { type: Number, default: 0 } }
          },
          electricity: { value: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
          diet: { value: { type: Number, default: 0 }, count: { type: Number, default: 0 } }
      }
  }

});

module.exports = mongoose.model('User', UserSchema);
