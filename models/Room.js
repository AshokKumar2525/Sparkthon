const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
    type: { type: String, enum: ['message', 'product'], required: true },
    sender: String, // for message
    content: String, // for message
    title: String,   // for product
    image: String,   // for product
    price: String,   // for product
    sharedBy: String, // for product
    detail: String,  // for product
    timestamp: { type: Date, default: Date.now },
    reactions: [{
        emoji: String,
        by: String  // user email
    }]

});

const roomSchema = new mongoose.Schema({
    roomId: [String],
    participants: [String],
    createdBy: String,
    activityLog: [activitySchema],
    createdAt: { type: Date, default: Date.now },
    ended: { type: Boolean, default: false },
});

module.exports = mongoose.model('Room', roomSchema);
