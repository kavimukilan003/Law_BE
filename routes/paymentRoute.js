const express = require("express");
const { identity } = require("lodash");
const PaymentModel = require("../models/PaymentModel");
const RegAttorneyModel = require("../models/RegAttorneyModel");
const UserModel = require("../models/userModel");
const { sendMail } = require("../services/mail.services");
const router = express.Router();
const stripe = require("stripe")(
  "sk_test_51LYOZnSED7zxlOa8JJRGqPgogYBn0hw5geNTfpbNBlxT6JXyyUtU14QyB2qv1EZAwvC0Fw3NjugyNkk3zINBj2xh00pqSKN7nc"
);

const calculateOrderAmount = (items) => {
  // Replace this constant with a calculation of the order's amount
  // Calculate the order total on the server to prevent
  // people from directly manipulating the amount on the client
  return 20000;
};

router.get("/", (req, res) => res.send(" Payment Route"));

router.post("/create-payment-intent", async (req, res) => {
  const { items, email, user, attorney } = req.body;


  // Create a PaymentIntent with the order amount and currency
  const paymentIntent = await stripe.paymentIntents.create({
    amount: calculateOrderAmount(items),
    currency: "usd",
    automatic_payment_methods: {
      enabled: true,
    },
    customer: "cus_MIciUgEizHmKkS",
    metadata: {
      email: email,
      user: user,
      attorney: attorney,
    },
    description: "Paying in USD",
  });
  res.send({
    clientSecret: paymentIntent.client_secret,
  });
});

router.post("/getPaymentId", async (req, res) => {
  try {
    const { pi } = req.body;
    const isPaymentExist = await PaymentModel.findOne({ transactionId: pi });

    if (isPaymentExist) {
      return res.json({ success: true, isPaymentExist });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(pi);

    if (paymentIntent) {
      const { metadata, status, amount } = paymentIntent;
      const paymentQuery = {
        consumerId: metadata?.user,
        attorneyId: metadata?.attorney,
        payAmount: amount / 100,
        paymentStatus: status,
        transactionId: pi,
      };

      const paymentRes = await PaymentModel.create(paymentQuery);

      if (paymentRes) {
        const attorneyData = await RegAttorneyModel.findOne({ _id: metadata?.attorney })
          .populate({
            path: "regUser",
            select: "firstname lastname email",
          })
          .lean();

        const userData = await UserModel.findById(metadata?.user)
          .select("firstname lastname email")
          .lean();

        const mailOptions = {
          to: attorneyData.regUser.email,
          subject: "The payment for Rain Computing refinement has been successfully processed.",
          html: `
            <div style="background-color: #F7F7F7; padding: 20px;">
              <table cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px; margin: auto; background-color: #fff; box-shadow: 0 0 10px rgba(0,0,0,0.1); border-radius: 5px; overflow: hidden; font-family: Arial, sans-serif;">
                <tr>
                  <td style="padding: 20px;">
                    <h2 style="margin-top: 0; font-size: 24px; color: #333;"> The payment has been received to join Rain Computing!</h2>
                    <p style="margin-bottom: 20px; font-size: 16px; line-height: 150%;">Hi ${attorneyData.regUser.firstname} ${attorneyData.regUser.lastname},</p>
                    <p style="margin-bottom: 20px; font-size: 16px; line-height: 150%;">The payment process to Rain Computing was successful; here are the details:</p>
                    <ul style="margin-bottom: 20px; font-size: 16px; line-height: 150%;">
                      <li>${userData.firstname}${userData.lastname}</li>
                      <li>${userData.email}</li>
                      <li>Amount Paid:${paymentQuery.payAmount}$</li>
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
        console.log("mailSent", mailSent)
        return res.json({ success: true, paymentRes, mailSent });
      }
    }
  } catch (err) {
    console.error(err);
    res.json({
      success: false,
      msg: "An error occurred while processing the payment.",
    });
  }
});


module.exports = router;
