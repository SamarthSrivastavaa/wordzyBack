import app from "./app.js";
import connectDB from "./db/db.js";
import dotenv from "dotenv";
import SocketServer from "./sockets/index.js";

dotenv.config();

const port = process.env.PORT || 8000;

connectDB().then(() => {
    try {
        // Initialize Socket.IO server
        const socketServer = new SocketServer(app);
        const server = socketServer.getServer();
        
        // Start server with Socket.IO
        server.listen(port, () => {
            console.log(`🚀 Server is listening at port: ${port}`);
            console.log(`🎮 Socket.IO server ready`);
        });
    } catch (error) {
        console.log("Server failed");
        console.log(error);
        process.exit(1);
    }
});
