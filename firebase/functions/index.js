
var functions = require("firebase-functions");
var admin = require("firebase-admin");
var cors = require("cors")({ origin: "*" });
var webpush = require("web-push");
var formidable = require("formidable");
var fs = require("fs");
var UUID = require("uuid-v4");
var os = require("os");
var path = require("path");
var Busboy = require("busboy");
const Multer = require("multer");

var serviceAccount = require("./pwa-service-key.json");

const { Storage } = require("@google-cloud/storage");
const storage = new Storage({ keyFilename: "pwa-service-key.json" });
const bucketName = "pwa-test-2af62.appspot.com";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://pwa-test-2af62.firebaseio.com/",
});

var upload;
var fields = {};

exports.storePostData = functions.https.onRequest(function (request, response) {
  cors(request, response, function () {
    var uuid = UUID();

    const busboy = new Busboy({ headers: request.headers });

    busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
      console.log(
        `File [${fieldname}] filename: ${filename}, encoding: ${encoding}, mimetype: ${mimetype}`
      );
      const filepath = path.join(os.tmpdir(), filename);
      upload = { file: filepath, type: mimetype };
      file.pipe(fs.createWriteStream(filepath));
    });

    busboy.on("field", function (
      fieldname,
      val,
      fieldnameTruncated,
      valTruncated,
      encoding,
      mimetype
    ) {
      console.log("ON FIELD METHOD ", val);
      fields[fieldname] = val;
    });

    busboy.on("finish", function () {
      // console.log(bucket);
      console.log("BUSBOY KNCKED OUT");

      var bucket = storage.bucket(bucketName);
      bucket.upload(
        upload.file,
        {
          uploadType: "media",
          metadata: {
            contentType: upload.type,
            firebaseStorageDownloadTokens: uuid,
          },
        },
        function (err, uploadedFile) {
          if (!err) {
            admin
              .database()
              .ref("posts")
              .push({
                title: fields.title,
                location: fields.location,
                rawLocation: {
                  lat: fields.rawLocationLat,
                  lng: fields.rawLocationLng,
                },
                image:
                  "https://firebasestorage.googleapis.com/v0/b/" +
                  bucket.name +
                  "/o/" +
                  encodeURIComponent(uploadedFile.name) +
                  "?alt=media&token=" +
                  uuid,
              })
              .then(function () {
                webpush.setVapidDetails(
                  "mailto:business@academind.com",
                  "BLVK04S8vU2jVhWVw-f8fq5wAlpysvEEfMeii75oEc8whbf1ugHhJOeVrlNk2QyY1mb6VnZxH_oBdDAlzlI1JFo",
                  "wjXtu51wW9vyGarpeNN1c_fjE6JCcGVMidK5iqUAXiY"
                );
                return admin.database().ref("subscriptions").once("value");
              })
              .then(function (subscriptions) {
                subscriptions.forEach(function (sub) {
                  var pushConfig = {
                    endpoint: sub.val().endpoint,
                    keys: {
                      auth: sub.val().keys.auth,
                      p256dh: sub.val().keys.p256dh,
                    },
                  };

                  webpush
                    .sendNotification(
                      pushConfig,
                      JSON.stringify({
                        title: "New Post",
                        content: "New Post added!",
                        openUrl: "/help",
                      })
                    )
                    .catch(function (err) {
                      console.log(err);
                    });
                });
                response
                  .status(201)
                  .json({ message: "Data stored", id: fields.id });
              })
              .catch(function (err) {
                response.status(500).json({ error: err });
              });
          } else {
            console.log("Couldn't upload", err);
          }
        }
      );
    });
    busboy.end(request.rawBody);
  });
});
