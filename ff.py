# ================================================
# 🎓 Student Dropout Risk Prediction Dashboard
# ================================================

import streamlit as st
import pandas as pd
import numpy as np
import joblib
import matplotlib.pyplot as plt
import random
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import RandomForestClassifier

st.set_page_config(page_title="Student Risk Predictor", layout="wide")

# =======================================
# 1️⃣ Load or Train Model
# =======================================
@st.cache_resource
def load_or_train_model():
    try:
        model = joblib.load("dropout_model.pkl")
        le_dict = joblib.load("label_encoders.pkl")
        st.success("✅ Model loaded successfully from saved files.")
    except:
        st.warning("⚙️ Training new model... please wait!")

        # Replace with your dataset
        df = pd.read_excel("Hackathon_Cleaned.xlsx")

        label_cols = ["gender", "department", "scholarship", "parental_education",
                      "extra_curricular", "sports_participation"]
        le_dict = {}
        for col in label_cols:
            le = LabelEncoder()
            df[col] = le.fit_transform(df[col])
            le_dict[col] = le

        X = df.drop("dropout", axis=1)
        y = df["dropout"]

        model = RandomForestClassifier(n_estimators=200, random_state=42)
        model.fit(X, y)

        joblib.dump(model, "dropout_model.pkl")
        joblib.dump(le_dict, "label_encoders.pkl")

        st.success("✅ Model trained and saved successfully!")

    return model, le_dict


model, le_dict = load_or_train_model()

# =======================================
# 2️⃣ Helper Functions
# =======================================
def transform_input_row(X, le_dict):
    """Encode categorical inputs dynamically."""
    X_encoded = X.copy().reset_index(drop=True)
    for col in X.columns:
        if col in le_dict:
            val = X.iloc[0][col]  # ✅ positional access avoids KeyError
            if val in le_dict[col].classes_:
                X_encoded[col] = le_dict[col].transform([val])
            else:
                X_encoded[col] = -1
    return X_encoded


def simulate_risk(attendance, marks):
    """Simple simulation function."""
    risk = max(0, 100 - (0.6 * attendance + 0.4 * marks))
    return risk


# =======================================
# 3️⃣ Sidebar Menu
# =======================================
menu = st.sidebar.selectbox(
    "📋 Choose Section",
    ["🏠 Home", "📊 Risk Prediction", "🧮 Simulation Panel", "💬 Chatbot Assistant"]
)

# =======================================
# 4️⃣ Home Page
# =======================================
if menu == "🏠 Home":
    st.title("🎓 Smart Student Dropout Risk Prediction Platform")
    st.write("""
    Welcome to the **Student Dropout Risk Prediction Dashboard**.

    This AI-powered system predicts dropout probability using
    academic, personal, and socio-economic factors.

    You can:
    - 📊 Predict dropout probability  
    - 🧮 Simulate academic outcomes  
    - 💬 Chat with an academic guidance assistant  
    """)

