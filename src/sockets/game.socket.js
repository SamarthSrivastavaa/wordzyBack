import { Server } from 'socket.io'; // eslint-disable-line no-unused-vars
import mongoose from 'mongoose';
import wordService from '../services/wordService.js';
import Room from '../models/room.model.js';
import Player from '../models/player.model.js';
import Game from '../models/game.model.js';

/**
 * GAME SOCKET HANDLER - Real-time competitive Wordle game logic
 * 
 * This file handles all real-time game events using Socket.IO:
 * - Room management (join/leave rooms)
 * - Game state management (start/pause/end games)
 * - Word submission and validation
 * - Real-time scoring and leaderboards
 * - Round progression and timing
 * 
 * Socket Events Explained:
 * - 'join-room': Player joins a game room
 * - 'leave-room': Player leaves a game room
 * - 'start-game': Room owner starts the game
 * - 'submit-word': Player submits a word guess
 * - 'get-game-state': Get current game state
 * - 'get-leaderboard': Get current scores
 */

class GameSocketHandler {
    constructor(io) {
        this.io = io;
        this.activeGames = new Map(); // Store active game states in memory
        this.playerSockets = new Map(); // Map player IDs to socket IDs
        this.roomSockets = new Map(); // Map room IDs to socket IDs
        
        this.setupEventHandlers();
    }

