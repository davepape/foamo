const path = require('path');
const md5 = require('md5');
const { body, validationResult } = require('express-validator');

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


let priceTick=1;
let foamPrice = 100.0;

async function updateFoam()
    {
    priceTick += 1;
    foamPrice += Math.sin(priceTick/100.0) * (Math.random()+1.0);
    if (foamPrice < 0.1)
        foamPrice = 0.1;
    let db = await getDb();
    let collection = db.collection("users");
    let query = { };
    let result = await collection.find(query).toArray();
    result.forEach(function (u) {
        if (u.broken)
            {
            u.foam = 0;
            u.deltaFoam = 1;
            }
        else
            {
            if (u.watching > 0)
                {
                u.watching = u.watching - 1;
                u.foam += u.deltaFoam / 100.0;
                }
            else
                {
                u.foam = u.foam + u.deltaFoam;
                u.deltaFoam = u.deltaFoam + 1;
                }
            u.stability = u.stability + 1;
            if (Math.random() * 1000 < u.stability)
                {
                u.broken = true;
                u.foam = 0;
                u.deltaFoam = 1;
                }
            collection.updateOne({_id: u._id}, {$set: u}, {});
            }
        });
    }
setInterval(updateFoam, 1000);

async function harvest(req, res)
    {
    if (req.session.foamo_user_id)
        {
        let db = await getDb();
        let collection = db.collection("users");
        let query = { _id: new ObjectId(req.session.foamo_user_id) };
        let user = await collection.findOne(query);
        user.money += user.foam * foamPrice;
        user.foam = 0;
        user.deltaFoam = 1;
        user.stability = 0;
        user.watching = 15;
        collection.updateOne({_id: user._id}, {$set: user}, {});
        return res.redirect('/game');
        }
    return res.redirect('/welcome');
    }


async function repair(req, res)
    {
    if (req.session.foamo_user_id)
        {
        let db = await getDb();
        let collection = db.collection("users");
        let query = { _id: new ObjectId(req.session.foamo_user_id) };
        let user = await collection.findOne(query);
        user.broken = false;
        user.money -= 1000000;
        user.foam = 0;
        user.deltaFoam = 1;
        user.stability = 0;
        user.watching = 15;
        collection.updateOne({_id: user._id}, {$set: user}, {});
        return res.redirect('/game');
        }
    return res.redirect('/welcome');
    }

async function scoreboard(req,res)
    {
    let db = await getDb();
    let collection = db.collection("users");
    let query = { };
    let result = await collection.find(query).toArray();
    scores = [];
    result.forEach(function (u) {
        let css = 'table-default';
        if (u.broken)
            css = 'table-danger';
        scores.push({name: u.screenname, money: Math.round(u.money), css: css});
        });
    let user = await playerByID(req.session.foamo_user_id);
    res.render('scoreboard', { user: user, scores: scores });
    }
setInterval(updateFoam, 1000);

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
    res.render('game', { user: result, foamPrice: foamPrice });
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


function newPlayerData(name)
    {
    return { screenname: name, money: 0, foam: 0, deltaFoam: 1, stability: 0, broken: false, watching: 0, hasNewResults: false };
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
        let obj = newPlayerData(req.body.yourname);
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
    let obj = newPlayerData(name);
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




/* Create the WebSocket server, which will use port 7085 */
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

httpserver.listen(17085);

wss.on('connection', socketNewConnection);

function socketNewConnection(ws) 
    {
    ws.on('message', function (data) { socketReceiveData(data,ws); });
    }

const decoder = new TextDecoder();

async function socketReceiveData(data,ws)
    {
    ws.user = data;
    let db = await getDb();
    let collection = db.collection("users");
    let query = { _id: new ObjectId(decoder.decode(data)) };
    collection.updateOne(query, {$set: { 'watching': 15} }, {});
    let result = await collection.findOne(query);
    let message = { money: result.money, foam: result.foam, broken: result.broken, price: foamPrice };
    ws.send(JSON.stringify(message), { binary: false });
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
router.get('/harvest', harvest);
router.get('/repair', repair);
router.get('/scoreboard', scoreboard);
router.get('/log/:password', log);

module.exports = router;
