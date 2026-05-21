const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { GoogleGenAI } = require('@google/genai');
const http = require('http');
const { MongoClient } = require('mongodb');

// Render Server
http.createServer((req, res) => res.end('Rasoi Setu Bot is alive!')).listen(process.env.PORT || 3000);

// API Keys Check
if (!process.env.GEMINI_API_KEY || !process.env.MONGO_URL) {
    console.error("❌ ERROR: Gemini API Key ya MONGO_URL nahi mili!");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const mongoClient = new MongoClient(process.env.MONGO_URL);
let chatCollection;

// 👇 YAHAN APNA WHATSAPP NUMBER DALEIN (Bot Wala)
const botPhoneNumber = "91XXXXXXXXXX"; 

// 👇 YAHAN WOH NUMBER HAI JIS PAR ALERTS AAYENGE (Manager Number)
const managerNumber = "918618086211@s.whatsapp.net";

// 🧠 BOT KA NAYA TRAINING DATA AUR RULES
const rasoiSetuPrompt = `
Aap "Rasoi Setu" ke ek behad polite, respectful aur professional WhatsApp Chatbot hain. 
Aapko hamesha customer ki respect karni hai ('Aap', 'Ji' ka use karein) aur HINGLISH me baat karni hai.

[RASOI SETU KI JANKARI]
- About: Rasoi Setu ek restaurant growth partner hai jo restaurants ko unke operations manage karne mein madad karta hai. Yeh restaurants ko empower karta hai taaki wo apne customers se directly WhatsApp aur unki khud ki website ke zariye online orders le sakein.
- How it works: Sabse pehle restaurant ko onboard kiya jata hai. Menu, payment aur ordering system setup hota hai. Customer WhatsApp/website se order place karte hain, jo instantly kitchen system tak pohoch jata hai. Fir restaurant khana prepare karke delivery/pickup ke liye bhej deta hai.
- Features: WhatsApp bot, direct website ordering, seamless payment integration, kitchen order flow, table/order management, aur customer retention tools. Isse aggregator apps (Zomato/Swiggy) par dependency kam hoti hai.
- Pricing: Pricing fix nahi hai. Flexible hai. Total outlets, WhatsApp bot, aur special integrations par depend karti hai.
- Kiske liye sahi hai: QSR, cloud kitchens, cafés, dine-in, aur takeaway brands.
- Kyun chunein: Direct customer ownership, better profit margins (no 3rd party commission), aur fast digital growth.
- Demo/Support: Demo ke liye "rasoisetu.in" par jayein. Support ke liye "SUPPORT" type karein.

[IMPORTANT STRICT RULES - FOLLOW ALWAYS]
1. Politeness: Hamesha polite rahein.
2. Out of Box Queries: Agar customer koi aisi aam jankari puche jo Rasoi Setu se alag ho, toh use bas basic answer dein aur phir politely bolein: "Kshama karein, is baare mein mujhe zyada jankari nahi hai. Main Rasoi Setu ka assistant hu. Kya main aapki restaurant ordering system me kuch madad kar sakta hu?"
3. MANAGER ALERT TRIGGER (MOST IMPORTANT): 
   - Agar customer "Order" place kare, "Price / Costing" puche, ya "Call" karne ki request kare, toh aapko EXACTLY bas yahi reply dena hai: "Ji, main jaldi hi aapki hamare manager se baat karvata hu. [NOTIFY_MANAGER]"
   (Note: Is condition me aapko iske alawa aur koi explanation nahi deni hai, bas yahi exact sentence use karna hai aur [NOTIFY_MANAGER] tag lagana hai).
`;

async function connectDB() {
    try {
        await mongoClient.connect();
        const db = mongoClient.db('RasoiSetuDB');
        chatCollection = db.collection('user_chats');
        console.log("💾 Permanent Memory Connected!");
    } catch (err) {
        console.error("Database connection error:", err);
    }
}

async function startBot() {
    await connectDB();
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(botPhoneNumber);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log(`\n==============================================`);
                console.log(`👉 AAPKA PAIRING CODE HAI: ${code}`);
                console.log(`==============================================\n`);
            } catch (error) {
                console.error("Pairing error:", error);
            }
        }, 3000);
    }

    sock.ev.on('connection.update', (update) => {
        if (update.connection === 'close') startBot(); 
        else if (update.connection === 'open') console.log('🎉 Bot Connected!');
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const fromNumber = msg.key.remoteJid;
        const userText = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (userText) {
            try {
                let userRecord = await chatCollection.findOne({ phone: fromNumber });
                let chatHistory = userRecord ? userRecord.history : [];

                const chatSession = ai.chats.create({
                    model: 'gemini-1.5-flash',
                    config: { systemInstruction: rasoiSetuPrompt },
                    history: chatHistory
                });

                await sock.sendPresenceUpdate('composing', fromNumber);
                
                const response = await chatSession.sendMessage({ message: userText });
                let botReply = response.text;

                // 🚨 MANAGER ALERT LOGIC 🚨
                if (botReply.includes("[NOTIFY_MANAGER]")) {
                    botReply = botReply.replace("[NOTIFY_MANAGER]", "").trim();
                    
                    const alertMsg = `🚨 *NEW CUSTOMER ALERT* 🚨\n\n*Customer No:* +${fromNumber.split('@')[0]}\n*Customer Said:* "${userText}"\n\n_Is customer ne Price puchi hai, Call maanga hai, ya Order diya hai. Please inse contact karein!_`;
                    
                    await sock.sendMessage(managerNumber, { text: alertMsg });
                    console.log(`📲 Manager Alert Sent to ${managerNumber}`);
                }

                await sock.sendPresenceUpdate('paused', fromNumber);
                await sock.sendMessage(fromNumber, { text: botReply });

                const updatedHistory = await chatSession.getHistory();
                await chatCollection.updateOne(
                    { phone: fromNumber },
                    { $set: { history: updatedHistory } },
                    { upsert: true }
                );

            } catch (error) {
                console.error("❌ Error:", error);
            }
        }
    });
}

startBot();