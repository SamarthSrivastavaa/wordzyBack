
import mongoose, {Schema} from "mongoose";

const gameSchema=new Schema({
    round:{
        type:String,
        required:true
    },
    state:{
        type:String,
        required:true
    },
    scores:{
        type:Array,
        required:true
    }

})

const Game=mongoose.model("Game",gameSchema);
export default Game;