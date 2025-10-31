// index.js
const express = require("express");
const fs = require("fs");
const cors = require("cors");
const mongoose = require("mongoose");
const { GoogleGenerativeAI } = require("@google/generative-ai"); // Gemini SDK

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Middleware =====
app.use(cors());
app.use(express.json());

// ===== MongoDB Connection =====
mongoose
  .connect("mongodb://localhost:27017/intentDB", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ===== MongoDB Schema =====
const intentSchema = new mongoose.Schema({
  userInput: String,
  intentJSON: Object,
  timestamp: { type: Date, default: Date.now },
});

const Intent = mongoose.model("Intent", intentSchema);

// ===== Gemini Setup =====
const genAI = new GoogleGenerativeAI("AIzaSyA0NQ-PeMNCr5r-dAz_Pl77f11kNuOhn58");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// ===== Variable to store last classified JSON =====
let lastClassifiedJSON = { message: "No classification yet." };

// ===== Normalization Function =====
function normalizeGeminiJSON(raw) {
  if (!raw || typeof raw !== "object") return raw;
  const normalized = { ...raw };

  if (normalized.taskType === "book_cab" && normalized.payload) {
    const p = normalized.payload;
    normalized.provider = normalized.provider || "Ola/Uber";
    normalized.payload = {
      vehicleType: p.vehicleType || p.vehicle_Type || p.vehicle_type || p.vehicle || "auto",
      pickupLocation: p.pickupLocation || p.pickup_location || p.start_location || p.source || p.from || "",
      dropLocation: p.dropLocation || p.drop_location || p.end_location || p.destination || p.to || "",
    };
  } else if (normalized.taskType === "send_message" && normalized.payload) {
    const p = normalized.payload;
    normalized.provider = normalized.provider || "WhatsApp";
    normalized.payload = {
      recipient: p.recipient || p.to || p.receiver || p.contact || "",
      message: p.message || p.text || p.body || "",
    };
  } else if (normalized.taskType === "calling" && normalized.payload) {
    const p = normalized.payload;
    normalized.provider = normalized.provider || "WhatsApp";

    let type = p.callType || p.call_type || p.type || p.mode;
    if (type) {
      type = type.toLowerCase();
      if (type.includes("video")) type = "videocall";
      else type = "phonecall";
    } else {
      type = "phonecall";
    }

    normalized.payload = {
      recipient: p.recipient || p.to || p.contact || p.callee || "",
      callType: type,
    };
  } else if (normalized.taskType === "playmusic" && normalized.payload) {
    const p = normalized.payload;
    normalized.provider = "youtube";
    normalized.payload = {
      song: p.song || p.music || p.track || "",
    };
  } else if (normalized.taskType === "orderfood" && normalized.payload) {
    const p = normalized.payload;
    normalized.provider = "zomato/swiggy";

    const dish = p.dish || p.food || p.item || "";
    const quantity = p.quantity || p.qty || 1;

    // Determine orderType
    let orderType = "new";
    if (!dish) {
      orderType = "existing";
    }

    normalized.payload = {
      orderType,
      dish,
      quantity,
    };
  } else {
    normalized.taskType = normalized.taskType || "unknown";
    normalized.provider = normalized.provider || "generic";
    normalized.payload = normalized.payload || {};
  }

  return normalized;
}

// ===== Extract Intent via Gemini =====
async function extractIntentWithLLM(userInput) {
  const prompt = `
You are an intelligent assistant.
Convert the user's input into ONE of these fixed JSON schemas only:

1️⃣ For cab bookings:
{
  "taskType": "book_cab",
  "provider": "Ola/Uber",
  "payload": {
    "vehicleType": "string (auto/sedan/suv/bike etc., default auto if not mentioned)",
    "pickupLocation": "string",
    "dropLocation": "string"
  }
}

2️⃣ For sending messages:
{
  "taskType": "send_message",
  "provider": "WhatsApp",
  "payload": {
    "recipient": "string (who to message)",
    "message": "string (what to send)"
  }
}

3️⃣ For calling:
{
  "taskType": "calling",
  "provider": "WhatsApp",
  "payload": {
    "recipient": "string (who to call)",
    "callType": "phonecall/videocall"
  }
}

4️⃣ For playing music:
{
  "taskType": "playmusic",
  "provider": "youtube",
  "payload": {
    "song": "string (song name to play)"
  }
}

5️⃣ For ordering food:
{
  "taskType": "orderfood",
  "provider": "zomato/swiggy",
  "payload": {
    "orderType": "new" or "existing",
    "dish": "string (name of food, e.g. biryani)",
    "quantity": "number (default 1 if not provided)"
  }
}

If the user's input says vague phrases like "order food", "make a new order", "order something" without mentioning dish name,
return exactly:
{ "error": "Missing required information. Please ask the user for more details." }

If any required value is missing or null, return same error JSON.

Return only valid JSON — no explanation.
User input: "${userInput}"
`;

  console.log("Prompt sent to Gemini:\n", prompt);

  try {
    const result = await model.generateContent(prompt);
    const textResponse = result.response.text().trim();
    console.log("Gemini Raw Response:\n", textResponse);

    const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return normalizeGeminiJSON(parsed);
    } else {
      return { error: "Failed to process command. Please try again." };
    }
  } catch (err) {
    console.error("Gemini Error:", err);
    return { error: "Failed to process command. Please try again." };
  }
}

