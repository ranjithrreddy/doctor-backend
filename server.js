import express from 'express'
import cors from 'cors'
import  'dotenv/config'
import connectDB from './config/mongodb.js';
import connectCloudinary from './config/cloudinary.js';
import adminRouter from './routes/adminRouter.js';
import doctorRouter from './routes/doctorRouter.js';
import userRouter from './routes/userRoute.js';


const app = express();

const port = process.env.PORT || 4000
connectDB()
connectCloudinary()


app.use(express.json())
app.use(cors())

//apis
app.use('/api/admin',adminRouter)
app.use('/api/doctor', doctorRouter)
app.use('/api/user', userRouter)

app.get('/',(req,res)=>{
    res.send("api is working!")

})

app.listen(port,()=>{
    console.log("server started",port)
})