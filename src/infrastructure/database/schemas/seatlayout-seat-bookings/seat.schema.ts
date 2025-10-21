import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";




export type SeatDocument = Seat & Document



@Schema({timestamps:true})
export class Seat {

    @Prop({type:String,required:true})
    seatName:string;

    @Prop({default:false})
    isBooked:boolean

    @Prop({type:Number,required:true})
    price:number;

    @Prop({type:Types.ObjectId,ref:'Row'})
    rowId:Types.ObjectId
    
}


export const SeatSchema = SchemaFactory.createForClass(Seat)