require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const path = require('path');

const app = express();
const { v4: uuidv4 } = require('uuid');
const Room = require('./models/Room');
const http = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(http);


async function sendEmail(to, message) {
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_ID, // Set in .env
            pass: process.env.EMAIL_PASS
        }
    });

    await transporter.sendMail({
        from: `"Friends Cart" <${process.env.EMAIL_ID}>`,
        to,
        subject: 'You are invited to shop together!',
        html: `<p>${message}</p>`
    });
}


// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Set EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const mongoURI = process.env.MONGODB_URI;
// MongoDB Atlas Connection
mongoose.connect(mongoURI)
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch(err => console.error('MongoDB connection error:', err));


// Schemas
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    createdAt: { type: Date, default: Date.now }
});

const feedbackSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    description: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const contactSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    inquiryType: {
        type: String,
        required: true,
        enum: ['order', 'returns', 'products', 'business', 'other']
    },
    message: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const cartItemSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    productImage: { type: String, required: true },
    productTitle: { type: String, required: true },
    productPrice: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    addedAt: { type: Date, default: Date.now }
});

const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [{
        productImage: String,
        productTitle: String,
        productPrice: String,
        quantity: Number
    }],
    totalAmount: { type: String, required: true },
    shippingAddress: { type: String, required: true },
    contactNumber: { type: String, required: true },
    orderDate: { type: Date, default: Date.now },
    status: { type: String, default: 'Processing' },
    roomId: String  // ✅ This must exist in the schema!

});

// Models
const User = mongoose.model('User', userSchema);
const Feedback = mongoose.model('Feedback', feedbackSchema);
const Contact = mongoose.model('Contact', contactSchema);
const CartItem = mongoose.model('CartItem', cartItemSchema);
const Order = mongoose.model('Order', orderSchema);

// Email transporter setup (for OTP and password reset)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Routes

// Home route
app.get('/', (req, res) => {
    res.render('index');
});

// Authentication Routes

// Register GET
app.get('/register', (req, res) => {
    res.render('register', {
        error: null,
    });
});

// Register POST
app.post('/register', async (req, res) => {
    try {
        console.log('Received registration data:', req.body);

        const { fullName, phone, address, email, password } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            // Return just the error message instead of rendering the page
            return res.status(400).send('Email already exists');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            fullName,
            phone,
            address,
            email,
            password: hashedPassword
        });

        await newUser.save();
        console.log('User successfully saved:', newUser);

        req.session.user = {
            id: newUser._id,
            fullName: newUser.fullName,
            email: newUser.email,
            phone: newUser.phone,
            address: newUser.address
        };

        // Send success response
        res.status(200).send('Registration successful');
    } catch (error) {
        console.error('Registration Error:', error);
        // Return just the error message
        res.status(500).send('Registration failed. Please try again.');
    }
});

// Login GET
app.get('/login', (req, res) => {
    res.render('login');
});

// Login POST
// Replace the existing login POST route with this:

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'User not found',
                title: 'Login Failed'
            });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: 'Invalid credentials',
                title: 'Login Failed'
            });
        }

        // Create session
        req.session.user = {
            id: user._id,
            fullName: user.fullName,
            email: user.email,
            phone: user.phone,
            address: user.address
        };

        // Return success response
        return res.status(200).json({
            success: true,
            message: 'Login successful',
            title: 'Success',
            redirectUrl: '/main_page'
        });

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred during login',
            title: 'Error'
        });
    }
});

// Forgot Password GET
app.get('/forgot-password', (req, res) => {
    res.render('forgot-password');
});

