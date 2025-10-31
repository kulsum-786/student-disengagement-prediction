import streamlit as st
import pandas as pd
import numpy as np
import joblib
import plotly.graph_objects as go
import random
import io
import os
import matplotlib.pyplot as plt
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet


from pymongo import MongoClient

# === MongoDB Connection ===
MONGO_URI = "mongodb://localhost:27017"  # or your Atlas URI
client = MongoClient(MONGO_URI)
db = client["student_engagement"]         # Database name
collection = db["risk_records"]           # Collection name


# === File Paths ===
DATA_PATH = "Hackathon_Cleaned.xlsx"
MODEL_PATH = "rf_student_engagement_model.pkl"


def save_student_record(student_id, risk_prob, student_display):
    """Save student engagement data in MongoDB."""
    record = {
        "student_id": int(student_id),
        "risk_probability": float(risk_prob),
        "cgpa": float(student_display["cgpa"]),
        "attendance_rate": float(student_display["attendance_rate"]),
        "department": str(student_display["department"]),
        "gender": str(student_display["gender"]),
        "family_income": float(student_display["family_income"]),
        "timestamp": pd.Timestamp.now().isoformat()
    }

    # Insert or update record
    collection.update_one(
        {"student_id": record["student_id"]},
        {"$set": record},
        upsert=True
    )
    st.success("✅ Student record saved to MongoDB successfully!")


# === Streamlit Config ===
st.set_page_config(page_title="Student Engagement Dashboard", layout="wide")
st.sidebar.header("Navigation")
menu = st.sidebar.selectbox("Select Panel", ["📊 Dashboard", "🧮 Simulation Panel"])

# === Load or Train Model ===
@st.cache_resource
def load_or_train_model():
    if os.path.exists(MODEL_PATH):
        model, le_dict = joblib.load(MODEL_PATH)
        df = pd.read_excel(DATA_PATH)
        st.success("✅ Pre-trained model loaded successfully!")
        return model, df.copy(), df, le_dict

    st.info("⚙️ Training model for the first time... please wait (only once).")
    df = pd.read_excel(DATA_PATH)
    df_original = df.copy()

    # Encode categorical columns
    le_dict = {}
    for col in df.select_dtypes(include=["object"]).columns:
        le = LabelEncoder()
        df[col] = le.fit_transform(df[col].astype(str))
        le_dict[col] = le

    X = df.drop("dropout", axis=1)
    y = df["dropout"]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    param_grid = {
        'n_estimators': [150, 250],
        'max_depth': [10, None],
        'min_samples_split': [2, 5],
        'min_samples_leaf': [1, 2]
    }

    base_model = RandomForestClassifier(random_state=42, n_jobs=-1)
    grid_search = GridSearchCV(base_model, param_grid, cv=2, n_jobs=-1)
    grid_search.fit(X_train, y_train)
    model = grid_search.best_estimator_

    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred) * 100
    st.success(f"Model trained with Accuracy: {acc:.2f}%")

    joblib.dump((model, le_dict), MODEL_PATH)
    st.success("✅ Model saved! Future loads will be instant.")
    return model, df_original, df, le_dict

# Load model
model, df_display, df_encoded, le_dict = load_or_train_model()


# === Helper: Encode input with saved LabelEncoders ===
def encode_input(df_row, le_dict):
    """Ensures all categorical fields are converted to numeric using trained LabelEncoders."""
    encoded_row = df_row.copy()
    for col, le in le_dict.items():
        if col in encoded_row.index:
            val = encoded_row[col]
            if isinstance(val, str):
                if val in le.classes_:
                    encoded_row[col] = le.transform([val])[0]
                else:
                    # Handle unseen category by mapping to a default value (first class)
                    encoded_row[col] = 0
    return encoded_row


# === Simulation Function ===
def simulate_risk(attendance, cgpa):
    student_sim = df_display.iloc[0].copy()
    student_sim['attendance_rate'] = attendance
    student_sim['cgpa'] = cgpa
    input_data = student_sim.drop('dropout', errors='ignore')
    input_data = encode_input(input_data, le_dict)
    input_df = pd.DataFrame([input_data])
    return model.predict_proba(input_df)[0][1] * 100


