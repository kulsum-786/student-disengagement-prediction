import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const Index = () => {
  const [page, setPage] = useState<"welcome" | "main">("welcome");
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [manualInput, setManualInput] = useState("");
  const [intentJSON, setIntentJSON] = useState<any>(null);
  const [wordCount, setWordCount] = useState(0);
  const [typedText, setTypedText] = useState(""); // Typing effect
  const [successVisible, setSuccessVisible] = useState(false); // show success UI briefly

  const typedIndex = useRef(0);
  const robotAnim = useRef(new Animated.Value(0)).current; // Bouncing robot

  const recognitionRef = useRef<any>(null);
  const particleAnim = useRef(new Animated.Value(0)).current;

  // ---------- Particle animation ----------
  useEffect(() => {
    Animated.loop(
      Animated.timing(particleAnim, {
        toValue: 1,
        duration: 12000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  // ---------- Bouncing robot animation ----------
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(robotAnim, {
          toValue: -20,
          duration: 500,
          useNativeDriver: true,
          easing: Easing.ease,
        }),
        Animated.timing(robotAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
          easing: Easing.ease,
        }),
      ])
    ).start();
  }, []);

  // ---------- Text-to-Speech ----------
  const speak = (message: string) => {
  if ("speechSynthesis" in window) {
    try {
      // 🧹 Remove emojis and symbols before speaking
      const cleaned = message.replace(
        /([\u2700-\u27BF]|[\uE000-\uF8FF]|[\uD83C-\uDBFF\uDC00-\uDFFF])+/g,
        ""
      );
      const utterance = new SpeechSynthesisUtterance(cleaned.trim());
      utterance.rate = 0.95;
      utterance.pitch = 1.05;
      utterance.volume = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn("TTS error:", err);
    }
  } else {
    console.warn("speechSynthesis not available in this environment.");
  }
};


  // ---------- Welcome page typing effect ----------
  useEffect(() => {
    if (page === "welcome") {
      const message = "👋 Welcome";
      typedIndex.current = 0;
      setTypedText("");
      const interval = setInterval(() => {
        setTypedText((prev) => prev + message[typedIndex.current]);
        typedIndex.current++;
        if (typedIndex.current >= message.length) clearInterval(interval);
      }, 100); // typing speed: 100ms per character
    }
  }, [page]);

  // ---------- Poll backend every 5 seconds to detect UiPath task completion ----------
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("http://localhost:3000/last-classified");
        const data = await res.json();
        console.log("Poll /last-classified ->", data);

        // Accept case-insensitively and handle if message exists
        if (data && data.status && String(data.status).toLowerCase() === "success") {
          // Show message once, set intentJSON to backend data so UI displays it
          setIntentJSON(data);

          const msg = data.message || "Task completed successfully";
          speak(msg);

          // show UI text briefly
          setSuccessVisible(true);
          

          // Pop an alert so user definitely sees it (non-blocking for web)
          
        }
      } catch (err) {
        console.error("Error checking UiPath completion:", err);
      }
    }, 5000); // check every 5 seconds

    return () => clearInterval(interval);
  }, []);

  // ---------- Speech Recognition setup ----------
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("SpeechRecognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";

    recognition.onresult = (event: any) => {
      let currentTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        currentTranscript += event.results[i][0].transcript;
      }
      setTranscript(currentTranscript);
      setWordCount(currentTranscript.trim().split(/\s+/).filter(Boolean).length);
    };

    recognition.onend = () => {
      if (listening) recognition.start();
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch (err) {
        /* ignore */
      }
    };
  }, []);

  const callBackend = async (text: string) => {
  try {
    setIntentJSON(null);
    const res = await fetch("http://localhost:3000/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: text }),
    });
    const data = await res.json();
    setIntentJSON(data);

    if (data.error) {
      // Speak error directly from backend
      speak(data.error);
    } else if (
      data.taskType === "send_message" &&
      (!data.payload.recipient || !data.payload.message)
    ) {
      speak("Please provide both recipient and message content.");
    } else if (data.speakMessage) {
      // Speak normal success message
      speak(data.speakMessage);
    } else {
      // fallback
      speak("Sorry, I couldn't process your request. Please try again.");
    }
  } catch (err) {
    console.error("Backend error:", err);
    setIntentJSON({ error: "Failed to communicate with backend" });
    speak("Failed to communicate with backend");
  }
};



  useEffect(() => {
    if (!listening && transcript.trim()) {
      callBackend(transcript);
      speak("Stop listening");
    }
  }, [listening]);

  const handleManualSubmit = () => {
    if (manualInput.trim()) {
      callBackend(manualInput);
    }
  };

  const toggleListening = () => {
    if (!listening) {
      try {
        recognitionRef.current?.start();
      } catch (err) {
        console.warn("Failed to start recognition:", err);
      }
    } else {
      try {
        recognitionRef.current?.stop();
      } catch (err) {
        console.warn("Failed to stop recognition:", err);
      }
    }
    setListening(!listening);
  };

  // ---------- Key press handler ----------
  useEffect(() => {
    const handleKeyPress = () => {
      if (page === "welcome") {
        setPage("main"); // go to main
        speak("Press any key to start recording your voice input. Press again to stop recording and send your command.");
      } else if (page === "main") {
        toggleListening(); // first key → start, second key → stop
      }
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [page, listening]);

  // ---------- UI ----------

  if (page === "welcome") {
    return (
      <View style={styles.container}>
        <View style={styles.topLeftWave} />
        <View style={styles.bottomRightWave} />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.particleLayer,
            {
              transform: [
                {
                  translateY: particleAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -200],
                  }),
                },
              ],
            },
          ]}
        >
          {[...Array(120)].map((_, i) => (
            <View
              key={i}
              style={[
                styles.particle,
                {
                  left: Math.random() * SCREEN_WIDTH,
                  top: Math.random() * SCREEN_HEIGHT,
                  opacity: Math.random() * 0.8,
                },
              ]}
            />
          ))}
        </Animated.View>

        <Text style={styles.title}>{typedText}</Text>
        <Animated.Text
          style={[styles.robotEmoji, { transform: [{ translateY: robotAnim }] }]}
        >
          🤖
        </Animated.Text>
        <Text style={styles.subtitle}>Press any key to continue</Text>
      </View>
    );
  }

  // ---------- Main Page ----------
  return (
    <View style={styles.container}>
      <View style={styles.topLeftWave} pointerEvents="none" />
      <View style={styles.bottomRightWave} pointerEvents="none" />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.particleLayer,
          {
            transform: [
              {
                translateY: particleAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -200],
                }),
              },
            ],
          },
        ]}
      >
        {[...Array(120)].map((_, i) => (
          <View
            key={i}
            style={[
              styles.particle,
              {
                left: Math.random() * SCREEN_WIDTH,
                top: Math.random() * SCREEN_HEIGHT,
                opacity: Math.random() * 0.8,
              },
            ]}
          />
        ))}
      </Animated.View>

      <Text style={styles.title}>🤖 Automation Agent For Task Completion</Text>

      <TouchableOpacity
        style={[styles.button, listening && styles.buttonActive]}
        onPress={toggleListening}
      >
        <Text style={styles.buttonText}>
          {listening ? "Stop Recording" : "Start Recording"}
        </Text>
      </TouchableOpacity>

      <View style={styles.transcriptBox}>
        <Text style={styles.transcript}>
          {transcript || "Waiting for your speech..."}
        </Text>
      </View>
      <Text style={styles.wordCount}>Words detected: {wordCount}</Text>

      <TextInput
  style={styles.inputBox}
  placeholder="Type your query here..."
  placeholderTextColor="#B2EBF2"
  value={manualInput}
  onChangeText={(text) => {
    setManualInput(text);
    if (successVisible) setSuccessVisible(false); // hide when user starts typing
  }}
  onFocus={() => setSuccessVisible(false)} // hide when user clicks into the field
  onSubmitEditing={handleManualSubmit}
  textAlign="center"
