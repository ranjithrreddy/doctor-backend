import jwt from 'jsonwebtoken'

// doctor authentication middleware
const authDoctor = async (req, res, next) => {

  try {

    // Express normalizes header names to lowercase, so this is correct.
    // If the client sent 'dToken', you access it as 'dtoken'
    const { dtoken } = req.headers

    if (!dtoken) {
      // 💡 FIX: Add 'return' to stop execution if no token is found
      return res.status(401).json({ success: false, message: 'Not Authorized, Login Again' })
    }

    const token_decode = jwt.verify(dtoken, process.env.JWT_SECRET)
    req.docId = token_decode.id

    next()

  } catch (error) {
    console.log(error)
    // 💡 Refinement: Use 401 status for authorization errors
    res.status(401).json({ success: false, message: 'Invalid token' })
  }

}

export default authDoctor