// Forgot Password POST (updated)
app.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'User not found'
            });
        }

        // Generate OTP
        const otp = crypto.randomInt(1000, 9999).toString();

        // Set reset token and expiry (10 minutes)
        user.resetPasswordToken = otp;
        user.resetPasswordExpires = Date.now() + 600000; // 10 minutes

        await user.save();

        // Send email with OTP
        const mailOptions = {
            to: user.email,
            subject: 'Password Reset OTP',
            text: `Your OTP for password reset is: ${otp}. It will expire in 10 minutes.`,
            html: `<p>Your OTP for password reset is: <strong>${otp}</strong>. It will expire in 10 minutes.</p>`
        };

        await transporter.sendMail(mailOptions);

        res.json({
            success: true,
            message: 'OTP sent to your email'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error processing forgot password request'
        });
    }
});

// Verify OTP POST (updated)
app.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        // Find user
        const user = await User.findOne({
            email,
            resetPasswordToken: otp,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired OTP'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password and clear reset token
        user.password = hashedPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        await user.save();

        res.json({
            success: true,
            message: 'Password has been reset successfully'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error resetting password'
        });
    }
});

// ... (rest of the server.js code remains the same)

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Main Page (protected route)
app.get('/main_page', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    try {
        res.render('main_page', {
            fullName: req.session.user.fullName,
            phone: req.session.user.phone,
            email: req.session.user.email,
            address: req.session.user.address
        });
        console.log(req.session.user);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading main page');
    }
});
//offers_page route
app.get('/offers_page', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.render('offers_page');
});

//buy page route 
app.get('/buy_page', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    try {
        res.render('buy_page', {
            fullName: req.session.user.fullName,
            phone: req.session.user.phone,
            email: req.session.user.email,
            address: req.session.user.address
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading buy page');
    }
});
//five-sections routes

//electronics_page route
app.get('/electronics_page', async (req, res) => {
    try {
        if (!req.session.user || !req.session.user.email) {
            return res.redirect('/login'); // or send 401
        }

        const userEmail = req.session.user.email;
        const rooms = await Room.find({ participants: userEmail });

        res.render('electronics_page', { rooms }); // ✅ rooms passed
    } catch (err) {
        console.error('Error loading electronics_page:', err);
        res.status(500).send('Internal Server Error');
    }

});

//fashion_page route
app.get('/fashion_page', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    try {
        res.render('fashion_page');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading fashion_page');
    }
})
//groceries_page route
app.get('/groceries_page', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    try {
        res.render('groceries_page');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading groceries_page ');
    }
})
//health_beauty_page route
app.get('/health_beauty_page', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    try {
        res.render('health_beauty_page');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading health_beauty_page');
    }
})
//kids_page route
app.get('/kids_page', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    try {
        res.render('kids_page');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading kids_page');
    }
})
// Feedback Routes

// Update the submit-feedback route with better error handling
app.post('/submit-feedback', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'Please login first',
            title: 'Authentication Required',
            icon: 'warning'
        });
    }

    try {
        const { rating, description } = req.body;

        // Validate input
        if (!rating || !description) {
            return res.status(400).json({
                success: false,
                message: 'Please provide both rating and description',
                title: 'Missing Information',
                icon: 'warning'
            });
        }

        // Create new feedback
        const feedback = new Feedback({
            userId: req.session.user.id,
            rating: parseInt(rating),
            description: description.trim()
        });

        await feedback.save().then((res) => {
            console.log('Feedback saved:', res);
        }
        ).catch((err) => {
            console.error('Error saving feedback:', err);
        }
        );

        // Send success response with popup data
        res.json({
            success: true,
            title: 'Thank You!',
            message: 'Your feedback has been submitted successfully',
            icon: 'success',
            showConfetti: true // Optional flag for extra effects
        });

    } catch (error) {
        console.error('Feedback submission error:', error);
        res.status(500).json({
            success: false,
            title: 'Error',
            message: 'Failed to submit feedback. Please try again.',
            icon: 'error'
        });
    }
});

// Show Feedbacks GET
// Update the show-feedbacks route:

