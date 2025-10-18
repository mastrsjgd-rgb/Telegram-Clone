const User = require("../models/User");
const ReqError = require("../utilities/ReqError");
const jwt = require("jsonwebtoken");
const catchAsyncError = require("../utilities/catchAsyncError");

const signToken = (user) => {
  const secret = process.env.JWT_SECRET_KEY || process.env.JWT_SECRET;
  
  if (!secret) {
    throw new Error("JWT secret is not configured. Please check your .env file.");
  }
  
  return jwt.sign({ id: user._id }, secret, {
    expiresIn: `${process.env.JWT_EXPIRES_IN || 90}d`,
  });
};

const assignTokenToCookie = (user, res, statusCode, message) => {
  const token = signToken(user);

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: new Date(
      Date.now() + parseInt(process.env.JWT_EXPIRES_IN || 90) * 24 * 60 * 60 * 1000
    ),
  };

  res.cookie("telegramToken", token, cookieOptions);
  res.cookie("userId", user._id);

  user.password = undefined;

  res.status(statusCode).json({
    status: "success",
    message: message || "تم العملية بنجاح",
    data: {
      token,
      user,
    },
  });
};

exports.login = catchAsyncError(async (req, res, next) => {
  // Takes in username and password
  const { username, password } = req.body;

  // If there's no details given
  if (!username || !password) {
    return next(new ReqError(400, "الرجاء إدخال اسم المستخدم وكلمة المرور"));
  }

  const foundUser = await User.findOne({ username });

  //   If username does not exist
  if (!foundUser) {
    return next(new ReqError(400, "اسم المستخدم أو كلمة المرور غير صحيحة"));
  }

  const passwordGivenCorrect = await foundUser.checkPasswordValidity(
    password,
    foundUser.password
  );

  //   If given password is incorrect
  if (!passwordGivenCorrect) {
    return next(new ReqError(400, "اسم المستخدم أو كلمة المرور غير صحيحة"));
  }

  assignTokenToCookie(foundUser, res, 200, "تم تسجيل الدخول بنجاح");
});

exports.register = catchAsyncError(async (req, res, next) => {
  try {
    const newUser = await User.create(req.body);
    assignTokenToCookie(newUser, res, 201, "تم إنشاء الحساب بنجاح");
  } catch (error) {
    // Handle duplicate username error
    if (error.code === 11000 && error.keyPattern && error.keyPattern.username) {
      return next(new ReqError(400, "اسم المستخدم موجود بالفعل، الرجاء اختيار اسم آخر"));
    }
    
    // Handle other validation errors
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map(err => err.message);
      return next(new ReqError(400, messages.join(". ")));
    }
    
    // Pass other errors to error handler
    return next(error);
  }
});
