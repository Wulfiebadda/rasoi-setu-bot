const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { GoogleGenAI } = require('@google/genai');
const http = require('http');

// Render.com par 24/7 chalane ke liye chhota sa Dummy Server
http.createServer((req, res) => res.end('Rasoi Setu Bot is alive!')).listen(process.env.PORT || 3000);

if (!process.env.GEMINI_API_KEY) {
    console.error("❌ ERROR: Gemini API Key nahi mili! Pehle Render me key set karein.");
    process.exit(1);
}
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 👇 YAHAN APNA BOT WALA WHATSAPP NUMBER DALEIN (91 ke sath)
const phoneNumber = "918860088652"; // Example: "919876543210"

const rasoiSetuPrompt = `
Aap "Rasoi Setu" ke ek expert, professional aur helpful WhatsApp Chatbot hain. 
Aapka kaam restaurant owners, cloud kitchens aur cafe owners ko Rasoi Setu platform ke baare me jankari dena hai. 
Aapko hamesha HINGLISH (Hindi written in English alphabet) me hi reply karna hai. Tone professional par friendly honi chahiye.

Rasoi Setu ki details:
- About: Restaurant commerce platform for direct orders, POS, kitchen & operations.
- Booking / Demo: Demo book karne ke liye rasoisetu.in par jayein ya isi WhatsApp par chat karein.
- Commission: Hum restaurants ki high-commission aggregators par dependency kam karte hain.
- Delivery: Hum restaurant-managed delivery workflows support karte hain.
- Easy Setup: Restaurants ki onboarding quick hoti hai.
- Features: Online ordering, POS sync, kitchen management, table ops, order tracking milti hai.
- How it works: Customer orders → Restaurant receives instantly → Kitchen processes → Delivery/fulfillment → Payment settlement.
- Pricing: Custom aur business-based pricing hai. Exact plan ke liye sales team se contact karein.

Instruction: Hamesha short aur point-to-point jawab dein. Bullet points aur emojis ka use karein.
`;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // QR Code band kar diya hai
        browser: ['Ubuntu', 'Chrome', '20.0.04'] // Safe browser name
    });

    // 🔑 YAHAN PAIRING CODE GENERATE HOGA
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log(`\n==============================================`);
                console.log(`👉 AAPKA PAIRING CODE HAI: ${code}`);
                console.log(`==============================================\n`);
            } catch (error) {
                console.error("Pairing code error:", error);
            }
        }, 3000);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'close') {
            console.log('🔄 Connection close ho gaya, bot restart ho raha hai...');
            startBot(); 
        } else if (connection === 'open') {
            console.log('🎉 BINGO! Rasoi Setu B2B Bot WhatsApp Se Connect Ho Gaya Hai!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const fromNumber = msg.key.remoteJid;
        const userText = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (userText) {
            console.log(`\n💬 Restaurant Owner Said: ${userText}`);

            try {
                const lowerText = userText.toLowerCase().trim();
                
                if (lowerText === 'hi' || lowerText === 'hello' || lowerText === 'demo' || lowerText === 'namaste') {
                    await sock.sendPresenceUpdate('composing', fromNumber);
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    
                    const welcomeMessage = "👋 Hello! Rasoi Setu me aapka swagat hai.\n\nHum restaurants, cafes aur cloud kitchens ko direct orders lene, zero commission par operate karne aur apna POS/Kitchen manage karne me madad karte hain. 🚀\n\nAapko kis baare me jankari chahiye?\n1️⃣ Features & POS\n2️⃣ Pricing & Plans\n3️⃣ Book a Demo\n\nAap apna sawal niche type kar sakte hain! 👇";
                    
                    await sock.sendPresenceUpdate('paused', fromNumber);
                    await sock.sendMessage(fromNumber, { text: welcomeMessage });
                    return;
                }

                await sock.sendPresenceUpdate('composing', fromNumber);
                
                const response = await ai.models.generateContent({
                    model: 'gemini-1.5-flash',
                    contents: userText,
                    config: {
                        systemInstruction: rasoiSetuPrompt
                    }
                });
                
                const botReply = response.text;
                await new Promise(resolve => setTimeout(resolve, 2000));

                await sock.sendPresenceUpdate('paused', fromNumber);
                await sock.sendMessage(fromNumber, { text: botReply });
                console.log(`🤖 Bot Replied: ${botReply}`);

            } catch (error) {
                console.error("❌ Gemini Error:", error);
            }
        }
    });
}

startBot();