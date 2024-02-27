const express = require("express");
const _ = require("lodash");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const cron = require("node-cron");
const { GridFsStorage } = require("multer-gridfs-storage");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
require("dotenv").config();
const app = express();
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const server = http.createServer(app);
const config = require("./config");
const UserModel = require("./models/userModel");
const { sendMail } = require("./services/mail.services");
const Message = require("./models/Message");
const RegAttorneyModel = require("./models/RegAttorneyModel");
const {MongoClient} = require("mongodb")
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const create = async () => {
  //Allowing cors
  app.use(
    cors({
      origin: true,
      credentials: true,
      exposedHeaders: ["set-cookie"],
    })
  );
  //Body parser
  app.use(express.json({ limit: "50mb" }));
  app.use(
    express.urlencoded({
      limit: "50mb",
      extended: true,
      parameterLimit: 500000,
    })
  );
  app.use(cookieParser());

  //DB connection
  mongoose
    .connect(config.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    .then(() => console.log("MongoDB Connected"))
    .catch((err) => console.log(err));

  //Users object to save online users
  let users = {};
  let notifications = [];
  let offlineUsers = [];
  //Socket methods
  io.on("connection", (socket) => {
    const userId = socket.handshake.query.id;
    console.log(`User Connected: ${userId}`);
    //Removing User from offline users
    offlineUsers = offlineUsers.filter((user) => user !== userId);
    socket.join(userId);

    // CHECK IS USER EXHIST
    if (!users[userId]) users[userId] = [];

    // PUSH SOCKET ID FOR PARTICULAR USER ID
    users[userId].push(socket.id);

    // USER IS ONLINE BROAD CAST TO ALL CONNECTED USERS
    io.sockets.emit("online", users);

    //Sending notification while user log in
    if (notifications.some((n) => n?.receivers?.includes(userId))) {
      const createdMessage = notifications.filter((n) =>
        n?.receivers?.includes(userId)
      );
      socket.emit("u_l", createdMessage);
      notifications = notifications.filter(
        (n) => !n?.receivers?.includes(userId)
      );
    }
    socket.on("s_m", async (payload) => {
      try {
        const { receivers } = payload || {};
        if (!receivers || !Array.isArray(receivers)) {
          throw new Error(
            "Invalid payload format: receivers property is missing or not an array."
          );
        }

        const createdMessage = await Message.create(payload);
        // console.log("payload :",payload)
        if (createdMessage) {
          socket.emit("s_s", createdMessage);

          const offlineUsers = [];
          await Promise.all(
            receivers.map(async (receiver) => {
              if (!(receiver in users)) {
                console.log("Receiver is offline: ", receiver);
                offlineUsers.push(receiver);
              } else {
                console.log("Receiver is online: ", receiver);
                socket.broadcast.to(receiver).emit("r_m", createdMessage);
              }
            })
          );

          if (offlineUsers.length > 0) {
            const uniqueOfflineReceivers = [...new Set(offlineUsers)];
            notifications.push(createdMessage);
          }
        }
      } catch (error) {
        console.log("Error while emitting message: ", error);
      }
    });
    //reply message notification by using socket io
    socket.on("s_r", async (payload) => {
      try {
        const { receivers } = payload || {};
        if (!receivers || !Array.isArray(receivers)) {
          throw new Error(
            "Invalid payload format: receivers property is missing or not an array."
          );
        }
        const replyMessages = await Message.findByIdAndUpdate(payload.id);
        if (replyMessages) {
          socket.emit("r_s", replyMessages);
          const offlineUsers = [];
          await Promise.all(
            receivers.map(async (receiver) => {
              if (!(receiver in users)) { 
                console.log("Receiver is offline: ", receiver);
                offlineUsers.push(receiver);
              } else {
                console.log("Receiver is online: ", receiver);
                socket.broadcast.to(receiver).emit("r_r", replyMessages);
              }
            })
          );

          if (offlineUsers.length > 0) {
            const uniqueOfflineReceivers = [...new Set(offlineUsers)];
            notifications.push(replyMessages);
          }
        }
      } catch (error) {
        console.log("Error while emitting message: ", error);
      }
    });

    
    socket.on(
      "send_message",
      async ({
        chatRoomId,
        sender,
        receivers,
        messageData,
        createdAt,
        isAttachment,
        attachments,
      }) => {
        let attachmentsObjId = [];

        const handleMessageandAttachment = () => {
          const messageQuery = {
            chatRoomId,
            message: {
              sender,
              receivers,
              messageData,
            },
            attachments: attachmentsObjId,
            isAttachment,
            createdAt,
          };
          Chat.create(messageQuery, async (err, chat) => {
            if (err) {
              console.log("Chat Error :", err);
            }
            if (chat) {
              ChatRooms.findByIdAndUpdate(
                chatRoomId,
                { lastModified: Date.now() },
                async (err, modified) => {
                  if (err) {
                    console.log("modification Error :", err);
                  } else {
                    await receivers.map((receiver) => {
                      if (!(receiver in users)) {
                        console.log("Reciver is offline  : ", receiver);
                        UserModel.findById(
                          receiver,
                          async (err, recivingUser) => {
                            if (err) {
                              console.log("Error in getting user :", err);
                            } else {
                              const mailOptions = {
                                to: recivingUser.email,
                                subject: "New message in chat",
                                html: `<div><h3> Hello ${recivingUser.firstname}  ${recivingUser.lastname},</h3><p>Raincomputing Messages</p>
                              <a href="http://raincomputing.azurewebsites.net/chat-rc">View Message</a></div>`,
                              };
                              const mailResult = await sendMail(mailOptions);
                              console.log("Mail response", mailResult);
                            }
                          }
                        );
                      } else {
                        console.log("Reciver is online  : ", receiver);

                        socket.broadcast.to(receiver).emit("receive_message", {
                          chatRoomId,
                          message: {
                            sender,
                            receivers,
                            messageData,
                          },
                          createdAt,
                          isAttachment,
                          attachments,
                        });
                      }
                    });
                  }
                }
              );
            }
          });
        };

        if (isAttachment) {
          Attachments.create(attachments, async (err, atts) => {
            if (err) {
              console.log("attachments Error :", err);
            } else {
              attachmentsObjId = await atts.map((i) => i._id);
              handleMessageandAttachment();
            }
          });
        } else {
          handleMessageandAttachment();
        }
      }
    );

    socket.on("close_manually", () => {
      socket.disconnect();
    });
    socket.on("disconnect", (reason) => {
      // REMOVE FROM SOCKET USERS
      _.remove(users[userId], (u) => u === socket.id);
      if (users[userId].length === 0) {
        // REMOVE OBJECT
        delete users[userId];
        // ISER IS OFFLINE BROAD CAST TO ALL CONNECTED USERS
        io.sockets.emit("online", users);
      }

      socket.disconnect(); // DISCONNECT SOCKET
      console.log("user disconnected", reason);
    });
  });

  //Scheduling msg
  cron.schedule("30 22 * * *", () => {
    if (offlineUsers?.length > 0) {
      offlineUsers?.map(async (receiver) => {
        UserModel.findById(receiver, async (err, recivingUser) => {
          if (err) {
            console.log("Error in getting user :", err);
          } else {
            const mailOptions = {
              to: recivingUser.email,
              subject: "New message in chat",
              html: `<div><h3> Hello ${recivingUser.firstname}  ${recivingUser.lastname},</h3><p>You have a New message</p>
              <a href="http://raincomputing.net/chat-rc">View Message</a></div>`,
            };
            const mailResult = await sendMail(mailOptions);
            console.log("Mail response", mailResult);
          }
        });
        offlineUsers = offlineUsers.filter((user) => user !== receiver);
      });
    }
  });
  async function replicateData() {
    try {
      // Connect to the source MongoDB
      const targetCosmosConnections = [
        {
          connectionString: "mongodb://common:go8JfN0GBH9RCe05HMA2NPywPTs5cseCYDkXIrXcCL4sIdjX2GIivTkA6qcS4bZb1tIAOra61qojACDbmZQXGQ==@common.mongo.cosmos.azure.com:10255/?ssl=true&retrywrites=false&replicaSet=globaldb&maxIdleTimeMS=120000&appName=@common@",
          // targetDatabaseName: "raincomputingcosmosdb",
          targetContainerName: "usermodels",
        },
        {
          connectionString: "mongodb://rc-sub-cosmodb:xe0LHri9s9zKzPvBJMwPkzdqS8nxb2TN2bxfLElLbyJ6ZawnVELB4RnKmKP9pVpntWDQsdfXJIJOACDb56botw==@rc-sub-cosmodb.mongo.cosmos.azure.com:10255/?ssl=true&retrywrites=false&replicaSet=globaldb&maxIdleTimeMS=120000&appName=@rc-sub-cosmodb@",
          // targetDatabaseName: "raincomputingcosmosdb",
          targetContainerName: "usermodels",
        },
      ];
      const targetCosmos = new MongoClient(targetCosmosConnections[0].connectionString);
            await targetCosmos.connect();
            const targetCosmosdata = targetCosmos.db();
            const targetAttorneyCollection = targetCosmosdata.collection("regattorneys");
            const allattorney = await targetAttorneyCollection.find({}).toArray();
            const allattorneyData =  await RegAttorneyModel.find({});
            const missAttorney = allattorney.filter((user) => !allattorneyData.some((existingUser) => existingUser._id.toString() === user._id.toString()));;
      console.log("missAttorney",missAttorney)
            for (const attorney of missAttorney) {
              // Attempt to find an existing document with the same _id
            
              
                // If no existing document with the same _id exists, insert a new one
                await RegAttorneyModel.create(attorney);
                console.log(`Replicated missing user data with _id ${attorney._id} to target Cosmos DB (${targetCosmosConnection.connectionString})`);
            
      }
      for (const user of allattorney) {
        const existingUser = allattorneyData.find((existingUser) => existingUser._id.toString() === user._id.toString());
          if (existingUser) {
            // Update existing user in the userModel with data from userData
            await RegAttorneyModel.updateOne({ _id: existingUser._id }, { $set: user });
          }
        }
    }catch (error) {
      console.error(`Error replicating data: ${error.message}`);
    }
  }

  cron.schedule("*/10 * * * * *", replicateData);

  
  //Attachment uploading
  let gfs;
  mongoose.connection.on("connected", () => {
    const db = mongoose.connections[0].db;
    gfs = new mongoose.mongo.GridFSBucket(db, {
      bucketName: "attachments",
    });
  });
  //Declaring GridFS storage
  const storage = new GridFsStorage({
    url: config.MONGO_URL,
    options: { useUnifiedTopology: true },
    file: (req, file) => {
      return new Promise((resolve, reject) => {
        crypto.randomBytes(16, (err, buf) => {
          if (err) {
            console.log("Final Step err:", err);
            return reject(err);
          }
          const filename =
            buf.toString("hex") + path.extname(file.originalname);
          const fileInfo = {
            filename: filename,
            bucketName: "attachments",
          };
          console.log("Final Step fileInfo:", fileInfo);
          resolve(fileInfo);
        });
      });
    },
  });

  const store = multer({
    storage,
    fileFilter: function (req, file, cb) {
      checkFileType(file, cb);
    },
  });
  //Checking file types
  // function checkFileType(file, cb) {
  //   const filetypes = /jpeg|doc|docx|xls|xlsx|jpg|png|pdf|zip|mp3|wav/;
  //   const extname = filetypes.test(
  //     path.extname(file.originalname).toLocaleLowerCase()
  //   );
  //   const mimetype = filetypes.test(file.mimetype);
  //   if (mimetype && extname) return cb(null, true);
  //   cb("filetype");
  // }

  function checkFileType(file, cb) {
    const filetypes = /jpeg|doc|docx|xls|xlsx|jpg|png|pdf|zip|mp3|wav|webm/;
    const extname = filetypes.test(
      path.extname(file.originalname).toLocaleLowerCase()
    );
    const mimetype = filetypes.test(file.mimetype) || (
      file.mimetype === 'audio/mpeg' || 
      file.mimetype === 'audio/wav'
    );
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb("filetype");
    }
  }
  //Attachment middleware
  const uploadMiddleware = (req, res, next) => {
    const upload = store.array("file");
    upload(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).send("file to large");
      } else if (err) {
        console.log("m error: ", err);
        if (err === "filetype") return res.status(400).send("file type error");
        return res.send("file upload error");
      }
      next();
    });
  };
  //atatchment upload
  app.post("/upload", uploadMiddleware, async (req, res) => {
    const { files } = req;
    return res.json({ success: true, files });
  });

  app.get("/file/:id", ({ params: { id } }, res) => {
    if (!id || id === "undefined") return res.status(400).send("no image id");
    const _id = new mongoose.Types.ObjectId(id);
    gfs.find({ _id }).toArray((err, files) => {
      if (!files || files.length === 0)
        return res.status(400).send("no files exist");
      // if a file exists, send the data
      gfs.openDownloadStream(_id).pipe(res);
    });
  });

  //Middleware configuration

  app.get("/", (req, res) => res.send("Hello"));

  app.use("/api/user", require("./routes/userRoute"));
  // app.use("/api/chat", require("./routes/privateChatRoute"));
  app.use("/api/pchat", require("./routes/chatRoute"));
  app.use("/api/attorney", require("./routes/attorneyRoute"));
  app.use("/api/firm", require("./routes/firmRoute"));
  // app.use("/api/subgroup", require("./routes/subgroupRoute"));
  app.use("/api/case", require("./routes/caseRoute"));
  app.use("/api/group", require("./routes/groupRoute"));
  app.use("/api/message", require("./routes/messageRoute"));
  app.use("/api/admin", require("./routes/adminRoute"));
  app.use("/api/bff", require("./routes/bffRoute"));
  app.use("/api/appointment", require("./routes/appointmentRoute"));
  app.use("/api/payment", require("./routes/paymentRoute"));
  app.use("/api/mail", require("./routes/mailReplyRoute"));
  app.use("/api/remainder", require("./routes/remainderRoute"));
  app.use("/api/event", require("./routes/eventRoute"));
  app.use("/api/interval", require("./routes/intervalRoute"));
  // return app;

  return server;
};

module.exports = {
  create,
};
