const express = require('express')
const EVT = require('evtjs')
const bodyParser =  require("body-parser")
const appConfig = require("./config.js")


const apiCaller = EVT({
    endpoint: appConfig.network,
    keyProvider: [appConfig.keyProvider]
});

const app = express()

app.use(bodyParser.urlencoded({limit: '10mb', extended: false }));
app.use(express.static('public'))

var lastCreateAt = 0
var ticketQueue = []

app.get('/getTicket', (req, res, next) => {

    let now  = Date.now()
    if (now - lastCreateAt < 60e3) {
        const error = new Error('We supply one ticket per 60s. Please wait '+(60 - Math.ceil((now - lastCreateAt) / 1000))+'s')
        error.httpStatusCode = 411
        return next(error)
    }
    lastCreateAt = now

    res.json({code: createTicket()})
})

app.get('/query', (req, res, next) => {
    if (!req.query.token) {
        const error = new Error('Missing token')
        error.httpStatusCode = 400
        return next(error)
    }

    apiCaller.getToken(appConfig.czDomain, req.query.token).then(function(result){
        res.json(result)
    }).catch(function(err){
        next(err)
    })
})

app.post('/active', (req, res, next) => {
    if (!req.body.code || !ticketQueue.includes(req.body.code)) {
        const error = new Error('Token ticket not found')
        error.httpStatusCode = 404
        return next(error)
    }
    var token = req.body.code
    var owner = req.body.owner || EVT.EvtKey.privateToPublic(appConfig.keyProvider)
    var evtActions = [{maxCharge: 1000000}]
    evtActions.push(new EVT.EvtAction("issuetoken",{"domain": appConfig.czDomain, "names": [token], "owner": [owner]}))
    evtActions.push(new EVT.EvtAction("addmeta", {
        "key": "memo",
        "value": req.body.memo,
        "creator": "[A] " + EVT.EvtKey.privateToPublic(appConfig.keyProvider)
    }, appConfig.czDomain, token))

    // images
    if (req.body.images) {
        var images = req.body.images.split('|')
        for (let index = 0; index < images.length; index++) {
            evtActions.push(new EVT.EvtAction("addmeta", {
                "key": "image-"+index,
                "value": images[index],
                "creator": "[A] " + EVT.EvtKey.privateToPublic(appConfig.keyProvider)
            }, appConfig.czDomain, token))
        }
    }

    apiCaller['pushTransaction'].apply(apiCaller, evtActions).then(result=>{
        res.json({trxId: result.transactionId, token: token})
    }).catch(err=>{
        next(err)
    })
})

app.use(function (err, req, res, next) {
    res.status(err.httpStatusCode || 400).json({errorMessage: err.message})
})

app.listen(8081, () => console.log('Example app listening on :8081'))


// funcs
function createTicket() {
    var ticket = 'CZ.' + Math.random().toString(36).substring(2, 17)
    ticketQueue.push(ticket)
    if (ticketQueue.length > 10) {
        ticketQueue.shift()
    }

    return ticket
}
