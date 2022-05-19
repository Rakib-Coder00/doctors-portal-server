const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;



app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kxuzn.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
            await client.connect();
            const servicesCollection = client.db('doctors_portal').collection('services');

            const bookingCollection = client.db('doctors_portal').collection('bookings');

            const usersCollection = client.db('doctors_portal').collection('users');

            function verifyJWT(req, res, next){
                const authHeader = req.headers.authorization;
                if (!authHeader) {
                    return res.status(401).send({ message: 'UnAuthorized access' });
                  }
                const token = authHeader.split(' ')[1];

                jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                    if(err){
                        return res.status(403).send({message: 'forbidden access'}) 
                    }
                    req.decoded = decoded
                    next()
                })
            }

            app.get('/service', async (req, res) => {
                const query = {};
                const cursor = servicesCollection.find(query);
                const services = await cursor.toArray();
                res.send(services);
            })

            app.get('/user', verifyJWT, async (req, res) => {
                const users = await usersCollection.find().toArray();
                res.send(users);
            })

            app.put('/user/:email', async(req, res) => {
                const email = req.params.email;
                const user = req.body;
                const filter = { email: email };
                const option = {upsert: true};
                const updateDoc = {
                    $set: user,
                }
                const results = await usersCollection.updateOne(filter, updateDoc, option);
                const token = jwt.sign({email: email}, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '14d'});
                res.send({results, token});
            })
            
            //Verify for admin
            app.get('/admin/:email', async(req, res) => {
                const email = req.params.email
                const user = await usersCollection.findOne({email: email})
                const isAdmin = user.role === 'admin'
                 res.send({admin: isAdmin})
            })

            //API to Make an Admin

            app.put('/user/admin/:email', verifyJWT, async(req, res) => {
                const email = req.params.email;
                const requester = req.decoded.email;
                const requesterAccount = await usersCollection.findOne({email: requester});
                if (requesterAccount.role === 'admin') {
                    const filter = { email: email };
                    const updateDoc = {
                        $set:{ role: 'admin' },
                    }
                    const results = await usersCollection.updateOne(filter, updateDoc);
                    res.send(results);
                }
                else {
                    res.status(403).send({message: 'You are not authorized to make an Admin'})
                }
            })




            
            //❌Warning❌
            //this is not the proper way to query, but it works for now
            //after learning more about mongDB, use aggregate lookup, pipeline, match, group etc.

            app.get('/available', async (req, res) => {
                const date = req.query.date || "May 16, 2022"


                //step 1 : get all services ==>
                const services = await servicesCollection.find().toArray();

                //step 2 : get all bookings for the date ==>

                const query = {date: date}
                const bookings = await bookingCollection.find(query).toArray();

                //step 3: for each service ==>

                services.forEach(service => {
                    //step 4:  find bookings for that service --> [{}, {}, {}]
                    const bookingsForService = bookings.filter(book => book.treatment=== service.name);

                    //step 5:  select slots for the service booking -->  ['', '', '']
                    const bookedSlots = bookingsForService.map(book => book.slot);

                    //step 6:  find available slots for that service 
                    const available = service.slots.filter(slot => !bookedSlots.includes(slot));

                    //step 7:  update the service with the available slots
                    service.slots = available;

                    // service.bookedSlots = bookedSlots
                    // service.bookedSlots = bookingsForService.map(booking => booking.slot);
                })
                res.send(services);
            })


            
            //API Naming Convention ==>
            //app.get('/booking')  [Get all bookings in this collection. or get more than one or by filter]
            //app.get('/booking/:id')  [Get a single booking by id]
            //app.post('/booking')  [Create a new booking]
            //app.put('/booking/:id')  [Update a booking by id]
            //app.delete('/booking/:id')  [Delete a booking by id]
            //app.get('/booking/:id/:date')  [Get a booking by id and date]


            app.get('/booking', verifyJWT, async(req, res) =>{
                const patient = req.query.patient;
                const decodedEmail = req.decoded.email;
                if (patient === decodedEmail) {
                    const query = {patient: patient};
                    const bookings = await bookingCollection.find(query).toArray();
                    return res.send(bookings);
                }
                else {
                    return res.status(403).send({message: 'forbidden access'})
                }
                // const authorization = req.headers.authorization;
                // console.log(authorization);
              })

            app.post('/booking',  async (req, res) => {
                const booking = req.body;
                const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient };
                const bookingExists = await bookingCollection.findOne(query);
                if (bookingExists) {
                    return res.send({ success: false, booking: bookingExists });
                }
                const result = await bookingCollection.insertOne(booking);
                return res.send({success: true, result});
            })
    }
    finally{
        
    }
    
}
run().catch(console.dir);

app.get('/',(req,res)=>{
    res.send('Server is running...✔');
})



app.listen(port,  ()=>{
    console.log('Doctor App listening on port ' + port);
});