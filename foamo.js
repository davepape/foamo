const path = require('path');
const md5 = require('md5');
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = process.env.ATLAS_URI;
const client = new MongoClient(uri, { serverApi: ServerApiVersion.v1 });

const STARTING_POINTS = 10;
let logToConsole = false;
if (process.env.FOAMO_LOG_TO_CONSOLE)
    logToConsole = true;

var _db;
async function getDb() {
    if (!_db)
        {
        await client.connect();
        _db = await client.db("foamo");
        }
    return _db;
    }



async function rootPage(req, res) {
    if (req.session.foamo_user_id) { return res.redirect('/game'); }
    return res.redirect('/welcome');
    return res.sendStatus(404);
    }


async function index(req, res) {
    if (req.session.foamo_user_id)
        game(req, res);
    else
        welcomePage(req, res);
    }

async function welcomePage(req, res) {
    res.render('welcome', { user: null } );
    }

async function aboutPage(req, res) {
    let user = await playerByID(req.session.foamo_user_id);
    res.render('about', { user: user });
    }


async function game(req, res) {
    if (!req.session.foamo_user_id) { return res.redirect('/welcome'); }
    let user = await playerByID(req.session.foamo_user_id);
    let db = await getDb();
    let collection = db.collection("users");
    let query = { _id: new ObjectId(req.session.foamo_user_id) };
    let result = await collection.findOne(query);
//        if (err) { logMessage(err,req); return res.sendStatus(500); }
    res.render('game', { user: result });
    }



async function playerByID(id)
    {
    let db = await getDb();
    let collection = db.collection("users");
    let query = { _id: new ObjectId(id) };
    let result = await collection.findOne(query);
    return result;
    }


function printableTime(t) {
    let d = new Date(t);
    return d.toLocaleDateString('en-us', { month: "short", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", timeZone: 'America/New_York'});
    }


async function newAccount(req, res)
    {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { return res.render('error', { user: null, errors: errors.array() }); }
    let db = await getDb();
    let collection = db.collection("users");
    let query = { screenname: new RegExp(`^${req.body.yourname}$`,'i') };
    logMessage(`trying to create account ${req.body.yourname}`, req);
    let numExisting = await collection.count(query);
    if (numExisting == 0) {
        let obj = { screenname: req.body.yourname, email: "", actionpoints: STARTING_POINTS, score: 0, hasNewResults: false };
        let result = await collection.insertOne(obj);
//            if (err) { logMessage(err,req); return res.sendStatus(500); }
        req.session.foamo_user_id = result.insertedId;
        req.session.username = obj.screenname;
        res.redirect(`/game`);
        logMessage(`new account ${req.body.yourname}`, req);
        }
    else {
        res.redirect(`/newaccounterror`);
        }
    }

async function randomName(req, res)
    {
    let name = await generateName();
    if (!name)
        return res.redirect('/newaccounterror');
    let db = await getDb();
    let collection = db.collection("users");
    logMessage(`trying to create random-named account ${name}`, req);
    let obj = { screenname: name, email: "", actionpoints: STARTING_POINTS, score: 0, hasNewResults: false };
    let result = await collection.insertOne(obj);
//        if (err) { logMessage(err,req); return res.sendStatus(500); }
    req.session.foamo_user_id = result.insertedId;
    req.session.username = obj.screenname;
    res.redirect(`/game`);
    logMessage(`new account ${name}`, req);
    }


async function generateName()
    {
    let first = [ 'Random', 'Anonymous', 'Some', 'Other' ];
    let second = [ 'Player', 'User', 'Person', 'Entity', 'Buffalonian' ];
    let db = await getDb();
    let collection = db.collection("users");
    for (let i=0; i < 100; i++)
        {
        let name = choose(first) + ' ' + choose(second) + ' ' + Math.floor(Math.random()*100);
        let query = { screenname: new RegExp(`^${name}$`,'i') };
        let numExisting = await collection.count(query);
        if (numExisting == 0)
            return name;
        }
    return null;
    }

function choose(l)
    {
    return l[Math.floor(Math.random()*l.length)];
    }


function newAccountError(req, res)
    {
    logMessage('newAccountError', req);
    res.render('newaccounterror', { user: null });
    }


function logout(req, res)
    {
    logMessage('logout', req);
    req.session.destroy(function (err) {
        if (err) { logMessage(err,req); return res.sendStatus(500); }
        res.redirect(`.`);
        });
    }



/* Create the WebSocket server, which will use port 7085 */
/* Be aware that if you have this app running via Passenger, and then also
  try to run it manually at the same time (for debugging), it may die
  because of two separate processes trying to both use the same port.  */
const { WebSocket, WebSocketServer } = require('ws');

/* const httpserver = require('http').createServer(); */

const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('rsakey.txt'),
  cert: fs.readFileSync('certificate.txt')
};

const httpserver = https.createServer(options);

const wss = new WebSocketServer({server: httpserver}, function () {});

httpserver.listen(7085);

wss.on('connection', socketNewConnection);

function socketNewConnection(ws) 
    {
    ws.on('message', function (data) { socketReceiveData(data,ws); });
    }

function socketReceiveData(data,ws)
    {
    ws.user = data;
    }


async function log(req, res)
    {
    if (req.params.password != process.env.FOAMO_ADMIN_PASSWORD)
        {
        logMessage('log - wrong password', req);
        return res.redirect('/');
        }
    let db = await getDb();
    db.collection('log').find({}).sort({timestamp:-1}).toArray(async function (err,result) {
        if (err) { logMessage(err,req); return res.sendStatus(500); }
        for (let i=0; i < result.length; i++)
            {
            result[i].time = printableTime(result[i].timestamp);
            }
        res.render('log', { log: result });
        });
    }


async function logMessage(message,req)
    {
    let db = await getDb();
    let collection = db.collection("log");
    if ((req) && (req.session.username))
        name = req.session.username;
    else
        name = "unknown player";
    let record = { user: name,
                   timestamp: Date.now(),
                   message: message };
    collection.insertOne(record);
    if (logToConsole)
        console.log(message);
    }


const express = require('express');
let router = express.Router();

router.get('/', rootPage);
router.get('/foamo', index);
router.get('/game', game);
router.get('/welcome', welcomePage);
router.get('/about', aboutPage);
router.post('/newaccount', newAccount);
router.get('/newaccounterror', newAccountError);
router.get('/randomname', randomName);
router.get('/log/:password', log);

module.exports = router;
