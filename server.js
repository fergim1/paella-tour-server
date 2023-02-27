const express = require("express")
require("dotenv").config()
const PORT = 3000

const cors = require("cors")

const app = express()

const transporter = require('./mailer.js');

app.use((req, res, next) => {
  if (req.originalUrl === '/webhook') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

app.use(cors({
  origin: process.env.DOMAIN,
  AccessControlAllowOrigin: process.env.DOMAIN,
}))




const stripe = require("stripe")(process.env.STRIPE_PRIVATE_KEY)

///////////////   ITEM OF PAELLA TOUR  /////////////
const storeItems = new Map([
    [1, { priceInCents: 8000, name: "Paella Tour" }],
])


app.post("/create-checkout-session", async (req, res) => {
    const { id, date, time, quantity, phone } = req.body
    console.log(req.body)
    try {
      const storeItem = storeItems.get(id)
      const session = await stripe.checkout.sessions.create({
        // payment_method_types: ["card"],
        mode: "payment",
        metadata: { time, date, phone },
        line_items: [{
            price_data: {
                  currency: "eur",
                  product_data: {
                      name: storeItem.name,
                      // image: [newImage],
                      // metadata: { time, date, phone },
                  },
                  unit_amount: storeItem.priceInCents,
                  tax_behavior: "inclusive",
            },
            quantity: quantity,
            adjustable_quantity: {enabled: true}
        },],
        success_url:  `${process.env.CLIENT_URL}/success` ,
        cancel_url: process.env.CLIENT_URL ,
        payment_intent_data: {metadata: { time, date, phone }},
        // custom_text: {
        //   submit: {message: "We'll email you instructions on how to get started."},
        // },
})
    res.json({ url: session.url })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})


/////////////////////  WEBHOOK  /////////////////////////////////////////////////////
/////////////////////  WEBHOOK  ////////////////////////////////////////////////////
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

app.post('/webhook', express.raw({type: 'application/json'}), async (request, response) => {
  let event = JSON.parse(request.body);

  if (webhookSecret) {
    const signature = request.headers['stripe-signature'];
    try {
      event = stripe.webhooks.constructEvent(
        request.body,
        signature,
        webhookSecret
      );
    } catch (err) {
      console.log(`❌ Error message: ${err.message}`);
      response.status(400).send(`⚠️ Webhook signature verification failed: ${err.message}`);

      // return response.sendStatus(400);
    }
  }

  ////////////////  HANDLE THE EVENT   /////////////////////////////////
  ////////////////  HANDLE THE EVENT   /////////////////////////////////
  switch (event.type) {
    case 'checkout.session.completed':

      const paymentIntent = await stripe.paymentIntents.retrieve(
        event.data.object.payment_intent
      );

      const session = await stripe.checkout.sessions.retrieve(
        event.data.object.id,
        { expand: ['line_items'] }
      );

      const email = session.customer_details.email
      const name = session.customer_details.name
      const country = session.customer_details.address.country
      const phone = session.metadata.phone
      const description = session.line_items.data[0].description
      const date = session.metadata.date
      const time = session.metadata.time
      const price = `€ ${session.line_items.data[0].price.unit_amount/100}`
      const quantity = session.line_items.data[0].quantity
      const amunt_total = `€ ${session.line_items.data[0].amount_total/100}`
      const payment_status = paymentIntent.status
      const payment_intent = paymentIntent.id
      const client_secret = paymentIntent.client_secret
      const payment_method_types = paymentIntent.payment_method_types
      const checkout_id = session.id


////////// GMAIL //////////////////////////////////////////////
////////// Email to us
  await transporter.sendMail({
    from: '"Paella Tour" <paellatour.es@gmail.com>', // sender address
    to: 'paellatour.es@gmail.com',
    subject: `NEW: ${date}, ${time}hs`,
    html: `
    <h3>Checkout: ${date}, ${time}</h3>
    <ul>
      <li><b>Name: </b>${name}</li>
      <li><b>Email: </b>${email}</li>
      <li><b>Country: </b>${country}</li>
      <li><b>Phone: </b>${phone}</li>
      <li><b>Description: </b>${description}</li>
      <li><b>Date: </b>${date}</li>
      <li><b>Time: </b>${time}</li>
      <li><b>Price: </b>${price}</li>
      <li><b>Quantity: </b>${quantity}</li>
      <li><b>Amunt Total: </b>${amunt_total}</li>
      <li><b>Payment Status: </b>${payment_status}</li>
      <li><b>Payment Intent: </b>${payment_intent}</li>
      <li><b>Payment Method Types: </b>${payment_method_types}</li>
      <li><b>Client Secret: </b>${client_secret}</li>
      <li><b>Checkout ID: </b>${checkout_id}</li>
    </ul>
    `,
  });
////////// End of GMAIL //////////////////////////////////////////////
      break;

    case 'charge.succeeded':
      // const paymentMetadata = await stripe.paymentIntents.retrieve(
      //   event.data.object.payment_intent
      //   );

      let receipt = {}
      receipt.id = event.data.object.id
      receipt.url = event.data.object.receipt_url
      receipt.email = event.data.object.billing_details.email
      receipt.name = event.data.object.billing_details.name
      receipt.payment_intent = event.data.object.payment_intent
      receipt.payment_method_details = event.data.object.payment_method_details
      receipt.time = event.data.object.metadata.time
      receipt.date = event.data.object.metadata.date
      receipt.phone = event.data.object.metadata.phone

        console.log('🧾  Receipt  🧾')
        console.log(receipt)

////////// GMAIL //////////////////////////////////////////////
////////// Email to client
      await transporter.sendMail({
        from: '"Paella Tour" <paellatour.es@gmail.com>',
        to: `${receipt.email}`,
        subject: "😀 Thank you for your tour purchase!",
        html: `
        <h3>Hello ${receipt.name} 👋 </h3>
        <p>
          Thank you for choosing to book a tour with us! We are thrilled to have the opportunity to show you around Alicante and provide you with a memorable experience.
          <br><br>
          Your tour has been scheduled for <b> 🗓 ${receipt.date} at ⏰ ${receipt.time}hs</b>, and we look forward to welcoming you on board. Please arrive at the meeting point at least 15 minutes before the scheduled start time.
          <br><br>
          To ensure you have a comfortable and enjoyable tour, we recommend that you wear comfortable shoes and clothing suitable for the weather. We also encourage you to bring your camera or smartphone to capture the beautiful moments during the tour.
          <br><br>
          If you have any questions or concerns before the tour, please don't hesitate to contact us for this way or our Whatsapp 📲 +34 687 489 741 or doing <a href='https://wa.me/34687489741'><b>click here</b></a>. We are always happy to help and ensure that you have the best experience possible.
          <br><br>
          By clicking <a href=${receipt.url}><b>here</b></a> you can find the receipt for your purchase.
          <br><br>
          Thank you again for choosing to book a tour with us. We are honored  and can't wait to share this experience with you.
          <br><br>
          <br><br>
          <br><br>
          <b>Poner que te vamos a contactar al numero : ${receipt.phone} , si quisiera cambiarlo o tiene otro que lo envie por email</b>
          <br><br>
          Best regards,
          <br>
          Paella Tour
        </p>
        `,
      });

////////// Email to us
      await transporter.sendMail({
        from: '"Paella Tour" <paellatour.es@gmail.com>', // sender address
        to: 'paellatour.es@gmail.com',
        subject: `Receipt of ${receipt.email}`,
        html: `
        <h3>Receipt id ${receipt.id} </h3>
        <ul>
          <li><b>Name: </b>${receipt.name}</li>
          <li><b>Email: </b>${receipt.email}</li>
          <li><b>Phone: </b>${receipt.phone}</li>
          <li><b>Date: </b>${receipt.date}</li>
          <li><b>Time: </b>${receipt.time}</li>
          <li><b>ID Receipt: </b>${receipt.id}</li>
          <li><b>URL: </b>${receipt.url}</li>
          <li><b>Payment Intent: </b>${receipt.payment_intent}</li>
          <li><b>Payment Method Details: </b>${receipt.payment_method_details}</li>
        </ul>
        `,
      });
////////// End of GMAIL //////////////////////////////////////////////
      break;

    // case 'checkout.session.expired':
    //   const checkoutSessionExpired = event.data.object;
    //   console.log(checkoutSessionExpired)
    //   break;

    // case 'payment_intent.canceled':
    //   const paymentIntentCanceled = event.data.object;
    //   console.log(paymentIntentCanceled)
    //   break;

    case 'payment_intent.payment_failed':
      const paymentIntentPaymentFailed = event.data.object;
      console.log('❌  Payment Failed  ❌')
      console.log(paymentIntentPaymentFailed)
      // emailCustomerAboutFailedPayment(session); // crear la funcion
      break;

    //  case 'payment_intent.created':
    //   const paymentIntentCreated = event.data.object;
    //   // console.log(paymentIntentCreated.amount_details)
    //   break;

    // case 'payment_intent.succeeded':
    //   let payment = {}
    //   payment.payment_intent = event.data.object.id
    //   payment.clientSecret = event.data.object.client_secret
    //   payment.status = event.data.object.status
    //   payment.payment_method_types = event.data.object.payment_method_types
    // break;


//////////////////////////////////


    // ... handle other event types
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  response.send();
});


app.post("/contact", async (request, response)=>{
  const {name, email, message} =  request.body
  try {
    await transporter.sendMail({
      from: '"Paella Tour" <paellatour.es@gmail.com>',
      to: 'paellatour.es@gmail.com',
      subject: `CONTACT - ${email}`,
      html: `
      <h2>- CONTACT -</h2>
      <ul>
        <li><b>Name: </b>${name}</li>
        <li><b>Message: </b>${message}</li>
      </ul>
      `,
    });
  } catch (error) {
    response.status(500).json({ error: error.message })
  }
})


app.post("/private-tour", async (request, response)=>{
  const {name, email, message} =  request.body
  try {
    await transporter.sendMail({
      from: '"Paella Tour" <paellatour.es@gmail.com>',
      to: 'paellatour.es@gmail.com',
      subject: `PRIVATE TOUR - ${email}`,
      html: `
      <h2>- PRIVATE TOUR -</h2>
      <ul>
        <li><b>Name: </b>${name}</li>
        <li><b>Message: </b>${message}</li>
      </ul>
      `,
    });
  } catch (error) {
    response.status(500).json({ error: error.message })
  }
})






app.listen(PORT, () => console.log(`Running on port ${PORT}`))