    /**
     * Setup all socket event handlers
     * This is where we define what happens when clients emit events
     */
    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`🔌 Player connected: ${socket.id}`);

            // ===== ROOM MANAGEMENT EVENTS =====
            
            /**
             * JOIN ROOM EVENT
             * When a player wants to join a game room
             * 
             * Expected data: { roomId, playerId, username }
             * Response: Success/error + updated room state
             */
            socket.on('join-room', async (data) => {
                try {
                    const { roomId, playerId, username } = data;
                    
                    // Validate input
                    if (!roomId || !playerId || !username) {
                        socket.emit('error', { message: 'Missing required data' });
                        return;
                    }

                    // Check if room exists (by roomId string, not MongoDB _id)
                    const room = await Room.findOne({ roomId }).populate('players');
                    if (!room) {
                        socket.emit('error', { message: 'Room not found' });
                        return;
                    }

                    // Check if room is full (max 7 players)
                    if (room.players.length >= 7) {
                        socket.emit('error', { message: 'Room is full (maximum 7 players)' });
                        return;
                    }

                    // Check if player is already in room
                    const playerExists = room.players.some(p => p._id.toString() === playerId);
                    if (!playerExists) {
                        // Add player to room
                        room.players.push(playerId);
                        await room.save();
                    }

                    // Join socket to room
                    socket.join(roomId);
                    
                    // Store player socket mapping
                    this.playerSockets.set(playerId, socket.id);
                    
                    // Store room socket mapping
                    if (!this.roomSockets.has(roomId)) {
                        this.roomSockets.set(roomId, new Set());
                    }
                    this.roomSockets.get(roomId).add(socket.id);

                    // Get updated room data
                    const updatedRoom = await Room.findOne({ roomId })
                        .populate('players', 'username gamesPlayed gamesWon winRate')
                        .populate('owner', 'username');

                    // Notify all players in room about new player
                    this.io.to(roomId).emit('player-joined', {
                        player: { _id: playerId, username },
                        room: updatedRoom,
                        message: `${username} joined the room`
                    });

                    // Send current room state to the joining player
                    socket.emit('room-joined', {
                        room: updatedRoom,
                        message: 'Successfully joined room'
                    });

                    console.log(`👤 ${username} joined room ${roomId}`);

                } catch (error) {
                    console.error('Join room error:', error);
                    socket.emit('error', { message: 'Failed to join room' });
                }
            });

            /**
             * LEAVE ROOM EVENT
             * When a player wants to leave a game room
             */
            socket.on('leave-room', async (data) => {
                try {
                    const { roomId, playerId } = data;
                    
                    // Get room with populated players
                    const room = await Room.findOne({ roomId })
                        .populate('players', 'username _id')
                        .populate('owner', 'username _id')
                        .lean();
                    
                    if (!room) {
                        socket.emit('error', { message: 'Room not found' });
                        return;
                    }

                    const isOwner = room.owner._id.toString() === playerId;
                    const remainingPlayers = room.players.filter(p => p._id.toString() !== playerId);

                    // Remove player from room
                    const roomDoc = await Room.findOne({ roomId });
                    if (roomDoc) {
                        roomDoc.players = roomDoc.players.filter(p => p.toString() !== playerId);
                        
                        // If owner left, assign new owner randomly
                        if (isOwner && remainingPlayers.length > 0) {
                            const newOwnerIndex = Math.floor(Math.random() * remainingPlayers.length);
                            const newOwnerId = remainingPlayers[newOwnerIndex]._id;
                            roomDoc.owner = newOwnerId;
                            
                            // Notify all players about new owner
                            this.io.to(roomId).emit('owner-changed', {
                                newOwnerId: newOwnerId.toString(),
                                newOwnerUsername: remainingPlayers[newOwnerIndex].username,
                                message: `${remainingPlayers[newOwnerIndex].username} is now the room owner`
                            });
                        }
                        
                        // If room is empty, delete it and clean up game state
                        if (roomDoc.players.length === 0) {
                            await Room.deleteOne({ roomId });
                            this.activeGames.delete(roomId);
                            console.log(`🗑️ Room ${roomId} deleted - no players remaining`);
                        } else {
                            await roomDoc.save();
                        }
                    }

                    // Leave socket room
                    socket.leave(roomId);
                    
                    // Remove from mappings
                    this.playerSockets.delete(playerId);
                    if (this.roomSockets.has(roomId)) {
                        this.roomSockets.get(roomId).delete(socket.id);
                    }

                    // If room was deleted, notify player
                    if (remainingPlayers.length === 0) {
                        socket.emit('room-disbanded', {
                            message: 'Room has been disbanded'
                        });
                        return;
                    }

                    // Notify other players with updated room
                    const updatedRoom = await Room.findOne({ roomId })
                        .populate('players', 'username gamesPlayed gamesWon winRate _id')
                        .populate('owner', 'username _id')
                        .lean();
                    
                    if (updatedRoom) {
                        this.io.to(roomId).emit('player-left', {
                            playerId,
                            room: updatedRoom,
                            isOwner: isOwner,
                            message: 'Player left the room'
                        });
                        
                        console.log(`📢 Notified players in room ${roomId} about player leaving. Remaining: ${updatedRoom.players.length}`);
                    }

                    console.log(`👋 Player left room ${roomId}`);

                } catch (error) {
                    console.error('Leave room error:', error);
                    socket.emit('error', { message: 'Failed to leave room' });
                }
            });

            // ===== GAME MANAGEMENT EVENTS =====

            /**
             * START GAME EVENT
             * Only room owner can start the game
             * Single round competitive Wordle
             * 
             * Expected data: { roomId, playerId, category }
             */
            socket.on('start-game', async (data) => {
                try {
                    const { roomId, playerId, category = 'random' } = data;
                    
                    // Verify room ownership - populate players to get usernames
                    const room = await Room.findOne({ roomId })
                        .populate('owner', 'username')
                        .populate('players', 'username _id')
                        .lean(); // Use lean() to get plain objects
                    
                    // With lean(), owner is a plain object
                    const ownerId = room?.owner?._id ? room.owner._id.toString() : room?.owner?.toString();
                    if (!room || ownerId !== playerId) {
                        socket.emit('error', { message: 'Only room owner can start the game' });
                        return;
                    }

                    // Check minimum players (at least 2)
                    if (room.players.length < 2) {
                        socket.emit('error', { message: 'Need at least 2 players to start' });
                        return;
                    }

                    // Generate single word for the game
                    const wordObj = await wordService.getRandomWord();
                    const targetWord = wordObj.word;
                    
                    // Debug: Log room players to verify usernames are populated
                    console.log('Room players:', room.players.map(p => ({
                        _id: p._id,
                        username: p.username
                    })));
                    
                    // Create game state for single round
                    const gameState = {
                        roomId,
                        category: wordObj.category,
                        targetWord: targetWord,
                        gameStatus: 'active', // 'waiting', 'active', 'finished'
                        gameStartTime: Date.now(),
                        timeLimit: 300000, // 5 minutes
                        players: room.players.map(p => {
                            // With lean(), p should be a plain object
                            const playerIdStr = p._id ? p._id.toString() : p.toString();
                            // Username should be directly accessible with lean()
                            const username = p.username || 'Unknown';
                            
                            if (!username || username === 'Unknown') {
                                console.log(`⚠️ Warning: Username is Unknown for player ${playerIdStr}`, p);
                            }
                            
                            return {
                                playerId: playerIdStr,
                                username: username,
                                guesses: [],
                                currentGuess: '',
                                isSolved: false,
                                solveTime: null,
                                solveAttempts: null,
                                rank: null,
                                status: 'active' // 'active', 'solved', 'failed'
                            };
                        }),
                        leaderboard: []
                    };

                    // Store game state
                    this.activeGames.set(roomId, gameState);

                    // Notify all players that game started
                    this.io.to(roomId).emit('game-started', {
                        gameState: {
                            roomId: gameState.roomId,
                            category: gameState.category,
                            gameStatus: gameState.gameStatus,
                            gameStartTime: gameState.gameStartTime,
                            timeLimit: gameState.timeLimit,
                            players: gameState.players.map(p => ({
                                playerId: p.playerId,
                                username: p.username,
                                isSolved: p.isSolved,
                                status: p.status || 'active'
                            }))
                        },
                        message: `Game started! Find the word!`
                    });

                    // Start game timer
                    this.startGameTimer(roomId);

                    console.log(`🎮 Game started in room ${roomId} - Word: ${targetWord}`);

                } catch (error) {
                    console.error('Start game error:', error);
                    socket.emit('error', { message: 'Failed to start game' });
                }
            });

            /**
             * START AGAIN EVENT
             * Owner can restart the game in the same room
             * Expected data: { roomId, playerId, category }
             */
            socket.on('start-again', async (data) => {
                try {
                    const { roomId, playerId } = data;
                    
                    // Verify room ownership - populate players to get usernames
                    const room = await Room.findOne({ roomId })
                        .populate('owner', 'username _id')
                        .populate('players', 'username _id')
                        .lean();
                    
                    const ownerId = room?.owner?._id ? room.owner._id.toString() : room?.owner?.toString();
                    if (!room || ownerId !== playerId) {
                        socket.emit('error', { message: 'Only room owner can start a new game' });
                        return;
                    }

                    // Check minimum players (at least 2)
                    if (room.players.length < 2) {
                        socket.emit('error', { message: 'Need at least 2 players to start' });
                        return;
                    }

                    // Clear previous game state
                    this.activeGames.delete(roomId);

                    // Generate new word for the game
                    const wordObj = await wordService.getRandomWord();
                    const targetWord = wordObj.word;
                    
                    // Create new game state
                    const gameState = {
                        roomId,
                        category: wordObj.category,
                        targetWord: targetWord,
                        gameStatus: 'active',
                        gameStartTime: Date.now(),
                        timeLimit: 300000, // 5 minutes
                        players: room.players.map(p => {
                            const playerIdStr = p._id ? p._id.toString() : p.toString();
                            const username = p.username || 'Unknown';
                            
                            return {
                                playerId: playerIdStr,
                                username: username,
                                guesses: [],
                                currentGuess: '',
                                isSolved: false,
                                solveTime: null,
                                solveAttempts: null,
                                rank: null,
                                status: 'active'
                            };
                        }),
                        leaderboard: []
                    };

                    // Store new game state
                    this.activeGames.set(roomId, gameState);

                    // Notify all players that new game started
                    this.io.to(roomId).emit('game-started', {
                        gameState: {
                            roomId: gameState.roomId,
                            category: gameState.category,
                            gameStatus: gameState.gameStatus,
                            gameStartTime: gameState.gameStartTime,
                            timeLimit: gameState.timeLimit,
                            players: gameState.players.map(p => ({
                                playerId: p.playerId,
                                username: p.username,
                                isSolved: p.isSolved,
                                status: p.status || 'active'
                            }))
                        },
                        message: `New game started! Find the word!`
                    });

                    // Start game timer
                    this.startGameTimer(roomId);

                    console.log(`🎮 New game started in room ${roomId} - Word: ${targetWord}`);

                } catch (error) {
                    console.error('Start again error:', error);
                    socket.emit('error', { message: 'Failed to start new game' });
                }
            });

            /**
             * SUBMIT WORD EVENT
             * When a player submits a word guess
             * 
             * Expected data: { roomId, playerId, word }
             */
            socket.on('submit-word', async (data) => {
                try {
                    const { roomId, playerId, word } = data;
                    
                    // Get current game state
                    const gameState = this.activeGames.get(roomId);
                    if (!gameState || gameState.gameStatus !== 'active') {
                        socket.emit('error', { message: 'No active game in this room' });
                        return;
                    }

                    // Find player in game
                    const player = gameState.players.find(p => p.playerId === playerId);
                    if (!player) {
                        socket.emit('error', { message: 'Player not in this game' });
                        return;
                    }

                    // Check if player already solved
                    if (player.isSolved) {
                        socket.emit('error', { message: 'You already solved the word!' });
                        return;
                    }

                    // Validate word length (must be 5 letters)
                    if (!word || word.length !== 5) {
                        socket.emit('error', { message: 'Word must be exactly 5 letters' });
                        return;
                    }

                    const upperWord = word.toUpperCase();

                    // Check if player used all 6 attempts
                    if (player.guesses.length >= 6) {
                        socket.emit('error', { message: 'You have used all 6 attempts' });
                        return;
                    }

                    // Add guess to player's guesses
                    player.guesses.push(upperWord);
                    player.currentGuess = upperWord;

                    // Check if word is correct
                    const isCorrect = upperWord === gameState.targetWord;
                    
                    if (isCorrect) {
                        // Player solved the word!
                        player.isSolved = true;
                        player.solveTime = Date.now() - gameState.gameStartTime;
                        player.solveAttempts = player.guesses.length;
                        player.status = 'solved';

                        // Notify all players about the solve
                        this.io.to(roomId).emit('word-solved', {
                            playerId,
                            username: player.username,
                            solveTime: player.solveTime,
                            solveAttempts: player.solveAttempts,
                            message: `${player.username} solved the word in ${player.solveAttempts} attempts!`
                        });

                        // Update leaderboard and check if game should end
                        this.updateLeaderboard(roomId);
                        this.checkGameCompletion(roomId);

                    } else {
                        // Word is incorrect - generate feedback (Wordle style)
                        const feedback = this.generateWordFeedback(upperWord, gameState.targetWord);
                        
                        // Check if player exhausted all attempts
                        if (player.guesses.length >= 6) {
                            // Player failed - exhausted all attempts
                            player.isSolved = false;
                            player.status = 'failed';
                            // Track time when they failed (when they submitted their 6th guess)
                            player.solveTime = Date.now() - gameState.gameStartTime;
                            player.solveAttempts = 6;
                            player.failedTime = Date.now() - gameState.gameStartTime;

                            // Notify all players
                            this.io.to(roomId).emit('player-failed', {
                                playerId,
                                username: player.username,
                                attempts: 6,
                                failedTime: player.failedTime,
                                message: `${player.username} used all 6 attempts`
                            });

                            // Update leaderboard and check if game should end
                            this.updateLeaderboard(roomId);
                            this.checkGameCompletion(roomId);
                        } else {
                            // Player still has attempts left
                            player.status = 'active';
                            
                            // Send feedback to player
                            socket.emit('word-feedback', {
                                word: upperWord,
                                feedback,
                                attempts: player.guesses.length,
                                remainingAttempts: 6 - player.guesses.length
                            });

                            // Notify others about the attempt (but not the word)
                            socket.to(roomId).emit('player-guess', {
                                playerId,
                                username: player.username,
                                attempts: player.guesses.length,
                                status: 'active'
                            });
                        }
                    }

                } catch (error) {
                    console.error('Submit word error:', error);
                    socket.emit('error', { message: 'Failed to submit word' });
                }
            });

            // ===== GAME STATE EVENTS =====

            /**
             * GET GAME STATE EVENT
             * Get current game state for a room
             */
            socket.on('get-game-state', (data) => {
                const { roomId } = data;
                const gameState = this.activeGames.get(roomId);
                
                if (gameState) {
                    socket.emit('game-state', gameState);
                } else {
                    socket.emit('error', { message: 'No active game found' });
                }
            });

            /**
             * GET LEADERBOARD EVENT
             * Get current leaderboard for a room
             */
            socket.on('get-leaderboard', (data) => {
                const { roomId } = data;
                const gameState = this.activeGames.get(roomId);
                
                if (gameState) {
                    socket.emit('leaderboard', gameState.leaderboard);
                } else {
                    socket.emit('error', { message: 'No active game found' });
                }
            });

            // ===== DISCONNECT HANDLING =====
            
            /**
             * DISCONNECT EVENT
             * Handle when a player disconnects
             */
            socket.on('disconnect', async () => {
                console.log(`🔌 Player disconnected: ${socket.id}`);
                
                const playerId = socket.playerId;
                if (!playerId) return;
                
                // Find rooms this player is in
                const playerRooms = [];
                for (const [roomId, socketSet] of this.roomSockets.entries()) {
                    if (socketSet.has(socket.id)) {
                        playerRooms.push(roomId);
                        socketSet.delete(socket.id);
                    }
                }
                
                // Handle player leaving each room
                for (const roomId of playerRooms) {
                    try {
                        const room = await Room.findOne({ roomId })
                            .populate('players', 'username _id')
                            .populate('owner', 'username _id')
                            .lean();
                        
                        if (!room) continue;
                        
                        const isOwner = room.owner._id.toString() === playerId;
                        const remainingPlayers = room.players.filter(p => p._id.toString() !== playerId);
                        
                        // Remove player from room
                        const roomDoc = await Room.findOne({ roomId });
                        if (roomDoc) {
                            roomDoc.players = roomDoc.players.filter(p => p.toString() !== playerId);
                            
                            // If owner disconnected, assign new owner randomly
                            if (isOwner && remainingPlayers.length > 0) {
                                const newOwnerIndex = Math.floor(Math.random() * remainingPlayers.length);
                                const newOwnerId = remainingPlayers[newOwnerIndex]._id;
                                roomDoc.owner = newOwnerId;
                                
                                // Notify all players about new owner
                                this.io.to(roomId).emit('owner-changed', {
                                    newOwnerId: newOwnerId.toString(),
                                    newOwnerUsername: remainingPlayers[newOwnerIndex].username,
                                    message: `${remainingPlayers[newOwnerIndex].username} is now the room owner`
                                });
                            }
                            
                            // If room is empty, delete it
                            if (roomDoc.players.length === 0) {
                                await Room.deleteOne({ roomId });
                                this.activeGames.delete(roomId);
                                console.log(`🗑️ Room ${roomId} deleted - no players remaining`);
                            } else {
                                await roomDoc.save();
                                
                                // Notify other players
                                const updatedRoom = await Room.findOne({ roomId })
                                    .populate('players', 'username gamesPlayed gamesWon winRate _id')
                                    .populate('owner', 'username _id')
                                    .lean();
                                
                                if (updatedRoom) {
                                    this.io.to(roomId).emit('player-disconnected', {
                                        playerId,
                                        room: updatedRoom,
                                        isOwner: isOwner,
                                        message: 'A player disconnected'
                                    });
                                    
                                    console.log(`📢 Notified players in room ${roomId} about disconnect. Remaining: ${updatedRoom.players.length}`);
                                }
                            }
                        }
                    } catch (error) {
                        console.error(`Error handling disconnect for room ${roomId}:`, error);
                    }
                }
                
                // Remove from player mapping
                this.playerSockets.delete(playerId);
            });
        });
    }

    /**
     * Start timer for the game
     * @param {string} roomId - Room ID
     */
    startGameTimer(roomId) {
        const gameState = this.activeGames.get(roomId);
        if (!gameState) return;

        // Clear existing timer if any
        if (gameState.gameTimer) {
            clearTimeout(gameState.gameTimer);
        }

        // Set timer for game completion
        gameState.gameTimer = setTimeout(() => {
            this.endGame(roomId);
        }, gameState.timeLimit);

        // Send timer updates every second
        gameState.timerInterval = setInterval(() => {
            const timeLeft = gameState.timeLimit - (Date.now() - gameState.gameStartTime);
            if (timeLeft > 0) {
                this.io.to(roomId).emit('timer-update', {
                    timeLeft: Math.max(0, timeLeft),
                    timeLimit: gameState.timeLimit
                });
            } else {
                clearInterval(gameState.timerInterval);
            }
        }, 1000);
    }

    /**
     * Check if game should end (all players solved or failed)
     * @param {string} roomId - Room ID
     */
    checkGameCompletion(roomId) {
        const gameState = this.activeGames.get(roomId);
        if (!gameState) return;

        const activePlayers = gameState.players.filter(p => 
            p.status === 'active'
        );
        
        // If all players are done (solved or failed), end game
        if (activePlayers.length === 0) {
            this.endGame(roomId);
        }
    }

    /**
     * End the game and show leaderboard
     * @param {string} roomId - Room ID
     */
    async endGame(roomId) {
        const gameState = this.activeGames.get(roomId);
        if (!gameState) return;

        // Clear timers
        if (gameState.gameTimer) clearTimeout(gameState.gameTimer);
        if (gameState.timerInterval) clearInterval(gameState.timerInterval);

        // Separate solved and failed players
        const solvedPlayers = gameState.players
            .filter(p => p.isSolved)
            .sort((a, b) => {
                // First by solve time (faster = better)
                if (a.solveTime !== b.solveTime) {
                    return a.solveTime - b.solveTime;
                }
                // Then by attempts (fewer = better)
                return a.solveAttempts - b.solveAttempts;
            });

        // Handle players who are still active when game ends (timer expired)
        const activePlayers = gameState.players.filter(p => p.status === 'active' && !p.isSolved);
        activePlayers.forEach(player => {
            player.status = 'failed';
            player.failedTime = Date.now() - gameState.gameStartTime;
            player.solveTime = player.failedTime;
            player.solveAttempts = player.guesses.length || 6;
        });

        const failedPlayers = gameState.players
            .filter(p => !p.isSolved && (p.status === 'failed' || p.guesses.length >= 6))
            .sort((a, b) => {
                // Rank failed players by time (longer time = better, since they tried longer)
                // If both failed, the one who took longer gets a better rank
                const timeA = a.failedTime || a.solveTime || (Date.now() - gameState.gameStartTime);
                const timeB = b.failedTime || b.solveTime || (Date.now() - gameState.gameStartTime);
                return timeB - timeA; // Reverse order: longer time = better rank
            });

        // Assign ranks
        solvedPlayers.forEach((player, index) => {
            player.rank = index + 1;
        });

        failedPlayers.forEach((player, index) => {
            player.rank = solvedPlayers.length + index + 1;
        });

        // Look up usernames from database if missing (fallback)
        const playerIds = [...solvedPlayers, ...failedPlayers].map(p => p.playerId);
        
        // Convert playerIds to ObjectIds for database query
        const objectIds = playerIds.map(id => {
            try {
                return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
            } catch {
                return id;
            }
        });
        
        const playerDocs = await Player.find({ _id: { $in: objectIds } }).select('username _id').lean();
        const playerUsernameMap = {};
        playerDocs.forEach(doc => {
            const idStr = doc._id.toString();
            playerUsernameMap[idStr] = doc.username;
            // Also map the playerId as-is for direct lookup
            playerIds.forEach(pid => {
                if (pid.toString() === idStr || pid === idStr) {
                    playerUsernameMap[pid] = doc.username;
                }
            });
        });

        // Build final leaderboard with all necessary info
        const leaderboard = [...solvedPlayers, ...failedPlayers].map(player => {
            // Get time (solveTime for solved, failedTime or solveTime for failed)
            const timeUsed = player.isSolved 
                ? player.solveTime 
                : (player.failedTime || player.solveTime || (Date.now() - gameState.gameStartTime));
            
            // Get username: first from player object, then from gameState, then from database lookup
            let username = player.username;
            
            // If missing, try gameState
            if (!username || username === 'Unknown') {
                const gameStatePlayer = gameState.players.find(gs => 
                    gs.playerId === player.playerId || 
                    gs.playerId?.toString() === player.playerId?.toString()
                );
                if (gameStatePlayer && gameStatePlayer.username && gameStatePlayer.username !== 'Unknown') {
                    username = gameStatePlayer.username;
                }
            }
            
            // If still missing, try database lookup
            if (!username || username === 'Unknown') {
                username = playerUsernameMap[player.playerId] || playerUsernameMap[player.playerId?.toString()] || 'Unknown';
            }
            
            // Debug: log if username is still Unknown
            if (username === 'Unknown') {
                console.log(`⚠️ Warning: Username is Unknown for playerId=${player.playerId}. Available:`, {
                    playerUsername: player.username,
                    gameStatePlayer: gameState.players.find(gs => gs.playerId === player.playerId)?.username,
                    dbLookup: playerUsernameMap[player.playerId] || playerUsernameMap[player.playerId?.toString()]
                });
            }
            
            return {
                rank: player.rank,
                playerId: player.playerId,
                username: username,
                isSolved: player.isSolved,
                status: player.status || (player.isSolved ? 'solved' : 'failed'),
                solveTime: timeUsed,
                solveAttempts: player.solveAttempts || player.guesses.length,
                timeFormatted: timeUsed ? this.formatTime(timeUsed) : '0s'
            };
        });

        gameState.gameStatus = 'finished';
        gameState.leaderboard = leaderboard;

        // Save game to database
        this.saveGameToDatabase(gameState);

        // Notify all players with complete leaderboard
        const gameEndedData = {
            leaderboard,
            targetWord: gameState.targetWord,
            message: 'Game completed! All players have finished.',
            gameState: {
                targetWord: gameState.targetWord,
                category: gameState.category
            },
            canRestart: true // Allow owner to restart
        };
        
        console.log(`🏁 Game ended in room ${roomId} - Leaderboard:`, leaderboard);
        console.log(`🔄 Sending game-ended with canRestart:`, gameEndedData.canRestart);
        
        this.io.to(roomId).emit('game-ended', gameEndedData);

        // Keep game state for 5 minutes to allow restart, then clean up
        setTimeout(() => {
            const currentState = this.activeGames.get(roomId);
            // Only delete if game is still finished (not restarted)
            if (currentState && currentState.gameStatus === 'finished') {
                this.activeGames.delete(roomId);
                console.log(`🧹 Cleaned up finished game state for room ${roomId}`);
            }
        }, 300000); // 5 minutes
    }

    /**
     * Format time in milliseconds to readable string
     * @param {number} ms - Time in milliseconds
     * @returns {string} - Formatted time string
     */
    formatTime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        
        if (minutes > 0) {
            return `${minutes}m ${remainingSeconds}s`;
        }
        return `${remainingSeconds}s`;
    }

    /**
     * Calculate score based on attempts and time
     * @param {number} attempts - Number of attempts used
     * @param {number} timeBonus - Time bonus in milliseconds
     * @returns {number} - Calculated score
     */
    calculateScore(attempts, timeBonus) {
        const baseScore = 1000;
        const attemptPenalty = (attempts - 1) * 100;
        const timeBonusPoints = Math.floor(timeBonus / 1000); // 1 point per second
        
        return Math.max(0, baseScore - attemptPenalty + timeBonusPoints);
    }

    /**
     * Generate feedback for word guess (like Wordle)
     * @param {string} guess - Player's guess
     * @param {string} target - Target word
     * @returns {Array} - Feedback array (0=wrong, 1=wrong position, 2=correct)
     */
    generateWordFeedback(guess, target) {
        const feedback = new Array(5).fill(0);
        const targetLetters = target.split('');
        const guessLetters = guess.split('');
        
        // First pass: mark correct letters
        for (let i = 0; i < 5; i++) {
            if (guessLetters[i] === targetLetters[i]) {
                feedback[i] = 2;
                targetLetters[i] = null; // Mark as used
            }
        }
        
        // Second pass: mark wrong position letters
        for (let i = 0; i < 5; i++) {
            if (feedback[i] === 0) {
                const letterIndex = targetLetters.indexOf(guessLetters[i]);
                if (letterIndex !== -1) {
                    feedback[i] = 1;
                    targetLetters[letterIndex] = null; // Mark as used
                }
            }
        }
        
        return feedback;
    }

    /**
     * Update leaderboard for current game (live updates)
     * @param {string} roomId - Room ID
     */
    updateLeaderboard(roomId) {
        const gameState = this.activeGames.get(roomId);
        if (!gameState) return;

        // Sort solved players by solve time and attempts
        const solvedPlayers = gameState.players
            .filter(p => p.isSolved)
            .sort((a, b) => {
                if (a.solveTime !== b.solveTime) {
                    return a.solveTime - b.solveTime;
                }
                return a.solveAttempts - b.solveAttempts;
            });

        const unsolvedPlayers = gameState.players.filter(p => !p.isSolved);

        // Build leaderboard with all player info
        const solved = gameState.players.filter(p => p.isSolved).sort((a, b) => {
            if (a.solveTime !== b.solveTime) return a.solveTime - b.solveTime;
            return a.solveAttempts - b.solveAttempts;
        });
        
        const failed = gameState.players.filter(p => !p.isSolved && p.status === 'failed').sort((a, b) => {
            const timeA = a.failedTime || a.solveTime || 0;
            const timeB = b.failedTime || b.solveTime || 0;
            return timeB - timeA; // Longer time = better rank for failed
        });
        
        const active = gameState.players.filter(p => p.status === 'active');
        
        const allPlayers = [...solved, ...failed, ...active];
        
        const leaderboard = allPlayers.map((player, index) => {
            let rank = null;
            if (player.isSolved) {
                rank = solved.indexOf(player) + 1;
            } else if (player.status === 'failed') {
                rank = solved.length + failed.indexOf(player) + 1;
            }
            
            const timeUsed = player.isSolved 
                ? player.solveTime 
                : (player.failedTime || player.solveTime || 0);
            
            // Get username from gameState players array (source of truth)
            let username = player.username;
            if (!username || username === 'Unknown') {
                const gameStatePlayer = gameState.players.find(gs => 
                    gs.playerId === player.playerId || 
                    gs.playerId?.toString() === player.playerId?.toString()
                );
                if (gameStatePlayer && gameStatePlayer.username && gameStatePlayer.username !== 'Unknown') {
                    username = gameStatePlayer.username;
                }
            }
            if (!username || username === 'Unknown') {
                username = 'Unknown';
            }
            
            return {
                rank: rank,
                playerId: player.playerId,
                username: username,
                isSolved: player.isSolved,
                status: player.status || 'active',
                solveTime: timeUsed,
                solveAttempts: player.solveAttempts || player.guesses.length,
                currentAttempts: player.guesses.length,
                timeFormatted: timeUsed ? this.formatTime(timeUsed) : null
            };
        });
        
        // Also include player status for all players
        const playerStatuses = gameState.players.map(player => ({
            playerId: player.playerId,
            username: player.username,
            status: player.status || 'active',
            guesses: player.guesses.length,
            isSolved: player.isSolved,
            solveTime: player.solveTime,
            solveAttempts: player.solveAttempts
        }));

        gameState.leaderboard = leaderboard;

        // Send live leaderboard update with player statuses
        this.io.to(roomId).emit('leaderboard-update', {
            leaderboard,
            playerStatuses
        });
    }

    /**
     * Save completed game to database
     * @param {Object} gameState - Game state to save
     */
    async saveGameToDatabase(gameState) {
        try {
            const game = new Game({
                round: '1',
                state: 'completed',
                scores: gameState.leaderboard,
                players: gameState.players.map(p => p.playerId),
                createdAt: new Date()
            });

            await game.save();
            console.log(`💾 Game saved to database: ${game._id}`);
        } catch (error) {
            console.error('Error saving game to database:', error);
        }
    }
}

export default GameSocketHandler;