app.get('/show-feedbacks', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    try {
        // Fetch all feedbacks with populated user information
        const feedbacks = await Feedback.find()
            .populate('userId', 'fullName')
            .sort({ createdAt: -1 });

        res.render('show_feedbacks', {
            user: {
                id: req.session.user.id,
                _id: req.session.user.id // Add this for compatibility
            },
            feedbacks: feedbacks
        });
    } catch (error) {
        console.error('Error fetching feedbacks:', error);
        res.status(500).send('Error loading feedbacks');
    }
});
// Update Feedback PUT
// Update Feedback route
app.post('/update-feedback/:id', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'Please login first',
            title: 'Authentication Required'
        });
    }

    try {
        const { rating, description } = req.body;

        const feedback = await Feedback.findOneAndUpdate(
            { _id: req.params.id, userId: req.session.user.id },
            {
                rating: parseInt(rating),
                description: description.trim()
            },
            { new: true }
        ).populate('userId', 'fullName');

        if (!feedback) {
            return res.status(404).json({
                success: false,
                message: 'Feedback not found or unauthorized',
                title: 'Error'
            });
        }

        // Get updated stats
        const allFeedbacks = await Feedback.find();
        const stats = {
            total: allFeedbacks.length,
            average: (allFeedbacks.reduce((sum, f) => sum + f.rating, 0) / allFeedbacks.length).toFixed(1),
            positive: allFeedbacks.filter(f => f.rating >= 4).length
        };

        res.json({
            success: true,
            message: 'Feedback updated successfully',
            feedback,
            stats
        });
    } catch (error) {
        console.error('Feedback update error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating feedback',
            title: 'Error'
        });
    }
});

// Delete Feedback route
app.post('/delete-feedback/:id', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'Please login first',
            title: 'Authentication Required'
        });
    }

    try {
        const feedback = await Feedback.findOneAndDelete({
            _id: req.params.id,
            userId: req.session.user.id
        });

        if (!feedback) {
            return res.status(404).json({
                success: false,
                message: 'Feedback not found or unauthorized',
                title: 'Error'
            });
        }

        // Get updated stats
        const remainingFeedbacks = await Feedback.find();
        const stats = remainingFeedbacks.length > 0 ? {
            total: remainingFeedbacks.length,
            average: (remainingFeedbacks.reduce((sum, f) => sum + f.rating, 0) / remainingFeedbacks.length).toFixed(1),
            positive: remainingFeedbacks.filter(f => f.rating >= 4).length
        } : null;

        res.json({
            success: true,
            message: 'Feedback deleted successfully',
            isLastFeedback: remainingFeedbacks.length === 0,
            stats
        });
    } catch (error) {
        console.error('Feedback deletion error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting feedback',
            title: 'Error'
        });
    }
});

// Contact Form Routes

// Contact Form Submission
app.post('/submit-contact', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        // Input validation
        if (!name || !email || !subject || !message) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }
        // Create new contact entry
        const newContact = new Contact({
            name,
            email,
            inquiryType: subject,
            message,
            createdAt: new Date()
        });

        await newContact.save();

        // Send confirmation email
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Contact Form Submission Received',
            html: `
        <h2>Thank you for contacting us!</h2>
        <p>Dear ${name},</p>
        <p>We have received your message regarding: ${subject}</p>
        <p>We will get back to you within 24 hours.</p>
        <br>
        <p>Best regards,</p>
        <p>Friends Cart Team</p>
    `
        };
        await transporter.sendMail(mailOptions);

        // Send success response
        res.status(200).json({
            success: true,
            message: 'Thank you! We will respond within 24 hours.'
        });

    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while processing your request.'
        });
    }
});


// Product and Cart Routes

// Add to Cart POST
// Update the add-to-cart route in server.js
// Check server.js route
app.post('/add-to-cart', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                message: 'Please login to add items to cart'
            });
        }

        const { productImage, productTitle, productPrice, quantity } = req.body;

        // Create new cart item
        const cartItem = new CartItem({
            userId: req.session.user.id,
            productImage,
            productTitle,
            productPrice,
            quantity: quantity || 1
        });

        await cartItem.save();

        res.status(200).json({
            success: true,
            message: 'Added to cart successfully'
        });
    } catch (error) {
        console.error('Add to cart error:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding to cart'
        });
    }
});

