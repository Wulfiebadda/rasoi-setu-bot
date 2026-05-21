const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { GoogleGenAI } = require('@google/genai');
const http = require('http');

// 1. Render.com par 24/7 chalane ke liye chhota sa Dummy Server
http.createServer((req, res) => res.end('Rasoi Setu Bot is alive!')).listen(process.env.PORT || 3000);

// 2. Gemini Initialize (API Key check)
if (!process.env.GEMINI_API_KEY) {
    console.error("❌ ERROR: Gemini API Key nahi mili! Pehle terminal me key set karein.");
    process.exit(1);
}
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 3. Rasoi Setu Ka System Prompt
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
        printQRInTerminal: true,
        // 👇 YEH LINE CONNECTION ISSUE SOLVE KAREGI
        browser: ['Rasoi Setu Bot', 'Chrome', '1.0.0']
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        if (qr) {
            console.log("\n👉 Apne WhatsApp Se Is QR Code Ko Scan Karein:");
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            console.log('🔄 Connection close ho gaya, bot restart ho raha hai...');
            startBot(); // Auto-restart
        } else if (connection === 'open') {
            console.log('🎉 BINGO! Rasoi Setu B2B Bot WhatsApp Se Connect Ho Gaya Hai!');
        }
    });

    // Login save rakhega
    sock.ev.on('creds.update', saveCreds);

    // Naya message aane par
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const fromNumber = msg.key.remoteJid;
        const userText = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (userText) {
            console.log(`\n💬 Restaurant Owner Said: ${userText}`);

            try {
                const lowerText = userText.toLowerCase().trim();
                
                // Welcome Menu
                if (lowerText === 'hi' || lowerText === 'hello' || lowerText === 'demo' || lowerText === 'namaste') {
                    await sock.sendPresenceUpdate('composing', fromNumber);
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    
                    const welcomeMessage = "👋 Hello! Rasoi Setu me aapka swagat hai.\n\nHum restaurants, cafes aur cloud kitchens ko direct orders lene, zero commission par operate karne aur apna POS/Kitchen manage karne me madad karte hain. 🚀\n\nAapko kis baare me jankari chahiye?\n1️⃣ Features & POS\n2️⃣ Pricing & Plans\n3️⃣ Book a Demo\n\nAap apna sawal niche type kar sakte hain! 👇";
                    
                    await sock.sendPresenceUpdate('paused', fromNumber);
                    await sock.sendMessage(fromNumber, { text: welcomeMessage });
                    return;
                }

                // Gemini AI Response
                await sock.sendPresenceUpdate('composing', fromNumber);
                
                const response = await ai.models.generateContent({
                    model: 'gemini-1.5-flash',
                    contents: userText,
                    config: {
                        systemInstruction: rasoiSetuPrompt
                    }
                });
                
                const botReply = response.text;

                // Human-like typing delay
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