# ===============================
# 📊 DASHBOARD PANEL
# ===============================
if menu == "📊 Dashboard":
    st.title("🎓 Student Engagement & Dropout Risk Dashboard")

    # Sidebar - Student selection
    st.sidebar.header("🔍 Search Student")
    student_ids = df_display["student_id"].unique()
    selected_id = st.sidebar.selectbox("Select Student ID", student_ids)

    st.session_state.selected_id = selected_id

    student_display = df_display[df_display["student_id"] == selected_id].iloc[0]
    student_encoded = encode_input(student_display.drop("dropout", errors="ignore"), le_dict)

    input_df = pd.DataFrame([student_encoded])
    risk_prob = model.predict_proba(input_df)[0][1] * 100
    save_student_record(selected_id, risk_prob, student_display)


    


    # === Profile Info ===
    st.subheader("📘 Student Profile Overview")
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("Department", str(student_display["department"]))
        st.metric("Gender", str(student_display["gender"]))
    with col2:
        st.metric("CGPA", round(student_display["cgpa"], 2))
        st.metric("Attendance (%)", round(student_display["attendance_rate"], 1))
    with col3:
        st.metric("Age", int(student_display["age"]))
        st.metric("Family Income", f"₹{int(student_display['family_income']):,}")

    st.write(
        f"Scholarship: {student_display['scholarship']} | "
        f"Sports Participation: {student_display['sports_participation']} | "
        f"Extra Curricular: {student_display['extra_curricular']} | "
        f"Parental Education: {student_display['parental_education']}"
    )

    # === Risk Meter ===
    st.subheader("📊 Engagement Risk Meter")
    fig = go.Figure(go.Indicator(
        mode="gauge+number+delta",
        value=risk_prob,
        title={'text': "Dropout Risk (%)"},
        gauge={
            'axis': {'range': [0, 100]},
            'bar': {'color': "red" if risk_prob > 60 else "orange" if risk_prob > 30 else "green"},
            'steps': [
                {'range': [0, 30], 'color': "lightgreen"},
                {'range': [30, 60], 'color': "yellow"},
                {'range': [60, 100], 'color': "salmon"}
            ],
        }
    ))
    st.plotly_chart(fig, use_container_width=True)

    # === AI Recommendations ===
    st.subheader("🧠 AI-Generated Analysis & Recommendations")
    if risk_prob < 30:
        risk_level = "Low Risk"
        causes = ["High CGPA", "Consistent attendance", "Active participation"]
        recommendations = ["Maintain study habits", "Engage in leadership roles"]
    elif risk_prob < 60:
        risk_level = "Moderate Risk"
        causes = ["Moderate CGPA", "Inconsistent attendance", "Limited activity participation"]
        recommendations = ["Set weekly goals", "Join clubs", "Seek academic counseling"]
    else:
        risk_level = "High Risk"
        causes = ["Low CGPA", "Poor attendance", "Minimal activity participation"]
        recommendations = ["Mentorship & support", "Identify financial issues", "Personalized study plan"]

    st.markdown(f"Risk Level: **{risk_level}**")
    st.markdown(f"Dropout Probability: **{round(risk_prob, 2)}%**")
    st.markdown("Primary Causes of Risk:")
    for c in causes:
        st.markdown(f"✅ {c}")
    st.markdown("Recommendations & Action Plan:")
    for r in recommendations:
        st.markdown(f"💡 {r}")

    # === Pie Chart ===
    st.subheader("📈 Academic & Activity Performance Overview")
    labels = ["CGPA", "Attendance", "Assignments", "Projects", "Activities"]
    values = [
        student_display["cgpa"],
        student_display["attendance_rate"],
        student_display["assignments_submitted"],
        student_display["projects_completed"],
        student_display["total_activities"]
    ]
    fig2 = go.Figure(data=[go.Pie(labels=labels, values=values, hole=.4)])
    st.plotly_chart(fig2, use_container_width=True)

    # === PDF Report ===
    st.subheader("📄 Download Student Report")

    def generate_pdf(student_display, risk_prob, risk_level, causes, recommendations):
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer)
        styles = getSampleStyleSheet()
        story = []

        story.append(Paragraph("STUDENT ENGAGEMENT REPORT", styles['Title']))
        story.append(Spacer(1, 12))
        story.append(Paragraph("<b>Student Profile Overview</b>", styles['Heading2']))
        for key in ["student_id","gender","department","cgpa","attendance_rate","family_income","age","scholarship","sports_participation","extra_curricular","parental_education"]:
            story.append(Paragraph(f"{key.replace('_',' ').title()}: {student_display[key]}", styles['Normal']))
        story.append(Spacer(1, 12))
        story.append(Paragraph("<b>Risk Assessment Summary</b>", styles['Heading2']))
        story.append(Paragraph(f"Dropout Probability: {round(risk_prob, 2)}%", styles['Normal']))
        story.append(Paragraph(f"Risk Level: {risk_level}", styles['Normal']))
        story.append(Spacer(1, 12))
        story.append(Paragraph("<b>Identified Causes of Risk</b>", styles['Heading2']))
        for c in causes:
            story.append(Paragraph(f"• {c}", styles['Normal']))
        story.append(Spacer(1, 12))
        story.append(Paragraph("<b>Recommendations and Improvement Plan</b>", styles['Heading2']))
        for r in recommendations:
            story.append(Paragraph(f"• {r}", styles['Normal']))
        story.append(Spacer(1, 24))
        story.append(Paragraph("Generated by AI-Powered Student Engagement System", styles['Italic']))
        doc.build(story)
        buffer.seek(0)
        return buffer

    pdf_buffer = generate_pdf(student_display, risk_prob, risk_level, causes, recommendations)
    st.download_button(
        label="⬇ Download Engagement Report (PDF)",
        data=pdf_buffer,
        file_name=f"Student_{int(student_display['student_id'])}_Report.pdf",
        mime="application/pdf"
    )