// Cart Page GET (NEW PAGE YOU REQUESTED)
// Enhanced Cart Routes

// Get Cart Items (with additional user details)
app.get('/cart', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    try {
        // Get user details
        const user = await User.findById(req.session.user.id);
        if (!user) {
            req.session.destroy();
            return res.redirect('/login');
        }

        // Get cart items
        const cartItems = await CartItem.find({ userId: req.session.user.id }).sort({ addedAt: -1 });

        // Calculate total
        let total = 0;
        cartItems.forEach(item => {
            const price = parseFloat(item.productPrice.replace(/[^0-9.-]+/g, ""));
            total += price * item.quantity;
        });

        res.render('cart', {
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                phone: user.phone,
                address: user.address
            },
            cartItems,
            total: total.toFixed(2)
        });
    } catch (error) {
        console.error('Cart Error:', error);
        res.status(500).render('error', {
            message: 'Error loading your cart',
            error: error.message
        });
    }
});

// Update Cart Item Quantity (with validation)
// Update your cart item update route:

app.post('/update-cart-item/:id', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'Please login first'
        });
    }

    try {
        const quantity = parseInt(req.body.quantity);
        const item = await CartItem.findOneAndUpdate(
            { _id: req.params.id, userId: req.session.user.id },
            { quantity: quantity },
            { new: true }
        );

        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Item not found'
            });
        }

        // Calculate new total for all items
        const cartItems = await CartItem.find({ userId: req.session.user.id });
        let total = 0;
        cartItems.forEach(cartItem => {
            const price = parseFloat(cartItem.productPrice.replace(/[^0-9.-]+/g, ""));
            total += price * cartItem.quantity;
        });

        // Calculate item total
        const itemPrice = parseFloat(item.productPrice.replace(/[^0-9.-]+/g, ""));
        const itemTotal = itemPrice * quantity;

        res.json({
            success: true,
            message: 'Quantity updated',
            itemTotal: itemTotal,
            total: total.toFixed(2)
        });
    } catch (error) {
        console.error('Update quantity error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating quantity'
        });
    }
});

// Remove Cart Item (with enhanced response)
app.post('/remove-cart-item/:id', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'Please login first'
        });
    }

    try {
        const item = await CartItem.findOneAndDelete({
            _id: req.params.id,
            userId: req.session.user.id
        });

        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in cart'
            });
        }

        // Calculate new total and remaining items
        const cartItems = await CartItem.find({ userId: req.session.user.id });
        let total = 0;
        cartItems.forEach(cartItem => {
            const price = parseFloat(cartItem.productPrice.replace(/[^0-9.-]+/g, ""));
            total += price * cartItem.quantity;
        });

        res.json({
            success: true,
            message: 'Item removed from cart',
            total: total.toFixed(2),
            isCartEmpty: cartItems.length === 0,
            cartItems // Send back the updated cart items
        });
    } catch (error) {
        console.error('Remove Cart Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error removing item from cart'
        });
    }
});

