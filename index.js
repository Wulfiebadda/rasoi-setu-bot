const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { GoogleGenAI } = require('@google/genai');
const http = require('http');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, set, get, child } = require('firebase/database');

// Render Server Keep-Alive
http.createServer((req, res) => res.end('Rasoi Setu Bot is alive!')).listen(process.env.PORT || 3000);

if (!process.env.GEMINI_API_KEY) {
    console.error("❌ ERROR: Gemini API Key nahi mili!");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 🔥 FIREBASE SETUP
const firebaseConfig = {
  apiKey: "AIzaSyDec0PrkW4aaL5T4TiKIzywpUa3r7XuXQ4",
  authDomain: "rasoisetubot.firebaseapp.com",
  databaseURL: "https://rasoisetubot-default-rtdb.firebaseio.com",
  projectId: "rasoisetubot",
  storageBucket: "rasoisetubot.firebasestorage.app",
  messagingSenderId: "829620203320",
  appId: "1:829620203320:web:692220efbb385d64f05bcd"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 👇 YAHAN AAPKA BOT NUMBER SET HAI
const botPhoneNumber = "918860088652"; 

// 👇 MANAGER KA NUMBER JIS PAR ALERTS AAYENGE
const managerNumber = "918618086211@s.whatsapp.net";

// 🧠 NAYA AI PROMPT (With Image Data Added)
const rasoiSetuPrompt = `
Aap "Rasoi Setu" ke ek bohot hi friendly, helpful aur polite WhatsApp Chatbot hain. 
Aapko hamesha aasan "HINGLISH" me baat karni hai (Jaise normal log WhatsApp par chat karte hain).

[STRICT LANGUAGE & LENGTH RULE]
- Pure Hindi words bilkul use NAHI karne hain ("Kshama" ki jagah "Sorry", "Sampark" ki jagah "Contact", "Jankari" ki jagah "Details").
- Aapke replies hamesha chhote aur point-to-point hone chahiye (2-3 lines se zyada nahi). Lamba paragraph mat likhna.

[GREETING RULE - SABSE ZAROORI]
Agar customer ka pehla message ho (jaise Hi, Hello, Hey), toh EXACTLY yeh reply dena hai:
"👋 Hello! Rasoi Setu me aapka swagat hai.

Hum restaurants, cafes aur cloud kitchens ko direct orders lene, zero commission par operate karne aur apna POS/Kitchen manage karne me madad karte hain. 🚀

Aapko kis baare me jankari chahiye?
1️⃣ Features & POS
2️⃣ Pricing & Plans
3️⃣ Book a Demo

Aap apna sawal niche type kar sakte hain! 👇"

[RASOI SETU FULL KNOWLEDGE BASE - USE THIS TO ANSWER ANY QUESTION]
Niche di gayi details ko dhyan se padhein aur customer ke kisi bhi sawal ka jawab isme se dhund kar aasan shabdon me dein:

- What is it: Rasoi Setu is a professional restaurant POS system and management software designed to synchronize billing counters, Kitchen Display System (KDS), and inventory in real-time.
- Main Benefit: 100% Retained Revenue. 0% Commission. Aggregators (Swiggy/Zomato) take 30% cut. We give direct flow. Average savings: ₹30,000/month (based on 1000 orders). 
- Setup time: Quick Setup in under 48 hours with concierge onboarding.
- Trust factors: 99.9% Uptime Guaranteed, 1M+ Orders Processed, 24/7 Support Coverage, 12 Cities Support Locations.

[NEW: CATEGORY DETAILS]
- Service Locations: Delhi, Noida, Gurgaon, Ghaziabad, Faridabad, aur poore India me available hai.
- Solutions By Format: Cafes, Cloud Kitchens, QSR Counters, Fine Dining, aur Franchise Chains ke liye specialized POS.
- Operational Features: GST Billing Software, Kitchen Display Systems (KDS), Inventory Management, Analytics & Reporting, Table Order Tracking.
- Digital Growth Suite: QR Ordering System, WhatsApp Ordering, Commission-Free Ordering, Direct Ordering Websites, UPI Direct Checkout.

[CONTACT / CALL / DEMO RULE]
Agar customer baat karne, call karne, pricing, demo book karne ya contact karne ke liye bole, toh politely yeh number dein: +91 861 808 6211
Aur us message ke end me [NOTIFY_MANAGER] tag zaroor lagayein.
Example: "Ji bilkul, iski details ke liye aap humari team se is number par direct baat kar sakte hain: +91 861 808 6211 😊 [NOTIFY_MANAGER]"

[OTHER RULES]
- Agar koi sawal is knowledge base se bahar ka hai, toh polite hoke short answer dein aur wapas bot ki details par focus karein.
- Tumhe sare answers aise dene hai ki customer ko lage ki tum real human ho or tumhe emojies bohot kam use karni hai.
- Tumhe har ek customer ko manupilate karna hai taki vo hamare sath hi kaam kare.

`;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_session_fresh_v2');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, 
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    sock.ev.on('connection.update', (update) => {
        if (update.connection === 'close') startBot(); 
        else if (update.connection === 'open') console.log('🎉 Bot Connected!');
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        
        if (!msg.message || msg.key.fromMe) return;

        const fromNumber = msg.key.remoteJid;
        
        if (fromNumber.endsWith('@g.us') || fromNumber === 'status@broadcast') return;

        const pureNumber = fromNumber.split('@')[0].split(':')[0]; 
        const userText = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (userText) {
            try {
                const dbRef = ref(db);
                const snapshot = await get(child(dbRef, `chats/${pureNumber}`));
                let chatHistory = [];
                if (snapshot.exists()) {
                    chatHistory = snapshot.val().history || [];
                }

                const chatSession = ai.chats.create({
                    model: 'gemini-1.5-flash',
                    config: { systemInstruction: rasoiSetuPrompt },
                    history: chatHistory
                });

                await sock.sendPresenceUpdate('composing', fromNumber);
                
                const response = await chatSession.sendMessage({ message: userText });
                let botReply = response.text;

                if (botReply.includes("[NOTIFY_MANAGER]")) {
                    botReply = botReply.replace("[NOTIFY_MANAGER]", "").trim();
                    const alertMsg = `🚨 *NEW CUSTOMER ALERT* 🚨\n\n*Customer No:* +${pureNumber}\n*Direct Chat:* https://wa.me/${pureNumber}\n*Customer Said:* "${userText}"\n\n_Is customer ne Price/Call/Order ki request ki hai. Please jaldi contact karein!_`;
                    
                    await sock.sendMessage(managerNumber, { text: alertMsg });
                    console.log(`📲 Manager Alert Sent to ${managerNumber}`);
                }

                await sock.sendPresenceUpdate('paused', fromNumber);
                await sock.sendMessage(fromNumber, { text: botReply });

                const updatedHistory = await chatSession.getHistory();
                await set(ref(db, 'chats/' + pureNumber), {
                    history: updatedHistory,
                    lastUpdated: Date.now()
                });

            } catch (error) {
                console.error("❌ Error:", error);
            }
        }
    });
}

startBot();
