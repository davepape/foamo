const express = require('express');
let app = express();

/* Use EJS for templates (in the "views" folder) */
app.set('view engine', 'ejs');

/* Enable session data for all connections to this site */
const session = require('express-session');
const MongoStore = require('connect-mongo');
const sess_uri = process.env.ATLAS_FOAMO_SESSION_URI;

app.use(session({ secret: process.env.SESSION_SECRET,
                  store: MongoStore.create({ mongoUrl: sess_uri, dbName: 'foamo', stringify: false }),
                  resave: false,
                  saveUninitialized: false}));


/* Assuming all our pages are dynamically generated, this tells browsers not to cache anything.  */
app.use(function (req,res,next) {
    if (req.originalUrl != '/foamo_logo.png')
        res.set('Cache-Control','no-store');
    next();
    });

/* Use body-parser for any input forms on the site */
const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({extended:false}));

/* This allows static files in the "public" folder to be served when running this app via the command-line, rather than via Passenger */
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));


app.use('/', require('./foamo.js'));

let port = 18705;
if (process.env.NODE_PORT)
    port = parseInt(process.env.NODE_PORT);

let server = app.listen(port, function () {
                console.log(`server started on port ${port}`);
                });