# ===============================
# 🧮 SIMULATION PANEL
# ===============================
if menu == "🧮 Simulation Panel":
    st.title("🧮 Engagement Simulation Panel")
    st.write("Adjust parameters to simulate a student's predicted dropout risk.")

    selected_id = st.session_state.get("selected_id", df_display["student_id"].iloc[0])
    student_display = df_display[df_display["student_id"] == selected_id].iloc[0]

    attendance = st.slider("📆 Attendance (%)", 0, 100, int(student_display["attendance_rate"]))
    cgpa = st.slider("🧾 CGPA (0–10)", 0.0, 10.0, float(student_display["cgpa"]), 0.1)

    risk_sim = simulate_risk(attendance, cgpa)
    st.markdown(f"### 🔮 Predicted Dropout Risk: {risk_sim:.2f}%")

    fig, ax = plt.subplots(figsize=(6, 0.4))
    color = plt.cm.RdYlGn_r(risk_sim / 100)
    ax.barh(0, risk_sim, color=color)
    ax.set_xlim(0, 100)
    ax.set_yticks([])
    ax.set_xlabel("Dropout Risk (%)")
    st.pyplot(fig)
    st.success("Move sliders to simulate different outcomes.")


# ===============================
# 💬 Chatbot Section
# ===============================
st.markdown("<hr>", unsafe_allow_html=True)
st.markdown("## 🤖 Smart Academic Chatbot Assistant")

if "chat_history" not in st.session_state:
    st.session_state.chat_history = []

user_input = st.text_input("💭 Ask the chatbot for guidance or platform help:")

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
    user_input = user_input.strip()
    if user_input:
        if "attendance" in user_input.lower() or "absent" in user_input.lower():
            bot_reply = "Maintaining attendance above 75% reduces dropout risk. Plan your schedule effectively."
        elif "cgpa" in user_input.lower() or "grade" in user_input.lower():
            bot_reply = "Improving CGPA requires consistent review and practice. Seek mentor guidance."
        elif "motivate" in user_input.lower():
            bot_reply = random.choice(motivational_quotes)
        elif "study" in user_input.lower():
            bot_reply = random.choice(academic_tips)
        else:
            bot_reply = "Try being specific — ask about attendance, grades, or improvement strategies."

        st.session_state.chat_history.append(("You", user_input))
        st.session_state.chat_history.append(("Bot", bot_reply))

for sender, message in st.session_state.chat_history:
    if sender == "You":
        st.markdown(f"🧑‍🎓 {sender}: {message}")
    else:
        st.markdown(f"🤖 {sender}: {message}")