/>

      <TouchableOpacity style={styles.manualButton} onPress={handleManualSubmit}>
        <Text style={styles.manualButtonText}>Send</Text>
      </TouchableOpacity>

      {intentJSON && (
        <ScrollView style={styles.responseBox}>
          <Text style={styles.responseText}>
            {JSON.stringify(intentJSON, null, 2)}
          </Text>
        </ScrollView>
      )}

      {/* Visual success message shown briefly when UiPath posts status: "success" */}
      {successVisible && (
        <Text
          style={{
            color: "#00FF99",
            marginTop: 10,
            fontSize: 18,
            fontWeight: "bold",
            textShadowColor: "rgba(0, 255, 200, 0.8)",
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 6,
          }}
        >
          ✅ {intentJSON?.message || "Task completed successfully!"}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050A1C", justifyContent: "center", alignItems: "center", overflow: "hidden", padding: 20 },
  particleLayer: { ...StyleSheet.absoluteFillObject },
  particle: { position: "absolute", width: 10, height: 10, borderRadius: 4, backgroundColor: "rgba(255, 255, 255, 1)", shadowColor: "#FFFFFF", shadowOpacity: 1, shadowRadius: 20 },
  title: { fontSize: 32, fontWeight: "bold", marginBottom: 15, color: "#FFEB3B", textShadowColor: "rgba(0, 229, 255, 0.6)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12 },
  subtitle: { fontSize: 18, color: "#B2EBF2", marginTop: 10 },
  robotEmoji: { fontSize: 50, marginBottom: 10 },
  topLeftWave: { position: "absolute", top: -100, left: -100, width: 250, height: 250, borderRadius: 125, backgroundColor: "rgba(255, 0, 150, 0.7)", borderWidth: 5, borderColor: "rgba(0, 255, 255, 0.8)" },
  bottomRightWave: { position: "absolute", bottom: -100, right: -100, width: 250, height: 250, borderRadius: 125, backgroundColor: "rgba(0, 200, 255, 1)", borderWidth: 5, borderColor: "rgba(255, 255, 0,0.9)" },
  button: { backgroundColor: "rgba(219, 112, 246, 1)", padding: 15, borderRadius: 10, alignItems: "center", marginTop: 10 },
  buttonActive: { backgroundColor: "#8505b8ff" },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  transcriptBox: { marginTop: 20, padding: 10, borderRadius: 10, backgroundColor: "rgba(173, 255, 255, 0.1)", borderColor: "rgba(173, 255, 255, 0.4)", width: "85%", alignItems: "center" },
  transcript: { fontSize: 16, color: "#E1F5FE", textAlign: "center" },
  wordCount: { marginTop: 15, fontSize: 16, color: "#B2EBF2" },
  inputBox: { marginTop: 15, width: "85%", padding: 10, borderRadius: 10, backgroundColor: "rgba(173, 255, 255, 0.1)", borderColor: "rgba(173, 255, 255, 0.4)", borderWidth: 1, color: "#E1F5FE", fontSize: 16, textAlign: "center" },
  manualButton: { marginTop: 10, backgroundColor: "rgba(138, 43, 226, 0.85)", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  manualButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  responseBox: { marginTop: 20, padding: 15, borderRadius: 10, backgroundColor: "rgba(0, 255, 200, 0.15)", borderColor: "rgba(0, 255, 200, 0.5)", borderWidth: 1, width: "85%", maxHeight: 250 },
  responseText: { fontSize: 16, color: "#E1F5FE", textAlign: "left", fontFamily: "monospace" },
});

export default Index;