const express = require("express");
const RegAttorneyModel = require("../models/RegAttorneyModel");
const UserModel = require("../models/userModel");
const { sendMail } = require("../services/mail.services");
const router = express.Router();

router.get("/", (req, res) => res.send(" Attorney Route"));

router.post("/register", async (req, res) => {
  try {
    // De-structuring values from request body
    const {
      userID,
      registerNumber,
      phoneNumber,
      firm,
      bio,
      address,
      country,
      state,
      city,
      postalCode,
      expertise,
      jurisdiction,
      fee,
      status,
      scheduleDates,
      subdomain
    } = req.body;

    // Finding user from DB collection using unique userID
    const user = await UserModel.findOne({ _id: userID, aflag: true });

    // Execute if user found
    if (user) {
      // Creating query to register user
      const regAttorneyQuery = {
        regUser: userID,
        registerNumber: registerNumber,
        phoneNumber,
        firm,
        bio,
        address,
        country,
        state,
        city,
        postalCode,
        expertise,
        jurisdiction,
        fee,
        subdomain,
        status,
        scheduleDates,
        aflag: true,
      };

      const isAlreadyRegistered = await RegAttorneyModel.find({
        registerNumber,
      });

      if (isAlreadyRegistered.length > 0) {
        return res.json({ msg: `${registerNumber} already exists` });
      } else {
        const regAttorney = await RegAttorneyModel.create(regAttorneyQuery);

        if (regAttorney) {
          const updatedUser = await UserModel.findByIdAndUpdate(userID, {
            attorneyStatus: status,
            lastModified: Date.now(),
          });

          const mailContents = {
            to: user.email,
            subject: "Welcome! Your attorney registration with Rain Computing is now complete",
            html: `
              <div style="background-color: #F7F7F7; padding: 20px;">
                <table cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px; margin: auto; background-color: #fff; box-shadow: 0 0 10px rgba(0,0,0,0.1); border-radius: 5px; overflow: hidden; font-family: Arial, sans-serif;">
                  <tr>
                    <td style="padding: 20px;">
                      <h2 style="margin-top: 0; font-size: 24px; color: #333;">You're now an attorney with Rain Computing!</h2>
                      <p style="margin-bottom: 20px; font-size: 16px; line-height: 150%;">Hi ${user.firstname} ${user.lastname} ${user.email},</p>
                      <p style="margin-bottom: 20px; font-size: 16px; line-height: 150%;">Thank you for registering to join Rain Computing! Here are the details for your participation:</p>
                      <ul style="margin-bottom: 20px; font-size: 16px; line-height: 150%;">
                        <li>Rain Computing asks you to handle the case for the client.</li>
                        <li>Client paid for your services on Rain Computing website.</li>
                      </ul>
                      <p style="margin-bottom: 10px; font-size: 16px; line-height: 150%;">We hope to see you there!</p>
                      <a href="https://raincomputing.net" style="display: block; width: 200px; background-color: #556ee6; color:#ffffff; text-align: center; padding: 10px 0; border-radius: 5px; text-decoration: none; margin: 0 auto;">Visit our site</a>
                    </td>
                  </tr>
                </table>
              </div>
            `,
          };

          const mailSent = await sendMail(mailContents);

          if (mailSent && updatedUser) {
            return res.json({
              success: true,
              userID: updatedUser._id,
              firstname: updatedUser.firstname,
              lastname: updatedUser.lastname,
              email: updatedUser.email,
              attorneyStatus: status,
              profilePic: updatedUser.profilePic,
              aflag: true,
            });
          } else {
            return res.json({
              msg: "Registration request received. Failed to send registration email or update user status.",
            });
          }
        } else {
          return res.json({ msg: "Attorney Registration failed" });
        }
      }
    } else {
      return res.json({ msg: "User not found" });
    }
  } catch (err) {
    return res.json({ msg: err?.name || err });
  }
});

router.put("/attorneyUpdate", async (req, res) => {
  try {
    const {
      userID,
      phoneNumber,
      firm,
      bio,
      address,
      country,
      state,
      city,
      postalCode,
      expertise,
      jurisdiction,
      fee,
      subdomain,
      status,
    } = req.body;
    const data = {
      phoneNumber: phoneNumber,
      firm: firm,
      bio: bio,
      address: address,
      country: country,
      state: state,
      city: city,
      postalCode: postalCode,
      expertise: expertise,
      jurisdiction: jurisdiction,
      fee: fee,
      subdomain:subdomain,
      status: status,
    };
    const updatedAttorney = await RegAttorneyModel.findByIdAndUpdate(
      { _id: userID },
      data,
      { new: true }
    );
    return res.json({ success: true, data: updatedAttorney });
  } catch (err) {
    console.log(err);
    return res.json({ msg: err.message });
  }
});

