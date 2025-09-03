import app  from "./app.js";
import connectDB from "./db/db.js";
import dotenv from "dotenv"

dotenv.config();

const port=process.env.PORT || 8000;

connectDB().then(()=>{
    try {
        app.listen(port,()=>{
            console.log(`server is listening at port : ${port}`);
        })
    } catch (error) {
        console.log("server failed")
        console.log(error);
        process.exit(1)
    }
    }
)
