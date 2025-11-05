import app from "./app.js";
import connectDB from "./db/db.js";
import dotenv from "dotenv";
import SocketServer from "./sockets/index.js";

dotenv.config();

const port = process.env.PORT || 8000;

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Promise Rejection:', err);
    // Don't exit in production, just log the error
    if (process.env.NODE_ENV === 'production') {
        console.error('Error logged, continuing...');
    } else {
        process.exit(1);
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    process.exit(0);
});

// Connect to database and start server
connectDB()
    .then(() => {
        try {
            // Initialize Socket.IO server
            const socketServer = new SocketServer(app);
            const server = socketServer.getServer();
            
            // Start server with Socket.IO
            server.listen(port, '0.0.0.0', () => {
                console.log(`🚀 Server is listening at port: ${port}`);
                console.log(`🎮 Socket.IO server ready`);
                console.log(`📡 Health check available at: http://localhost:${port}/health`);
            });
            
            // Handle server errors
            server.on('error', (err) => {
                console.error('❌ Server error:', err);
                process.exit(1);
            });
        } catch (error) {
            console.error("❌ Server failed to start:", error);
            process.exit(1);
        }
    })
    .catch((error) => {
        console.error("❌ Failed to connect to database:", error.message);
        console.error("Server cannot start without database connection.");
        process.exit(1);
    });
