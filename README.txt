Student Engagement Prediction - Outputs (generated)

Files in /mnt/data/ml_outputs:
- cleaned_dataset.csv : cleaned dataset used for training (includes proxy/disengaged label if original dataset had no explicit label)
- rf_student_engagement_model.pkl : trained RandomForest pipeline (preprocessing + model)
- streamlit_app.py : simple Streamlit scaffold for batch CSV predictions
- feature_importances.csv : feature importance values derived from the RandomForest
- feature_importances.png : plot of top feature importances

Notes:
- If your dataset already contains a true label (e.g., 'dropout' or 'disengaged'), the script will use it. Otherwise, a proxy label is created using attendance/marks/counseling heuristics.
- You should review features used (columns listed in the Streamlit app scaffold) and adjust the app to control which inputs to show.
- For explainability (SHAP), we didn't include it by default to avoid extra dependencies; I can add SHAP-based plots if you'd like.
- To run the Streamlit UI locally:
    1) pip install streamlit scikit-learn pandas joblib
    2) streamlit.py run streamlit.py
    Student Engagement Predictor Dashboard
Team Details
Team Name: Innovate Her
Team Members:
Umme Kulsum Ansari – kulsumansari843@gmail.com
Muskan Sahani – muskan.sahani450@gmail.com
Mehraj Fathima Ansari – mehrajfathimaansari85@gmail.com
Surabhi M – surabhi22.m@gmail.com

Short Project Summary:
The Student Engagement Predictor is an AI-based web application that identifies students at risk of academic disengagement.It uses academic, behavioral, and socio-economic factors to generate a risk score and offers data-driven insights to support early intervention and mentoring.
This system empowers educational institutions to prevent performance decline and improve student outcomes through predictive analytics.
Objectives of our project:
Predict and visualize engagement risk levels for each student.
Identify early signs of academic disengagement.
Provide personalized recommendations and PDF reports.
Support educators through interactive analytics and insights.
Enhance student support using AI-powered chatbot assistance.
Tools & Technologies Used :

Tools & Technologies Used :
|      Category         |   Tools / Libraries Used   |
| --------------------- | -------------------------- |
| Frontend Interface    | Streamlit                  |
| Data Handling         | Pandas, NumPy              |
| Visualization         | Matplotlib                 |
| Machine Learning      | Scikit-learn, Joblib       |
| PDF Report Generation | ReportLab                  |
| Dataset Format        | Microsoft Excel (.xlsx)    |

Instructions to Run the Project
Setup
Clone or download this project folder to your computer.
Open the folder in Visual Studio Code or any preferred IDE.
Create Virtual Environment
python -m venv venv
venv\Scripts\activate
Install Required Dependencies
pip install pymongo
pip install -r requirements.txt
Run the Streamlit Application
streamlit run streamlit.py
Access the Dashboard
The app will automatically open in your default web browser (usually at http://localhost:8501/).
Expected Deliverables:
Cleaned dataset (Hackathon_Cleaned.xlsx)
Trained ML model (rf_student_engagement_model.pkl)
Frontend dashboard--- file to run huu.py
README file (this document)
