import { Server } from 'socket.io';
import http from 'http';
import GameSocketHandler from './game.socket.js';

/**
 * SOCKET.IO SERVER SETUP AND CONFIGURATION
 * 
 * This file sets up the Socket.IO server for real-time communication
 * in your competitive Wordle game. It handles:
 * - Socket server initialization
 * - CORS configuration for frontend connections
 * - Connection authentication and validation
 * - Game socket handler integration
 * - Error handling and logging
 * 
 * Socket.IO is a library that enables real-time, bidirectional communication
 * between web clients and servers. It's perfect for multiplayer games!
 */

class SocketServer {
    constructor(app) {
        this.app = app;
        this.server = null;
        this.io = null;
        this.gameHandler = null;
        
        this.initializeSocketServer();
    }

    /**
     * Initialize Socket.IO server
     * This creates the HTTP server and Socket.IO instance
     */
    initializeSocketServer() {
        // Create HTTP server from Express app
        this.server = http.createServer(this.app);
        
        // Initialize Socket.IO with configuration
        this.io = new Server(this.server, {
            // CORS configuration - allows frontend to connect
            cors: {
                origin: function (origin, callback) {
                    // Allow requests with no origin or all origins
                    if (!origin) return callback(null, true);
                    // Allow all origins for now
                    callback(null, true);
                },
                methods: ["GET", "POST"],
                credentials: true
            },
            
            // Connection settings
            pingTimeout: 60000,    // 60 seconds - how long to wait for pong
            pingInterval: 25000,   // 25 seconds - how often to ping client
            
            // Transport settings
            transports: ['websocket', 'polling'], // Allow both WebSocket and HTTP polling
            
            // Security settings
            allowEIO3: true,       // Allow Engine.IO v3 clients
            
            // Logging
            logLevel: 'info'       // Log level for debugging
        });

        // Setup connection handling
        this.setupConnectionHandlers();
        
        // Initialize game handler
        this.gameHandler = new GameSocketHandler(this.io);
        
        console.log('🚀 Socket.IO server initialized');
    }

    /**
     * Setup connection event handlers
     * This handles when clients connect/disconnect
     */
    setupConnectionHandlers() {
        // Handle new connections
        this.io.on('connection', (socket) => {
            console.log(`🔌 New client connected: ${socket.id}`);
            
            // Log connection details
            this.logConnectionDetails(socket);
            
            // Handle authentication (optional but recommended)
            this.handleAuthentication(socket);
            
            // Handle disconnection
            socket.on('disconnect', (reason) => {
                console.log(`🔌 Client disconnected: ${socket.id}, reason: ${reason}`);
                this.handleDisconnection(socket, reason);
            });
            
            // Handle connection errors
            socket.on('error', (error) => {
                console.error(`❌ Socket error for ${socket.id}:`, error);
            });
        });

        // Handle server errors
        this.io.engine.on('connection_error', (err) => {
            console.error('❌ Socket.IO connection error:', err);
        });
    }

    /**
     * Handle client authentication
     * This is where you can validate JWT tokens or session data
     * @param {Object} socket - Socket instance
     */
    handleAuthentication(socket) {
        // Listen for authentication event
        socket.on('authenticate', async (data) => {
            try {
                const { token, playerId } = data;
                
                // Here you would validate the JWT token
                // For now, we'll just store the playerId
                if (playerId) {
                    socket.playerId = playerId;
                    socket.authenticated = true;
                    
                    socket.emit('authenticated', {
                        success: true,
                        message: 'Authentication successful',
                        playerId: playerId
                    });
                    
                    console.log(`✅ Player authenticated: ${playerId}`);
                } else {
                    socket.emit('authentication-failed', {
                        success: false,
                        message: 'Invalid authentication data'
                    });
                }
            } catch (error) {
                console.error('Authentication error:', error);
                socket.emit('authentication-failed', {
                    success: false,
                    message: 'Authentication failed'
                });
            }
        });
    }

    /**
     * Handle client disconnection
     * Clean up any game state or room memberships
     * @param {Object} socket - Socket instance
     * @param {string} reason - Disconnection reason
     */
    handleDisconnection(socket, reason) {
        // Clean up any active game sessions
        if (socket.playerId) {
            console.log(`🧹 Cleaning up for player: ${socket.playerId}`);
            // The game handler will handle room cleanup
        }
        
        // Log disconnection reason for debugging
        const commonReasons = {
            'client namespace disconnect': 'Client manually disconnected',
            'server namespace disconnect': 'Server disconnected client',
            'ping timeout': 'Client stopped responding to pings',
            'transport close': 'Transport connection closed',
            'transport error': 'Transport error occurred'
        };
        
        const reasonText = commonReasons[reason] || reason;
        console.log(`📝 Disconnection reason: ${reasonText}`);
    }

