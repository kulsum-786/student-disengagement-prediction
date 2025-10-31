// App.js
import React, { useState, useEffect } from "react";
import { View, Text, Button, TextInput, StyleSheet } from "react-native";
import Voice from "@react-native-voice/voice";
import * as Speech from "expo-speech";

export default function App() {
  const [text, setText] = useState("");       // for user typed text
  const [voiceText, setVoiceText] = useState(""); // for speech input
  const [finalText, setFinalText] = useState(""); // what to show/send

  useEffect(() => {
    // Voice listeners
    Voice.onSpeechResults = (result) => {
      setVoiceText(result.value[0]);
    };

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  // start speech recognition
  const startListening = async () => {
    try {
      await Voice.start("en-US"); // you can change to "hi-IN" for Hindi, "kn-IN" for Kannada etc
    } catch (e) {
      console.error(e);
    }
  };

  // stop speech recognition
  const stopListening = async () => {
    try {
      await Voice.stop();
    } catch (e) {
      console.error(e);
    }
  };

  // function to "respond" (here just echo back)
  const handleSend = () => {
    let message = text || voiceText;
    setFinalText(message);

    // Speak out loud
    Speech.speak("You said " + message);
    
    // Reset inputs
    setText("");
    setVoiceText("");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>🎤 Voice + Text Input Demo</Text>

      <TextInput
        style={styles.input}
        placeholder="Type here..."
        value={text}
        onChangeText={setText}
      />

      <Button title="Start Listening" onPress={startListening} />
      <Button title="Stop Listening" onPress={stopListening} />

      <Text style={styles.output}>Voice Input: {voiceText}</Text>
      <Button title="Send" onPress={handleSend} />

      <Text style={styles.final}>👉 Final Output: {finalText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  heading: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 10,
    marginBottom: 20,
  },
  output: {
    marginVertical: 20,
    fontSize: 16,
  },
  final: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: "bold",
    color: "green",
  },
});