router.post("/getByUserId", async (req, res) => {
  try {
    const { userID } = req.body;
    RegAttorneyModel.findOne({ regUser: userID })
      .populate({
        path: "regUser",
        select: "firstname lastname email profilePic",
      })
      .exec((err, isAttorney) => {
        if (err) {
          return res.json({
            msg: err,
          });
        } else {
          return res.json({
            success: true,
            attorney: isAttorney,
          });
        }
      });
  } catch (err) {
    return res.json({ msg: err });
  }
});

router.post("/getAllAttorney", async (req, res) => {
  try {
    const { attorneyID } = req.body;
    const attorneys = await RegAttorneyModel.find({
      _id: { $ne: attorneyID },
      status: "approved",
      postalCode: { $ne: null }
    })
      .populate({
        path: "regUser",
        select: "firstname lastname email profilePic isProfilePic",
      })
      .lean(); // Convert mongoose documents to plain JavaScript objects
    return res.json({
      success: true,
      attorneys,
    });
  } catch (err) {
    return res.json({
      msg: err.message || "Error fetching attorneys",
    });
  }
});


router.post("/regAttorneyDetails", async (req, res) => {
  const { id } = req.body;
  RegAttorneyModel.findById({ _id: id })
    .populate({
      path: "regUser",
      select: "firstname lastname email profilePic isProfilePic",
    })
    .exec((err, regAttorneydetails) => {
      if (err) {
        return res.json({
          msg: err,
        });
      } else {
        return res.json({
          success: true,
          attorney: regAttorneydetails,
        });
      }
    });
});

router.post("/inviteAttorney", async (req, res) => {
  try {
    const { id } = req.body;
    const attorney = await RegAttorneyModel.findById(id)
      .populate({
        path: "regUser",
        select: "firstname lastname email",
      })
      .lean();

    if (!attorney) {
      return res.status(404).json({ error: "Attorney not found" });
    }

    const mailOptions = {
      to: attorney.regUser.email,
      subject: " The payment for Rain Computing refinement has been successfully processed",
      html: `
        <div style="background-color: #F7F7F7; padding: 20px;">
          <table cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px; margin: auto; background-color: #fff; box-shadow: 0 0 10px rgba(0,0,0,0.1); border-radius: 5px; overflow: hidden; font-family: Arial, sans-serif;">
            <tr>
              <td style="padding: 20px;">
                <h2 style="margin-top: 0; font-size: 24px; color: #333;">You're payment to join Rain Computing!</h2>
                <p style="margin-bottom: 20px; font-size: 16px; line-height: 150%;">Hi ${attorney.regUser.firstname} ${attorney.regUser.lastname} ${attorney.regUser.email},</p>
                <p style="margin-bottom: 20px; font-size: 16px; line-height: 150%;">"Thank you for the payment. We appreciate your commitment to Rain Computing. Here are the details:":</p>
                <ul style="margin-bottom: 20px; font-size: 16px; line-height: 150%;">
                  <li>Rain Computing asks you to handle the case for the client.</li>
                  <li>Client paid for your services on Rain Computing website.</li>
                </ul>
                <p style="margin-bottom: 10px; font-size: 16px; line-height: 150%;">We hope to see you there!</p>
                <a href="https://raincomputing.net" style="display: block; width: 200px; background-color: #556ee6; color:#ffffff; text-align: center; padding: 10px 0; border-radius: 5px; text-decoration: none; margin: 0 auto;">Visit our site</a>
              </td>
            </tr>
          </table>
        </div>
      `,
    };

    const mailSent = await sendMail(mailOptions);

    res.json({ success: true, mailSent });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router.put("/updateSchedule", async (req, res) => {
  try {
    const { attorneyID, scheduleDates } = req.body;

    const data = {
      attorneyID,
      scheduleDates: scheduleDates, // Use scheduledTime instead of date and time
    };

    const updateSchedules = await RegAttorneyModel.findByIdAndUpdate(
      { _id: attorneyID },
      data,
      { new: true }
    );
    return res.json({ success: true, data: updateSchedules });
  } catch (err) {
    return res.json({ msg: err?.name || err });
  }
});
module.exports = router;