// Clear Cart (new route)
app.post('/clear-cart', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'Please login first'
        });
    }

    try {
        await CartItem.deleteMany({ userId: req.session.user.id });

        res.json({
            success: true,
            message: 'Cart cleared successfully'
        });
    } catch (error) {
        console.error('Clear Cart Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error clearing cart'
        });
    }
});
// Add this new route for buying single items
// In your server.js, update the buy-single-item route
app.post('/buy-single-item/:id', async (req, res) => {
    try {
        const cartItem = await CartItem.findById(req.params.id);
        if (!cartItem) return res.status(404).json({ error: 'Item not found' });

        // Create order
        const order = new Order({
            userId: req.session.user.id,
            items: [{
                productImage: cartItem.productImage,
                productTitle: cartItem.productTitle,
                productPrice: cartItem.productPrice,
                quantity: cartItem.quantity
            }],
            totalAmount: cartItem.productPrice,
            shippingAddress: req.session.user.address,
            contactNumber: req.session.user.phone
        });

        await order.save();
        await CartItem.findByIdAndDelete(req.params.id);

        res.json({ success: true, orderId: order._id });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
// Route to get cart data for AJAX requests
app.get('/cart-data', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Please login first' });
    }

    try {
        const cartItems = await CartItem.find({ userId: req.session.user.id }).sort({ addedAt: -1 });

        // Calculate total
        let total = 0;
        cartItems.forEach(item => {
            const price = parseFloat(item.productPrice.replace(/[^0-9.-]+/g, ""));
            total += price * item.quantity;
        });

        res.json({
            success: true,
            cartItems,
            total: total.toFixed(2)
        });
    } catch (error) {
        console.error('Cart Data Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching cart data'
        });
    }
});

// Checkout POST
app.post('/checkout', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).send('Unauthorized');
    }

    try {
        // Get cart items
        const cartItems = await CartItem.find({ userId: req.session.user.id });

        if (cartItems.length === 0) {
            return res.status(400).send('Cart is empty');
        }

        // Calculate total
        let total = 0;
        const itemsForOrder = cartItems.map(item => {
            const price = parseFloat(item.productPrice.replace(/[^0-9.-]+/g, ""));
            total += price * item.quantity;

            return {
                productImage: item.productImage,
                productTitle: item.productTitle,
                productPrice: item.productPrice,
                quantity: item.quantity
            };
        });

        // Create order
        const newOrder = new Order({
            userId: req.session.user.id,
            items: itemsForOrder,
            totalAmount: `₹${total.toFixed(2)}`,
            shippingAddress: req.session.user.address,
            contactNumber: req.session.user.phone
        });

        await newOrder.save();

        // Clear cart
        await CartItem.deleteMany({ userId: req.session.user.id });

        // Redirect to order confirmation (you can create this page)
        res.redirect(`/order-confirmation/${newOrder._id}`);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error processing checkout');
    }
});

// Order Confirmation GET
app.get('/order-confirmation/:id', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    try {
        const order = await Order.findOne({
            _id: req.params.id,
            userId: req.session.user.id
        });

        if (!order) {
            return res.status(404).send('Order not found');
        }

        res.render('order_confirmation', {
            user: req.session.user,
            order
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading order confirmation');
    }
});
// Update profile route
app.post('/update-profile', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Please login first' });
    }

    try {
        const { fullName, email, phone, address } = req.body;

        // Validate input
        if (!fullName || !email || !phone || !address) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Update user
        const updatedUser = await User.findByIdAndUpdate(
            req.session.user.id,
            { fullName, email, phone, address },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update session
        req.session.user = {
            id: updatedUser._id,
            fullName: updatedUser.fullName,
            email: updatedUser.email,
            phone: updatedUser.phone,
            address: updatedUser.address
        };

        res.json({
            success: true,
            message: 'Profile updated successfully'
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating profile'
        });
    }
});

// Buy Now (direct purchase without cart)
app.post('/buy-now', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).send('Unauthorized');
    }

    try {
        const { productImage, productTitle, productPrice, quantity, roomId } = req.body;

        // Create order directly
        const price = parseFloat(productPrice.replace(/[^0-9.-]+/g, ""));
        const total = price * (quantity || 1);

        const newOrder = new Order({
            userId: req.session.user.id,
            items: [{
                productImage,
                productTitle,
                productPrice,
                quantity: quantity || 1
            }],
            totalAmount: `₹${total.toFixed(2)}`,
            shippingAddress: req.session.user.address,
            contactNumber: req.session.user.phone,
            roomId: roomId || null   // ✅ store it in the order if you like

        });

        await newOrder.save();

        res.redirect(`/order-confirmation/${newOrder._id}`);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error processing purchase');
    }
});

