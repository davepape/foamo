/* This version of "foamo" uses a series of Promises in the home() function,
 instead of using 'await'.  Doing this as a test of that approach, to try to
 see which seems more understandable.
 This approach is in theory better because it maintains more asynchrony.
*/
const path = require('path');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');

const { MongoClient, ServerApiVersion, ObjectID } = require('mongodb');
const uri = process.env.ATLAS_URI;
const client = new MongoClient(uri, { serverApi: ServerApiVersion.v1 });

const STARTING_POINTS = 10;

var _db;
async function getDb() {
    if (!_db)
        {
        await client.connect();
        _db = await client.db("foamo");
        }
    return _db;
    }



async function index(req, res) {
    if (req.session.rpsr_user_id)
        home(req, res);
    else
        welcomePage(req, res);
    }

async function welcomePage(req, res) {
    res.render('welcome', { username: ""} );
    }

async function aboutPage(req, res) {
    let username = req.session.username;
    res.render('about', { username: username });
    }

async function settingsPage(req, res) {
    let username = req.session.username;
    res.render('settings', { username: username });
    }

async function home(req, res) {
    if (!req.session.rpsr_user_id) { return res.redirect('welcome'); }
    let db = await getDb();
    let collection = db.collection("users");
    let query = { _id: ObjectID(req.session.rpsr_user_id) };
    collection.findOne(query, async function (err, result) {
        if (err) { console.log(err); return res.sendStatus(500); }
        res.render('home', { user: result, username: result.screenname });
        });
    }


function printableTime(t) {
    let d = new Date(t);
    return d.toLocaleDateString('en-us', { month: "short", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric"});
    }



/*
async function login(req, res) {
    let db = await getDb();
    let collection = db.collection("users");
    let query = { email: new RegExp(`^${req.body.username}$`,'i') };
    collection.findOne(query, async function (err,result) {
        if (err) { response.send(err); }
        if (result)
            {
            let ok = await bcrypt.compare(req.body.password, result.password);
            if (ok) {
                req.session.rpsr_user = result;
                res.redirect(`home`);
                }
            else {
                res.redirect(`loginerror`);
                }
            }
        else {
            res.redirect(`loginerror`);
            }
        });
    }
*/

async function newAccount(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { return res.render('error', { errors: errors.array() }); }
    let db = await getDb();
    let collection = db.collection("users");
    let query = { screenname: new RegExp(`^${req.body.yourname}$`,'i') };
    let numExisting = await collection.count(query);
    if (numExisting == 0) {
        let obj = { screenname: req.body.yourname, email: "", password: "x", actionpoints: STARTING_POINTS, hasNewResults: true };
        collection.insertOne(obj, function (err,result) {
            if (err) { console.log(err); return res.sendStatus(500); }
            req.session.rpsr_user_id = result.insertedId;
            req.session.username = obj.screenname;
            res.redirect(`home`);
            });
        }
    else {
        res.redirect(`/newaccounterror`);
        }
    }


function loginError(req, res) {
    res.render('loginerror', { username: "" });
    }


function newAccountError(req, res) {
    res.render('newaccounterror', { username: "" });
    }


function logout(req, res) {
    req.session.destroy(function (err) {
        if (err) { console.log(err); return res.sendStatus(500); }
        res.redirect(`.`);
        });
    }



const express = require('express');
let router = express.Router();

router.get('/', index);
router.get('/home', home);
router.get('/welcome', welcomePage);
router.get('/about', aboutPage);
router.get('/settings', settingsPage);
router.get('/logout', logout);
router.get('/loginerror', loginError);
router.post('/newaccount', newAccount);
router.get('/newaccounterror', newAccountError);

module.exports = router;