// ===== POST /classify =====
app.post("/classify", async (req, res) => {
  const userInput = req.body.input;
  if (!userInput)
    return res.status(400).json({ error: "Input is required", speakMessage: "Input is required" });

  console.log("Received input:", userInput);

  // Step 1: Handle repeat commands
  if (/\b(repeat|again|do\s+that|same\s+thing|previous)\b/i.test(userInput)) {
    console.log("🔁 Detected repeat-type command");

    let lastRecord;
    let friendlyResponse = "";

    if (/(cab|taxi|ride)/i.test(userInput)) {
      lastRecord = await Intent.findOne({ "intentJSON.taskType": "book_cab" }).sort({ timestamp: -1 });
      friendlyResponse = "Sure! Repeating your last cab booking now 🚖.";
    } else if (/(message|whatsapp|text|sms|send)/i.test(userInput)) {
      lastRecord = await Intent.findOne({ "intentJSON.taskType": "send_message" }).sort({ timestamp: -1 });
      friendlyResponse = "Sure! Repeating your last WhatsApp message now 📱.";
    } else if (/(call|phone|dial)/i.test(userInput)) {
      lastRecord = await Intent.findOne({ "intentJSON.taskType": "calling" }).sort({ timestamp: -1 });
      friendlyResponse = "Got it! Repeating your last call 📞.";
    } else if (/(song|music|play|youtube)/i.test(userInput)) {
      lastRecord = await Intent.findOne({ "intentJSON.taskType": "playmusic" }).sort({ timestamp: -1 });
      friendlyResponse = "Okay! Replaying your last song 🎵.";
    } else if (/(food|order|zomato|swiggy)/i.test(userInput)) {
      lastRecord = await Intent.findOne({ "intentJSON.taskType": "orderfood" }).sort({ timestamp: -1 });
      friendlyResponse = "Reordering your last food item 🍱.";
    } else {
      lastRecord = await Intent.findOne().sort({ timestamp: -1 });
      friendlyResponse = "Okay! Repeating your most recent action 🔁.";
    }

    if (!lastRecord) {
      return res.json({
        error: "No matching previous task found in database.",
        speakMessage: "No matching previous task found in database.",
      });
    }

    const intentJSON = lastRecord.intentJSON;
    lastClassifiedJSON = intentJSON;

    const uipathDataPath = "C:/Users/kulsum ansari/OneDrive/Documents/UiPath/intent_data.json";
    const triggerPath = "C:/Users/kulsum ansari/OneDrive/Documents/UiPath/trigger.txt";

    try {
      fs.writeFileSync(uipathDataPath, JSON.stringify(intentJSON, null, 2));
      fs.writeFileSync(triggerPath, "retriggered at " + new Date());
      console.log("🚀 Re-triggered UiPath with previous task.");
    } catch (err) {
      console.error("Error writing trigger files:", err);
    }

    return res.json({ ...intentJSON, speakMessage: friendlyResponse });
  }

  // Step 2: Normal classification
  const intentJSON = await extractIntentWithLLM(userInput);
  lastClassifiedJSON = intentJSON;

  if (intentJSON.error) {
    return res.json({ error: intentJSON.error, speakMessage: intentJSON.error });
  }

  const { taskType, payload } = intentJSON;
  const missingFields = [];

  if (taskType === "book_cab") {
    if (!payload.pickupLocation) missingFields.push("pickup location");
    if (!payload.dropLocation) missingFields.push("drop location");
  } else if (taskType === "send_message") {
    if (!payload.recipient) missingFields.push("recipient");
    if (!payload.message) missingFields.push("message content");
  } else if (taskType === "calling") {
    if (!payload.recipient) missingFields.push("recipient");
  } else if (taskType === "playmusic") {
    if (!payload.song) missingFields.push("song name");
  } else if (taskType === "orderfood") {
    if (!payload.dish) {
      const invalidText = "Please specify what food item you want to order.";
      return res.json({ error: invalidText, speakMessage: invalidText });
    }
  }

  if (missingFields.length > 0) {
    const errorText = `Please provide valid ${missingFields.join(" and ")}.`;
    return res.json({ error: errorText, speakMessage: errorText });
  }

  // Step 3: Save valid intent
  try {
    await Intent.create({ userInput, intentJSON });
    console.log("💾 Intent saved to MongoDB.");
  } catch (err) {
    console.error("MongoDB save error:", err);
  }

  // Step 4: Trigger UiPath for valid intents
  const uipathDataPath = "C:/Users/kulsum ansari/OneDrive/Documents/UiPath/intent_data.json";
  const triggerPath = "C:/Users/kulsum ansari/OneDrive/Documents/UiPath/trigger.txt";
  let speakMessage = "";

  try {
    fs.writeFileSync(uipathDataPath, JSON.stringify(intentJSON, null, 2));
    fs.writeFileSync(triggerPath, "triggered at " + new Date());
    console.log("✅ Trigger + data file created for UiPath workflow.");
  } catch (err) {
    console.error("Error creating trigger files:", err);
  }

  if (taskType === "book_cab")
    speakMessage = `Booking a ${payload.vehicleType} from ${payload.pickupLocation} to ${payload.dropLocation}. 🚗`;
  else if (taskType === "send_message")
    speakMessage = `Sending message to ${payload.recipient} on WhatsApp. 💬`;
  else if (taskType === "calling")
    speakMessage = `Calling ${payload.recipient} via ${payload.callType}. 📞`;
  else if (taskType === "playmusic")
    speakMessage = `Playing ${payload.song} on YouTube 🎶`;
  else if (taskType === "orderfood")
    speakMessage = `Ordering ${payload.quantity} ${payload.dish}(s) via ${intentJSON.provider}. 🍴`;

  res.json({ ...intentJSON, speakMessage });
});

// ===== GET & POST /last-classified =====
app.get("/last-classified", (req, res) => {
  res.json(lastClassifiedJSON);
  if (lastClassifiedJSON.status === "success") {
    lastClassifiedJSON = { message: "No classification yet." };
  }
});

app.post("/last-classified", (req, res) => {
  const { status, message } = req.body;
  lastClassifiedJSON = {
    status: status || "success",
    message: message || "Task completed successfully by UiPath.",
    timestamp: new Date(),
  };
  res.json({ ok: true, received: lastClassifiedJSON });
});

// ===== GET /history =====
app.get("/history", async (req, res) => {
  const intents = await Intent.find().sort({ timestamp: -1 }).limit(10);
  res.json(intents);
});

// ===== Start Server =====
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
