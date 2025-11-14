import validator from 'validator'
import bcrypt from 'bcrypt'
import userModel from '../models/userModel.js'
import jwt from 'jsonwebtoken'
import { v2 as cloudinary } from 'cloudinary'
import doctorModel from '../models/doctorModel.js'
import appointmentModel from '../models/appointmentModel.js'
import razorpay from 'razorpay'

// API to register user
const registerUser = async (req, res) => {

  try {

    const { name, email, password } = req.body

    if (!name || !password || !email) {
      return res.json({ success: false, message: 'Missing Details' })
    }

    // validating email format
    if (!validator.isEmail(email)) {
      return res.json({ success: false, message: 'Enter a valid email' })
    }

    // validating strong password
    if (password.length < 8) {
      return res.json({ success: false, message: 'enter a strong password' })
    }

    // hashing user password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    const userData = {
      name, email, password: hashedPassword
    }

    const newUser = new userModel(userData)
    const user = await newUser.save()

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET)
    res.json({ success: true, token })

  } catch (error) {
    console.log(error)
    res.json({ success: false, message: error.message })
  }

}


// API for user login
const loginUser = async (req, res) => {

  try {

    const { email, password } = req.body
    const user = await userModel.findOne({ email })

    if (!user) {
      return res.json({ success: false, message: 'User does not exist' })
    }

    const isMatch = await bcrypt.compare(password, user.password)

    if (isMatch) {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET)
      res.json({ success: true, token })
    } else {
      res.json({ success: false, message: 'Invalid Credentials' })
    }

  } catch (error) {
    console.log(error)
    res.json({ success: false, message: error.message })
  }

}


//to get the user profile
const getProfile = async (req, res) => {

  try {

    const { userId } = req
    const userData = await userModel.findById(userId).select('-password')

    res.json({ success: true, userData })

  } catch (error) {
    console.log(error)
    res.json({ success: false, message: error.message })
  }

}

//api to upafte that profile
const updateProfile = async (req, res) => {
  try {
    const { userId } = req;
    const { name, phone, address, dob, gender } = req.body;

    console.log("Attempting to update user ID:", userId);

    const imageFile = req.file;

    if (!name || !phone || !dob || !gender) {
      return res.json({ success: false, message: 'Missing required profile data.' });
    }

    let updatedUser = await userModel.findByIdAndUpdate(
      userId,
      { name, phone, address: JSON.parse(address), dob, gender },
      { new: true }
    );

    if (!updatedUser) {
      return res.json({ success: false, message: 'User not found or ID is invalid.' });
    }

    if (imageFile) {
      const imageUpload = await cloudinary.uploader.upload(imageFile.path, { resource_type: 'image' });
      const imageURL = imageUpload.secure_url;

      updatedUser = await userModel.findByIdAndUpdate(
        userId,
        { image: imageURL },
        { new: true }
      );
    }

    res.json({ success: true, message: 'Profile Updated successfully.', userData: updatedUser });

  } catch (error) {
    console.log("Error updating profile:", error);
    res.json({ success: false, message: error.message || 'An unexpected error occurred during profile update.' });
  }
}

//api for the book appointment
const bookAppointment = async (req, res) => {
  try {
    const { userId } = req;
    const { docId, slotDate, slotTime } = req.body;

    
    if (!docId || !slotDate || !slotTime) {
      return res.json({
        success:false,
        message: 'Slot required. Please select a date and time before booking.'
      });
    }

    const docData = await doctorModel.findById(docId).select('-password');

    if (!docData) {
      return res.json({ success: false, message: 'Doctor not found' });
    }

    if (!docData.available) {
      return res.json({ success: false, message: 'Doctor not available' });
    }

    let slots_booked = docData.slots_booked;

   
    if (slots_booked[slotDate]) {
      if (slots_booked[slotDate].includes(slotTime)) {
        return res.json({ success: false, message: 'Slot not available' });
      } else {
        slots_booked[slotDate].push(slotTime);
      }
    } else {
      slots_booked[slotDate] = [slotTime];
    }

    const userData = await userModel.findById(userId).select('-password');
    delete docData.slots_booked;

    const appointmentData = {
      userId,
      docId,
      userData,
      docData,
      amount: docData.fees,
      slotTime,
      slotDate,
      date: Date.now(),
    };

    const newAppointment = new appointmentModel(appointmentData);
    await newAppointment.save();

    
    await doctorModel.findByIdAndUpdate(docId, { slots_booked });

    res.json({ success: true, message: 'Appointment Booked' });

  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};


//api to get the user booked appointents in frontend 
const listAppointment = async (req, res) => {

  try {

    const userId = req.userId
    const appointments = await appointmentModel.find({ userId })

    res.json({ success: true, appointments })

  } catch (error) {
    console.log(error)
    res.json({ success: false, message: error.message })
  }

}

const cancelAppointment = async (req, res) => {

  try {

    const authenticatedUserId = req.userId
    const { appointmentId } = req.body

    if (!appointmentId) {
      return res.json({ success: false, message: 'Missing appointment ID' })
    }

    const appointmentData = await appointmentModel.findById(appointmentId)

    if (!appointmentData) {
      return res.json({ success: false, message: 'Appointment not found' })
    }

    if (appointmentData.userId.toString() !== authenticatedUserId.toString()) {
      return res.json({ success: false, message: 'Unauthorized action: User ID mismatch' })
    }

    await appointmentModel.findByIdAndUpdate(appointmentId, { cancelled: true })

    const { docId, slotDate, slotTime } = appointmentData
    const doctorData = await doctorModel.findById(docId)

    if (doctorData && doctorData.slots_booked) {
      let slots_booked = doctorData.slots_booked

      if (slots_booked[slotDate]) {
        slots_booked[slotDate] = slots_booked[slotDate].filter(e => e !== slotTime)
      }

      await doctorModel.findByIdAndUpdate(docId, { slots_booked })
    }

    res.json({ success: true, message: 'Appointment Cancelled' })

  } catch (error) {
    console.log(error)
    res.json({ success: false, message: error.message })
  }
}

const razorpayInstance = new razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET

})

const paymentRazorpay = async (req, res) => {

  try {
    const { appointmentId } = req.body
    const appointmentData = await appointmentModel.findById(appointmentId)

    if (!appointmentData || appointmentData.cancelled) {
      return res.json({ success: false, message: "Appointment Cancelled or not found" })
    }

    //options
    const options = {
      amount: appointmentData.amount * 100,
      currency: process.env.CURRENCY,
      receipt: appointmentId

    }

    //oreder create

    const order = await razorpayInstance.orders.create(options)
    res.json({ success: true, order })


  } catch (error) {
    console.log(error)
    res.json({ success: false, message: error.message })

  }




}

// API to verify payment of razorpay
const verifyRazorpay = async (req, res) => {
  try {

    const { razorpay_order_id } = req.body
    const orderInfo = await razorpayInstance.orders.fetch(razorpay_order_id)

    if (orderInfo.status === 'paid') {
      await appointmentModel.findByIdAndUpdate(orderInfo.receipt, { payment: true })
      res.json({ success: true, message: "Payment Successful" })
    } else {
     res.json({ success: false, message: "Payment Failed" })
    }
  }
  catch (error) {
    console.log(error)
    res.json({
      success: false,
      message: error.message || 'Razorpay order verification failed'
    })
  }
}



export { registerUser, loginUser, getProfile, updateProfile, bookAppointment, listAppointment, cancelAppointment, paymentRazorpay, verifyRazorpay }