app.get('/order-confirmation/:id', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');

    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).send('Order not found');

        res.render('order_confirmation', { order, roomId: order.roomId }); // ✅ add roomId!
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});


// creating room
app.post('/create-room', async (req, res) => {
    if (!req.session.user) return res.status(401).send('Login required');

    const { emails } = req.body;
    if (!emails || !Array.isArray(emails)) return res.status(400).send('Invalid input');

    const roomId = uuidv4();
    const roomLink = `${req.protocol}://${req.get('host')}/room/${roomId}`;

    await Room.create({
        roomId,
        participants: [...emails, req.session.user.email],
        createdBy: req.session.user.id
    });

    for (const email of emails) {
        if (email !== req.session.user.email) {
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'You’ve been invited to Friends Cart room!',
                html: `<p>Click to join: <a href="${roomLink}">${roomLink}</a></p>`
            });
        }
    }

    res.json({ success: true, roomLink });
});

app.post('/shop-together/invite', async (req, res) => {
    const { emails } = req.body;
    const emailList = emails.split(',').map(e => e.trim().toLowerCase());

    // ✅ Include the creator's email
    if (!req.session.user || !req.session.user.email) {
        return res.status(401).send('User not logged in');
    }
    const allEmails = [...new Set([req.session.user.email.toLowerCase(), ...emailList])];

    // ✅ Create roomId from usernames
    const usernames = allEmails.map(email => email.split('@')[0]);
    const roomId = usernames.sort().join('-');  // e.g., "ashok-jane-john"

    // ✅ Check if a room with the same participants already exists
    const existingRoom = await Room.findOne({
        participants: { $all: allEmails, $size: allEmails.length },
        roomId // use same name if already present
    });

    if (existingRoom) {
        return res.redirect(`/room/${existingRoom.roomId}`);
    }

    const room = new Room({
        roomId,
        participants: allEmails,
        createdBy: req.session.user.email,
        activityLog: [],
        ended: false
    });

    await room.save();

    // ✅ Send invites to others
    emailList.forEach(email => {
        if (email !== req.session.user.email) {
            sendEmail(
                email,
                `Join our shop room: ${req.protocol}://${req.get('host')}/room/${roomId}`
            );
        }
    });

    res.redirect(`/room/${roomId}`);
});


app.get('/shop-together', async (req, res) => {
    const rooms = await Room.find({
        participants: req.session.user.email
    }).sort({ createdAt: -1 });
    res.render('shop-together', {
        rooms,
        userEmail: req.session.user.email // ✅ pass userEmail to EJS
    });
});


app.get('/room/:roomId', async (req, res) => {
    const room = await Room.findOne({ roomId: req.params.roomId });
    const user = await User.findOne({ roomId: req.params.roomId });
    if (!room) {
        return res.status(404).send('Room not found');
    }

    res.render('room', { room });
});

app.get("/video/:roomId", async (req, res) => {
    const roomID = req.params.roomId;
    // console.log(roomID);
    const user = req.session.user;

    console.log(user);
    const userID = user.id;
    const userName = user.fullName;
    const appID = "679839770"; // replace with your actual AppID
    const serverSecret = "aaa413ce9c8721cb9e93a2ba6ae6465a"; // only in dev, move to token gen in prod

    res.render("video-call", { roomID, userID, userName, appID, serverSecret });
});

app.post('/room/:roomId/end', async (req, res) => {
    const room = await Room.findOne({ roomId: req.params.roomId });
    room.ended = true;
    await room.save();
    res.redirect('/shop-together');
});