# =======================================
# 5️⃣ Risk Prediction Panel
# =======================================
elif menu == "📊 Risk Prediction":
    st.title("📊 Predict Student Dropout Risk")

    st.subheader("🧾 Enter Student Details")

    gender = st.selectbox("Gender", ["Male", "Female", "Other"])
    department = st.selectbox("Department", ["CS", "IT", "ECE", "EEE", "MECH", "CIVIL"])
    scholarship = st.selectbox("Scholarship", ["Yes", "No"])
    parental_education = st.selectbox("Parental Education", ["High School", "Graduate", "Postgraduate", "PhD"])
    extra_curricular = st.selectbox("Extra Curricular", ["Yes", "No"])
    sports_participation = st.selectbox("Sports Participation", ["Yes", "No"])

    age = st.slider("Age", 17, 30, 20)
    cgpa = st.slider("CGPA", 0.0, 10.0, 7.5)
    attendance_rate = st.slider("Attendance (%)", 0, 100, 80)
    family_income = st.number_input("Family Income (₹)", 0, 1000000, 250000)
    past_failures = st.slider("Past Failures", 0, 10, 0)
    study_hours_per_week = st.slider("Study Hours per Week", 0, 50, 10)
    assignments_submitted = st.slider("Assignments Submitted", 0, 20, 15)
    projects_completed = st.slider("Projects Completed", 0, 10, 3)
    total_activities = st.slider("Total Activities", 0, 20, 8)

    if st.button("🔮 Predict Dropout Risk"):
        input_data = {
            "gender": gender,
            "department": department,
            "scholarship": scholarship,
            "parental_education": parental_education,
            "extra_curricular": extra_curricular,
            "age": age,
            "cgpa": cgpa,
            "attendance_rate": attendance_rate,
            "family_income": family_income,
            "past_failures": past_failures,
            "study_hours_per_week": study_hours_per_week,
            "assignments_submitted": assignments_submitted,
            "projects_completed": projects_completed,
            "total_activities": total_activities,
            "sports_participation": sports_participation
        }

        X_input = pd.DataFrame([input_data]).reset_index(drop=True)
        X_enc = transform_input_row(X_input, le_dict)
        pred_prob = model.predict_proba(X_enc)[0][1] * 100

        st.subheader(f"🎯 Predicted Dropout Risk: {pred_prob:.2f}%")

        fig, ax = plt.subplots(figsize=(6, 0.4))
        color = plt.cm.RdYlGn_r(pred_prob / 100)
        ax.barh(0, pred_prob, color=color)
        ax.set_xlim(0, 100)
        ax.set_yticks([])
        st.pyplot(fig)

# =======================================
# 6️⃣ Chatbot Assistant
# =======================================
elif menu == "💬 Chatbot Assistant":
    st.title("🤖 Smart Academic Chatbot Assistant")

    if "chat_history" not in st.session_state:
        st.session_state.chat_history = []

    user_input = st.text_input("💭 Ask me anything about academics or performance:")

    motivational_quotes = [
        "Every expert was once a beginner. Keep going!",
        "Consistency beats intensity — study a little every day.",
        "Your effort today is your success tomorrow.",
        "Believe you can, and you're halfway there."
    ]

    academic_tips = [
        "Try scheduling short, focused study sessions (Pomodoro method).",
        "Join a peer study group or discussion circle.",
        "Focus on weak areas first — use your risk report to guide priorities.",
        "Ask your mentor for weekly progress feedback."
    ]

    if st.button("💬 Chat"):
        if user_input:
            if "attendance" in user_input.lower():
                bot_reply = "Maintaining attendance above 75% can significantly reduce dropout risk."
            elif "cgpa" in user_input.lower() or "grade" in user_input.lower():
                bot_reply = "Improving CGPA often requires consistent review and practice."
            elif "motivate" in user_input.lower() or "motivation" in user_input.lower():
                bot_reply = random.choice(motivational_quotes)
            elif "study" in user_input.lower():
                bot_reply = random.choice(academic_tips)
            elif "help" in user_input.lower() or "how" in user_input.lower():
                bot_reply = "I can help you interpret your results or suggest improvement strategies."
            else:
                bot_reply = "That's a great question! Try asking about study habits or CGPA improvement."

            st.session_state.chat_history.append(("You", user_input))
            st.session_state.chat_history.append(("Bot", bot_reply))

    for sender, message in st.session_state.chat_history:
        if sender == "You":
            st.markdown(f"🧑‍🎓 **{sender}:** {message}")
        else:
            st.markdown(f"🤖 **{sender}:** {message}")

# =======================================
# 7️⃣ Simulation Panel
# =======================================
elif menu == "🧮 Simulation Panel":
    st.title("🧮 Engagement Simulation Panel")
    st.write("Test how different academic factors affect dropout risk.")

    attendance = st.slider("📆 Attendance (%)", 0, 100, 75)
    marks = st.slider("🧾 Average Marks (%)", 0, 100, 80)

    risk_sim = simulate_risk(attendance, marks)
    st.markdown(f"### 🔮 Predicted Risk after Simulation: *{risk_sim:.2f}%*")

    fig, ax = plt.subplots(figsize=(6, 0.4))
    color = plt.cm.RdYlGn_r(risk_sim / 100)
    ax.barh(0, risk_sim, color=color)
    ax.set_xlim(0, 100)
    ax.set_yticks([])
    st.pyplot(fig)

    st.success("✅ Adjust sliders to simulate different academic outcomes.")