    /**
     * Log detailed connection information
     * @param {Object} socket - Socket instance
     */
    logConnectionDetails(socket) {
        const details = {
            socketId: socket.id,
            transport: socket.conn.transport.name,
            remoteAddress: socket.handshake.address,
            userAgent: socket.handshake.headers['user-agent'],
            timestamp: new Date().toISOString()
        };
        
        console.log('📊 Connection details:', details);
    }

    /**
     * Get server instance
     * @returns {Object} HTTP server instance
     */
    getServer() {
        return this.server;
    }

    /**
     * Get Socket.IO instance
     * @returns {Object} Socket.IO instance
     */
    getIO() {
        return this.io;
    }

    /**
     * Get game handler instance
     * @returns {Object} Game socket handler
     */
    getGameHandler() {
        return this.gameHandler;
    }

    /**
     * Start the socket server
     * @param {number} port - Port to listen on
     * @param {Function} callback - Callback function
     */
    start(port, callback) {
        this.server.listen(port, () => {
            console.log(`🎮 Socket server running on port ${port}`);
            console.log(`🌐 WebSocket URL: ws://localhost:${port}`);
            console.log(`📡 Polling URL: http://localhost:${port}/socket.io/`);
            
            if (callback) callback();
        });
    }

    /**
     * Gracefully shutdown the server
     */
    async shutdown() {
        console.log('🛑 Shutting down socket server...');
        
        // Close all socket connections
        this.io.close(() => {
            console.log('✅ Socket.IO server closed');
        });
        
        // Close HTTP server
        this.server.close(() => {
            console.log('✅ HTTP server closed');
        });
    }

    /**
     * Get server statistics
     * @returns {Object} Server statistics
     */
    getStats() {
        return {
            connectedClients: this.io.engine.clientsCount,
            totalConnections: this.io.engine.clientsCount,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            activeRooms: this.gameHandler ? this.gameHandler.activeGames.size : 0
        };
    }

    /**
     * Broadcast message to all connected clients
     * @param {string} event - Event name
     * @param {Object} data - Data to send
     */
    broadcast(event, data) {
        this.io.emit(event, data);
    }

    /**
     * Send message to specific room
     * @param {string} roomId - Room ID
     * @param {string} event - Event name
     * @param {Object} data - Data to send
     */
    sendToRoom(roomId, event, data) {
        this.io.to(roomId).emit(event, data);
    }

    /**
     * Send message to specific client
     * @param {string} socketId - Socket ID
     * @param {string} event - Event name
     * @param {Object} data - Data to send
     */
    sendToClient(socketId, event, data) {
        this.io.to(socketId).emit(event, data);
    }
}

/**
 * SOCKET EVENTS REFERENCE
 * 
 * CLIENT TO SERVER EVENTS (what frontend sends):
 * 
 * Authentication:
 * - 'authenticate' - Send JWT token for authentication
 * 
 * Room Management:
 * - 'join-room' - Join a game room
 * - 'leave-room' - Leave a game room
 * 
 * Game Management:
 * - 'start-game' - Start a new game (room owner only)
 * - 'submit-word' - Submit a word guess
 * - 'get-game-state' - Get current game state
 * - 'get-leaderboard' - Get current leaderboard
 * 
 * SERVER TO CLIENT EVENTS (what backend sends):
 * 
 * Authentication:
 * - 'authenticated' - Authentication successful
 * - 'authentication-failed' - Authentication failed
 * 
 * Room Management:
 * - 'room-joined' - Successfully joined room
 * - 'player-joined' - Another player joined
 * - 'player-left' - A player left
 * - 'player-disconnected' - A player disconnected
 * 
 * Game Management:
 * - 'game-started' - Game has started
 * - 'game-ended' - Game has ended
 * - 'round-ended' - Current round ended
 * - 'word-solved' - A player solved the word
 * - 'word-feedback' - Feedback for word guess
 * - 'player-failed' - Player used all attempts
 * - 'timer-update' - Round timer update
 * - 'leaderboard' - Current leaderboard
 * - 'game-state' - Current game state
 * 
 * Error Handling:
 * - 'error' - Error message
 */

export default SocketServer;