app.post('/room/:roomId/message', async (req, res) => {
    const { roomId } = req.params;
    const { content } = req.body;

    const room = await Room.findOne({ roomId });
    const newMessage = {
        type: 'message',
        sender: req.session.user.email,
        content,
        timestamp: new Date()
    };

    room.activityLog.push(newMessage);
    await room.save();

    // Emit to all in room
    const messageHtml = `<div><strong>${newMessage.sender}:</strong> ${newMessage.content}</div>`;
    io.to(roomId).emit('new-activity', { html: messageHtml });

    res.redirect(`/room/${roomId}`);
});

app.post('/room/:roomId/share', async (req, res) => {
    const room = await Room.findOne({ roomId: req.params.roomId });
    room.activityLog.push({
        type: 'product',
        sharedBy: req.session.user.email,
        title: req.body.title,
        image: req.body.image,
        price: req.body.price
    });
    await room.save();

    const productHtml = `
        <div><strong>${product.sharedBy} shared a product:</strong>
        <div><img src="${product.image}" width="100"><p>${product.title}</p><p>₹${product.price}</p></div>
        </div>`;
    io.to(roomId).emit('new-activity', { html: productHtml });

    res.redirect(`/room/${req.params.roomId}`);
});

app.post('/room/react', async (req, res) => {
    const { roomId, activityId, emoji } = req.body;
    const userEmail = req.session.user?.email;
    if (!userEmail) return res.status(401).send('Unauthorized');

    const room = await Room.findOne({ roomId });
    const activity = room.activityLog.id(activityId);

    // Check if user already reacted with same emoji
    const existing = activity.reactions.find(r => r.emoji === emoji && r.by === userEmail);
    if (existing) {
        // Remove if exists (toggle)
        activity.reactions = activity.reactions.filter(r => !(r.emoji === emoji && r.by === userEmail));
    } else {
        activity.reactions.push({ emoji, by: userEmail });
    }

    await room.save();

    // Notify others
    io.to(roomId).emit('reaction-updated', {
        activityId,
        reactions: activity.reactions
    });

    res.sendStatus(200);
});


app.get('/room/:roomId', async (req, res) => {
    const room = await Room.findOne({ roomId: req.params.roomId });

    if (!room) {
        return res.status(404).send('Room not found');
    }

    res.render('room', { room });
});

app.get('/shop-together/share', async (req, res) => {
    const email = req.session.user?.email;
    if (!email) return res.redirect('/login');

    const rooms = await Room.find({ participants: email });

    res.render('shop-together-share', { rooms });
});

app.post('/shop-together/share', async (req, res) => {
    const { roomIds, image, title, price, detail } = req.body;
    const sharedBy = req.session.user.email;

    try {
        const activity = {
            type: 'product',
            title,
            image,
            price,
            detail,
            sharedBy
        };

        for (const roomId of Array.isArray(roomIds) ? roomIds : [roomIds]) {
            const room = await Room.findOne({ roomId });
            if (room) {
                room.activityLog.push(activity);
                await room.save();

                io.to(roomId).emit('new-activity', {
                    html: `
        <div class="product-item"
          data-title="${title}"
          data-price="${price}"
          data-image="/${image}"
          data-detail="${detail || ''}"
          data-sharedby="${sharedBy}">
          <div class="item-image-container">
            <img src="/${image}" alt="Product Image" class="item-image" width="200" height="300">
          </div>
          <div class="item-info">
            <h3 class="item-name">${title}</h3>
            <p class="item-price">${price}</p>
            ${detail ? `<p class="item-detail">${detail}</p>` : ''}
            <span class="item-detail">Shared by ${sharedBy}</span>
          </div>
        </div>
      `
                });
            }
        }


        res.redirect('/shop-together');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error sharing product");
    }
});

// 404 Route (Keep this as the last route)
app.use((req, res) => {
    res.status(404).render('404');
});


// Start server
const PORT = process.env.PORT || 3000;

// Socket.io logic
io.on('connection', (socket) => {
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`User joined room ${roomId}`);
    });
});



http.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});